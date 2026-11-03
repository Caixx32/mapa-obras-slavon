import test from 'node:test';
import assert from 'node:assert/strict';
import { versionarHtml, versionarJs } from './versionar.mjs';

test('versionar: HTML marca css y js propios, no fuentes ni imágenes', () => {
  const html = '<link rel="stylesheet" href="css/styles.css"><script src="vendor/leaflet/leaflet.js"></script><script type="module" src="js/app.js"></script><img src="img/og.png"><link rel="preload" href="fonts/a.woff2">';
  const r = versionarHtml(html, 'abc1234');
  assert.ok(r.includes('href="css/styles.css?v=abc1234"'));
  assert.ok(r.includes('src="vendor/leaflet/leaflet.js?v=abc1234"'));
  assert.ok(r.includes('src="js/app.js?v=abc1234"'));
  assert.ok(r.includes('src="img/og.png"') && r.includes('href="fonts/a.woff2"'));
});

test('versionar: los módulos JS se importan siempre con la misma versión', () => {
  const js = "import { a } from './logica.js';\nimport {b} from \"./mapa.js\";\nconst m = await import('./x.js');\nimport 'https://cdn/x.js';";
  const r = versionarJs(js, 'v9');
  assert.ok(r.includes("from './logica.js?v=v9'") && r.includes('from "./mapa.js?v=v9"') && r.includes("import('./x.js?v=v9')"));
  assert.ok(r.includes("import 'https://cdn/x.js';"));
  assert.equal(versionarJs(r, 'v9'), r, 'no duplica la marca si ya la tiene');
});
