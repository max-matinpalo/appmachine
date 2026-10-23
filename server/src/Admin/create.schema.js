import { meta, responses, object, id, channel, text, rollout } from '../Utils/schema.js';

export default {
  ...meta('Publish a signed release', 'Admin'),
  body: object({ channel, key: text('web'), manifest: text('{"files":{}}'), signature: text('base64'), commit: text('abc123'), rollout }, ['channel', 'key', 'manifest', 'signature', 'commit']),
  response: responses({ 201: object({ id }) }),
};
