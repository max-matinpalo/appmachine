import { files } from './db.js';
import { publicKey } from './config.js';

export async function verifyManifest(manifest, signature) {

  // 1. Validate the signed bytes and paths.
  let value;
  try { value = JSON.parse(manifest); } catch { throw createError(400, 'Invalid manifest JSON'); }
  if (!value || Object.keys(value).length !== 1 || !value.files || Array.isArray(value.files) || typeof value.files !== 'object') {
    throw createError(400, 'Manifest must contain files');
  }
  const paths = Object.keys(value.files);
  if (paths.join('\0') !== [...paths].sort().join('\0') || paths.some(path =>
    path.includes('\\') || path.includes('\0') || path.split('/').some(p => !p || p === '.' || p === '..') ||
    !/^[a-f0-9]{64}$/.test(value.files[path]))) throw createError(400, 'Invalid manifest path, order or hash');

  // 2. Verify the publisher before checking stored files.
  const bytes = Buffer.from(signature, 'base64');
  if (bytes.length !== 64 || bytes.toString('base64') !== signature || !await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' }, publicKey, bytes, new TextEncoder().encode(manifest),
  )) throw createError(400, 'Invalid signature');
  for (const hash of new Set(Object.values(value.files))) {
    if (!await Bun.file(`${files}/${hash}`).exists()) throw createError(400, `Missing file ${hash}`);
  }
}
