import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { AlmacenMemoria } from './lib/almacen-memoria.mjs';
import { ejecutar, avisarErrorDespliegue } from './lib/publicador.mjs';
import { prepararSheet, FORMULA_NOMBRE_A_MOSTRAR, TEXTO_MANUAL, MARCA, MARCA_ANTERIOR } from './lib/preparar-sheet.mjs';
import { COLUMNAS, COLUMNAS_INTERNO, extraerCoordenadas, expandirLinkCorto, asignarIds, nombreCarpeta, idDeCarpeta, esFotoPrivada, leerObras } from './lib/mapa-sheet.mjs';

const fila = ({ id = '', club = '', mostrar = '', deporte = 'Fútbol', tipo = '', canchas = 1, ciudad = '', prov = '', pais = 'Argentina', anio = '', estado = 'Terminada', link = '', nombrar = false, dest = false, pub = true, notas = '' } = {}) =>
  [id, club, mostrar, deporte, tipo, canchas, ciudad, prov, pais, anio, estado, link, nombrar, dest, pub, notas];
const interno = (...filas) => [COLUMNAS_INTERNO, ...filas];
const fetchGeo = async (url) => ({ ok: true, json: async () => (String(url).includes('Rosario') ? [{ lat: '-32.9468', lon: '-60.6393', display_name: 'Rosario', address: { state: 'Santa Fe' } }] : []) });
const optsGeo = { fetchFn: fetchGeo, pausaMs: 0 };

async function entorno(tabs) {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'slavon-test-'));
  await fs.mkdir(path.join(raiz, 'public'), { recursive: true });
  await fs.writeFile(path.join(raiz, 'public', 'index.html'), '<html><body>hola</body></html>');
  await fs.writeFile(path.join(raiz, 'public', 'config.json'), '{}');
  const almacen = new AlmacenMemoria(tabs);
  // En producción «Nombre a mostrar» es una fórmula que ya está puesta cuando se publica: se simula el Sheet ya preparado.
  const nombres = almacen.tabs.MAPA.map((f) => f[2]);
  await prepararSheet(almacen);
  nombres.forEach((v, i) => { if (v !== undefined) almacen.tabs.MAPA[i][2] = v; });
  const comun = { almacen, raiz, salida: path.join(raiz, '_site'), cacheFotos: path.join(raiz, '.cache'), opcionesGeo: optsGeo, sha: '' };
  const publicado = async () => JSON.parse(await fs.readFile(path.join(raiz, '_site', 'data', 'obras-publicas.json'), 'utf8'));
  const avisos = () => (almacen.tabs.AVISOS ?? []).slice(9).filter((f) => f?.length);
  return { raiz, almacen, comun, publicado, avisos };
}

const BASE = () => ({
  MAPA: [COLUMNAS,
    fila({ id: '0001', club: 'Club Los Pinos', mostrar: 'Club Los Pinos', ciudad: 'Villa Allende', prov: 'Córdoba', link: 'https://www.google.com/maps/@-31.29567,-64.29481,17z', nombrar: true, dest: true }),
    fila({ id: '0002', club: 'Cancha de Sandra Tosoni', mostrar: 'Cancha de Sandra Tosoni', ciudad: 'Marcos Juárez', prov: 'Córdoba', link: '-32.69, -62.1', nombrar: true }),
    fila({ id: '0003', deporte: 'Pádel', ciudad: 'Rosario', prov: 'Santa Fe' }),
    fila({ id: '0004', club: 'Sin lugar' }),
    fila({ id: '0005', club: 'Oculta', ciudad: 'Rosario', prov: 'Santa Fe', pub: false }),
  ],
  INTERNO: interno(['0001', 'Juan Pérez Cliente Secreto', 'Av. Siempreviva 742']),
});

test('el Sheet se prepara una sola vez y deja el manual en 10 renglones o menos', async () => {
  const a = new AlmacenMemoria(BASE());
  assert.equal(await prepararSheet(a), true);
  assert.equal(await prepararSheet(a), false, 'la segunda vez no hace nada');
  assert.ok(TEXTO_MANUAL.length <= 10);
  assert.ok(a.tabs['CÓMO USAR'].length <= 10 && a.tabs.AVISOS && a.tabs.LISTAS && a.tabs.GEO);
  assert.match(FORMULA_NOMBRE_A_MOSTRAR, /ARRAYFORMULA/);
});

