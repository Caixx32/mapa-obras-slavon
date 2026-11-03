import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { estadoAProvincia, geocodificar, geocodificarFaltantes, leerKml, completarDesdeKml } from './lib/coords.mjs';
import { normalizarFila, simplificarCiudad } from './lib/master.mjs';

test('CABA y la provincia de Buenos Aires no se confunden', () => {
  assert.equal(estadoAProvincia('Ciudad Autónoma de Buenos Aires'), 'CABA');
  assert.equal(estadoAProvincia('Buenos Aires'), 'Buenos Aires');
  assert.equal(estadoAProvincia('Provincia de Córdoba'), 'Córdoba');
  assert.equal(estadoAProvincia('Tierra del Fuego, Antártida e Islas del Atlántico Sur'), 'Tierra del Fuego');
});

const falsoNominatim = (resultados) => async (url) => {
  falsoNominatim.urls.push(String(url));
  const r = resultados.shift();
  return { ok: true, json: async () => (r ? [r] : []) };
};
falsoNominatim.urls = [];

test('geocodificar: acepta solo resultados dentro de la provincia pedida', async () => {
  falsoNominatim.urls = [];
  const malo = { lat: '-34.6', lon: '-58.4', display_name: 'Calle X, Villa Crespo', address: { state: 'Ciudad Autónoma de Buenos Aires', country_code: 'ar' } };
  assert.equal(await geocodificar('Canning', 'Buenos Aires', 'Argentina', { fetchFn: falsoNominatim([malo]), pausaMs: 0 }), null);
  const bueno = { lat: '-34.9', lon: '-58.5', display_name: 'Canning, Ezeiza', address: { state: 'Buenos Aires', country_code: 'ar' } };
  const r = await geocodificar('Canning', 'Buenos Aires', 'Argentina', { fetchFn: falsoNominatim([bueno]), pausaMs: 0 });
  assert.deepEqual([r.lat, r.lng], [-34.9, -58.5]);
});

test('geocodificar: solo envía ciudad, provincia y país (nunca direcciones de clientes)', async () => {
  falsoNominatim.urls = [];
  await geocodificar('Campana', 'Buenos Aires', 'Argentina', { fetchFn: falsoNominatim([]), pausaMs: 0 });
  const url = new URL(falsoNominatim.urls[0]);
  assert.equal(url.hostname, 'nominatim.openstreetmap.org');
  assert.equal(url.searchParams.get('q'), 'Campana, Buenos Aires, Argentina');
  assert.ok(!/google/i.test(url.href));
});

test('geocodificarFaltantes: usa el caché, marca «aprox» y no consulta dos veces la misma ciudad', async () => {
  falsoNominatim.urls = [];
  const bueno = { lat: '-31.4', lon: '-64.2', display_name: 'Córdoba', address: { state: 'Córdoba', country_code: 'ar' } };
  const mk = (id, o = {}) => ({ id, publicar: true, lat: null, lng: null, ciudad: 'Córdoba', provincia: 'Córdoba', pais: 'Argentina', ...o });
  const obras = [mk('1'), mk('2'), mk('3', { ciudad: null }), mk('4', { lat: -1, lng: -2 })];
  const cache = {};
  const r = await geocodificarFaltantes(obras, cache, { fetchFn: falsoNominatim([bueno]), pausaMs: 0 });
  assert.equal(falsoNominatim.urls.length, 1);
  assert.equal(r.hechas.length, 2);
  assert.equal(obras[0].origen_coord, 'aprox');
  assert.equal(r.sinDatos.length, 1);
  assert.equal(obras[3].lat, -1);
});

test('geocodificarFaltantes: sin red no rompe y lo informa', async () => {
  const mk = { id: '1', publicar: true, lat: null, lng: null, ciudad: 'X', provincia: 'Salta', pais: 'Argentina' };
  const r = await geocodificarFaltantes([mk], {}, { fetchFn: async () => { throw new Error('sin internet'); }, pausaMs: 0 });
  assert.match(r.error.message, /sin internet/);
  assert.equal(mk.lat, null);
});

