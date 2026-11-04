// Lógica del Google Sheet «Mapa SLAVON»: columnas, lectura de obras, ubicación (link de Google Maps), avisos y huella.
// Pura y probada con un almacén en memoria: no habla con Google (eso está en google.mjs).
import crypto from 'node:crypto';
import { norm, pad4 } from './util.mjs';
import { normalizarFila } from './master.mjs';
import { parecePersona, empiezaConNombreDePila, esInstitucionFuerte, limpiarNombre } from './nombres.mjs';

export const PESTANAS = { mapa: 'MAPA', interno: 'INTERNO', avisos: 'AVISOS', manual: 'CÓMO USAR', listas: 'LISTAS', geo: 'GEO' };
export const COLUMNAS = ['ID', 'Nombre del club', 'Nombre a mostrar', 'Deporte', 'Tipo', 'Canchas', 'Ciudad', 'Provincia', 'País', 'Año', 'Estado', 'Link de Google Maps', '¿Se puede nombrar?', '¿Destacada?', '¿Publicar?', 'Notas internas'];
export const COLUMNAS_INTERNO = ['ID', 'Cliente', 'Dirección', 'Servicio', 'Fuente', 'Origen de la ubicación', 'Descripción corta', 'Nota del mapa', 'A revisar', 'Video'];
export const DEPORTE_ETIQUETA = { padel: 'Pádel', cesped_padel: 'Césped pádel', futbol: 'Fútbol', hockey: 'Hockey', tenis: 'Tenis', residencial: 'Residencial', otro: 'Otros' };
export const ESTADO_ETIQUETA = { terminada: 'Terminada', en_obra: 'En obra' };
export const GENERICO_BASE = { padel: 'Complejo de pádel', cesped_padel: 'Complejo de pádel', futbol: 'Complejo de fútbol', hockey: 'Complejo de hockey', tenis: 'Complejo de tenis', residencial: 'Espacio residencial', otro: 'Obra deportiva' };
export const FILA_PUBLICAR_AHORA = 5;   // AVISOS!B5
export const FILA_ENCABEZADO_AVISOS = 9;   // los avisos empiezan en la fila siguiente

export const esVerdadero = (v) => v === true || ['true', 'verdadero', 'si', 'x', '1'].includes(norm(v));
export const idDeEtiqueta = (texto) => {
  const n = norm(texto).replace(/ /g, '_');
  return Object.entries(DEPORTE_ETIQUETA).find(([id, et]) => id === n || norm(et).replace(/ /g, '_') === n)?.[0] ?? n;
};
export const idDeCelda = (v) => (v === undefined || v === null || String(v).trim() === '' ? '' : /^\d+$/.test(String(v).trim()) ? pad4(String(v).trim()) : String(v).trim());

// ---------------------------------------------------------------- ubicación desde un link de Google Maps (o «lat, lng»)
const NUM = '(-?\\d{1,3}(?:\\.\\d+)?)';
const valida = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
/** Devuelve { lat, lng } o null. Entiende links largos de Google Maps y coordenadas sueltas. No consulta nada. */
export function extraerCoordenadas(texto) {
  let t = String(texto ?? '').trim();
  if (!t) return null;
  try { t = decodeURIComponent(t); } catch { /* se usa tal cual */ }
  const patrones = [
    new RegExp(`!3d${NUM}!4d${NUM}`),                                                    // pin exacto de un lugar
    new RegExp(`[?&](?:q|ll|query|destination|center)=${NUM}\\s*,\\s*${NUM}`),
    new RegExp(`@${NUM},${NUM}`),                                                         // centro de la vista
    new RegExp(`^${NUM}\\s*[,;\\s]\\s*${NUM}$`),                                          // «-34.6037, -58.3816»
  ];
  for (const re of patrones) {
    const m = t.match(re);
    if (m && valida(Number(m[1]), Number(m[2]))) return { lat: Number(m[1]), lng: Number(m[2]) };
  }
  return null;
}
export const esLinkCorto = (t) => /^https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)\//i.test(String(t ?? '').trim());