test('publicación: privacidad, ubicaciones y avisos', async () => {
  const { almacen, comun, publicado, avisos } = await entorno(BASE());
  const r = await ejecutar({ ...comun, modo: 'manual' });
  assert.equal(r.publicar, true);
  const { obras } = await publicado();
  const por = Object.fromEntries(obras.map((o) => [o.id, o]));
  assert.equal(obras.length, 4, 'la obra con «¿Publicar?» destildado no sale');
  assert.equal(por['0001'].nombre_club, 'Club Los Pinos');
  assert.equal(por['0001'].nombrable, true);
  assert.equal(por['0001'].lat, -31.3);                              // redondeado a 2 decimales aunque tenga nombre
  assert.equal(por['0001'].lng, -64.29);
  assert.equal(por['0002'].nombrable, false);                         // «Cancha de Sandra Tosoni»: una persona nunca se muestra
  assert.match(por['0002'].nombre_club, /^Complejo de fútbol – Marcos Juárez, Córdoba$/);
  assert.equal(por['0003'].lat, -32.95);                              // ubicada por ciudad y provincia (aproximada)
  assert.equal(por['0004'].lat, null);
  const texto = JSON.stringify(await publicado());
  for (const secreto of ['Juan Pérez', 'Siempreviva', 'Sandra', 'Tosoni']) assert.ok(!texto.includes(secreto), secreto);
  const lista = avisos();
  const tiene = (tipo, id) => lista.some((f) => f[0] === tipo && f[1] === id);
  assert.ok(tiene('NOMBRE PARECE PERSONA', '0002') && tiene('SIN UBICACIÓN', '0004') && tiene('UBICACIÓN APROXIMADA', '0003') && tiene('SIN FOTO', '0001'));
  assert.match(lista.find((f) => f[0] === 'SIN FOTO')[2], /DESTACADA/, 'las destacadas sin foto van primero');
  assert.match(almacen.tabs.AVISOS[3][1], /^OK/);
  assert.equal(almacen.tabs.AVISOS[4][1], false);
  assert.ok(almacen.tabs.GEO.length > 1, 'la ubicación por ciudad queda guardada para no volver a consultarla');
});

test('agregar una obra, publicarla con «Publicar ahora» y borrarla', async () => {
  const tabs = BASE();
  tabs.MAPA.push(fila({ club: 'Club Nuevo de Prueba', ciudad: 'Rosario', prov: 'Santa Fe', link: '-32.95, -60.64', nombrar: true, mostrar: 'Club Nuevo de Prueba', pub: true }));
  const { almacen, comun, publicado } = await entorno(tabs);
  // 1) el programa que corre cada 5 minutos le pone ID y crea su carpeta, pero no publica si no se tildó «Publicar ahora»
  const a = await ejecutar({ ...comun, modo: 'poll' });
  assert.deepEqual([a.publicar, a.motivo], [false, 'ids-asignados']);
  assert.equal(almacen.tabs.MAPA[6][0], '0006');
  assert.ok(almacen.carpetas.some((c) => c.nombre === '0006 - Club Nuevo de Prueba'));
  await assert.rejects(fs.access(path.join(comun.salida, 'data')), 'todavía no se armó nada');
  // 2) tildar «Publicar ahora»
  almacen.tabs.AVISOS[4][1] = true;
  const b = await ejecutar({ ...comun, modo: 'poll' });
  assert.equal(b.publicar, true);
  assert.ok((await publicado()).obras.some((o) => o.id === '0006' && o.nombre_club === 'Club Nuevo de Prueba'));
  assert.equal(almacen.tabs.AVISOS[4][1], false, 'la casilla se destilda sola');
  // 3) borrar la fila y publicar de nuevo
  almacen.tabs.MAPA.splice(6, 1);
  await ejecutar({ ...comun, modo: 'manual' });
  assert.ok(!(await publicado()).obras.some((o) => o.id === '0006'));
});

