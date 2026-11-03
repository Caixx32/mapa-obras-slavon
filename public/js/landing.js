// Secciones de la landing pública: titular, contadores, obras destacadas, cierre y botones de WhatsApp / Instagram.
// Todo el texto sale de config.json; los números, de los datos.
import { textoPaises, formatoNumero, tieneUbicacion, partirNombre, deporteMeta, urlWhatsApp, resolverRuta } from './logica.js';
import { ICONO_WHATSAPP, ICONO_INSTAGRAM } from './iconos.js';
import { colorDeporte } from './mapa.js';

const $ = (id) => document.getElementById(id);
function el(tag, clase, texto) {
  const e = document.createElement(tag);
  if (clase) e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

/** El número del titular va en rojo, sin usar innerHTML. */
export function renderTitular(h1, plantilla, meta) {
  const paises = textoPaises(meta.paises);
  const nodos = plantilla.split(/(\{N\})/).map((parte) =>
    parte === '{N}' ? Object.assign(el('span', 'num'), { textContent: formatoNumero(meta.titular_n) }) : document.createTextNode(parte.replaceAll('{paises}', paises)),
  );
  h1.replaceChildren(...nodos);
}

function animarContadores(cont) {
  const cifras = [...cont.querySelectorAll('.cifra')];
  const final = () => cifras.forEach((c) => { c.textContent = formatoNumero(Number(c.dataset.valor)); });
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return final();
  let corrio = false;
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting || corrio) return;
    corrio = true;
    io.disconnect();
    const t0 = performance.now();
    const duracion = 1500;
    const paso = (t) => {
      const k = Math.min(1, (t - t0) / duracion);
      const suave = 1 - Math.pow(1 - k, 3);
      cifras.forEach((c) => { c.textContent = formatoNumero(Math.round(Number(c.dataset.valor) * suave)); });
      if (k < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }, { threshold: 0.4 });
  io.observe(cont);
  setTimeout(() => { if (!corrio) { corrio = true; final(); } }, 6000); // por si el navegador nunca avisa la visibilidad
}

function contadores(config, meta) {
  const cont = $('contadores');
  if (!cont) return;
  const textos = config.contadores ?? {};
  const items = [
    ['total', meta.total_canchas, 'canchas construidas'],
    ['padel', meta.canchas_padel, 'canchas de pádel'],
    ['cesped', meta.canchas_cesped, 'canchas de césped'],
    ['provincias', meta.provincias, 'provincias alcanzadas'],
  ];
  if (meta.obras_en_obra > 0) items.push(['en_marcha', meta.obras_en_obra, 'obras en marcha']);
  cont.replaceChildren(...items.map(([clave, valor, porDefecto]) => {
    const d = el('div', 'contador');
    const cifra = el('p', 'cifra', '0');
    cifra.dataset.valor = String(valor);
    d.append(cifra, el('p', 'rotulo', textos[clave] ?? porDefecto));
    return d;
  }));
  animarContadores(cont);
  const nota = $('contadores-nota');
  if (nota) nota.textContent = textos.nota ?? 'Las cifras cuentan canchas. En el mapa cada punto es una obra, y una obra puede tener varias canchas.';
}

function tarjetaDestacada(o, config, verEnMapa) {
  const meta = deporteMeta(o.deporte);
  const { titulo, lugar } = partirNombre(o);
  const art = el('article', 'destacada');
  const foto = el('div', 'destacada-foto');
  const img = new Image();
  img.alt = `Cancha de ${meta.etiqueta.toLowerCase()} en ${o.ciudad || o.provincia || 'Argentina'}`;
  img.loading = 'lazy';
  img.decoding = 'async';
  const f = o.fotos?.[0];
  if (f) {
    img.src = resolverRuta(f.src, '');
    if (f.thumb) {
      img.srcset = `${resolverRuta(f.thumb, '')} 400w, ${resolverRuta(f.src, '')} 1600w`;
      img.sizes = '(min-width: 1000px) 372px, (min-width: 620px) 50vw, 100vw';
    }
  } else {
    img.src = `img/generico-${o.deporte}.svg`;
  }
  foto.append(img);
  const cuerpo = el('div', 'destacada-cuerpo');
  const tag = el('p', 'tag', meta.etiqueta);
  tag.append(Object.assign(el('span', 'punto'), { style: `--c:${colorDeporte(o.deporte)}` }));
  const datos = [o.anio, o.cantidad_canchas > 1 ? `${o.cantidad_canchas} canchas` : '1 cancha'].filter(Boolean).join(' · ');
  cuerpo.append(tag, el('h3', '', titulo), el('p', 'lugar', lugar), el('p', 'datos-mini', datos));
  if (tieneUbicacion(o)) {
    const b = el('button', 'enlace-mapa', config.destacadas?.boton ?? 'Ver en el mapa');
    b.type = 'button';
    b.append(Object.assign(el('span'), { textContent: ' →', ariaHidden: 'true' }));
    b.addEventListener('click', () => verEnMapa(o));
    cuerpo.append(b);
  }
  art.append(foto, cuerpo);
  return art;
}

