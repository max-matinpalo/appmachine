// POST /_ota/report
import { host } from '../Utils/host.js';
import { db } from '../Utils/db.js';

const save = db.query(`INSERT INTO reports (release, device, state, time)
  SELECT id, ?, ?, ? FROM releases WHERE id = ?
  ON CONFLICT (release, device) DO UPDATE SET state = excluded.state, time = excluded.time`);
const report = db.transaction(({ device, reports }) => {
  for (const { release, state } of reports) save.run(device, state, Date.now(), release);
});

export default async function (req, res) {
  host(req, 'app');
  report(req.body);
  res.status(204);
}
