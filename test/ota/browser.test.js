import test from 'node:test';
import assert from 'node:assert/strict';
import { stub, state, waitState } from './helpers.js';

const { chromium, webkit } = await import(`${process.env.MAXAGENTS_PLAYWRIGHT}/index.mjs`);

async function setup(t, engine = chromium) {
  const server = await stub();
  const browser = await engine.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => server.close());
  t.after(() => browser.close());
  return { server, context, page, errors };
}

async function keepFirst(page, server) {
  const first = await server.release('One');
  await page.goto(server.url);
  await waitState(page, { trial: first.id, tries: 0 });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.reload();
  await waitState(page, { kept: first.id, trial: null, tries: 0, reports: [] });
  return first;
}

test('Chromium: network first visit, cached launch, offline launch and SPA paths', async t => {
  const { server, page, context, errors } = await setup(t);
  const first = await keepFirst(page, server);
  const initial = await state(page);
  assert.match(initial.device, /^[\da-f-]{36}$/);
  assert.equal(await page.locator('h1').textContent(), 'One');
  assert.equal(server.reports.flatMap(r => r.reports).some(r => r.release === first.id && r.state === 'active'), true);
  await context.setOffline(true);
  const response = await page.goto(`${server.url}/nested/route?test=1`);
  assert.equal(response.fromServiceWorker(), true);
  assert.equal(page.url(), `${server.url}/nested/route?test=1`);
  assert.equal(await page.locator('h1').textContent(), 'One');
  assert.equal(await page.evaluate(() => window.version), 'One');
  assert.deepEqual(errors, []);
});

test('Chromium: new release waits for next launch, becomes ready and cleans old caches', async t => {
  const { server, page, errors } = await setup(t);
  const first = await keepFirst(page, server);
  const second = await server.release('Two', { extra: { 'nested/index.html': '<html><head><script src="/appmachine.js"></script></head><body>Nested</body></html>' } });
  await page.reload();
  await waitState(page, { kept: first.id, trial: second.id, tries: 0 });
  assert.equal(await page.locator('h1').textContent(), 'One');
  const counts = () => server.requests.filter(r => r.path.startsWith('/_ota/files/')).map(r => r.path);
  const common = JSON.parse(first.manifest).files['common.txt'];
  assert.equal(counts().filter(path => path.includes(common)).length, 1, 'unchanged files are reused');
  await page.reload();
  assert.equal(await page.locator('h1').textContent(), 'Two');
  await waitState(page, { kept: second.id, trial: null, tries: 0, reports: [] });
  const manifests = await page.evaluate(async () => (await (await caches.open('appmachine')).keys()).map(request => new URL(request.url).pathname));
  assert.equal(manifests.includes(`/appmachine/release/${first.id}`), false);
  assert.equal(manifests.includes(`/appmachine/release/${second.id}`), true);
  const oldHash = JSON.parse(first.manifest).files['app.js'];
  assert.equal(await page.evaluate(async hash => !!await (await caches.open('appmachine-files')).match(`/_ota/files/${hash}.js`), oldHash), false);
  await page.goto(`${server.url}/nested/`);
  assert.equal(await page.locator('body').textContent(), 'Nested');
  assert.deepEqual(errors, []);
});

test('Chromium: startup errors fail after two launches and restore the kept release', async t => {
  const { server, page, errors } = await setup(t);
  const first = await keepFirst(page, server);
  const broken = await server.release('Broken', { crash: true });
  await page.reload();
  await waitState(page, { trial: broken.id, tries: 0 });
  await page.reload();
  await waitState(page, { kept: first.id, trial: broken.id, tries: 1 });
  const checks = server.checks;
  await waitState(page, { reports: [] });
  await page.reload();
  await waitState(page, { kept: first.id, trial: broken.id, tries: 2 });
  await page.reload();
  assert.equal(await page.locator('h1').textContent(), 'One');
  await waitState(page, { kept: first.id, trial: null, bad: [broken.id], reports: [] });
  await page.waitForFunction(() => document.readyState === 'complete');
  assert.equal(server.checks >= checks, true);
  assert.equal(server.reports.flatMap(r => r.reports).some(r => r.release === broken.id && r.state === 'failed'), true);
  assert.deepEqual(errors, ['startup failed', 'startup failed']);
});

