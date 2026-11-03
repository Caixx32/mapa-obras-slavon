// Versión PÚBLICA de los datos. Reglas (del brief):
//  - nombrable = no  → «Complejo de [deporte] – [ciudad], [provincia]», coordenadas redondeadas a 2 decimales
//  - solo campos del modelo (lista blanca). Nunca: fuente, cliente, direcciones, notas, precios.
//  - falla (no escribe nada) si detecta nombres de clientes, direcciones, mails o teléfonos.
import { norm, nombreGenerico, redondear2 } from './util.mjs';
import { limpiarNombre, parecePersona, empiezaConNombreDePila } from './nombres.mjs';

export const CAMPOS_PUBLICOS = [
  'id', 'nombre_club', 'deporte', 'tipo', 'cantidad_canchas', 'provincia', 'ciudad', 'pais',
  'lat', 'lng', 'anio', 'estado', 'descripcion_corta', 'fotos', 'video_url', 'nombrable', 'destacada',
];

const CAMPOS_TEXTO_LIBRE = ['nombre_club', 'tipo', 'descripcion_corta', 'ciudad', 'provincia'];
const RE_MAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const RE_TEL = /(?<![\d.,])(?:\+?\d[\d\s().-]{8,}\d)(?![\d.,])/;
const RE_URL = /https?:\/\/|www\./i;

/** Registro público de una obra. `fotos` = [{src, thumb}] ya filtradas (sin _privada). */
export function registroPublico(o, fotos = []) {
  const avisos = [];
  let nombre;
  if (o.nombrable && o.nombre_club) nombre = o.nombre_publico ?? limpiarNombre(o.nombre_club, o);
  else {
    nombre = nombreGenerico(o);
    if (o.nombrable && !o.nombre_club) avisos.push(`obra ${o.id}: nombrable = si pero no tiene nombre_club; se muestra el nombre genérico`);
  }
  const mostrarExacto = o.nombrable && o.nombre_club;
  const coord = (n) => (n === null || n === undefined ? null : redondear2(n));   // TODAS las obras: coordenadas redondeadas (≈1 km). Las exactas solo en la versión interna.

  let descripcion = o.descripcion_corta;
  if (descripcion && !mostrarExacto) {
    // Si el texto libre menciona al club o al cliente real de una obra no nombrable, se descarta.
    const d = ` ${norm(descripcion)} `;
    const secretos = [o.nombre_club, o.cliente_interno].filter(Boolean).map(norm).filter((s) => s.length >= 4);
    if (secretos.some((s) => d.includes(` ${s} `))) {
      avisos.push(`obra ${o.id}: la descripcion_corta mencionaba un nombre real y la obra no es nombrable; se descartó`);
      descripcion = null;
    }
  }
  const reg = {
    id: o.id,
    nombre_club: nombre,
    deporte: o.deporte,
    tipo: o.tipo,
    cantidad_canchas: o.cantidad_canchas,
    provincia: o.provincia,
    ciudad: o.ciudad,
    pais: o.pais,
    lat: coord(o.lat),
    lng: coord(o.lng),
    anio: o.anio,
    estado: o.estado,
    descripcion_corta: descripcion,
    fotos,
    video_url: o.video_url,
    nombrable: Boolean(mostrarExacto),
    destacada: o.destacada,
  };
  return { reg, avisos };
}

/** Contadores del encabezado. Solo cuentan obras terminadas. «Canchas de césped» = todo lo que no es pádel. */
export function calcularMeta(registros, generado = new Date().toISOString()) {
  const term = registros.filter((r) => r.estado === 'terminada');
  const suma = (f) => term.filter(f).reduce((a, r) => a + r.cantidad_canchas, 0);
  const total = suma(() => true);
  const padel = suma((r) => r.deporte === 'padel' || r.deporte === 'cesped_padel');
  const provincias = new Set(term.filter((r) => r.pais === 'Argentina' && r.provincia).map((r) => r.provincia));
  const paises = [...new Set(registros.map((r) => r.pais))].sort((a, b) => (a === 'Argentina' ? -1 : b === 'Argentina' ? 1 : a.localeCompare(b)));
  return {
    generado,
    obras: registros.length,
    obras_en_obra: registros.length - term.length,
    total_canchas: total,
    canchas_padel: padel,
    canchas_cesped: total - padel,
    provincias: provincias.size,
    paises,
    titular_n: total < 50 ? total : Math.floor(total / 50) * 50, // «Más de N»: siempre ≤ al total real
  };
}

