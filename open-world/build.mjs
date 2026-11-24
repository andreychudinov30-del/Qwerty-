// Builds ONE self-contained HTML file (JS, CSS, textures, models embedded) -> ../ObratnayaStoronaGoroda.html
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
const DIR = path.dirname(new URL(import.meta.url).pathname);
execSync('npx vite build --config vite.config.js', { cwd: DIR, stdio: 'inherit' });
const out = path.join(DIR, 'dist');
let html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
const assets = path.join(out, 'assets');
const files = fs.existsSync(assets) ? fs.readdirSync(assets) : [];
const js = files.filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(assets, f), 'utf8')).join('\n');
html = html.replace(/<script type="module"[^>]*src="[^"]*"><\/script>/g, '').replace(/<link rel="modulepreload"[^>]*>/g, '');
const safe = (s) => s.replace(/<\/script/gi, '<\\/script');
html = html.replace('</body>', () => `<script type="module">${safe(js)}</script>\n</body>`);
const dest = path.join(DIR, '..', 'ObratnayaStoronaGoroda.html');
fs.writeFileSync(dest, html);
console.log('written', dest, (fs.statSync(dest).size / 1048576).toFixed(1) + ' MB');
