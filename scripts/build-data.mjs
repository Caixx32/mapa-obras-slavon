#!/usr/bin/env node
// build-data: obras-maestra.xlsx (+ KML opcional + fotos/) → JSON público e interno, fotos en WebP y reportes.
//   npm run build-data              (con internet: ubica por ciudad las obras sin coordenadas)
//   npm run build-data:sin-red      (sin internet)
//   opciones: --maestra=ruta.xlsx  --kml=ruta.kml  --solo-validar
import fs from 'node:fs/promises';
import path from 'node:path';
import { RAIZ } from './lib/util.mjs';
import { leerMaestra } from './lib/master.mjs';
import { construirPublico, construirInterno } from './lib/publico.mjs';
import { crearCarpetas, procesarFotos } from './lib/fotos.mjs';
import { leerKml, completarDesdeKml, geocodificarFaltantes, cargarCache, guardarCache } from './lib/coords.mjs';
import { escribirFotosPendientes, escribirCoordenadasAprox, escribirSinUbicar, escribirSinProvincia, escribirRevisarNombres, leerRevisionNombres } from './lib/reportes.mjs';
import { aplicarPrivacidad, normalizarPropuesta } from './lib/nombres.mjs';

const args = process.argv.slice(2);
const tiene = (f) => args.includes(f);
const valor = (f) => args.find((a) => a.startsWith(f + '='))?.slice(f.length + 1);
const R = (...p) => path.join(RAIZ, ...p);
const RUTAS = {
  maestra: valor('--maestra') ? path.resolve(valor('--maestra')) : R('obras-maestra.xlsx'),
  kml: valor('--kml') ? path.resolve(valor('--kml')) : R('Canchas_SLAVON.kml'),
  fotos: R('fotos'),
  fotosPublicas: R('public', 'fotos'),
  fotosInternas: R('data', 'fotos-internas'),
  jsonPublico: R('public', 'data', 'obras-publicas.json'),
  jsonInterno: R('data', 'obras-internas.json'),
  cacheGeo: R('data', 'geocache.json'),
  fotosPendientes: R('fotos-pendientes.xlsx'),
  aprox: R('reportes', 'coordenadas-aprox.xlsx'),
  sinUbicar: R('reportes', 'sin-ubicar.xlsx'),
  sinProvincia: R('reportes', 'sin-provincia.xlsx'),
  revision: R('revisar-nombres.xlsx'),            // la copia corregida por una persona (no se sube a GitHub)
  revisarNombres: R('reportes', 'revisar-nombres.xlsx'),
  avisos: R('reportes', 'avisos.txt'),
};

async function escribirJson(ruta, datos) {
  await fs.mkdir(path.dirname(ruta), { recursive: true });
  const tmp = ruta + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(datos));
  await fs.rename(tmp, ruta);
  return (await fs.stat(ruta)).size;
}
const kb = (n) => `${Math.round(n / 1024)} KB`;
const existe = (p) => fs.access(p).then(() => true, () => false);

