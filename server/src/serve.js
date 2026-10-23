// GET /*
import { resolve, extname } from 'node:path';
import { host } from './Utils/host.js';
import { files, firstRelease } from './Utils/db.js';
import { config } from './Utils/config.js';
import { serveDocs } from './Utils/docs.js';

const gui = resolve('gui/dist');

export default async function (req, res) {
  const role = host(req);

  // 1. Keep API paths out of SPA fallback.
  let path;
  try { path = decodeURIComponent(new URL(req.url).pathname); }
  catch { throw createError(400, 'Invalid path'); }
  if (path.includes('\0')) throw createError(400, 'Invalid path');
  if (/^\/(api|_ota)(\/|$)/.test(path)) throw createError(404, 'Unknown route');
  if (/^\/docs(\/|$)/.test(path) && role === 'admin') {
    if (config.production) throw createError(404, 'Unknown route');
    return serveDocs(path);
  }

  // 2. Serve the GUI or the channel's fully rolled out web release.
  let file;
  if (role === 'admin') {
    const target = resolve(gui, `.${path}`);
    if (!target.startsWith(`${gui}/`) && target !== gui) throw createError(404, 'Unknown path');
    file = Bun.file(target);
    if (!extname(path) || !await file.exists()) file = Bun.file(`${gui}/index.html`);
  } else {
    const release = firstRelease(role);
    if (!release) throw createError(404, 'No web release');
    const manifest = JSON.parse(release.manifest).files;
    let name = path.slice(1);
    if (!name || name.endsWith('/')) name += 'index.html';
    if (!Object.hasOwn(manifest, name) && !path.split('/').at(-1).includes('.')) name = 'index.html';
    if (!Object.hasOwn(manifest, name)) throw createError(404, 'Unknown file');
    file = Bun.file(`${files}/${manifest[name]}`, { type: Bun.file(`x${extname(name)}`).type });
  }

  // 3. Keep first visits available briefly through an origin outage.
  if (!await file.exists()) throw createError(404, 'Unknown file');
  return new Response(file, { headers: { 'Cache-Control': 'public, max-age=60, stale-if-error=86400' } });
}
