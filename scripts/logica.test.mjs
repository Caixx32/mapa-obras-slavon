import test from 'node:test';
import assert from 'node:assert/strict';
import { alternarDeporte, filtrar, partirNombre, referenciaObra, mensajeWhatsApp, urlWhatsApp, agruparProvincias, contarPorDeporte, titular, textoPaises, formatoNumero, resolverRuta, tieneUbicacion } from '../public/js/logica.js';

const TODOS = ['padel', 'futbol', 'hockey'];
const obras = [
  { id: '1', deporte: 'padel', pais: 'Argentina', provincia: 'Córdoba', ciudad: 'Villa Allende', lat: -31.3, lng: -64.3, nombrable: false, nombre_club: 'Complejo de pádel – Villa Allende, Córdoba' },
  { id: '2', deporte: 'futbol', pais: 'Argentina', provincia: 'Córdoba', ciudad: 'Río Cuarto', lat: -33.1, lng: -64.3, nombrable: true, nombre_club: 'Club Los Pinos' },
  { id: '3', deporte: 'futbol', pais: 'Argentina', provincia: 'Salta', ciudad: 'Salta', lat: null, lng: null, nombrable: false, nombre_club: 'Complejo de fútbol – Salta, Salta' },
  { id: '4', deporte: 'hockey', pais: 'Uruguay', provincia: 'Salto', ciudad: 'Salto', lat: -31.4, lng: -57.9, nombrable: false, nombre_club: 'Complejo de hockey – Salto, Salto' },
];

test('chips: el primer toque aísla, los siguientes suman o quitan, y volver a "todos" es automático', () => {
  let s = alternarDeporte(null, 'padel', TODOS);
  assert.deepEqual([...s], ['padel']);
  s = alternarDeporte(s, 'futbol', TODOS);
  assert.deepEqual([...s].sort(), ['futbol', 'padel']);
  s = alternarDeporte(s, 'padel', TODOS);
  assert.deepEqual([...s], ['futbol']);
  assert.equal(alternarDeporte(s, 'futbol', TODOS), null, 'sin ninguno activo vuelve a todos');
  assert.equal(alternarDeporte(new Set(['padel', 'futbol']), 'hockey', TODOS), null, 'con todos activos vuelve a null');
});

test('filtrar por deporte, provincia y texto', () => {
  assert.equal(filtrar(obras).length, 4);
  assert.deepEqual(filtrar(obras, { deportes: new Set(['futbol']) }).map((o) => o.id), ['2', '3']);
  assert.deepEqual(filtrar(obras, { provincia: 'Argentina|Córdoba' }).map((o) => o.id), ['1', '2']);
  assert.deepEqual(filtrar(obras, { deportes: new Set(['futbol']), provincia: 'Argentina|Córdoba' }).map((o) => o.id), ['2']);
  assert.deepEqual(filtrar(obras, { texto: 'rio cuarto' }).map((o) => o.id), ['2'], 'ignora acentos y mayúsculas');
  assert.deepEqual(filtrar(obras, { texto: 'los pinos cordoba' }).map((o) => o.id), ['2']);
});

test('nombre genérico se parte en título y lugar; el real no', () => {
  assert.deepEqual(partirNombre(obras[0]), { titulo: 'Complejo de pádel', lugar: 'Villa Allende, Córdoba' });
  assert.deepEqual(partirNombre(obras[1]), { titulo: 'Club Los Pinos', lugar: 'Río Cuarto, Córdoba' });
  assert.equal(partirNombre({ nombre_club: null }).titulo, 'Obra SLAVON');
});

test('mensaje de WhatsApp: nombre si es nombrable, si no la ciudad', () => {
  assert.equal(mensajeWhatsApp(obras[1]), 'Hola SLAVON, vi la obra Club Los Pinos en el mapa y quiero consultar por una cancha de fútbol.');
  assert.equal(mensajeWhatsApp(obras[0]), 'Hola SLAVON, vi la obra de Villa Allende en el mapa y quiero consultar por una cancha de pádel.');
  assert.match(mensajeWhatsApp({ deporte: 'residencial', ciudad: 'Tigre' }), /césped para un espacio residencial/);
  assert.equal(referenciaObra({ deporte: 'otro' }), 'de ustedes');
  assert.equal(mensajeWhatsApp(obras[0], 'Hola, {obra} / {producto}'), 'Hola, de Villa Allende / una cancha de pádel');
});

