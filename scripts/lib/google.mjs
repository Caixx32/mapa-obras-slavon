// Conexión mínima con Google (cuenta de servicio) para Sheets y Drive. Sin dependencias: firma el JWT con `crypto`.
// La clave llega por la variable de entorno GOOGLE_SA_KEY (secret de GitHub). Nunca se imprime.
import crypto from 'node:crypto';

const BASE_SHEETS = () => process.env.SHEETS_BASE ?? 'https://sheets.googleapis.com/v4';
const BASE_DRIVE = () => process.env.DRIVE_BASE ?? 'https://www.googleapis.com/drive/v3';
const b64u = (x) => Buffer.from(x).toString('base64url');
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

export class ClienteGoogle {
  constructor(clave, { fetchFn = fetch } = {}) {
    let k;
    try { k = typeof clave === 'string' ? JSON.parse(clave) : clave; } catch { k = null; }
    if (!k?.client_email || !k?.private_key) throw new Error('La clave de la cuenta de servicio no es válida: tiene que ser el archivo JSON completo (con client_email y private_key).');
    this.k = k;
    this.fetch = fetchFn;
    this.tok = null;
    this.vence = 0;
  }

  async token() {
    if (this.tok && Date.now() < this.vence - 60_000) return this.tok;
    const ahora = Math.floor(Date.now() / 1000);
    const aud = this.k.token_uri ?? 'https://oauth2.googleapis.com/token';
    const claim = { iss: this.k.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive', aud, iat: ahora, exp: ahora + 3300 };
    const sinFirma = `${b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64u(JSON.stringify(claim))}`;
    const firma = crypto.createSign('RSA-SHA256').update(sinFirma).sign(this.k.private_key, 'base64url');
    const r = await this.fetch(aud, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${sinFirma}.${firma}` }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new Error(`Google no aceptó la clave de la cuenta de servicio (${r.status}${j.error ? ' ' + j.error : ''}). Revisá que la clave sea la correcta y que las APIs de Sheets y Drive estén activadas.`);
    this.tok = j.access_token;
    this.vence = Date.now() + (j.expires_in ?? 3300) * 1000;
    return this.tok;
  }

  /** Llama a la API con reintentos (429 / 5xx). `como` = 'json' (por defecto) o 'buffer'. */
  async api(url, { method = 'GET', json, como = 'json' } = {}) {
    let ultimo;
    for (let intento = 0; intento < 6; intento++) {
      const r = await this.fetch(url, { method, headers: { authorization: `Bearer ${await this.token()}`, ...(json ? { 'content-type': 'application/json' } : {}) }, body: json ? JSON.stringify(json) : undefined });
      if (r.ok) return como === 'buffer' ? Buffer.from(await r.arrayBuffer()) : r.status === 204 ? {} : r.json();
      const cuerpo = await r.json().catch(() => ({}));
      ultimo = new Error(`Google respondió ${r.status}${cuerpo?.error?.message ? ': ' + String(cuerpo.error.message).slice(0, 200) : ''}`);
      ultimo.status = r.status;
      const limite = r.status === 403 && /rate|quota/i.test(JSON.stringify(cuerpo?.error?.errors ?? cuerpo?.error?.message ?? ''));   // Drive avisa «muchas escrituras seguidas» con un 403
      if (r.status !== 429 && r.status < 500 && !limite) break;
      await pausa(1500 * (intento + 1));
    }
    throw ultimo;
  }
}

/** El Sheet «Mapa SLAVON» y la carpeta «Fotos Mapa SLAVON» se encuentran solos: son lo único compartido con la cuenta de servicio. */
export class AlmacenGoogle {
  constructor(cliente, { nombreHoja = 'Mapa SLAVON', nombreCarpeta = 'Fotos Mapa SLAVON', nombreBot = 'bot fotos' } = {}) {
    this.g = cliente;
    this.nombreHoja = nombreHoja;
    this.nombreCarpeta = nombreCarpeta;
    this.nombreBot = nombreBot;
    this.hojaId = null;
    this.carpetaId = null;
    this.botIds = [];
  }

  async #buscar(q, campos = 'files(id,name)') {
    const out = [];
    let pagina = '';
    do {
      const u = `${BASE_DRIVE()}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(`nextPageToken,${campos}`)}&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true${pagina ? '&pageToken=' + pagina : ''}`;
      const j = await this.g.api(u);
      out.push(...(j.files ?? []));
      pagina = j.nextPageToken ?? '';
    } while (pagina);
    return out;
  }

  async iniciar() {
    const hojas = await this.#buscar(`name = '${this.nombreHoja}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`);
    if (!hojas.length) throw new Error(`No encuentro el Google Sheet «${this.nombreHoja}». Compartilo con el mail de la cuenta de servicio (como Editor).`);
    this.hojaId = hojas[0].id;
    const carpetas = await this.#buscar(`name = '${this.nombreCarpeta}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
    if (!carpetas.length) throw new Error(`No encuentro la carpeta de Drive «${this.nombreCarpeta}». Compartila con el mail de la cuenta de servicio (como Editor).`);
    this.carpetaId = carpetas[0].id;
    // La carpeta del bot de fotos es opcional: si todavía no se la compartieron al robot, simplemente no se lee.
    this.botIds = (await this.#buscar(`name = '${this.nombreBot}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`)).map((f) => f.id);
    return this;
  }

  #valores(rango, extra = '') { return `${BASE_SHEETS()}/spreadsheets/${this.hojaId}/values/${encodeURIComponent(rango)}${extra}`; }

  async leerRango(rango) {
    try {
      const j = await this.g.api(this.#valores(rango, '?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING'));
      return j.values ?? [];
    } catch (e) {
      if (e.status === 400 || e.status === 404) return [];   // la pestaña todavía no existe
      throw e;
    }
  }
  leerPestana(nombre) { return this.leerRango(`'${nombre}'`); }

  async escribirRango(rango, valores, { usuario = false } = {}) {
    await this.g.api(this.#valores(rango, `?valueInputOption=${usuario ? 'USER_ENTERED' : 'RAW'}`), { method: 'PUT', json: { range: rango, majorDimension: 'ROWS', values: valores } });
  }
  async limpiarRango(rango) { await this.g.api(this.#valores(rango, ':clear'), { method: 'POST', json: {} }); }
  async actualizarCeldas(pestana, items /* [{ a1, valor }] */) {
    if (!items.length) return;
    await this.g.api(`${BASE_SHEETS()}/spreadsheets/${this.hojaId}/values:batchUpdate`, { method: 'POST', json: { valueInputOption: 'RAW', data: items.map((i) => ({ range: `'${pestana}'!${i.a1}`, values: [[i.valor]] })) } });
  }
  async pestanas() {
    const j = await this.g.api(`${BASE_SHEETS()}/spreadsheets/${this.hojaId}?fields=sheets.properties(sheetId,title,hidden)`);
    return (j.sheets ?? []).map((s) => s.properties);
  }
  async batchUpdate(requests) {
    if (requests.length) await this.g.api(`${BASE_SHEETS()}/spreadsheets/${this.hojaId}:batchUpdate`, { method: 'POST', json: { requests } });
  }

  /** { carpetas: [{id, nombre}], archivos: [{id, nombre, md5, carpetaId}] } (solo imágenes dentro de las subcarpetas). */
  async listarFotos() {
    const carpetas = (await this.#buscar(`mimeType = 'application/vnd.google-apps.folder' and trashed = false and '${this.carpetaId}' in parents`)).map((f) => ({ id: f.id, nombre: f.name }));
    const ids = new Set(carpetas.map((c) => c.id));
    const imagenes = await this.#buscar("mimeType contains 'image/' and trashed = false", 'files(id,name,md5Checksum,parents)');
    const archivos = imagenes.filter((f) => ids.has(f.parents?.[0])).map((f) => ({ id: f.id, nombre: f.name, md5: f.md5Checksum ?? '', carpetaId: f.parents[0] }));
    return { carpetas, archivos };
  }
  /**
   * Lo que archiva el bot de fotos: todas las carpetas que cuelgan de «bot fotos», sus fotos y sus datos.txt.
   * { activo, carpetas: [{id, nombre, padre, ruta}], archivos: [{id, nombre, md5, carpetaId}], datos: [{id, carpetaId, md5}] }
   */
  async listarBot() {
    if (!this.botIds.length) return { activo: false, carpetas: [], archivos: [], datos: [] };
    const todas = await this.#buscar("mimeType = 'application/vnd.google-apps.folder' and trashed = false", 'files(id,name,parents)');
    const info = new Map(todas.map((f) => [f.id, { id: f.id, nombre: f.name, padre: f.parents?.[0] ?? '' }]));
    const hijos = new Map();
    for (const f of info.values()) { if (!hijos.has(f.padre)) hijos.set(f.padre, []); hijos.get(f.padre).push(f.id); }
    const dentro = new Set();
    const cola = [...this.botIds];
    while (cola.length) { const id = cola.shift(); for (const h of hijos.get(id) ?? []) if (!dentro.has(h)) { dentro.add(h); cola.push(h); } }
    const ruta = (id) => { const r = []; for (let a = id, n = 0; a && info.has(a) && !this.botIds.includes(a) && n < 10; a = info.get(a).padre, n++) r.unshift(info.get(a).nombre); return r; };
    const carpetas = [...dentro].map((id) => ({ ...info.get(id), ruta: ruta(id) }));
    const imagenes = await this.#buscar("mimeType contains 'image/' and trashed = false", 'files(id,name,md5Checksum,parents)');
    const textos = await this.#buscar("name contains 'datos' and trashed = false", 'files(id,name,md5Checksum,parents,mimeType)');
    return {
      activo: true, carpetas,
      archivos: imagenes.filter((f) => dentro.has(f.parents?.[0])).map((f) => ({ id: f.id, nombre: f.name, md5: f.md5Checksum ?? '', carpetaId: f.parents[0] })),
      datos: textos.filter((f) => dentro.has(f.parents?.[0]) && /^datos(\.txt)*$/i.test(f.name) && f.mimeType !== 'application/vnd.google-apps.folder').map((f) => ({ id: f.id, carpetaId: f.parents[0], md5: f.md5Checksum ?? '' })),
    };
  }
  async leerTexto(id) { return (await this.descargar(id)).toString('utf8'); }
  descargar(id) { return this.g.api(`${BASE_DRIVE()}/files/${id}?alt=media&supportsAllDrives=true`, { como: 'buffer' }); }
  async renombrarCarpeta(id, nombre) { await this.g.api(`${BASE_DRIVE()}/files/${id}?supportsAllDrives=true&fields=id`, { method: 'PATCH', json: { name: nombre } }); }
  async crearCarpeta(nombre) {
    const j = await this.g.api(`${BASE_DRIVE()}/files?supportsAllDrives=true&fields=id,name`, { method: 'POST', json: { name: nombre, mimeType: 'application/vnd.google-apps.folder', parents: [this.carpetaId] } });
    return { id: j.id, nombre: j.name };
  }
}
