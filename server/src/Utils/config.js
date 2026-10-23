import { resolve } from 'node:path';

export const config = {
  domain: (process.env.DOMAIN || 'localhost').toLowerCase(),
  data: resolve(process.env.DATA || 'DATA'),
  app: process.env.APP_ID,
  name: process.env.APP_NAME || process.env.APP_ID,
  production: process.env.NODE_ENV === 'production',
};

if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(config.app || '')) throw new Error('APP_ID must be a subdomain');
export const publicKey = await crypto.subtle.importKey(
  'jwk', JSON.parse(process.env.APP_PUBLIC_KEY), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
);
