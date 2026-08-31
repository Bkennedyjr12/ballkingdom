import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable, Writable} from 'node:stream';
import {createPrivateArtifactStreamer, VERIFIED_COMMERCE_BUCKET} from '../../src/commerce/private-artifact-stream.js';

function sink() {
  const chunks = [];
  const response = new Writable({write(chunk, encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); }});
  response.chunks = chunks;
  return response;
}

function bucketFixture({
  name = VERIFIED_COMMERCE_BUCKET, metadataSize, contentType = 'application/pdf',
  generation = '1785951381246665', md5Hash = 'XXzfi6ddgB6rru9fLIrv7Q==',
  streamedChunks = [Buffer.from('private bytes')], slow = false,
} = {}) {
  const size = metadataSize ?? String(streamedChunks.reduce((total, chunk) => total + chunk.length, 0));
  const calls = {files:[],signedUrls:0,unpinnedReads:0,pinnedStream:null};
  const bucket = {name,file:(key, options) => {
    calls.files.push({key,options});
    if (!options) { calls.unpinnedReads += 1; throw new Error('unpinned file access'); }
    assert.deepEqual(options, {generation:'1785951381246665'});
    return {
      getMetadata:async () => [{size,contentType,generation,md5Hash}],
      createReadStream:streamOptions => {
        assert.deepEqual(streamOptions, {validation:'md5'});
        let index = 0;
        const source = new Readable({read() {
          if (slow) setTimeout(() => this.push(index < streamedChunks.length ? streamedChunks[index++] : null), 20);
          else this.push(index < streamedChunks.length ? streamedChunks[index++] : null);
        }});
        calls.pinnedStream = source;
        return source;
      },
      getSignedUrl:async () => { calls.signedUrls += 1; return ['unsafe']; },
    };
  }};
  return {bucket,calls};
}

test('pins the exact validated generation and returns actual streamed bytes without a signed URL', async () => {
  const {bucket,calls} = bucketFixture({streamedChunks:[Buffer.from('private '),Buffer.from('bytes')]});
  const response = sink();
  assert.deepEqual(await createPrivateArtifactStreamer({bucket})('private-commerce/guide.pdf', {
    response,expectedContentType:'application/pdf',exactBytes:13,
    expectedGeneration:'1785951381246665',expectedMd5Hash:'XXzfi6ddgB6rru9fLIrv7Q==',
  }), {streamed:true,contentType:'application/pdf',bytesWritten:13});
  assert.deepEqual(calls.files, [
    {key:'private-commerce/guide.pdf',options:{generation:'1785951381246665'}},
  ]);
  assert.equal(Buffer.concat(response.chunks).toString(), 'private bytes');
  assert.equal(calls.unpinnedReads, 0);
  assert.equal(calls.signedUrls, 0);
  assert.equal(calls.pinnedStream.listenerCount('data'), 0);
  assert.equal(calls.pinnedStream.listenerCount('error'), 0);
  assert.equal(response.listenerCount('finish'), 0);
  assert.equal(response.listenerCount('close'), 0);
});

test('never streams an unvalidated replacement between metadata and read', async () => {
  const {bucket,calls} = bucketFixture({streamedChunks:[Buffer.from('validated-generation')]});
  await createPrivateArtifactStreamer({bucket})('private-commerce/guide.pdf', {
    response:sink(),expectedContentType:'application/pdf',exactBytes:20,
    expectedGeneration:'1785951381246665',expectedMd5Hash:'XXzfi6ddgB6rru9fLIrv7Q==',
  });
  assert.equal(calls.unpinnedReads, 0);
  assert.equal(calls.files[0].options.generation, '1785951381246665');
});