async function main() {
  const t0 = Date.now();
  const avisos = [];
  console.log('1/5  Leyendo la planilla maestra…');
  if (!(await existe(RUTAS.maestra))) {
    throw new Error(`No encuentro la planilla maestra en ${RUTAS.maestra}\n     Copiá obras-maestra.xlsx a la carpeta del proyecto (no se sube a GitHub) o usá --maestra=ruta/al/archivo.xlsx`);
  }
  const { obras, errores, avisos: avisosMaestra } = await leerMaestra(RUTAS.maestra);
  avisos.push(...avisosMaestra);
  if (errores.length) {
    throw new Error(`La planilla tiene ${errores.length} error(es) que hay que corregir:\n` + errores.slice(0, 25).map((e) => '  - ' + e).join('\n'));
  }
  // Privacidad: qué obras pueden mostrar el nombre. Manda revisar-nombres.xlsx si existe; si no, el cálculo automático.
  const decisiones = await leerRevisionNombres(RUTAS.revision, normalizarPropuesta);
  const filasNombres = aplicarPrivacidad(obras, decisiones);
  const cuentaNombres = filasNombres.filter((f) => f.publicar).reduce((a, f) => ({ ...a, [f.propuesta]: (a[f.propuesta] ?? 0) + 1 }), {});
  console.log(`     Nombres: ${cuentaNombres.nombrable ?? 0} con nombre · ${cuentaNombres.anonima ?? 0} anónimas · ${cuentaNombres.revisar ?? 0} a revisar (se publican anónimas)${decisiones.size ? ` · ${decisiones.size} decisiones tuyas leídas` : ''}`);
  const simplificadas = obras.filter((o) => o._ciudad_simplificada);
  if (simplificadas.length) {
    const ej = simplificadas.slice(0, 2).map((o) => `«${o._ciudad_simplificada}» → «${o.ciudad}»`).join(', ');
    avisos.push(`${simplificadas.length} nombres de ciudad se simplificaron (ej. ${ej})`);
  }
  const publicables = obras.filter((o) => o.publicar);
  console.log(`     ${obras.length} obras (${publicables.length} publicables)`);

  console.log('2/5  Coordenadas…');
  let delKml = 0;
  if (await existe(RUTAS.kml)) delKml = completarDesdeKml(obras, await leerKml(RUTAS.kml));
  const cache = await cargarCache(RUTAS.cacheGeo);
  let geo = { hechas: [], fallidas: [], sinDatos: obras.filter((o) => o.publicar && o.lat === null && (!o.ciudad || !o.provincia)), error: null };
  if (tiene('--sin-red')) {
    console.log('     (--sin-red: no se consulta Nominatim; se usan las ubicaciones ya guardadas)');
    geo = await geocodificarFaltantes(obras, cache, { soloCache: true });
  } else {
    geo = await geocodificarFaltantes(obras, cache);
    await guardarCache(RUTAS.cacheGeo, cache);
    if (geo.error) avisos.push(`Nominatim no respondió (${geo.error.message}). Las obras sin coordenadas quedaron sin ubicar; volvé a correr cuando haya internet.`);
  }
  const sinUbicar = obras.filter((o) => o.publicar && o.lat === null);
  console.log(`     del KML: ${delKml} · por ciudad (aprox): ${geo.hechas.length} · sin ubicar: ${sinUbicar.length}`);

  console.log('3/5  Fotos…');
  const creadas = tiene('--solo-validar') ? 0 : await crearCarpetas(RUTAS.fotos, obras);
  const fotos = await procesarFotos(obras, { fotos: RUTAS.fotos, publico: RUTAS.fotosPublicas, internas: RUTAS.fotosInternas });
  avisos.push(...fotos.avisos);
  const nPub = [...fotos.publicas.values()].reduce((a, l) => a + l.length, 0);
  console.log(`     ${fotos.stats.leidas} leídas (${fotos.stats.nuevas} optimizadas ahora, ${fotos.stats.privadas} privadas) · ${nPub} en la versión pública · carpetas nuevas: ${creadas}`);

  console.log('4/5  Armando los datos…');
  const generado = new Date().toISOString();
  const publico = construirPublico(obras, fotos.publicas, generado); // lanza si detecta fugas de datos
  avisos.push(...publico.avisos);
  const interno = construirInterno(obras, fotos.internas, generado);
  for (const r of publico.json.obras) {
    for (const f of r.fotos) {
      if (!(await existe(path.join(R('public'), f.src)))) throw new Error(`obra ${r.id}: la foto ${f.src} figura en el JSON pero no existe en public/`);
    }
  }
  if (tiene('--solo-validar')) {
    console.log('\n✔ Validación correcta (no se escribió nada).');
    return;
  }
  const tamPub = await escribirJson(RUTAS.jsonPublico, publico.json);
  const tamInt = await escribirJson(RUTAS.jsonInterno, interno);

  console.log('5/5  Reportes…');
  const nPend = await escribirFotosPendientes(RUTAS.fotosPendientes, obras, fotos.publicas, fotos.internas);
  const rep = await escribirCoordenadasAprox(RUTAS.aprox, obras, geo.hechas, geo.fallidas);
  await escribirRevisarNombres(RUTAS.revisarNombres, filasNombres);
  const nSinUbicar = await escribirSinUbicar(RUTAS.sinUbicar, obras, geo.fallidas);
  const nSinProvincia = await escribirSinProvincia(RUTAS.sinProvincia, obras);
  await fs.mkdir(path.dirname(RUTAS.avisos), { recursive: true });
  await fs.writeFile(RUTAS.avisos, avisos.join('\n') + '\n');

  const m = publico.json.meta;
  console.log('\n✔ build-data terminado en ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  console.log(`  Versión pública : public/data/obras-publicas.json (${kb(tamPub)}) — ${m.obras} obras, ${m.total_canchas} canchas, ${m.provincias} provincias`);
  console.log(`  Titular         : «Más de ${m.titular_n} canchas construidas en ${m.paises.join(' y ')}»`);
  console.log(`  Versión interna : data/obras-internas.json (${kb(tamInt)}) — NO se sube a GitHub`);
  console.log(`  Sin foto        : ${nPend} obras → fotos-pendientes.xlsx (destacadas primero)`);
  console.log(`  Coordenadas aprox: ${rep.aprox} para revisar · sin ubicar: ${rep.sinUbicar} → reportes/coordenadas-aprox.xlsx`);
  console.log(`  Sin ubicar      : ${nSinUbicar} obras → reportes/sin-ubicar.xlsx · sin provincia: ${nSinProvincia} → reportes/sin-provincia.xlsx`);
  if (avisos.length) {
    console.log(`\n⚠ ${avisos.length} aviso(s) (todos en reportes/avisos.txt):`);
    avisos.slice(0, 12).forEach((a) => console.log('  - ' + a));
    if (avisos.length > 12) console.log(`  … y ${avisos.length - 12} más`);
  }
}

main().catch((e) => {
  console.error('\n✖ ' + e.message);
  process.exit(1);
});
