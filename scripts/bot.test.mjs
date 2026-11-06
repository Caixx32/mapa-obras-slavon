import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { AlmacenMemoria } from './lib/almacen-memoria.mjs';
import { ejecutar } from './lib/publicador.mjs';
import { prepararSheet } from './lib/preparar-sheet.mjs';
import { COLUMNAS, COLUMNAS_INTERNO } from './lib/mapa-sheet.mjs';
import { parsearDatos, partesDeCarpeta, deporteDeObra, provinciaNormalizada, describirCarpeta, emparejar, esPiezaGrafica } from './lib/bot-fotos.mjs';

// ---- los datos.txt reales que dejó el bot
const VILLAVERDE = `Cliente: Federico Villaverde
Dirección: Av. Presidente Perón 6830, Villa Udaondo, Buenos Aires
Ubicación: https://maps.app.goo.gl/N2MJsapG8ueJZZKL9
Deporte: Pádel
Cantidad: 4 canchas de pádel completas
Tipo: Cancha completa panorámica
Césped: 3 césped monofilamento texturado azul, y 1 césped monofilamento texturado rojo
Fecha: 22 de octubre de 2026`;
const QUINCE = `Cliente: 15 Cero
Dirección: Ruiz Huidobro 3709, Saavedra
Ubicación: https://maps.app.goo.gl/4iJn5p3MM11PkMqw7
Deporte: Pádel
Cantidad: 6 canchas
Tipo: Cancha completa panorámica
Césped: Monofilamento azul
Fecha: 22 de octubre de 2026`;
const LAGOS_PADEL = `Cliente: General Lagos
Dirección:
Ubicación:
Deporte: Pádel
Cantidad: 2 canchas
Tipo: Cancha completa panorámica
Césped:
Fecha: 27 de octubre de 2026`;

const fila = ({ id = '', club = '', mostrar = '', ref = '', deporte = 'Pádel', tipo = '', canchas = 1, ciudad = '', prov = '', pais = 'Argentina', link = '', pub = true } = {}) =>
  [id, club, mostrar, ref, deporte, tipo, canchas, ciudad, prov, pais, '', 'Terminada', link, false, false, pub, ''];
const ruta = (...p) => p;
const obra = (o) => ({ _referencia: '', cliente_interno: '', ciudad: '', ...o });

test('datos.txt: claves con acentos, viñetas y negritas; líneas vacías y links con «:»', () => {
  const d = parsearDatos(VILLAVERDE);
  assert.equal(d.cliente, 'Federico Villaverde');
  assert.equal(d.ubicacion, 'https://maps.app.goo.gl/N2MJsapG8ueJZZKL9');
  assert.match(d.cesped, /monofilamento texturado azul/);
  const v = parsearDatos('- **Cliente:** Ana López\n* Ubicación (link): https://x.test/a?b=1\nDirección:\nProvincia: Santa Fe\nOtra cosa: nada');
  assert.deepEqual(v, { cliente: 'Ana López', ubicacion: 'https://x.test/a?b=1', provincia: 'Santa Fe' });
  assert.deepEqual(parsearDatos(LAGOS_PADEL), { cliente: 'General Lagos', deporte: 'Pádel', cantidad: '2 canchas', tipo: 'Cancha completa panorámica', fecha: '27 de octubre de 2026' });
});

