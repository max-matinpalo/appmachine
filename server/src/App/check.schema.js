import { meta, responses, object, text } from '../Utils/schema.js';

const release = { type: 'string', pattern: '^([0-9]+)?$', example: '' };
const info = example => ({ type: 'string', maxLength: 100, example });

export default {
  ...meta('Select the device release and record its specs', 'App'),
  querystring: object({
    device: { ...text('uuid'), maxLength: 100 }, current: release, key: text('web'), running: release,
    screen: info('390x844@3'), standalone: { type: 'string', enum: ['0', '1'], example: '1' }, language: info('fi-FI'),
    cores: { type: 'string', pattern: '^([0-9]{1,4})?$', example: '8' }, memory: { type: 'string', pattern: '^([0-9]{1,4}(\\.[0-9]+)?)?$', example: '8' },
    model: info('Pixel 8'), platform: info('15.0.0'),
  }, ['device', 'key']),
  response: responses({ 200: { $ref: 'Update' }, 204: {} }),
};
