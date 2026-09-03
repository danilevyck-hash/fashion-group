---
name: traer-reporte-switch
description: Hay que bajar un reporte del panel web de Switch Soft que el sistema no tiene (cobros contra factura, renglones de una empresa, inventario a fecha, ingresos varios…), o consultar algo al momento en una de las 8 empresas sin esperar al cron. Libreto probado el 2-sep-2026 con ACS (Ventas Artículos, mes por mes, cuadrado contra switch_facturas). Usar cuando Daniel pide «tráete tal reporte», «¿qué dice Switch ahora mismo en X?», o cuando un dato que necesitas no está en ninguna tabla de «Dónde vive cada dato».
---

# Traer un reporte del panel de Switch

Switch tiene un API JSON (lo que usan los crons) y un **panel web** Laravel con decenas de reportes que el API no expone. Cuando el dato no está en la base, se baja del panel. Es **scraping con sesión**, y la sesión tiene un precio: **expulsa a quien esté adentro**. Este es el libreto para hacerlo sin romper nada.

**Regla de oro:** avisar antes de entrar, una empresa a la vez, por meses, cuadrar contra `switch_facturas`, guardar en disco. **Nada entra a la base sin que Daniel lo apruebe.**

---

## Paso 0 — ¿De verdad hay que ir al panel?

Primero `CLAUDE.md` → **«Dónde vive cada dato»**. Si la tabla existe, se lee de ahí (paginando: `db-max-rows` = 1000 corta en silencio). Ir al panel solo cuando:
- el dato **no** está en ninguna tabla (p. ej. cobros contra factura, renglones de Boston/ACS que `switch_factura_lineas` no cubre), o
- hace falta el **dato del momento** de una empresa, sin esperar la próxima pasada del cron.

Para «¿está vivo Switch?» **no** hace falta sesión: `GET /validar` del API no consume el cupo (`docs/switch-referencia.md`, §5.3).

---

## Paso 1 — Las 8 URLs y credenciales están en `.env.local`

Un namespace por empresa (`SWITCH_EMPRESA_ENV_MAP`, `src/lib/switch-api/empresas.ts`):

| `empresa_key` | prefijo env |
|---|---|
| vistana | `SWITCH_VISTANA_INTERNATIONAL_` |
| fashion_wear | `SWITCH_FASHION_WEAR_` |
| fashion_shoes | `SWITCH_FASHION_SHOES_` |
| active_shoes | `SWITCH_ACTIVE_SHOES_` |
| active_wear | `SWITCH_ACTIVE_WEAR_` |
| joystep | `SWITCH_JOYSTEP_` |
| confecciones_boston | `SWITCH_CONFECCIONES_BOSTON_` |
| american_classic (Multifashion) | `SWITCH_MULTIFASHION_` |

Variables: `<prefijo>API_URL` (la web usa el MISMO host), `<prefijo>WEB_USER`, `<prefijo>WEB_PASSWORD`. Al 3-sep-2026 el `.env.local` trae las 8 URLs y las 8 credenciales web (login verificado en las 8 el 2-sep); las credenciales del API JSON (`<prefijo>API_USER`/`API_PASSWORD`) viven en Vercel. Si falta `.env.local`: `npx vercel env pull .env.local`. **Nunca imprimir el valor de una credencial en un log ni en un reporte.**

---

## Paso 2 — Usar `loginSwitchWeb` y cerrar en el `finally`

Todo por `src/lib/switch-api/web-client.ts`, el mismo código que los crons. **No reescribir el login**: es inestable (a veces falla a mitad) y ya trae reintentos.

```ts
import { loginSwitchWeb, cerrarSesionWeb, type WebSession } from "../src/lib/switch-api/web-client";

const s = await loginSwitchWeb("american_classic");   // ⚠️ TOMA la sesión del panel
try {
  // … bajar …
} finally {
  await cerrarSesionWeb(s);   // best-effort, nunca lanza — pero SIEMPRE va
}
```

Después del login, cada reporte pide su propio `_token` (CSRF): `GET` a la página del reporte y sacarlo del HTML (`extraerToken` en `scripts/_bajar-acs-ventasarticulos.ts`). Los reportes DataTables responden a un `POST` con `start`/`length`/`draw` y devuelven `{ recordsTotal, data[] }`.

🔴 **El HTML de excepción de Switch llega con HTTP 200.** El status no alcanza: revisar el cuerpo con `esError()` (`Exception - SWITCH SOFT | Whoops | Controller method not found`).

---

## Paso 3 — ⚠️ Avisar: abrir sesión EXPULSA a quien esté en el panel

El login web manda `changesession="SI"` (`web-client.ts:178`); con `"NO"` no autentica si ya hay sesión. Es decir: **entrar saca a Daniel (o a la contadora) de esa empresa en ese momento.**

