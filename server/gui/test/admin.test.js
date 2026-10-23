import assert from 'node:assert/strict'
import { before, after, describe, it } from 'node:test'
import { mkdir } from 'node:fs/promises'
import { preview } from 'vite'
import { checkLayout } from './checkLayout.js'

const { chromium, webkit } = await import(process.env.MAXAGENTS_PLAYWRIGHT + '/index.mjs')
const screenshots = new URL('../../../../.maxagents-uploads/admin-gui/', import.meta.url)
const fixtures = [
  { id: 1, channel: 'production', key: 'web', commit: '123456789abcdef', created: 1789891200000, rollout: 100, state: 'live', downloaded: 1402, active: 1250, failed: 3 },
  { id: 3, channel: 'beta', key: 'web', commit: 'abcdef123456789', created: 1790064000000, rollout: 100, state: 'live', downloaded: 9, active: 8, failed: 1 },
  { id: 2, channel: 'production', key: 'web', commit: 'fedcba987654321', created: 1789977600000, rollout: 25, state: 'paused', downloaded: 42, active: 40, failed: 2 },
  { id: 4, channel: 'production', key: 'web', commit: 'aabbccddeeff001', created: 1789804800000, rollout: 100, state: 'rolledback', downloaded: 4, active: 0, failed: 4 },
]
const minute = 60000
const devices = now => [
  { id: 'a1b2c3d4-0000-4000-8000-000000000001', channel: 'production', running: 2, staged: 3, first: now - 3 * 86400000, last: now - 5 * minute,
    device: 'Pixel 8', system: 'Android 15', browser: 'Chrome 141', agent: 'Mozilla/5.0 (Linux; Android 10; K)', country: 'FI', screen: '412x915@2.63',
    standalone: true, installed: true, language: 'fi-FI', cores: 8, memory: 8 },
  { id: 'b1b2c3d4-0000-4000-8000-000000000002', channel: 'beta', running: 5, staged: null, first: now - 86400000, last: now - 3 * 3600000,
    device: 'iPhone', system: 'iOS 18.6', browser: 'Safari 18.6', agent: 'Mozilla/5.0 (iPhone)', country: 'SE', screen: '390x844@3',
    standalone: false, installed: true, language: 'sv-SE', cores: 4, memory: null },
  { id: 'c1b2c3d4-0000-4000-8000-000000000003', channel: 'production', running: null, staged: 2, first: now - 20000, last: now - 20000,
    device: 'Unknown', system: '', browser: '', agent: 'curl/8.5.0', country: 'XX', screen: '', standalone: false, installed: false, language: '', cores: null, memory: null },
]
let server, url

before(async () => {
  server = await preview({ preview: { host: '127.0.0.1', port: 0 } })
  url = 'http://127.0.0.1:' + server.httpServer.address().port
  await mkdir(screenshots, { recursive: true })
})
after(() => new Promise(resolve => server.httpServer.close(resolve)))

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

