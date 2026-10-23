// GET /api/releases
import { host } from '../Utils/host.js';
import { listReleases } from '../Utils/db.js';

export default async function (req, res) {
  host(req, 'admin');
  return listReleases();
}
