// Almacén en memoria con la misma interfaz que AlmacenGoogle. Sirve para probar la publicación sin hablar con Google.
import crypto from 'node:crypto';

const colNum = (letras) => [...letras].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1;
function celda(a1) { const m = a1.match(/^([A-Z]+)(\d+)$/); return { c: colNum(m[1]), f: Number(m[2]) - 1 }; }
function partes(rango) {
  const m = rango.match(/^'?([^'!]+)'?(?:!(.+))?$/);
  const [a, b] = (m[2] ?? 'A1').split(':');
  const ini = celda(a);
  const fin = b ? celda(b) : null;
  return { tab: m[1], ini, fin };
}

export class AlmacenMemoria {
  constructor(tabs = {}) {
    this.tabs = Object.fromEntries(Object.entries(tabs).map(([k, v]) => [k, v.map((f) => [...f])]));
    this.carpetas = [];
    this.archivos = [];
    this.contenidos = new Map();
    this.llamadas = [];
    this.solicitudes = [];
    this.n = 0;
  }
  agregarFoto(carpetaId, nombre, buffer) {
    const id = `foto${++this.n}`;
    this.archivos.push({ id, nombre, md5: crypto.createHash('md5').update(buffer).digest('hex'), carpetaId });
    this.contenidos.set(id, buffer);
    return id;
  }
  async leerPestana(nombre) { return (this.tabs[nombre] ?? []).map((f) => [...f]); }
  async leerRango(rango) {
    const { tab, ini, fin } = partes(rango);
    const filas = (this.tabs[tab] ?? []).slice(ini.f, fin ? fin.f + 1 : ini.f + 1).map((f) => f.slice(ini.c, fin ? fin.c + 1 : ini.c + 1));
    return filas.some((f) => f.some((v) => v !== undefined && v !== '')) ? filas : [];
  }
  async escribirRango(rango, valores) {
    const { tab, ini } = partes(rango);
    this.tabs[tab] ??= [];
    valores.forEach((fila, i) => fila.forEach((v, j) => {
      if (typeof v === 'string' && v.startsWith('=')) return;   // las fórmulas no se evalúan acá
      this.tabs[tab][ini.f + i] ??= [];
      this.tabs[tab][ini.f + i][ini.c + j] = v;
    }));
  }
  async limpiarRango(rango) {
    const { tab, ini, fin } = partes(rango);
    const filas = this.tabs[tab];
    if (!filas) return;
    for (let f = ini.f; f < filas.length && (!fin || f <= fin.f); f++) {
      if (!filas[f]) continue;
      for (let c = ini.c; c < filas[f].length && (!fin || c <= fin.c); c++) filas[f][c] = undefined;
      while (filas[f].length && filas[f][filas[f].length - 1] === undefined) filas[f].pop();
    }
    while (filas.length && (!filas[filas.length - 1] || !filas[filas.length - 1].length)) filas.pop();
  }
  async actualizarCeldas(tab, items) { for (const { a1, valor } of items) await this.escribirRango(`'${tab}'!${a1}`, [[valor]]); }
  async pestanas() { return Object.keys(this.tabs).map((title, i) => ({ sheetId: i + 1, title })); }
  async batchUpdate(requests) { for (const r of requests) if (r.addSheet) this.tabs[r.addSheet.properties.title] ??= []; this.llamadas.push(requests.length); this.solicitudes.push(...requests); }
  async listarFotos() { return { carpetas: [...this.carpetas], archivos: [...this.archivos] }; }
  async descargar(id) { return this.contenidos.get(id); }
  async crearCarpeta(nombre) { const c = { id: `carpeta${++this.n}`, nombre }; this.carpetas.push(c); return c; }
}
