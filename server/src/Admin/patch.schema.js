import { meta, responses, object, id, rollout, state } from '../Utils/schema.js';

export default {
  ...meta('Set rollout or release state', 'Admin'), params: object({ id }),
  body: { ...object({ rollout, state }, []), minProperties: 1 }, response: responses({ 200: { $ref: 'Release' } }),
};
