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
public/                   ← lo ÚNICO que se publica en la web
  data/obras-publicas.json
  fotos/<id>/…webp        ← fotos optimizadas
scripts/                  ← build-data y sus módulos
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

Para agregar una obra: fila nueva al final con un `id` nuevo (el siguiente número libre). **Los `id` no se cambian ni se reutilizan**:
las carpetas de fotos se nombran con ese número.

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

## Tests

```bash
npm test
```

Cubren la privacidad de la versión pública, la limpieza de fotos (incluida la eliminación del GPS), las coordenadas
y la lectura de la planilla.

## Notas técnicas

- `npm audit` informa avisos moderados en dependencias internas de `exceljs` (minimatch y uuid). No aplican acá:
  el script solo corre en tu computadora sobre tus propios archivos. Forzar el «arreglo» obligaría a instalar una versión vieja de `exceljs`.
