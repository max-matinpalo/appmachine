import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Database } from 'bun:sqlite';

const root = resolve(import.meta.dir, '..');
const hash = value => new Bun.CryptoHasher('sha256').update(value).digest('hex');
const immutable = 'public, max-age=31536000, immutable';
const shortCache = 'public, max-age=60, stale-if-error=86400';
let privateKey, publicKey, fixture, prod, dev;
const children = [];

async function start(mode) {
  const cwd = `${fixture}/${mode}`;
  await mkdir(`${cwd}/gui/dist/assets`, { recursive: true });
  await Bun.write(`${cwd}/gui/dist/index.html`, '<title>Admin GUI</title>');
  await Bun.write(`${cwd}/gui/dist/assets/gui.js`, 'console.log("admin")');
  const child = Bun.spawn([process.execPath, `${root}/dist/bundle.js`], {
    cwd, env: { ...process.env, PORT: '0', DOMAIN: 'localhost', APP_ID: 'tf', APP_NAME: 'TeamFeedback',
      APP_PUBLIC_KEY: JSON.stringify(publicKey), DATA: `${cwd}/DATA`, NODE_ENV: mode },
    stdout: 'pipe', stderr: 'inherit',
  });
  children.push(child);
  const reader = child.stdout.getReader();
  let output = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) throw new Error(`Server exited: ${output}`);
    output += new TextDecoder().decode(value);
    const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
    if (match) { reader.releaseLock(); return { url: match[0], cwd, child }; }
  }
}

function request(path, { host = 'localhost', method = 'GET', body, access = true, server = prod, headers = {} } = {}) {
  headers = { host, ...(access ? { 'Cf-Access-Jwt-Assertion': 'test-access' } : {}), ...headers };
  if (body !== undefined && !(body instanceof Uint8Array)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  return fetch(server.url + path, { method, headers, body });
}
const json = async (path, options) => {
  const response = await request(path, options);
  expect(response.status).toBe(200);
  return response.json();
};
const check = (params = {}, options = {}) => request('/_ota/check?' + new URLSearchParams({ device: 'device', current: '', key: 'web', ...params }), { host: 'tf.localhost', ...options });
const patch = (id, body) => request(`/api/releases/${id}`, { method: 'PATCH', body });
async function signed(files, extra = {}) {
  const manifest = JSON.stringify({ files });
  const signature = Buffer.from(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(manifest))).toString('base64');
  return { channel: 'production', key: 'web', manifest, signature, commit: 'abc123', ...extra };
}
async function upload(contents) {
  const bytes = Buffer.from(contents);
  const value = hash(bytes);
  expect((await request(`/api/files/${value}`, { method: 'PUT', body: bytes, headers: { 'Content-Type': 'application/octet-stream' } })).status).toBe(204);
  return value;
}
async function create(files = {}, extra = {}) {
  const response = await request('/api/releases', { method: 'POST', body: await signed(files, extra) });
  expect(response.status).toBe(201);
  return (await response.json()).id;
}
function clear() {
  const db = new Database(`${prod.cwd}/DATA/ota.db`);
  db.exec('DELETE FROM reports; DELETE FROM releases;');
  db.close();
}