Antes de correr nada, decir **empresa + ventana horaria** y esperar el visto bueno. Y **esquivar los crons de esa empresa**: Switch admite una sesión, así que un cron que entra mientras el script corre tumba al script (o el script tumba al cron). Separación mínima **≥ 15 min** (`SEPARACION_MINIMA_MIN`, `src/lib/cron-telemetry.ts`) — y aquí la tiene que cumplir una persona, no hay cron que la haga cumplir.

```bash
# qué crons tocan esa empresa y a qué hora (UTC)
grep -n "american_classic\|CRON_EMPRESAS_TODAS\|CRON_EMPRESAS_VENTAS" src/lib/cron-telemetry.ts | grep hhmmUtc
grep -B1 -A1 '"schedule"' vercel.json | grep -A1 "switch-sync\|acs-\|boston-cartera\|sync-"
```

Ventanas que ya se usaron: **05:00–06:10 UTC** (00:00–01:10 Panamá) para ACS. Panamá es **UTC−5 fijo**: convertir antes de proponer una hora.

---

## Paso 4 — Bajar POR MESES, nunca de un golpe

Un rango grande devuelve un `recordsTotal` que el servidor a veces no cumple, y la sesión se puede caer a mitad. Plantilla: `scripts/_bajar-acs-ventasarticulos.ts`.

```bash
SWITCH_MULTIFASHION_API_URL=https://americanclassicstore.switch-soft.com \
MESES=2026-07,2026-08 OUT=/tmp/acs/datos \
DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_bajar-acs-ventasarticulos.ts
```

Por cada mes:
1. **Sonda** con `length=1` → `recordsTotal` (cuántas filas dice el servidor).
2. Paginar con `length ≤ 2000` (el chunk que usa el propio panel al exportar; no pedir más de lo que él pide).
3. **Contar lo que llegó** y compararlo con `recordsTotal`. `leidas !== total` = 🔴 «NO CUADRA», y se dice en el resumen — nunca se da por completo.
4. Orden estable (`order[0][column]` = secuencial) para que las páginas no se pisen.

---

## Paso 5 — Cuadrar contra `switch_facturas` para cazar el corte silencioso

`recordsTotal` es lo que dice Switch; **la verdad de control es la base.** Para ese mes y esa empresa: documentos distintos y suma neta en el archivo bajado vs `switch_facturas` (`empresa_key`, `fecha >= … AND fecha < …`, NC restan, `subtotal_descuento`). Tienen que dar el mismo número de documentos; si el archivo tiene menos, **se cortó** aunque nadie haya dado error.

🩸 Precedente: **Calvin, 12-ago-2026** (`d7395294`) — el catálogo chocó el tope de 80 páginas, entró con 4 productos de ~80 y se anotó `success`. Llegar al tope sin ver la página corta ahora es error. La misma trampa aplica al panel: un reporte a medias sin cuadre es un reporte que miente con cara de completo.

---

## Paso 6 — Guardar en archivo local. NUNCA en la base sin aprobación

Salida a `/tmp/<empresa>/…` en JSONL (una línea por renglón) + `_resumen.json` con `{ mes, total, leidas, documentos, ok }`. De ahí se analiza con scripts de solo lectura (`/tmp/acs/analizar.mjs`, `q.mjs` son ejemplos del 2-sep).

Escribir a Supabase es **otro encargo**: requiere que Daniel defina tabla, grano y qué pasa con lo que ya existe (mapear → definir juntos → ejecutar). Los 4 reportes «que valdría la pena traer» (cobros contra factura · renglones de Multifashion · ingresos varios · inventario a fecha) siguen en `docs/estado-actual.md` como pendientes sin urgencia.

---

## Reportes del panel que ya se conocen (rutas reales, menú de ACS del 2-sep-2026)

Lo que el sistema **ya baja** (código en `web-client.ts`):

| Reporte | Ruta | Qué trae | Lo usa |
|---|---|---|---|
| Listado de comprobantes | `GET /reportesventa/comprobantes` (token) + `POST /reportesventa/facturas` | Costo y utilidad **por documento** — la única fuente | `sync-utilidad` |
| Estado de cuenta cliente (cartera) | `GET /estadodecuenta` + `POST /reportesmanager/crearreporteconsola` → `GET /reportesmanager/buscarreporteconsola/<uuid>` cada 2 s | Aging por cliente. Formato nuevo desde el 19-ago; adaptador en `estadocuenta-web.ts` | `boston-cartera` |
| Egresos Varios | `GET /caja/listaegresosvarios` + `POST /caja/egresosvariosexportar` (CSV) | Renglón por gasto, cuenta contable | `sync-egresos-varios` |
| Catálogo de cuentas | `GET /cuentacontable/cuentas` (JSON) | Código → nombre | `sync-egresos-varios` |
| Ingreso de mercancía | `GET /reportes/ingresomercancia` + `/reportes/stockingresomercanciadetalle` (detalle) · `/reportes/stockingresomercancia` (resumen) | Llegadas, CIF, FOB (no confiable) | `sync-ingresos-mercancia` |
| **Ventas Artículos** | `GET`+`POST /reportesventa/ventasarticulos` | **Renglón por renglón CON número de documento** (`secuencial`: `11-` factura, `13-` NC), código, cantidad, precio, `subTotalConDescuento` | `scripts/_bajar-acs-ventasarticulos.ts` (2-sep) |

