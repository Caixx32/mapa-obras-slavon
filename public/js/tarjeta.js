// Tarjeta de obra: escritorio = panel lateral; celular = panel inferior (arrastrable hacia abajo para cerrarlo).
import { partirNombre, deporteMeta, mensajeWhatsApp, urlWhatsApp, resolverRuta } from './logica.js';
import { colorDeporte } from './mapa.js';
import { ICONO_WHATSAPP } from './iconos.js';


function el(tag, clase, texto) {
  const e = document.createElement(tag);
  if (clase) e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function dato(dl, etiqueta, valor, ancho = false) {
  if (valor === null || valor === undefined || valor === '') return;
  const d = el('div', ancho ? 'ancho' : '');
  d.append(el('dt', '', etiqueta), el('dd', '', String(valor)));
  dl.append(d);
}

function carrusel(o, ctx) {
  const meta = deporteMeta(o.deporte);
  const fotos = o.fotos ?? [];
  const cont = el('div', `carrusel${fotos.length > 1 ? ' multiple' : ''}`);
  const pista = el('div', 'carrusel-pista');
  pista.setAttribute('role', 'group');
  pista.setAttribute('aria-roledescription', 'carrusel');
  pista.setAttribute('aria-label', 'Fotos de la obra');
  const alt = `Cancha de ${meta.etiqueta.toLowerCase()} en ${o.ciudad || o.provincia || 'Argentina'}`;
  const crear = (f, i) => {
    const slide = el('div', 'carrusel-slide');
    const img = new Image();
    img.alt = alt;
    img.decoding = 'async';
    img.loading = i === 0 ? 'eager' : 'lazy';
    if (f) {
      img.src = resolverRuta(f.src, ctx.base);
      if (f.thumb) {
        img.srcset = `${resolverRuta(f.thumb, ctx.base)} 400w, ${resolverRuta(f.src, ctx.base)} 1600w`;
        img.sizes = '(min-width: 900px) 392px, 100vw';
      }
      if (f.privada) slide.append(Object.assign(el('span', 'estado-obra', 'Privada'), { style: 'position:absolute;left:10px;top:10px;z-index:2;background:#E50D2D' }));
    } else {
      img.src = `${ctx.baseSitio}img/generico-${o.deporte}.svg`;
    }
    slide.append(img);
    return slide;
  };
  if (fotos.length) fotos.forEach((f, i) => pista.append(crear(f, i)));
  else pista.append(crear(null, 0));
  cont.append(pista);

  if (fotos.length > 1) {
    const puntos = el('div', 'puntos');
    fotos.forEach((_, i) => puntos.append(el('span', i === 0 ? 'on' : '')));
    const ir = (delta) => pista.scrollBy({ left: delta * pista.clientWidth, behavior: 'smooth' });
    const prev = el('button', 'flecha prev', '‹');
    const next = el('button', 'flecha next', '›');
    prev.type = next.type = 'button';
    prev.setAttribute('aria-label', 'Foto anterior');
    next.setAttribute('aria-label', 'Foto siguiente');
    prev.onclick = () => ir(-1);
    next.onclick = () => ir(1);
    pista.tabIndex = 0;
    pista.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') ir(1);
      if (e.key === 'ArrowLeft') ir(-1);
    });
    pista.addEventListener('scroll', () => {
      const i = Math.round(pista.scrollLeft / pista.clientWidth);
      [...puntos.children].forEach((p, k) => p.classList.toggle('on', k === i));
    }, { passive: true });
    cont.append(prev, next, puntos);
  }
  return cont;
}

function cta(o, ctx) {
  const wa = el('a', 'btn');
  wa.innerHTML = ICONO_WHATSAPP;
  wa.append(document.createTextNode('Quiero una cancha así'));
  wa.href = urlWhatsApp(ctx.config.whatsapp, mensajeWhatsApp(o, ctx.config.mensajes?.whatsapp_obra));
  wa.target = '_blank';
  wa.rel = 'noopener';
  const c = el('div', 'cta');
  c.append(wa);
  return c;
}

