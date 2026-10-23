import maxserver from 'maxserver';

const server = await maxserver({
  port: Number(process.env.PORT || 3700),
  secret: crypto.randomUUID(),
  docs: process.env.NODE_ENV !== 'production',
  cors: '',
  public: false,
  static: false,
  maxRequestBodySize: 100 * 1024 * 1024,
});

await server.start();
export default server;