Lo que existe en el menú y **todavía nadie bajó** (descubierto con `scripts/_diag-acs-lineas-descubrir.ts`; puede variar por empresa):

| Menú | Ruta | Para qué serviría |
|---|---|---|
| Recibos por comprobantes | `/reportesventa/recibosfacturas` | **Cobros contra factura** (pendiente #1 de la lista) |
| Formas pago por comprobantes / por abonos | `/reportesventa/formapagosfacturas` · `/reportesventa/formapagosabonos` | Cómo pagó cada documento |
| Listado de facturación | `/reportesventa/listadofacturacion` | Cabeceras con más columnas que el API |
| Total de ventas · Diario de ventas | `/reportes/ventas` · `/diariodeventas` | Agregados por día |
| Ventas totales por artículos · por precio · talla y color | `/reportes/ventasarticulos` · `/reportes/ventasarticulosprecio` · `/tallacolor/ventasarticulos` | Agregados por artículo (**sin** documento) |
| Productos por vendedor · Ventas por vendedor | `/vendedores/ventasarticulos` · `/vendedores/ventasporvendedor` | Ojo: hay TRES niveles de vendedor (`docs/switch-panel.md` §12) |
| Análisis de desempeño · ventas diarias · descuentos · cupones | `/reportes/analisis` · `/reportesventa/ventadiaria` · `/reportesventa/descuentos` · `/reportes/ventasporcupon` | — |
| Clientes sin movimientos · Artículos sin movimientos | `/reporteclientes/sinmovimientos` · `/reportearticulos/sinmovimientos` | — |
| Reporte de inventario **por fecha** | `/reportes/listadoinventario` | **Inventario a fecha** (pendiente #4) |
| Reporte de inventario · talla y color · por sucursal · Kardex | `/reportestock/listadoinventario` · `/reportestock/inventariotallacolor` · `/reportestocksucursal/inventariotallacolor` · `/reportekardex/listadoinventario` | Existencias |
| Stock mínimo · Pedido bodega · Toma de inventario · Ajustes · Transferencias · Movimientos por sucursal | `/reportestock/stockminimo` · `/reportestock/pedidobodega` · `/tomainventario/reporte` · `/reportes/ajusteinventario` · `/reportes/transferenciamercancia` · `/reportes/entradaysalidas` | — |
| Ingresos Varios · Analítico de caja · Cheques · Recibos · Ingreso cobranzas | `/caja/ingresovarios` · `/caja/analiticocaja` · `/caja/cheques` · `/recibos` · `/ingresocobranza` | **Ingresos varios** (pendiente #3) |
| Estado de cuenta proveedores | `/estadodecuentaproveedor` | CxP con aging |

Los HTML de los menús y los `.js` de cada reporte (con los parámetros exactos del `POST`) quedaron en `/tmp/acs/descubrir/` — si ya no están, el script de descubrimiento los vuelve a bajar en una sola sesión.

---

## 🩸 La sesión de Switch es por USUARIO, no por empresa

Documentación oficial del API, p. 6, textual: *«Solo habrá un token válido a la vez por usuario»* (`docs/switch-referencia.md`, §1.1 y Parte 3 #1). El sistema entra como **`daniel` en 7 de 8 empresas** (`client.ts`, `SWITCH_*_API_USER`), así que **cada sesión del cron o de un script tumba la sesión de Daniel en el panel, y viceversa.** La regla de «una sesión por empresa» que aparece en el código viejo es la misma restricción vista desde el otro lado. Un usuario dedicado al API por empresa la resolvería; hasta que exista, la regla operativa es la del Paso 3.

---

## Errores que no hay que repetir

- ❌ Abrir sesión sin decir antes empresa y hora — expulsa a Daniel del panel.
- ❌ Correr el script encima de un cron de la misma empresa (mirar `vercel.json` y `SWITCH_CRON_ENTRADAS`).
- ❌ Bajar un año de un golpe y confiar en `recordsTotal`.
- ❌ Dar por completo un archivo que no se cuadró contra `switch_facturas`.
- ❌ Confiar en el HTTP 200: la página de excepción también es 200.
- ❌ Reescribir el login en vez de usar `loginSwitchWeb`.
- ❌ Olvidar `cerrarSesionWeb` en el `finally` — deja a Daniel afuera más tiempo del necesario.
- ❌ Escribir lo bajado en Supabase «para probar». Disco local hasta que Daniel defina.
- ❌ Copiar una credencial en un log, un test o un reporte.