/** Abre un link corto de Google Maps (sigue las redirecciones) y devuelve la dirección final, o null. */
export async function expandirLinkCorto(url, fetchFn = fetch) {
  let actual = url.trim();
  for (let i = 0; i < 6; i++) {
    const r = await fetchFn(actual, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (compatible; slavon-mapa/1.0)' } });
    const siguiente = r.headers?.get?.('location');
    if (!siguiente) return extraerCoordenadas(actual) ? actual : null;
    actual = new URL(siguiente, actual).toString();
    const consentimiento = actual.match(/[?&]continue=([^&]+)/);   // pantalla de cookies de Google: la dirección real viene en «continue»
    if (/consent\.google\./.test(actual) && consentimiento) actual = decodeURIComponent(consentimiento[1]);
    if (extraerCoordenadas(actual)) return actual;
  }
  return null;
}

// ---------------------------------------------------------------- leer las obras del Sheet
/**
 * mapa = valores de la pestaña MAPA (fila 1 = títulos). interno = valores de INTERNO.
 * Devuelve { obras, avisos: [{tipo, id, texto}] }. Cada obra tiene la misma forma que las de la planilla maestra.
 */
export function leerObras(mapa, interno = []) {
  const avisos = [];
  const col = Object.fromEntries(COLUMNAS.map((c, i) => [c, i]));
  const colI = Object.fromEntries(COLUMNAS_INTERNO.map((c, i) => [c, i]));
  const internos = new Map();
  for (const f of interno.slice(1)) {
    const id = idDeCelda(f[0]);
    if (id) internos.set(id, Object.fromEntries(COLUMNAS_INTERNO.map((c) => [c, f[colI[c]] ?? ''])));
  }
  const obras = [];
  const vistos = new Set();
  mapa.slice(1).forEach((f, k) => {
    if (!f || f.slice(1).every((v) => v === '' || v === undefined || v === null || v === false)) return;
    const nFila = k + 2;
    const id = idDeCelda(f[col.ID]);
    if (!id) { avisos.push({ tipo: 'ERROR', id: '', texto: `La fila ${nFila} no tiene ID todavía (se asigna sola en unos minutos). No se publica hasta entonces.` }); return; }
    if (vistos.has(id)) { avisos.push({ tipo: 'ERROR', id, texto: `El ID ${id} está repetido (fila ${nFila}); se ignora la repetida.` }); return; }
    vistos.add(id);
    const i = internos.get(id) ?? {};
    const raw = {
      id,
      nombre_club: f[col['Nombre del club']] || null,
      deporte: idDeEtiqueta(f[col.Deporte]),
      tipo: f[col.Tipo] || null,
      cantidad_canchas: f[col.Canchas],
      ciudad: f[col.Ciudad] || null,
      provincia: f[col.Provincia] || null,
      pais: f[col['País']] || null,
      anio: f[col['Año']],
      estado: f[col.Estado] || 'terminada',
      nombrable: esVerdadero(f[col['¿Se puede nombrar?']]) ? 'si' : 'no',
      destacada: esVerdadero(f[col['¿Destacada?']]) ? 'si' : 'no',
      publicar: esVerdadero(f[col['¿Publicar?']]) ? 'si' : 'no',
      revisar: f[col['Notas internas']] || null,
      cliente_interno: i.Cliente || null,
      direccion_interna: i['Dirección'] || null,
      servicio: i.Servicio || null,
      fuente: i.Fuente || null,
      origen_coord: i['Origen de la ubicación'] || null,
      descripcion_corta: null,
      video_url: null,
      nota_mapa: i['Nota del mapa'] || null,
    };
    const r = normalizarFila(raw, nFila);
    if (r.error) { avisos.push({ tipo: 'ERROR', id, texto: r.error.replace(/^obra \d+ \(fila \d+\): /, '') }); return; }
    const o = r.obra;
    o._link = String(f[col['Link de Google Maps']] ?? '').trim();
    o._nombre_celda = String(f[col['Nombre a mostrar']] ?? '').trim();
    o._fila = nFila;
    obras.push(o);
  });
  return { obras, avisos };
}

/** Privacidad del Sheet: la casilla «¿Se puede nombrar?» y lo que dice «Nombre a mostrar». Una persona física NUNCA sale. */
export function aplicarNombres(obras) {
  const avisos = [];
  for (const o of obras) {
    const casilla = o.nombrable;
    let nombre = o._nombre_celda && !/^(#|\(falta)/.test(o._nombre_celda) ? o._nombre_celda : o.nombre_club ? limpiarNombre(o.nombre_club, o) : '';
    let ok = Boolean(casilla && nombre);
    if (ok && (empiezaConNombreDePila(nombre) || (parecePersona(nombre, o) && !esInstitucionFuerte(nombre)))) {
      ok = false;
      avisos.push({ tipo: 'NOMBRE PARECE PERSONA', id: o.id, texto: `«${nombre}» parece el nombre de una persona física, así que NO se muestra (sale como «Complejo de…»). Si es un club o una empresa, escribí el nombre del club en "Nombre del club".` });
    }
    o.nombrable = ok;
    o.nombre_publico = ok ? nombre : null;
  }
  return avisos;
}

// ---------------------------------------------------------------- IDs nuevos
export function asignarIds(mapa) {
  const col = Object.fromEntries(COLUMNAS.map((c, i) => [c, i]));
  const usados = mapa.slice(1).map((f) => Number(idDeCelda(f?.[0]))).filter(Number.isFinite);
  let max = usados.length ? Math.max(...usados) : 0;
  const nuevos = [];
  mapa.slice(1).forEach((f, k) => {
    if (!f || idDeCelda(f[0])) return;
    const hayDatos = [col['Nombre del club'], col.Ciudad, col.Provincia, col.Deporte, col['Link de Google Maps']].some((c) => String(f[c] ?? '').trim() !== '');
    if (!hayDatos) return;
    max += 1;
    nuevos.push({ fila: k + 2, id: pad4(max), nombre: String(f[col['Nombre del club']] || f[col.Ciudad] || 'obra').trim() });
  });
  return nuevos;
}
export const nombreCarpeta = (id, nombre) => `${id} - ${String(nombre ?? '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'obra'}`.slice(0, 120);
export const idDeCarpeta = (nombre) => { const m = String(nombre ?? '').match(/^\s*(\d{1,6})\b/); return m ? pad4(m[1]) : ''; };
export const esFotoPrivada = (nombreArchivo) => /privada/i.test(nombreArchivo);

// ---------------------------------------------------------------- avisos y huella
const ORDEN_AVISOS = ['ERROR', 'SIN UBICACIÓN', 'NOMBRE PARECE PERSONA', 'POSIBLE DUPLICADO', 'SIN FOTO', 'UBICACIÓN APROXIMADA', 'FOTO', 'AVISO'];
export function ordenarAvisos(avisos) {
  const peso = (t) => { const i = ORDEN_AVISOS.indexOf(t); return i === -1 ? ORDEN_AVISOS.length : i; };
  return [...avisos].sort((a, b) => peso(a.tipo) - peso(b.tipo) || String(a.id).localeCompare(String(b.id)));
}
export const huella = (dato) => crypto.createHash('sha256').update(JSON.stringify(dato)).digest('hex');
export const fechaLocal = (d = new Date()) => d.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' });
