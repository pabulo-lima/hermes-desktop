// Asserts da validação do save-settings (lista branca, URL, destino SSH), no esquema do check-split.
import assert from 'node:assert';
import { build } from 'esbuild';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist', '_settings-check.mjs');
await build({
  entryPoints: [path.join(root, 'src', 'main', 'settings.ts')],
  bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent',
  plugins: [{ name: 'stub-electron', setup(b) {
    b.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'export const app = { getPath: () => "/tmp" }; export const safeStorage = { isEncryptionAvailable: () => false };' }));
  } }],
});
const { sanitizePatch, sshDest } = await import(pathToFileURL(out).href);
rmSync(out, { force: true });

const cur = { vpsHost: '', vpsUser: 'root' };
const p = sanitizePatch({ voiceServerDir: '/tmp/evil', autoStart: true, bridgeUrl: 'http://127.0.0.1:8642/' }, cur);
assert.deepStrictEqual(p, { bridgeUrl: 'http://127.0.0.1:8642' }); // chaves fora da lista caem
assert.throws(() => sanitizePatch({ bridgeUrl: 'http://evil.com:8642' }, cur));
assert.throws(() => sanitizePatch({ bridgeUrl: 'file:///c:/x' }, cur));
assert.ok(sanitizePatch({ bridgeUrl: 'https://h.example', vpsHost: '203.0.113.10' }, cur).bridgeUrl);
assert.throws(() => sanitizePatch({ vpsUser: '-oProxyCommand=calc' }, cur));
assert.throws(() => sanitizePatch({ vpsHost: '-oProxyCommand=calc' }, cur));
assert.strictEqual(sanitizePatch({ bridgeToken: '' }, cur).bridgeToken, undefined); // vazio = manter
assert.strictEqual(sanitizePatch({ bridgeTokenClear: true }, cur).bridgeToken, '');
assert.throws(() => sshDest({ vpsUser: '-oX', vpsHost: 'h' }));
assert.strictEqual(sshDest({ vpsUser: 'root', vpsHost: 'h.example' }), 'root@h.example');
console.log('check-settings ok');
