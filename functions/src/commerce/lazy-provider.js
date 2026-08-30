export function createLazyProvider(factory, methodNames) {
  if (typeof factory !== 'function' || !Array.isArray(methodNames) || methodNames.length < 1
    || methodNames.some(name => typeof name !== 'string' || name.length < 1)) {
    throw new TypeError('Lazy provider dependencies are required');
  }
  let provider;
  const getProvider = () => {
    if (provider) return provider;
    const candidate = factory();
    if (!candidate || typeof candidate !== 'object') {
      throw new TypeError('Lazy provider factory returned an invalid provider');
    }
    provider = candidate;
    return provider;
  };
  return Object.freeze(Object.fromEntries([...new Set(methodNames)].map(methodName => [
    methodName,
    async (...args) => {
      const client = getProvider();
      if (typeof client[methodName] !== 'function') {
        throw new TypeError(`Lazy provider method is unavailable: ${methodName}`);
      }
      return client[methodName](...args);
    },
  ])));
}
