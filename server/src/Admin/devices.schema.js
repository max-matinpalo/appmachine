import { meta, responses, object, array, text, channel } from '../Utils/schema.js';

const release = { type: ['integer', 'null'], example: 2 };
const time = { type: 'integer', example: 1792700000000 };
const device = object({
  id: text('5f0c6a2e-4f1d-4a51-9a54-3f8f2f5f6b7a'), channel, running: release, staged: release, first: time, last: time,
  device: text('Pixel 8'), system: { type: 'string', example: 'Android 15' }, browser: { type: 'string', example: 'Chrome 141' },
  agent: { type: 'string', example: 'Mozilla/5.0 (Linux; Android 10; K) Chrome/141.0.0.0 Mobile Safari/537.36' },
  country: { type: 'string', example: 'FI' }, screen: { type: 'string', example: '412x915@2.63' }, standalone: { type: 'boolean', example: true }, installed: { type: 'boolean', example: true },
  language: { type: 'string', example: 'fi-FI' }, cores: { type: ['integer', 'null'], example: 8 }, memory: { type: ['number', 'null'], example: 8 },
});

export default { ...meta('List devices with their specs and running release', 'Admin'), response: responses({ 200: array(device) }) };
