// Publicación automática: lee el Google Sheet y la carpeta de Drive, aplica las reglas de privacidad y arma el sitio en `_site/`.
// Se corre desde GitHub Actions (scripts/ci-sheet.mjs). El detalle con nombres va SOLO a la pestaña AVISOS (privada):
// los registros de GitHub son públicos, así que acá nunca se imprime un nombre.
import fs from 'node:fs/promises';
import path from 'node:path';
import { RAIZ, norm } from './util.mjs';
import { construirPublico } from './publico.mjs';
import { geocodificarFaltantes } from './coords.mjs';
import { optimizar } from './fotos.mjs';
import { agruparDuplicados } from './fusiones.mjs';
import { versionarCarpeta } from '../versionar.mjs';
import { prepararSheet, LIMITE_FILAS } from './preparar-sheet.mjs';
import {
  PESTANAS, FILA_PUBLICAR_AHORA, FILA_ENCABEZADO_AVISOS, esVerdadero, leerObras, aplicarNombres, asignarIds, nombreCarpeta, idDeCarpeta, esFotoPrivada,
  extraerCoordenadas, esLinkCorto, expandirLinkCorto, ordenarAvisos, huella, fechaLocal,
} from './mapa-sheet.mjs';

const P = PESTANAS;
const orden = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

async function enParalelo(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}
const existe = (p) => fs.access(p).then(() => true, () => false);

// ---------------------------------------------------------------- carpetas de fotos
async function asegurarCarpetas(almacen, obras, listado) {
  const conCarpeta = new Set(listado.carpetas.map((c) => idDeCarpeta(c.nombre)).filter(Boolean));
  const faltan = obras.filter((o) => !conCarpeta.has(o.id));
  await enParalelo(faltan, 3, async (o) => {
    const c = await almacen.crearCarpeta(nombreCarpeta(o.id, o.nombre_club || o.ciudad));
    listado.carpetas.push(c);
  });
  return faltan.length;
}

// ---------------------------------------------------------------- ubicaciones (link de Google Maps → coordenadas; si no, ciudad + provincia)
async function leerGeo(almacen) {
  const cache = {};
  for (const f of (await almacen.leerPestana(P.geo)).slice(1)) {
    if (!f?.[0]) continue;
    cache[f[0]] = f[1] === '' || f[1] === undefined ? null : { lat: Number(f[1]), lng: Number(f[2]), display: String(f[3] ?? '') };
  }
  return cache;
}
async function guardarGeo(almacen, cache) {
  const filas = Object.entries(cache).filter(([, g]) => g !== undefined).map(([k, g]) => [k, g?.lat ?? '', g?.lng ?? '', g?.display ?? '']);
  await almacen.limpiarRango(`'${P.geo}'!A2:D${LIMITE_FILAS}`);
  await almacen.escribirRango(`'${P.geo}'!A1`, [['clave', 'lat', 'lng', 'detalle'], ...filas]);
}

async function resolverUbicaciones(obras, cache, { fetchFn, opcionesGeo }) {
  const avisos = [];
  for (const o of obras) {
    o.lat = o.lng = null;
    if (!o.publicar || !o._link) continue;
    let c = extraerCoordenadas(o._link);
    if (!c && esLinkCorto(o._link)) {
      const clave = `link|${o._link}`;
      if (!cache[clave]) {
        try { const final = await expandirLinkCorto(o._link, fetchFn); const xy = final && extraerCoordenadas(final); if (xy) cache[clave] = { ...xy, display: '' }; } catch { /* se reintenta en la próxima */ }
      }
      c = cache[clave] ?? null;
    }
    if (c) { o.lat = c.lat; o.lng = c.lng; o.origen_coord = 'link'; }
    else avisos.push({ tipo: 'SIN UBICACIÓN', id: o.id, texto: 'No pude leer el link de Google Maps. Pegá el link completo (el largo) o las coordenadas como "-34.60, -58.38".' });
  }
  const geo = await geocodificarFaltantes(obras, cache, { pausaMs: 1100, ...opcionesGeo });
  const fallidas = new Set(geo.fallidas.map((o) => o.id));
  for (const o of obras.filter((x) => x.publicar && x.lat === null)) {
    const motivo = !o.ciudad ? 'Falta la ciudad (o pegá el link de Google Maps).' : !o.provincia ? 'Falta la provincia (o pegá el link de Google Maps).' : fallidas.has(o.id) ? 'No encontré esa ciudad en esa provincia: ¿error de tipeo? (o pegá el link de Google Maps).' : 'No se pudo ubicar todavía; se reintenta en la próxima publicación.';
    if (!avisos.some((a) => a.id === o.id)) avisos.push({ tipo: 'SIN UBICACIÓN', id: o.id, texto: motivo });
  }
  for (const o of obras.filter((x) => x.publicar && x.origen_coord === 'aprox' && x.lat !== null)) {
    avisos.push({ tipo: 'UBICACIÓN APROXIMADA', id: o.id, texto: 'Se ubicó por ciudad y provincia. Para que quede exacta, pegá el link de Google Maps.' });
  }
  if (geo.error) avisos.push({ tipo: 'AVISO', id: '', texto: 'No pude consultar el servicio de ubicaciones por ciudad; las obras sin link quedan sin ubicar hasta la próxima publicación.' });
  return avisos;
}

