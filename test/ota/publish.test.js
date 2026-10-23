import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { cli, fixture, stub, root, digest } from './helpers.js';

test('keygen outputs a usable P-256 signing pair', async () => {
  const result = await cli(['keygen'], root);
  assert.equal(result.code, 0, result.stderr);
  const { OTA_PRIVATE_KEY, APP_PUBLIC_KEY } = JSON.parse(result.stdout);
  assert.equal(APP_PUBLIC_KEY.d, undefined);
  const privateKey = await webcrypto.subtle.importKey('jwk', OTA_PRIVATE_KEY, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const publicKey = await webcrypto.subtle.importKey('jwk', APP_PUBLIC_KEY, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const bytes = Buffer.from('test');
  const signature = await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, bytes);
  assert.equal(signature.byteLength, 64);
  assert.equal(await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, signature, bytes), true);
});

test('publish builds, signs, uploads missing files and never edits dist', async t => {
  const app = await fixture();
  const server = await stub();
  t.after(() => app.close());
  t.after(() => server.close());
  const before = new Map(await Promise.all((await readdir(`${app.dir}/dist`)).map(async name => [name, await readFile(`${app.dir}/dist/${name}`)])));
  const env = { OTA_PRIVATE_KEY: JSON.stringify(server.privateKey), MAXAPP_URL: server.url, GITHUB_SHA: 'test-commit', CF_ACCESS_CLIENT_ID: 'test-id', CF_ACCESS_CLIENT_SECRET: 'test-secret' };
  server.files.set(digest(before.get('app.js')), before.get('app.js'));
  const result = await cli(['publish', '--channel', 'beta', '--rollout', '35'], app.dir, env);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /app built/);
  assert.match(result.stdout, /Published release 1 to beta \(35%\)/);
  const release = server.releases[0];
  assert.equal(release.key, 'web');
  assert.equal(release.commit, 'test-commit');
  assert.equal(release.channel, 'beta');
  assert.equal(release.rollout, 35);
  const files = JSON.parse(release.manifest).files;
  assert.deepEqual(Object.keys(files), [...Object.keys(files)].sort());
  assert.match(server.files.get(files['index.html']).toString(), /<head><script src="\/appmachine.js"><\/script><title>/);
  assert.match(server.files.get(files['appmachine.js']).toString(), /^const APPMACHINE = \{"key":"web","publicKey":/);
  assert.equal(server.uploads.includes(files['app.js']), false);
  assert.equal(server.uploads.length, 3);
  for (const request of server.requests) {
    assert.equal(request.headers['cf-access-client-id'], 'test-id');
    assert.equal(request.headers['cf-access-client-secret'], 'test-secret');
  }
  const again = await cli(['publish'], app.dir, env);
  assert.equal(again.code, 0, again.stderr);
  assert.equal(server.releases[1].channel, 'production');
  assert.equal(server.releases[1].rollout, 100);
  assert.equal(server.uploads.length, 3, 'second publish reuses every file');
  assert.deepEqual(await readdir(`${app.dir}/dist`), [...before.keys()]);
  for (const [name, bytes] of before) assert.deepEqual(await readFile(`${app.dir}/dist/${name}`), bytes);
});

test('publish reports invalid inputs, missing files, Access redirects and API failures', async t => {
  const app = await fixture();
  const server = await stub();
  t.after(() => app.close());
  t.after(() => server.close());
  const env = { OTA_PRIVATE_KEY: JSON.stringify(server.privateKey), MAXAPP_URL: server.url, GITHUB_SHA: 'test' };
  for (const [args, pattern] of [
    [['publish'], /Missing OTA_PRIVATE_KEY/],
    [['publish', '--channel', 'other'], /Channel must/],
    [['publish', '--rollout', '101'], /Rollout must/],
    [['publish', '--rollout', '-1'], /Rollout must/],
    [['publish', '--rollout', '2.5'], /Rollout must/],
    [['publish', '--bad', 'value'], /Usage/]
  ]) {
    const result = await cli(args, app.dir, args.length === 1 ? {} : env);
    assert.equal(result.code, 1);
    assert.match(result.stderr, pattern);
  }
  const missing = await cli(['publish', '--dir', 'missing'], app.dir, env);
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /ENOENT/);
  await writeFile(`${app.dir}/dist/index.html`, '<html>no head</html>');
  assert.match((await cli(['publish'], app.dir, env)).stderr, /needs index.html with a <head>/);
  await writeFile(`${app.dir}/dist/index.html`, '<html><head></head></html>');
  for (const status of [302, 403, 500]) {
    server.adminStatus = status;
    const result = await cli(['publish'], app.dir, env);
    assert.equal(result.code, 1);
    assert.match(result.stderr, new RegExp(`HTTP ${status}`));
    if (status === 302) assert.match(result.stderr, /Cloudflare Access/);
    assert.equal(server.requests.some(request => request.path === '/access-login'), false);
  }
});

test('installer copies the web workflow and npm ships only the public package files', async t => {
  const app = await fixture();
  t.after(() => app.close());
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const exec = promisify(execFile);
  await exec(process.execPath, [`${root}scripts/install.js`], { cwd: app.dir, env: { ...process.env, INIT_CWD: app.dir } });
  assert.deepEqual(await readFile(`${app.dir}/.github/workflows/web.yml`), await readFile(`${root}src/web.yml`));
  const { stdout } = await exec('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: root });
  const [{ files }] = JSON.parse(stdout);
  assert.equal(files.some(({ path }) => /^(server|docs|test)\//.test(path)), false);
  for (const path of ['bin/appmachine.js', 'ota/client.js', 'ota/sw.js', 'src/web.yml', 'scripts/install.js']) assert.equal(files.some(file => file.path === path), true, path);
});
