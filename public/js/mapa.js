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
  // Para que el mapa no «atrape» el scroll de la página: la rueda baja la página hasta hacer clic en el mapa (zoom = rueda tras el clic) y, en celulares,
  // un dedo desplaza la página y se usan dos dedos para mover/acercar el mapa.
  const tactil = matchMedia('(hover: none) and (pointer: coarse)').matches;
  const map = L.map(contenedor, { zoomControl: false, attributionControl: false, minZoom: 3, maxZoom: 19, zoomSnap: 0.5, zoomDelta: 1, scrollWheelZoom: false, dragging: !tactil }).setView(ARGENTINA, 4.5);
  L.control.zoom({ position: 'topright', zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(map);
  L.control.attribution({ prefix: false, position: 'bottomleft' }).addAttribution(opciones.atribucion).addTo(map);
  const base = L.tileLayer(opciones.tiles, { subdomains: opciones.subdominios || 'abc', maxZoom: 19, maxNativeZoom: opciones.zoomNativoMaximo || 19, detectRetina: false }).addTo(map);
  if (opciones.filtro) map.getPane('tilePane').style.filter = opciones.filtro;   // solo el mapa de fondo, no los pines
  let tilesOk = 0;
  let tilesError = 0;
  base.on('tileload', () => { tilesOk++; });
  base.on('tileerror', () => { tilesError++; if (tilesError >= 6 && tilesOk === 0) opciones.alFallarMapaBase?.(); });

  const aviso = document.createElement('p');
  aviso.className = 'aviso-gestos';
  aviso.setAttribute('role', 'status');
  contenedor.parentElement.append(aviso);
  let ocultarAviso;
  const avisar = (texto) => {
    aviso.textContent = texto;
    aviso.classList.add('visible');
    clearTimeout(ocultarAviso);
    ocultarAviso = setTimeout(() => aviso.classList.remove('visible'), 1600);
  };
  if (tactil) {
    contenedor.addEventListener('touchmove', (e) => { if (e.touches.length === 1) avisar('Usá dos dedos para mover el mapa'); }, { passive: true });
  } else {
    // Rueda del mouse: baja la página hasta que se hace clic en el mapa; entonces hace zoom hasta que el mouse sale del mapa.
    let activo = false;
    let avisado = false;
    const activar = () => { if (!activo) { activo = true; map.scrollWheelZoom.enable(); } };
    const desactivar = () => { activo = false; avisado = false; map.scrollWheelZoom.disable(); };
    contenedor.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') activar(); });
    contenedor.addEventListener('mouseleave', desactivar);
    let acumulado = 0;
    contenedor.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {               // pellizco del trackpad (o Ctrl + rueda): zoom siempre
        e.preventDefault();
        acumulado += -e.deltaY / (e.deltaMode === 1 ? 4 : 80);
        if (Math.abs(acumulado) >= 0.5) {
          const paso = Math.sign(acumulado) * Math.min(1.5, Math.round(Math.abs(acumulado) * 2) / 2);
          acumulado = 0;
          map.setZoomAround(map.mouseEventToContainerPoint(e), map.getZoom() + paso);
        }
        return;
      }
      if (!activo && !avisado) {                  // sin activar: la página sigue su scroll normal
        avisado = true;
        avisar('Hacé clic en el mapa para acercar con la rueda del mouse');
      }
    }, { passive: false });
  }

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
