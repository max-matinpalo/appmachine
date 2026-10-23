// GET /api/devices
import { host } from '../Utils/host.js';
import { listDevices } from '../Utils/devices.js';

export default async function (req, res) {
  host(req, 'admin');
  return listDevices();
}