test('mensaje de WhatsApp nunca incluye el nombre real de una obra no nombrable', () => {
  const o = { deporte: 'padel', ciudad: 'Rosario', nombrable: false, nombre_club: 'Complejo de pádel – Rosario, Santa Fe' };
  assert.ok(!mensajeWhatsApp(o).includes('Complejo'));
});

test('url de WhatsApp: solo dígitos y texto codificado', () => {
  assert.equal(urlWhatsApp('+54 9 11 5555-1234', 'Hola ñandú'), 'https://wa.me/5491155551234?text=Hola%20%C3%B1and%C3%BA');
  assert.equal(urlWhatsApp('', 'Hola'), 'https://wa.me/?text=Hola');
  assert.equal(urlWhatsApp(undefined, 'Hola'), 'https://wa.me/?text=Hola');
});

test('provincias: solo obras ubicadas, agrupadas por país con Argentina primero', () => {
  const g = agruparProvincias(obras);
  assert.deepEqual(g.map((x) => x.pais), ['Argentina', 'Uruguay']);
  assert.deepEqual(g[0].provincias.map((p) => [p.nombre, p.n]), [['Córdoba', 2]], 'Salta no aparece: su única obra no tiene ubicación');
  assert.equal(g[1].provincias[0].valor, 'Uruguay|Salto');
});

test('contadores por deporte, ubicación y rutas', () => {
  assert.equal(contarPorDeporte(obras).get('futbol'), 2);
  assert.equal(tieneUbicacion(obras[2]), false);
  assert.equal(resolverRuta('fotos/1/a.webp', '../'), '../fotos/1/a.webp');
  assert.equal(resolverRuta('https://x.com/a.png', '../'), 'https://x.com/a.png');
});

test('titular con país único y con varios', () => {
  const t = 'Más de {N} canchas construidas en {paises}';
  assert.equal(titular(t, { titular_n: 1300, paises: ['Argentina'] }), 'Más de 1.300 canchas construidas en Argentina');
  assert.equal(titular(t, { titular_n: 1300, paises: ['Argentina', 'Uruguay'] }), 'Más de 1.300 canchas construidas en Argentina y Uruguay');
  assert.equal(titular(t, { titular_n: 50, paises: ['Argentina', 'Uruguay', 'Chile'] }), 'Más de 50 canchas construidas en Argentina, Uruguay y Chile');
});

test('texto de países y formato de números es-AR', () => {
  assert.equal(textoPaises(['Argentina']), 'Argentina');
  assert.equal(textoPaises(['Argentina', 'Uruguay']), 'Argentina y Uruguay');
  assert.equal(textoPaises([]), 'Argentina');
  assert.equal(textoPaises(undefined), 'Argentina');
  assert.equal(formatoNumero(1320), '1.320');
  assert.equal(formatoNumero(24), '24');
});

// ---------------------------------------------------------------- links compartibles, cerca tuyo, medición
import { filtrosDesdeUrl, consultaDesdeFiltros, slugProvincia, distanciaKm, obrasCerca, sumarCanchas } from '../public/js/logica.js';
import { crearMedicion } from '../public/js/medicion.js';
import { corregirCiudad } from './lib/master.mjs';

const DEPORTES_URL = ['padel', 'cesped_padel', 'futbol', 'hockey'];
const PROVS = [{ nombre: 'Córdoba', valor: 'Argentina|Córdoba' }, { nombre: 'Buenos Aires', valor: 'Argentina|Buenos Aires' }];

test('links: ?deporte=padel&provincia=cordoba carga los filtros', () => {
  const f = filtrosDesdeUrl('?deporte=padel&provincia=cordoba', { deportesValidos: DEPORTES_URL, provincias: PROVS });
  assert.deepEqual([...f.deportes], ['padel']);
  assert.equal(f.provincia, 'Argentina|Córdoba');
});

test('links: varios deportes, provincia con espacio, y valores desconocidos se ignoran', () => {
  const f = filtrosDesdeUrl('?deporte=futbol,padel,inventado&provincia=buenos-aires', { deportesValidos: DEPORTES_URL, provincias: PROVS });
  assert.deepEqual([...f.deportes].sort(), ['futbol', 'padel']);
  assert.equal(f.provincia, 'Argentina|Buenos Aires');
  const vacio = filtrosDesdeUrl('?deporte=nada&provincia=narnia&x=1', { deportesValidos: DEPORTES_URL, provincias: PROVS });
  assert.equal(vacio.deportes, null);
  assert.equal(vacio.provincia, '');
});

