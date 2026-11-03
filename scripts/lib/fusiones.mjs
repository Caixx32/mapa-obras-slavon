// Obras del mismo club en la misma ciudad: se proponen para unificar en un solo punto (suma de canchas + lista de trabajos).
// Solo se LISTAN para revisar; no se aplica ninguna fusión hasta que una persona las apruebe.
import { norm } from './util.mjs';
import { clasificarNombre } from './nombres.mjs';

export function claveClub(o) {
  const nombre = clasificarNombre(o).limpio;
  const lugar = norm(o.ciudad) || norm(o.provincia);
  return nombre && lugar ? `${norm(nombre).replace(/\b(club|de|del|la|el|los|las)\b/g, '').replace(/\s+/g, ' ').trim()}|${lugar}|${norm(o.provincia)}` : null;
}

/** Devuelve los grupos con 2 o más obras publicables: [{ clave, obras, canchas, deportes }]. */
export function agruparDuplicados(obras) {
  const grupos = new Map();
  for (const o of obras.filter((x) => x.publicar && x.nombre_club)) {
    const k = claveClub(o);
    if (!k) continue;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(o);
  }
  return [...grupos.entries()]
    .filter(([, l]) => l.length > 1)
    .map(([clave, l]) => ({ clave, obras: l, canchas: l.reduce((a, o) => a + (o.cantidad_canchas || 1), 0), deportes: [...new Set(l.map((o) => o.deporte))] }))
    .sort((a, b) => b.obras.length - a.obras.length || a.obras[0].id.localeCompare(b.obras[0].id));
}
