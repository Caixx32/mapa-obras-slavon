import test from 'node:test';
import assert from 'node:assert/strict';
import { construirPublico, registroPublico, verificarFugas, calcularMeta, CAMPOS_PUBLICOS } from './lib/publico.mjs';
import { nombreGenerico } from './lib/util.mjs';

const base = {
  id: '0001', nombre_club: 'Club Los Pinos', deporte: 'futbol', tipo: 'Césped 44 mm profesional', cantidad_canchas: 2,
  provincia: 'Córdoba', ciudad: 'Villa Allende', pais: 'Argentina', lat: -31.29567, lng: -64.29481, anio: 2024, estado: 'terminada',
  descripcion_corta: 'Dos canchas de fútbol.', video_url: null, nombrable: false, destacada: false, publicar: true,
  fuente: 'B:FEDE f9', cliente_interno: 'Juan Carlos Pérez', direccion_interna: 'Av. Siempreviva 742', nota_mapa: 'nota', revisar: 'x',
};
const obra = (o = {}) => ({ ...base, ...o });
const sinFotos = new Map();

test('obra no nombrable: nombre genérico, coordenadas redondeadas y sin campos internos', () => {
  const { reg } = registroPublico(obra());
  assert.equal(reg.nombre_club, 'Complejo de fútbol – Villa Allende, Córdoba');
  assert.equal(reg.lat, -31.3);
  assert.equal(reg.lng, -64.29);
  assert.equal(reg.nombrable, false);
  assert.deepEqual(Object.keys(reg).sort(), [...CAMPOS_PUBLICOS].sort());
  const txt = JSON.stringify(reg);
  for (const prohibido of ['Los Pinos', 'Juan Carlos', 'Siempreviva', 'B:FEDE', 'fuente', 'cliente_interno']) assert.ok(!txt.includes(prohibido), prohibido);
});

test('obra nombrable: muestra el club y las coordenadas exactas', () => {
  const { reg } = registroPublico(obra({ nombrable: true }));
  assert.equal(reg.nombre_club, 'Club Los Pinos');
  assert.equal(reg.lat, -31.29567);
  assert.equal(reg.nombrable, true);
});

test('nombrable = si pero sin nombre_club: usa el genérico y avisa', () => {
  const { reg, avisos } = registroPublico(obra({ nombrable: true, nombre_club: null }));
  assert.match(reg.nombre_club, /^Complejo de fútbol/);
  assert.equal(reg.nombrable, false);
  assert.equal(avisos.length, 1);
});

test('publicar = no: la obra no aparece en la versión pública', () => {
  const { json } = construirPublico([obra(), obra({ id: '0002', publicar: false })], sinFotos, 'x');
  assert.deepEqual(json.obras.map((o) => o.id), ['0001']);
});

test('descripcion_corta que nombra al club real de una obra no nombrable se descarta', () => {
  const { reg, avisos } = registroPublico(obra({ descripcion_corta: 'Cancha del Club Los Pinos con césped nuevo' }));
  assert.equal(reg.descripcion_corta, null);
  assert.equal(avisos.length, 1);
});

test('verificarFugas: falla si el nombre de un cliente aparece en el texto público', () => {
  const o = obra();
  const { reg } = registroPublico(o);
  reg.tipo = 'Cancha de Juan Carlos Pérez';
  assert.throws(() => verificarFugas([reg], [o]), /posibles fugas/);
});

test('verificarFugas: falla con mails, teléfonos, links y fotos privadas', () => {
  const o = obra();
  for (const [campo, valor] of [['descripcion_corta', 'escribir a ventas@club.com'], ['descripcion_corta', 'llamar al 11 5555-1234'], ['tipo', 'https://sitio.com'], ['fotos', [{ src: 'fotos/0001/abc_privada.webp', thumb: 'x' }]]]) {
    const { reg } = registroPublico(o);
    reg[campo] = valor;
    assert.throws(() => verificarFugas([reg], [o]), /fugas/, campo);
  }
});