/** Lanza Error si en los datos públicos hay algo que no debería estar. */
export function verificarFugas(registros, obrasInternas) {
  const problemas = [];
  const permitidos = new Set();
  for (const r of registros) {
    for (const v of [r.ciudad, r.provincia, r.pais]) if (v) permitidos.add(norm(v));
    if (r.nombrable && r.nombre_club) permitidos.add(norm(r.nombre_club));
  }
  // Nombres de club ya autorizados y publicados en otra obra: una copia oculta del mismo club (duplicado, otra «Op») no es una fuga.
  const nombresPublicos = [...permitidos].filter((n) => registros.some((r) => r.nombrable && r.nombre_club && norm(r.nombre_club) === n)).map((n) => ` ${n} `);
  const sensibles = [];
  for (const o of obrasInternas) {
    const agregar = (tipo, v, minimo) => {
      const n = norm(v);
      if (n.length < minimo || permitidos.has(n)) return;
      if (tipo === 'nombre de club no nombrable' && nombresPublicos.some((p) => p.includes(` ${n} `))) return;
      sensibles.push({ id: o.id, tipo, n });
    };
    if (!o.nombrable && o.nombre_club) agregar('nombre de club no nombrable', o.nombre_club, 5);
    if (o.cliente_interno) agregar('cliente', o.cliente_interno, 8);
    // Una «dirección» sin número suele ser solo «Ciudad, Provincia»: no es un dato privado.
    if (o.direccion_interna && /\d/.test(o.direccion_interna)) agregar('dirección', o.direccion_interna, 8);
  }
  for (const r of registros) {
    for (const campo of CAMPOS_TEXTO_LIBRE) {
      const val = r[campo];
      if (!val) continue;
      // El nombre genérico lo arma el sistema con deporte + ciudad + provincia (que se revisan aparte).
      if (campo === 'nombre_club' && !r.nombrable) continue;
      const t = ` ${norm(val)} `;
      for (const s of sensibles) {
        // El nombre de club de una obra nombrable ya fue autorizado: que repita el cliente de la misma obra (o de otra del mismo club) no es una fuga.
        if (campo === 'nombre_club' && s.tipo === 'cliente') continue;
        if (t.includes(` ${s.n} `)) problemas.push(`obra ${r.id}, campo ${campo}: contiene «${s.n}» (${s.tipo} de la obra ${s.id})`);
      }
    }
    for (const [campo, val] of Object.entries(r)) {
      if (typeof val !== 'string' || campo === 'video_url' || campo === 'id') continue;
      if (RE_MAIL.test(val)) problemas.push(`obra ${r.id}, campo ${campo}: parece un mail`);
      if (RE_TEL.test(val)) problemas.push(`obra ${r.id}, campo ${campo}: parece un teléfono`);
      if (RE_URL.test(val)) problemas.push(`obra ${r.id}, campo ${campo}: contiene un link`);
    }
    for (const k of Object.keys(r)) if (!CAMPOS_PUBLICOS.includes(k)) problemas.push(`obra ${r.id}: campo no permitido «${k}»`);
    for (const f of r.fotos) if (/_privada/i.test(f.src) || /fotos-internas/i.test(f.src) || /^data\//i.test(f.src)) problemas.push(`obra ${r.id}: foto privada en la versión pública (${f.src})`);
    const decimales = (n) => (n === null ? 0 : (String(n).split('.')[1] ?? '').length);
    if (decimales(r.lat) > 2 || decimales(r.lng) > 2) problemas.push(`obra ${r.id}: coordenadas con más de 2 decimales (en la versión pública van todas redondeadas)`);
    if (r.nombrable && empiezaConNombreDePila(r.nombre_club)) problemas.push(`obra ${r.id}: el nombre «${r.nombre_club}» empieza con un nombre de pila (persona + institución)`);
    if (r.nombrable && parecePersona(r.nombre_club, r) && !/\b(colegio|escuela|instituto|universidad|municipalidad|municipio|country|barrio|sindicato|gremio|uom|estadio|polideportivo|cooperativa|fundaci[oó]n|mutual|c[ií]rculo|anfiteatro|sociedad|asociaci[oó]n|fomento)\b/i.test(r.nombre_club)) problemas.push(`obra ${r.id}: el nombre «${r.nombre_club}» parece de una persona física`);
  }
  if (problemas.length) {
    const e = new Error(
      `NO SE GENERÓ la versión pública: se detectaron ${problemas.length} posibles fugas de datos.\n` +
        problemas.slice(0, 30).map((p) => '  - ' + p).join('\n') +
        (problemas.length > 30 ? `\n  … y ${problemas.length - 30} más` : '') +
        '\nCorregí la planilla y volvé a correr build-data.',
    );
    e.fugas = problemas;
    throw e;
  }
}

/** Arma el JSON público completo. `fotosPorId`: Map id → [{src, thumb}] (solo públicas). */
export function construirPublico(obras, fotosPorId, generado) {
  const avisos = [];
  const registros = [];
  for (const o of obras.filter((x) => x.publicar)) {
    const { reg, avisos: a } = registroPublico(o, fotosPorId.get(o.id) ?? []);
    registros.push(reg);
    avisos.push(...a);
  }
  registros.sort((a, b) => a.id.localeCompare(b.id));
  verificarFugas(registros, obras);
  return { json: { meta: calcularMeta(registros, generado), obras: registros }, avisos };
}

/** JSON interno: todo, con nombres reales, coordenadas exactas y todas las fotos. */
export function construirInterno(obras, fotosPorIdInterno, generado) {
  const lista = obras
    .map((o) => ({ ...o, nombre_mostrado: o.nombre_club || nombreGenerico(o), fotos: fotosPorIdInterno.get(o.id) ?? [] }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return { meta: { generado, obras: lista.length, version: 'interna' }, obras: lista };
}
