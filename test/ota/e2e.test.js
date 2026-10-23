import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { root, keys, cli, state, waitState } from './helpers.js';

const { chromium } = await import(`${process.env.MAXAGENTS_PLAYWRIGHT}/index.mjs`);
const bun = process.env.BUN || `${process.env.HOME}/.bun/bin/bun`;
process.env.PATH = `${bun.replace(/\/bun$/, '')}:${process.env.PATH}`;
const port = 3800 + Math.floor(Math.random() * 100);
const admin = `http://localhost:${port}`;
const app = `http://demo.localhost:${port}`;

test('Real server: publish, offline, update, crash rollback, server rollback, beta, GUI, devices', async t => {
  // 1. Build and start the real server with a fresh data folder
  const dir = await mkdtemp(`${tmpdir()}/appmachine-e2e-`);
  t.after(() => rm(dir, { recursive: true, force: true }));
  execFileSync('npm', ['ci'], { cwd: `${root}server`, stdio: 'ignore' });
  execFileSync('npm', ['run', 'build'], { cwd: `${root}server`, stdio: 'ignore' });
  execFileSync('npm', ['ci'], { cwd: `${root}server/gui`, stdio: 'ignore' });
  execFileSync('npm', ['run', 'build'], { cwd: `${root}server/gui`, stdio: 'ignore' });
  const { privateKey, publicKey } = await keys();
  const server = spawn(bun, ['dist/bundle.js'], { cwd: `${root}server`, stdio: 'ignore', env: {
    ...process.env, PORT: String(port), DOMAIN: 'localhost', DATA: `${dir}/data`, NODE_ENV: 'development',
    APP_ID: 'demo', APP_NAME: 'Demo', APP_PUBLIC_KEY: JSON.stringify(publicKey),
  } });
  t.after(() => server.kill());
  for (let i = 0; !(await fetch(`${admin}/api/app`).then(r => r.ok, () => false)); i++) {
    assert.ok(i < 100, 'server did not start');
    await new Promise(r => setTimeout(r, 100));
  }
  const api = async (path, body) => (await fetch(`${admin}${path}`, body && {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })).json();
  const release = async id => (await api('/api/releases')).find(r => r.id === id);
  async function device(expected) {
    for (let i = 0; ; i++) {
      const found = (await api('/api/devices')).find(d => d.id === (expected.id || d.id) && d.running === expected.running && d.staged === expected.staged);
      if (found) return found;
      assert.ok(i < 50, `device never reported ${JSON.stringify(expected)}`);
      await new Promise(r => setTimeout(r, 100));
    }
  }

  // 2. Publish a version with the real CLI
  await mkdir(`${dir}/app/dist`, { recursive: true });
  await writeFile(`${dir}/app/package.json`, '{}');
  async function publish(version, js = '', channel = 'production') {
    await writeFile(`${dir}/app/dist/index.html`, `<!doctype html><html><head><title>Demo</title></head><body><h1>${version}</h1><script src="/app.js"></script></body></html>`);
    await writeFile(`${dir}/app/dist/app.js`, js || `window.version = '${version}';`);
    const out = await cli(['publish', '--channel', channel], `${dir}/app`, {
      OTA_PRIVATE_KEY: JSON.stringify(privateKey), MAXAPP_URL: admin, GITHUB_SHA: `${version}000000`,
    });
    assert.equal(out.code, 0, out.stderr);
    return Number(out.stdout.match(/release (\d+)/)[1]);
  }

  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext();
  const page = await context.newPage();
  const h1 = () => page.locator('h1').textContent();

  // 3. First visit from the network, then launches from the cache, offline too
  const v1 = await publish('v1');
  await page.goto(app);
  assert.equal(await h1(), 'v1');
  await waitState(page, { trial: v1, tries: 0 });
  await page.reload();
  await waitState(page, { kept: v1, trial: null, reports: [] });
  await context.setOffline(true);
  await page.reload();
  assert.equal(await h1(), 'v1');
  await context.setOffline(false);

  // 4. An update downloads in the background and starts on the next launch
  const v2 = await publish('v2');
  await page.reload();
  await waitState(page, { kept: v1, trial: v2 });
  assert.equal(await h1(), 'v1');
  const { id } = await device({ running: v1, staged: v2 });
  assert.equal(id, (await state(page)).device);
  await page.reload();
  assert.equal(await h1(), 'v2');
  await waitState(page, { kept: v2, trial: null, reports: [] });
  assert.equal((await release(v2)).active, 1);
  const specs = await device({ id, running: v2, staged: null });
  assert.match(specs.screen, /^\d+x\d+@[\d.]+$/);
  assert.match(specs.browser, /^Chrome \d+$/);
  assert.equal(specs.channel, 'production');
  assert.equal(specs.standalone, false);
  assert.ok(specs.cores > 0 && specs.language && specs.system);

  // 5. A release that crashes at startup is rolled back after 2 launches
  const v3 = await publish('v3', 'throw new Error("broken")');
  await page.reload();
  await waitState(page, { trial: v3, tries: 0 });
  await page.reload();
  await page.reload();
  await page.reload();
  assert.equal(await h1(), 'v2');
  await waitState(page, { kept: v2, trial: null, bad: [v3], reports: [] });
  assert.equal((await release(v3)).failed, 1);

  // 6. Server rollback: the device returns to v1
  await api(`/api/releases/${v3}`, { state: 'rolledback' });
  await api(`/api/releases/${v2}`, { state: 'rolledback' });
  await page.reload();
  await waitState(page, { trial: v1 });
  await page.reload();
  assert.equal(await h1(), 'v1');
  await waitState(page, { kept: v1, trial: null });

  // 7. Beta gets its own release; production keeps serving v1 to new visitors
  await publish('beta1', '', 'beta');
  const beta = await context.newPage();
  await beta.goto(`http://demo-beta.localhost:${port}/`);
  assert.equal(await beta.locator('h1').textContent(), 'beta1');
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(app);
  assert.equal(await visitor.locator('h1').textContent(), 'v1');

  // 8. The GUI lists the releases with counts and pauses one
  const gui = await context.newPage();
  const errors = [];
  gui.on('pageerror', e => errors.push(e.message));
  await gui.goto(admin);
  await gui.getByRole('heading', { name: 'Demo' }).waitFor();
  const card = gui.getByRole('article', { name: `Release ${v3}` });
  await card.getByText('Rolled back').waitFor();
  assert.equal(await card.locator('dd').nth(2).textContent(), '1');
  await gui.getByRole('article', { name: `Release ${v1}` }).getByRole('button', { name: 'Pause' }).click();
  for (let i = 0; (await release(v1)).state !== 'paused'; i++) {
    assert.ok(i < 50, 'pause not saved');
    await new Promise(r => setTimeout(r, 100));
  }
  await gui.getByRole('link', { name: 'Devices' }).click();
  await gui.getByRole('table').waitFor();
  await gui.getByRole('row').filter({ hasText: id.slice(0, 8) }).getByText(`Release ${v1}`, { exact: true }).waitFor();
  assert.deepEqual(errors, []);
});
