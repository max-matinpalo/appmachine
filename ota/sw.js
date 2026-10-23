(() => {
  let launch = Promise.resolve();
  addEventListener('install', event => event.waitUntil(self.skipWaiting()));
  addEventListener('activate', event => event.waitUntil(self.clients.claim()));

  async function serve(request, navigation) {
    // 1. Count trial launches and fall back after two failed starts.
    const cache = await caches.open('appmachine');
    const state = await (await cache.match('/appmachine/state'))?.json();
    if (!state) return fetch(request);
    if (navigation && state.trial) {
      state.tries++;
      if (state.tries > 2) {
        state.reports.push({ release: state.trial, state: 'failed' });
        state.bad.push(state.trial);
        state.trial = null;
        state.tries = 0;
      }
      await cache.put('/appmachine/state', new Response(JSON.stringify(state)));
    }

    // 2. Resolve paths inside the running release, including SPA launches.
    const id = state.trial && state.tries > 0 ? state.trial : state.kept;
    const manifest = id && await cache.match(`/appmachine/release/${id}`);
    if (!manifest) return fetch(request);
    const { files } = await manifest.json();
    let path = decodeURIComponent(new URL(request.url).pathname).slice(1);
    if (!path || path.endsWith('/')) path += 'index.html';
    if (!Object.hasOwn(files, path) && navigation) path = 'index.html';
    if (!Object.hasOwn(files, path)) return fetch(request);

    // 3. Keep the requested URL while serving the verified cached bytes.
    const ext = path.match(/\.[^/.]+$/)?.[0] || '';
    const response = await (await caches.open('appmachine-files')).match(`/_ota/files/${files[path]}${ext}`);
    return response ? new Response(await response.arrayBuffer(), { headers: { 'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream' } }) : fetch(request);
  }

  addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/_ota/')) return;
    if (event.request.mode === 'navigate') {
      const response = launch.then(() => serve(event.request, true));
      launch = response.then(() => {}, () => {});
      event.respondWith(response);
    } else event.respondWith(launch.then(() => serve(event.request, false)));
  });
})();
