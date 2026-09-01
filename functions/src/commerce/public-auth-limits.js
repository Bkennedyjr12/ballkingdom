export function createPublicAuthLimiter({repository,clock = () => new Date()} = {}) {
  if (!repository?.consumePublicAuthLimits) {
    throw new Error('Public auth limiter repository is required');
  }
  return Object.freeze({
    consume({emailDigest,ipDigest,appId}) {
      return repository.consumePublicAuthLimits({
        emailDigest,ipDigest,appId,now:clock(),windowMs:10 * 60 * 1000,
        emailLimit:5,ipLimit:20,appLimit:100,globalLimit:250,
      });
    },
  });
}