test('counts actual bytes and rejects overflow or truncation against the exact size', async () => {
  const oversized = bucketFixture({metadataSize:'5',streamedChunks:[Buffer.from('123456')]});
  await assert.rejects(createPrivateArtifactStreamer({bucket:oversized.bucket})(
    'private-commerce/guide.pdf',{response:sink(),expectedContentType:'application/pdf',exactBytes:5,
      expectedGeneration:'1785951381246665',expectedMd5Hash:'XXzfi6ddgB6rru9fLIrv7Q=='},
  ), /unavailable/i);

  const truncated = bucketFixture({metadataSize:'5',streamedChunks:[Buffer.from('123')]});
  await assert.rejects(createPrivateArtifactStreamer({bucket:truncated.bucket})(
    'private-commerce/guide.pdf',{response:sink(),expectedContentType:'application/pdf',exactBytes:5,
      expectedGeneration:'1785951381246665',expectedMd5Hash:'XXzfi6ddgB6rru9fLIrv7Q=='},
  ), /unavailable/i);
});

test('response disconnect rejects, settles, and destroys the source before finish', async () => {
  const state = bucketFixture({streamedChunks:[Buffer.from('later')],slow:true});
  const response = sink();
  const pending = createPrivateArtifactStreamer({bucket:state.bucket})('private-commerce/guide.pdf', {
    response,expectedContentType:'application/pdf',exactBytes:5,
    expectedGeneration:'1785951381246665',expectedMd5Hash:'XXzfi6ddgB6rru9fLIrv7Q==',
  });
  queueMicrotask(() => response.emit('close'));
  await assert.rejects(pending, /unavailable/i);
  assert.equal(state.calls.pinnedStream.destroyed, true);
  assert.equal(response.listenerCount('finish'), 0);
  assert.equal(response.listenerCount('close'), 0);
  assert.equal(state.calls.pinnedStream.listenerCount('data'), 0);
  assert.equal(state.calls.pinnedStream.listenerCount('error'), 0);
});

test('fails closed for invalid generation, wrong bucket, absent response, metadata mismatch, or oversized metadata', async () => {
  const valid = {response:sink(),expectedContentType:'application/pdf',exactBytes:13,
    expectedGeneration:'1785951381246665',expectedMd5Hash:'XXzfi6ddgB6rru9fLIrv7Q=='};
  const cases = [
    {fixture:{name:'wrong-bucket'},context:valid},
    {fixture:{},context:{...valid,response:undefined}},
    {fixture:{},context:{...valid,expectedGeneration:'not-a-generation'}},
    {fixture:{generation:'1785951381246666'},context:valid},
    {fixture:{contentType:'text/html'},context:valid},
    {fixture:{metadataSize:'12'},context:valid},
    {fixture:{md5Hash:'AAAAAAAAAAAAAAAAAAAAAA=='},context:valid},
  ];
  for (const entry of cases) {
    const {bucket} = bucketFixture(entry.fixture);
    await assert.rejects(createPrivateArtifactStreamer({bucket})(
      'private-commerce/guide.pdf',entry.context,
    ), /unavailable|invalid/i);
  }
});

test('rejects non-private and traversal object keys', async () => {
  const {bucket} = bucketFixture();
  const streamArtifact = createPrivateArtifactStreamer({bucket});
  for (const key of ['public/guide.pdf','private-commerce/../secret','/private-commerce/guide.pdf']) {
    await assert.rejects(streamArtifact(key, {
      response:sink(),expectedContentType:'application/pdf',exactBytes:13,
      expectedGeneration:'1785951381246665',expectedMd5Hash:'XXzfi6ddgB6rru9fLIrv7Q==',
    }), /invalid/i);
  }
});

test('rejects a replaced, smaller, or digest-mismatched object before streaming any byte', async () => {
  const cases = [
    {generation:'1785951381246666'},
    {metadataSize:'12'},
    {md5Hash:'AAAAAAAAAAAAAAAAAAAAAA=='},
  ];
  for (const replacement of cases) {
    const state = bucketFixture(replacement);
    const response = sink();
    await assert.rejects(createPrivateArtifactStreamer({bucket:state.bucket})('private-commerce/guide.pdf', {
      response,expectedContentType:'application/pdf',exactBytes:13,
      expectedGeneration:'1785951381246665',expectedMd5Hash:'XXzfi6ddgB6rru9fLIrv7Q==',
    }), /unavailable/i);
    assert.equal(state.calls.pinnedStream, null);
    assert.equal(response.chunks.length, 0);
  }
});
