// PUT /api/files/:hash
import { host } from '../Utils/host.js';
import { files, sha256 } from '../Utils/db.js';
import { writeFile, link, unlink } from 'node:fs/promises';

export default async function (req, res) {
  host(req, 'admin');

  // 1. Verify the raw upload.
  if (req.body !== undefined && typeof req.body !== 'string') throw createError(400, 'Upload files as application/octet-stream');
  const bytes = typeof req.body === 'string' ? Buffer.from(req.body) : await req.arrayBuffer();
  if (sha256(bytes) !== req.params.hash) throw createError(400, 'File hash differs');

  // 2. Store each hash once, including concurrent uploads.
  const temp = `${files}/.${crypto.randomUUID()}`;
  await writeFile(temp, Buffer.from(bytes), { flag: 'wx' });
  try { await link(temp, `${files}/${req.params.hash}`); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  finally { await unlink(temp); }
  res.status(204);
}
