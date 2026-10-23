import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

let routes;

export async function serveDocs(path) {

  // 1. Generate MaxServer's docs automatically, behind the host check.
  if (!routes) {
    const framework = new URL('../', import.meta.resolve('maxserver'));
    const root = resolve(fileURLToPath(framework), '../..');
    const { collect } = await import(new URL('bin/generate.js', framework).href);
    const { buildOpenApi, docsRoutes } = await import(new URL('src/docs.js', framework).href);
    const found = collect(root);
    const load = async file => (await import(pathToFileURL(resolve(root, file)).href)).default;
    const schemas = await Promise.all(found.routes.map(async r => ({ ...r, schema: r.schema ? await load(r.schema) : {} })));
    const models = await Promise.all(found.models.map(m => load(m.file)));
    routes = await docsRoutes(buildOpenApi(schemas, models), true);
  }

  // 2. Keep unknown docs paths out of the GUI fallback.
  if (!Object.hasOwn(routes, path)) throw createError(404, 'Unknown docs file');
  return routes[path]();
}
