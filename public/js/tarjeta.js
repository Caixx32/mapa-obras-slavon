// Tarjeta de obra: escritorio = panel lateral; celular = panel inferior (arrastrable hacia abajo para cerrarlo).
import { partirNombre, deporteMeta, mensajeWhatsApp, urlWhatsApp, resolverRuta } from './logica.js';
import { colorDeporte } from './mapa.js';

const ICONO_WHATSAPP =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.4-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.07.15.2 2.1 3.2 5.08 4.49.7.3 1.26.49 1.7.63.72.23 1.36.2 1.87.12.57-.08 1.76-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35m-5.42 7.4h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88a9.82 9.82 0 0 1 6.99 2.9 9.82 9.82 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88m8.41-18.3A11.8 11.8 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.9 11.9 0 0 0 5.69 1.45h.01c6.55 0 11.89-5.34 11.89-11.9a11.8 11.8 0 0 0-3.48-8.41z"/></svg>';

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
  if (o.estado === 'en_obra') c.append(el('span', 'estado-obra', 'En obra'));
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
