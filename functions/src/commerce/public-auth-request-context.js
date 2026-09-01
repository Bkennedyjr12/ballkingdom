import {createHash} from 'node:crypto';
import {isIP} from 'node:net';

function normalizedIp(value) {
  if (typeof value !== 'string') return null;
  const ip = value.trim();
  if (ip.length < 1 || ip.length > 64 || isIP(ip) === 0) return null;
  return ip.toLowerCase();
}

function verifiedForwardedClient(request) {
  const rawRequest = request?.rawRequest;
  const forwarded = rawRequest?.headers?.['x-forwarded-for'];
  if (typeof forwarded !== 'string' || forwarded.length < 1 || forwarded.length > 512) return null;
  const chain = forwarded.split(',');
  if (chain.length < 2) return null;
  const client = normalizedIp(chain.at(-2));
  const forwardingRule = normalizedIp(chain.at(-1));
  if (client == null || forwardingRule == null) return null;
  // Google external HTTPS load balancing appends client and forwarding-rule IPs as this suffix.
  // Any client-controlled entries can only precede these final two elements.
  return client;
}

export function publicAuthRequestContext(request) {
  const client = verifiedForwardedClient(request);
  if (client == null) return Object.freeze({app:request?.app});
  return Object.freeze({
    app:request?.app,
    ipDigest:createHash('sha256').update(`public-auth-ip\0${client}`).digest('hex'),
  });
}
