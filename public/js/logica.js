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

/** ['Argentina', 'Uruguay'] → «Argentina y Uruguay»; con tres: «A, B y C». Sin datos → «Argentina». */
export function textoPaises(paises) {
  const lista = paises?.length ? paises : ['Argentina'];
  return lista.length > 1 ? `${lista.slice(0, -1).join(', ')} y ${lista.at(-1)}` : lista[0];
}

export const formatoNumero = (n) => new Intl.NumberFormat('es-AR').format(n);

/** «Más de {N} canchas construidas en {paises}» */
export function titular(plantilla, meta) {
  return plantilla.replace('{N}', formatoNumero(meta.titular_n)).replace('{paises}', textoPaises(meta.paises));
}

// ---------------------------------------------------------------- links compartibles (?deporte=padel&provincia=cordoba)
export const slugProvincia = (s) => normalizarTexto(s).replaceAll(' ', '-');

/** Filtros ← parámetros de la URL. Ignora lo que no conoce. `provincias` = [{ nombre, valor }]. */
export function filtrosDesdeUrl(search, { deportesValidos, provincias }) {
  const p = new URLSearchParams(search);
  const ids = [...new Set((p.get('deporte') ?? '').split(',').map((x) => x.trim()).filter((id) => deportesValidos.includes(id)))];
  const slug = slugProvincia(p.get('provincia') ?? '');
  const prov = slug ? provincias.find((x) => slugProvincia(x.nombre) === slug)?.valor ?? '' : '';
  return { deportes: ids.length && ids.length < deportesValidos.length ? new Set(ids) : null, provincia: prov };
}

/** Filtros → «?deporte=padel,futbol&provincia=cordoba» (vacío si no hay filtros). */
export function consultaDesdeFiltros({ deportes = null, provincia = '' }, deportesValidos) {
  const p = new URLSearchParams();
  const ids = deportesValidos.filter((id) => deportes?.has(id));
  if (ids.length) p.set('deporte', ids.join(','));
  const nombre = provincia.split('|')[1];
  if (nombre) p.set('provincia', slugProvincia(nombre));
  const qs = p.toString().replaceAll('%2C', ',');
  return qs ? `?${qs}` : '';
}

// ---------------------------------------------------------------- «Obras cerca tuyo»
export function distanciaKm(a, b) {
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Obras ubicadas dentro del radio, y la más cercana (para avisar «la más cercana está a N km»). */
export function obrasCerca(obras, punto, radioKm = 50) {
  const conDistancia = obras.filter(tieneUbicacion).map((o) => ({ o, km: distanciaKm(punto, o) })).sort((x, y) => x.km - y.km);
  return { cerca: conDistancia.filter((x) => x.km <= radioKm).map((x) => x.o), masCercana: conDistancia[0] ?? null };
}

export const sumarCanchas = (obras) => obras.reduce((a, o) => a + (o.cantidad_canchas || 1), 0);

/** Obras con las que se encuadra el mapa: las de Argentina si hay (el mapa arranca centrado en Argentina); si no, las que haya. */
export function obrasParaEncuadrar(obras) {
  const ubicadas = obras.filter(tieneUbicacion);
  const argentina = ubicadas.filter((o) => (o.pais || 'Argentina') === 'Argentina');
  return argentina.length ? argentina : ubicadas;
}
