import { meta, responses, array } from '../Utils/schema.js';

export default { ...meta('List releases and device counts', 'Admin'), response: responses({ 200: array({ $ref: 'Release' }) }) };
