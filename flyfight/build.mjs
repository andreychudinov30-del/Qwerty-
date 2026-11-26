import * as esbuild from 'esbuild';
import fs from 'fs';
const watch = process.argv.includes('--watch');
async function build() {
  const r = await esbuild.build({
    entryPoints: ['src/main.js'], bundle: true, minify: !process.env.DEV, format: 'iife',
    target: 'es2020', write: false, legalComments: 'none',
  });
  const js = r.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
  const tpl = fs.readFileSync('src/index.html', 'utf8');
  const css = fs.readFileSync('src/styles.css', 'utf8');
  const out = tpl.replace('/*CSS*/', () => css).replace('/*JS*/', () => js);
  fs.mkdirSync('dist', { recursive: true });
  fs.writeFileSync('dist/FlyFight.html', out);
  console.log('built', (out.length / 1024).toFixed(0), 'KB');
}
await build();
