import { meta, responses } from '../Utils/schema.js';

export default {
  ...meta('Replace device release status: { device, reports: [{ release, state }] }, as JSON or JSON text', 'App'),
  body: { type: ['object', 'string'], maxLength: 1000000 }, response: responses({ 204: {} }),
};
