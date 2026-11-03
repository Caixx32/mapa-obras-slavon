// Utilidades compartidas del pipeline.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const DEPORTES = ['padel', 'futbol', 'hockey', 'cesped_padel', 'residencial', 'tenis', 'otro'];
export const ESTADOS = ['terminada', 'en_obra'];

/** Minúsculas, sin acentos, sin símbolos. Para comparar textos. */
export function norm(s) {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function slug(s) {
  return norm(s).replace(/\s+/g, '-').slice(0, 48).replace(/-+$/, '');
}

/** 'si' / 'sí' / 'x' / '1' / 'true' → true. Cualquier otra cosa → false. */
export function esSi(v) {
  const n = norm(v);
  return ['si', 's', 'x', '1', 'true', 'yes'].includes(n);
}

export function pad4(id) {
  const s = String(id ?? '').trim();
  return /^\d+$/.test(s) ? s.padStart(4, '0') : s;
}

/** Acepta 12,5 y 12.5. Devuelve null si no es número. */
export function numero(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export const redondear2 = (n) => Math.round(n * 100) / 100;

export function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Etiquetas para mostrar el deporte en textos. */
export const DEPORTE_TEXTO = {
  padel: 'pádel',
  cesped_padel: 'pádel',
  futbol: 'fútbol',
  hockey: 'hockey',
  tenis: 'tenis',
  residencial: 'residencial',
  otro: 'deportivo',
};

/** Nombre genérico para obras no nombrables: «Complejo de fútbol – Campana, Buenos Aires». */
export function nombreGenerico(o) {
  const lugar = [o.ciudad, o.provincia].filter(Boolean).join(', ');
  const base =
    o.deporte === 'residencial' ? 'Espacio residencial' : o.deporte === 'otro' ? 'Obra deportiva' : `Complejo de ${DEPORTE_TEXTO[o.deporte]}`;
  return lugar ? `${base} – ${lugar}` : base;
}
