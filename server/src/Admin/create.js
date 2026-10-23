// POST /api/releases
import { host } from '../Utils/host.js';
import { db } from '../Utils/db.js';
import { verifyManifest } from '../Utils/manifest.js';

export default async function (req, res) {
  host(req, 'admin');

  // 1. Verify the signed manifest and its files.
  const { channel, key, manifest, signature, commit, rollout = 100 } = req.body;
  await verifyManifest(manifest, signature);

  // 2. Publish a live release.
  const result = db.query('INSERT INTO releases (channel, key, manifest, signature, "commit", created, rollout, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(channel, key, manifest, signature, commit, Date.now(), rollout, 'live');
  res.status(201);
  return { id: Number(result.lastInsertRowid) };
}