beforeAll(async () => {
  const build = Bun.spawn([process.execPath, 'node_modules/maxserver/bin/cli.js', 'build'], { cwd: root, stdout: 'inherit', stderr: 'inherit' });
  expect(await build.exited).toBe(0);
  ({ privateKey, publicKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']));
  publicKey = await crypto.subtle.exportKey('jwk', publicKey);
  fixture = await mkdtemp(`${root}/.test-data-`);
  prod = await start('production');
  dev = await start('development');
}, 15000);
afterAll(async () => {
  for (const child of children) { child.kill(); await child.exited; }
  if (fixture) await rm(fixture, { recursive: true, force: true });
});

describe('hosts and Access', () => {
  test('admin configuration, unknown hosts and cross-role routes', async () => {
    expect(await json('/api/app')).toEqual({ id: 'tf', name: 'TeamFeedback' });
    for (const host of ['tf.localhost', 'tf-beta.localhost', 'unknown.localhost']) {
      expect((await request('/api/app', { host })).status).toBe(404);
    }
    expect((await check({}, { host: 'localhost' })).status).toBe(404);
    expect((await request('/', { host: 'unknown.localhost' })).status).toBe(404);
    expect((await request('/api/app', { host: 'LOCALHOST:3700' })).status).toBe(200);
  });
  test('production fails closed for admin and leaves PWA public', async () => {
    for (const path of ['/', '/nested/route', '/api/app', '/api/releases']) {
      expect((await request(path, { access: false })).status).toBe(403);
    }
    expect((await check({}, { access: false })).status).toBe(204);
    expect((await request('/api/app', { access: false, server: dev })).status).toBe(200);
  });
  test('API docs exist only in development', async () => {
    expect((await request('/docs', { server: dev })).status).toBe(200);
    expect((await request('/docs/openapi.json', { server: dev })).headers.get('content-type')).toContain('application/json');
    expect((await request('/docs', { server: dev, host: 'unknown.localhost' })).status).toBe(404);
    const response = await request('/docs/openapi.json');
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('"openapi"');
  });
  test('GUI assets and unknown paths resolve from its build directory', async () => {
    for (const path of ['/', '/apps/releases', '/unknown.css']) expect(await (await request(path)).text()).toContain('Admin GUI');
    expect(await (await request('/assets/gui.js')).text()).toBe('console.log("admin")');
    expect((await request('/api/unknown')).status).toBe(404);
    expect((await request('/_ota/files/' + 'a'.repeat(64))).status).toBe(404);
  });
});

describe('uploads and signed releases', () => {
  test('missing, verified binary upload, retries and immutable file headers', async () => {
    const bytes = Buffer.from([0, 255, 128, 10, 42]);
    const value = hash(bytes);
    const absent = hash('absent');
    expect(await json('/api/files/missing', { method: 'POST', body: { hashes: [value, absent] } })).toEqual({ missing: [value, absent] });
    expect((await request(`/api/files/${value}`, { method: 'PUT', body: Buffer.from('wrong') })).status).toBe(400);
    expect((await request(`/api/files/${value}`, { method: 'PUT', body: bytes })).status).toBe(204);
    const before = await stat(`${prod.cwd}/DATA/files/${value}`);
    expect((await request(`/api/files/${value}`, { method: 'PUT', body: bytes })).status).toBe(204);
    expect((await stat(`${prod.cwd}/DATA/files/${value}`)).mtimeMs).toBe(before.mtimeMs);
    expect(await json('/api/files/missing', { method: 'POST', body: { hashes: [value, absent] } })).toEqual({ missing: [absent] });
    for (const host of ['tf.localhost', 'tf-beta.localhost']) {
      const response = await request(`/_ota/files/${value}.js`, { host });
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe(immutable);
      expect(response.headers.get('content-type')).toBe(Bun.file('x.js').type);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    }
    const response = await request(`/_ota/files/${value}`, { host: 'tf.localhost' });
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    for (const file of [absent, '../ota.db', 'invalid', value + '.js.bad']) {
      expect((await request('/_ota/files/' + file, { host: 'tf.localhost' })).status).toBe(404);
    }
  });
  test('empty and concurrent uploads are stored once', async () => {
    const bytes = Buffer.alloc(512 * 1024, 19);
    const responses = await Promise.all(Array.from({ length: 4 }, () => request(`/api/files/${hash(bytes)}`, { method: 'PUT', body: bytes })));
    expect(responses.every(r => r.status === 204)).toBe(true);
    expect(await readFile(`${prod.cwd}/DATA/files/${hash(bytes)}`)).toEqual(bytes);
    await upload('');
  });
  test('valid signatures persist the original manifest and default rollout', async () => {
    clear();
    const content = await upload('<title>App</title>');
    const body = await signed({ 'index.html': content });
    const response = await request('/api/releases', { method: 'POST', body });
    expect(response.status).toBe(201);
    const { id } = await response.json();
    expect((await (await check()).json())).toEqual({ id, manifest: body.manifest, signature: body.signature });
    const [release] = await json('/api/releases');
    expect(release).toEqual({ id, channel: 'production', key: 'web', commit: 'abc123', created: expect.any(Number), rollout: 100, state: 'live', downloaded: 0, active: 0, failed: 0 });
  });
  test('rejects tampered signatures, wrong keys and missing files', async () => {
    const body = await signed({});
    for (const invalid of [
      { ...body, manifest: '{"files":{}} ' },
      { ...body, signature: 'not-base64' },
      { ...body, signature: body.signature + '!' },
      { ...body, signature: Buffer.alloc(64).toString('base64') },
      await signed({ 'missing.js': hash('not uploaded') }),
    ]) expect((await request('/api/releases', { method: 'POST', body: invalid })).status).toBe(400);
    const other = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const signature = Buffer.from(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, other.privateKey, new TextEncoder().encode(body.manifest))).toString('base64');
    expect((await request('/api/releases', { method: 'POST', body: { ...body, signature } })).status).toBe(400);
  });
  test('rejects invalid JSON, paths, hash values and unsorted manifests', async () => {
    const value = hash('test');
    for (const files of [{ '/index.html': value }, { '../index.html': value }, { 'a//b': value }, { 'a\\b': value }, { 'a/./b': value }, { 'index.html': 'invalid' }, { z: value, a: value }]) {
      expect((await request('/api/releases', { method: 'POST', body: await signed(files) })).status).toBe(400);
    }
    const body = await signed({});
    for (const manifest of ['{', 'null', '{"files":[]}', '{"files":{},"extra":true}']) {
      expect((await request('/api/releases', { method: 'POST', body: { ...body, manifest } })).status).toBe(400);
    }
  });
  test('rejects invalid request fields and malformed JSON', async () => {
    const body = await signed({});
    for (const change of [{ channel: 'other' }, { rollout: -1 }, { rollout: 101 }, { rollout: 0.5 }, { key: '' }, { signature: null }]) {
      expect((await request('/api/releases', { method: 'POST', body: { ...body, ...change } })).status).toBe(400);
    }
    expect((await request('/api/files/missing', { method: 'POST', body: { hashes: ['../ota.db'] } })).status).toBe(400);
    const jsonFile = Buffer.from('{ "value": 1 }');
    expect((await request(`/api/files/${hash(jsonFile)}`, { method: 'PUT', body: jsonFile, headers: { 'Content-Type': 'application/json' } })).status).toBe(400);
    expect((await request('/api/releases', { method: 'POST', body: Buffer.from('{'), headers: { 'Content-Type': 'application/json' } })).status).toBe(400);
  });
});

describe('release selection and controls', () => {
  test('204 and no-store when no matching release, even with a current ID', async () => {
    clear();
    const response = await check({ current: '999' });
    expect(response.status).toBe(204);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe('');
  });
  test('filters by channel and key and selects newest eligible release', async () => {
    clear();
    const first = await create();
    const beta = await create({}, { channel: 'beta' });
    const native = await create({}, { key: 'native' });
    const last = await create();
    expect((await (await check({ current: String(first) })).json()).id).toBe(last);
    expect((await (await check({}, { host: 'tf-beta.localhost' })).json()).id).toBe(beta);
    expect((await (await check({ key: 'native' })).json()).id).toBe(native);
    expect((await check({ key: 'unknown' })).status).toBe(204);
  });
  test('rollout uses the first eight SHA-256 hex digits and is monotonic', async () => {
    clear();
    const first = await create();
    const trial = await create({}, { rollout: 25 });
    const devices = Array.from({ length: 30 }, (_, i) => `device-${i}`);
    for (const percentage of [0, 25, 70, 100]) {
      expect((await patch(trial, { rollout: percentage })).status).toBe(200);
      for (const device of devices) {
        const expected = parseInt(hash(device + trial).slice(0, 8), 16) % 100 < percentage ? trial : first;
        const response = await check({ device });
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect((await response.json()).id).toBe(expected);
      }
    }
  });
  test('current keeps paused or excluded releases; rollback falls back and resume works', async () => {
    clear();
    const first = await create();
    const last = await create({}, { rollout: 0 });
    expect((await (await check({ current: String(last) })).json()).id).toBe(last);
    expect((await (await check()).json()).id).toBe(first);
    await patch(last, { state: 'paused', rollout: 100 });
    expect((await (await check({ current: String(last) })).json()).id).toBe(last);
    expect((await (await check()).json()).id).toBe(first);
    await patch(last, { state: 'live' });
    expect((await (await check()).json()).id).toBe(last);
    await patch(last, { state: 'rolledback' });
    expect((await (await check({ current: String(last) })).json()).id).toBe(first);
    await patch(first, { state: 'paused' });
    expect((await check()).status).toBe(204);
    expect((await (await check({ current: String(first) })).json()).id).toBe(first);
  });
  test('PATCH returns counts and validates IDs, rollout and state', async () => {
    clear();
    const id = await create();
    const response = await patch(id, { rollout: 50, state: 'paused' });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id, rollout: 50, state: 'paused', downloaded: 0, active: 0, failed: 0 });
    for (const body of [{ state: 'invalid' }, { rollout: 101 }, {}, { rollout: null }]) expect((await patch(id, body)).status).toBe(400);
    expect((await patch(9999, { state: 'live' })).status).toBe(404);
    expect((await patch('invalid', { state: 'live' })).status).toBe(400);
  });
});

