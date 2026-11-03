// Marca con una versión (?v=...) los CSS y JS que carga la página, para que el navegador no mezcle archivos viejos con nuevos
// después de una publicación. Se corre en la publicación (GitHub Actions) sobre una COPIA de public/; el repositorio no se modifica.
// Uso: node scripts/versionar.mjs <carpeta> <version>
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** HTML: <link href="css/x.css"> y <script src="js/app.js"> (también ../css, vendor/…). */
export function versionarHtml(texto, version) {
  return texto.replace(/\b(href|src)="((?:\.\.\/)*(?:css|js|vendor)\/[^"?#]+\.(?:css|js))"/g, `$1="$2?v=${version}"`);
}

/** JS (módulos): from './x.js' e import('./x.js'). */
export function versionarJs(texto, version) {
  return texto.replace(/(\bfrom\s+|\bimport\(\s*)(['"])(\.{1,2}\/[^'"?]+\.js)\2/g, `$1$2$3?v=${version}$2`);
}

async function* archivos(dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) yield* archivos(ruta);
    else yield ruta;
  }
}

export async function versionarCarpeta(carpeta, version) {
  let n = 0;
  for await (const f of archivos(carpeta)) {
    const rel = path.relative(carpeta, f).split(path.sep);
    const esVendor = rel[0] === 'vendor';
    const ext = path.extname(f);
    if (esVendor || !['.html', '.js'].includes(ext)) continue;
    const orig = await fs.readFile(f, 'utf8');
    const nuevo = ext === '.html' ? versionarHtml(orig, version) : versionarJs(orig, version);
    if (nuevo !== orig) { await fs.writeFile(f, nuevo); n++; }
  }
  return n;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [carpeta, version] = process.argv.slice(2);
  if (!carpeta || !/^[A-Za-z0-9._-]{4,}$/.test(version ?? '')) { console.error('Uso: node scripts/versionar.mjs <carpeta> <version>'); process.exit(1); }
  console.log(`Versionados ${await versionarCarpeta(carpeta, version)} archivos con ?v=${version}`);
}
