import { createServer } from 'node:http';
import { webcrypto, createHash } from 'node:crypto';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../../', import.meta.url));
const exec = promisify(execFile);
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const algorithm = { name: 'ECDSA', namedCurve: 'P-256' };
const signing = { name: 'ECDSA', hash: 'SHA-256' };
const mime = path => ({ html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', txt: 'text/plain' }[path.split('.').pop()] || 'application/octet-stream');

export async function keys() {
  const pair = await webcrypto.subtle.generateKey(algorithm, true, ['sign', 'verify']);
  return { privateKey: await webcrypto.subtle.exportKey('jwk', pair.privateKey), publicKey: await webcrypto.subtle.exportKey('jwk', pair.publicKey) };
}

export async function fixture() {
  const dir = await mkdtemp(`${root}test/ota/.tmp-`);
  await mkdir(`${dir}/dist`);
  await writeFile(`${dir}/package.json`, JSON.stringify({ scripts: { build: 'node -e "console.log(\'app built\')"' } }));
  await writeFile(`${dir}/dist/index.html`, '<!doctype html><html><head><title>Test</title><script src="/app.js"></script></head><body>App</body></html>');
  await writeFile(`${dir}/dist/app.js`, 'window.appStarted = true;');
  return { dir, close: () => rm(dir, { recursive: true, force: true }) };
}

export async function cli(args, dir, env = {}) {
  try {
    const result = await exec(process.execPath, [`${root}bin/appmachine.js`, ...args], {
      cwd: dir, env: { ...process.env, OTA_PRIVATE_KEY: '', MAXAPP_URL: '', CF_ACCESS_CLIENT_ID: '', CF_ACCESS_CLIENT_SECRET: '', ...env }
    });
    return { ...result, code: 0 };
  } catch (error) { return { stdout: error.stdout, stderr: error.stderr, code: error.code }; }
}

export async function stub() {
  const pair = await keys();
  const verificationKey = await webcrypto.subtle.importKey('jwk', pair.publicKey, algorithm, false, ['verify']);
  const api = { ...pair, files: new Map(), releases: [], uploads: [], requests: [], reports: [], checks: 0, override: null, corrupt: null, rejectReports: false, adminStatus: null };
  const body = async request => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    return Buffer.concat(chunks);
  };
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const path = url.pathname;
      api.requests.push({ path, headers: request.headers });
      const send = (status, data, type = 'application/json') => {
        response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
        response.end(data == null ? undefined : type === 'application/json' ? JSON.stringify(data) : data);
      };
      // 1. Admin upload protocol with real hash and signature validation.
      if (path.startsWith('/api/') && api.adminStatus) {
        response.setHeader('Location', '/access-login');
        return send(api.adminStatus, { error: 'denied' });
      }
      if (path === '/api/files/missing') {
        const { hashes } = JSON.parse(await body(request));
        return send(200, { missing: hashes.filter(hash => !api.files.has(hash)) });
      }
      if (path.startsWith('/api/files/') && request.method === 'PUT') {
        const bytes = await body(request);
        const hash = path.split('/').pop();
        if (digest(bytes) !== hash) return send(400);
        api.files.set(hash, bytes);
        api.uploads.push(hash);
        return send(204);
      }
      if (path === '/api/releases' && request.method === 'POST') {
        const release = JSON.parse(await body(request));
        const valid = await webcrypto.subtle.verify(signing, verificationKey, Buffer.from(release.signature, 'base64'), Buffer.from(release.manifest));
        if (!valid || Object.values(JSON.parse(release.manifest).files).some(hash => !api.files.has(hash))) return send(400);
        release.id = api.releases.length + 1;
        release.state = 'live';
        api.releases.push(release);
        return send(201, { id: release.id });
      }
      // 2. Device selection, file downloads and queued status reports.
      if (path === '/_ota/check') {
        api.checks++;
        if (api.override) return send(200, api.override);
        const current = Number(url.searchParams.get('current'));
        const device = url.searchParams.get('device');
        const release = [...api.releases].reverse().find(r => r.channel === 'production' && (r.key === url.searchParams.get('key') || url.searchParams.get('key') === 'web') && r.state !== 'rolledback' &&
          (r.id === current || r.state === 'live' && parseInt(digest(device + r.id).slice(0, 8), 16) % 100 < r.rollout));
        return send(release ? 200 : 204, release);
      }
      if (path === '/_ota/report') {
        if (api.rejectReports) return send(503);
        api.reports.push(JSON.parse(await body(request)));
        return send(204);
      }
      if (path.startsWith('/_ota/files/')) {
        const name = path.split('/').pop();
        const hash = name.split('.')[0];
        const bytes = api.corrupt === hash ? Buffer.from('tampered') : api.files.get(hash);
        return send(bytes ? 200 : 404, bytes || 'missing', mime(name));
      }
      // 3. Network first visits and SPA fallback.
      const release = [...api.releases].reverse().find(r => r.channel === 'production' && r.state === 'live' && r.rollout === 100);
      if (!release) return send(404);
      const files = JSON.parse(release.manifest).files;
      let name = decodeURIComponent(path).slice(1);
      if (!name || name.endsWith('/')) name += 'index.html';
      if (!Object.hasOwn(files, name) && !name.split('/').pop().includes('.')) name = 'index.html';
      if (!Object.hasOwn(files, name)) return send(404);
      return send(200, api.files.get(files[name]), mime(name));
    } catch (error) {
      response.writeHead(500);
      response.end(error.message);
    }
  });
  await new Promise(resolve => server.listen(0, 'localhost', resolve));
  api.url = `http://localhost:${server.address().port}`;
  api.close = () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  api.release = async (name, { crash = false, extra = {}, key: compatibility = 'web' } = {}) => {
    const client = `const APPMACHINE = ${JSON.stringify({ key: compatibility, publicKey: pair.publicKey })};\n${await readFile(`${root}ota/client.js`, 'utf8')}`;
    const contents = {
      'index.html': `<!doctype html><html><head><script src="/appmachine.js"></script><script src="/app.js"></script></head><body><h1>${name}</h1></body></html>`,
      'app.js': `window.version = ${JSON.stringify(name)};${crash ? 'throw Error("startup failed");' : ''}`,
      'appmachine.js': client,
      'appmachine-sw.js': await readFile(`${root}ota/sw.js`),
      'common.txt': 'unchanged',
      ...extra
    };
    const files = {};
    for (const path of Object.keys(contents).sort()) {
      const bytes = Buffer.from(contents[path]);
      files[path] = digest(bytes);
      api.files.set(files[path], bytes);
    }
    const manifest = JSON.stringify({ files });
    const key = await webcrypto.subtle.importKey('jwk', pair.privateKey, algorithm, false, ['sign']);
    const signature = Buffer.from(await webcrypto.subtle.sign(signing, key, Buffer.from(manifest))).toString('base64');
    const release = { id: api.releases.length + 1, channel: 'production', key: compatibility, manifest, signature, state: 'live', rollout: 100 };
    api.releases.push(release);
    return release;
  };
  return api;
}

export const state = page => page.evaluate(async () => (await (await caches.open('appmachine')).match('/appmachine/state'))?.json());
export async function waitState(page, expected) {
  await page.evaluate(async expected => {
    for (let i = 0; i < 300; i++) {
      const state = await (await (await caches.open('appmachine')).match('/appmachine/state'))?.json();
      if (state && Object.entries(expected).every(([key, value]) => JSON.stringify(state[key]) === JSON.stringify(value))) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw Error(`State did not reach ${JSON.stringify(expected)}`);
  }, expected);
}