test('KML local: completa coordenadas solo si el nombre coincide con un único punto', async () => {
  const kml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Folder><name>Fútbol</name>
    <Placemark><name>Club Los Pinos</name><Point><coordinates>-64.2,-31.4,0</coordinates></Point></Placemark>
    <Placemark><name>Club Doble</name><Point><coordinates>-60.0,-30.0,0</coordinates></Point></Placemark>
    <Placemark><name>Club Doble</name><Point><coordinates>-61.0,-31.0,0</coordinates></Point></Placemark></Folder></Document></kml>`;
  const ruta = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'kml-')), 'a.kml');
  await fs.writeFile(ruta, kml);
  const obras = [{ nombre_club: 'club los pinos', lat: null }, { nombre_club: 'Club Doble', lat: null }, { nombre_club: 'Club Los Pinos', lat: 1 }];
  assert.equal(completarDesdeKml(obras, await leerKml(ruta)), 1);
  assert.deepEqual([obras[0].lat, obras[0].lng, obras[0].origen_coord], [-31.4, -64.2, 'kml']);
  assert.equal(obras[1].lat, null, 'nombre repetido: no se adivina');
  assert.equal(obras[2].lat, 1, 'no pisa coordenadas existentes');
});

test('planilla: lectura tolerante de valores y validaciones', () => {
  const fila = { id: '23', deporte: 'Cesped Padel', provincia: 'Salta', ciudad: 'Salta, Capital', pais: null, lat: '-24,78', lng: '-65.41', anio: 2023, estado: '', nombrable: 'Sí', destacada: '', publicar: '', cantidad_canchas: '2', video_url: 'http://x' };
  const { obra, avisos } = normalizarFila(fila, 5);
  assert.equal(obra.id, '0023');
  assert.equal(obra.deporte, 'cesped_padel');
  assert.equal(obra.lat, -24.78);
  assert.equal(obra.ciudad, 'Salta');
  assert.equal(obra.nombrable, true);
  assert.equal(obra.destacada, false);
  assert.equal(obra.publicar, true, 'publicar vacío = si');
  assert.equal(obra.pais, 'Argentina');
  assert.equal(obra.estado, 'terminada');
  assert.equal(obra.video_url, null);
  assert.ok(avisos.some((a) => /https/.test(a)));
  assert.match(normalizarFila({ id: '1', deporte: 'golf' }, 2).error, /deporte/);
  assert.equal(normalizarFila({ id: '1', deporte: 'otro', lat: '-30' }, 2).obra.lat, null, 'una sola coordenada se ignora');
});

test('ciudades: se quitan los prefijos administrativos sin tocar los nombres reales', () => {
  assert.equal(simplificarCiudad('Municipio de Posadas'), 'Posadas');
  assert.equal(simplificarCiudad('Partido de Almirante Brown'), 'Almirante Brown');
  assert.equal(simplificarCiudad('Departamento de Copo'), 'Copo');
  assert.equal(simplificarCiudad('Distrito Ciudad de General Alvear'), 'General Alvear');
  assert.equal(simplificarCiudad('Comisión Municipal de Los Pirpintos'), 'Los Pirpintos');
  assert.equal(simplificarCiudad('Aeropuerto Internacional Ezeiza'), 'Ezeiza');
  assert.equal(simplificarCiudad('San Miguel de Tucumán'), 'San Miguel de Tucumán');
  assert.equal(simplificarCiudad('Municipio'), 'Municipio', 'si no queda nada, se conserva');
  assert.equal(simplificarCiudad(null), null);
});

test('geocodificarFaltantes con soloCache usa lo guardado y no consulta nada', async () => {
  const { geocodificarFaltantes } = await import('./lib/coords.mjs');
  const mk = (id, ciudad) => ({ id, publicar: true, lat: null, lng: null, ciudad, provincia: 'Córdoba', pais: 'Argentina' });
  const obras = [mk('1', 'Río Cuarto'), mk('2', 'Villa Nueva')];
  const cache = { 'rio cuarto|cordoba|Argentina': { lat: -33.13, lng: -64.35, display: 'Río Cuarto' } };
  const fetchFn = () => { throw new Error('no debería consultar la red'); };
  const r = await geocodificarFaltantes(obras, cache, { soloCache: true, fetchFn });
  assert.equal(r.hechas.length, 1);
  assert.equal(obras[0].lat, -33.13);
  assert.equal(obras[0].origen_coord, 'aprox');
  assert.equal(obras[1].lat, null);
  assert.equal(r.fallidas.length, 0);
  assert.equal(r.error, null);
});