test('nombre de carpeta, deporte y provincia', () => {
  assert.deepEqual(partesDeCarpeta('Sergio Puyol - San Miguel (gorila gym)'), { cliente: 'Sergio Puyol', localidad: 'San Miguel', club: 'gorila gym' });
  assert.deepEqual(partesDeCarpeta('Federico Villaverde - Ituzaingó'), { cliente: 'Federico Villaverde', localidad: 'Ituzaingó', club: '' });
  assert.deepEqual(partesDeCarpeta('General Lagos'), { cliente: 'General Lagos', localidad: '', club: '' });
  assert.equal(deporteDeObra(ruta('Pádel', 'Cancha completa', 'X - Y'), {}), 'padel');
  assert.equal(deporteDeObra(ruta('Pádel', 'Cesped solo', 'X - Y'), {}), 'cesped_padel');
  assert.equal(deporteDeObra(ruta('Fútbol', 'X - Y'), {}), 'futbol');
  assert.equal(deporteDeObra(ruta('Hockey', 'X - Y'), {}), 'hockey');
  assert.equal(deporteDeObra(ruta('X - Y'), { deporte: 'Pádel', tipo: 'Solo césped' }), 'cesped_padel');
  assert.equal(deporteDeObra(ruta('X - Y'), { deporte: 'Pádel', tipo: 'Cancha completa panorámica' }), 'padel');
  assert.equal(deporteDeObra(ruta('X - Y'), {}), null);
  assert.equal(provinciaNormalizada('Provincia de Buenos Aires'), 'Buenos Aires');
  assert.equal(provinciaNormalizada('Capital Federal'), 'CABA');
  assert.equal(provinciaNormalizada('santa fe'), 'Santa Fe');
  assert.equal(provinciaNormalizada('Marte'), null);
});

