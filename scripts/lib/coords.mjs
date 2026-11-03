// Coordenadas faltantes. Orden de prioridad (la planilla maestra ya manda):
//   1) lat/lng de la planilla maestra   2) punto del KML con el mismo nombre (opcional)   3) Nominatim por ciudad + provincia → «aprox»
// Nunca se consulta ningún servicio de Google. A Nominatim solo se le envía «ciudad, provincia, país».
import fs from 'node:fs/promises';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { norm, esperar } from './util.mjs';

// ---------------------------------------------------------------- KML (archivo local, opcional)
export async function leerKml(ruta) {
  const xml = await fs.readFile(ruta, 'utf8');
  const doc = new XMLParser({ ignoreAttributes: true, isArray: (n) => ['Folder', 'Placemark'].includes(n) }).parse(xml);
  const puntos = new Map(); // nombre normalizado → [{lat,lng}]
  const recorrer = (nodo) => {
    for (const p of nodo?.Placemark ?? []) {
      const c = String(p?.Point?.coordinates ?? '').trim().split(',');
      const lng = Number(c[0]);
      const lat = Number(c[1]);
      const n = norm(p?.name);
      if (n && Number.isFinite(lat) && Number.isFinite(lng)) puntos.set(n, [...(puntos.get(n) ?? []), { lat, lng }]);
    }
    for (const f of nodo?.Folder ?? []) recorrer(f);
  };
  recorrer(doc?.kml?.Document);
  return puntos;
}

/** Completa lat/lng desde el KML cuando el nombre del club coincide con UN solo punto. Devuelve cuántas completó. */
export function completarDesdeKml(obras, puntos) {
  let n = 0;
  for (const o of obras) {
    if (o.lat !== null || !o.nombre_club) continue;
    const c = puntos.get(norm(o.nombre_club));
    if (c?.length === 1) {
      o.lat = c[0].lat;
      o.lng = c[0].lng;
      o.origen_coord = 'kml';
      n++;
    }
  }
  return n;
}

// ---------------------------------------------------------------- Nominatim (OpenStreetMap)
const PROV_CANONICA = {
  'ciudad autonoma de buenos aires': 'CABA', 'buenos aires': 'Buenos Aires', cordoba: 'Córdoba', 'santa fe': 'Santa Fe',
  'entre rios': 'Entre Ríos', corrientes: 'Corrientes', misiones: 'Misiones', chaco: 'Chaco', formosa: 'Formosa',
  tucuman: 'Tucumán', salta: 'Salta', jujuy: 'Jujuy', catamarca: 'Catamarca', 'la rioja': 'La Rioja',
  'santiago del estero': 'Santiago del Estero', 'san juan': 'San Juan', mendoza: 'Mendoza', 'san luis': 'San Luis',
  'la pampa': 'La Pampa', neuquen: 'Neuquén', 'rio negro': 'Río Negro', chubut: 'Chubut', 'santa cruz': 'Santa Cruz',
};
const PROV_EN_QUERY = { CABA: 'Ciudad Autónoma de Buenos Aires' };

/** Nombre de provincia que devuelve Nominatim → nombre canónico (evita confundir CABA con la provincia de Buenos Aires). */
export function estadoAProvincia(estado) {
  const n = norm(estado).replace(/^provincia de /, '');
  if (n.startsWith('tierra del fuego')) return 'Tierra del Fuego';
  return PROV_CANONICA[n] ?? null;
}

export async function cargarCache(ruta) {
  try {
    return JSON.parse(await fs.readFile(ruta, 'utf8'));
  } catch {
    return {};
  }
}
export async function guardarCache(ruta, cache) {
  await fs.mkdir(path.dirname(ruta), { recursive: true });
  await fs.writeFile(ruta, JSON.stringify(cache, null, 1));
}

async function consultar(url, fetchFn) {
  const r = await fetchFn(url, { headers: { 'User-Agent': 'slavon-mapa-obras/1.0', 'Accept-Language': 'es' } });
  if (!r.ok) throw new Error(`Nominatim respondió ${r.status}`);
  return r.json();
}

/** Devuelve {lat, lng, display} o null. Solo acepta el resultado si cae en la provincia (o país) pedido. */
export async function geocodificar(ciudad, provincia, pais, { fetchFn = fetch, pausaMs = 1100 } = {}) {
  const uy = pais === 'Uruguay';
  const intentos = [ciudad];
  const partes = ciudad.split(/[,/\-–]/).map((x) => x.trim()).filter(Boolean);
  if (partes.length > 1) intentos.push(partes.at(-1));
  for (const att of [...new Set(intentos)].slice(0, 2)) {
    const q = `${att}, ${PROV_EN_QUERY[provincia] ?? provincia}, ${pais}`;
    const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({ q, format: 'jsonv2', addressdetails: '1', limit: '1', countrycodes: uy ? 'uy' : 'ar', 'accept-language': 'es' });
    const j = await consultar(url, fetchFn);
    await esperar(pausaMs);
    const r = j?.[0];
    if (!r) continue;
    const a = r.address ?? {};
    const ok = uy ? a.country_code === 'uy' : estadoAProvincia(a.state) === provincia;
    if (ok) return { lat: Number(r.lat), lng: Number(r.lon), display: String(r.display_name ?? '').slice(0, 140) };
  }
  return null;
}

/**
 * Geocodifica (ciudad + provincia) las obras sin coordenadas. Usa y actualiza el caché.
 * Devuelve { hechas: [obra…], fallidas: [obra…], sinDatos: [obra…] }.
 */
export async function geocodificarFaltantes(obras, cache, opciones = {}) {
  const hechas = [];
  const fallidas = [];
  const sinDatos = [];
  let error = null;
  for (const o of obras.filter((x) => x.publicar && x.lat === null)) {
    if (!o.ciudad || !o.provincia) {
      sinDatos.push(o);
      continue;
    }
    const clave = `${norm(o.ciudad)}|${norm(o.provincia)}|${o.pais}`;
    if (!(clave in cache)) {
      if (error) continue;
      try {
        cache[clave] = await geocodificar(o.ciudad, o.provincia, o.pais, opciones);
      } catch (e) {
        error = e; // sin red o Nominatim caído: se corta y se informa una sola vez
        continue;
      }
    }
    const g = cache[clave];
    if (g) {
      o.lat = g.lat;
      o.lng = g.lng;
      o.origen_coord = 'aprox';
      o._geo = g.display;
      hechas.push(o);
    } else fallidas.push(o);
  }
  return { hechas, fallidas, sinDatos, error };
}
