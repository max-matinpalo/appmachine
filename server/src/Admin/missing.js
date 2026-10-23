// POST /api/files/missing
import { host } from '../Utils/host.js';
import { files } from '../Utils/db.js';

export default async function (req, res) {
  host(req, 'admin');
  const missing = [];
  for (const hash of req.body.hashes) if (!await Bun.file(`${files}/${hash}`).exists()) missing.push(hash);
  return { missing };
}
