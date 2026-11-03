import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { limpiarNombre, clasificarNombre, parecePersona, aplicarPrivacidad, empiezaConNombreDePila } from './lib/nombres.mjs';
import { registroPublico, verificarFugas } from './lib/publico.mjs';

const obra = (o = {}) => ({ id: '0001', deporte: 'futbol', ciudad: 'Rosario', provincia: 'Santa Fe', pais: 'Argentina', lat: -32.94682, lng: -60.63932, cantidad_canchas: 1, estado: 'terminada', publicar: true, nombrable: false, destacada: false, ...o });

test('privacidad: los ejemplos de personas físicas nunca son nombrables, aunque digan «Club» o «Cancha de»', () => {
  for (const n of ['Cancha de Sandra Tosoni', 'Maico Girardi', 'Ausberto Ayllon Quispe', 'Emilio Luti', 'Club Sandra Tosoni', 'Cancha de Leonardo Fernández', 'Lo de Pali Fútbol 5', 'Veronica Futbol Tenis']) {
    assert.ok(parecePersona(n), `${n} debería parecer una persona`);
    assert.notEqual(clasificarNombre(obra({ nombre_club: n })).propuesta, 'nombrable', n);
  }
});

test('privacidad: clubes, colegios, estadios y empresas sí pueden mostrarse', () => {
  for (const n of ['Club Agrario Argentino', 'Colegio San Pedro', 'Club Atlético Boca Juniors', 'Quality Padel', 'Country Santa Teresa', 'Sindicato de Petroleros', 'Club Atlético 9 de Julio', 'Tiro Federal y Deportivo Morteros']) {
    assert.ok(!parecePersona(n), `${n} no debería parecer una persona`);
    assert.equal(clasificarNombre(obra({ nombre_club: n })).propuesta, 'nombrable', n);
  }
});

test('privacidad: un lugar con nombre de persona (Vicente López) no es una persona', () => {
  assert.ok(!parecePersona('Megatlon Vicente López', { ciudad: 'Vicente López' }));
  assert.equal(clasificarNombre(obra({ nombre_club: 'Club Trovador', ciudad: 'Vicente López' })).propuesta, 'nombrable');
});

test('limpieza del nombre: direcciones, pedidos, opciones y personas agregadas', () => {
  const casos = {
    'Sergio Cancio. Presidente del Club Agrario Argentino': 'Club Agrario Argentino',
    'Calle 31 nº 753 - Club Alcatraz': 'Club Alcatraz',
    'Barrio Santa Teresa Pedido N°988': 'Barrio Santa Teresa',
    'Belgrano Day School Op1': 'Belgrano Day School',
    'Fútbol 5 Los amigos. Complejo deportivo Op N°3': 'Fútbol 5 Los amigos. Complejo deportivo',
    'Mutual ALEA - Belgrano 1849': 'Mutual ALEA',
    'Complejo Atila - Calle Simón Bolívar sin número': 'Complejo Atila',
    'Las Palomas, entre Los Jacarandáes y Los Chañares': 'Las Palomas',
    'Alejandro Ferrarotti (Ranch Sport)': 'Ranch Sport',
    'Club Banco Macro - Jorge Horacio Brito': 'Club Banco Macro',
    'Fútbol 5 Posadas': 'Fútbol 5 Posadas',
    'Club 25 de Mayo': 'Club 25 de Mayo',
  };
  for (const [crudo, esperado] of Object.entries(casos)) assert.equal(limpiarNombre(crudo), esperado, crudo);
});

test('privacidad: una decisión manual «nombrable» no puede mostrar a una persona física', () => {
  const o = obra({ id: '0791', nombre_club: 'Cancha de Sandra Tosoni' });
  const [fila] = aplicarPrivacidad([o], new Map([['0791', 'nombrable']]));
  assert.equal(o.nombrable, false);
  assert.match(fila.motivo, /Bloqueada/);
});

test('privacidad: la decisión de la persona manda sobre el cálculo automático', () => {
  const o = obra({ id: '0002', nombre_club: 'Megatlon' });          // automático: revisar
  aplicarPrivacidad([o], new Map());
  assert.equal(o.nombrable, false);
  aplicarPrivacidad([o], new Map([['0002', 'nombrable']]));
  assert.equal(o.nombrable, true);
  assert.equal(o.nombre_publico, 'Megatlon');
  const o2 = obra({ id: '0003', nombre_club: 'Club Los Pinos' });  // automático: nombrable
  aplicarPrivacidad([o2], new Map([['0003', 'anonima']]));
  assert.equal(o2.nombrable, false);
});

test('privacidad: la versión pública redondea TODAS las coordenadas, también las de obras con nombre', () => {
  const o = obra({ nombre_club: 'Club Los Pinos' });
  aplicarPrivacidad([o]);
  assert.equal(o.nombrable, true);
  const { reg } = registroPublico(o);
  assert.equal(reg.lat, -32.95);
  assert.equal(reg.lng, -60.64);
  assert.throws(() => verificarFugas([{ ...reg, lat: -32.94682 }], [o]), /más de 2 decimales/);
  assert.throws(() => verificarFugas([{ ...reg, nombre_club: 'Cancha de Sandra Tosoni', nombrable: true }], [o]), /persona física/);
});

