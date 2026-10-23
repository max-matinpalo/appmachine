// GET /_ota/files/:file
import { host } from '../Utils/host.js';
import { files } from '../Utils/db.js';

export default async function (req, res) {
  host(req, 'app');
  const match = /^([a-f0-9]{64})(?:\.([a-zA-Z0-9]+))?$/.exec(req.params.file);
  if (!match) throw createError(404, 'Unknown file');
  const file = Bun.file(`${files}/${match[1]}`);
  if (!await file.exists()) throw createError(404, 'Unknown file');
  return new Response(file, { headers: {
    'Content-Type': match[2] ? Bun.file(`x.${match[2]}`).type : 'application/octet-stream',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Access-Control-Allow-Origin': '*',
  } });
}
