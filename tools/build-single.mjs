// Builds ONE self-contained HTML file: JS, CSS, all PBR textures and 3D models embedded as data URIs.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
execSync('npx vite build', { cwd: ROOT, stdio: 'inherit', env: { ...process.env, SINGLE: '1' } });
const out = path.join(ROOT, 'dist-single');
let html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
const assetsDir = path.join(out, 'assets');
const files = fs.readdirSync(assetsDir);
const js = files.filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(assetsDir, f), 'utf8')).join('\n');
const css = files.filter((f) => f.endsWith('.css')).map((f) => fs.readFileSync(path.join(assetsDir, f), 'utf8')).join('\n');
const mime = { webp: 'image/webp', glb: 'model/gltf-binary', svg: 'image/svg+xml' };
const map = {};
for (const sub of ['textures', 'models']) {
  for (const f of fs.readdirSync(path.join(ROOT, 'public/assets', sub))) {
    const ext = f.split('.').pop();
    map[`${sub}/${f}`] = `data:${mime[ext] || 'application/octet-stream'};base64,` + fs.readFileSync(path.join(ROOT, 'public/assets', sub, f)).toString('base64');
  }
}
html = html.replace(/<script type="module"[^>]*src="[^"]*"><\/script>/g, '').replace(/<link rel="stylesheet"[^>]*href="\.\/assets\/[^"]*">/g, '')
  .replace(/<link rel="manifest"[^>]*>/, '').replace(/<link rel="icon"[^>]*>/, '').replace(/<link rel="modulepreload"[^>]*>/g, '');
const safe = (s) => s.replace(/<\/script/gi, '<\\/script');
html = html.replace('</head>', `<style>${css}</style>\n</head>`);
html = html.replace('</body>', `<script>window.__MH_ASSETS=${safe(JSON.stringify(map))};</script>\n<script type="module">${safe(js)}</script>\n</body>`);
const dest = path.join(ROOT, 'MetroHorror.html');
fs.writeFileSync(dest, html);
console.log('written', dest, (fs.statSync(dest).size / 1048576).toFixed(1) + ' MB', Object.keys(map).length, 'assets');