function destacadas(config, obras, verEnMapa) {
  const sec = $('destacadas');
  if (!sec) return;
  // Orden: primero los ids que figuran en config.json → destacadas.orden (en ese orden); después el resto, por año (más nuevas primero).
  const orden = (config.destacadas?.orden ?? []).map(String);
  const lugar = (o) => { const i = orden.indexOf(o.id); return i === -1 ? orden.length : i; };
  const lista = obras.filter((o) => o.destacada).sort((a, b) => lugar(a) - lugar(b) || (b.anio ?? 0) - (a.anio ?? 0) || a.id.localeCompare(b.id));
  if (!lista.length) { sec.hidden = true; return; }   // sin obras marcadas como destacadas, la sección no se muestra
  const c = config.destacadas ?? {};
  if (c.etiqueta) $('destacadas-etiqueta').textContent = c.etiqueta;
  if (c.titulo) $('destacadas-titulo').textContent = c.titulo;
  $('grilla-destacadas').replaceChildren(...lista.map((o) => tarjetaDestacada(o, config, verEnMapa)));
  sec.hidden = false;
}

function cierre(config) {
  const c = config.cierre ?? {};
  if (c.etiqueta) $('cierre-etiqueta').textContent = c.etiqueta;
  if (c.titulo) $('cierre-titulo').textContent = c.titulo;
  if (c.boton) $('cierre-wa-texto').textContent = c.boton;
  const lista = $('pilares');
  if (lista && config.pilares?.length) {
    lista.replaceChildren(...config.pilares.map((p) => {
      const li = el('li', 'pilar');
      li.append(el('strong', '', p.titulo), el('span', '', p.texto));
      return li;
    }));
  }
}

function enlaces(config) {
  const wa = urlWhatsApp(config.whatsapp, config.mensajes?.whatsapp_general ?? 'Hola SLAVON, vi el mapa de obras y quiero consultar por una cancha.');
  document.querySelectorAll('[data-wa]').forEach((a) => {
    a.href = wa;
    a.target = '_blank';
    a.rel = 'noopener';
    if (a.dataset.waIcono !== undefined && !a.querySelector('svg')) a.insertAdjacentHTML('afterbegin', ICONO_WHATSAPP);
  });
  document.querySelectorAll('[data-instagram]').forEach((a) => {
    if (!config.instagram) { a.hidden = true; return; }
    a.href = config.instagram;
    a.target = '_blank';
    a.rel = 'noopener';
    if (!a.querySelector('svg')) a.insertAdjacentHTML('afterbegin', ICONO_INSTAGRAM);
  });
  document.querySelectorAll('[data-web]').forEach((a) => {
    if (!config.web) { a.hidden = true; return; }
    a.href = config.web;
    a.textContent = config.web.replace(/^https?:\/\//, '').replace(/\/$/, '');
  });
  const anio = $('anio');
  if (anio) anio.textContent = String(new Date().getFullYear());
}

export function iniciarLanding({ config, datos, verEnMapa }) {
  if (!$('hero')) return; // la versión interna no tiene estas secciones
  const h = config.hero ?? {};
  if (h.titular) renderTitular($('hero-titular'), h.titular, datos.meta);
  if (h.bajada) $('hero-bajada').textContent = h.bajada;
  if (h.etiqueta) $('hero-etiqueta').textContent = h.etiqueta;
  if (h.boton) $('hero-wa-texto').textContent = h.boton;
  if (h.boton_mapa) $('hero-mapa').textContent = h.boton_mapa;
  contadores(config, datos.meta);
  destacadas(config, datos.obras, verEnMapa);
  cierre(config);
  enlaces(config);
}
