// Mapa (Leaflet + markercluster, cargados como scripts globales `L`).
import { tieneUbicacion, deporteMeta } from './logica.js';

const ARGENTINA = [-38.4, -63.6];

export function colorDeporte(id) {
  return getComputedStyle(document.documentElement).getPropertyValue(`--dep-${id}`).trim() || '#3F474D';
}

function iconoPin(o) {
  return L.divIcon({
    className: `slv-pin${o.estado === 'en_obra' ? ' en-obra' : ''}`,
    html: `<span class="p" style="--c:${colorDeporte(o.deporte)}"></span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function iconoCluster(cluster) {
  const n = cluster.getChildCount();
  const [clase, px] = n >= 100 ? ['g', 58] : n >= 10 ? ['m', 46] : ['', 38];
  return L.divIcon({ html: `<div>${n}</div>`, className: `slv-cluster ${clase}`, iconSize: [px, px] });
}

/** @param opciones { tiles, atribucion, alSeleccionar(obra), alDeseleccionar() } */
export function crearMapa(contenedor, opciones) {
  const map = L.map(contenedor, { zoomControl: false, attributionControl: false, minZoom: 3, maxZoom: 18, zoomSnap: 0.5, zoomDelta: 1 }).setView(ARGENTINA, 4.5);
  L.control.zoom({ position: 'topright', zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(map);
  L.control.attribution({ prefix: false, position: 'bottomright' }).addAttribution(opciones.atribucion).addTo(map);
  L.tileLayer(opciones.tiles, { subdomains: 'abcd', maxZoom: 20, maxNativeZoom: 20, detectRetina: false }).addTo(map);

  const grupo = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 46, spiderfyOnMaxZoom: true, chunkedLoading: true, iconCreateFunction: iconoCluster }).addTo(map);
  const marcadores = new Map(); // id → marker
  let seleccionado = null;

  function marcador(o) {
    if (!marcadores.has(o.id)) {
      const m = L.marker([o.lat, o.lng], { icon: iconoPin(o), keyboard: true, title: (o.nombre_mostrado ?? o.nombre_club) || '', riseOnHover: true });
      m.on('click', () => opciones.alSeleccionar(o));
      marcadores.set(o.id, m);
    }
    return marcadores.get(o.id);
  }

  map.on('click', () => opciones.alDeseleccionar());

  const api = {
    map,
    /** Muestra solo estas obras (las que tienen ubicación) y devuelve cuántas quedaron. */
    mostrar(obras) {
      const visibles = obras.filter(tieneUbicacion);
      grupo.clearLayers();
      grupo.addLayers(visibles.map(marcador));
      return visibles.length;
    },
    ajustar(obras) {
      const pts = obras.filter(tieneUbicacion).map((o) => [o.lat, o.lng]);
      if (!pts.length) return;
      if (pts.length === 1) return map.setView(pts[0], 12);
      map.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 11, animate: true });
    },
    marcar(id) {
      api.desmarcar();
      const m = marcadores.get(id);
      if (m?._icon) m._icon.classList.add('sel');
      seleccionado = id;
    },
    desmarcar() {
      if (seleccionado) marcadores.get(seleccionado)?._icon?.classList.remove('sel');
      seleccionado = null;
    },
    /** Asegura que el pin sea visible (sale del cluster) y lo centra, dejando lugar para el panel inferior en celular. */
    mostrarObra(o, { desplazarY = 0 } = {}) {
      const m = marcador(o);
      const listo = () => {
        api.marcar(o.id);
        const p = map.project([o.lat, o.lng], map.getZoom());
        p.y += desplazarY;
        map.panTo(map.unproject(p, map.getZoom()), { animate: true });
      };
      if (!grupo.hasLayer(m)) grupo.addLayer(m);
      grupo.zoomToShowLayer(m, listo);
    },
    reDibujarSeleccion(id) {
      if (id) marcadores.get(id)?._icon?.classList.add('sel');
    },
    invalidar() {
      map.invalidateSize();
    },
  };
  grupo.on('animationend spiderfied', () => api.reDibujarSeleccion(seleccionado));
  return api;
}

export { deporteMeta };
