// Lo que archiva el bot de fotos (MIGUELITO) en la carpeta «bot fotos» de Drive entra solo al mapa:
//   · el datos.txt de cada carpeta de obra → obra nueva en MAPA (o se empareja con una que ya existe)
//   · las fotos de esa carpeta → fotos de esa obra (sin copiar nada a mano)
// Lógica pura y probada: no habla con Google (eso lo hace publicador.mjs). Los nombres de clientes van solo al Sheet y a AVISOS (privados).
import { norm, pad4 } from './util.mjs';
import { PROVINCIAS } from './preparar-sheet.mjs';
import { DEPORTE_ETIQUETA, ESTADO_ETIQUETA } from './mapa-sheet.mjs';

export const HOJA_BOT = 'BOT';
export const ENCABEZADO_BOT = ['carpeta_id', 'carpeta', 'obras', 'creada', 'pendiente', 'fecha', 'estado'];
const DIAS_AVISO = 14;   // una obra cargada por el robot figura en AVISOS durante dos semanas, para que se revise

// ---------------------------------------------------------------- datos.txt
const CLAVES = { cliente: 'cliente', localidad: 'localidad', ciudad: 'localidad', barrio: 'localidad', provincia: 'provincia', pais: 'pais', direccion: 'direccion', ubicacion: 'ubicacion', maps: 'ubicacion', 'link de google maps': 'ubicacion', deporte: 'deporte', cantidad: 'cantidad', tipo: 'tipo', cesped: 'cesped', medidas: 'medidas', fecha: 'fecha' };

/** «Clave: valor» (una por línea). Tolera viñetas, negritas, mayúsculas y acentos en las claves. Las líneas sin valor se ignoran. */
export function parsearDatos(texto) {
  const d = {};
  for (const linea of String(texto ?? '').replace(/\r/g, '').split('\n')) {
    const m = linea.replace(/^[\s>*•`#-]+/, '').match(/^([^:]{2,40}?)\s*:\s*(.*)$/);
    if (!m) continue;
    const clave = CLAVES[norm(m[1].replace(/\(.*?\)/g, ''))];
    const valor = m[2].replace(/[*`]+/g, '').trim();
    if (clave && valor && !(clave in d)) d[clave] = valor;
  }
  return d;
}

export function deporteDeTexto(t) {
  const n = norm(t);
  if (/hockey/.test(n)) return 'hockey';
  if (/futbol|futsal/.test(n)) return 'futbol';
  if (/padel/.test(n)) return 'padel';
  if (/tenis/.test(n)) return 'tenis';
  return null;
}

/** El deporte sale primero de las carpetas de arriba («Pádel / Cancha completa», «Pádel / Cesped solo», «Fútbol», «Hockey») y, si no, del datos.txt. */
export function deporteDeObra(ruta = [], datos = {}) {
  const cat = norm(ruta.slice(0, -1).join(' '));
  if (/hockey/.test(cat)) return 'hockey';
  if (/futbol/.test(cat)) return 'futbol';
  if (/padel/.test(cat)) {
    if (/completa/.test(cat)) return 'padel';
    if (/cesped/.test(cat)) return 'cesped_padel';
  }
  const d = deporteDeTexto(datos.deporte) ?? deporteDeTexto(ruta[ruta.length - 1]);
  if (d === 'padel') return /complet|panor/.test(norm(`${datos.tipo ?? ''} ${datos.cantidad ?? ''}`)) ? 'padel' : 'cesped_padel';
  return d;
}

/** «Cliente - Localidad (club)» → { cliente, localidad, club }. */
export function partesDeCarpeta(nombre) {
  let resto = String(nombre ?? '').trim();
  let club = '';
  const m = resto.match(/\(([^()]*)\)\s*$/);
  if (m) { club = m[1].trim(); resto = resto.slice(0, m.index).trim(); }
  const partes = resto.split(/\s+[-–—]\s+/).map((s) => s.trim()).filter(Boolean);
  if (partes.length >= 2) return { cliente: partes.slice(0, -1).join(' - '), localidad: partes[partes.length - 1], club };
  return { cliente: partes[0] ?? '', localidad: '', club };
}

