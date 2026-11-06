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
  PESTANAS, COLUMNAS_INTERNO, FILA_PUBLICAR_AHORA, FILA_ENCABEZADO_AVISOS, esVerdadero, leerObras, aplicarNombres, asignarIds, nombreCarpetaObra, idDeCarpeta, esFotoPrivada,
  extraerCoordenadas, esLinkCorto, expandirLinkCorto, ordenarAvisos, huella, fechaLocal, indicesDeEncabezado, letraDeColumna, idDeCelda,
} from './mapa-sheet.mjs';
import { HOJA_BOT, describirCarpeta, planificar, leerMemoria, filasDeMemoria, filasLibres, idsDeCarpetaBot, esPiezaGrafica } from './bot-fotos.mjs';

const P = PESTANAS;
const orden = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

async function enParalelo(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}
const existe = (p) => fs.access(p).then(() => true, () => false);

// ---------------------------------------------------------------- carpetas de fotos
/**
 * Crea la carpeta de las obras que no tienen y, con `renombrar`, deja todas con el nombre «ID - referencia - ciudad»
 * (así se reconoce al cliente en Drive). Nunca se imprime un nombre: solo cantidades.
 */
async function asegurarCarpetas(almacen, obras, listado, { renombrar = false, limiteMs = 12 * 60_000 } = {}) {
  const conCarpeta = new Set(listado.carpetas.map((c) => idDeCarpeta(c.nombre)).filter(Boolean));
  const faltan = obras.filter((o) => !conCarpeta.has(o.id));
  await enParalelo(faltan, 3, async (o) => {
    const c = await almacen.crearCarpeta(nombreCarpetaObra(o));
    listado.carpetas.push(c);
  });
  const resumen = { creadas: faltan.length, renombradas: 0, fallidas: 0, pendientes: 0 };
  if (renombrar) {
    const porId = new Map(obras.map((o) => [o.id, o]));
    const cambios = listado.carpetas.map((c) => ({ c, nuevo: porId.has(idDeCarpeta(c.nombre)) ? nombreCarpetaObra(porId.get(idDeCarpeta(c.nombre))) : null })).filter((x) => x.nuevo && x.nuevo !== x.c.nombre);
    const tope = Date.now() + limiteMs;
    await enParalelo(cambios, 3, async ({ c, nuevo }) => {
      if (Date.now() > tope) { resumen.pendientes++; return; }
      try { await almacen.renombrarCarpeta(c.id, nuevo); c.nombre = nuevo; resumen.renombradas++; } catch { resumen.fallidas++; }
    });
  }
  return resumen;
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

// ---------------------------------------------------------------- carpeta del bot de fotos (MIGUELITO)
const PUBLICAR_FOTOS_DEL_BOT = false;   // ver procesarFotosDrive
const BOT_INACTIVO = { activo: false, listado: { carpetas: [], archivos: [], datos: [] }, idsDeCarpeta: () => [], escribio: false };

async function guardarMemoria(almacen, mem) {
  if (!(await almacen.pestanas()).some((p) => p.title === HOJA_BOT)) await almacen.batchUpdate([{ addSheet: { properties: { title: HOJA_BOT, hidden: true, gridProperties: { rowCount: LIMITE_FILAS, columnCount: 10 } } } }]);
  await almacen.limpiarRango(`'${HOJA_BOT}'!A2:G${LIMITE_FILAS}`);
  await almacen.escribirRango(`'${HOJA_BOT}'!A1`, filasDeMemoria(mem));
}

/**
 * Lee «bot fotos» (datos.txt de cada carpeta de obra) y: empareja cada carpeta con una obra que ya existe o carga una obra nueva en MAPA
 * (sin publicar si faltan canchas o ubicación). Después completa los datos que llegan más tarde. Nunca pisa lo que una persona escribió.
 * Si falla, la publicación entera falla (la web anterior sigue online): así no se pierden fotos por un error pasajero.
 */
async function importarBot(almacen, { mapa, interno, avisos }) {
  const listado = await almacen.listarBot();
  const memoria = leerMemoria(await almacen.leerPestana(HOJA_BOT));
  if (!listado.activo) {
    if (memoria.size) throw new Error('La carpeta «bot fotos» dejó de estar compartida con el robot. No se publica para no perder las fotos que vienen de ahí.');
    avisos.push({ tipo: 'AVISO', id: '', texto: 'No veo la carpeta «bot fotos» de Drive: compartila con el mail del robot (como Lector) y las obras y fotos de MIGUELITO entran solas.' });
    return BOT_INACTIVO;
  }
  const col = indicesDeEncabezado(mapa[0]);
  const { obras } = leerObras(mapa, interno);
  const cuentas = new Map();
  for (const o of obras) {
    if (!o.ciudad || !o.provincia) continue;
    const k = norm(o.ciudad);
    const m = cuentas.get(k) ?? new Map();
    m.set(o.provincia, (m.get(o.provincia) ?? 0) + 1);
    cuentas.set(k, m);
  }
  const provinciaPorCiudad = new Map([...cuentas].map(([k, m]) => [k, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]]));

  const carpetas = new Map(listado.carpetas.map((c) => [c.id, c]));
  const conDatos = new Map();
  for (const d of listado.datos) if (carpetas.has(d.carpetaId) && !conDatos.has(d.carpetaId)) conDatos.set(d.carpetaId, d);
  const infos = [];
  await enParalelo([...conDatos.values()], 4, async (d) => infos.push(describirCarpeta(carpetas.get(d.carpetaId), await almacen.leerTexto(d.id), provinciaPorCiudad)));
  infos.sort((a, b) => orden.compare(a.nombre, b.nombre));

  const ids = mapa.slice(1).map((f) => Number(idDeCelda(f?.[col.ID]))).filter(Number.isFinite);
  const plan = planificar({
    infos, obras, memoria, hoy: new Date().toISOString().slice(0, 10),
    leerCelda: (o, c) => mapa[o._fila - 1]?.[col[c]],
    siguienteId: ids.length ? Math.max(...ids) : 0,
    libres: filasLibres(mapa, col, infos.length),
  });
  avisos.push(...plan.avisos);
  const padre = new Map(listado.carpetas.map((c) => [c.id, c.padre]));
  const tieneDatos = (id) => { for (let a = id, n = 0; a && n < 8; a = padre.get(a), n++) if (conDatos.has(a)) return true; return false; };
  for (const id of [...new Set(listado.archivos.map((a) => a.carpetaId))].filter((id) => !tieneDatos(id)).slice(0, 15)) {
    avisos.push({ tipo: 'AVISO', id: '', texto: `La carpeta del bot «${carpetas.get(id)?.nombre ?? id}» tiene fotos pero no tiene datos.txt: no se carga. Pedile a MIGUELITO que lo cree.` });
  }

  const celdas = [];
  for (const n of plan.nuevas) {
    celdas.push({ a1: `${letraDeColumna(col.ID)}${n.fila}`, valor: n.id });
    for (const [c, v] of Object.entries(n.valores)) if (col[c] >= 0) celdas.push({ a1: `${letraDeColumna(col[c])}${n.fila}`, valor: v });
  }
  for (const c of plan.cambios) if (col[c.columna] >= 0) celdas.push({ a1: `${letraDeColumna(col[c.columna])}${c.obra._fila}`, valor: c.valor });
  await almacen.actualizarCeldas(P.mapa, celdas);
  if (plan.nuevas.length) {
    const filas = plan.nuevas.map((n) => COLUMNAS_INTERNO.map((c) => (c === 'ID' ? n.id : n.interno[c] ?? '')));
    await almacen.escribirRango(`'${P.interno}'!A${Math.max(interno.length, 1) + 1}`, filas);
  }
  if (JSON.stringify(filasDeMemoria(plan.memoria)) !== JSON.stringify(filasDeMemoria(memoria))) await guardarMemoria(almacen, plan.memoria);
  return { activo: true, listado, idsDeCarpeta: idsDeCarpetaBot(listado.carpetas, plan.vinculos), escribio: celdas.length > 0 };
}