test('fotos de Drive: se ordenan por nombre, se optimizan y las «privada» no se publican', async () => {
  const { almacen, comun, publicado, raiz } = await entorno(BASE());
  almacen.carpetas.push({ id: 'c1', nombre: '0001 - Club Los Pinos' });
  const png = (color) => sharp({ create: { width: 30, height: 20, channels: 3, background: color } }).png().toBuffer();
  almacen.agregarFoto('c1', 'b-foto.png', await png('#0000ff'));
  almacen.agregarFoto('c1', 'a-foto.png', await png('#ff0000'));
  almacen.agregarFoto('c1', 'Privada-interna.png', await png('#00ff00'));
  await ejecutar({ ...comun, modo: 'manual' });
  const o = (await publicado()).obras.find((x) => x.id === '0001');
  assert.equal(o.fotos.length, 2);
  const md5 = (n) => almacen.archivos.find((a) => a.nombre === n).md5.slice(0, 12);
  assert.ok(o.fotos[0].src.includes(md5('a-foto.png')) && o.fotos[1].src.includes(md5('b-foto.png')));
  const enSitio = await fs.readdir(path.join(raiz, '_site', 'fotos', '0001'));
  assert.equal(enSitio.length, 4, 'dos fotos grandes y dos miniaturas');
  assert.ok(!enSitio.some((f) => f.startsWith(md5('Privada-interna.png'))));
  assert.ok(esFotoPrivada('IMG_privada.jpg') && !esFotoPrivada('IMG_1.jpg'));
});

test('si no hubo cambios, la publicación de la noche no hace nada', async () => {
  const { comun, raiz } = await entorno(BASE());
  await ejecutar({ ...comun, modo: 'manual' });
  const { huella } = JSON.parse(await fs.readFile(path.join(raiz, '_site', 'data', 'version.json'), 'utf8'));
  const igual = await ejecutar({ ...comun, modo: 'nocturno', huellaPublicada: async () => huella });
  assert.deepEqual([igual.publicar, igual.motivo], [false, 'sin-cambios']);
  const distinta = await ejecutar({ ...comun, modo: 'nocturno', huellaPublicada: async () => 'otra' });
  assert.equal(distinta.publicar, true);
});

test('links de Google Maps: largos, cortos y coordenadas sueltas', async () => {
  assert.deepEqual(extraerCoordenadas('https://www.google.com/maps/place/X/@-34.6037,-58.3816,17z/data=!3d-34.6040!4d-58.3820'), { lat: -34.604, lng: -58.382 });
  assert.deepEqual(extraerCoordenadas('https://maps.google.com/?q=-31.4,-64.18'), { lat: -31.4, lng: -64.18 });
  assert.deepEqual(extraerCoordenadas(' -34.6037 , -58.3816 '), { lat: -34.6037, lng: -58.3816 });
  assert.equal(extraerCoordenadas('https://www.google.com/maps/place/Un+club'), null);
  assert.equal(extraerCoordenadas('hola'), null);
  const respuestas = ['https://maps.google.com/maps?cid=1', 'https://www.google.com/maps/place/X/@-34.5,-58.4,17z'];
  const fake = async () => ({ headers: { get: () => respuestas.shift() ?? null } });
  assert.match(await expandirLinkCorto('https://maps.app.goo.gl/abc', fake), /@-34\.5,-58\.4/);
  const { comun, publicado } = await entorno({ MAPA: [COLUMNAS, fila({ id: '0001', club: 'Corto', link: 'https://maps.app.goo.gl/xyz' })], INTERNO: interno() });
  const res2 = ['https://www.google.com/maps/place/X/@-34.6037,-58.3816,17z'];
  await ejecutar({ ...comun, modo: 'manual', fetchFn: async () => ({ headers: { get: () => res2.shift() ?? null } }) });
  assert.equal((await publicado()).obras[0].lat, -34.6);
});

