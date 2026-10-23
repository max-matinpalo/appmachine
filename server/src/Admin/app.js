// GET /api/app
import { host } from '../Utils/host.js';
import { config } from '../Utils/config.js';

export default async function (req, res) {
  host(req, 'admin');
  return { id: config.app, name: config.name };
}