for (const [name, engine] of Object.entries({ chromium, webkit })) describe(name, () => {
  let browser
  before(async () => { browser = await engine.launch() })
  after(async () => { await browser.close() })

  async function open(t, options = {}) {
    // 1. Mock the same-origin API and fail on unexpected browser errors
    const state = { releases: structuredClone(fixtures), devices: devices(Date.now()), patches: [], gets: 0, ...options }
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'en-US', timezoneId: 'UTC' })
    page.setDefaultTimeout(5000)
    const errors = [], expectedHttpErrors = new Set()
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => {
      if (message.type() !== 'error') return
      // Failed HTTP responses are intentional in the error-state tests only.
      if (expectedHttpErrors.has(message.location().url) && message.text().startsWith('Failed to load resource:')) return
      errors.push(message.text())
    })
    await page.route('**/api/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname
      let result
      if (path === '/api/app') result = { body: { id: 'tf', name: 'TeamFeedback' }, status: state.appStatus || 200 }
      else if (path === '/api/releases' && request.method() === 'GET') {
        state.gets++
        result = state.list ? await state.list() : { body: state.releases, status: state.listStatus || 200 }
      } else if (path === '/api/devices' && request.method() === 'GET') {
        result = state.deviceList ? await state.deviceList() : { body: state.devices, status: state.devicesStatus || 200 }
      } else if (/^\/api\/releases\/\d+$/.test(path) && request.method() === 'PATCH') {
        const id = Number(path.split('/').pop()), body = request.postDataJSON()
        state.patches.push({ id, body })
        if (state.patch) result = await state.patch(id, body)
        else {
          state.releases = state.releases.map(release => release.id === id ? { ...release, ...body } : release)
          result = { body: state.releases.find(release => release.id === id) }
        }
        assert.equal(request.headers()['content-type'], 'application/json')
      } else {
        errors.push('Unexpected API request: ' + request.method() + ' ' + path)
        result = { status: 404, body: {} }
      }
      if (result.status >= 400) expectedHttpErrors.add(request.url())
      await route.fulfill({ status: result.status || 200, json: result.body || {} })
    })
    t.after(async () => {
      await page.close()
      assert.deepEqual(errors, [], 'No console or uncaught errors')
    })

    // 2. Install a controllable clock before mounting the built app
    if (options.clock) await page.clock.install()
    await page.goto(url + (options.hash || ''))
    return { page, state }
  }

  const card = (page, id) => page.getByRole('article', { name: 'Release ' + id, exact: true })
  const ready = page => card(page, 2).waitFor()

  it('shows the app, newest releases, commit, date, counts and channel tabs', async t => {
    const { page } = await open(t)
    await ready(page)
    assert.equal(await page.getByRole('heading', { name: 'TeamFeedback' }).count(), 1)
    assert.deepEqual(await page.getByRole('article').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))), ['Release 2', 'Release 1', 'Release 4'])
    assert.equal(await card(page, 2).locator('code').textContent(), 'fedcba9')
    assert.equal(await card(page, 2).locator('time').getAttribute('datetime'), '2026-09-21T08:00:00.000Z')
    assert.deepEqual(await card(page, 2).locator('dd').allTextContents(), ['42', '40', '2'])
    assert.match(await card(page, 1).textContent(), /1,402/)
    await page.getByRole('tab', { name: 'Beta' }).click()
    await card(page, 3).waitFor()
    assert.equal(await page.getByRole('article').count(), 1)
    assert.equal(await page.getByRole('tab', { name: 'Beta' }).getAttribute('aria-selected'), 'true')
    await page.getByRole('tab', { name: 'Beta' }).press('ArrowLeft')
    await ready(page)
    assert.equal(await page.getByRole('tab', { name: 'Production' }).evaluate(node => node === document.activeElement), true)
    assert.equal(await card(page, 4).getByRole('button', { name: 'Rollback' }).isDisabled(), true)
  })

  it('shows loading, then the release list', async t => {
    const gate = deferred()
    const { page } = await open(t, { list: async () => { await gate.promise; return { body: fixtures } } })
    await page.getByRole('status').filter({ hasText: 'Loading releases…' }).waitFor()
    gate.resolve()
    await ready(page)
    assert.equal(await page.getByText('Loading releases…').count(), 0)
  })

  it('sets rollout optimistically, validates integers, and sends the exact PATCH', async t => {
    const gate = deferred()
    const { page, state } = await open(t, { patch: async (id, body) => {
      await gate.promise
      return { body: { ...fixtures.find(item => item.id === id), ...body, active: 99 } }
    } })
    await ready(page)
    const release = card(page, 2), input = release.getByRole('spinbutton'), submit = release.getByRole('button', { name: 'Set rollout' })
    for (const invalid of ['', '-1', '101', '12.5']) {
      await input.fill(invalid)
      assert.equal(await submit.isDisabled(), true, invalid + ' is invalid')
    }
    await input.fill('0')
    await submit.click()
    await release.getByText('0% rollout', { exact: true }).waitFor()
    assert.equal(await release.getByRole('button', { name: 'Resume' }).isDisabled(), true)
    assert.deepEqual(state.patches, [{ id: 2, body: { rollout: 0 } }])
    gate.resolve()
    await release.locator('dd').filter({ hasText: /^99$/ }).waitFor()
    assert.equal(await input.inputValue(), '0')
  })

  it('pauses and resumes with the correct PATCH and optimistic state', async t => {
    const gate = deferred()
    const { page, state } = await open(t, { patch: async (id, body) => {
      await gate.promise
      return { body: { ...fixtures.find(item => item.id === id), ...body } }
    } })
    await ready(page)
    await card(page, 1).getByRole('button', { name: 'Pause', exact: true }).click()
    await card(page, 1).getByText('Paused', { exact: true }).waitFor()
    assert.deepEqual(state.patches, [{ id: 1, body: { state: 'paused' } }])
    gate.resolve()
    const resume = card(page, 1).getByRole('button', { name: 'Resume' })
    await page.waitForFunction(() => !document.querySelector('[aria-label="Release 1"]').getAttribute('aria-busy') || document.querySelector('[aria-label="Release 1"]').getAttribute('aria-busy') === 'false')
    await resume.click()
    await card(page, 1).getByText('Live', { exact: true }).waitFor()
    assert.deepEqual(state.patches[1], { id: 1, body: { state: 'live' } })
  })

  it('undoes a failed state change and a failed rollout, with a visible error', async t => {
    let gate = deferred()
    const { page } = await open(t, { patch: async () => { await gate.promise; return { status: 500 } } })
    await ready(page)
    const release = card(page, 2)
    await release.getByRole('button', { name: 'Resume' }).click()
    await release.getByText('Live', { exact: true }).waitFor()
    gate.resolve()
    await page.getByRole('alert').filter({ hasText: 'Your change was undone.' }).waitFor()
    await release.getByText('Paused', { exact: true }).waitFor()
    gate = deferred()
    await release.getByRole('spinbutton').fill('100')
    await release.getByRole('button', { name: 'Set rollout' }).click()
    await release.getByText('100% rollout', { exact: true }).waitFor()
    gate.resolve()
    await release.getByText('25% rollout', { exact: true }).waitFor()
    assert.equal(await release.getByRole('spinbutton').inputValue(), '25')
    assert.match(await page.getByRole('alert').textContent(), /Could not save release 2/)
  })

  it('requires rollback confirmation, supports cancel, and undoes failure', async t => {
    let accept = false
    const gate = deferred()
    const { page, state } = await open(t, { patch: async () => { await gate.promise; return { status: 500 } } })
    await ready(page)
    page.on('dialog', async dialog => {
      assert.equal(dialog.type(), 'confirm')
      assert.match(dialog.message(), /Roll back release 2\?/)
      await (accept ? dialog.accept() : dialog.dismiss())
    })
    const release = card(page, 2)
    await release.getByRole('button', { name: 'Rollback' }).click()
    assert.equal(state.patches.length, 0)
    accept = true
    await release.getByRole('button', { name: 'Rollback' }).click()
    await release.getByText('Rolled back', { exact: true }).waitFor()
    assert.deepEqual(state.patches, [{ id: 2, body: { state: 'rolledback' } }])
    gate.resolve()
    await page.getByRole('alert').waitFor()
    await release.getByText('Paused', { exact: true }).waitFor()
    assert.equal(await release.getByRole('button', { name: 'Rollback' }).isDisabled(), false)
  })

  it('shows the publish command in each empty channel', async t => {
    const { page } = await open(t, { releases: [] })
    await page.getByRole('heading', { name: 'No releases yet' }).waitFor()
    assert.equal(await page.locator('code').textContent(), 'npx appmachine publish')
    await page.getByRole('tab', { name: 'Beta' }).click()
    assert.equal(await page.locator('code').textContent(), 'npx appmachine publish --channel beta')
    assert.deepEqual(await checkLayout(page, page.getByRole('main')), [])
  })

  it('keeps a successful rollback and disables its controls', async t => {
    const { page, state } = await open(t)
    await ready(page)
    await page.getByRole('tab', { name: 'Beta' }).click()
    const release = card(page, 3)
    page.once('dialog', dialog => dialog.accept())
    await release.getByRole('button', { name: 'Rollback' }).click()
    await release.getByText('Rolled back', { exact: true }).waitFor()
    await page.waitForFunction(() => document.querySelector('[aria-label="Release 3"]').getAttribute('aria-busy') === 'false')
    assert.deepEqual(state.patches, [{ id: 3, body: { state: 'rolledback' } }])
    assert.equal(await release.getByRole('button', { name: 'Rollback' }).isDisabled(), true)
    assert.equal(await release.getByRole('spinbutton').isDisabled(), true)
  })

  it('shows initial API errors and retries successfully', async t => {
    const { page, state } = await open(t, { appStatus: 403, listStatus: 403 })
    await page.getByRole('alert').waitFor()
    assert.equal(await page.getByRole('article').count(), 0)
    assert.equal(await page.getByRole('heading', { level: 1 }).textContent(), 'Web updates')
    state.appStatus = 200
    state.listStatus = 500
    const failed = page.waitForResponse(response => response.url().endsWith('/api/releases') && response.status() === 500)
    await page.getByRole('button', { name: 'Refresh' }).click()
    await failed
    state.listStatus = 200
    await page.getByRole('button', { name: 'Refresh' }).click()
    await ready(page)
    assert.equal(await page.getByRole('alert').count(), 0)
  })

  it('refreshes every 30 seconds and on focus, preserving the list on failure', async t => {
    const { page, state } = await open(t, { clock: true })
    await ready(page)
    assert.equal(state.gets, 1)
    state.releases[2].active = 77
    await page.clock.runFor(30000)
    await card(page, 2).locator('dd').filter({ hasText: /^77$/ }).waitFor()
    assert.equal(state.gets, 2)
    state.listStatus = 500
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await page.getByRole('alert').waitFor()
    assert.equal(await page.getByRole('article').count(), 3)
    state.listStatus = 200
    state.releases[2].active = 78
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await card(page, 2).locator('dd').filter({ hasText: /^78$/ }).waitFor()
    assert.equal(await page.getByRole('alert').count(), 0)
  })

  it('ignores a stale refresh and skips refreshes during a save', async t => {
    const stale = deferred(), patch = deferred()
    const { page, state } = await open(t, { clock: true })
    await ready(page)
    state.list = async () => { await stale.promise; return { body: fixtures } }
    const requested = page.waitForRequest(request => request.url().endsWith('/api/releases'))
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await requested
    state.patch = async (id, body) => { await patch.promise; return { body: { ...fixtures.find(item => item.id === id), ...body } } }
    await card(page, 2).getByRole('button', { name: 'Resume' }).click()
    await card(page, 2).getByText('Live', { exact: true }).waitFor()
    await page.clock.runFor(30000)
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    assert.equal(state.gets, 2)
    assert.equal(await card(page, 2).getByText('Live', { exact: true }).count(), 1)
    patch.resolve()
    await page.waitForFunction(() => document.querySelector('[aria-label="Release 2"]').getAttribute('aria-busy') === 'false')
    const staleResponse = page.waitForResponse(response => response.url().endsWith('/api/releases'))
    stale.resolve()
    await staleResponse
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    assert.equal(await card(page, 2).getByText('Live', { exact: true }).count(), 1)
  })

  it('stacks mobile cards without overflow and stays capped on wide screens', async t => {
    const { page } = await open(t)
    await ready(page)
    assert.deepEqual(await checkLayout(page, page.getByRole('main')), [])
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      const rect = await page.getByRole('main').boundingBox()
      if (width === 1440) {
        assert.ok(rect.width <= 1120)
        assert.equal(rect.x, (width - rect.width) / 2)
      }
      const details = await card(page, 2).locator('dl').boundingBox()
      const heading = await card(page, 2).getByRole('heading').boundingBox()
      if (width < 768) assert.ok(details.y > heading.y + heading.height)
      await page.screenshot({ path: new URL(name + '-' + width + '.png', screenshots).pathname, fullPage: true })
    }
  })

  const row = (page, name) => page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: new RegExp('^' + name) }) })
  const cells = async locator => (await locator.locator('td').allTextContents()).map(text => text.trim())

  it('lists every device with its specs, how it was opened, its version and last seen', async t => {
    const { page } = await open(t)
    await ready(page)
    await page.getByRole('link', { name: 'Devices' }).click()
    await page.getByRole('table').waitFor()
    assert.equal(new URL(page.url()).hash, '#devices')
    assert.equal(await page.getByRole('link', { name: 'Devices' }).getAttribute('aria-current'), 'page')
    assert.equal(await page.getByText('3 devices · 2 installed').count(), 1)
    assert.deepEqual(await page.getByRole('columnheader').allTextContents(), ['Device', 'System', 'Browser', 'Screen', 'Hardware', 'Opened from', 'Country', 'Version', 'Last seen'])
    assert.deepEqual(await page.getByRole('rowheader').allTextContents(), ['Pixel 8a1b2c3d4', 'iPhoneb1b2c3d4', 'Unknownc1b2c3d4'])
    const pixel = await cells(row(page, 'Pixel 8')), iphone = await cells(row(page, 'iPhone')), other = await cells(row(page, 'Unknown'))
    assert.deepEqual(pixel.slice(0, 7), ['Android 15', 'Chrome 141', '412 × 915@2.63x', '8 cores · 8 GB RAM', 'Home Screen', 'Finlandfi-FI', 'Release 2Release 3 on next launch'])
    assert.match(pixel[7], /^5 minutes agoSince \w{3} \d+, \d{4}$/)
    assert.deepEqual(iphone.slice(2, 7), ['390 × 844@3x', '4 cores', 'BrowserAlso installed', 'Swedensv-SE', 'Release 5Beta'])
    assert.match(iphone[7], /^3 hours ago/)
    assert.deepEqual(other.slice(0, 7), ['Unknown', 'Unknown', 'Unknown', 'Unknown', 'Browser', 'Unknown', 'From networkRelease 2 on next launch'])
    assert.match(other[7], /^Just now/)
    assert.equal(await row(page, 'Pixel 8').locator('code').getAttribute('title'), 'a1b2c3d4-0000-4000-8000-000000000001')
    await page.goBack()
    await ready(page)
    assert.equal(await page.getByRole('table').count(), 0)
  })

  it('opens Devices from the URL and shows loading, error with retry, and empty states', async t => {
    const gate = deferred()
    const { page, state } = await open(t, { hash: '#devices', deviceList: async () => { await gate.promise; return { status: 500 } } })
    await page.getByRole('status').filter({ hasText: 'Loading devices…' }).waitFor()
    gate.resolve()
    await page.getByRole('alert').filter({ hasText: 'Could not load devices. Try again.' }).waitFor()
    state.deviceList = null
    state.devices = []
    await page.getByRole('button', { name: 'Refresh' }).click()
    await page.getByRole('heading', { name: 'No devices yet' }).waitFor()
    assert.equal(await page.getByRole('alert').count(), 0)
    state.devices = devices(Date.now()).slice(0, 1)
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await page.getByText('1 device · 1 installed').waitFor()
  })

  it('shows the device table without overflow at every width, as cards on small screens', async t => {
    const { page } = await open(t, { hash: '#devices' })
    await page.getByRole('table').waitFor()
    assert.deepEqual(await checkLayout(page, page.getByRole('main')), [])
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, width + ' px has no horizontal scroll')
      assert.equal(await page.getByRole('columnheader').first().isVisible(), width >= 1024)
      await page.screenshot({ path: new URL(name + '-devices-' + width + '.png', screenshots).pathname, fullPage: true })
    }
  })

  it('explains how it works in Docs, with the app domains, without overflow', async t => {
    const { page } = await open(t, { hash: '#docs' })
    await page.getByRole('heading', { name: 'How it works' }).waitFor()
    assert.equal(await page.getByRole('link', { name: 'Docs' }).getAttribute('aria-current'), 'page')
    await page.getByText('https://tf-beta.maxapp.dev').waitFor()
    assert.deepEqual(await checkLayout(page, page.getByRole('main')), [])
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await page.screenshot({ path: new URL(name + '-docs-' + width + '.png', screenshots).pathname, fullPage: true })
    }
  })
})
