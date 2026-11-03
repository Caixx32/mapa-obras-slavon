#!/usr/bin/env node
// Servidor local, sin dependencias. Solo escucha en tu computadora (127.0.0.1).
//   npm run servir    → vista previa de lo que se publica (solo la carpeta public/)
//   npm run interno   → versión interna (nombres reales, ubicaciones exactas y todas las fotos). NO se publica.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { RAIZ } from './lib/util.mjs';

const args = process.argv.slice(2);
const interno = args.includes('--interno');
const puertoBase = Number(args.find((a) => a.startsWith('--puerto='))?.split('=')[1]) || 8080;

// En modo interno solo se exponen estas carpetas (no la planilla, ni los reportes, ni node_modules, ni .git).
const RAIZ_SERVIDA = interno ? RAIZ : path.join(RAIZ, 'public');
const PERMITIDOS = interno ? ['interno', 'public', 'data'] : null;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

const servidor = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let ruta = decodeURIComponent(url.pathname);
    if (ruta.endsWith('/')) ruta += 'index.html';
    const absoluta = path.normalize(path.join(RAIZ_SERVIDA, ruta));
    const rel = path.relative(RAIZ_SERVIDA, absoluta);
    const primero = rel.split(path.sep)[0];
    if (rel.startsWith('..') || path.isAbsolute(rel) || rel.split(path.sep).some((p) => p.startsWith('.')) || (PERMITIDOS && !PERMITIDOS.includes(primero))) {
      res.writeHead(404).end('No encontrado');
      return;
    }
    const st = await fs.stat(absoluta);
    if (!st.isFile()) throw new Error('no es archivo');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(absoluta).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(await fs.readFile(absoluta));
  } catch {
    res.writeHead(404).end('No encontrado');
  }
});

function abrir(url) {
  const [cmd, ...a] = process.platform === 'win32' ? ['cmd', '/c', 'start', '', url] : process.platform === 'darwin' ? ['open', url] : ['xdg-open', url];
  try { spawn(cmd, a, { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch { /* sin navegador: se copia el link */ }
}

function escuchar(puerto, intentos = 10) {
  servidor.once('error', (e) => {
    if (e.code === 'EADDRINUSE' && intentos > 0) escuchar(puerto + 1, intentos - 1);
    else { console.error('✖ No se pudo iniciar el servidor:', e.message); process.exit(1); }
  });
  servidor.listen(puerto, '127.0.0.1', () => {
    const url = `http://localhost:${puerto}/${interno ? 'interno/' : ''}`;
    console.log(interno ? '⚠ VERSIÓN INTERNA: tiene nombres reales y ubicaciones exactas. No la compartas.' : 'Vista previa de lo que se publica (carpeta public/).');
    console.log(`\n  ${url}\n\nCtrl+C para cortar.`);
    if (!args.includes('--no-abrir')) abrir(url);
  });
}
escuchar(puertoBase);
