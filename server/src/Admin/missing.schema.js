import { meta, responses, object, array, hash } from '../Utils/schema.js';

export default { ...meta('Find files to upload', 'Admin'), body: object({ hashes: array(hash) }), response: responses({ 200: object({ missing: array(hash) }) }) };