test('privacidad (datos reales): el JSON público no tiene coordenadas con más de 2 decimales ni nombres de personas', { skip: !fs.existsSync(new URL('../public/data/obras-publicas.json', import.meta.url)) }, () => {
  const { obras } = JSON.parse(fs.readFileSync(new URL('../public/data/obras-publicas.json', import.meta.url), 'utf8'));
  const decimales = (n) => (n === null ? 0 : (String(n).split('.')[1] ?? '').length);
  const largas = obras.filter((o) => decimales(o.lat) > 2 || decimales(o.lng) > 2).map((o) => o.id);
  assert.deepEqual(largas, [], 'coordenadas con más de 2 decimales');
  const personas = obras.filter((o) => o.nombrable && parecePersona(o.nombre_club, o) && !/\b(colegio|escuela|instituto|universidad|municipalidad|municipio|country|barrio|sindicato|gremio|estadio|polideportivo|cooperativa|fundaci[oó]n|mutual|anfiteatro|sociedad|asociaci[oó]n)\b/i.test(o.nombre_club)).map((o) => `${o.id}: ${o.nombre_club}`);
  assert.deepEqual(personas, [], 'nombres que parecen de una persona física');
  const conPila = obras.filter((o) => o.nombrable && empiezaConNombreDePila(o.nombre_club)).map((o) => `${o.id}: ${o.nombre_club}`);
  assert.deepEqual(conPila, [], 'nombres que empiezan con un nombre de pila + Club/Municipalidad/Instituto/Barrio');
  const sucios = obras.filter((o) => o.nombrable && /(pedido|\bop\s?n?[°º]?\s?\d|\bcalle\b|\bentre\b|\bpresidente del\b|\b\d{4,}\b)/i.test(o.nombre_club)).map((o) => `${o.id}: ${o.nombre_club}`);
  assert.deepEqual(sucios, [], 'nombres con dirección, pedido u opción');
});

test('formato «nombre de pila + Club/Municipalidad/Instituto/Barrio» al inicio = persona; se muestra sin el nombre de pila', () => {
  const casos = {
    'Gladys Esther Quinteiros (Club Defensores Unidos)': 'Club Defensores Unidos',
    'Pablo Club Atletico Susanense': 'Club Atlético Susanense',
    'Melisa Club Sastre': 'Club Sastre',
    'Cristian Club Tiro Federal y Deportivo Morteros': 'Club Tiro Federal y Deportivo Morteros',
    'Hernan Club Uribelarrea': 'Club Uribelarrea',
    'Ale del Instituto Cardenal Newman': 'Instituto Cardenal Newman',
    'Alejandro de bardas padel': 'Bardas Pádel',
    'Antonio Barrio "La Alegria"': 'Barrio La Alegría',
    'Eugenia Municipalidad de Valcheta': 'Municipalidad de Valcheta',
  };
  for (const [crudo, esperado] of Object.entries(casos)) {
    assert.equal(limpiarNombre(crudo), esperado, crudo);
    const r = clasificarNombre(obra({ nombre_club: crudo }));
    assert.equal(r.propuesta, 'nombrable', crudo);
    assert.ok(!empiezaConNombreDePila(r.limpio), `${r.limpio} no debe empezar con un nombre de pila`);
  }
  for (const crudo of ['Pablo Club Atletico Susanense', 'Melisa Club Sastre', 'Ale del Instituto Cardenal Newman', 'Antonio Barrio "La Alegria"', 'Eugenia Municipalidad de Valcheta', 'Nicolas Municipalidad']) {
    assert.ok(empiezaConNombreDePila(crudo) && parecePersona(crudo), `${crudo} debe contar como persona`);
  }
  assert.equal(clasificarNombre(obra({ nombre_club: 'Nicolas Municipalidad' })).propuesta, 'anonima');
});

test('anónimas pedidas: empresas y nombres genéricos', () => {
  for (const n of ['Bolivar - Padel Completa', 'Palacios Construcciones', 'Pose Sa - Tecma Sa Viviendas U.t', 'Tecnosolutions SRL', 'Quintana Energy', 'Municipio', 'Fútbol 5', 'Complejo Deportivo']) {
    assert.equal(clasificarNombre(obra({ nombre_club: n })).propuesta, 'anonima', n);
  }
  for (const n of ['Club 77', 'Domo Padel', 'Arena 360°', 'Municipalidad de Lanús', 'Club 25 de Mayo']) {
    assert.equal(clasificarNombre(obra({ nombre_club: n })).propuesta, 'nombrable', n);   // llevan un nombre propio: no son genéricas
  }
});

test('nombres confirmados por el dueño: se muestran con el nombre exacto, aunque el cálculo automático dijera otra cosa', () => {
  const o = obra({ id: '0651', nombre_club: 'Estadio Alberto J. Armando', ciudad: 'Buenos Aires', provincia: 'CABA' });
  const o2 = obra({ id: '0631', nombre_club: 'Anfiteatro "Presidente Arturo Umberto Illia" - CONMEBOL' });
  const o3 = obra({ id: '1229', nombre_club: 'Megatlon', ciudad: null, provincia: null });
  const conf = new Map([['0651', 'Estadio Alberto J. Armando (Boca Juniors)'], ['0631', 'Anfiteatro CONMEBOL'], ['1229', 'Megatlon – Vicente López']]);
  aplicarPrivacidad([o, o2, o3], new Map([['0631', 'anonima']]), conf);   // la confirmación manda también sobre revisar-nombres.xlsx
  assert.deepEqual([o.nombrable, o2.nombrable, o3.nombrable], [true, true, true]);
  assert.equal(registroPublico(o).reg.nombre_club, 'Estadio Alberto J. Armando (Boca Juniors)');
  assert.equal(registroPublico(o2).reg.nombre_club, 'Anfiteatro CONMEBOL');
  assert.equal(registroPublico(o3).reg.nombre_club, 'Megatlon – Vicente López');
  const sin = obra({ id: '0651', nombre_club: 'Estadio Alberto J. Armando' });
  aplicarPrivacidad([sin]);
  assert.equal(sin.nombrable, false, 'sin confirmación, un estadio con nombre de persona queda a revisar');
});
