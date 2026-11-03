// Reportes en Excel para el equipo. Son internos (nombres reales): están en .gitignore.
import ExcelJS from 'exceljs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { slug } from './util.mjs';

const CARBON = '22282C';
const ROJO = 'E50D2D';

function hoja(wb, nombre, columnas, filas) {
  const ws = wb.addWorksheet(nombre);
  ws.columns = columnas.map((c) => ({ header: c.titulo, key: c.clave, width: c.ancho }));
  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + CARBON } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  ws.getRow(1).height = 28;
  filas.forEach((f) => ws.addRow(f));
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
  return ws;
}

/** Obras publicables sin foto pública, con las destacadas primero. */
export async function escribirFotosPendientes(ruta, obras, fotosPublicas, fotosInternas) {
  const pendientes = obras
    .filter((o) => o.publicar && !(fotosPublicas.get(o.id)?.length > 0))
    .sort((a, b) => Number(b.destacada) - Number(a.destacada) || Number(b.nombrable) - Number(a.nombrable) || (b.anio ?? 0) - (a.anio ?? 0) || a.id.localeCompare(b.id));
  const wb = new ExcelJS.Workbook();
  const ws = hoja(
    wb,
    'FOTOS PENDIENTES',
    [
      { titulo: 'id', clave: 'id', ancho: 8 },
      { titulo: 'destacada', clave: 'destacada', ancho: 11 },
      { titulo: 'nombrable', clave: 'nombrable', ancho: 11 },
      { titulo: 'obra', clave: 'obra', ancho: 38 },
      { titulo: 'deporte', clave: 'deporte', ancho: 13 },
      { titulo: 'ciudad', clave: 'ciudad', ancho: 22 },
      { titulo: 'provincia', clave: 'provincia', ancho: 16 },
      { titulo: 'año', clave: 'anio', ancho: 7 },
      { titulo: 'canchas', clave: 'canchas', ancho: 9 },
      { titulo: 'solo tiene fotos privadas', clave: 'priv', ancho: 14 },
      { titulo: 'carpeta donde ponerlas', clave: 'carpeta', ancho: 52 },
    ],
    pendientes.map((o) => ({
      id: o.id,
      destacada: o.destacada ? 'SI' : '',
      nombrable: o.nombrable ? 'si' : 'no',
      obra: o.nombre_club || o.cliente_interno || '',
      deporte: o.deporte,
      ciudad: o.ciudad ?? '',
      provincia: o.provincia ?? '',
      anio: o.anio ?? '',
      canchas: o.cantidad_canchas,
      priv: (fotosInternas.get(o.id) ?? []).length ? 'si' : '',
      carpeta: `fotos/${[o.id, slug(o.nombre_club || o.cliente_interno || o.deporte), slug(o.ciudad || o.provincia || '')].filter(Boolean).join('-')}/`,
    })),
  );
  ws.eachRow((row, n) => {
    if (n > 1 && row.getCell('destacada').value === 'SI') row.getCell('destacada').font = { bold: true, color: { argb: 'FF' + ROJO } };
  });
  await wb.xlsx.writeFile(ruta);
  return pendientes.length;
}

