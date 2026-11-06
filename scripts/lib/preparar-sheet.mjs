// Deja el Google Sheet listo: pestañas, desplegables, casillas, fórmula de «Nombre a mostrar», AVISOS y CÓMO USAR.
// Es idempotente: si el Sheet ya está preparado (marca en LISTAS!J1) no hace nada. Se corre solo en la primera pasada.
import { norm } from './util.mjs';
import { PESTANAS, COLUMNAS, COLUMNAS_V1, DEPORTE_ETIQUETA, ESTADO_ETIQUETA, GENERICO_BASE, FILA_PUBLICAR_AHORA, FILA_ENCABEZADO_AVISOS, letraDeColumna, idDeCelda } from './mapa-sheet.mjs';

export const MARCA_V1 = 'mapa-slavon-preparado-v1';
export const MARCA_ANTERIOR = 'mapa-slavon-preparado-v2';   // con la fórmula arreglada, todavía sin la columna «Nombre de referencia»
export const MARCA = 'mapa-slavon-preparado-v3';
// La fórmula se escribe con comas: el Sheet tiene que estar en inglés (en_US) para entenderla, sin importar el idioma en que lo ves.
export const SOLICITUD_IDIOMA = { updateSpreadsheetProperties: { properties: { locale: 'en_US' }, fields: 'locale' } };
const FILAS = 5000;
export const LIMITE_FILAS = 6000;   // alto de las pestañas AVISOS y GEO (el Sheet no deja escribir más allá del final)
export const PROVINCIAS = ['CABA', 'Buenos Aires', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba', 'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán', 'Islas Baleares', 'Montevideo', 'Canelones', 'Maldonado', 'Colonia'];
export const PAISES = ['Argentina', 'España', 'Uruguay'];

/** «Nombre a mostrar»: el nombre del club si se puede nombrar; si no, «Complejo de fútbol – Ciudad, Provincia». Una sola fórmula para toda la columna. */
export function formulaNombreAMostrar(columnas = COLUMNAS) {
  const L = (nombre) => `${letraDeColumna(columnas.indexOf(nombre))}2:${letraDeColumna(columnas.indexOf(nombre))}`;
  const [id, club, dep, ciudad, prov, nombrar] = ['ID', 'Nombre del club', 'Deporte', 'Ciudad', 'Provincia', '¿Se puede nombrar?'].map(L);
  return `=ARRAYFORMULA(IF(${id}="","",IF(${nombrar}=TRUE,IF(${club}="","(falta el nombre del club)",${club}),` +
    `IFERROR(VLOOKUP(${dep},LISTAS!$A$2:$B$8,2,FALSE),"Obra deportiva")&IF((${ciudad}="")*(${prov}=""),""," – "&IF(${ciudad}="","",${ciudad})&IF((${ciudad}<>"")*(${prov}<>""),", ","")&IF(${prov}="","",${prov})))))`;
}
export const FORMULA_NOMBRE_A_MOSTRAR = formulaNombreAMostrar();

export const TEXTO_MANUAL = [
  ['CÓMO USAR (todo se hace desde este Sheet y la carpeta «Fotos Mapa SLAVON» de Drive)'],
  ['1. Agregar una obra: escribí en la primera fila vacía de MAPA (nombre, deporte, ciudad, provincia…). En unos minutos aparece el ID y se crea su carpeta de fotos.'],
  ['2. Ubicación: pegá el link de Google Maps (o las coordenadas, "-34.60, -58.38") en «Link de Google Maps». Sin link se ubica por ciudad y provincia (aproximado).'],
  ['3. Nombre: tildá «¿Se puede nombrar?» solo si es un club, colegio, estadio, empresa… y autorizó. Una persona física NUNCA. Si no, sale «Complejo de…».'],
  ['4. Tildá «¿Publicar?» para que la obra salga en el mapa y «¿Destacada?» para la grilla de destacadas. Para sacarla, destildá «¿Publicar?».'],
  ['5. Fotos: arrastralas a la subcarpeta «ID - nombre de referencia - ciudad» (Drive, desde la PC o el celular). El robot le pone ese nombre solo. Si el nombre del archivo dice «privada», no se publica.'],
  ['6. Publicar ya: tildá «Publicar ahora» en AVISOS (también desde el celular). Tarda 5 a 10 minutos y se destilda sola. Si no, se publica sola cada noche a las 3 AM.'],
  ['7. Mirá AVISOS: dice si salió bien y qué falta (sin ubicar, sin foto, duplicados, nombres que parecen de una persona).'],
  ['8. No cambies «ID» ni «Nombre a mostrar» (se completan solas). «Nombre de referencia» y «Notas internas» son solo para uso interno: nunca se publican. Datos de clientes: en INTERNO.'],
  ['9. Si algo sale mal, la web anterior sigue online y el motivo aparece en AVISOS.'],
];

export function valoresListas() {
  const filas = Math.max(PROVINCIAS.length, 7);
  const dep = Object.entries(DEPORTE_ETIQUETA);
  const est = Object.values(ESTADO_ETIQUETA);
  const v = [['Deporte', 'Nombre genérico', '', 'Estado', '', 'Provincia', '', 'País']];
  for (let i = 0; i < filas; i++) v.push([dep[i]?.[1] ?? '', dep[i] ? GENERICO_BASE[dep[i][0]] : '', '', est[i] ?? '', '', PROVINCIAS[i] ?? '', '', PAISES[i] ?? '']);
  return v;
}

const col = (c) => COLUMNAS.indexOf(c);
const rango = (sheetId, c0, c1, f0 = 1, f1 = FILAS) => ({ sheetId, startRowIndex: f0, endRowIndex: f1, startColumnIndex: c0, endColumnIndex: c1 });
const lista = (formula) => ({ condition: { type: 'ONE_OF_RANGE', values: [{ userEnteredValue: formula }] }, strict: true, showCustomUi: true });

export function solicitudesFormato(ids) {
  const r = [];
  const { mapa, avisos, listas, geo } = ids;
  const carbon = { red: 0.133, green: 0.157, blue: 0.173 };
  r.push({ updateSheetProperties: { properties: { sheetId: mapa, gridProperties: { frozenRowCount: 1, frozenColumnCount: 3 } }, fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount' } });
  r.push({ repeatCell: { range: rango(mapa, 0, COLUMNAS.length, 0, 1), cell: { userEnteredFormat: { backgroundColor: carbon, textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true }, wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,wrapStrategy,verticalAlignment)' } });
  r.push({ repeatCell: { range: rango(mapa, 0, 1), cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' }, backgroundColor: { red: 0.945, green: 0.953, blue: 0.957 } } }, fields: 'userEnteredFormat(numberFormat,backgroundColor)' } });
  r.push({ repeatCell: { range: rango(mapa, col('Nombre a mostrar'), col('Nombre a mostrar') + 1), cell: { userEnteredFormat: { backgroundColor: { red: 0.945, green: 0.953, blue: 0.957 }, textFormat: { italic: true } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } });
  const anchos = [60, 230, 260, 220, 110, 220, 70, 150, 140, 100, 60, 100, 260, 110, 100, 100, 300];
  anchos.forEach((px, i) => r.push({ updateDimensionProperties: { range: { sheetId: mapa, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } }));
  r.push({ setDataValidation: { range: rango(mapa, col('¿Se puede nombrar?'), col('¿Publicar?') + 1), rule: { condition: { type: 'BOOLEAN' }, strict: true, showCustomUi: true } } });
  r.push({ setDataValidation: { range: rango(mapa, col('Deporte'), col('Deporte') + 1), rule: lista('=LISTAS!$A$2:$A$8') } });
  r.push({ setDataValidation: { range: rango(mapa, col('Estado'), col('Estado') + 1), rule: lista('=LISTAS!$D$2:$D$3') } });
  r.push({ setDataValidation: { range: rango(mapa, col('Provincia'), col('Provincia') + 1), rule: { ...lista(`=LISTAS!$F$2:$F$${PROVINCIAS.length + 1}`), strict: false } } });
  r.push({ setDataValidation: { range: rango(mapa, col('País'), col('País') + 1), rule: lista(`=LISTAS!$H$2:$H$${PAISES.length + 1}`) } });
  for (const c of [col('ID'), col('Nombre a mostrar')]) {
    r.push({ addProtectedRange: { protectedRange: { range: rango(mapa, c, c + 1), warningOnly: true, description: 'Se completa sola: no hace falta tocarla.' } } });
  }
  r.push({ repeatCell: { range: { sheetId: avisos, startRowIndex: FILA_ENCABEZADO_AVISOS - 1, endRowIndex: FILA_ENCABEZADO_AVISOS, startColumnIndex: 0, endColumnIndex: 3 }, cell: { userEnteredFormat: { backgroundColor: carbon, textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } });
  r.push({ repeatCell: { range: { sheetId: avisos, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 16 } } }, fields: 'userEnteredFormat.textFormat' } });
  r.push({ repeatCell: { range: { sheetId: avisos, startRowIndex: 2, endRowIndex: 7, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat' } });
  r.push({ setDataValidation: { range: { sheetId: avisos, startRowIndex: FILA_PUBLICAR_AHORA - 1, endRowIndex: FILA_PUBLICAR_AHORA, startColumnIndex: 1, endColumnIndex: 2 }, rule: { condition: { type: 'BOOLEAN' }, strict: true, showCustomUi: true } } });
  [190, 150, 900].forEach((px, i) => r.push({ updateDimensionProperties: { range: { sheetId: avisos, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } }));
  r.push({ updateDimensionProperties: { range: { sheetId: ids.manual, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 1100 }, fields: 'pixelSize' } });
  r.push({ repeatCell: { range: { sheetId: ids.manual, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 13 } } }, fields: 'userEnteredFormat.textFormat' } });
  for (const s of [listas, geo]) r.push({ updateSheetProperties: { properties: { sheetId: s, hidden: true }, fields: 'hidden' } });
  return r;
}

/** Inserta «Nombre de referencia» justo después de «Nombre a mostrar» y la rellena con el cliente que figura en INTERNO. Las fórmulas y los desplegables se corren solos. */
export async function agregarColumnaReferencia(almacen) {
  const fila1 = (await almacen.leerRango(`'${PESTANAS.mapa}'!A1:Z1`))?.[0] ?? [];
  if (fila1.some((h) => norm(h) === norm('Nombre de referencia'))) return false;
  const lugar = COLUMNAS.indexOf('Nombre de referencia');
  const mapaId = (await almacen.pestanas()).find((t) => t.title === PESTANAS.mapa).sheetId;
  await almacen.batchUpdate([{ insertDimension: { range: { sheetId: mapaId, dimension: 'COLUMNS', startIndex: lugar, endIndex: lugar + 1 }, inheritFromBefore: false } }]);
  await almacen.batchUpdate([
    { repeatCell: { range: { sheetId: mapaId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: lugar, endColumnIndex: lugar + 1 }, cell: { userEnteredFormat: { backgroundColor: { red: 0.133, green: 0.157, blue: 0.173 }, textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true }, wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,wrapStrategy,verticalAlignment)' } },
    { updateDimensionProperties: { range: { sheetId: mapaId, dimension: 'COLUMNS', startIndex: lugar, endIndex: lugar + 1 }, properties: { pixelSize: 220 }, fields: 'pixelSize' } },
  ]);
  const letra = letraDeColumna(lugar);
  await almacen.escribirRango(`'${PESTANAS.mapa}'!${letra}1`, [['Nombre de referencia']]);
  const mapa = await almacen.leerPestana(PESTANAS.mapa);
  const clientes = new Map((await almacen.leerPestana(PESTANAS.interno)).slice(1).map((f) => [idDeCelda(f[0]), String(f[1] ?? '').trim()]));
  const valores = mapa.slice(1).map((f) => [clientes.get(idDeCelda(f?.[0])) ?? '']);
  if (valores.some((v) => v[0])) await almacen.escribirRango(`'${PESTANAS.mapa}'!${letra}2`, valores);
  return true;
}

export async function prepararSheet(almacen, { forzar = false } = {}) {
  const marca = await almacen.leerRango(`'${PESTANAS.listas}'!J1`);
  if (!forzar && marca?.[0]?.[0] === MARCA) return false;
  if (!forzar && [MARCA_V1, MARCA_ANTERIOR].includes(marca?.[0]?.[0])) {   // Sheet ya preparado: solo se aplican las reparaciones que faltan
    if (marca[0][0] === MARCA_V1) {   // versión 1 → 2: idioma en_US y fórmula de «Nombre a mostrar» de nuevo
      await almacen.batchUpdate([SOLICITUD_IDIOMA]);
      await almacen.limpiarRango(`'${PESTANAS.mapa}'!C2:C${LIMITE_FILAS}`);
      await almacen.escribirRango(`'${PESTANAS.mapa}'!C2`, [[formulaNombreAMostrar(COLUMNAS_V1)]], { usuario: true });
    }
    await agregarColumnaReferencia(almacen);   // versión 2 → 3
    await almacen.escribirRango(`'${PESTANAS.manual}'!A1`, TEXTO_MANUAL);
    await almacen.escribirRango(`'${PESTANAS.listas}'!J1`, [[MARCA]]);
    return true;
  }
  let tabs = await almacen.pestanas();
  if (!tabs.some((t) => t.title === PESTANAS.mapa)) throw new Error(`El Sheet no tiene una pestaña llamada «${PESTANAS.mapa}». Usá el archivo «Mapa SLAVON.xlsx» que te preparé.`);
  const faltan = [PESTANAS.interno, PESTANAS.avisos, PESTANAS.manual, PESTANAS.listas, PESTANAS.geo].filter((n) => !tabs.some((t) => t.title === n));
  if (faltan.length) { await almacen.batchUpdate(faltan.map((title) => ({ addSheet: { properties: { title, gridProperties: { rowCount: LIMITE_FILAS, columnCount: 26 } } } }))); tabs = await almacen.pestanas(); }
  const id = (n) => tabs.find((t) => t.title === n).sheetId;
  await almacen.escribirRango(`'${PESTANAS.listas}'!A1`, valoresListas());
  await almacen.escribirRango(`'${PESTANAS.avisos}'!A1`, [
    ['AVISOS'], [''], ['Última actualización', ''], ['Resultado', 'Todavía no se publicó nada'], ['Publicar ahora', false], ['Obras en el mapa', ''], ['Publicación automática', 'Todas las noches a las 3 AM'], [''],
    ['Tipo', 'ID', 'Aviso'],
  ]);
  await almacen.escribirRango(`'${PESTANAS.manual}'!A1`, TEXTO_MANUAL);
  // El archivo importado trae solo las filas que usa: se agregan filas vacías para las obras nuevas y para las casillas.
  await almacen.batchUpdate([PESTANAS.mapa, PESTANAS.interno].map((n) => ({ appendDimension: { sheetId: id(n), dimension: 'ROWS', length: 4000 } })));
  await almacen.batchUpdate([SOLICITUD_IDIOMA]);
  await almacen.batchUpdate(solicitudesFormato({ mapa: id(PESTANAS.mapa), avisos: id(PESTANAS.avisos), manual: id(PESTANAS.manual), listas: id(PESTANAS.listas), geo: id(PESTANAS.geo) }));
  await almacen.limpiarRango(`'${PESTANAS.mapa}'!C2:C${LIMITE_FILAS}`);   // la fórmula se «derrama» hacia abajo: la columna tiene que estar vacía
  await almacen.escribirRango(`'${PESTANAS.mapa}'!C2`, [[FORMULA_NOMBRE_A_MOSTRAR]], { usuario: true });
  await almacen.escribirRango(`'${PESTANAS.listas}'!J1`, [[MARCA]]);
  return true;
}
