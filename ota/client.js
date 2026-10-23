(() => {
  let failed = false;
  addEventListener('error', () => { failed = true; });
  if (window.Capacitor?.isNativePlatform?.() || !('serviceWorker' in navigator)) return; // apps: native.js

  const stateURL = '/appmachine/state';
  const releaseURL = id => `/appmachine/release/${id}`;
  const fileURL = (path, hash) => `/_ota/files/${hash}${path.match(/\.[^/.]+$/)?.[0] || ''}`;
  const save = (cache, state) => cache.put(stateURL, new Response(JSON.stringify(state)));
  const read = async cache => (await cache.match(stateURL))?.json();
  const started = (async () => {
    const cache = await caches.open('appmachine');
    let state = await read(cache);
    if (!state) {
      state = { device: crypto.randomUUID(), kept: null, trial: null, tries: 0, bad: [], reports: [] };
      await save(cache, state);
    }
    return state;
  })();
  started.catch(() => {});
  navigator.serviceWorker.register('/appmachine-sw.js', { scope: '/' }).catch(() => {});
  navigator.storage?.persist?.().catch(() => {});

  async function clean(cache, files, id) {
    const { files: kept } = await (await cache.match(releaseURL(id))).json();
    const urls = new Set(Object.entries(kept).map(([path, hash]) => new URL(fileURL(path, hash), location.origin).href));
    for (const request of await files.keys()) if (!urls.has(request.url)) await files.delete(request);
    for (const request of await cache.keys()) {
      if (new URL(request.url).pathname.startsWith('/appmachine/release/') &&
          request.url !== new URL(releaseURL(id), location.origin).href) await cache.delete(request);
    }
  }

  async function download(cache, files, release) {
    // 1. Authenticate the exact manifest bytes.
    const key = await crypto.subtle.importKey('jwk', APPMACHINE.publicKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const signature = Uint8Array.from(atob(release.signature), c => c.charCodeAt(0));
    if (!await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, new TextEncoder().encode(release.manifest))) throw Error('Invalid signature');

    // 2. Reuse content hashes and verify every file before activation.
    const manifest = JSON.parse(release.manifest);
    for (const [path, hash] of Object.entries(manifest.files)) {
      const url = fileURL(path, hash);
      const response = await files.match(url) || await fetch(url);
      if (!response.ok) throw Error('File unavailable');
      const bytes = await response.arrayBuffer();
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
      if (digest !== hash) {
        await files.delete(url);
        throw Error('Invalid file hash');
      }
      await files.put(url, new Response(bytes, { headers: { 'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream' } }));
    }

    // 3. Publish the complete trial only after all files are durable.
    await cache.put(releaseURL(release.id), new Response(release.manifest));
    const state = await read(cache);
    state.trial = release.id;
    state.tries = 0;
    state.reports.push({ release: release.id, state: 'downloaded' });
    await save(cache, state);
  }

  async function update() {
    // 1. Keep a trial only when this launch reached ready.
    const initial = await started;
    const cache = await caches.open('appmachine');
    const files = await caches.open('appmachine-files');
    let state = await read(cache);
    if (!failed && initial.trial && initial.tries > 0 && state.trial === initial.trial) {
      state.kept = state.trial;
      state.trial = null;
      state.tries = 0;
      state.reports.push({ release: state.kept, state: 'active' });
      await save(cache, state);
      await clean(cache, files, state.kept);
    }

    // 2. Flush queued reports (text/plain, as the apps send them); keep them when the network fails.
    if (state.reports.length) {
      const sent = state.reports.length;
      const response = await fetch('/_ota/report', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ device: state.device, reports: state.reports }) });
      if (!response.ok) throw Error('Report failed');
      state = await read(cache);
      state.reports.splice(0, sent);
      await save(cache, state);
    }

    // 3. Check for a release or a rollback with this launch's specs, then stage the next launch.
    const hints = await navigator.userAgentData?.getHighEntropyValues(['model', 'platformVersion']).catch(() => {}) || {};
    const query = new URLSearchParams({
      device: state.device, current: state.trial || state.kept || '', key: 'web', // a browser runs releases of every native key
      running: navigator.serviceWorker.controller && (initial.trial && initial.tries > 0 ? initial.trial : initial.kept) || '',
      screen: `${screen.width}x${screen.height}@${+devicePixelRatio.toFixed(2)}`,
      standalone: matchMedia('(display-mode: standalone)').matches || navigator.standalone ? '1' : '0',
      language: navigator.language || '', cores: navigator.hardwareConcurrency || '', memory: navigator.deviceMemory || '',
      model: hints.model || '', platform: hints.platformVersion || '',
    });
    const response = await fetch(`/_ota/check?${query}`, { cache: 'no-store' });
    if (response.status === 204) return;
    if (!response.ok) throw Error('Check failed');
    const release = await response.json();
    state = await read(cache);
    if (release.id === state.trial || state.bad.includes(release.id)) return;
    if (release.id === state.kept) {
      state.trial = null;
      state.tries = 0;
      await save(cache, state);
      return;
    }
    await download(cache, files, release);
  }

  addEventListener('load', () => setTimeout(() => update().catch(() => {}), 2000), { once: true });
})();