test('Chromium: server rollback drops a trial still pending in another open launch', async t => {
  const { server, page, context, errors } = await setup(t);
  const first = await keepFirst(page, server);
  const second = await server.release('Two');
  const other = await context.newPage();
  let releaseCheck;
  const gate = new Promise(resolve => { releaseCheck = resolve; });
  await other.route('**/_ota/check?*', async route => { await gate; await route.continue(); });
  t.after(() => releaseCheck());
  await page.reload();
  await other.goto(server.url);
  await waitState(page, { trial: second.id, tries: 0 });
  second.state = 'rolledback';
  releaseCheck();
  await waitState(page, { kept: first.id, trial: null, tries: 0 });
  await page.reload();
  assert.equal(await page.locator('h1').textContent(), 'One');
  assert.deepEqual(errors, []);
});

test('Chromium: tampered manifests and files cannot become trials; interrupted downloads resume', async t => {
  const { server, page, errors } = await setup(t);
  const first = await keepFirst(page, server);
  const second = await server.release('Two');
  server.override = { ...second, manifest: second.manifest.replace('index.html', 'other.html') };
  let checked;
  page.on('response', response => { if (response.url().includes('/_ota/check?')) checked?.(); });
  const check = () => new Promise(resolve => { checked = resolve; });
  let done = check();
  await page.reload();
  await done;
  await page.waitForFunction(() => document.readyState === 'complete');
  assert.equal((await state(page)).trial, null);
  server.override = null;
  server.corrupt = JSON.parse(second.manifest).files['index.html'];
  const fileResponse = page.waitForResponse(response => response.url().includes(server.corrupt));
  await page.reload();
  await fileResponse;
  assert.equal((await state(page)).trial, null);
  const reused = server.requests.filter(r => r.path.includes(JSON.parse(second.manifest).files['app.js'])).length;
  server.corrupt = null;
  await page.reload();
  await waitState(page, { kept: first.id, trial: second.id, tries: 0 });
  assert.equal(server.requests.filter(r => r.path.includes(JSON.parse(second.manifest).files['app.js'])).length, reused);
  assert.deepEqual(errors, []);
});

test('Chromium: ready reports survive offline and failed submissions, then flush', async t => {
  const { server, page, context, errors } = await setup(t);
  const first = await server.release('One');
  await page.goto(server.url);
  await waitState(page, { trial: first.id, tries: 0 });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await waitState(page, { kept: first.id, trial: null });
  assert.deepEqual((await state(page)).reports.map(r => r.state), ['downloaded', 'active']);
  assert.equal(server.reports.length, 0);
  await context.setOffline(false);
  server.rejectReports = true;
  const rejected = page.waitForResponse(response => response.url().endsWith('/_ota/report'));
  await page.reload();
  assert.equal((await rejected).status(), 503);
  assert.equal((await state(page)).reports.length, 2);
  server.rejectReports = false;
  await page.reload();
  await waitState(page, { reports: [] });
  assert.deepEqual(server.reports.flatMap(r => r.reports).map(r => r.state), ['downloaded', 'active']);
  assert.deepEqual(errors, []);
});

test('WebKit: localhost service worker registration and offline cache launch', async t => {
  const { server, page, context, errors } = await setup(t, webkit);
  await server.release('WebKit');
  await page.goto(server.url);
  const support = await page.evaluate(() => ({ secure: isSecureContext, serviceWorker: 'serviceWorker' in navigator }));
  if (!support.secure || !support.serviceWorker) return t.skip(`localhost service workers unavailable: ${JSON.stringify(support)}`);
  try {
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 5000 });
  } catch { return t.skip('WebKit exposes service workers but does not register them on localhost in this runner'); }
  await waitState(page, { trial: 1, tries: 0 });
  await page.reload();
  await waitState(page, { kept: 1, trial: null });
  t.diagnostic('WebKit service worker registration, caching and trial activation work on localhost.');
  await context.setOffline(true);
  try { await page.reload(); }
  catch (error) {
    if (error.message.includes('WebKit encountered an internal error')) return t.skip('WebKit runner cannot reload offline through its localhost service worker');
    throw error;
  }
  assert.equal(await page.locator('h1').textContent(), 'WebKit');
  assert.deepEqual(errors, []);
});

test('Chromium: a browser updates across releases with different native keys', async t => {
  const { server, page, errors } = await setup(t);
  const first = await server.release('One', { key: 'native-a' });
  await page.goto(server.url);
  await waitState(page, { trial: first.id, tries: 0 });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.reload();
  await waitState(page, { kept: first.id, trial: null, tries: 0, reports: [] });
  const second = await server.release('Two', { key: 'native-b' });
  await page.reload();
  await waitState(page, { kept: first.id, trial: second.id, tries: 0 });
  await page.reload();
  assert.equal(await page.locator('h1').textContent(), 'Two');
  assert.deepEqual(errors, []);
});