// ---------------------------------------------------------------- provincia
const ALIAS_PROVINCIA = [
  [/^(capital federal|caba|c a b a|ciudad autonoma de buenos aires|ciudad de buenos aires)$/, 'CABA'],
  [/^(provincia de buenos aires|pcia de buenos aires|pba|bs as|bsas|buenos aires)$/, 'Buenos Aires'],
];
const ARGENTINAS = PROVINCIAS.slice(0, 24);   // de CABA a Tucumán (las de Uruguay y España no se deducen de una dirección)

export function provinciaNormalizada(texto) {
  const n = norm(texto);
  if (!n) return null;
  for (const [re, p] of ALIAS_PROVINCIA) if (re.test(n)) return p;
  return PROVINCIAS.find((p) => norm(p) === n) ?? PROVINCIAS.find((p) => n.endsWith(` ${norm(p)}`)) ?? null;
}

const BARRIOS_CABA = new Set(['agronomia', 'almagro', 'balvanera', 'barracas', 'belgrano', 'boedo', 'caballito', 'chacarita', 'coghlan', 'colegiales', 'constitucion', 'flores', 'floresta', 'la boca', 'la paternal', 'liniers', 'mataderos', 'monte castro', 'montserrat', 'nueva pompeya', 'nunez', 'palermo', 'parque avellaneda', 'parque chacabuco', 'parque chas', 'parque patricios', 'puerto madero', 'recoleta', 'retiro', 'saavedra', 'san cristobal', 'san nicolas', 'san telmo', 'velez sarsfield', 'versalles', 'villa crespo', 'villa del parque', 'villa devoto', 'villa general mitre', 'villa lugano', 'villa luro', 'villa ortuzar', 'villa pueyrredon', 'villa real', 'villa riachuelo', 'villa santa rita', 'villa soldati', 'villa urquiza']);

export function provinciaEnDireccion(direccion) {
  const n = ` ${norm(direccion)} `;
  if (/ (caba|capital federal|ciudad autonoma) /.test(n)) return 'CABA';
  return ARGENTINAS.find((p) => p !== 'CABA' && n.includes(` ${norm(p)} `)) ?? null;
}