function cuerpo(o, ctx) {
  const meta = deporteMeta(o.deporte);
  const { titulo, lugar } = partirNombre(o);
  const c = el('div', 'cuerpo');
  const tag = el('p', 'tag', meta.etiqueta);
  tag.append(Object.assign(el('span', 'punto'), { style: `--c:${colorDeporte(o.deporte)}` }));
  const h = el('h2', '', titulo);
  h.id = 'tarjeta-titulo';
  h.tabIndex = -1;
  c.append(tag, h);
  if (lugar) c.append(el('p', 'lugar', lugar));
  if (o.estado === 'en_obra') c.append(el('span', 'estado-obra en-marcha', 'En obra ahora'));
  const dl = el('dl', 'datos');
  dato(dl, 'Tipo', o.tipo, true);
  dato(dl, 'Canchas', o.cantidad_canchas);
  dato(dl, 'Año', o.anio);
  c.append(dl);
  if (o.descripcion_corta) c.append(el('p', 'desc', o.descripcion_corta));

  if (ctx.modo === 'interno') {
    const d = el('details', 'interno-extra');
    d.open = true;
    d.append(el('summary', '', 'Datos internos'));
    const l = el('dl');
    const fila = (k, v) => v && (l.append(el('dt', '', k), el('dd', '', String(v))));
    fila('Id', o.id);
    fila('Club', o.nombre_club);
    fila('Cliente', o.cliente_interno);
    fila('Dirección', o.direccion_interna);
    fila('Publicar', o.publicar ? 'sí' : 'no');
    fila('Nombrable', o.nombrable ? 'sí' : 'no');
    fila('Servicio', o.servicio);
    fila('Coordenadas', `${o.origen_coord ?? ''} (${o.lat ?? '—'}, ${o.lng ?? '—'})`);
    fila('Fuente', o.fuente);
    fila('Revisar', o.revisar);
    fila('Nota del mapa', o.nota_mapa);
    d.append(l);
    c.append(d);
  }
  return c;
}

export function crearTarjeta(raiz, ctx) {
  const asa = el('div', 'asa');
  const cerrarBtn = el('button', 'cerrar', '×');
  cerrarBtn.type = 'button';
  cerrarBtn.setAttribute('aria-label', 'Cerrar');
  const scroll = el('div', 'tarjeta-scroll');
  raiz.append(asa, cerrarBtn, scroll);
  raiz.setAttribute('role', 'dialog');
  raiz.setAttribute('aria-labelledby', 'tarjeta-titulo');
  let alCerrar = () => {};
  let abierta = false;

  const cerrar = () => {
    if (!abierta) return;
    abierta = false;
    raiz.classList.remove('abierta');
    raiz.style.transform = '';
    raiz.setAttribute('aria-hidden', 'true');
    alCerrar();
  };
  cerrarBtn.addEventListener('click', cerrar);

  // Arrastrar el panel inferior hacia abajo para cerrarlo (celular)
  let y0 = null;
  asa.addEventListener('pointerdown', (e) => {
    y0 = e.clientY;
    asa.setPointerCapture(e.pointerId);
    raiz.style.transition = 'none';
  });
  asa.addEventListener('pointermove', (e) => {
    if (y0 !== null) raiz.style.transform = `translateY(${Math.max(0, e.clientY - y0)}px)`;
  });
  const soltar = (e) => {
    if (y0 === null) return;
    const dy = e.clientY - y0;
    y0 = null;
    raiz.style.transition = '';
    raiz.style.transform = '';
    if (dy > 90) cerrar();
  };
  asa.addEventListener('pointerup', soltar);
  asa.addEventListener('pointercancel', soltar);

  return {
    abrir(o) {
      scroll.replaceChildren(carrusel(o, ctx), cuerpo(o, ctx), cta(o, ctx));
      scroll.scrollTop = 0;
      raiz.removeAttribute('aria-hidden');
      raiz.classList.add('abierta');
      abierta = true;
      setTimeout(() => raiz.querySelector('#tarjeta-titulo')?.focus({ preventScroll: true }), 50);
    },
    cerrar,
    estaAbierta: () => abierta,
    alCerrar(fn) { alCerrar = fn; },
    altoPanel: () => raiz.getBoundingClientRect().height,
  };
}
