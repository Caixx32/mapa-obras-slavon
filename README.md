# Mapa de obras SLAVON

Landing con un mapa interactivo de las canchas construidas por **SLAVON Ingeniería Deportiva**
(pádel, fútbol, hockey, tenis y residencial). Es una herramienta de venta: termina en una consulta por WhatsApp.

> ⚠️ **Este repositorio es PÚBLICO.** Los datos de clientes (nombres, direcciones, ubicaciones exactas),
> la planilla maestra y las fotos privadas **nunca** se suben: están en `.gitignore` y viven solo en tu computadora.
> Lo único que se publica es `public/` (la web, los datos ya depurados y las fotos ya optimizadas).

## Cómo está organizado

```
obras-maestra.xlsx        ← LA fuente de datos (solo en tu compu, no se sube)
fotos/                    ← fotos originales, una carpeta por obra (solo en tu compu, no se sube)
fotos-pendientes.xlsx     ← obras que todavía no tienen foto (lo genera build-data, no se sube)
reportes/                 ← avisos y coordenadas aproximadas para revisar (no se sube)
data/                     ← versión interna (JSON con nombres reales y fotos privadas) (no se sube)
interno/index.html        ← la página de la versión interna (solo el código; los datos están en data/)
public/                   ← lo ÚNICO que se publica en la web
  index.html, css/, js/   ← la landing (colores y tipografía en css/tokens.css)
  site.webmanifest        ← nombre e íconos al guardar la página en el celular
  config.json             ← WhatsApp, Instagram, textos y colores (se edita sin tocar código)
  data/obras-publicas.json
  fotos/<id>/…webp        ← fotos optimizadas
  img/, fonts/, vendor/   ← logos, imágenes genéricas, Montserrat y librerías del mapa (todo local)
scripts/                  ← build-data, servidor local y tests
```

## Requisitos

