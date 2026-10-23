import { db } from './db.js';
import { describe } from './agent.js';

const save = db.query(`INSERT INTO devices (id, channel, running, staged, first, last, agent, country, screen, standalone, installed, language, cores, memory, model, platform)
  VALUES ($id, $channel, $running, $staged, $time, $time, $agent, $country, $screen, $standalone, $standalone, $language, $cores, $memory, $model, $platform)
  ON CONFLICT (id) DO UPDATE SET channel = excluded.channel, running = excluded.running, staged = excluded.staged, last = excluded.last,
    agent = excluded.agent, country = excluded.country, screen = excluded.screen, standalone = excluded.standalone,
    installed = MAX(installed, excluded.installed), language = excluded.language, cores = excluded.cores, memory = excluded.memory,
    model = excluded.model, platform = excluded.platform`);

// Records the device's specs, its running release and the release the server just offered it.
export function saveDevice(req, channel, offered) {
  const { device, running, screen = '', standalone, language = '', cores, memory, model = '', platform = '' } = req.query;
  const live = Number(running) || null;
  save.run({
    id: device, channel, running: live, staged: offered && offered !== live ? offered : null, time: Date.now(),
    agent: req.headers.get('user-agent') || '', country: req.headers.get('cf-ipcountry') || '', screen,
    standalone: standalone === '1' ? 1 : 0, language, cores: Number(cores) || null, memory: Number(memory) || null, model, platform,
  });
}

// Lists devices, newest first; a release the device marked failed is not pending.
export function listDevices() {
  const rows = db.query(`SELECT d.*, EXISTS (SELECT 1 FROM reports r WHERE r.device = d.id AND r.release = d.staged AND r.state = 'failed') AS refused
    FROM devices d ORDER BY d.last DESC`).all();
  return rows.map(({ model, platform, standalone, installed, refused, staged, ...device }) => ({
    ...device, ...describe(device.agent, model, platform), staged: refused ? null : staged, standalone: !!standalone, installed: !!installed,
  }));
}
