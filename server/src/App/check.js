// GET /_ota/check
import { host } from '../Utils/host.js';
import { selectRelease } from '../Utils/db.js';

export default async function (req, res) {
  const channel = host(req, 'app');
  res.header('Cache-Control', 'no-store');
  const { device, current, key } = req.query;
  const release = selectRelease(channel, key, device, Number(current));
  if (!release) { res.status(204); return; }
  const { id, manifest, signature } = release;
  return { id, manifest, signature };
}
