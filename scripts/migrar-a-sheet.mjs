// Migración ÚNICA: planilla maestra → archivo «Mapa SLAVON.xlsx» listo para subir a Drive y abrir como Google Sheet.
// Ya trae las fusiones aplicadas y los nombres revisados (reglas de privacidad + obras confirmadas + revisar-nombres.xlsx si existe).
// Uso: node scripts/migrar-a-sheet.mjs [--maestra=ruta] [--salida=ruta]
import fs from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { RAIZ } from './lib/util.mjs';
import { leerMaestra } from './lib/master.mjs';
import { aplicarPrivacidad, normalizarPropuesta } from './lib/nombres.mjs';
import { leerRevisionNombres } from './lib/reportes.mjs';
import { agruparDuplicados } from './lib/fusiones.mjs';
import { COLUMNAS, COLUMNAS_INTERNO, DEPORTE_ETIQUETA, ESTADO_ETIQUETA } from './lib/mapa-sheet.mjs';
import { valoresListas } from './lib/preparar-sheet.mjs';

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const R = (...p) => path.join(RAIZ, ...p);
const unicos = (xs) => [...new Set(xs.filter(Boolean))];

export function fusionar(obras, conFotos = new Set()) {
  const quitar = new Set();
  const resumen = [];
  for (const g of agruparDuplicados(obras)) {
    const l = [...g.obras].sort((a, b) => a.id.localeCompare(b.id));
    const k = l.find((o) => conFotos.has(o.id)) ?? l[0];
    const exacta = (o) => o.lat !== null && o.origen_coord !== 'aprox';
    const conUbic = l.find((o) => exacta(o)) ?? l.find((o) => o.lat !== null);
    const porDeporte = {};
    for (const o of l) porDeporte[o.deporte] = (porDeporte[o.deporte] ?? 0) + o.cantidad_canchas;
    const tipos = unicos(l.map((o) => o.tipo));
    const variosDeportes = Object.keys(porDeporte).length > 1;
    const tipo = tipos.length <= 1 ? tipos[0] ?? null : unicos(l.map((o) => o.tipo && (variosDeportes ? `${DEPORTE_ETIQUETA[o.deporte]}: ${o.tipo}` : o.tipo))).join(' · ').slice(0, 240);
    const otros = l.filter((o) => o !== k);
    Object.assign(k, {
      cantidad_canchas: l.reduce((a, o) => a + o.cantidad_canchas, 0),
      deporte: Object.entries(porDeporte).sort((a, b) => b[1] - a[1])[0][0],
      tipo,
      anio: Math.max(0, ...l.map((o) => o.anio ?? 0)) || null,
      estado: l.some((o) => o.estado === 'en_obra') ? 'en_obra' : k.estado,
      destacada: l.some((o) => o.destacada),
      publicar: l.some((o) => o.publicar),
      lat: conUbic?.lat ?? null, lng: conUbic?.lng ?? null, origen_coord: conUbic?.origen_coord ?? k.origen_coord,
      cliente_interno: unicos(l.map((o) => o.cliente_interno)).join(' | ') || null,
      direccion_interna: unicos(l.map((o) => o.direccion_interna)).join(' | ') || null,
      fuente: unicos(l.map((o) => o.fuente)).join(' | ') || null,
      nota_mapa: unicos(l.map((o) => o.nota_mapa)).join(' | ').slice(0, 900) || null,
      revisar: unicos(l.map((o) => o.revisar)).join(' | ') || null,
      _fusionados: otros.map((o) => o.id),
    });
    for (const o of otros) quitar.add(o.id);
    resumen.push({ conserva: k.id, unidas: otros.map((o) => o.id), canchas: k.cantidad_canchas });
  }
  return { obras: obras.filter((o) => !quitar.has(o.id)), resumen };
}

export function filas(obras, privacidad = new Map()) {
  const mapa = obras.map((o) => {
    const link = o.lat !== null && o.origen_coord !== 'aprox' ? `https://www.google.com/maps?q=${o.lat},${o.lng}` : '';
    const prop = privacidad.get(o.id);
    const notas = [o.revisar, prop?.propuesta === 'revisar' ? `Revisar si se puede nombrar (${prop.motivo})` : '', o.nombrable && o.nombre_club && o.nombre_club !== o.nombre_publico ? `Nombre original: ${o.nombre_club}` : '', o._fusionados?.length ? `Fusión de ${[o.id, ...o._fusionados].join(', ')}` : ''].filter(Boolean).join(' | ');
    return [o.id, o.nombrable ? o.nombre_publico : o.nombre_club ?? '', null, DEPORTE_ETIQUETA[o.deporte], o.tipo ?? '', o.cantidad_canchas, o.ciudad ?? '', o.provincia ?? '', o.pais, o.anio ?? '', ESTADO_ETIQUETA[o.estado], link, o.nombrable, o.destacada, o.publicar, notas];
  });
  const interno = obras.map((o) => [o.id, o.cliente_interno ?? '', o.direccion_interna ?? '', o.servicio ?? '', o.fuente ?? '', o.origen_coord ?? '', o.descripcion_corta ?? '', o.nota_mapa ?? '', o.sugerencia_nombrable ?? '', o.video_url ?? '']);
  return { mapa, interno };
}

async function escribir(salida, { mapa, interno }) {
  const wb = new ExcelJS.Workbook();
  const hoja = (nombre, cols, datos, anchos) => {
    const ws = wb.addWorksheet(nombre);
    ws.addRow(cols);
    datos.forEach((f) => ws.addRow(f));
    ws.getRow(1).eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF22282C' } }; });
    anchos.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    return ws;
  };
  hoja('MAPA', COLUMNAS, mapa, [8, 36, 36, 14, 34, 9, 20, 18, 11, 7, 12, 40, 12, 11, 11, 50]);
  hoja('INTERNO', COLUMNAS_INTERNO, interno, [8, 34, 40, 20, 24, 18, 40, 40, 30, 20]);
  const l = valoresListas();
  const ws = wb.addWorksheet('LISTAS');
  l.forEach((f) => ws.addRow(f));
  await wb.xlsx.writeFile(salida);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const { obras, errores } = await leerMaestra(arg('maestra') ?? R('obras-maestra.xlsx'));
  if (errores.length) throw new Error(`La planilla tiene errores: ${errores.slice(0, 5).join(' · ')}`);
  const decisiones = await leerRevisionNombres(R('revisar-nombres.xlsx'), normalizarPropuesta);
  const confirmados = new Map(Object.entries(JSON.parse(await fs.readFile(R('scripts', 'data', 'nombres-confirmados.json'), 'utf8'))).filter(([k]) => /^\d{4}$/.test(k)));
  const privacidad = new Map(aplicarPrivacidad(obras, decisiones, confirmados).map((x) => [x.id, x]));
  const conFotos = new Set(await fs.readdir(R('public', 'fotos')).catch(() => []));
  const f = fusionar(obras, conFotos);
  const { mapa, interno } = filas(f.obras, privacidad);
  const salida = arg('salida') ?? R('Mapa SLAVON.xlsx');
  await escribir(salida, { mapa, interno });
  console.log(`${obras.length} obras en la planilla → ${f.obras.length} filas (${f.resumen.length} fusiones, ${obras.length - f.obras.length} filas unidas).`);
  console.log(`Con nombre: ${f.obras.filter((o) => o.nombrable).length} · destacadas: ${f.obras.filter((o) => o.destacada).length} · sin publicar: ${f.obras.filter((o) => !o.publicar).length}`);
  console.log(`Archivo: ${salida}`);
}