test('una carpeta del bot se convierte en los datos de una obra', () => {
  const v = describirCarpeta({ id: 'c1', nombre: 'Federico Villaverde - Ituzaingó', ruta: ruta('Pádel', 'Cancha completa', 'Federico Villaverde - Ituzaingó') }, VILLAVERDE);
  assert.deepEqual([v.deporte, v.cantidad, v.anio, v.ciudad, v.provincia, v.tipo], ['padel', 4, 2026, 'Ituzaingó', 'Buenos Aires', 'Cancha completa panorámica']);
  assert.match(v.link, /^https:\/\/maps\.app\.goo\.gl\//);
  const q = describirCarpeta({ id: 'c2', nombre: '15 Cero - Saavedra', ruta: ruta('Pádel', 'Cancha completa', '15 Cero - Saavedra') }, QUINCE);
  assert.deepEqual([q.cantidad, q.ciudad, q.barrio, q.provincia, q.tipo], [6, 'Buenos Aires', 'Saavedra', 'CABA', 'Cancha completa panorámica · Monofilamento azul']);
  const g = describirCarpeta({ id: 'c3', nombre: 'General Lagos', ruta: ruta('Pádel', 'Cancha completa', 'General Lagos') }, LAGOS_PADEL);
  assert.deepEqual([g.cantidad, g.provincia, g.link, g.ciudad], [2, null, '', '']);
  const rep = describirCarpeta({ id: 'c4', nombre: 'Ana López - Rosario', ruta: ruta('Fútbol', 'Ana López - Rosario') }, 'Cliente: Ana López\nCésped: Césped de Ana López 44 mm');
  assert.equal(rep.tipo, '', 'un texto libre que repite el nombre del cliente no se publica');
});

test('emparejar con las obras que ya están en el Sheet', () => {
  const info = (cliente, localidad, deporte, ciudad = localidad) => ({ cliente, localidad, ciudad, deporte });
  const obras = [
    obra({ id: '1237', deporte: 'padel', _referencia: 'Federico Villaverde', ciudad: 'Ituzaingó' }),
    obra({ id: '1238', deporte: 'padel', _referencia: '15 Cero', ciudad: 'Buenos Aires' }),
    obra({ id: '1240', deporte: 'padel', _referencia: 'Sergio Puyol - Gorila Gym', ciudad: 'San Miguel' }),
    obra({ id: '0455', deporte: 'futbol', _referencia: 'Sergio Puyol', ciudad: 'San Miguel' }),
    obra({ id: '0217', deporte: 'cesped_padel', _referencia: 'Eduardo Quinodoz', ciudad: 'Hurlingham' }),
    obra({ id: '0220', deporte: 'cesped_padel', _referencia: 'Luis Eduardo Quinodoz', ciudad: 'Hurlingham' }),
    obra({ id: '0075', deporte: 'futbol', _referencia: 'Pablo', ciudad: 'Lanús' }),
    obra({ id: '0076', deporte: 'futbol', _referencia: 'Pablo', ciudad: 'Tigre' }),
  ];
  const ids = (i) => emparejar(i, obras).map((o) => o.id);
  assert.deepEqual(ids(info('Federico Villaverde', 'Ituzaingó', 'padel')), ['1237']);
  assert.deepEqual(ids(info('15 Cero', 'Saavedra', 'padel', 'Buenos Aires')), ['1238'], 'dos palabras iguales: vale aunque la ciudad sea un barrio');
  assert.deepEqual(ids(info('Sergio Puyol', 'San Miguel', 'padel')), ['1240'], 'el de fútbol es otra obra');
  assert.deepEqual(ids(info('Sergio Puyol', 'San Miguel', 'futbol')), ['0455']);
  assert.deepEqual(ids(info('Eduardo Quinodoz', 'Hurlingham', 'cesped_padel')), ['0217', '0220'], 'se parecen: las dos');
  assert.deepEqual(ids(info('Pablo', 'Lanús', 'futbol')), ['0075'], 'un solo nombre pide la misma ciudad');
  assert.deepEqual(ids(info('Pablo', 'Mendoza', 'futbol')), []);
  assert.ok(esPiezaGrafica('SLAVON_FedericoVillaverde_PeakPadel_02.jpg') && !esPiezaGrafica('WhatsApp Image.jpeg'));
});

// ---- de punta a punta con el Sheet y Drive en memoria
async function entorno() {
  const base = [COLUMNAS,
    fila({ id: '0001', club: 'Club Los Pinos', mostrar: 'Club Los Pinos', ref: 'Marcelo Quintana', deporte: 'Fútbol', ciudad: 'Villa Allende', prov: 'Córdoba', link: '-31.29, -64.29' }),
  ];
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'slavon-bot-'));
  await fs.mkdir(path.join(raiz, 'public'), { recursive: true });
  await fs.writeFile(path.join(raiz, 'public', 'index.html'), '<html></html>');
  await fs.writeFile(path.join(raiz, 'public', 'config.json'), '{}');
  const almacen = new AlmacenMemoria({ MAPA: base, INTERNO: [COLUMNAS_INTERNO] });
  const nombres = almacen.tabs.MAPA.map((f) => f[2]);
  await prepararSheet(almacen);
  nombres.forEach((v, i) => { if (v !== undefined) almacen.tabs.MAPA[i][2] = v; });
  const comun = { almacen, raiz, salida: path.join(raiz, '_site'), cacheFotos: path.join(raiz, '.cache'), opcionesGeo: { fetchFn: async () => ({ ok: true, json: async () => [] }), pausaMs: 0 }, sha: '' };
  const publicado = async () => JSON.parse(await fs.readFile(path.join(raiz, '_site', 'data', 'obras-publicas.json'), 'utf8'));
  const avisos = () => (almacen.tabs.AVISOS ?? []).slice(9).filter((f) => f?.length);
  const filasMapa = () => almacen.tabs.MAPA.slice(1).filter((f) => f && String(f[0] ?? '') !== '');
  return { almacen, comun, publicado, avisos, filasMapa };
}
const png = (color) => sharp({ create: { width: 40, height: 30, channels: 3, background: color } }).png().toBuffer();

