#!/usr/bin/env node
import { webcrypto } from 'node:crypto';
import { readdir, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

const { subtle } = webcrypto;
const algorithm = { name: 'ECDSA', namedCurve: 'P-256' };
const signing = { name: 'ECDSA', hash: 'SHA-256' };
const publicJWK = ({ kty, crv, x, y }) => ({ kty, crv, x, y, ext: true, key_ops: ['verify'] });
const hash = async bytes => Buffer.from(await subtle.digest('SHA-256', bytes)).toString('hex');

async function request(path, options = {}) {
  const headers = { ...options.headers };
  for (const name of ['CF_ACCESS_CLIENT_ID', 'CF_ACCESS_CLIENT_SECRET']) {
    if (process.env[name]) headers[name === 'CF_ACCESS_CLIENT_ID' ? 'CF-Access-Client-Id' : 'CF-Access-Client-Secret'] = process.env[name];
  }
  const response = await fetch(new URL(path, process.env.MAXAPP_URL || 'https://maxapp.dev'), { ...options, headers, redirect: 'manual' });
  if (!response.ok) throw Error(`${options.method || 'GET'} ${path}: HTTP ${response.status}${response.status >= 300 && response.status < 400 ? ' (redirect; check Cloudflare Access credentials)' : ''}`);
  return response;
}

const json = (path, body) => request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function collect(dir, root = dir, files = new Map()) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) await collect(path, root, files);
    else if (entry.isFile()) files.set(relative(root, path).split('\\').join('/'), await readFile(path));
    else throw Error(`Unsupported bundle entry: ${path}`);
  }
  return files;
}

// Compatibility key: hash of Capacitor and its native plugins in node_modules; 'web' without Capacitor.
async function compatibilityKey() {
  const root = resolve('node_modules'), names = [], parts = [];
  for (const entry of await readdir(root).catch(() => [])) {
    if (entry.startsWith('@')) for (const name of await readdir(`${root}/${entry}`)) names.push(`${entry}/${name}`);
    else if (!entry.startsWith('.')) names.push(entry);
  }
  for (const name of names) {
    const pkg = JSON.parse(await readFile(`${root}/${name}/package.json`, 'utf8').catch(() => 'null'));
    if (pkg && (['@capacitor/core', '@capacitor/android', '@capacitor/ios'].includes(name) || pkg.capacitor?.android || pkg.capacitor?.ios)) parts.push(`${name}@${pkg.version}`);
  }
  if (!parts.some(part => part.startsWith('@capacitor/core@'))) return 'web';
  return (await hash(Buffer.from(parts.sort().join('\n')))).slice(0, 16);
}

// appmachine.js: the config, the PWA updater and the app updater.
async function updater(config) {
  const code = await Promise.all(['client.js', 'native.js'].map(name => readFile(new URL(`../ota/${name}`, import.meta.url), 'utf8')));
  return Buffer.from(`const APPMACHINE = ${JSON.stringify(config)};\n${code.join('\n')}`);
}

async function publish(args, extra = {}) {
  // 1. Validate publishing inputs before running the app build.
  const options = { channel: 'production', rollout: '100', dir: 'dist', ...extra };
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i].slice(2);
    if (!args[i].startsWith('--') || !Object.hasOwn(options, name) || !args[i + 1]) throw Error('Usage: appmachine ' + (extra.out ? 'bundle [--channel beta] [--dir dist] [--out www]' : 'publish [--channel beta] [--rollout 0–100] [--dir dist]'));
    options[name] = args[i + 1];
  }
  if (!['production', 'beta'].includes(options.channel)) throw Error('Channel must be production or beta');
  const rollout = Number(options.rollout);
  if (!/^\d+$/.test(options.rollout) || rollout > 100) throw Error('Rollout must be an integer from 0 to 100');
  if (!process.env.OTA_PRIVATE_KEY) throw Error('Missing OTA_PRIVATE_KEY (private JWK)');
  const privateJWK = JSON.parse(process.env.OTA_PRIVATE_KEY);
  const signingKey = await subtle.importKey('jwk', privateJWK, algorithm, false, ['sign']);
  const publicKey = publicJWK(privateJWK);
  const commit = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  execFileSync('npm', ['run', 'build', '--if-present'], { stdio: 'inherit' });

  // 2. Add the trusted updater in memory; leave the build folder untouched.
  const files = await collect(resolve(options.dir));
  const index = files.get('index.html')?.toString('utf8');
  if (!index || !/<head(?:\s[^>]*)?>/i.test(index)) throw Error('Bundle needs index.html with a <head>');
  files.set('index.html', Buffer.from(index.replace(/<head(?:\s[^>]*)?>/i, '$&<script src="/appmachine.js"></script>')));
  const key = await compatibilityKey();
  files.set('appmachine.js', await updater({ key, publicKey }));
  files.set('appmachine-sw.js', await readFile(new URL('../ota/sw.js', import.meta.url)));

  // 3. Sign the sorted file list and upload only missing content hashes.
  const hashes = Object.create(null);
  const contents = new Map();
  for (const path of [...files.keys()].sort()) {
    const bytes = files.get(path);
    hashes[path] = await hash(bytes);
    contents.set(hashes[path], bytes);
  }
  const manifest = JSON.stringify({ files: hashes });
  const signature = Buffer.from(await subtle.sign(signing, signingKey, Buffer.from(manifest))).toString('base64');
  const { missing } = await (await json('/api/files/missing', { hashes: [...contents.keys()] })).json();
  for (const digest of missing) {
    if (!contents.has(digest)) throw Error('Server requested an unknown hash');
    await request(`/api/files/${digest}`, { method: 'PUT', body: contents.get(digest) });
  }
  const release = await (await json('/api/releases', { channel: options.channel, key, manifest, signature, commit, rollout })).json();
  console.log(`Published release ${release.id} to ${options.channel} (${rollout}%, key ${key})`);
  return { id: release.id, files, key, publicKey, options };
}

async function bundle(args) {
  // 1. Publish the build's web app, so devices know the release it runs.
  if (!URL.canParse(process.env.APP_SERVER_URL || '')) throw Error('Missing or invalid APP_SERVER_URL');
  const server = process.env.APP_SERVER_URL.replace(/\/$/, '');
  const { id, files, key, publicKey, options } = await publish(args, { out: 'www' });

  // 2. Write it with the app config to the app's web folder.
  files.set('appmachine.js', await updater({ key, publicKey, server, bundled: id }));
  const out = resolve(options.out);
  await rm(out, { recursive: true, force: true });
  for (const [path, bytes] of files) {
    await mkdir(dirname(`${out}/${path}`), { recursive: true });
    await writeFile(`${out}/${path}`, bytes);
  }
  console.log(`Bundled release ${id} into ${options.out}`);
}

try {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'keygen' && !args.length) {
    const pair = await subtle.generateKey(algorithm, true, ['sign', 'verify']);
    console.log(JSON.stringify({ OTA_PRIVATE_KEY: await subtle.exportKey('jwk', pair.privateKey), APP_PUBLIC_KEY: await subtle.exportKey('jwk', pair.publicKey) }, null, 2));
  } else if (command === 'publish') await publish(args);
  else if (command === 'bundle') await bundle(args);
  else if (command === 'key' && !args.length) console.log(await compatibilityKey());
  else throw Error('Usage: appmachine keygen | key | publish [--channel beta] [--rollout 0–100] [--dir dist] | bundle [--channel beta] [--dir dist] [--out www]');
} catch (error) {
  console.error(`appmachine: ${error.message}`);
  process.exitCode = 1;
}
