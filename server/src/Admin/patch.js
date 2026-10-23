// PATCH /api/releases/:id
import { host } from '../Utils/host.js';
import { db, releaseById } from '../Utils/db.js';

export default async function (req, res) {
  host(req, 'admin');
  const release = releaseById(req.params.id);
  if (!release) throw createError(404, 'Unknown release');
  db.query('UPDATE releases SET rollout = ?, state = ? WHERE id = ?')
    .run(req.body.rollout ?? release.rollout, req.body.state ?? release.state, release.id);
  return releaseById(release.id);
}
