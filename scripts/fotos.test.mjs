import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { procesarFotos, crearCarpetas, escanear, esPrivada } from './lib/fotos.mjs';

async function entorno() {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'slavon-fotos-'));
  const dirs = { fotos: path.join(raiz, 'fotos'), publico: path.join(raiz, 'public', 'fotos'), internas: path.join(raiz, 'data', 'fotos-internas') };
  await fs.mkdir(dirs.fotos, { recursive: true });
  return { raiz, dirs };
}
const foto = (ancho = 3000, alto = 2000) =>
  sharp({ create: { width: ancho, height: alto, channels: 3, background: { r: 200, g: 30, b: 45 } } })
    .jpeg()
    .withExif({ IFD0: { ImageDescription: 'cliente-secreto' }, IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '34/1 36/1 0/1', GPSLongitudeRef: 'W', GPSLongitude: '58/1 22/1 0/1' } })
    .toBuffer();
const lista = async (d) => (await fs.readdir(d).catch(() => [])).sort();
const obras = [{ id: '0023', publicar: true, nombre_club: 'Club Los Pinos', deporte: 'futbol', ciudad: 'Córdoba' }, { id: '0024', publicar: false }];

test('optimiza a WebP: 1600 px de ancho + miniatura de 400 px, sin EXIF/GPS', async () => {
  const { dirs } = await entorno();
  await fs.mkdir(path.join(dirs.fotos, '0023-club-los-pinos'));
  const original = await foto();
  assert.ok((await sharp(original).metadata()).exif, 'la foto de prueba tiene que traer EXIF');
  await fs.writeFile(path.join(dirs.fotos, '0023-club-los-pinos', 'cancha.jpg'), original);
  const r = await procesarFotos(obras, dirs);
  const [f] = r.publicas.get('0023');
  assert.match(f.src, /^fotos\/0023\/[0-9a-f]{12}\.webp$/);
  const raizPublic = path.join(dirs.publico, '..');
  const m = await sharp(path.join(raizPublic, f.src)).metadata();
  const t = await sharp(path.join(raizPublic, f.thumb)).metadata();
  assert.equal(m.format, 'webp');
  assert.equal(m.width, 1600);
  assert.equal(t.width, 400);
  assert.equal(m.exif, undefined, 'no debe quedar EXIF (incluye la ubicación GPS)');
  assert.ok(!(await fs.readFile(path.join(raizPublic, f.src))).includes('cliente-secreto'));
  assert.ok(!f.src.includes('cancha'), 'el nombre original no se filtra');
});

test('no agranda fotos chicas', async () => {
  const { dirs } = await entorno();
  await fs.mkdir(path.join(dirs.fotos, '0023-x'));
  await fs.writeFile(path.join(dirs.fotos, '0023-x', 'a.png'), await sharp({ create: { width: 800, height: 600, channels: 3, background: '#fff' } }).png().toBuffer());
  const r = await procesarFotos(obras, dirs);
  const m = await sharp(path.join(dirs.publico, '..', r.publicas.get('0023')[0].src)).metadata();
  assert.equal(m.width, 800);
});

test('fotos con _privada solo van a la versión interna', async () => {
  const { dirs } = await entorno();
  await fs.mkdir(path.join(dirs.fotos, '0023-club'));
  await fs.writeFile(path.join(dirs.fotos, '0023-club', '01.jpg'), await foto(1000, 700));
  await fs.writeFile(path.join(dirs.fotos, '0023-club', '02_privada.jpg'), await foto(1200, 800));
  const r = await procesarFotos(obras, dirs);
  assert.equal(r.publicas.get('0023').length, 1);
  assert.equal(r.internas.get('0023').length, 2);
  assert.equal(r.internas.get('0023').filter((x) => x.privada).length, 1);
  assert.equal((await lista(path.join(dirs.publico, '0023'))).length, 2); // principal + miniatura
  assert.equal((await lista(path.join(dirs.internas, '0023'))).length, 2);
  assert.ok(esPrivada('foto_PRIVADA.JPG'));
});

test('si renombrás una foto publicada a _privada, desaparece de lo público', async () => {
  const { dirs } = await entorno();
  const carpeta = path.join(dirs.fotos, '0023-club');
  await fs.mkdir(carpeta);
  await fs.writeFile(path.join(carpeta, 'a.jpg'), await foto(1000, 700));
  await procesarFotos(obras, dirs);
  assert.equal((await lista(path.join(dirs.publico, '0023'))).length, 2);
  await fs.rename(path.join(carpeta, 'a.jpg'), path.join(carpeta, 'a_privada.jpg'));
  const r = await procesarFotos(obras, dirs);
  assert.equal(r.publicas.get('0023'), undefined);
  assert.equal((await lista(path.join(dirs.publico, '0023'))).length, 0, 'no puede quedar nada público');
  assert.equal((await lista(path.join(dirs.internas, '0023'))).length, 2);
});

test('obra con publicar = no: sus fotos no salen en lo público', async () => {
  const { dirs } = await entorno();
  await fs.mkdir(path.join(dirs.fotos, '0024-x'));
  await fs.writeFile(path.join(dirs.fotos, '0024-x', 'a.jpg'), await foto(900, 600));
  const r = await procesarFotos(obras, dirs);
  assert.equal(r.publicas.get('0024'), undefined);
  assert.equal(r.internas.get('0024').length, 1);
});

test('sin las fotos originales (otra compu) NO se borran las ya publicadas', async () => {
  const { dirs } = await entorno();
  await fs.mkdir(path.join(dirs.fotos, '0023-club'));
  await fs.writeFile(path.join(dirs.fotos, '0023-club', 'a.jpg'), await foto(1000, 700));
  await procesarFotos(obras, dirs);
  await fs.rm(dirs.fotos, { recursive: true });
  await fs.mkdir(dirs.fotos);
  const r = await procesarFotos(obras, dirs);
  assert.equal(r.publicas.get('0023').length, 1, 'la foto publicada tiene que seguir en el JSON');
  assert.equal((await lista(path.join(dirs.publico, '0023'))).length, 2);
});

test('carpetas de obras que ya no existen en la planilla se limpian', async () => {
  const { dirs } = await entorno();
  await fs.mkdir(path.join(dirs.publico, '9999'), { recursive: true });
  await fs.writeFile(path.join(dirs.publico, '9999', 'x.webp'), 'x');
  await procesarFotos(obras, dirs);
  assert.deepEqual(await lista(dirs.publico), []);
});

test('avisos: carpeta sin id, HEIC y video', async () => {
  const { dirs } = await entorno();
  await fs.mkdir(path.join(dirs.fotos, 'cualquier-cosa'));
  await fs.mkdir(path.join(dirs.fotos, '0023-club'));
  await fs.writeFile(path.join(dirs.fotos, '0023-club', 'a.heic'), 'x');
  await fs.writeFile(path.join(dirs.fotos, '0023-club', 'b.mp4'), 'x');
  const { avisos } = await escanear(dirs.fotos);
  assert.equal(avisos.length, 3);
});

test('crearCarpetas: una por obra publicable, sin duplicar las existentes', async () => {
  const { dirs } = await entorno();
  assert.equal(await crearCarpetas(dirs.fotos, obras), 1);
  assert.equal(await crearCarpetas(dirs.fotos, obras), 0);
  assert.deepEqual(await lista(dirs.fotos), ['0023-club-los-pinos-cordoba']);
});
