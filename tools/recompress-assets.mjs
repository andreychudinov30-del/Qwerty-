// Re-encodes cached Poly Haven originals (.asset-cache) with tuned WebP quality to shrink the single-file build.
// Usage: node tools/recompress-assets.mjs [texSize=1024] [diffQ=76] [norQ=84] [armQ=72] [modelTex=512] [modelQ=76] [meshRatio=0.5]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [texSize = 1024, diffQ = 76, norQ = 84, armQ = 72, modelTex = 512, modelQ = 76, simplifyRatio = 0.5] = process.argv.slice(2).map(Number);
const TMP = path.join(ROOT, '.asset-cache');
const bin = path.join(ROOT, 'node_modules/.bin/gltf-transform');
let tb = 0;
for (const f of fs.readdirSync(path.join(TMP, 'tex'))) {
  const m = f.match(/^(.*)_(diff|nor|arm)\.jpg$/); if (!m) continue;
  const q = { diff: diffQ, nor: norQ, arm: armQ }[m[2]];
  const out = path.join(ROOT, 'public/assets/textures', `${m[1]}_${m[2]}.webp`);
  await sharp(path.join(TMP, 'tex', f)).resize(texSize, texSize, { fit: 'inside' }).webp({ quality: q, effort: 6, smartSubsample: true }).toFile(out);
  tb += fs.statSync(out).size;
}
console.log('textures', (tb / 1048576).toFixed(2), 'MB');
let mb = 0;
for (const f of fs.readdirSync(path.join(ROOT, 'public/assets/models'))) {
  const id = f.replace('.glb', '');
  if (id === 'Soldier') { mb += fs.statSync(path.join(ROOT, 'public/assets/models', f)).size; continue; }
  const dir = path.join(TMP, 'models', id);
  const src = path.join(dir, `${id}.gltf`);
  if (!fs.existsSync(src)) { console.warn('no source for', id); mb += fs.statSync(path.join(ROOT, 'public/assets/models', f)).size; continue; }
  const a = path.join(dir, 'r1.glb'), b = path.join(dir, 'r2.glb'), c = path.join(dir, 'r3.glb');
  const run = (...args) => execFileSync(bin, args, { stdio: 'pipe' });
  run('resize', src, a, '--width', String(modelTex), '--height', String(modelTex));
  run('webp', a, b, '--quality', String(modelQ));
  const b2 = path.join(dir, 'r2s.glb');
  run('simplify', b, b2, '--ratio', String(simplifyRatio), '--error', '0.01');
  run('optimize', b2, c, '--compress', 'meshopt', '--texture-compress', 'false', '--simplify', 'false', '--instance', 'false', '--flatten', 'true', '--join', 'true', '--palette', 'true');
  const out = path.join(ROOT, 'public/assets/models', f);
  fs.copyFileSync(c, out);
  mb += fs.statSync(out).size;
}
console.log('models', (mb / 1048576).toFixed(2), 'MB');
