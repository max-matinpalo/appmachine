import { meta, responses } from './Utils/schema.js';

export default { ...meta('Serve the PWA or Admin GUI', 'Web'), response: responses({ 200: { type: 'string', format: 'binary' } }) };
