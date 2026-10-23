import { meta, responses, object, text } from '../Utils/schema.js';

export default { ...meta('Get the configured app', 'Admin'), response: responses({ 200: object({ id: text('tf'), name: text('TeamFeedback') }) }) };
