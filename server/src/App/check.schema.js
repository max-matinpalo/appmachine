import { meta, responses, object, text } from '../Utils/schema.js';

export default {
  ...meta('Select the device release', 'App'),
  querystring: object({ device: text('uuid'), current: { type: 'string', pattern: '^([0-9]+)?$', example: '' }, key: text('web') }, ['device', 'key']),
  response: responses({ 200: { $ref: 'Update' }, 204: {} }),
};
