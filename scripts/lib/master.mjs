// Lectura y validación de obras-maestra.xlsx (hoja OBRAS). Las columnas se leen por NOMBRE, no por posición.
import ExcelJS from 'exceljs';
import { DEPORTES, ESTADOS, esSi, numero, pad4, norm } from './util.mjs';

const REQUERIDAS = ['id', 'deporte', 'provincia', 'ciudad', 'pais', 'lat', 'lng', 'nombrable'];

/** ExcelJS devuelve objetos para fórmulas, textos enriquecidos, hipervínculos y fechas. Los llevamos a texto/número. */
export function valorCelda(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v) return valorCelda(v.result);
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return String(v.text);
    if ('hyperlink' in v) return String(v.hyperlink);
    return null;
  }
  if (typeof v === 'string') {
    const t = v.replace(/\s+/g, ' ').trim();
    return t === '' ? null : t;
  }
  return v;
}

export function textoOrNull(v) {
  const x = valorCelda(v);
  return x === null ? null : String(x);
}

/** Convierte una fila cruda de la planilla en una obra validada. Devuelve { obra, avisos, error }. */
export function normalizarFila(raw, nFila) {
  const avisos = [];
  const id = pad4(textoOrNull(raw.id));
  if (!id) return { error: `fila ${nFila}: sin id` };
  const dep = norm(raw.deporte).replace(/ /g, '_');
  if (!DEPORTES.includes(dep)) return { error: `obra ${id} (fila ${nFila}): deporte «${raw.deporte}» no válido. Usar: ${DEPORTES.join(', ')}` };
  const estadoRaw = norm(raw.estado).replace(/ /g, '_') || 'terminada';
  const estado = ESTADOS.includes(estadoRaw) ? estadoRaw : 'terminada';
  if (!ESTADOS.includes(estadoRaw) && raw.estado) avisos.push(`obra ${id}: estado «${raw.estado}» no válido, se tomó «terminada»`);

  let lat = numero(raw.lat);
  let lng = numero(raw.lng);
  if ((lat === null) !== (lng === null)) {
    avisos.push(`obra ${id}: tiene solo una de lat/lng; se ignoran las dos`);
    lat = lng = null;
  }
  if (lat !== null && (lat < -90 || lat > 90 || lng < -180 || lng > 180 || (lat === 0 && lng === 0))) {
    avisos.push(`obra ${id}: coordenadas fuera de rango (${lat}, ${lng}); se ignoran`);
    lat = lng = null;
  }
  let anio = numero(raw.anio);
  const anioMax = new Date().getFullYear() + 1;
  if (anio !== null && (!Number.isInteger(anio) || anio < 1990 || anio > anioMax)) {
    avisos.push(`obra ${id}: año ${anio} fuera de rango; se ignora`);
    anio = null;
  }
  let canchas = numero(raw.cantidad_canchas);
  if (canchas === null || !Number.isInteger(canchas) || canchas < 1) canchas = 1;

  let video = textoOrNull(raw.video_url);
  if (video && !/^https:\/\//i.test(video)) {
    avisos.push(`obra ${id}: video_url debe empezar con https://; se ignora`);
    video = null;
  }
  const publicarRaw = textoOrNull(raw.publicar);

  // La ciudad es solo la ciudad: «Virreyes, Plaza Malvinas Argentinas» → «Virreyes» (así no se cuela el nombre de un lugar).
  let ciudad = textoOrNull(raw.ciudad);
  if (ciudad?.includes(',')) {
    const primera = ciudad.split(',')[0].trim();
    avisos.push(`obra ${id}: la ciudad «${ciudad}» tenía una coma; se usó «${primera}»`);
    ciudad = primera || null;
  }

  return {
    avisos,
    obra: {
      id,
      nombre_club: textoOrNull(raw.nombre_club),
      deporte: dep,
      tipo: textoOrNull(raw.tipo),
      cantidad_canchas: canchas,
      provincia: textoOrNull(raw.provincia),
      ciudad,
      pais: textoOrNull(raw.pais) || 'Argentina',
      lat,
      lng,
      anio,
      estado,
      descripcion_corta: textoOrNull(raw.descripcion_corta),
      video_url: video,
      nombrable: esSi(raw.nombrable),
      destacada: esSi(raw.destacada),
      publicar: publicarRaw === null ? true : esSi(publicarRaw),
      // --- internas (nunca salen en la versión pública) ---
      fuente: textoOrNull(raw.fuente),
      origen_coord: textoOrNull(raw.origen_coord),
      servicio: textoOrNull(raw.servicio),
      cliente_interno: textoOrNull(raw.cliente_interno),
      direccion_interna: textoOrNull(raw.direccion_interna),
      nota_mapa: textoOrNull(raw.nota_mapa),
      sugerencia_nombrable: textoOrNull(raw.sugerencia_nombrable),
      revisar: textoOrNull(raw.revisar),
    },
  };
}

export async function leerMaestra(ruta) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(ruta);
  const ws = wb.getWorksheet('OBRAS');
  if (!ws) throw new Error(`La planilla no tiene una hoja llamada «OBRAS». Hojas encontradas: ${wb.worksheets.map((w) => w.name).join(', ')}`);
  const cab = {};
  ws.getRow(1).eachCell((c, i) => {
    const t = textoOrNull(c.value);
    if (t) cab[norm(t).replace(/ /g, '_')] = i;
  });
  const faltan = REQUERIDAS.filter((c) => !(c in cab));
  if (faltan.length) throw new Error(`Faltan columnas en la hoja OBRAS: ${faltan.join(', ')}`);

  const obras = [];
  const errores = [];
  const avisos = [];
  const vistos = new Set();
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const raw = {};
    for (const [nombre, col] of Object.entries(cab)) raw[nombre] = valorCelda(row.getCell(col).value);
    if (Object.values(raw).every((v) => v === null)) return;
    const r = normalizarFila(raw, n);
    if (r.error) return errores.push(r.error);
    if (vistos.has(r.obra.id)) return errores.push(`id repetido: ${r.obra.id} (fila ${n})`);
    vistos.add(r.obra.id);
    avisos.push(...r.avisos);
    obras.push(r.obra);
  });
  return { obras, errores, avisos };
}
