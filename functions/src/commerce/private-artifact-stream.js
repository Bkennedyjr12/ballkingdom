export const VERIFIED_COMMERCE_BUCKET = 'the-ballers-kingdom.firebasestorage.app';

const PRIVATE_KEY = /^private-commerce\/[A-Za-z0-9][A-Za-z0-9._/-]{0,480}$/;
const MIME = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}$/;

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
    const {response,expectedContentType,maxBytes} = context;
    if (!response?.once || typeof expectedContentType !== 'string' || !MIME.test(expectedContentType)
      || !Number.isSafeInteger(maxBytes) || maxBytes < 1) {
      throw streamError('Artifact stream context is invalid');
    }
    const file = bucket.file(key);
    const [metadata] = await file.getMetadata();
    const bytesWritten = Number(metadata?.size);
    if (metadata?.contentType !== expectedContentType || !Number.isSafeInteger(bytesWritten)
      || bytesWritten < 0 || bytesWritten > maxBytes) {
      throw streamError('Private artifact metadata is unavailable');
    }
    if (typeof response.setHeader === 'function') response.setHeader('Content-Type', expectedContentType);
    await new Promise((resolve,reject) => {
      const source = file.createReadStream();
      source.once('error', reject);
      response.once('error', reject);
      response.once('finish', resolve);
      source.pipe(response);
    });
    return Object.freeze({streamed:true,contentType:expectedContentType,bytesWritten});
  };
}