/** Obras con coordenadas «aprox» (de la planilla o calculadas en esta corrida) y obras que quedaron sin ubicar. */
export async function escribirCoordenadasAprox(ruta, obras, nuevas, fallidas) {
  await fs.mkdir(path.dirname(ruta), { recursive: true });
  const fallidasIds = new Set(fallidas.map((o) => o.id));
  const restantes = obras.filter((o) => o.publicar && o.lat === null);
  const nuevasIds = new Set(nuevas.map((o) => o.id));
  const aprox = obras.filter((o) => o.publicar && o.lat !== null && o.origen_coord === 'aprox');
  const wb = new ExcelJS.Workbook();
  hoja(
    wb,
    'APROX',
    [
      { titulo: 'id', clave: 'id', ancho: 8 },
      { titulo: 'obra', clave: 'obra', ancho: 38 },
      { titulo: 'ciudad', clave: 'ciudad', ancho: 22 },
      { titulo: 'provincia', clave: 'provincia', ancho: 16 },
      { titulo: 'lat', clave: 'lat', ancho: 11 },
      { titulo: 'lng', clave: 'lng', ancho: 11 },
      { titulo: 'calculada', clave: 'cuando', ancho: 18 },
      { titulo: 'lo que encontró Nominatim', clave: 'geo', ancho: 70 },
    ],
    aprox.map((o) => ({ id: o.id, obra: o.nombre_club || o.cliente_interno || '', ciudad: o.ciudad, provincia: o.provincia, lat: o.lat, lng: o.lng, cuando: nuevasIds.has(o.id) ? 'en esta corrida' : 'ya estaba en la planilla', geo: o._geo ?? '' })),
  );
  hoja(
    wb,
    'NO SE PUDO UBICAR',
    [
      { titulo: 'id', clave: 'id', ancho: 8 },
      { titulo: 'obra', clave: 'obra', ancho: 38 },
      { titulo: 'ciudad', clave: 'ciudad', ancho: 22 },
      { titulo: 'provincia', clave: 'provincia', ancho: 16 },
      { titulo: 'dirección (interna)', clave: 'dir', ancho: 44 },
      { titulo: 'motivo', clave: 'motivo', ancho: 46 },
    ],
    restantes.map((o) => ({
      id: o.id,
      obra: o.nombre_club || o.cliente_interno || '',
      ciudad: o.ciudad ?? '',
      provincia: o.provincia ?? '',
      dir: o.direccion_interna ?? '',
      motivo: !o.ciudad ? 'Falta la ciudad' : !o.provincia ? 'Falta la provincia' : fallidasIds.has(o.id) ? 'Nominatim no encontró esa ciudad en esa provincia' : 'No se consultó Nominatim (corrida sin red)',
    })),
  );
  await wb.xlsx.writeFile(ruta);
  return { aprox: aprox.length, sinUbicar: restantes.length };
}

const COLS_OBRA = [
  { titulo: 'id', clave: 'id', ancho: 8 },
  { titulo: 'obra', clave: 'obra', ancho: 38 },
  { titulo: 'deporte', clave: 'deporte', ancho: 13 },
  { titulo: 'ciudad', clave: 'ciudad', ancho: 22 },
  { titulo: 'provincia', clave: 'provincia', ancho: 18 },
  { titulo: 'dirección (interna)', clave: 'dir', ancho: 44 },
  { titulo: 'cliente (interno)', clave: 'cliente', ancho: 30 },
];
const filaObra = (o, extra = {}) => ({ id: o.id, obra: o.nombre_club || '', deporte: o.deporte, ciudad: o.ciudad ?? '', provincia: o.provincia ?? '', dir: o.direccion_interna ?? '', cliente: o.cliente_interno ?? '', ...extra });

/** Obras publicables que siguen sin ubicación después de geocodificar, con el motivo. */
export async function escribirSinUbicar(ruta, obras, fallidas) {
  await fs.mkdir(path.dirname(ruta), { recursive: true });
  const fallidasIds = new Set(fallidas.map((o) => o.id));
  const motivo = (o) => (fallidasIds.has(o.id) ? 'La ciudad no se encontró en esa provincia (¿error de tipeo?)' : !o.provincia ? 'Falta la provincia' : !o.ciudad ? 'Falta la ciudad' : 'No se pudo consultar');
  const filas = obras.filter((o) => o.publicar && o.lat === null).map((o) => filaObra(o, { motivo: motivo(o) }));
  const wb = new ExcelJS.Workbook();
  hoja(wb, 'SIN UBICAR', [...COLS_OBRA, { titulo: 'por qué', clave: 'motivo', ancho: 46 }], filas);
  await wb.xlsx.writeFile(ruta);
  return filas.length;
}

/** Obras publicables sin provincia (no entran al filtro por provincia ni al contador de provincias). */
export async function escribirSinProvincia(ruta, obras) {
  await fs.mkdir(path.dirname(ruta), { recursive: true });
  const filas = obras.filter((o) => o.publicar && !o.provincia).map((o) => filaObra(o, { ubicada: o.lat === null ? 'no' : 'sí' }));
  const wb = new ExcelJS.Workbook();
  hoja(wb, 'SIN PROVINCIA', [...COLS_OBRA, { titulo: 'ya tiene punto en el mapa', clave: 'ubicada', ancho: 16 }], filas);
  await wb.xlsx.writeFile(ruta);
  return filas.length;
}
