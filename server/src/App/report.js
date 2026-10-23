// POST /_ota/report
import { host } from '../Utils/host.js';
import { db } from '../Utils/db.js';

const save = db.query(`INSERT INTO reports (release, device, state, time)
  SELECT id, ?, ?, ? FROM releases WHERE id = ?
  ON CONFLICT (release, device) DO UPDATE SET state = excluded.state, time = excluded.time`);
const report = db.transaction(({ device, reports }) => {
  for (const { release, state } of reports) save.run(device, state, Date.now(), release);
});
const states = ['downloaded', 'active', 'failed'];

export default async function (req, res) {
  host(req, 'app');
  res.header('Access-Control-Allow-Origin', '*');

  // 1. Apps send JSON as text/plain: a simple CORS request, no preflight.
  let body = req.body;
  if (typeof body === 'string') try { body = JSON.parse(body); } catch { throw createError(400, 'Invalid JSON'); }
  const valid = typeof body?.device === 'string' && body.device.length > 0 && body.device.length <= 100 && Array.isArray(body.reports)
    && body.reports.every(r => Number.isInteger(r?.release) && r.release > 0 && states.includes(r?.state));
  if (!valid) throw createError(400, 'Invalid report');

  // 2. Save.
  report(body);
  res.status(204);
}
