import { meta, responses, object, text } from '../Utils/schema.js';

export default { ...meta('Download an immutable file', 'App'), params: object({ file: text('hash.js') }), response: responses({ 200: { type: 'string', format: 'binary' } }) };