test('verificarFugas: falla si una obra no nombrable queda con coordenadas exactas', () => {
  const o = obra();
  const { reg } = registroPublico(o);
  reg.lat = -31.29567;
  assert.throws(() => verificarFugas([reg], [o]), /coordenadas/);
});

test('verificarFugas: no se queja de coordenadas ya redondeadas ni de nombres de ciudades', () => {
  const o = obra({ cliente_interno: 'Villa Allende' }); // un «cliente» que se llama igual que la ciudad no es una fuga
  const { reg } = registroPublico(o);
  assert.doesNotThrow(() => verificarFugas([reg], [o]));
  const entero = registroPublico(obra({ lat: -36.0003, lng: -58.1400001 })).reg; // -36 y -58.14
  assert.doesNotThrow(() => verificarFugas([entero], [obra()]));
});

test('contadores: solo cuentan obras terminadas; titular nunca supera el total', () => {
  const regs = [
    { estado: 'terminada', deporte: 'padel', cantidad_canchas: 3, pais: 'Argentina', provincia: 'Salta' },
    { estado: 'terminada', deporte: 'cesped_padel', cantidad_canchas: 2, pais: 'Argentina', provincia: 'Salta' },
    { estado: 'terminada', deporte: 'futbol', cantidad_canchas: 100, pais: 'Argentina', provincia: 'Jujuy' },
    { estado: 'en_obra', deporte: 'futbol', cantidad_canchas: 50, pais: 'Argentina', provincia: 'Chubut' },
    { estado: 'terminada', deporte: 'tenis', cantidad_canchas: 1, pais: 'Uruguay', provincia: 'Salto' },
  ];
  const m = calcularMeta(regs);
  assert.equal(m.total_canchas, 106);
  assert.equal(m.canchas_padel, 5);
  assert.equal(m.canchas_cesped, 101);
  assert.equal(m.provincias, 2); // Chubut está en obra; Uruguay no cuenta como provincia
  assert.deepEqual(m.paises, ['Argentina', 'Uruguay']);
  assert.equal(m.titular_n, 100);
  assert.ok(m.titular_n <= m.total_canchas);
});

test('nombre genérico por deporte', () => {
  assert.equal(nombreGenerico({ deporte: 'padel', ciudad: 'Rosario', provincia: 'Santa Fe' }), 'Complejo de pádel – Rosario, Santa Fe');
  assert.equal(nombreGenerico({ deporte: 'cesped_padel', ciudad: null, provincia: 'CABA' }), 'Complejo de pádel – CABA');
  assert.equal(nombreGenerico({ deporte: 'residencial', ciudad: 'Tigre', provincia: 'Buenos Aires' }), 'Espacio residencial – Tigre, Buenos Aires');
});

test('verificarFugas: el nombre autorizado de un club puede repetir al cliente del mismo club', () => {
  const o = obra({ nombrable: true, nombre_club: 'Club Sportivo Italiano', cliente_interno: 'Sportivo Italiano' });
  const { reg } = registroPublico(o);
  assert.equal(reg.nombre_club, 'Club Sportivo Italiano');
  assert.doesNotThrow(() => verificarFugas([reg], [o]));
});

test('verificarFugas: una copia oculta de un club ya publicado no es fuga, pero un club oculto distinto sí', () => {
  const visible = obra({ id: '0002', nombrable: true, nombre_club: 'Fútbol 5 Los Amigos. Complejo deportivo' });
  const copiaOculta = obra({ id: '0003', nombrable: false, publicar: false, nombre_club: 'Los Amigos Complejo deportivo' });
  const { reg } = registroPublico(visible);
  assert.doesNotThrow(() => verificarFugas([reg], [visible, copiaOculta]));
  const otroOculto = obra({ id: '0004', nombrable: false, nombre_club: 'Club Secreto Reservado' });
  const conFuga = { ...reg, tipo: 'Cancha del Club Secreto Reservado' };
  assert.throws(() => verificarFugas([conFuga], [visible, otroOculto]), /fugas/);
});