// ---------------------------------------------------------------- fotos de Drive
async function procesarFotosDrive(almacen, listado, obras, cacheFotos) {
  const idPorCarpeta = new Map(listado.carpetas.map((c) => [c.id, idDeCarpeta(c.nombre)]));
  const publicables = new Set(obras.filter((o) => o.publicar).map((o) => o.id));
  const porId = new Map();
  for (const a of listado.archivos) {
    const id = idPorCarpeta.get(a.carpetaId);
    if (!id || !publicables.has(id) || esFotoPrivada(a.nombre) || !a.md5) continue;
    if (!porId.has(id)) porId.set(id, []);
    porId.get(id).push(a);
  }
  const fotos = new Map();
  const avisos = [];
  const trabajos = [];
  for (const [id, lista] of porId) {
    lista.sort((x, y) => orden.compare(x.nombre, y.nombre));
    fotos.set(id, []);
    for (const a of lista) trabajos.push({ id, a, h: a.md5.slice(0, 12) });
  }
  await enParalelo(trabajos, 4, async ({ id, a, h }) => {
    const dir = path.join(cacheFotos, id);
    try {
      if (!((await existe(path.join(dir, `${h}.webp`))) && (await existe(path.join(dir, `${h}-t.webp`))))) await optimizar(await almacen.descargar(a.id), dir, h);
    } catch {
      avisos.push({ tipo: 'FOTO', id, texto: `No pude usar la foto «${a.nombre}» (formato no compatible o dañada). Probá con JPG o PNG.` });
    }
  });
  for (const { id, a, h } of trabajos) {
    if (await existe(path.join(cacheFotos, id, `${h}.webp`))) fotos.get(id).push({ src: `fotos/${id}/${h}.webp`, thumb: `fotos/${id}/${h}-t.webp` });
  }
  return { fotos, avisos };
}

/** Fotos que ya están publicadas en el repositorio (public/fotos): siguen valiendo para las obras que todavía no tienen fotos en Drive. */
async function fotosHeredadas(raiz) {
  const mapa = new Map();
  try {
    const previo = JSON.parse(await fs.readFile(path.join(raiz, 'public', 'data', 'obras-publicas.json'), 'utf8'));
    for (const o of previo.obras ?? []) if (o.fotos?.length) mapa.set(o.id, o.fotos.filter((f) => !f.privada).map((f) => ({ src: f.src, thumb: f.thumb })));
  } catch { /* no hay datos previos */ }
  return mapa;
}

