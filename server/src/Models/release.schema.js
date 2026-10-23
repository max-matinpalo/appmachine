import { object, id, channel, text, rollout, state } from '../Utils/schema.js';

export default {
  $id: 'Release',
  ...object({
    id, channel, key: text('web'), commit: text('abc123'), created: { type: 'integer', example: 1792700000000 }, rollout, state,
    downloaded: { type: 'integer', example: 0 }, active: { type: 'integer', example: 0 }, failed: { type: 'integer', example: 0 },
  }),
};
