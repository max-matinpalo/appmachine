import { meta, responses, object, array, text, id, reportState } from '../Utils/schema.js';

export default {
  ...meta('Replace device release status', 'App'),
  body: object({ device: text('uuid'), reports: array(object({ release: id, state: reportState })) }), response: responses({ 204: {} }),
};
