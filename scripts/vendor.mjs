#!/usr/bin/env node
// Copia las librerías del mapa y la tipografía Montserrat desde node_modules a public/ (se sirven desde el propio sitio:
// sin CDNs ni Google Fonts, más rápido y sin enviar datos de los visitantes a terceros).
import fs from 'node:fs/promises';
import path from 'node:path';
import { RAIZ } from './lib/util.mjs';

const nm = (...p) => path.join(RAIZ, 'node_modules', ...p);
const pub = (...p) => path.join(RAIZ, 'public', ...p);
const copiar = async (desde, hasta) => {
  await fs.mkdir(path.dirname(hasta), { recursive: true });
  await fs.copyFile(desde, hasta);
};

await copiar(nm('leaflet', 'dist', 'leaflet.js'), pub('vendor', 'leaflet', 'leaflet.js'));
await copiar(nm('leaflet', 'dist', 'leaflet.css'), pub('vendor', 'leaflet', 'leaflet.css'));
for (const f of await fs.readdir(nm('leaflet', 'dist', 'images'))) await copiar(nm('leaflet', 'dist', 'images', f), pub('vendor', 'leaflet', 'images', f));
for (const f of ['leaflet.markercluster.js', 'MarkerCluster.css']) await copiar(nm('leaflet.markercluster', 'dist', f), pub('vendor', 'markercluster', f));
for (const peso of [600, 700, 800, 900]) {
  const f = `montserrat-latin-${peso}-normal.woff2`;
  await copiar(nm('@fontsource', 'montserrat', 'files', f), pub('fonts', f));
}
await copiar(nm('@fontsource', 'montserrat', 'LICENSE'), pub('fonts', 'LICENSE-Montserrat-OFL.txt'));
await copiar(nm('leaflet', 'LICENSE'), pub('vendor', 'leaflet', 'LICENSE'));
await copiar(nm('leaflet.markercluster', 'MIT-LICENCE.txt'), pub('vendor', 'markercluster', 'MIT-LICENCE.txt')).catch(() => {});
console.log('✔ public/vendor y public/fonts actualizados');
