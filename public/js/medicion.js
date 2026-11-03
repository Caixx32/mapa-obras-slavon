// Medición opcional (Google Analytics 4 y/o Meta Pixel). Solo se activa si en config.json se cargan "ga4_id" y/o "meta_pixel_id";
// con los dos vacíos no se carga ningún script externo ni se envía nada.
// Nunca se envían nombres de clubes, coordenadas ni datos personales: solo deporte, provincia y el tipo de acción.
const RE_GA4 = /^G-[A-Z0-9]{4,}$/;
const RE_PIXEL = /^\d{8,20}$/;

function cargarScript(doc, src) {
  const s = doc.createElement('script');
  s.async = true;
  s.src = src;
  doc.head.append(s);
}

export function crearMedicion(win) {
  const activo = { ga4: false, meta: false };
  return {
    activo,
    iniciar(config = {}) {
      const ga = String(config.ga4_id ?? '').trim();
      const px = String(config.meta_pixel_id ?? '').trim();
      if (RE_GA4.test(ga)) {
        win.dataLayer = win.dataLayer || [];
        win.gtag = function gtag() { win.dataLayer.push(arguments); };
        win.gtag('js', new Date());
        win.gtag('config', ga, { anonymize_ip: true });
        cargarScript(win.document, `https://www.googletagmanager.com/gtag/js?id=${ga}`);
        activo.ga4 = true;
      }
      if (RE_PIXEL.test(px)) {
        if (!win.fbq) {
          const n = (win.fbq = function fbq() { (n.callMethod ? n.callMethod : (...a) => n.queue.push(a)).apply(n, arguments); });
          if (!win._fbq) win._fbq = n;
          n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
          cargarScript(win.document, 'https://connect.facebook.net/en_US/fbevents.js');
        }
        win.fbq('init', px);
        win.fbq('track', 'PageView');
        activo.meta = true;
      }
    },
    /** click_whatsapp, filtro_usado, compartir, cerca_tuyo. No hace nada si no hay medición activa. */
    registrar(nombre, params = {}) {
      if (activo.ga4 && win.gtag) win.gtag('event', nombre, params);
      if (activo.meta && win.fbq) win.fbq('trackCustom', nombre, params);
    },
  };
}

export const medicion = typeof window === 'undefined' ? crearMedicion({}) : crearMedicion(window);