test('links: todos los deportes = sin filtro; y ida y vuelta de los filtros', () => {
  assert.equal(filtrosDesdeUrl('?deporte=padel,cesped_padel,futbol,hockey', { deportesValidos: DEPORTES_URL, provincias: PROVS }).deportes, null);
  const estado = { deportes: new Set(['futbol', 'padel']), provincia: 'Argentina|Córdoba' };
  const qs = consultaDesdeFiltros(estado, DEPORTES_URL);
  assert.equal(qs, '?deporte=padel,futbol&provincia=cordoba');
  const vuelta = filtrosDesdeUrl(qs, { deportesValidos: DEPORTES_URL, provincias: PROVS });
  assert.deepEqual([...vuelta.deportes].sort(), ['futbol', 'padel']);
  assert.equal(vuelta.provincia, estado.provincia);
  assert.equal(consultaDesdeFiltros({ deportes: null, provincia: '' }, DEPORTES_URL), '');
  assert.equal(slugProvincia('Tierra del Fuego'), 'tierra-del-fuego');
});

test('cerca tuyo: distancia y obras a menos de 50 km', () => {
  const obelisco = { lat: -34.6037, lng: -58.3816 };
  assert.ok(Math.abs(distanciaKm(obelisco, { lat: -34.9205, lng: -57.9536 }) - 53) < 3, 'Buenos Aires – La Plata ≈ 53 km');
  const obras = [
    { id: '1', lat: -34.61, lng: -58.4, cantidad_canchas: 2 },     // ~2 km
    { id: '2', lat: -34.9205, lng: -57.9536, cantidad_canchas: 1 }, // ~53 km
    { id: '3', lat: -31.4, lng: -64.18, cantidad_canchas: 1 },      // Córdoba
    { id: '4', lat: null, lng: null, cantidad_canchas: 5 },         // sin ubicación: no cuenta
  ];
  const r = obrasCerca(obras, obelisco, 50);
  assert.deepEqual(r.cerca.map((o) => o.id), ['1']);
  assert.equal(r.masCercana.o.id, '1');
  const lejos = obrasCerca(obras, { lat: -41.1, lng: -71.3 }, 50); // Bariloche
  assert.equal(lejos.cerca.length, 0);
  assert.ok(lejos.masCercana.km > 500);
  assert.equal(sumarCanchas(obras), 9);
});

test('medición: sin IDs no hace nada; con IDs válidos registra los cuatro eventos', () => {
  const llamadas = [];
  const scripts = [];
  const win = { document: { createElement: () => ({}), head: { append: (s) => scripts.push(s.src) } } };
  const m = crearMedicion(win);
  m.iniciar({ ga4_id: '', meta_pixel_id: '' });
  m.registrar('click_whatsapp', { deporte: 'padel' });
  assert.deepEqual(scripts, [], 'no se carga ningún script externo');
  assert.equal(win.gtag, undefined);

  const m2 = crearMedicion(win);
  m2.iniciar({ ga4_id: 'G-ABC123XYZ', meta_pixel_id: '123456789012345' });
  win.gtag = (...a) => llamadas.push(['ga4', ...a]);
  win.fbq = (...a) => llamadas.push(['meta', ...a]);
  for (const e of ['click_whatsapp', 'filtro_usado', 'compartir', 'cerca_tuyo']) m2.registrar(e, { deporte: 'padel', provincia: 'Córdoba' });
  assert.equal(llamadas.filter((l) => l[0] === 'ga4').length, 4);
  assert.deepEqual(llamadas.find((l) => l[0] === 'meta'), ['meta', 'trackCustom', 'click_whatsapp', { deporte: 'padel', provincia: 'Córdoba' }]);
  assert.ok(scripts.some((s) => s.includes('googletagmanager.com/gtag/js?id=G-ABC123XYZ')));

  const m3 = crearMedicion({ document: win.document });
  m3.iniciar({ ga4_id: 'cualquier cosa', meta_pixel_id: 'abc' });
  assert.deepEqual(m3.activo, { ga4: false, meta: false }, 'IDs inválidos no activan nada');
});

test('pipeline: corrige errores de tipeo de ciudades', () => {
  assert.deepEqual(corregirCiudad('Caba', 'Buenos Aires'), { ciudad: 'Buenos Aires', provincia: 'CABA' });
  assert.deepEqual(corregirCiudad('dpto. Avellaneda', 'Santiago del Estero'), { ciudad: 'Avellaneda', provincia: 'Santiago del Estero' });
  assert.equal(corregirCiudad('Rosario', 'Santa Fe'), null);
});
