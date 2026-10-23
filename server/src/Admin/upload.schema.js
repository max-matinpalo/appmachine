import { meta, responses, object, hash } from '../Utils/schema.js';

export default { ...meta('Upload a content-addressed file as application/octet-stream', 'Admin'), params: object({ hash }), response: responses({ 204: {} }) };