// ---------------------------------------------------------------- una carpeta de obra del bot
const enlaceDeUbicacion = (t) => {
  const s = String(t ?? '');
  return s.match(/https?:\/\/\S+/)?.[0] ?? s.match(/-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+/)?.[0] ?? '';
};
const tokens = (s) => norm(s).split(' ').filter((t) => t && !['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'club', 'sa', 'srl'].includes(t));

/** Un texto libre (tipo, césped) que repite el nombre del cliente no se publica. */
const sinCliente = (texto, cliente) => {
  const t = String(texto ?? '').trim();
  if (!t || t.length > 60) return '';
  const palabras = new Set(norm(t).split(' '));
  return tokens(cliente).filter((x) => x.length >= 4).some((x) => palabras.has(x)) ? '' : t;
};

/**
 * carpeta = { id, nombre, ruta: [...carpetas de arriba..., nombre] }; textoDatos = contenido de su datos.txt.
 * provinciaPorCiudad = Map(ciudad normalizada → provincia) con lo que ya hay en el Sheet.
 */
export function describirCarpeta(carpeta, textoDatos, provinciaPorCiudad = new Map()) {
  const datos = parsearDatos(textoDatos);
  const p = partesDeCarpeta(carpeta.nombre);
  const cliente = datos.cliente || p.cliente;
  const localidad = datos.localidad || p.localidad;
  const provincia = provinciaNormalizada(datos.provincia) || provinciaEnDireccion(datos.direccion) || provinciaPorCiudad.get(norm(localidad)) || (BARRIOS_CABA.has(norm(localidad)) ? 'CABA' : null);
  const caba = provincia === 'CABA';
  const n = String(datos.cantidad ?? '').match(/\d+/);
  const deporte = deporteDeObra(carpeta.ruta, datos);
  const largo = (t) => (String(t ?? '').length <= 60 ? String(t ?? '').trim() : '');
  const tipoBase = ['padel', 'cesped_padel'].includes(deporte) ? [sinCliente(datos.tipo, cliente), sinCliente(largo(datos.cesped), cliente)] : [sinCliente(largo(datos.cesped) || datos.tipo, cliente)];
  return {
    carpetaId: carpeta.id, nombre: carpeta.nombre, cliente, localidad, club: p.club, deporte,
    ciudad: caba ? 'Buenos Aires' : localidad, barrio: caba ? localidad : '', provincia,
    pais: datos.pais || 'Argentina', cantidad: n ? Math.min(Number(n[0]), 99) : null,
    anio: Number(String(datos.fecha ?? '').match(/\b(20\d\d)\b/)?.[1]) || null,
    link: enlaceDeUbicacion(datos.ubicacion), tipo: tipoBase.filter(Boolean).join(' · '),
    cesped: datos.cesped ?? '', medidas: datos.medidas ?? '', direccion: datos.direccion ?? '',
  };
}

// ---------------------------------------------------------------- emparejar con las obras que ya están en el Sheet
const mismoLugar = (a, b) => { const x = norm(a), y = norm(b); return !x || !y || x === y || x.includes(y) || y.includes(x); };
const contiene = (a, b) => a.length > 0 && a.every((t) => b.includes(t));

/** Obras del mismo deporte cuyo nombre de referencia (o cliente) es el mismo que el de la carpeta. Nombre igual de 2+ palabras: vale aunque cambie la ciudad (ej. barrio de Capital). */
export function emparejar(info, obras) {
  const tc = tokens(info.cliente);
  if (!tc.length) return [];
  return obras.filter((o) => {
    if (o.deporte !== info.deporte) return false;
    return [o._referencia, o.cliente_interno].filter(Boolean).some((r) => {
      const tr = tokens(r);
      const igual = norm(r) === norm(info.cliente);
      if (igual && tc.length >= 2) return true;
      const incluido = (tc.length >= 2 && contiene(tc, tr)) || (tr.length >= 2 && contiene(tr, tc));
      return (igual || incluido) && (mismoLugar(o.ciudad, info.localidad) || mismoLugar(o.ciudad, info.ciudad));
    });
  });
}

// ---------------------------------------------------------------- el plan
const FALTAN = (info, actual = {}) => {
  const f = [];
  if (!(actual.cantidad ?? info.cantidad)) f.push('cantidad de canchas');
  if (!(actual.link || info.link) && !((actual.ciudad || info.ciudad) && (actual.provincia || info.provincia))) f.push('ubicación (link de Google Maps, o ciudad y provincia)');
  return f;
};

export function filasLibres(mapa, col, cuantas) {
  const claves = ['ID', 'Nombre del club', 'Nombre de referencia', 'Ciudad', 'Provincia', 'Deporte', 'Link de Google Maps'].map((c) => col[c]).filter((i) => i >= 0);
  const libres = [];
  for (let i = 1; libres.length < cuantas && i < 5000; i++) {
    const f = mapa[i];
    if (!f || claves.every((c) => String(f[c] ?? '').trim() === '')) libres.push(i + 1);   // número de fila en el Sheet
  }
  return libres;
}

export function leerMemoria(filas = []) {
  const m = new Map();
  for (const f of filas.slice(1)) {
    if (!f?.[0]) continue;
    m.set(String(f[0]), { carpeta: String(f[1] ?? ''), obras: String(f[2] ?? '').split(',').map((s) => s.trim()).filter(Boolean).map(pad4), creada: f[3] === 'si', pendiente: f[4] === 'si', fecha: String(f[5] ?? ''), estado: String(f[6] || 'activa') });
  }
  return m;
}
export const filasDeMemoria = (m) => [ENCABEZADO_BOT, ...[...m.entries()].map(([id, e]) => [id, e.carpeta, e.obras.join(','), e.creada ? 'si' : '', e.pendiente ? 'si' : '', e.fecha, e.estado])];

/**
 * infos = describirCarpeta de cada carpeta con datos.txt · obras = obras del Sheet (leerObras) · memoria = pestaña BOT.
 * leerCelda(obra, columna) = lo que hay escrito en MAPA · siguienteId = número · libres = filas vacías de MAPA · hoy = 'AAAA-MM-DD'.
 * Devuelve { vinculos: Map(carpetaId → [id de obra]), nuevas, cambios, memoria, avisos }.
 */
export function planificar({ infos, obras, memoria, leerCelda, siguienteId, libres, hoy }) {
  const porId = new Map(obras.map((o) => [o.id, o]));
  const mem = new Map(memoria);
  const vinculos = new Map();
  const nuevas = [];
  const cambios = [];
  const avisos = [];
  let proximo = siguienteId;
  const reciente = (fecha) => fecha && (Date.parse(hoy) - Date.parse(fecha)) / 86_400_000 <= DIAS_AVISO;

  for (const info of infos) {
    if (!info.cliente) { avisos.push({ tipo: 'AVISO', id: '', texto: `Carpeta del bot «${info.nombre}»: no encuentro el cliente (ni en datos.txt ni en el nombre). No se cargó.` }); continue; }
    if (!info.deporte) { avisos.push({ tipo: 'AVISO', id: '', texto: `Carpeta del bot «${info.nombre}»: no sé de qué deporte es (ponelo en datos.txt, «Deporte:»). No se cargó.` }); continue; }
    const entrada = mem.get(info.carpetaId);

    if (entrada?.estado === 'descartada') continue;
    const vivos = (entrada?.obras ?? []).filter((id) => porId.has(id));
    if (entrada && vivos.length) {
      vinculos.set(info.carpetaId, vivos);
      if (entrada.creada && vivos.length === 1) completarObra(info, porId.get(vivos[0]), entrada);
      continue;
    }

    const coinciden = emparejar(info, obras);
    if (coinciden.length > 3) { avisos.push({ tipo: 'AVISO', id: '', texto: `Carpeta del bot «${info.nombre}»: coincide con ${coinciden.length} obras del mapa; no puedo saber a cuál va. Ponele el mismo nombre de referencia a la que corresponda.` }); continue; }
    if (coinciden.length) {
      vinculos.set(info.carpetaId, coinciden.map((o) => o.id));
      mem.set(info.carpetaId, { carpeta: info.nombre, obras: coinciden.map((o) => o.id), creada: false, pendiente: false, fecha: hoy, estado: 'activa' });
      if (coinciden.length > 1) avisos.push({ tipo: 'AVISO', id: coinciden[0].id, texto: `Las fotos de la carpeta del bot «${info.nombre}» se pusieron en ${coinciden.length} obras (${coinciden.map((o) => o.id).join(', ')}) porque se parecen. Si son la misma, dejá una sola fila.` });
      continue;
    }
    if (entrada) { mem.set(info.carpetaId, { ...entrada, estado: 'descartada' }); continue; }   // la obra se borró del mapa a propósito: no se vuelve a crear

    // ---- obra nueva
    const fila = libres.shift();
    if (!fila) { avisos.push({ tipo: 'AVISO', id: '', texto: 'No hay filas libres en MAPA para cargar obras nuevas del bot.' }); break; }
    const id = pad4(++proximo);
    const falta = FALTAN(info);
    const notas = [`Cargada automáticamente desde la carpeta del bot «${info.nombre}» (${hoy}).`, info.barrio && `Barrio: ${info.barrio}.`, info.direccion && `Dirección: ${info.direccion}.`, info.cesped && `Césped: ${info.cesped}.`, info.medidas && `Medidas: ${info.medidas}.`, falta.length && `SIN PUBLICAR hasta tener: ${falta.join(' y ')}.`].filter(Boolean).join(' ');
    nuevas.push({
      id, fila, carpetaId: info.carpetaId,
      valores: {
        'Nombre de referencia': info.club ? `${info.cliente} - ${info.club}` : info.cliente,
        Deporte: DEPORTE_ETIQUETA[info.deporte], Tipo: info.tipo, Canchas: info.cantidad ?? '', Ciudad: info.ciudad, Provincia: info.provincia ?? '', 'País': info.pais,
        'Año': info.anio ?? '', Estado: ESTADO_ETIQUETA.terminada, 'Link de Google Maps': info.link, '¿Se puede nombrar?': false, '¿Destacada?': false, '¿Publicar?': falta.length === 0, 'Notas internas': notas,
      },
      interno: { Cliente: info.cliente, 'Dirección': info.direccion, Fuente: 'bot fotos' },
    });
    vinculos.set(info.carpetaId, [id]);
    mem.set(info.carpetaId, { carpeta: info.nombre, obras: [id], creada: true, pendiente: falta.length > 0, fecha: hoy, estado: 'activa' });
    avisos.push({ tipo: 'NUEVA DEL BOT', id, texto: falta.length ? `Cargada desde la carpeta del bot «${info.nombre}», pero SIN PUBLICAR: falta ${falta.join(' y ')}. Completalo en el datos.txt del bot (o acá) y sale sola.` : `Cargada desde la carpeta del bot «${info.nombre}» y ya publicada con nombre genérico. Revisá ciudad, provincia y canchas.` });
  }

  function completarObra(info, obra, entrada) {
    const celda = (c) => leerCelda(obra, c);
    const vacia = (c) => String(celda(c) ?? '').trim() === '';
    const poner = (columna, valor) => { if (valor !== '' && valor !== null && valor !== undefined && vacia(columna)) cambios.push({ obra, columna, valor }); };
    poner('Canchas', info.cantidad ?? '');
    poner('Tipo', info.tipo);
    poner('Ciudad', info.ciudad);
    poner('Provincia', info.provincia ?? '');
    poner('Link de Google Maps', info.link);
    poner('Año', info.anio ?? '');
    const actual = { cantidad: celda('Canchas') || info.cantidad, link: celda('Link de Google Maps') || info.link, ciudad: celda('Ciudad') || info.ciudad, provincia: celda('Provincia') || info.provincia };
    const falta = FALTAN(info, actual);
    if (entrada.pendiente && !falta.length) {
      cambios.push({ obra, columna: '¿Publicar?', valor: true });
      const notas = String(celda('Notas internas') ?? '');
      cambios.push({ obra, columna: 'Notas internas', valor: notas.replace(/SIN PUBLICAR hasta tener:[^.]*\./, `Datos completos (${hoy}): publicada.`) });
      mem.set(info.carpetaId, { ...entrada, pendiente: false });
      avisos.push({ tipo: 'NUEVA DEL BOT', id: obra.id, texto: `Llegaron los datos que faltaban de la carpeta del bot «${info.nombre}»: ahora está publicada.` });
    } else if (entrada.pendiente) {
      avisos.push({ tipo: 'NUEVA DEL BOT', id: obra.id, texto: `Sigue SIN PUBLICAR (carpeta del bot «${info.nombre}»): falta ${falta.join(' y ')}.` });
    } else if (entrada.creada && reciente(entrada.fecha)) {
      avisos.push({ tipo: 'NUEVA DEL BOT', id: obra.id, texto: `Cargada desde la carpeta del bot «${info.nombre}» el ${entrada.fecha}. Revisá ciudad, provincia y canchas.` });
    }
  }

  return { vinculos, nuevas, cambios, memoria: mem, avisos };
}

/** Qué obra(s) le corresponden a cada carpeta: la de la propia obra con datos.txt o, si las fotos están en una subcarpeta, la del ancestro que la tiene. */
export function idsDeCarpetaBot(carpetas, vinculos) {
  const padre = new Map(carpetas.map((c) => [c.id, c.padre]));
  return (carpetaId) => {
    for (let actual = carpetaId, saltos = 0; actual && saltos < 8; actual = padre.get(actual), saltos++) if (vinculos.has(actual)) return vinculos.get(actual);
    return [];
  };
}

/** Piezas gráficas de SLAVON («SLAVON_Cliente_…jpg») llevan el nombre del cliente encima: no se publican nunca. */
export const esPiezaGrafica = (nombreArchivo) => /^slavon[ _-]/i.test(String(nombreArchivo ?? ''));