// ---------------------------------------------------------------- fotos de Drive
async function procesarFotosDrive(almacen, listado, obras, cacheFotos, bot = BOT_INACTIVO) {
  const idPorCarpeta = new Map(listado.carpetas.map((c) => [c.id, idDeCarpeta(c.nombre)]));
  const publicables = new Set(obras.filter((o) => o.publicar).map((o) => o.id));
  const porId = new Map();
  const vistas = new Map();   // la misma foto en dos lugares (carpeta del mapa y carpeta del bot) se publica una sola vez
  const sumar = (id, a) => {
    if (!id || !publicables.has(id) || esFotoPrivada(a.nombre) || esPiezaGrafica(a.nombre) || !a.md5) return;
    if (!porId.has(id)) { porId.set(id, []); vistas.set(id, new Set()); }
    if (vistas.get(id).has(a.md5) || porId.get(id).length >= 20) return;
    vistas.get(id).add(a.md5);
    porId.get(id).push(a);
  };
  for (const a of listado.archivos) sumar(idPorCarpeta.get(a.carpetaId), a);
  // Las fotos que el bot guarda en SU carpeta son todo lo que llegó al grupo (personas, documentos…): no se publican solas.
  // Solo salen las que el bot copia a la carpeta de la obra en «Fotos Mapa SLAVON», donde decide qué es público y marca «_privada» el resto.
  if (PUBLICAR_FOTOS_DEL_BOT) for (const a of bot.listado.archivos) for (const id of bot.idsDeCarpeta(a.carpetaId)) sumar(id, a);
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

/** Si GitHub no pudo desplegar la web, queda escrito en AVISOS (el resultado «OK» que había era de antes del despliegue). */
export async function avisarErrorDespliegue(almacen) {
  await almacen.actualizarCeldas(P.avisos, [
    { a1: 'B3', valor: fechaLocal() },
    { a1: 'B4', valor: 'ERROR: la web nueva se armó bien, pero GitHub no pudo publicarla. La web anterior sigue online y se reintenta sola en la próxima publicación.' },
  ]);
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
    const boton = esVerdadero((await almacen.leerRango(`'${P.avisos}'!B${FILA_PUBLICAR_AHORA}`))?.[0]?.[0]);
    const completo = modo !== 'poll' || boton;
    let interno = completo ? await almacen.leerPestana(P.interno) : [];
    let bot = BOT_INACTIVO;
    if (completo) {   // lo que archivó MIGUELITO (obras nuevas y fotos) entra antes de dar los IDs
      bot = await importarBot(almacen, { mapa, interno, avisos });
      if (bot.escribio) { mapa = await almacen.leerPestana(P.mapa); interno = await almacen.leerPestana(P.interno); }
    }
    const nuevos = asignarIds(mapa);
    if (nuevos.length) {
      await almacen.actualizarCeldas(P.mapa, nuevos.map((n) => ({ a1: n.a1, valor: n.id })));
      for (const n of nuevos) { mapa[n.fila - 1] = mapa[n.fila - 1] ?? []; mapa[n.fila - 1][n.idx] = n.id; }
    }
    // 2) ¿Hay que publicar?
    if (modo === 'poll' && !boton) {
      if (nuevos.length) await asegurarCarpetas(almacen, nuevos.map((n) => ({ id: n.id, nombre_club: n.nombre, referencia: n.referencia, ciudad: n.ciudad, deporte: n.deporte, provincia: n.provincia })), await almacen.listarFotos());
      return { publicar: false, motivo: nuevos.length ? 'ids-asignados' : 'nada-que-hacer' };
    }

    // 3) Leer todo
    const { obras, avisos: avisosFilas } = leerObras(mapa, interno);
    avisos.push(...avisosFilas, ...aplicarNombres(obras));
    const listado = await almacen.listarFotos();
    const carpetas = await asegurarCarpetas(almacen, obras, listado, { renombrar: true });
    if (carpetas.fallidas) avisos.push({ tipo: 'AVISO', id: '', texto: `No pude renombrar ${carpetas.fallidas} carpeta(s) de Drive; se reintenta en la próxima publicación.` });
    if (carpetas.pendientes) avisos.push({ tipo: 'AVISO', id: '', texto: `Faltan renombrar ${carpetas.pendientes} carpetas de Drive; se siguen renombrando en la próxima publicación.` });
    const cache = await leerGeo(almacen);
    const tamanoCache = Object.keys(cache).length;
    avisos.push(...(await resolverUbicaciones(obras, cache, { fetchFn, opcionesGeo })));
    if (Object.keys(cache).length !== tamanoCache) await guardarGeo(almacen, cache);

    // 4) Fotos
    const drive = await procesarFotosDrive(almacen, listado, obras, cacheFotos, bot);
    avisos.push(...drive.avisos);
    const heredadas = await fotosHeredadas(raiz);
    const fotos = new Map(heredadas);
    for (const [id, lista] of drive.fotos) fotos.set(id, lista);

    // 5) ¿Cambió algo desde la última publicación?
    const config = await fs.readFile(path.join(raiz, 'public', 'config.json'), 'utf8').catch(() => '');
    const huellaActual = huella({ mapa: mapa.map((f) => f.slice(0, 20)), interno: interno.length, fotos: listado.archivos.map((a) => [a.id, a.md5, a.carpetaId, a.nombre]), bot: [bot.listado.archivos.map((a) => [a.id, a.md5, a.carpetaId, a.nombre]), bot.listado.datos.map((d) => [d.id, d.md5])], carpetas: listado.carpetas.map((c) => idDeCarpeta(c.nombre)), config, sha });
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
      avisos.push({ tipo: 'SIN FOTO', id: o.id, texto: `${o.destacada ? 'DESTACADA. ' : ''}Arrastrá fotos a la carpeta «${nombreCarpetaObra(o)}» en Drive.` });
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
