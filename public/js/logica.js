// Lógica pura de la landing (sin DOM): se puede probar con `npm test`.

export const DEPORTES = [
  { id: 'padel', etiqueta: 'Pádel', producto: 'una cancha de pádel' },
  { id: 'cesped_padel', etiqueta: 'Césped pádel', producto: 'una cancha de pádel' },
  { id: 'futbol', etiqueta: 'Fútbol', producto: 'una cancha de fútbol' },
  { id: 'hockey', etiqueta: 'Hockey', producto: 'una cancha de hockey' },
  { id: 'tenis', etiqueta: 'Tenis', producto: 'una cancha de tenis' },
  { id: 'residencial', etiqueta: 'Residencial', producto: 'césped para un espacio residencial' },
  { id: 'otro', etiqueta: 'Otros', producto: 'una cancha' },
];

export const deporteMeta = (id) => DEPORTES.find((d) => d.id === id) ?? DEPORTES[DEPORTES.length - 1];

export const normalizarTexto = (s) =>
  String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const tieneUbicacion = (o) => Number.isFinite(o.lat) && Number.isFinite(o.lng);

/** «Complejo de fútbol – Campana, Buenos Aires» → { titulo: 'Complejo de fútbol', lugar: 'Campana, Buenos Aires' }.
 *  Con nombre real: { titulo: 'Club Los Pinos', lugar: 'Córdoba, Córdoba' }. */
export function partirNombre(o) {
  const nombre = o.nombre_mostrado ?? o.nombre_club ?? '';
  const lugar = [o.ciudad, o.provincia].filter(Boolean).join(', ');
  const partes = nombre.split(' – ');
  if (partes.length === 2 && (o.nombrable === false || o.nombrable === undefined) && partes[1] === lugar) return { titulo: partes[0], lugar };
  if (partes.length === 2 && partes[1]) return { titulo: partes[0], lugar: partes[1] };
  return { titulo: nombre || 'Obra SLAVON', lugar };
}

/** El «[nombre o ciudad]» del mensaje: el nombre si es nombrable; si no, «de <ciudad>». */
export function referenciaObra(o) {
  if (o.nombrable && o.nombre_club) return o.nombre_club;
  const lugar = o.ciudad || o.provincia;
  return lugar ? `de ${lugar}` : 'de ustedes';
}

export const MENSAJE_OBRA_POR_DEFECTO = 'Hola SLAVON, vi la obra {obra} en el mapa y quiero consultar por {producto}.';

export function mensajeWhatsApp(o, plantilla = MENSAJE_OBRA_POR_DEFECTO) {
  return plantilla.replaceAll('{obra}', referenciaObra(o)).replaceAll('{producto}', deporteMeta(o.deporte).producto);
}

/** Link a WhatsApp. Sin número configurado abre WhatsApp para elegir contacto (solo sirve para probar). */
export function urlWhatsApp(numero, mensaje) {
  const digitos = String(numero ?? '').replace(/\D/g, '');
  return `https://wa.me/${digitos}?text=${encodeURIComponent(mensaje)}`;
}

/** Estado de los chips: null = todos activos. Primer toque aísla ese deporte; los siguientes suman o quitan. */
export function alternarDeporte(activos, id, todos) {
  if (activos === null) return new Set([id]);
  const s = new Set(activos);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  if (s.size === 0 || todos.every((t) => s.has(t))) return null;
  return s;
}

export function filtrar(obras, { deportes = null, provincia = '', texto = '' } = {}) {
  const t = normalizarTexto(texto);
  return obras.filter((o) => {
    if (deportes && !deportes.has(o.deporte)) return false;
    if (provincia && `${o.pais}|${o.provincia}` !== provincia) return false;
    if (t) {
      const pajar = normalizarTexto([o.nombre_mostrado ?? o.nombre_club, o.cliente_interno, o.ciudad, o.provincia, o.direccion_interna, o.tipo].filter(Boolean).join(' '));
      if (!t.split(' ').every((palabra) => pajar.includes(palabra))) return false;
    }
    return true;
  });
}

export function contarPorDeporte(obras) {
  const c = new Map();
  for (const o of obras) c.set(o.deporte, (c.get(o.deporte) ?? 0) + 1);
  return c;
}

/** Provincias con al menos una obra ubicada, agrupadas por país. Valor = «País|Provincia». */
export function agruparProvincias(obras) {
  const porPais = new Map();
  for (const o of obras.filter(tieneUbicacion)) {
    if (!o.provincia) continue;
    const pais = o.pais || 'Argentina';
    if (!porPais.has(pais)) porPais.set(pais, new Map());
    porPais.get(pais).set(o.provincia, (porPais.get(pais).get(o.provincia) ?? 0) + 1);
  }
  return [...porPais.entries()]
    .sort(([a], [b]) => (a === 'Argentina' ? -1 : b === 'Argentina' ? 1 : a.localeCompare(b, 'es')))
    .map(([pais, m]) => ({ pais, provincias: [...m.entries()].sort(([a], [b]) => a.localeCompare(b, 'es')).map(([nombre, n]) => ({ nombre, valor: `${pais}|${nombre}`, n })) }));
}

export const resolverRuta = (src, base = '') => (/^(https?:)?\/\//.test(src) ? src : base + src);

/** «Más de {N} canchas construidas en {paises}» */
export function titular(plantilla, meta) {
  const lista = meta.paises?.length ? meta.paises : ['Argentina'];
  const paises = lista.length > 1 ? `${lista.slice(0, -1).join(', ')} y ${lista.at(-1)}` : lista[0];
  return plantilla.replace('{N}', new Intl.NumberFormat('es-AR').format(meta.titular_n)).replace('{paises}', paises);
}
