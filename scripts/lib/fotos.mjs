// Fotos: lee fotos/<id>-<nombre>/, optimiza a WebP (1600 px + miniatura 400 px), sin metadatos (EXIF/GPS).
//  - Archivos con «_privada» en el nombre y fotos de obras con publicar = no → solo versión interna.
//  - Los archivos de salida se llaman por hash (no revelan el nombre original) y se limpian los que sobran.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { pad4, slug } from './util.mjs';

export const ANCHO_MAX = 1600;
export const ANCHO_MINIATURA = 400;
const CALIDAD = 78;
const CALIDAD_MINI = 72;
const VERSION_PROCESO = `v1-${ANCHO_MAX}-${ANCHO_MINIATURA}-${CALIDAD}-${CALIDAD_MINI}`;
const EXT_OK = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.avif']);
const EXT_NO_SOPORTADA = new Set(['.heic', '.heif']);
const EXT_VIDEO = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm']);
const naturalmente = (a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });

export const esPrivada = (nombreArchivo) => /_privada/i.test(nombreArchivo);

async function existe(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Devuelve Map id → [{archivo, ruta, privada}] y avisos. */
export async function escanear(dirFotos) {
  const porId = new Map();
  const avisos = [];
  if (!(await existe(dirFotos))) return { porId, avisos };
  for (const d of (await fs.readdir(dirFotos, { withFileTypes: true })).filter((e) => e.isDirectory())) {
    const m = d.name.match(/^(\d{1,5})(?:[-_ ].*)?$/);
    if (!m) {
      avisos.push(`fotos/${d.name}: el nombre de la carpeta tiene que empezar con el id de la obra (ej. 0023-club-los-pinos); se ignora`);
      continue;
    }
    const id = pad4(m[1]);
    const lista = porId.get(id) ?? [];
    for (const f of (await fs.readdir(path.join(dirFotos, d.name), { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name).sort(naturalmente)) {
      const ext = path.extname(f).toLowerCase();
      if (f.startsWith('.') || f.startsWith('~$')) continue;
      if (EXT_NO_SOPORTADA.has(ext)) avisos.push(`fotos/${d.name}/${f}: HEIC/HEIF no está soportado; exportala como JPG`);
      else if (EXT_VIDEO.has(ext)) avisos.push(`fotos/${d.name}/${f}: los videos no se procesan; usá la columna video_url`);
      else if (EXT_OK.has(ext)) lista.push({ archivo: f, ruta: path.join(dirFotos, d.name, f), privada: esPrivada(f) });
    }
    porId.set(id, lista);
  }
  return { porId, avisos };
}

/** Crea fotos/<id>-<nombre>-<ciudad>/ para las obras que todavía no tienen carpeta. */
export async function crearCarpetas(dirFotos, obras) {
  await fs.mkdir(dirFotos, { recursive: true });
  const existentes = new Set();
  for (const d of await fs.readdir(dirFotos, { withFileTypes: true })) {
    const m = d.isDirectory() && d.name.match(/^(\d{1,5})(?:[-_ ].*)?$/);
    if (m) existentes.add(pad4(m[1]));
  }
  let creadas = 0;
  for (const o of obras.filter((x) => x.publicar && !existentes.has(x.id))) {
    const nombre = slug(o.nombre_club || o.cliente_interno || o.deporte) || o.deporte;
    const ciudad = slug(o.ciudad || o.provincia || '');
    await fs.mkdir(path.join(dirFotos, [o.id, nombre, ciudad].filter(Boolean).join('-')), { recursive: true });
    creadas++;
  }
  return creadas;
}

async function optimizar(buf, destDir, hash) {
  const principal = path.join(destDir, `${hash}.webp`);
  const mini = path.join(destDir, `${hash}-t.webp`);
  if ((await existe(principal)) && (await existe(mini))) return false;
  await fs.mkdir(destDir, { recursive: true });
  // .rotate() aplica la orientación EXIF y sharp descarta todos los metadatos (incluida la ubicación GPS).
  const base = () => sharp(buf, { failOn: 'none' }).rotate();
  await base().resize({ width: ANCHO_MAX, height: ANCHO_MAX, fit: 'inside', withoutEnlargement: true }).webp({ quality: CALIDAD }).toFile(principal);   // 1600 px en el lado más largo: una foto vertical no pesa el doble
  await base().resize({ width: ANCHO_MINIATURA, withoutEnlargement: true }).webp({ quality: CALIDAD_MINI }).toFile(mini);
  return true;
}

/**
 * Sincroniza una carpeta de salida con lo que se acaba de generar.
 *  - Obras que ya no corresponden (borradas de la planilla / ya no publicables): se borra su carpeta.
 *  - Obras CON carpeta de origen en fotos/: se borra lo que sobra (ej. una foto que pasó a _privada).
 *  - Obras SIN carpeta de origen (ej. otra computadora sin las fotos originales): NO se toca nada
 *    y se devuelven los archivos existentes para que sigan figurando en el JSON.
 */
async function sincronizar(dirRaiz, esperados /* Map id → Set(nombres) */, idsConOrigen, esValida) {
  const conservadas = new Map(); // id → [hash, …]
  let borrados = 0;
  if (!(await existe(dirRaiz))) return { borrados, conservadas };
  for (const d of await fs.readdir(dirRaiz, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const p = path.join(dirRaiz, d.name);
    if (!esValida(d.name)) {
      await fs.rm(p, { recursive: true, force: true });
      borrados++;
    } else if (idsConOrigen.has(d.name)) {
      const esp = esperados.get(d.name) ?? new Set();
      for (const f of await fs.readdir(p)) {
        if (!esp.has(f)) {
          await fs.rm(path.join(p, f), { force: true });
          borrados++;
        }
      }
      if (!esp.size) await fs.rm(p, { recursive: true, force: true });
    } else {
      const hashes = (await fs.readdir(p)).filter((f) => f.endsWith('.webp') && !f.endsWith('-t.webp')).map((f) => f.slice(0, -5)).sort();
      if (hashes.length) conservadas.set(d.name, hashes);
    }
  }
  return { borrados, conservadas };
}

async function enParalelo(items, n, fn) {
  const cola = [...items];
  await Promise.all(
    Array.from({ length: Math.min(n, cola.length) }, async () => {
      while (cola.length) await fn(cola.shift());
    }),
  );
}

/**
 * @param obras      obras validadas (con .id y .publicar)
 * @param dirs       { fotos, publico, internas }  (internas = data/fotos-internas)
 * @returns { publicas: Map id→[{src,thumb}], internas: Map id→[{src,thumb,privada}], stats, avisos }
 *   src/thumb de `publicas` son relativos a public/ ; los de `internas` son relativos a la raíz del repo.
 */
export async function procesarFotos(obras, dirs, relPublico = 'public', relInternas = 'data/fotos-internas') {
  const { porId, avisos } = await escanear(dirs.fotos);
  const obraPorId = new Map(obras.map((o) => [o.id, o]));
  const publicas = new Map();
  const internas = new Map();
  const espPub = new Map();
  const espInt = new Map();
  const stats = { leidas: 0, nuevas: 0, privadas: 0, errores: 0 };
  const trabajos = [];

  for (const [id, lista] of porId) {
    const o = obraPorId.get(id);
    if (!o) {
      if (lista.length) avisos.push(`fotos/${id}-…: no existe una obra con id ${id} en la planilla; se ignoran ${lista.length} foto(s)`);
      continue;
    }
    for (const f of lista) trabajos.push({ id, f, o });
  }
  const resultados = new Map();
  await enParalelo(trabajos, 4, async ({ id, f, o }) => {
    try {
      const buf = await fs.readFile(f.ruta);
      const hash = crypto.createHash('sha1').update(buf).update(VERSION_PROCESO).digest('hex').slice(0, 12);
      const soloInterna = f.privada || !o.publicar;
      const destDir = soloInterna ? path.join(dirs.internas, id) : path.join(dirs.publico, id);
      if (await optimizar(buf, destDir, hash)) stats.nuevas++;
      stats.leidas++;
      if (f.privada) stats.privadas++;
      resultados.set(f.ruta, { hash, soloInterna });
    } catch (e) {
      stats.errores++;
      avisos.push(`${path.relative(dirs.fotos, f.ruta)}: no se pudo procesar (${e.message.split('\n')[0]})`);
    }
  });

  for (const { id, f } of trabajos) {
    const r = resultados.get(f.ruta);
    if (!r) continue;
    const { hash, soloInterna } = r;
    const sets = soloInterna ? espInt : espPub;
    if (!sets.has(id)) sets.set(id, new Set());
    sets.get(id).add(`${hash}.webp`).add(`${hash}-t.webp`);
    if (!soloInterna) {
      if (!publicas.has(id)) publicas.set(id, []);
      // el mismo archivo puede aparecer dos veces (copias); se deduplica por hash
      if (!publicas.get(id).some((x) => x.src.includes(hash))) publicas.get(id).push({ src: `fotos/${id}/${hash}.webp`, thumb: `fotos/${id}/${hash}-t.webp` });
    }
    if (!internas.has(id)) internas.set(id, []);
    const base = soloInterna ? `${relInternas}/${id}` : `${relPublico}/fotos/${id}`;
    if (!internas.get(id).some((x) => x.src.includes(hash))) internas.get(id).push({ src: `${base}/${hash}.webp`, thumb: `${base}/${hash}-t.webp`, privada: f.privada });
  }
  const idsConOrigen = new Set(porId.keys());
  const pub = await sincronizar(dirs.publico, espPub, idsConOrigen, (id) => obraPorId.get(id)?.publicar === true);
  const int = await sincronizar(dirs.internas, espInt, idsConOrigen, (id) => obraPorId.has(id));
  // Obras sin carpeta de origen: se conserva lo ya generado y se lo vuelve a listar.
  for (const [id, hashes] of pub.conservadas) {
    publicas.set(id, hashes.map((h) => ({ src: `fotos/${id}/${h}.webp`, thumb: `fotos/${id}/${h}-t.webp` })));
    internas.set(id, [...(internas.get(id) ?? []), ...hashes.map((h) => ({ src: `${relPublico}/fotos/${id}/${h}.webp`, thumb: `${relPublico}/fotos/${id}/${h}-t.webp`, privada: false }))]);
  }
  for (const [id, hashes] of int.conservadas) {
    internas.set(id, [...(internas.get(id) ?? []), ...hashes.map((h) => ({ src: `${relInternas}/${id}/${h}.webp`, thumb: `${relInternas}/${id}/${h}-t.webp`, privada: true }))]);
  }
  stats.limpiados = pub.borrados + int.borrados;
  stats.conservadas = pub.conservadas.size + int.conservadas.size;
  return { publicas, internas, stats, avisos };
}