// ---------------------------------------------------------------- armar el sitio
async function armarSitio({ raiz, salida, json, huellaActual, cacheFotos, fotosDrive, sha }) {
  await fs.rm(salida, { recursive: true, force: true });
  await fs.cp(path.join(raiz, 'public'), salida, { recursive: true });
  await fs.mkdir(path.join(salida, 'data'), { recursive: true });
  await fs.writeFile(path.join(salida, 'data', 'obras-publicas.json'), JSON.stringify(json));
  await fs.writeFile(path.join(salida, 'data', 'version.json'), JSON.stringify({ huella: huellaActual, generado: json.meta.generado }));
  for (const [id, lista] of fotosDrive) {   // las fotos de Drive reemplazan a las que había para esa obra
    await fs.rm(path.join(salida, 'fotos', id), { recursive: true, force: true });
    for (const f of lista) {
      for (const rel of [f.src, f.thumb]) {
        await fs.mkdir(path.join(salida, path.dirname(rel)), { recursive: true });
        await fs.copyFile(path.join(cacheFotos, rel.replace(/^fotos\//, '')), path.join(salida, rel));
      }
    }
  }
  if (sha) await versionarCarpeta(salida, sha);
}

// ---------------------------------------------------------------- AVISOS
async function escribirAvisos(almacen, { resultado, cuantasEnMapa = '', avisos = [], resetearBoton = false }) {
  const maximo = LIMITE_FILAS - FILA_ENCABEZADO_AVISOS - 2;
  const todas = ordenarAvisos(avisos).map((a) => [a.tipo, a.id, a.texto]);
  const filas = todas.length > maximo ? [...todas.slice(0, maximo), ['AVISO', '', `…y ${todas.length - maximo} avisos más que no entran en esta lista.`]] : todas;
  await almacen.limpiarRango(`'${P.avisos}'!A${FILA_ENCABEZADO_AVISOS + 1}:C${LIMITE_FILAS}`);
  const celdas = [{ a1: 'B3', valor: fechaLocal() }, { a1: 'B4', valor: resultado }, { a1: 'B6', valor: cuantasEnMapa }];
  if (resetearBoton) celdas.push({ a1: `B${FILA_PUBLICAR_AHORA}`, valor: false });
  await almacen.actualizarCeldas(P.avisos, celdas);
  if (filas.length) await almacen.escribirRango(`'${P.avisos}'!A${FILA_ENCABEZADO_AVISOS + 1}`, filas);
}

/**
 * modo: 'poll' (cada 5 min: IDs, carpetas y «Publicar ahora») · 'nocturno' (3 AM: publica si hubo cambios) ·
 *       'manual' / 'push' (publica siempre).
 * Devuelve { publicar: boolean, motivo }.
 */
export async function ejecutar({ almacen, modo, raiz = RAIZ, salida = path.join(raiz, '_site'), cacheFotos = path.join(raiz, '.cache-fotos'), fetchFn = fetch, opcionesGeo = {}, huellaPublicada = async () => null, sha = process.env.GITHUB_SHA ?? '' }) {
  const avisos = [];
  try {
    await prepararSheet(almacen);
    const celdaC2 = (await almacen.leerRango(`'${P.mapa}'!C2`))?.[0]?.[0];
    if (typeof celdaC2 === 'string' && celdaC2.startsWith('#')) avisos.push({ tipo: 'AVISO', id: '', texto: `La columna «Nombre a mostrar» muestra un error (${celdaC2.slice(0, 20)}). La web sale bien igual: el nombre se calcula por otro camino.` });

    // 1) Mantenimiento barato: ID a las filas nuevas y carpeta de fotos de cada una
    let mapa = await almacen.leerPestana(P.mapa);
    const nuevos = asignarIds(mapa);
    if (nuevos.length) {
      await almacen.actualizarCeldas(P.mapa, nuevos.map((n) => ({ a1: `A${n.fila}`, valor: n.id })));
      for (const n of nuevos) { mapa[n.fila - 1] = mapa[n.fila - 1] ?? []; mapa[n.fila - 1][0] = n.id; }
    }
    // 2) ¿Hay que publicar?
    const boton = esVerdadero((await almacen.leerRango(`'${P.avisos}'!B${FILA_PUBLICAR_AHORA}`))?.[0]?.[0]);
    if (modo === 'poll' && !boton) {
      if (nuevos.length) await asegurarCarpetas(almacen, nuevos.map((n) => ({ id: n.id, nombre_club: n.nombre })), await almacen.listarFotos());
      return { publicar: false, motivo: nuevos.length ? 'ids-asignados' : 'nada-que-hacer' };
    }

    // 3) Leer todo
    const interno = await almacen.leerPestana(P.interno);
    const { obras, avisos: avisosFilas } = leerObras(mapa, interno);
    avisos.push(...avisosFilas, ...aplicarNombres(obras));
    const listado = await almacen.listarFotos();
    await asegurarCarpetas(almacen, obras, listado);
    const cache = await leerGeo(almacen);
    const tamanoCache = Object.keys(cache).length;
    avisos.push(...(await resolverUbicaciones(obras, cache, { fetchFn, opcionesGeo })));
    if (Object.keys(cache).length !== tamanoCache) await guardarGeo(almacen, cache);

    // 4) Fotos
    const drive = await procesarFotosDrive(almacen, listado, obras, cacheFotos);
    avisos.push(...drive.avisos);
    const heredadas = await fotosHeredadas(raiz);
    const fotos = new Map(heredadas);
    for (const [id, lista] of drive.fotos) fotos.set(id, lista);

    // 5) ¿Cambió algo desde la última publicación?
    const config = await fs.readFile(path.join(raiz, 'public', 'config.json'), 'utf8').catch(() => '');
    const huellaActual = huella({ mapa: mapa.map((f) => f.slice(0, 16)), interno: interno.length, fotos: listado.archivos.map((a) => [a.id, a.md5, a.carpetaId, a.nombre]), carpetas: listado.carpetas.map((c) => c.nombre), config, sha });
    if (modo === 'nocturno' && !boton && (await huellaPublicada()) === huellaActual) {
      return { publicar: false, motivo: 'sin-cambios' };
    }

    // 6) Armar la versión pública (lanza si detecta datos privados)
    const generado = new Date().toISOString();
    const publicables = obras.filter((o) => o.publicar);
    let json;
    try {
      ({ json } = construirPublico(obras, fotos, generado));
    } catch (e) {
      if (e.fugas) { for (const f of e.fugas) avisos.push({ tipo: 'ERROR', id: '', texto: `Posible dato privado en la versión pública: ${f}` }); throw Object.assign(new Error('Se detectaron posibles datos privados en la versión pública (el detalle está en AVISOS). La web anterior sigue online.'), { yaAvisado: true }); }
      throw e;
    }
    await armarSitio({ raiz, salida, json, huellaActual, cacheFotos, fotosDrive: drive.fotos, sha });

    // 7) Avisos de calidad
    for (const g of agruparDuplicados(obras)) {
      avisos.push({ tipo: 'POSIBLE DUPLICADO', id: g.obras[0].id, texto: `Mismo club y ciudad que ${g.obras.slice(1).map((o) => o.id).join(', ')}. ¿Es la misma obra? Si sí, dejá una sola fila (sumando las canchas).` });
    }
    const conFoto = (o) => (fotos.get(o.id) ?? []).length > 0;
    const peso = (o) => (o.destacada ? 0 : o.nombrable ? 1 : 2);
    for (const o of publicables.filter((x) => !conFoto(x)).sort((a, b) => peso(a) - peso(b) || a.id.localeCompare(b.id))) {
      avisos.push({ tipo: 'SIN FOTO', id: o.id, texto: `${o.destacada ? 'DESTACADA. ' : ''}Arrastrá fotos a la carpeta «${nombreCarpeta(o.id, o.nombre_club || o.ciudad)}» en Drive.` });
    }
    const enMapa = json.obras.filter((o) => o.lat !== null).length;
    await escribirAvisos(almacen, { resultado: `OK: publicado (${json.obras.length} obras, ${enMapa} en el mapa)`, cuantasEnMapa: `${enMapa} de ${json.obras.length} obras publicadas`, avisos, resetearBoton: true });
    return { publicar: true, motivo: 'publicado', huella: huellaActual };
  } catch (e) {
    const texto = e.yaAvisado ? e.message : `Algo falló: ${e.message}. La web anterior sigue online.`;
    try { await escribirAvisos(almacen, { resultado: `ERROR: ${texto}`, avisos: [{ tipo: 'ERROR', id: '', texto }, ...avisos.filter((a) => a.tipo === 'ERROR')] }); } catch { /* si ni siquiera se puede escribir en AVISOS, queda el registro de GitHub */ }
    throw e.yaAvisado ? new Error('Falló la publicación (el motivo está en la pestaña AVISOS del Sheet).') : e;
  }
}