describe('reports and first visits', () => {
  test('reports replace device state, ignore unknown IDs and count per release', async () => {
    clear();
    const first = await create();
    const last = await create();
    const report = (device, reports) => request('/_ota/report', { host: 'tf.localhost', method: 'POST', body: { device, reports } });
    expect((await report('a', [{ release: first, state: 'downloaded' }, { release: last, state: 'active' }, { release: 99999, state: 'failed' }])).status).toBe(204);
    expect((await report('b', [{ release: first, state: 'failed' }])).status).toBe(204);
    expect((await report('a', [{ release: first, state: 'active' }])).status).toBe(204);
    const list = await json('/api/releases');
    expect(list.map(r => r.id)).toEqual([last, first]);
    expect(list[0]).toMatchObject({ downloaded: 0, active: 1, failed: 0 });
    expect(list[1]).toMatchObject({ downloaded: 0, active: 1, failed: 1 });
    expect((await report('a', [{ release: first, state: 'invalid' }])).status).toBe(400);
    expect((await report('a', [])).status).toBe(204);
  });
  test('PWA serves files, directories, SPA paths and cache and MIME headers', async () => {
    clear();
    expect((await request('/', { host: 'tf.localhost' })).status).toBe(404);
    const html = await upload('<title>Production</title>');
    const css = await upload('body { color: red }');
    const folder = await upload('<title>Folder</title>');
    const betaHtml = await upload('<title>Beta</title>');
    const files = { 'assets/style.css': css, 'docs/index.html': folder, 'index.html': html };
    await create(files);
    await create({ 'index.html': betaHtml }, { channel: 'beta' });
    const partial = await create({ 'index.html': betaHtml }, { rollout: 50 });
    const paused = await create({ 'index.html': betaHtml });
    await patch(paused, { state: 'paused' });
    const rolledback = await create({ 'index.html': betaHtml });
    await patch(rolledback, { state: 'rolledback' });
    await create({ 'index.html': betaHtml }, { key: 'native' });
    for (const path of ['/', '/index.html', '/settings/users', '/new/', '/file%20name']) {
      const response = await request(path, { host: 'tf.localhost' });
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('<title>Production</title>');
      expect(response.headers.get('cache-control')).toBe(shortCache);
      expect(response.headers.get('content-type')).toBe(Bun.file('x.html').type);
    }
    expect(await (await request('/docs/', { host: 'tf.localhost' })).text()).toBe('<title>Folder</title>');
    const response = await request('/assets/style.css', { host: 'tf.localhost' });
    expect(await response.text()).toBe('body { color: red }');
    expect(response.headers.get('content-type')).toBe(Bun.file('x.css').type);
    expect(response.headers.get('cache-control')).toBe(shortCache);
    expect(await (await request('/', { host: 'tf-beta.localhost' })).text()).toBe('<title>Beta</title>');
    for (const path of ['/missing.js', '/assets/absent.css', '/_ota/unknown', '/api/releases']) {
      expect((await request(path, { host: 'tf.localhost' })).status).toBe(404);
    }
    expect((await request('/%zz', { host: 'tf.localhost' })).status).toBe(400);
    await patch(partial, { rollout: 100 });
    expect(await (await request('/', { host: 'tf.localhost' })).text()).toBe('<title>Beta</title>');
  });
  test('database and files persist across a server restart', async () => {
    const releases = await json('/api/releases');
    prod.child.kill();
    await prod.child.exited;
    prod = await start('production');
    expect(await json('/api/releases')).toEqual(releases);
    expect((await request('/', { host: 'tf.localhost' })).status).toBe(200);
  });
});
