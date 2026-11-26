import { build } from 'esbuild';
import fs from 'node:fs';
const res = await build({ entryPoints: ['src/main.js'], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020', legalComments: 'none' });
let js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const A = {};
for (const f of fs.readdirSync('assets')) { if (f.includes('_raw')) continue; A[f] = fs.readFileSync('assets/' + f).toString('base64'); }
const dr = 'node_modules/three/examples/jsm/libs/draco/gltf/';
A['draco_wasm_wrapper.js'] = fs.readFileSync(dr + 'draco_wasm_wrapper.js').toString('base64');
A['draco_decoder.wasm'] = fs.readFileSync(dr + 'draco_decoder.wasm').toString('base64');
let html = fs.readFileSync('src/index.html', 'utf8');
html = html.replace('<!--ASSETS-->', () => '<script>window.__ASSETS=' + JSON.stringify(A) + ';</script>').replace('<!--APP-->', () => '<script>' + js + '</script>');
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/HorizonDrive.html', html);
console.log('JS', (js.length / 1024).toFixed(0) + 'KB', 'HTML', (html.length / 1048576).toFixed(2) + 'MB');
