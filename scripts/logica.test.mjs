import test from 'node:test';
import assert from 'node:assert/strict';
import { alternarDeporte, filtrar, partirNombre, referenciaObra, mensajeWhatsApp, urlWhatsApp, agruparProvincias, contarPorDeporte, titular, resolverRuta, tieneUbicacion } from '../public/js/logica.js';

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
