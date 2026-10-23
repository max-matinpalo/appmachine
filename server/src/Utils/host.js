import { config } from './config.js';

export function host(req, expected) {

  // 1. Identify the host's role and channel.
  const name = (req.headers.get('host') || new URL(req.url).host).split(':')[0].toLowerCase();
  const role = name === config.domain ? 'admin'
    : name === `${config.app}.${config.domain}` ? 'production'
    : name === `${config.app}-beta.${config.domain}` ? 'beta' : null;

  // 2. Reject other roles and require Access on the production admin host.
  if (!role || (expected === 'admin' ? role !== 'admin' : expected === 'app' && role === 'admin')) {
    throw createError(404, 'Unknown host or route');
  }
  if (role === 'admin' && config.production && !req.headers.get('Cf-Access-Jwt-Assertion')) {
    throw createError(403, 'Cloudflare Access required');
  }
  return role;
}