- [Node.js](https://nodejs.org) 18 o superior.
- La primera vez: `npm install`.
- Copiá `obras-maestra.xlsx` a la carpeta del proyecto (te la pasa el equipo; no está en GitHub).

## Actualizar los datos (2 pasos)

1. Editá `obras-maestra.xlsx` (hoja **OBRAS**) y guardala.
2. Corré:

   ```bash
   npm run build-data
   ```

Eso regenera `public/data/obras-publicas.json` y `data/obras-internas.json`, optimiza las fotos nuevas,
y actualiza `fotos-pendientes.xlsx`. Se puede correr todas las veces que quieras: es seguro y rápido.
Si no tenés internet: `npm run build-data:sin-red`.

Al terminar muestra un resumen (obras, canchas, provincias, el titular «Más de N canchas…») y avisos.
Si algo de la planilla está mal, **no genera nada** y te dice qué fila corregir.

### Columnas de la planilla

La hoja `LEEME` de la propia planilla explica cada columna. Las que completás vos:

| Columna | Qué poner |
|---|---|
| `nombrable` | `si` / `no`. Con `no` (el valor por defecto) la web muestra «Complejo de [deporte] – [ciudad], [provincia]», sin el nombre del club y con la ubicación redondeada a ~1 km. |
| `destacada` | `si` / `no`. Las `si` aparecen en la grilla de obras destacadas. |
| `publicar` | `si` / `no`. Con `no` la obra no aparece en la web ni en los contadores. |
| `deporte` | `padel` (cancha completa) · `cesped_padel` (solo el césped) · `futbol` · `hockey` · `tenis` · `residencial` · `otro` |
| `video_url` | Opcional. Tiene que empezar con `https://`. |

### Agregar una obra nueva

Fila nueva al final de la hoja **OBRAS**, con un `id` nuevo (el siguiente número libre: si la última es la 1236, la nueva es la 1237).
**Los `id` no se cambian ni se reutilizan**: las carpetas de fotos se nombran con ese número.

Lo mínimo para que aparezca: `id`, `deporte`, `provincia` y `ciudad`. El resto es opcional y mejora la tarjeta:
`cantidad_canchas` (si queda vacío cuenta 1), `anio`, `estado` (`terminada` / `en_obra`), `tipo` (ej. «Cancha completa modelo Panoramic»),
`descripcion_corta` y `nombre_club`. Las coordenadas (`lat` y `lng`) también son opcionales: si faltan, `build-data` ubica la obra por
ciudad + provincia (queda marcada `aprox` en `reportes/coordenadas-aprox.xlsx`); si querés el punto exacto, copiá la latitud y longitud.

### Mostrar el nombre del club

Por defecto todas las obras se ven como «Complejo de fútbol – Ciudad, Provincia». Para mostrar el nombre real de un club:
completá `nombre_club` y poné `nombrable = si` (con el permiso del cliente). Con `nombrable = si` también se muestra la ubicación exacta.
En Excel conviene filtrar la columna `falta_nombre_club = no` para ver cuáles ya tienen nombre cargado.

## Cargar fotos

1. Corré `npm run build-data` una vez: crea `fotos/` con **una carpeta por obra**, por ejemplo `fotos/0023-club-los-pinos-cordoba/`.
2. Arrastrá las fotos ahí (JPG, PNG o WebP, de cualquier tamaño). Lo que importa es que la carpeta **empiece con el id** de la obra; el resto del nombre es libre.
3. Corré `npm run build-data` otra vez.

Qué hace con cada foto:

- La achica a un máximo de **1600 px de ancho** y genera una **miniatura de 400 px**, en WebP.
- **Borra todos los metadatos**, incluida la ubicación GPS que guardan los celulares.
- Le pone un nombre nuevo (no se filtra el nombre original del archivo).
- La primera foto en orden alfabético es la portada (`01.jpg`, `02.jpg`, …).
- Si el nombre del archivo contiene **`_privada`** (ej. `03_privada.jpg`), la foto va **solo a la versión interna**.
- Las obras con `publicar = no` también quedan solo en la versión interna.
- Si más adelante agregás `_privada` al nombre de una foto ya publicada, **desaparece de la versión pública** al volver a correr.
- Las obras sin foto se muestran igual, con una imagen genérica por deporte.
- `fotos-pendientes.xlsx` lista las obras sin foto, con las destacadas primero.
- Si corrés en otra computadora que no tiene las fotos originales, **no se borra lo ya publicado**.

Formatos no soportados: HEIC (exportá como JPG). Videos: usá la columna `video_url`.

## Coordenadas

Orden de prioridad: **1)** `lat`/`lng` de la planilla maestra → **2)** punto del KML con el mismo nombre
(si dejás `Canchas_SLAVON.kml` en la carpeta; opcional) → **3)** búsqueda por *ciudad + provincia* en
[Nominatim](https://nominatim.org) (OpenStreetMap, 1 pedido por segundo, con caché). Lo calculado así se marca `aprox`
y queda listado en `reportes/coordenadas-aprox.xlsx` para que lo revises. Las obras que no se pueden ubicar
no aparecen en el mapa (sí en los contadores) y quedan en la misma planilla.

**No se usa ningún servicio de Google.** A Nominatim solo se le envía «ciudad, provincia, país»: nunca calles ni nombres de clientes.

## Qué garantiza la versión pública

`build-data` arma `public/data/obras-publicas.json` con una **lista blanca** de campos (nada de `fuente`, clientes,
direcciones, notas ni precios), con nombres genéricos y coordenadas redondeadas para las obras no nombrables, y **sin fotos `_privada`**.
Antes de escribir nada revisa que no se haya colado un nombre de cliente o de club no nombrable, una dirección, un mail,
un teléfono o un link en los textos; si encuentra algo, **frena y no genera la versión pública**.

## Ver la web en tu computadora

```bash
npm run servir
```

Abre `http://localhost:8080` con **exactamente lo que se publica** (solo la carpeta `public/`).

## Versión interna (para mostrar en reuniones)

```bash
npm run interno
```

Abre `http://localhost:8080/interno/`: el mismo mapa pero con **nombres reales, ubicaciones exactas y todas las fotos** (también las `_privada`),
un buscador (club, cliente, ciudad…) y los datos internos de cada obra. Solo escucha en tu computadora y **no se publica**
(la planilla, los reportes y el resto del proyecto no son accesibles desde ahí). Hay que haber corrido antes `npm run build-data`.

## Colores, textos, WhatsApp e Instagram

- **Colores y tipografía:** todos en un solo lugar, `public/css/tokens.css` (`--color-primario`, `--color-carbon`, un color por deporte, etc.).
  Para reemplazarlos por los del manual de marca se cambia ahí, o en la sección `colores` de `public/config.json`.
- **Todo el texto de la página, el número de WhatsApp y el Instagram:** `public/config.json` (titular, bajada, botones, rótulos de los contadores,
  los 4 pilares, mensajes de WhatsApp). El número va con código de país, solo dígitos (ejemplo: `5491155551234`).
  En el titular, `{N}` es el número calculado de los datos y `{paises}` los países con obras. Dejando el Instagram vacío, el botón se oculta.
- **Tipografía:** Montserrat se sirve desde el propio sitio (`public/fonts/`), no desde Google Fonts.
- **Logos:** `public/img/` tiene los trazos originales del PDF de logos (el nombre «SLAVON» en versión para fondo claro y para fondo oscuro, e isotipo).
  Se usó el nombre sin la bajada «High Sport Performance», que el manual indica no usar.

Después de editar, volvé a publicar. No hace falta correr `build-data`.

## Qué números se muestran

Los contadores y el titular salen de los datos (`build-data` los calcula): solo cuentan obras **terminadas** y con `publicar = si`.
«Canchas de pádel» suma `padel` + `cesped_padel`; «canchas de césped» es todo lo demás. El «Más de N» del titular redondea hacia
abajo de a 50, para que nunca supere el total real. Si hay obras en Uruguay, el titular dice «Argentina y Uruguay» solo.

## Obras destacadas

Marcá `destacada = si` en la planilla y corré `build-data`: esas obras aparecen en una grilla con foto grande y un botón «Ver en el mapa».
Si no hay ninguna marcada, la sección no se muestra. Conviene que tengan foto (si no, se ve la imagen genérica del deporte).

## Al compartir el link (WhatsApp, redes)

Las etiquetas Open Graph de `public/index.html` y la imagen `public/img/og.png` hacen que el link se vea con título, descripción e imagen.
La imagen se arma desde `scripts/og/og.html` (abrirla en el navegador a 1200×630 y sacar una captura). Las URLs de `og:url`, `og:image` y
`canonical` apuntan a `https://caixx32.github.io/mapa-obras-slavon/`: si el sitio termina en otra dirección (por ejemplo un dominio propio), hay que cambiarlas ahí.

## Mapa de fondo

Se usa el mapa de **OpenStreetMap** (gratis, sin clave ni registro), a todo color. Si algún día se lo quiere más suave o en gris, se agrega un filtro en `mapa.filtro` de `public/config.json`
(por ejemplo `grayscale(1) contrast(0.9) brightness(1.08)`).
Los créditos «© OpenStreetMap contributors» tienen que quedar visibles en el mapa (ya lo están).
El servidor de mapas de OpenStreetMap es para uso razonable ([política de uso](https://operations.osmfoundation.org/policies/tiles/)) y no tiene garantía de servicio:
para una web con mucho tráfico conviene un proveedor con plan propio (CARTO, MapTiler, Stadia, etc.). Para cambiarlo alcanza con editar `tiles`, `atribucion` y `filtro`
en la sección `mapa` de `config.json`; no hay que tocar código. (CARTO dejó de servir su mapa sin clave de API, por eso no se usa por defecto.)
Si el mapa de fondo no carga, aparece un aviso y las obras se siguen viendo.

**Zoom con la rueda:** para que el mapa no «atrape» el scroll de la página, la rueda baja la página hasta que se hace clic en el mapa; desde ahí hace zoom hasta que el mouse sale del mapa.
En el celular, un dedo desplaza la página y dos dedos mueven/acercan el mapa. Los botones +/−, el doble clic y el pellizco del trackpad funcionan siempre.

## Librerías del mapa

Leaflet, Leaflet.markercluster y Montserrat están copiadas en `public/vendor/` y `public/fonts/` (no se usan CDNs).
Si algún día se actualizan: `npm install` y `npm run vendor`.

## Publicar

La web se publica en **GitHub Pages** desde la carpeta `public/` (nada más). El flujo está en `.github/workflows/pages.yml`: cada vez que se une
algo a `main`, se publica solo. Antes de publicar revisa que no haya dentro de `public/` planillas, KML, fotos `_privada` ni datos internos; si los hay, frena.

**La primera vez** hay que activar Pages en GitHub (un clic): *Settings → Pages → Build and deployment → Source: GitHub Actions*.

Para actualizar el sitio: `npm run build-data`, subir los cambios de `public/` y unirlos a `main`.

**Modo borrador:** mientras `public/index.html` tenga la línea `<meta name="robots" content="noindex, nofollow">` y exista `public/robots.txt`, los buscadores
(Google) no muestran la página; el link funciona igual para quien lo tenga. Para la versión oficial, borrar esa línea y ese archivo.

**Dirección propia** (por ejemplo `mapa.slavon.com.ar`): quien maneja el dominio crea un registro CNAME del subdominio hacia `caixx32.github.io`;
después se escribe la dirección en *Settings → Pages → Custom domain* y se activa *Enforce HTTPS*. Hay que actualizar `og:url`, `og:image` y `canonical` en `public/index.html`.

## Tests

```bash
npm test
```

Cubren la privacidad de la versión pública, la limpieza de fotos (incluida la eliminación del GPS), las coordenadas
y la lectura de la planilla.

## Notas técnicas

- `npm audit` informa avisos moderados en dependencias internas de `exceljs` (minimatch y uuid). No aplican acá:
  el script solo corre en tu computadora sobre tus propios archivos. Forzar el «arreglo» obligaría a instalar una versión vieja de `exceljs`.
