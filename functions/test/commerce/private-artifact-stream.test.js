import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createPrivateArtifactStreamer, VERIFIED_COMMERCE_BUCKET} from '../../src/commerce/private-artifact-stream.js';

function bucketFixture({name = VERIFIED_COMMERCE_BUCKET,size = '100',contentType = 'application/pdf'} = {}) {
  const calls = {files:[],signedUrls:0};
  const bucket = {name,file:key => {
    calls.files.push(key);
    return {
      getMetadata:async () => [{size,contentType}],
      createReadStream:() => {
        const stream = new EventEmitter();
        stream.pipe = response => { queueMicrotask(() => response.emit('finish')); return response; };
        return stream;
      },
      getSignedUrl:async () => { calls.signedUrls += 1; return ['unsafe']; },
    };
  }};
  return {bucket,calls};
}

test('streams from the exact verified private bucket without creating a signed URL', async () => {
  const {bucket,calls} = bucketFixture();
  const response = new EventEmitter();
  const streamArtifact = createPrivateArtifactStreamer({bucket});
  assert.deepEqual(await streamArtifact('private-commerce/guide.pdf', {
    response,expectedContentType:'application/pdf',maxBytes:1000,
  }), {streamed:true,contentType:'application/pdf',bytesWritten:100});
  assert.deepEqual(calls.files, ['private-commerce/guide.pdf']);
  assert.equal(calls.signedUrls, 0);
});

test('fails closed for the wrong bucket, absent response, metadata mismatch, or oversized object', async () => {
  const cases = [
    {fixture:{name:'wrong-bucket'},context:{response:new EventEmitter(),expectedContentType:'application/pdf',maxBytes:1000}},
    {fixture:{},context:{expectedContentType:'application/pdf',maxBytes:1000}},
    {fixture:{contentType:'text/html'},context:{response:new EventEmitter(),expectedContentType:'application/pdf',maxBytes:1000}},
    {fixture:{size:'1001'},context:{response:new EventEmitter(),expectedContentType:'application/pdf',maxBytes:1000}},
  ];
  for (const entry of cases) {
    const {bucket} = bucketFixture(entry.fixture);
    const streamArtifact = createPrivateArtifactStreamer({bucket});
    await assert.rejects(streamArtifact('private-commerce/guide.pdf', entry.context), /unavailable|invalid/i);
  }
});

test('rejects non-private and traversal object keys', async () => {
  const {bucket} = bucketFixture();
  const streamArtifact = createPrivateArtifactStreamer({bucket});
  for (const key of ['public/guide.pdf','private-commerce/../secret','/private-commerce/guide.pdf']) {
    await assert.rejects(streamArtifact(key, {
      response:new EventEmitter(),expectedContentType:'application/pdf',maxBytes:1000,
    }), /invalid/i);
  }
});
