export const VERIFIED_COMMERCE_BUCKET = 'the-ballers-kingdom.firebasestorage.app';

const PRIVATE_KEY = /^private-commerce\/[A-Za-z0-9][A-Za-z0-9._/-]{0,480}$/;
const MIME = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}$/;
const GENERATION = /^[1-9][0-9]{0,30}$/;
const MD5_BASE64 = /^[A-Za-z0-9+/]{22}==$/;

function streamError(message) {
  const error = new Error(message);
  error.code = 'FULFILLMENT_STREAM_UNAVAILABLE';
  return error;
}

function validPrivateKey(key) {
  return typeof key === 'string' && PRIVATE_KEY.test(key)
    && !key.split('/').some(segment => !segment || segment === '.' || segment === '..');
}

export function createPrivateArtifactStreamer({bucket} = {}) {
  if (!bucket?.file) throw new TypeError('Admin Storage bucket is required');
  return async function streamArtifact(key, context = {}) {
    if (bucket.name !== VERIFIED_COMMERCE_BUCKET) throw streamError('Private bucket is unavailable');
    if (!validPrivateKey(key)) throw streamError('Private artifact key is invalid');
    const {response,expectedContentType,exactBytes,expectedGeneration,expectedMd5Hash} = context;
    if (!response?.once || typeof expectedContentType !== 'string' || !MIME.test(expectedContentType)
      || !Number.isSafeInteger(exactBytes) || exactBytes < 1
      || typeof expectedGeneration !== 'string' || !GENERATION.test(expectedGeneration)
      || typeof expectedMd5Hash !== 'string' || !MD5_BASE64.test(expectedMd5Hash)) {
      throw streamError('Artifact stream context is invalid');
    }
    const metadataFile = bucket.file(key, {generation:expectedGeneration});
    const [metadata] = await metadataFile.getMetadata();
    const metadataBytes = Number(metadata?.size);
    if (metadata?.contentType !== expectedContentType || !Number.isSafeInteger(metadataBytes)
      || metadataBytes !== exactBytes
      || metadata?.generation !== expectedGeneration
      || metadata?.md5Hash !== expectedMd5Hash) {
      throw streamError('Private artifact metadata is unavailable');
    }
    if (typeof response.setHeader === 'function') response.setHeader('Content-Type', expectedContentType);
    const pinnedFile = metadataFile;
    let bytesWritten = 0;
    await new Promise((resolve,reject) => {
      const source = pinnedFile.createReadStream({validation:'md5'});
      let settled = false;
      const cleanup = () => {
        source.removeListener('data', onData);
        source.removeListener('error', onSourceError);
        response.removeListener('error', onResponseError);
        response.removeListener('finish', onFinish);
        response.removeListener('close', onClose);
        response.removeListener('aborted', onAborted);
      };
      const fail = () => {
        if (settled) return;
        settled = true;
        cleanup();
        if (typeof source.unpipe === 'function') source.unpipe(response);
        if (typeof source.destroy === 'function' && !source.destroyed) source.destroy();
        if (typeof response.destroy === 'function' && !response.destroyed) response.destroy();
        reject(streamError('Private artifact stream is unavailable'));
      };
      const onData = chunk => {
        const length = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
        bytesWritten += length;
        if (!Number.isSafeInteger(bytesWritten) || bytesWritten > exactBytes) fail();
      };
      const onSourceError = () => fail();
      const onResponseError = () => fail();
      const onClose = () => fail();
      const onAborted = () => fail();
      const onFinish = () => {
        if (settled) return;
        if (bytesWritten !== exactBytes) { fail(); return; }
        settled = true;
        cleanup();
        resolve();
      };
      source.on('data', onData);
      source.once('error', onSourceError);
      response.once('error', onResponseError);
      response.once('finish', onFinish);
      response.once('close', onClose);
      response.once('aborted', onAborted);
      source.pipe(response);
    });
    return Object.freeze({streamed:true,contentType:expectedContentType,bytesWritten});
  };
}