test('IDs y carpetas: siguiente ID, nombre de carpeta y filas con problemas', () => {
  const mapa = [COLUMNAS, fila({ id: '0010', club: 'A' }), fila({ club: 'Nueva', ciudad: 'Salta' }), Array(16).fill(''), fila({ club: 'Otra nueva' })];
  assert.deepEqual(asignarIds(mapa).map((n) => [n.fila, n.id]), [[3, '0011'], [5, '0012']]);
  assert.equal(nombreCarpeta('0011', 'Club: "Los/Pinos"'), '0011 - Club Los Pinos');
  assert.equal(idDeCarpeta('0647 - Club Huracán'), '0647');
  assert.equal(idDeCarpeta('Fotos varias'), '');
  const { avisos, obras } = leerObras([COLUMNAS, fila({ id: '7', club: 'X', deporte: 'Fútbol' }), fila({ id: '0007', club: 'Y' }), fila({ club: 'Sin id' })]);
  assert.equal(obras[0].id, '0007');
  assert.equal(avisos.filter((a) => a.tipo === 'ERROR').length, 2, 'ID repetido y fila sin ID');
});

test('un nombre con nombre de pila al inicio queda bloqueado aunque la casilla esté tildada', async () => {
  const { comun, publicado } = await entorno({ MAPA: [COLUMNAS, fila({ id: '0001', club: 'Pablo Club Atletico Susanense', mostrar: 'Pablo Club Atletico Susanense', ciudad: 'Susana', prov: 'Santa Fe', link: '-31.5, -61.5', nombrar: true })], INTERNO: interno() });
  await ejecutar({ ...comun, modo: 'manual' });
  assert.equal((await publicado()).obras[0].nombrable, false);
});

test('si algo falla queda la web anterior y el error se escribe en AVISOS', async () => {
  const { almacen, comun, raiz } = await entorno(BASE());
  await ejecutar({ ...comun, modo: 'manual' });
  const antes = await fs.readFile(path.join(raiz, '_site', 'data', 'obras-publicas.json'), 'utf8');
  almacen.listarFotos = async () => { throw new Error('Google respondió 500'); };
  await assert.rejects(ejecutar({ ...comun, modo: 'manual' }), /Google respondió 500/);
  assert.match(almacen.tabs.AVISOS[3][1], /^ERROR/);
  assert.equal(await fs.readFile(path.join(raiz, '_site', 'data', 'obras-publicas.json'), 'utf8'), antes, 'no se tocó la versión anterior');
});

test('un Sheet preparado con la versión 1 se repara: idioma en_US y fórmula de «Nombre a mostrar» de nuevo', async () => {
  const a = new AlmacenMemoria({ ...BASE(), LISTAS: [Array(9).fill('').concat([MARCA_ANTERIOR])] });
  assert.equal(await prepararSheet(a), true);
  assert.ok(a.solicitudes.some((r) => r.updateSpreadsheetProperties?.properties?.locale === 'en_US'));
  assert.equal(a.tabs.LISTAS[0][9], MARCA);
  assert.equal(await prepararSheet(a), false, 'la segunda vez no hace nada');
  assert.ok(!a.solicitudes.some((r) => r.addProtectedRange), 'la reparación no repite los permisos ni las filas');
});

test('si «Nombre a mostrar» muestra un error, queda escrito en AVISOS y la web sale igual', async () => {
  const tabs = BASE();
  tabs.MAPA[1][2] = '#ERROR!';
  const { comun, publicado, avisos } = await entorno(tabs);
  const r = await ejecutar({ ...comun, modo: 'manual' });
  assert.equal(r.publicar, true);
  assert.ok(avisos().some((f) => f[0] === 'AVISO' && /Nombre a mostrar/.test(f[2])));
  assert.equal((await publicado()).obras.find((o) => o.id === '0001').nombre_club, 'Club Los Pinos', 'si la fórmula falla, el nombre sale del nombre del club');
});

test('si GitHub no puede desplegar, el error queda escrito en AVISOS', async () => {
  const { almacen, comun } = await entorno(BASE());
  await ejecutar({ ...comun, modo: 'manual' });
  assert.match(almacen.tabs.AVISOS[3][1], /^OK/);
  await avisarErrorDespliegue(almacen);
  assert.match(almacen.tabs.AVISOS[3][1], /^ERROR: .*no pudo publicarla/);
});
