import { object, id, text } from '../Utils/schema.js';

export default { $id: 'Update', ...object({ id, manifest: text('{"files":{}}'), signature: text('base64') }) };
