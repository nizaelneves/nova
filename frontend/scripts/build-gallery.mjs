// Builds the animation gallery (gallery.html) and folds its script and styles into one HTML file: ../docs/phibe-animations.html
// Run from the frontend folder:  npm run gallery
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.resolve(root, '..', '.gallery-build');
const entry = process.argv[2] ?? 'gallery'; // 'gallery' (all animations) or 'refine' (orb tuning)
const outName = entry === 'gallery' ? 'phibe-animations.html' : 'phibe-orb-refine.html';
execSync('npx vite build --config vite.gallery.config.ts', { cwd: root, stdio: 'inherit', env: { ...process.env, GALLERY_ENTRY: `${entry}.html` } });

let html = readFileSync(path.join(out, `${entry}.html`), 'utf8');
const read = (href) => readFileSync(path.join(out, href.replace(/^\.?\//, '')), 'utf8');
html = html.replace(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_, href) => `<style>${read(href)}</style>`);
const scripts = [];
html = html.replace(/<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, src) => { scripts.push(read(src)); return ''; });
html = html.replace(/<link[^>]*rel="modulepreload"[^>]*>/g, '');
const bundle = scripts.join('\n').replace(/<\/script/gi, '<\\/script');
html = html.replace('</body>', () => `<script>${bundle}</script>\n</body>`); // a function: `$&` and `$'` inside the bundle must not be read as replacement patterns
const target = path.resolve(root, '..', 'docs', outName);
writeFileSync(target, html);
if (existsSync(out) && readdirSync(out).length >= 0) rmSync(out, { recursive: true, force: true });
console.log(`wrote ${target} (${(html.length / 1024).toFixed(0)} KB)`);
