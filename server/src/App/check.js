// GET /_ota/check
import { host } from '../Utils/host.js';
import { selectRelease } from '../Utils/db.js';
import { saveDevice } from '../Utils/devices.js';

export default async function (req, res) {
  const channel = host(req, 'app');
  res.header('Cache-Control', 'no-store');

  // 1. Select the device's release.
  const { device, current, key } = req.query;
  const release = selectRelease(channel, key, device, Number(current));

  // 2. Remember the device, the release it runs and the one it gets.
  saveDevice(req, channel, release?.id);
  if (!release) { res.status(204); return; }
  const { id, manifest, signature } = release;
  return { id, manifest, signature };
}
