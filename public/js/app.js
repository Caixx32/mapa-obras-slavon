// Orquestador del mapa. Sirve para la versión pública y para la interna (data-modo en <body>).
import { DEPORTES, alternarDeporte, filtrar, contarPorDeporte, agruparProvincias, tieneUbicacion } from './logica.js';
import { crearMapa, colorDeporte } from './mapa.js';
import { crearTarjeta } from './tarjeta.js';
import { iniciarLanding } from './landing.js';

const modo = document.body.dataset.modo === 'interno' ? 'interno' : 'publico';
const baseSitio = document.body.dataset.base ?? '';                 // dónde está public/ respecto de esta página
const baseFotos = modo === 'interno' ? '../' : '';                  // las fotos del JSON interno son relativas a la raíz del repo
const URL_DATOS = modo === 'interno' ? '../data/obras-internas.json' : 'data/obras-publicas.json';
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATRIBUCION = '© OpenStreetMap contributors';
const FILTRO_MAPA = 'grayscale(1) contrast(0.9) brightness(1.08)';

const $ = (id) => document.getElementById(id);
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

async function cargarJson(url, opciones) {
  const r = await fetch(url, { cache: 'no-cache', ...opciones });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

function aplicarColores(colores = {}) {
  const r = document.documentElement.style;
  const mapa = { primario: '--color-primario', carbon: '--color-carbon', texto_secundario: '--color-texto-secundario' };
  for (const [k, v] of Object.entries(colores)) if (mapa[k] && /^#[0-9a-f]{3,8}$/i.test(v)) r.setProperty(mapa[k], v);
}

function mostrarError(msg) {
  $('mapa').replaceChildren(Object.assign(document.createElement('p'), { className: 'error-carga', textContent: msg }));
}

async function iniciar() {
  const [config, datos] = await Promise.all([
    cargarJson(`${baseSitio}config.json`).catch(() => ({})),
    cargarJson(URL_DATOS),
  ]);
  aplicarColores(config.colores);
  if (!config.whatsapp && ['localhost', '127.0.0.1'].includes(location.hostname)) {
    console.warn('[SLAVON] Falta el número de WhatsApp en public/config.json: los botones abren WhatsApp sin destinatario.');
  }
  const obras = datos.obras;
  const todosIds = DEPORTES.map((d) => d.id).filter((id) => obras.some((o) => o.deporte === id && tieneUbicacion(o)));
  const estado = { deportes: null, provincia: '', texto: '' };

  const contexto = { config, modo, base: baseFotos, baseSitio };
  const tarjeta = crearTarjeta($('tarjeta'), contexto);
  const mapa = crearMapa($('mapa'), {
    tiles: config.mapa?.tiles || TILES,
    atribucion: config.mapa?.atribucion || ATRIBUCION,
    subdominios: config.mapa?.subdominios,
    zoomNativoMaximo: config.mapa?.zoom_nativo_maximo,
    filtro: config.mapa ? config.mapa.filtro : FILTRO_MAPA,
    alFallarMapaBase: () => { const av = $('aviso-mapa'); if (av) av.hidden = false; },
    alSeleccionar: abrirObra,
    alDeseleccionar: () => tarjeta.cerrar(),
  });
  const esEscritorio = matchMedia('(min-width: 900px)');

  function abrirObra(o) {
    tarjeta.abrir(o);
    document.body.classList.add('tarjeta-abierta');
    history.replaceState(null, '', `#obra=${o.id}`);
    requestAnimationFrame(() => mapa.mostrarObra(o, { desplazarY: esEscritorio.matches ? 0 : Math.round(tarjeta.altoPanel() / 2) }));
  }
  tarjeta.alCerrar(() => {
    document.body.classList.remove('tarjeta-abierta');
    mapa.desmarcar();
    if (location.hash.startsWith('#obra=')) history.replaceState(null, '', location.pathname + location.search);
  });

  // ---------------- chips por deporte (hacen también de leyenda)
  const chips = $('chips');
  const crearChip = (id, etiqueta, color) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.dep = id;
    if (color) b.append(Object.assign(document.createElement('span'), { className: 'punto' }));
    if (color) b.firstChild.style.setProperty('--c', color);
    b.append(document.createTextNode(etiqueta + ' '), Object.assign(document.createElement('span'), { className: 'n' }));
    return b;
  };
  chips.append(crearChip('todos', 'Todos'));
  for (const d of DEPORTES.filter((d) => todosIds.includes(d.id))) chips.append(crearChip(d.id, d.etiqueta, colorDeporte(d.id)));
  chips.addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    estado.deportes = b.dataset.dep === 'todos' ? null : alternarDeporte(estado.deportes, b.dataset.dep, todosIds);
    aplicar();
  });

  // ---------------- provincia
  const sel = $('provincia');
  sel.append(new Option('Todas las provincias', ''));
  const grupos = agruparProvincias(obras);
  for (const g of grupos) {
    const padre = grupos.length > 1 ? Object.assign(document.createElement('optgroup'), { label: g.pais }) : sel;
    for (const p of g.provincias) padre.append(new Option(`${p.nombre} (${p.n})`, p.valor));
    if (padre !== sel) sel.append(padre);
  }
  sel.addEventListener('change', () => { estado.provincia = sel.value; aplicar(); });

  // ---------------- búsqueda (solo versión interna)
  const buscador = $('buscador');
  if (buscador) buscador.addEventListener('input', debounce(() => { estado.texto = buscador.value; aplicar(); }, 200));

  // ---------------- aplicar filtros
  const vacio = $('vacio');
  function reiniciarFiltros({ ajustar = true } = {}) {
    estado.deportes = null; estado.provincia = ''; estado.texto = '';
    sel.value = ''; if (buscador) buscador.value = '';
    aplicar({ ajustar });
  }
  vacio.querySelector('button').addEventListener('click', () => reiniciarFiltros());

  function aplicar({ ajustar = true } = {}) {
    const visibles = filtrar(obras, estado);
    const ubicadas = mapa.mostrar(visibles);
    const base = filtrar(obras, { provincia: estado.provincia, texto: estado.texto }).filter(tieneUbicacion);
    const conteos = contarPorDeporte(base);
    for (const b of chips.children) {
      const id = b.dataset.dep;
      b.setAttribute('aria-pressed', String(id === 'todos' ? estado.deportes === null : Boolean(estado.deportes?.has(id))));
      b.querySelector('.n').textContent = String(id === 'todos' ? base.length : conteos.get(id) ?? 0);
    }
    $('conteo').textContent = `${ubicadas} ${ubicadas === 1 ? 'obra' : 'obras'} en el mapa`;
    vacio.hidden = ubicadas > 0;
    if (ajustar && ubicadas) mapa.ajustar(visibles);
  }

  // ---------------- teclado y tamaño
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') tarjeta.cerrar(); });
  addEventListener('resize', debounce(() => mapa.invalidar(), 150));

  aplicar();

  // Secciones de la landing pública (titular, contadores, destacadas, cierre). La versión interna no las tiene.
  const irAlMapa = (o) => {
    reiniciarFiltros({ ajustar: false });
    $('mapa-obras')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    setTimeout(() => abrirObra(o), 500);
  };
  if (modo === 'publico') iniciarLanding({ config, datos, verEnMapa: irAlMapa });

  // Enlace directo a una obra (#obra=0023): baja hasta el mapa y abre la tarjeta
  const id = new URLSearchParams(location.hash.slice(1)).get('obra');
  const inicial = id && obras.find((o) => o.id === id && tieneUbicacion(o));
  if (inicial) { $('mapa-obras')?.scrollIntoView({ block: 'start' }); setTimeout(() => abrirObra(inicial), 300); }

  // Ganchos para pruebas automáticas
  window.__slavon = { obras, estado, aplicar, abrirObra, mapa, tarjeta };
}

iniciar().catch((e) => {
  console.error(e);
  mostrarError(location.protocol === 'file:'
    ? 'Abrí la página con «npm run servir»: los navegadores no permiten cargar los datos desde un archivo local.'
    : 'No pudimos cargar las obras. Probá de nuevo en unos minutos.');
});