test('MIGUELITO archiva → el robot carga la obra, la emparejan las que ya existen, las fotos entran solas y nada se publica incompleto', async () => {
  const { almacen, comun, publicado, avisos, filasMapa } = await entorno();
  // 1) una obra completa y nueva. Sus fotos están en la carpeta del bot (no salen) y una copia en la carpeta del mapa (esa sí)
  const villaverde = almacen.agregarCarpetaBot(['Pádel', 'Cancha completa', 'Federico Villaverde - Ituzaingó'], VILLAVERDE);
  const f1 = await png('#ff0000'), f2 = await png('#00ff00');
  almacen.agregarFotoBot(villaverde, 'WhatsApp Image 1.jpeg', f1);
  almacen.agregarFotoBot(villaverde, 'WhatsApp Image 2_privada.jpeg', await png('#0000ff'));
  almacen.agregarFotoBot(villaverde, 'SLAVON_FedericoVillaverde_PeakPadel_02.jpg', await png('#ffff00'));
  almacen.agregarFotoBot(villaverde, 'WhatsApp Image 3.jpeg', f2);
  // 2) una obra nueva a la que le falta la cantidad y la ubicación → no se publica
  const lagos = almacen.agregarCarpetaBot(['Pádel', 'Cancha completa', 'General Lagos'], 'Cliente: General Lagos\nDeporte: Pádel');
  almacen.agregarFotoBot(lagos, 'a.jpeg', await png('#00ffff'));
  // 3) una carpeta del bot que corresponde a una obra que ya existe (cliente en «Nombre de referencia»)
  const pinos = almacen.agregarCarpetaBot(['Fútbol', 'Marcelo Quintana - Villa Allende'], 'Cliente: Marcelo Quintana\nDeporte: Fútbol');
  almacen.agregarFotoBot(pinos, 'cancha.jpeg', await png('#999999'));
  // 4) una carpeta sin deporte y otra con fotos pero sin datos.txt: solo avisos
  almacen.agregarCarpetaBot(['Varios', 'Fulano - Algún lugar'], 'Cliente: Fulano');
  const suelta = almacen.agregarCarpetaBot(['Varios', 'Sin datos - Lugar']);
  almacen.agregarFotoBot(suelta, 'x.jpeg', await png('#123456'));
  // 5) la misma foto de Villaverde también está en la carpeta del mapa (la copió el bot a mano): no se repite
  almacen.carpetas.push({ id: 'cm1', nombre: '0002 - Federico Villaverde - Ituzaingó' });
  almacen.agregarFoto('cm1', 'copia.jpeg', f1);

  const r = await ejecutar({ ...comun, modo: 'manual' });
  assert.equal(r.publicar, true);
  const mapa = filasMapa();
  assert.equal(mapa.length, 3, 'las 2 obras nuevas del bot + la que ya estaba');
  const [, , , refV, depV, tipoV, canV, ciuV, provV, , anioV, , linkV, nomV, , pubV, notasV] = mapa[1];
  assert.deepEqual([mapa[1][0], refV, depV, tipoV, canV, ciuV, provV, anioV, nomV, pubV], ['0002', 'Federico Villaverde', 'Pádel', 'Cancha completa panorámica', 4, 'Ituzaingó', 'Buenos Aires', 2026, false, true]);
  assert.match(linkV, /^https:\/\/maps\.app\.goo\.gl\//);
  assert.match(notasV, /Cargada automáticamente desde la carpeta del bot «Federico Villaverde - Ituzaingó»/);
  assert.match(notasV, /Dirección: Av\. Presidente Perón 6830/);
  assert.equal(mapa[2][15], false, 'la que no tiene cantidad ni ubicación no se publica');
  assert.match(mapa[2][16], /SIN PUBLICAR hasta tener: cantidad de canchas y ubicación/);
  const interno = almacen.tabs.INTERNO.slice(1).find((f) => f[0] === '0002');
  assert.deepEqual([interno[1], interno[4]], ['Federico Villaverde', 'bot fotos'], 'el cliente y la dirección van a INTERNO');
  const bot = almacen.tabs.BOT;
  assert.ok(bot.length === 4 && bot.some((f) => f[3] === 'si' && f[2] === '0002'), 'queda anotado qué carpeta del bot es cada obra');
  // la obra publicada: nombre genérico, ubicación aproximada, fotos sin la privada ni la pieza gráfica ni repetidas
  const pub = (await publicado()).obras;
  const v = pub.find((o) => o.id === '0002');
  assert.equal(v.nombrable, false);
  assert.match(v.nombre_club, /^Complejo de pádel – Ituzaingó, Buenos Aires$/);
  assert.equal(v.fotos.length, 1, 'solo la que el bot copió a la carpeta del mapa: las fotos de SU carpeta no salen solas');
  assert.ok(!pub.some((o) => o.id === '0003'), 'la obra incompleta no sale');
  assert.equal((pub.find((o) => o.id === '0001').fotos ?? []).length, 0, 'las fotos de la carpeta del bot no se publican sin pasar por la carpeta de la obra');
  const texto = JSON.stringify(await publicado());
  for (const secreto of ['Villaverde', 'Perón', 'Peak', 'Quintana']) assert.ok(!texto.includes(secreto), secreto);
  const lista = avisos();
  assert.ok(lista.some((f) => f[0] === 'NUEVA DEL BOT' && f[1] === '0002' && /ya publicada/.test(f[2])));
  assert.ok(lista.some((f) => f[0] === 'NUEVA DEL BOT' && f[1] === '0003' && /SIN PUBLICAR: falta cantidad de canchas y ubicación/.test(f[2])));
  assert.ok(lista.some((f) => /Fulano - Algún lugar/.test(f[2]) && /deporte/.test(f[2])));
  assert.ok(lista.some((f) => /Sin datos - Lugar/.test(f[2]) && /no tiene datos\.txt/.test(f[2])));

  // 6) otra vuelta no duplica nada
  const antes = JSON.stringify(almacen.tabs.MAPA);
  await ejecutar({ ...comun, modo: 'manual' });
  assert.equal(filasMapa().length, 3);
  assert.equal(JSON.stringify(almacen.tabs.MAPA.map((f) => f?.slice(0, 15))), JSON.stringify(JSON.parse(antes).map((f) => f?.slice(0, 15))));

  // 7) llegan los datos que faltaban (el bot actualiza el datos.txt): se completa y se publica sola
  const datosLagos = almacen.bot.datos.find((d) => d.carpetaId === lagos);
  almacen.contenidos.set(datosLagos.id, Buffer.from('Cliente: General Lagos\nLocalidad: General Lagos\nDeporte: Pádel\nCantidad: 2 canchas\nProvincia: Santa Fe\nTipo: Cancha completa panorámica'));
  datosLagos.md5 = 'cambio';
  await ejecutar({ ...comun, modo: 'manual' });
  const l = filasMapa()[2];
  assert.deepEqual([l[6], l[7], l[8], l[15]], [2, 'General Lagos', 'Santa Fe', true]);
  assert.match(l[16], /Datos completos/);
  assert.ok((await publicado()).obras.some((o) => o.id === '0003'));

  // 8) si alguien borra la fila de una obra del bot a propósito, no se vuelve a crear
  const idx = almacen.tabs.MAPA.findIndex((f) => f?.[0] === '0002');
  almacen.tabs.MAPA.splice(idx, 1);
  await ejecutar({ ...comun, modo: 'manual' });
  assert.equal(filasMapa().length, 2);
  assert.ok(almacen.tabs.BOT.some((f) => f[6] === 'descartada'));
});

test('el robot que corre cada 5 minutos no toca la carpeta del bot; sin acceso a ella, nunca se publica sin las fotos', async () => {
  const { almacen, comun, filasMapa } = await entorno();
  const c = almacen.agregarCarpetaBot(['Fútbol', 'Ana - Rosario'], 'Cliente: Ana\nDeporte: Fútbol');
  const solo = await ejecutar({ ...comun, modo: 'poll' });
  assert.equal(solo.publicar, false);
  assert.equal(filasMapa().length, 1, 'en la vuelta corta no se importa nada');
  await ejecutar({ ...comun, modo: 'manual' });
  assert.equal(filasMapa().length, 2);
  almacen.bot.activo = false;   // dejan de compartirle la carpeta al robot
  await assert.rejects(ejecutar({ ...comun, modo: 'manual' }), /dejó de estar compartida/);
  assert.ok(c);
});

test('sin la carpeta del bot (todavía no compartida) todo sigue como antes y queda un aviso', async () => {
  const { almacen, comun, avisos } = await entorno();
  const r = await ejecutar({ ...comun, modo: 'manual' });
  assert.equal(r.publicar, true);
  assert.ok(avisos().some((f) => /No veo la carpeta «bot fotos»/.test(f[2])));
  assert.ok(!almacen.tabs.BOT);
});
