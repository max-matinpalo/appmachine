(() => {
  const cap = window.Capacitor;
  if (!cap?.isNativePlatform?.()) return;
  let failed = false;
  addEventListener('error', () => { failed = true; });

  // Capacitor's Filesystem plugin and its built-in WebView plugin, without @capacitor/core in the page.
  const call = (plugin, method, options = {}) => cap.nativePromise(plugin, method, options);
  const fs = (method, options) => call('Filesystem', method, { directory: 'DATA', ...options });
  const area = cap.getPlatform() === 'ios'
    ? { directory: 'LIBRARY', root: 'NoCloud/ionic_built_snapshots' } // where iOS reopens a kept path
    : { directory: 'DATA', root: 'appmachine/releases' };
  const folder = id => `${area.root}/${id}`;
  const stateFile = 'appmachine/state.json';
  const manifestFile = id => `appmachine/manifests/${id}.json`;
  const fileURL = (server, path, hash) => `${server}/_ota/files/${hash}${path.match(/\.[^/.]+$/)?.[0] || ''}`;
  const read = async path => JSON.parse((await fs('readFile', { path, encoding: 'utf8' })).data);
  const write = (path, value) => fs('writeFile', { path, data: JSON.stringify(value), encoding: 'utf8', recursive: true });
  const names = async (path, directory) => ((await fs('readdir', { path, directory }).catch(() => ({ files: [] }))).files).map(f => f.name ?? f);
  const hex = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
  const base64 = bytes => {
    let text = '';
    for (let i = 0; i < bytes.length; i += 32768) text += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(text);
  };

  // Delete release folders and manifests except `keep`.
  async function clean(keep) {
    for (const name of await names(area.root, area.directory)) {
      if (name !== String(keep)) await fs('rmdir', { path: folder(name), directory: area.directory, recursive: true }).catch(() => {});
    }
    for (const name of await names('appmachine/manifests')) {
      if (name !== `${keep}.json`) await fs('deleteFile', { path: `appmachine/manifests/${name}` }).catch(() => {});
    }
  }

  const started = (async () => {
    // 1. A store build's bundled files carry its config; a new build starts a fresh state.
    let state = await read(stateFile).catch(() => null);
    if (APPMACHINE.bundled && state?.build !== APPMACHINE.bundled) {
      await clean(null);
      const { server, key, bundled } = APPMACHINE;
      state = { device: state?.device || crypto.randomUUID(), build: bundled, server, key, kept: null, trial: null, tries: 0, bad: [], reports: [] };
      await write(stateFile, state);
    }
    if (!state) throw Error('No updater state');

    // 2. The running release: the bundled one, else the folder Capacitor serves.
    const { path } = await call('WebView', 'getServerBasePath');
    const running = APPMACHINE.bundled ? state.build : Number(path.split('/').filter(Boolean).pop()) || null;

    // 3. Start a pending trial; after 2 launches without ready it failed.
    if (state.trial && running !== state.trial) {
      state.tries++;
      if (state.tries > 2) {
        state.reports.push({ release: state.trial, state: 'failed' });
        state.bad.push(state.trial);
        state.trial = null;
        state.tries = 0;
      }
      await write(stateFile, state);
      if (state.trial) {
        const { uri } = await fs('getUri', { path: folder(state.trial), directory: area.directory });
        await call('WebView', 'setServerBasePath', { path: decodeURIComponent(uri.replace(/^file:\/\//, '')) });
        return new Promise(() => {}); // the page reloads into the trial
      }
    }
    return running;
  })();
  started.catch(() => {});

  async function download(state, release) {
    // 1. Authenticate the exact manifest bytes.
    const key = await crypto.subtle.importKey('jwk', APPMACHINE.publicKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const signature = Uint8Array.from(atob(release.signature), c => c.charCodeAt(0));
    if (!await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, new TextEncoder().encode(release.manifest))) throw Error('Invalid signature');

    // 2. Fill the release folder: copy files the kept release has, fetch and verify the rest.
    const { files } = JSON.parse(release.manifest);
    const kept = state.kept ? (await read(manifestFile(state.kept)).catch(() => ({ files: {} }))).files : {};
    const have = new Map(Object.entries(kept).map(([path, hash]) => [hash, path]));
    const target = folder(release.id), directory = area.directory;
    await fs('rmdir', { path: target, directory, recursive: true }).catch(() => {});
    for (const [path, hash] of Object.entries(files)) {
      if (have.has(hash)) {
        const parent = `${target}/${path}`.split('/').slice(0, -1).join('/');
        await fs('mkdir', { path: parent, directory, recursive: true }).catch(() => {});
        await fs('copy', { from: `${folder(state.kept)}/${have.get(hash)}`, to: `${target}/${path}`, directory, toDirectory: directory });
        continue;
      }
      const response = await fetch(fileURL(state.server, path, hash));
      if (!response.ok) throw Error('File unavailable');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (await hex(bytes) !== hash) throw Error('Invalid file hash');
      await fs('writeFile', { path: `${target}/${path}`, data: base64(bytes), directory, recursive: true });
    }

    // 3. Stage the complete trial only after all files are written.
    await write(manifestFile(release.id), { files });
    state.trial = release.id;
    state.tries = 0;
    state.reports.push({ release: release.id, state: 'downloaded' });
    await write(stateFile, state);
  }

  async function update() {
    // 1. Keep a trial that reached ready: Capacitor reopens it on later launches.
    const running = await started;
    const state = await read(stateFile);
    if (!failed && state.trial && running === state.trial) {
      await call('WebView', 'persistServerBasePath');
      state.kept = state.trial;
      state.trial = null;
      state.tries = 0;
      state.reports.push({ release: state.kept, state: 'active' });
      await write(stateFile, state);
      await clean(state.kept);
    }

    // 2. Flush queued reports as text/plain: a simple cross-origin request.
    if (state.reports.length) {
      const sent = state.reports.length;
      const response = await fetch(`${state.server}/_ota/report`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ device: state.device, reports: state.reports }) });
      if (!response.ok) throw Error('Report failed');
      state.reports.splice(0, sent);
      await write(stateFile, state);
    }

    // 3. Check for a release or a rollback, then stage it for the next launch.
    const kept = state.kept ?? state.build;
    const query = new URLSearchParams({
      device: state.device, current: state.trial || kept || '', key: state.key, running: running || '',
      screen: `${screen.width}x${screen.height}@${+devicePixelRatio.toFixed(2)}`, standalone: '1',
      language: navigator.language || '', cores: navigator.hardwareConcurrency || '', memory: navigator.deviceMemory || '',
    });
    const response = await fetch(`${state.server}/_ota/check?${query}`, { cache: 'no-store' });
    if (response.status === 204) return;
    if (!response.ok) throw Error('Check failed');
    const release = await response.json();
    if (release.id === state.trial || state.bad.includes(release.id)) return;
    if (release.id === kept) {
      if (!state.trial) return;
      state.trial = null;
      state.tries = 0;
      await write(stateFile, state);
      return;
    }
    await download(state, release);
  }

  addEventListener('load', () => setTimeout(() => update().catch(() => {}), 2000), { once: true });
})();
