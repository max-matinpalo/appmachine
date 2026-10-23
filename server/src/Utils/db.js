import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { config } from './config.js';

export const files = `${config.data}/files`;
mkdirSync(files, { recursive: true });
export const db = new Database(`${config.data}/ota.db`, { create: true, strict: true });
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS releases (
    id INTEGER PRIMARY KEY, channel TEXT NOT NULL, key TEXT NOT NULL,
    manifest TEXT NOT NULL, signature TEXT NOT NULL, "commit" TEXT NOT NULL,
    created INTEGER NOT NULL, rollout INTEGER NOT NULL, state TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS reports (
    release INTEGER REFERENCES releases(id), device TEXT NOT NULL,
    state TEXT NOT NULL, time INTEGER NOT NULL, PRIMARY KEY (release, device)
  );
`);

const summary = `SELECT r.id, r.channel, r.key, r."commit", r.created, r.rollout, r.state,
  COUNT(CASE WHEN p.state = 'downloaded' THEN 1 END) AS downloaded,
  COUNT(CASE WHEN p.state = 'active' THEN 1 END) AS active,
  COUNT(CASE WHEN p.state = 'failed' THEN 1 END) AS failed
  FROM releases r LEFT JOIN reports p ON p.release = r.id`;
export const listReleases = () => db.query(`${summary} GROUP BY r.id ORDER BY r.id DESC`).all();
export const releaseById = id => db.query(`${summary} WHERE r.id = ? GROUP BY r.id`).get(id);
export const sha256 = bytes => new Bun.CryptoHasher('sha256').update(bytes).digest('hex');

export function selectRelease(channel, key, device, current) {
  const releases = db.query("SELECT * FROM releases WHERE channel = ? AND key = ? AND state != 'rolledback' ORDER BY id DESC").all(channel, key);
  return releases.find(r => r.id === current || (r.state === 'live' && parseInt(sha256(device + r.id).slice(0, 8), 16) % 100 < r.rollout));
}

export function firstRelease(channel) {
  return db.query("SELECT * FROM releases WHERE channel = ? AND key = 'web' AND state = 'live' AND rollout = 100 ORDER BY id DESC").get(channel);
}
