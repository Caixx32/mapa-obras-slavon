// Punto de entrada de la publicación automática (GitHub Actions). Uso: node scripts/ci-sheet.mjs --modo=poll|nocturno|manual|push
// Sin la clave de Google (secret GOOGLE_SA_KEY) funciona como antes: publica lo que hay en public/.
import fs from 'node:fs/promises';
import path from 'node:path';
import { RAIZ } from './lib/util.mjs';
import { ClienteGoogle, AlmacenGoogle } from './lib/google.mjs';
import { ejecutar } from './lib/publicador.mjs';
import { versionarCarpeta } from './versionar.mjs';

const modo = process.argv.find((a) => a.startsWith('--modo='))?.slice(7) ?? 'manual';
const salir = async (publicar, texto) => {
  console.log(texto);
  if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `publicar=${publicar}\n`);
};

try {
  if (!process.env.GOOGLE_SA_KEY) {
    console.log('Sin clave de Google: se publica lo que hay en public/ (modo anterior).');
    const salida = path.join(RAIZ, '_site');
    await fs.rm(salida, { recursive: true, force: true });
    await fs.cp(path.join(RAIZ, 'public'), salida, { recursive: true });
    if (process.env.GITHUB_SHA) await versionarCarpeta(salida, process.env.GITHUB_SHA);
    await salir(['manual', 'push'].includes(modo), `Modo ${modo}: ${['manual', 'push'].includes(modo) ? 'se publica' : 'no se publica'}.`);
  } else {
    const almacen = await new AlmacenGoogle(new ClienteGoogle(process.env.GOOGLE_SA_KEY)).iniciar();
    const sitio = process.env.SITIO_URL ?? `https://${(process.env.GITHUB_REPOSITORY ?? 'Caixx32/mapa-obras-slavon').split('/').join('.github.io/')}`;
    const huellaPublicada = async () => {
      try { const r = await fetch(`${sitio}/data/version.json`, { headers: { 'cache-control': 'no-cache' } }); return r.ok ? (await r.json()).huella : null; } catch { return null; }
    };
    const r = await ejecutar({ almacen, modo, huellaPublicada });
    await salir(r.publicar, `Modo ${modo}: ${r.motivo}.`);
  }
} catch (e) {
  console.error(`ERROR: ${e.message}`);
  process.exitCode = 1;
}
