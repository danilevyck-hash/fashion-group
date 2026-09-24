# Marketing › el rediseño (22-sep-2026) — el cimiento y el mapa de las cuatro piezas

> Nació el 22-sep-2026 con la PRIMERA de cinco piezas del rediseño de Marketing: el cimiento. Acá vive, verbatim, lo que Daniel definió ese día; qué módulos puros existen y cómo se usan; qué migraciones hay que aplicar y en qué orden; y **qué le toca a cada una de las otras cuatro piezas**, con los archivos que cada una toca, para que no se pisen.
>
> Los otros dos postmortems del módulo siguen vigentes: [marketing-gastos.md](marketing-gastos.md) (la puerta «＋ Registrar gasto» y el PDF con IA) y [marketing-mobiliario.md](marketing-mobiliario.md) (el inventario en PIEZAS, que **no se toca**).

---

## 1. Lo que Daniel definió el 22-sep-2026 — ES LA ESPECIFICACIÓN

**Tipos de gasto, tres:** factura del proveedor que hizo el trabajo (Impresora Comercial, Premium Paint, Boston cuando fabrica — NUNCA la marca) · mueble que sale de su bodega · pago mensual de impulsadora.
**Quién carga:** secretarias y admin.
**Marca:** UNA por gasto, nunca se reparte. *(Medido: 108 de 108 facturas tienen una sola; el «50 %» es el modelo viejo «marca 50 / Fashion Group 50», no un reparto.)*
**Tienda:** obligatoria si el gasto es de una tienda, del directorio (`clientes_master`). Si no es de ninguna → cajón **«General»** (así se llama, Daniel no lo cambió). *(Medido: el 72 % de lo abierto hoy no tiene tienda: impulsadoras, muebles de Boston.)*
**El proyecto SE VA.** Daniel: *«a) Basta la tienda»*. Queda la tienda + una nota libre de qué fue («Apertura», «Remodelación»). *(Hoy City Mall D-25 y La Frontera D-87 tienen dos proyectos cada una.)*
**El contenedor es la MARCA y su PERÍODO.** Es lo que se le manda y lo que la marca reconoce. **El cliente es un dato del gasto y se BUSCA**; no es la caja.
**Estados del período, DOS:** Abierto → Cerrado. Daniel: *«no quiero pipeline, cuando lo cierro es porque lo cobré»*. Cerrar = llegó la nota de crédito. Al cerrar **le pone el nombre él** y **se abre el siguiente solo**. Nota de crédito: campo opcional, **sin ningún cálculo** (Daniel: *«si te respondo que sí al 50 % harás toda una cosa innecesariamente»* — NO construyas nada alrededor del monto de la NC).
**El ZIP:** se baja cuando se quiera desde el período abierto; **se GUARDA cada ZIP que se bajó** (hoy `mk_periodos.reporte` está NULL en los 6). Cerrar no genera nada.
**Interruptor «¿Se reporta a la marca?»** en los TRES tipos, **prendido por defecto**. Apagado: se guarda, se ve en la tienda marcado, **no va al ZIP y no suma** en lo de la marca. Daniel: *«hay gastos o muebles que son para tienda pero no quiero reportar como gastos pero saber que existen»*.
**Fotos:** se pegan a la TIENDA (ya no al proyecto). Ayudan, no obligatorias.
**Proveedor:** el PDF lo lee (ya lo hace, `MARKETING_PDF_EN_LA_PUERTA = true`); al escribirlo se **sugieren los ya usados**; y el freno de duplicados **normaliza** (sin «S a», «S.A.», puntos, acentos, mayúsculas).
**Freno de duplicados:** mismo proveedor normalizado + mismo monto + misma fecha → **NO deja guardar**. *(Hoy: solo número exacto, y solo avisa.)*
**«Eliminar definitivamente» se va.** Con «Anular» basta.
**Multifashion deja de ser tarjeta de marca**: es una TIENDA (la suya, D-108) y sus gastos ya tienen marca (Tommy, Calvin). El de $4.264,80 en «Otros» lo mueve Daniela.
**Karl Lagerfeld y Reebok se quedan** (se usarán).
**Mobiliario se queda como está** (inventario, dos precios: costo $8,75 / a la marca $18 — no se mezclan). Daniel dijo NO a tocarlo.
**Los 98 PDF huérfanos se quedan.** Daniel dijo NO.
**Impulsadora:** persona con $800/mes a UNA marca; **cada mes alguien carga el pago con su comprobante**; el sistema muestra TODOS los meses sin pagar (hoy solo mira 2 hacia atrás).
**Reportes:** UN total, solo lo reportado; por marca / por tienda; «Por proyecto» se va; «Exportar Excel» se va. Los gastos de las marcas **NUNCA se suman entre sí** en un total del grupo.
**El Excel del ZIP:** lo interno no sale («este período se cerró sin reporte guardado»), los nombres de sus empresas no salen («Fashion Wear Inc.»), el proveedor una sola grafía. Los links firmados **30 días**, no 365, con forma de volver a firmar.

**Y la regla dura que cruza todo:** *«no elimines ni modifiques nada, deja que secretaria lo haga cuando rediseñemos»*. Los duplicados, las marcas cruzadas, los 7 proyectos vacíos, el letrero en «Otros»: **se quedan tal cual**, Daniela los limpia desde el módulo nuevo. Toda migración solo AGREGA columnas y nunca borra ni cambia valores. Y **todo falla ABIERTO**: sin la migración, el módulo funciona como hoy.

---

## 2. Lo medido contra producción el 22-sep-2026 (solo lectura, por REST)

| Qué | Número |
|---|---|
| `mk_facturas` | **108** (94 vivas · 14 anuladas) · 87 con proyecto · 21 vivas sin proyecto (17 impulsadoras + 4 sueltas) |
| `mk_factura_marcas` | 108 filas = **108 facturas, 0 con más de una marca** (72 al «50 %», 36 al «100 %») |
| `mk_entregas_muebles` | **24**, las 24 con proyecto, **0 con más de una marca** en `total_por_marca` |
| `mk_impulsadoras` | 2 (Ana Trejos · Cindy de Gracia, $800), **0 con más de una marca** |
| `mk_adjuntos` | 168 · 60 `foto_proyecto` (con proyecto) · 106 `pdf_factura` · 2 `foto_factura` |
| `mk_proyectos` | 25 · **6 sin `tienda_codigo`**: Changalo, Impulsadoras ×2, Multifashion Holdings, «D», «J» |
| `mk_proyecto_marcas` | **5 filas** |
| `mk_periodos` | 6: «mid 2026» (pvh, cerrado por la migración de agosto) + 5 «Período 2026» abiertos (TH · CK · KL · RBK · J). **`reporte` NULL en las 6** |
| Duplicados con la clave nueva (proveedor normalizado + monto + fecha), entre vivas, sin impulsadoras | **6 grupos, 12 facturas** (Krysthel ×3, Boston, Premium Paint, Impresora Comercial) |
| Borrados duros en `activity_logs` (`delete_definitivo`) | **12**, todos por admin |
| Proveedores distintos | 13 crudos = 13 normalizados (hoy nadie está escrito de dos formas; los duplicados vienen por el NÚMERO) |

**Cuántas filas quedarían sin `tienda_codigo` después de la migración:** de las 87 facturas con proyecto, **1** (la de «Multifashion Holdings», $4.264,80 — la que Daniela mueve a D-108 a mano); entregas **0**; adjuntos **0**. Las 21 sin proyecto son «General» por diseño.

🔴 **Los pagos de impulsadora comparten fecha de carga**: Ana Trejos tiene 7 pagos de $800 con `fecha_factura = 2026-08-04` (uno por mes atrasado). Por eso el freno de duplicados, en impulsadora, mira `periodo_desde` como «fecha», no `fecha_factura`. Con `fecha_factura` habría frenado 13 pagos legítimos.

---

## 3. Los módulos puros del cimiento (`src/lib/marketing/`) y cómo se usan

Todos sin React, sin Supabase, sin `fetch`. Candado: `src/__tests__/lib/marketing-cimiento.test.ts` (41 casos); mutaciones: `scripts/_mutar-candados-marketing-cimiento.sh`.

### `gasto.ts` — el concepto
- `TIPOS_DE_GASTO = ["factura","mueble","impulsadora"]` · `TABLA_DE_TIPO` (factura → `mk_facturas`, mueble → `mk_entregas_muebles`, impulsadora → `mk_facturas` con `impulsadora_id`) · `ROTULO_DE_TIPO` · `TIENDA_GENERAL = "General"` · `SE_REPORTA_POR_DEFECTO = true`.
- `tipoDeFila({ tabla, impulsadora_id })` · `esTipoDeGasto(v)` · `rotuloTienda(codigo)` · `seReportaDe(v)` (solo un `false` explícito apaga).
- 🔴 `exigirUnaMarca(marcas)` → la marca, o lanza `ErrorMarcaRepartida`. **Ya está enchufada** en las tres puertas que escriben marcas: `factura-marcas.ts › setMarcasDeFactura`, `inventario.ts › createEntrega/updateEntrega`, `impulsadoras.ts › validarSplit`.
- `faltantesDelGasto(g)` → lista de mensajes («Elige la marca.», «Elige la tienda del directorio.» solo si `esDeTienda`) · `armarGasto(g)` → `Gasto` con los defaults puestos. **Sin `proyectoId`** ni en la entrada ni en la salida.

### `proveedor.ts` — una sola grafía
- `normalizarProveedor(s)`: minúsculas · sin acentos · sin puntuación · un espacio · sin la cola «s a» / «sa» / «inc» / «corp» al FINAL.
- `mismoProveedor(a, b)`: **igualdad** del normalizado. Nunca `includes` (candado).
- `sugerirProveedores(texto, historico, max=8)`: por **prefijo** del normalizado, UNA grafía por proveedor (la más usada), ordenadas por usos. Texto vacío → los más usados.

### `duplicado.ts` — el freno
- `claveDeDuplicado({proveedor, monto, fecha})` = `normalizado|monto.toFixed(2)|fecha`; vacía si falta uno.
- `buscarDuplicado(nuevo, existentes)` → la fila igual o `null` (se salta la misma `id` al editar) · `esDuplicado(...)` · `mensajeDuplicado(existente)` («Ya existe un gasto de X por $Y del Z (N° …). No se guarda dos veces.»).
- ⚠️ En impulsadora, `fecha` = `periodo_desde`.

### `periodo-estado.ts` — dos estados
- `ESTADOS_PERIODO` · `TRANSICIONES = { abierto: ["cerrado"], cerrado: [] }` · `puedeCerrar(estado)` · `aceptaGastos(estado)`.
- `sumaEnElPeriodo(g)` (= `seReporta !== false`) · `totalesDelPeriodo(gastos)` → `{ reportado, noReportado, cantidadReportada, cantidadNoReportada }`. **Nunca se suman entre marcas.**
- `armarCierre(periodo, { nombreAlCerrar, notaCredito?, cerradoPor, ahoraISO })` → `{ estado:"cerrado", cerrado_en, cerrado_por, nombre_al_cerrar, nota_credito }`. La nota es TEXTO; `MSG_FALTA_NOMBRE` si no viene el nombre.
- `abrirSiguiente({ marcaCodigo, hoyPanama, ahoraISO })` → la fila del siguiente, nombre por defecto `nombrePorDefectoDelSiguiente(hoy)` = «Desde el 22 sept 2026».
- `anotarZip(lista, registro)` → la lista con el ZIP nuevo al final (`RegistroZip = { bajado_en, bajado_por, gastos, monto, archivo_path }`).

### `agrupar-por-tienda.ts`
- `agruparPorTienda(gastos)` → grupos `{ tiendaCodigo|null, rotulo, gastos, totalReportado, totalNoReportado, cantidad… }`, tiendas por total reportado desc, **«General» al final**. `totalReportadoDe(grupos)`.

### `columnas-opcionales.ts` — falla abierto
- `esColumnaAusente(err)` (PGRST204 · 42703 · el texto que nombra la columna; **no** un timeout ni un permiso).
- `completarGasto(fila)` / `completarPeriodo(fila)`: rellenan con el valor de hoy sin pisar lo que vino.
- `conRespaldoSinColumnas(conCols, sinCols, avisar?)`: corre la consulta con las columnas nuevas; si faltan, la de respaldo, y avisa en el log.
- `sinColumnasDelRediseno(payload)`: para reintentar una escritura sin las columnas nuevas.

### `types.ts` (aditivo)
`MkFactura` y `MkEntregaMuebles` ganan `se_reporta?`, `tienda_codigo?`, `nota?`; `MkAdjunto` gana `tienda_codigo?`. **Opcionales** hasta que la migración corra (candado).

---

## 4. Las migraciones — APLICADAS el 22-sep-2026 (verificado por REST: 86 facturas · 24 entregas · 60 adjuntos con tienda; 22 facturas sin tienda = 17 impulsadoras sin proyecto + 4 muebles Boston sin proyecto + 1 con proyecto sin tienda; `mk_periodos`: 6 filas, `zips_bajados=[]` y `nombre_al_cerrar` NULL en todas). Orden y qué hace cada una

Las aplica Daniel con `npm run migrar supabase/migrations/<archivo>.sql` cuando diga que sí. Las dos son ADITIVAS (candado: sin `DROP`, `DELETE`, `TRUNCATE`, cambio de tipo ni `SET proyecto_id`; todo `ADD COLUMN` con `IF NOT EXISTS`; el `UPDATE` solo copia `tienda_codigo` donde está en NULL).

1. **`20261216120000_marketing_gasto_tienda_se_reporta.sql`** — `se_reporta boolean NOT NULL DEFAULT true`, `tienda_codigo text`, `nota text` en `mk_facturas` y `mk_entregas_muebles`; `tienda_codigo` en `mk_adjuntos`; **COPIA** la tienda del proyecto (`WHERE x.tienda_codigo IS NULL AND p.tienda_codigo IS NOT NULL`); tres índices por tienda; `COMMENT` que rotula `mk_proyecto_marcas` y `mk_proyectos` como retiradas del modelo. PASO 0 imprime los conteos; PASO 5 aborta si una fila con proyecto con tienda quedó sin la suya.
2. **`20261216120100_marketing_periodo_cierre_y_zips.sql`** — `mk_periodos.nombre_al_cerrar text`, `nota_credito text` (TEXTO a propósito), `zips_bajados jsonb NOT NULL DEFAULT '[]'` con CHECK de lista. 🔴 **Es una columna y no una tabla** porque una tabla nueva entra al respaldo y el respaldo avisa por Telegram cada día que una tabla de su lista no existe: mientras Daniel no aplique la migración, sonaría a diario.

Sin ninguna de las dos, **nada cambia**: el código se porta como hoy (`columnas-opcionales.ts`).

---

## 5. Lo que se retiró del código (patrón `mayor_lineas`: el código se va, la tabla se queda)

- **«Eliminar definitivamente»**: botón y confirmación en `FacturasSection.tsx` y `ProyectoOverlay.tsx`; `eliminarFacturaDefinitiva` / `eliminarProyectoDefinitivo` en `mutations.ts`; las rutas `DELETE /api/marketing/facturas/[id]` y `DELETE /api/marketing/proyectos/[id]` contestan **403** con el porqué. Los 12 borrados duros de la historia quedan en `activity_logs`. El candado `marketing-reclamos-toques.test.tsx` **cambió de dirección con nota fechada** (exigía el botón lejos de «Anular»; hoy exige que no exista).
- **`mk_proyecto_marcas`**: sin lectores ni escritores en `src/` (`queries.ts`, `proyectos/route.ts`, `reportes.ts` —que ahora deriva las marcas del proyecto de sus DOCUMENTOS—, `mutations.ts`; la ruta `PUT /proyectos/[id]/marcas` contesta **410**). Pasa a `congelada` en `backup/tablas.ts` (5 filas, sigue en el respaldo). No se dropea.
- **Los seis lugares que reparten por `pct / sumPct`** (`reportes.ts`, `resumen-bloques.ts`, `periodos-reporte.ts`, `zip-export.ts`, `zip-marca.ts`, `generar-zip.ts`, más `factura-marcas.ts`, `contexto-marca.ts`, `resumen-inicio.ts`, `inventario.ts`) **NO se tocaron**: con una marca por gasto dan el total completo. Las piezas los simplifican encima del candado `exigirUnaMarca`.

---

## 6. El reparto para las otras cuatro piezas — quién toca qué

Regla para las cuatro: **importar del cimiento, no reescribirlo**; **toda lectura y escritura de columnas nuevas pasa por `columnas-opcionales.ts`**; **todo detrás de un interruptor** (Daniel prueba en producción con su secretaria); **nada de lo que se guarda hoy cambia de forma**.

### (A) La puerta «＋ Gasto» con sus tres formularios
- **Toca:** `src/app/marketing/components/RegistrarGastoModal.tsx` (la puerta), `src/components/marketing/FacturaForm.tsx`, `EntregaForm.tsx`, el modal de pago de impulsadora, `src/lib/marketing/mutations.ts › createFactura/updateFactura`, `inventario.ts › createEntrega/updateEntrega`, `impulsadoras.ts › registrarPagoImpulsadora`, y las rutas `POST /api/marketing/facturas`, `/inventario/entregas`, `/impulsadoras/[id]/pagos`.
- **Usa:** `gasto.ts` (`TIPOS_DE_GASTO`, `faltantesDelGasto`, `armarGasto`, `exigirUnaMarca` ya está), `proveedor.ts › sugerirProveedores` (el histórico = `SELECT DISTINCT proveedor FROM mk_facturas WHERE anulado_en IS NULL`), `duplicado.ts › esDuplicado` en el **servidor** (400 con `mensajeDuplicado`), `columnas-opcionales.ts` para escribir `se_reporta`/`tienda_codigo`/`nota` con reintento sin ellas.
- **No toca:** el ZIP, la portada, el período, Mobiliario.

### (B) El buscador global y la vista de tienda
- **Toca:** `src/lib/search/*` (el buscador de ⌘K: el gasto de Marketing lleva a su tienda), una pantalla nueva `src/app/marketing/tienda/[codigo]/page.tsx` (+ su ruta `GET /api/marketing/tienda/[codigo]`), y `FotosSection.tsx` para que las fotos cuelguen de la tienda (`mk_adjuntos.tienda_codigo`).
- **Usa:** `agrupar-por-tienda.ts`, `gasto.ts › tipoDeFila/rotuloTienda`, `columnas-opcionales.ts › completarGasto`. La tienda se busca en `clientes_master` por CÓDIGO (nunca por nombre; ver la regla del CXC).
- **No toca:** los formularios (A), el cierre (C).

### (C) La portada Abiertos | Cerrados + el período + el cierre + reportes
- **Toca:** `src/app/marketing/page.tsx` y `components/InicioMarketing.tsx` (la portada por marca, sin la tarjeta de Multifashion —es una tienda—), `src/app/api/marketing/periodos/cerrar.ts` y `[id]/cerrar/route.ts` (nombre al cerrar + nota de crédito, sin generar reporte), `periodos-io.ts › cerrarPeriodo/abrirPeriodo`, `periodos-reporte.ts` (solo `se_reporta`, por tienda), `reportes.ts` + `ReportePorMarcaView` / `ReportePorTiendaView` (UN total, solo lo reportado; retirar `ReportePorProyectoView`, `/api/marketing/reportes/proyecto` y «Exportar Excel», patrón `mayor_lineas`), y `resumen-bloques.ts`.
- **Usa:** `periodo-estado.ts` (`armarCierre`, `abrirSiguiente` con `hoyPanama()`, `totalesDelPeriodo`), `agrupar-por-tienda.ts`, `columnas-opcionales.ts › completarPeriodo`.
- **No toca:** el ZIP en sí (D), los formularios (A).

### (D) Impulsadoras + el Excel del ZIP + los links de 30 días
- **Toca:** `impulsadoras.ts › listImpulsadoras` (TODOS los meses sin pagar desde el primer pago, no 2 hacia atrás; `coberturaDelMes` ya existe en `periodo.ts`), `ImpulsadorasView.tsx`, `zip-marca.ts` / `zip-export.ts` / `generar-zip.ts` (solo `se_reporta`; sin nombres internos ni «este período se cerró sin reporte guardado»; el proveedor por `normalizarProveedor` para UNA grafía), `storage.ts › firmarPath` (TTL **30 días** = `60*60*24*30`, con una ruta para volver a firmar), la ruta que baja el ZIP (guarda el archivo en `marketing/periodos/<id>/<fecha>.zip` y anota con `anotarZip` en `mk_periodos.zips_bajados`, releyendo la fila antes de escribir).
- **Usa:** `periodo-estado.ts › anotarZip/sumaEnElPeriodo`, `proveedor.ts`, `columnas-opcionales.ts`.
- **No toca:** la portada (C), los formularios (A).

---

## 7. Candados de esta pieza y mutaciones

- `src/__tests__/lib/marketing-cimiento.test.ts` — 41 casos en 9 bloques: una marca · `se_reporta` · proveedor · duplicado · migraciones aditivas · falla abierto · el proyecto no decide · «Eliminar definitivamente» no vuelve y `mk_proyecto_marcas` sin lectores · el período.
- `src/__tests__/components/marketing-reclamos-toques.test.tsx` — bloques 1 y 2 cambiaron de dirección (nota fechada arriba de cada uno).
- `src/__tests__/lib/marketing-periodos.test.ts` — tres casos que registraban una factura con DOS marcas cambiaron de dirección con nota fechada: hoy la puerta la rechaza (`ErrorMarcaRepartida`) y no queda sello; cada marca lleva su propia factura.
- `scripts/_mutar-candados-marketing-cimiento.sh` — 44 mutaciones + 2 controles; el resultado de la corrida está en el informe de la pieza.

---

## 8. Pieza (B) — el buscador global y la vista de tienda (22-sep-2026)

> Daniel: *«debería estar organizado: ver por cliente, busco el cliente o proyecto y ver adentro la info (por marca etc.)»*.

**Ahora → después.** Para llegar a un gasto había que ir **Marca → Período → Proyecto**, tres saltos, y el buscador del proyecto comparaba con `includes` sobre el texto crudo. Ahora se busca la tienda en **⌘K** y se cae en `/marketing/tienda/<código>`, con TODO lo suyo agrupado **por marca**.

### Lo medido contra producción (solo lectura, por REST)

| Qué | Número |
|---|---|
| Proyectos con los que se midió el buscador | **25** |
| «nova» con `includes` | **2** — Nova Lux **y** «Renovación» |
| «nova» por palabra | **1** — solo Nova Lux (D-170) |
| «d» con `includes` / por palabra | **21 de 25** / **6** |
| Términos que NO cambian con la regla nueva | **12 de 14** (`remodel · city · frontera · mall · lux · j · plaza · impulsadora · hanna · renovacion · muebles · apertura`) |
| Facturas con ceros a la izquierda («0000064948») | **79 de 108** — por eso el NÚMERO se queda por subcadena (de 5 números probados, 4 quedaban en cero con la regla por palabra) |
| Tiendas con gasto hoy | **17** + el cajón «General» (22 gastos, $37.778,12) |
| Cuadre contra la pantalla que ya existe | **D-24 = $37.460,92** (CK $8.261,80 · TH $29.199,12), **D-25 = $10.509,75**, **D-170 = $12.261,16** — idénticos a «Reportes por tienda» |
| Fotos con tienda (`mk_adjuntos.tienda_codigo`) | **60 de 60** de las `foto_proyecto` |

### Qué se construyó

- **`src/lib/marketing/vista-tienda.ts`** (puro) — el interruptor **`VISTA_TIENDA`** (hoy `true`), `hrefDeTienda` (la ÚNICA definición de `/marketing/tienda/<código>`), `esCodigoGeneral` / `CODIGO_GENERAL`, `rotuloDeLaTienda`, `agruparPorMarca`, `totalDeLaTienda`, `rotuloDeFila` / `rotuloDelPeriodo`. **Qué suma lo decide `periodo-estado.ts › totalesDelPeriodo`**: acá no hay una segunda definición.
- **`src/lib/search/texto.ts`** (puro) — `normalizarBusqueda` · `coincidePorPalabra` · `coincideSubcadena` · `algunoCoincidePorPalabra`. 🔴 Una palabra del texto tiene que **EMPEZAR** con lo escrito; nada por parecido (sin distancia de edición ni fonética, con barrido).
- **`src/lib/search/marketing.ts`** y **`marketing-server.ts`** — la sección de Marketing del ⌘K: las tiendas con gasto, su nombre del directorio **por CÓDIGO**, y lo que suman **solo de lo reportado**. Falla ABIERTA a `[]`.
- **`GET /api/marketing/tienda/[codigo]`** (+ `datos.ts`) — la lectura. Facturas vivas + entregas + su marca (`mk_factura_marcas` / `total_por_marca`) + el sello de período (`mk_periodo_documentos` → `mk_periodos`) + el nombre de la impulsadora + las fotos. Toda columna del rediseño pasa por `columnas-opcionales.ts › completarGasto` / `esColumnaAusente`: sin la migración, la pantalla lo **dice** y no revienta. La ruta **no escribe nada** (barrido).
- **`GET`/`POST /api/marketing/tienda/[codigo]/fotos`** — las fotos de la tienda, firmadas. El POST es puerta propia porque `POST /api/marketing/adjuntos` exige un `proyecto_id` para una `foto_proyecto` y el proyecto se fue; falla ABIERTA (guarda sin tienda y lo dice en el log).
- **La pantalla** `src/app/marketing/tienda/[codigo]/{page,VistaTienda}.tsx` — resumen arriba (**gasto que se reporta**, y aparte **lo que no suma**), una tabla por marca (Tipo · Proveedor · Detalle · Fecha · Período · Monto), lo no reportado **en gris con su rótulo**, las fotos de la tienda al pie, y **«＋ Gasto»**. Con el interruptor apagado: `notFound()`.
- **`FotosSection.tsx`** — gana `tiendaCodigo`; con él lee y sube por la puerta de la tienda, sin `tiendaCodigo` se porta **exactamente** como hoy.
- **`/api/marketing/adjuntos/upload-url`** — acepta `tiendaCodigo` y guarda en `tienda/<código>/…`. Aditivo: los cuatro caminos de antes no cambian.
- **`/api/search/route.ts`** y **`SearchBar.tsx`** — la sección «Marketing», solo para admin y secretaria (los roles del módulo), con la dirección tomada de `hrefDelResultado`, nunca escrita a mano.
- **`/api/marketing/proyectos-lista`** — el texto (nombre · tienda · concepto) pasa a `coincidePorPalabra`; el **número de factura** se queda en `coincideSubcadena`. Con `VISTA_TIENDA` en `false` vuelve el `includes` de siempre.

### Lo que NO se hizo, y por qué

- **La puerta «＋ Gasto» todavía no abre con la tienda puesta.** `RegistrarGastoModal` (pieza A) aún no acepta `tiendaCodigo`; el punto de montaje está marcado en `VistaTienda.tsx` y es una prop de una línea cuando A lo declare. Hoy el botón abre el formulario preguntando como siempre.
- **El buscador del proyecto sigue existiendo**: esta pieza lo arregló, no lo retiró. Quitarlo es de la pieza (C), con la portada.

### Candado y mutaciones

`src/__tests__/lib/marketing-vista-tienda.test.ts` — **30 casos en 6 bloques**: agrupa por marca y el total excluye lo no reportado · la tienda por CÓDIGO y nunca por nombre · «nova» no trae «Renovación» (con los 25 proyectos reales adentro) · el resultado de ⌘K apunta a `/marketing/tienda/<código>` y esa dirección se escribe una sola vez · el interruptor en `false` = nada cambia · las fotos cuelgan de la tienda y todo falla ABIERTO.

Mutaciones corridas a mano (romper → ROJO → restaurar), **6 de 6 en rojo** y el control en verde:

| # | Mutación | Resultado |
|---|---|---|
| 1 | `totalDeLaTienda` suma también lo NO reportado | 🔴 |
| 2 | `hrefDeTienda` deja de apuntar a `/marketing/tienda/…` | 🔴 |
| 3 | la lectura busca `clientes_master` por `nombre` en vez de por `codigo` | 🔴 |
| 4 | `coincidePorPalabra` vuelve a `includes` | 🔴 |
| 5 | `page.tsx` pierde el `notFound()` del interruptor | 🔴 |
| 6 | el número de factura pasa a compararse por palabra | 🔴 |

Dos candados ajenos **cambiaron de forma, no de dirección**, con nota fechada:
- `src/__tests__/lib/caja-y-marketing-defectos.test.ts` › «la ruta sigue pidiendo un dueño» — el guard de `upload-url` ganó un cuarto permitido (`tiendaCodigo`) y quedó en varias líneas; ahora se comprueban las piezas, no la grafía de una línea. Se sumó un caso: la foto de una tienda va a SU carpeta.
- `src/__tests__/lib/sesion-semilla-primer-pintado.test.tsx` — la pantalla nueva entró a `ALCANZADAS_POR_EL_GANCHO` (29 → 30).

---

## A. La puerta «＋ Gasto» con sus tres formularios (22-sep-2026, pieza A)

> Interruptor: `MARKETING_PUERTA_GASTO` en `src/lib/marketing/puerta-gasto.ts`, **hoy `true`**. En `false`, `RegistrarGastoModal` es la pantalla de antes campo por campo (`RegistrarGastoModalAnterior`, el mismo archivo, intacto) y el servidor no corre el freno nuevo. Candado: `src/__tests__/components/marketing-puerta-gasto.test.tsx` (27 casos en 7 bloques).

### Ahora vs después

| | Antes (interruptor en `false`) | Después (hoy) |
|---|---|---|
| Paso 1 | Factura · Mueble · «Gasto de la marca» (con Impulsadora / Otro gasto adentro) | **Factura de un proveedor · Mueble de la bodega · Pago de impulsadora** (`OPCIONES_DE_TIPO`, derivadas de `TIPOS_DE_GASTO`) |
| Cliente | Obligatorio en Factura y Mueble; busca o **crea un proyecto** | **Tienda del directorio o «General»**; obligatoria solo si «es de una tienda». **Ningún proyecto**: `proyecto_id = null`, `tienda_codigo` del gasto |
| Marca | Botones; se ponía **aparte** con `PUT /facturas/[id]/marcas` | Desplegable, UNA; viaja **con la factura** (`marcaId`) y el servidor contesta **400 antes de escribir** si falta. En impulsadora es la de ella, fija |
| Se reporta / nota | No existían | Casilla **prendida** + nota opcional; viajan en el MISMO guardado (`seReporta` · `tiendaCodigo` · `nota`) |
| Botón apagado | Sin motivo | **«Falta: la marca y la tienda»** (`textoFaltaEnLaPuerta`, patrón de Préstamos) |
| Proveedor | Texto libre | Texto libre **con sugerencias** del histórico (`ProveedorInput` → `sugerirProveedores`); `GET /api/marketing/facturas/proveedores` |
| Duplicado | Solo por número, y solo avisaba | **El servidor frena**: proveedor normalizado + monto + fecha → 400 `{ duplicado: true }` y no escribe; la pantalla dice el mensaje tal cual |

### Lo que se tocó

- **Puro:** `lib/marketing/puerta-gasto.ts` (interruptor · `OPCIONES_DE_TIPO` · `datosPorDefecto` · `queFaltaEnLaPuerta`/`textoFaltaEnLaPuerta` · `paraGuardar` · `columnasDelGasto` · `ErrorGastoDuplicado`). No conoce `proyecto_id` (candado).
- **Servidor:** `lib/marketing/puerta-gasto-server.ts` (`frenarFacturaDuplicada` · `frenarPagoDuplicado` —fecha = `periodo_desde`, falla abierta sin la columna— · `exigirTiendaDelDirectorio`, falla abierta si la lectura se cae). `mutations.ts › createFactura/updateFactura`, `inventario.ts › createEntrega/updateEntrega`, `impulsadoras.ts › registrarPagoImpulsadora`: las tres columnas entran SOLO si vinieron (`columnasDelGasto(input)`), escritas con `conRespaldoSinColumnas` + `sinColumnasDelRediseno`. Rutas `POST /facturas` (marca en el mismo acto, rollback = anular), `/inventario/entregas`, `/impulsadoras/[id]/pagos`. `types.ts` gana los tres campos opcionales en los cinco inputs.
- **Pantalla:** `PuertaGasto.tsx` (nueva), `BloqueDatosDelGasto.tsx` (nueva), `ProveedorInput.tsx` (nueva); `RegistrarGastoModal.tsx` elige por el interruptor; `FacturaForm` gana `historicoProveedores`; `EntregaForm` gana `marcaFija` (esconde el selector) y `gasto`; `RegistrarPagoModal` gana `gasto`. Los tres lugares que montan la puerta no cambian una línea; `tiendaInicial` queda lista para que la vista de tienda (pieza B) abra la puerta con la tienda puesta.
- **Tests de la pantalla de antes** (`marketing-registrar-gasto`, `marketing-pdf-en-la-puerta`, `poda-textos-explicaciones`): se les puso el interruptor en `false` con nota fechada; siguen probando lo de antes, que sigue vivo.

### Medido contra producción (solo lectura, 22-sep-2026)

108 facturas (94 vivas) · duplicados con la clave nueva entre vivas sin impulsadoras: **6 grupos, 12 facturas** (igual con `total` que con `subtotal`); **14 grupos** contando las anuladas · 13 proveedores distintos · `se_reporta = false`: **0** · `nota`: **0** · 86 facturas y 24 entregas con `tienda_codigo` (las migraciones ya estaban aplicadas). Los existentes no se tocaron.

### Mutaciones a mano (todas ROJAS; control verde 27/27)

| # | Qué se rompió | Resultado |
|---|---|---|
| M1 | `OPCIONES_DE_TIPO` con dos tipos (`slice(0, 2)`) | 3 rojos |
| M2 | Sin `frenarFacturaDuplicada` en `createFactura` | 2 rojos |
| M3 | `datosPorDefecto` con `seReporta: false` | 6 rojos |
| M4 | La ruta deja de exigir la marca (`exigirUnaMarca` fuera) | 1 rojo |
| M5 | La tienda deja de ser obligatoria en `queFaltaEnLaPuerta` | 3 rojos |
| M6 | El interruptor apagado sigue montando la puerta nueva | 2 rojos |

### Pendiente o dudoso

- ⚠️ **En Mueble no hay campo de foto**: sin proyecto, `mk_adjuntos` no tiene de dónde colgarla (`createAdjunto` exige proyecto o factura). Cuando las fotos cuelguen de la tienda (pieza B, `mk_adjuntos.tienda_codigo`) se enchufa acá.
- ⚠️ La pantalla vieja del proyecto (`FacturasSection`, `ProyectoOverlay`) no muestra los gastos nuevos: nacen sin `proyecto_id`. Se ven en la vista de tienda (B) y en los reportes por tienda (C).
- ⚠️ El aviso viejo por **número** de factura (`check-duplicate`, «Continuar de todos modos») sigue en `FacturaForm`: avisa, pero el freno nuevo del servidor manda igual.
- ⚠️ `updateFactura`/`updateEntrega` aceptan las tres columnas, pero las rutas de edición (`PUT /facturas/[id]`, `PATCH /entregas/[id]`) todavía no las mandan: editar un gasto no cambia su tienda ni su «se reporta». Es otra pantalla.

---

## (C) La portada Abiertos | Cerrados, el cierre con nombre y los reportes (22-sep-2026)

**Lo que Daniel definió y acá se construyó**, detrás de `MARKETING_PORTADA_REDISENO` (`src/lib/marketing/portada-rediseno.ts`, hoy `true`; `false` = la portada, el modal y el cierre de antes, intactos):

- **La portada** (`InicioMarketing.tsx` → `PortadaAbiertosCerrados.tsx`): dos pestañas **Abiertos | Cerrados** (`?estado=`, `replace`). En Abiertos, una fila por marca con su período abierto, **lo reportado como único monto**, lo apagado en gris («No se reporta: $X», nunca sumado) y **desde cuándo está abierto** («42 días abierto», contra el `hoy` de Panamá que manda la ruta). En Cerrados, el **nombre que se le puso al cerrar** (`nombre_al_cerrar`; un cierre viejo como «mid 2026» conserva el suyo), la marca, «Cerrado el …» y la nota de crédito si la hay; tocarla abre el nivel 3 por id (`seccionPorSlug` resuelve slug o id). 🔴 **Sin tarjeta de Multifashion entre las marcas**: va en Herramientas como «Tienda propia · N gastos · no se le reporta a ninguna marca» y lleva a `/marketing/multifashion`. 🔴 **Sin total del grupo** ni «Por cliente»/«Por marca»: *«los gastos de las marcas NUNCA se suman entre sí»*.
- **El cierre** (`cerrar.ts › cerrarPeriodoRediseno`, `[id]/cerrar/route.ts`, `periodos-io.ts › cerrarPeriodoConNombre/abrirPeriodoSiguiente`, `CerrarPeriodoModal.tsx`): pide **el nombre con el que se cierra ESTE período** (obligatorio, `MSG_FALTA_NOMBRE`, arranca con el nombre que ya tiene) y la **nota de crédito como TEXTO** (opcional, ≤300; ningún `Number()`), sella lo que pertenece al período —**los apagados también**, el sello dice a qué período va el gasto, no si se reporta—, escribe el parche de `armarCierre` **sin `reporte`** y abre el siguiente con `abrirSiguiente` («Desde el 22 sept 2026», `hoyPanama()`). Si abrir el siguiente falla, se reabre. **No baja ningún Excel al cerrar** (`DetallePeriodoView` solo lo hace con el interruptor apagado). El body de la ruta pasa de `{ nombreSiguiente }` a `{ nombreAlCerrar, notaCredito? }`.
- **Lo apagado no suma** en el agregador único (`resumen-bloques.ts › excluirNoReportado`): `se_reporta = false` cae en `noReportado` (conteo + monto) por bloque y por cerrado, fuera de `total`, `porMarca`, `porCliente` y el detalle. Lo prenden `/api/marketing/inicio`, `proyectos-lista` (niveles 2 y 3) y `periodos-reporte.ts`, todos leyendo `se_reporta` por `conRespaldoSinColumnas`. La ruta de la portada suma `periodosMeta` (`abierto_en` · `nombre_al_cerrar` · `nota_credito`, por `completarPeriodo`) y `hoy`.
- **Los reportes** (`reportes-rediseno.ts` puro + `reportes.ts › reportePorMarcaRediseno/reportePorTiendaRediseno`): la marca y la tienda son **las del GASTO**, solo lo que `se_reporta`, **una marca = 100 %** (`partesPorMarca`; una fila vieja con dos se reparte a partes iguales y se avisa — medido: ninguna), el año es el del documento (`impulsadora_mes` para las impulsadoras). Por marca salen las cinco de `MARCAS_BLOQUE` **sin pie**; por tienda, `agruparPorTienda` con «General» al final y Multifashion como una tienda más. 🩸 **Se retiraron** `ReportePorProyectoView.tsx`, `reportePorProyecto`, `exportarExcelReporte` (y el import de `excel-export`), «Exportar Excel» de las dos vistas y la ruta `/api/marketing/reportes/proyecto` (contesta **410**). Nada se dropea.

**Medido contra producción (22-sep-2026, solo lectura):** `mk_periodos` 6 filas (5 abiertas «Período 2026» del 12-ago, 1 cerrada «mid 2026» de `pvh`, `cerrado_por = migracion`), `nombre_al_cerrar` y `nota_credito` NULL en las 6, `zips_bajados = []`. 94 facturas vivas ($116.553,16) y 24 entregas ($81.347,00): **0 apagadas** → prender `excluirNoReportado` no movió un centavo. 22 facturas sin tienda (17 impulsadoras). Multifashion: 2 proyectos (D-108 y «Multifashion Holdings» sin código), $8.061,63 en la tarjeta de antes. Tommy abrió el 12-ago 03:21 UTC = 11-ago en Panamá → **42 días** al 22-sep.

**Candado:** `src/__tests__/components/marketing-portada-y-cierre.test.tsx` (21 casos en 7 bloques: dos estados · cerrar exige nombre y no genera reporte · el total excluye lo no reportado · Multifashion no es marca · las marcas no se suman entre sí · proyecto 410 y sin Exportar Excel · el interruptor).

**Mutaciones a mano (6 + control):**

| # | Mutación | Resultado |
|---|---|---|
| 1 | `filasAbiertas` deja de saltar `MULTIFASHION_KEY` | 🔴 |
| 2 | `apagado()` del agregador devuelve siempre `false` (lo apagado vuelve a sumar) | 🔴 (2 casos) |
| 3 | `cerrarPeriodoRediseno` deja de sellar lo que pertenece al período | 🔴 |
| 4 | `cerrarPeriodoConNombre` escribe `reporte` en el `update` | 🔴 |
| 5 | `reportePorMarcaDe` suma lo apagado en `reportado` | 🔴 |
| 6 | la ruta `/reportes/proyecto` contesta 200 | 🔴 |
| — | control sin mutar | 🟢 21/21 |

**Candados ajenos que cambiaron de forma, con nota fechada:** `marketing-periodos.test.ts` y `poda-textos-explicaciones.test.tsx` (mockean el interruptor en `false`: prueban el cierre y el modal DE ANTES); `iphone-tocables-y-letra.test.ts` (2 pestañas, sin `ReportePorProyectoView`); `excel-exports-marketing.test.ts` (sin el bloque de `exportarExcelReporte`); `marketing-reclamos-toques.test.tsx` (sin el bloque del filtro «Marca» del reporte por proyecto).

**Pendiente de Daniel:**
1. ✅ **DECIDIDO por Daniel el 22-sep-2026 — los $8.061,63 de Multifashion se quedan APARTE, nunca se le cobran a una marca.** Se le planteó a/b/c (siempre · nunca · gasto por gasto con «se reporta»); eligió textual: *«b) No, nunca → se quedan aparte como hoy. No cambio nada.»* Lo que gasta en su propia tienda para Tommy/Calvin es suyo. La regla por tienda D-108 (`multifashion.ts`, `MULTIFASHION_KEY` en `portada-rediseno.ts`) se queda como está y **no se vuelve a preguntar**.
2. El agregador de los niveles 2 y 3 (`proyectos-lista`) ya aparta lo apagado, pero `lista-por-periodo.ts` no lo dibuja en gris todavía (hoy 0 apagados: nada que dibujar).
3. El «Excel» de un período cerrado en el nivel 3 sigue vivo (es el del ZIP, pieza D); solo se retiró el «Exportar Excel» de Reportes.

### (C) · el cierre compartido: «mid 2026» se veía DOBLE (22-sep-2026)

> Daniel, mirando la pestaña Cerrados: *«doble?»*.

**Medido contra producción (solo lectura, por REST).** `mk_periodos` tiene **6 filas**: los 5 períodos ABIERTOS, uno por marca (`proveedor_key` = TH · CK · KL · RBK · J), y **UN solo cerrado**: «mid 2026», `proveedor_key = 'pvh'` — PVH es la casa que factura Tommy Hilfiger y Calvin Klein. `nombre_al_cerrar` y `nota_credito` en NULL en las 6.

**Ahora → después.**

| | Ahora | Después |
|---|---|---|
| Pestaña | «Cerrados **2**» | «Cerrados **1**» (cuenta PERÍODOS) |
| Filas | `mid 2026 · Calvin Klein · Cerrado el 11 ago 2026 · $46,462.14` **y** `mid 2026 · Tommy Hilfiger · … · $94,104.43` | **UNA**: título `mid 2026 · PVH`, subtítulo `Calvin Klein + Tommy Hilfiger · Cerrado el 11 ago 2026`, y a la derecha los DOS montos, cada uno con su marca |
| Adentro de Tommy | `CERRADO  mid 2026  $94,104.43` | `CERRADO  mid 2026 · PVH` + `parte Tommy Hilfiger · el resto es de Calvin Klein` (en Calvin, al revés) |

🔴 **LOS DOS MONTOS NO SE SUMAN.** Cada marca recibió su ZIP aparte: un grupo **no tiene campo `total`** y el módulo no tiene una sola operación de suma (barrido sobre el archivo, comentarios aparte). Los $140.566,57 no se escriben en ningún lado. **Ningún número cambia**: los dos montos son exactamente los que ya salían.

**Qué se construyó.**

- **`src/lib/marketing/cerrados-por-periodo.ts`** (puro, nuevo) — `agruparCerradosPorPeriodo` (junta por id de período, marcas alfabéticas), `tituloDelGrupo`, `marcasDelGrupo`, `esCompartido`, `textoParteDeLaMarca`, `unirNombres`, `marcasCompaneras` y la **tabla chica** `NOMBRE_POR_PROVEEDOR` (`'pvh'` → «PVH»; una clave desconocida **no se adivina**: la fila se dibuja como siempre).
- **Las marcas de un período salen de sus DOCUMENTOS**, no de una lista a mano: son las filas que ya arma `resumen-bloques.ts › cerrados` (una por período·marca).
- **`portada-rediseno.ts`** (aditivo) — `PeriodoMeta.proveedorKey?` y `FilaCerrada.proveedorKey`; `GET /api/marketing/inicio` lo llena con `mk_periodos.proveedor_key`, que ya leía.
- **`PortadaAbiertosCerrados.tsx`** — una fila por grupo; con dos marcas, cada monto es **su propia puerta** (44×44, «Abrir mid 2026 de Tommy Hilfiger») y la fila deja de tener un destino único; con una marca, **la fila de siempre**.
- **`lista-por-periodo.ts`** (aditivo) — `SeccionPeriodo.compartido` (`{ proveedorNombre, otrasMarcas }` o `null`) e `InsumosSecciones.proveedorPorPeriodo`; `proyectos-lista` lo arma de los `periodos` que ya leía. **El total de la sección sigue siendo solo el de esa marca.**
- **`/marketing/[marca]/page.tsx`** — el título y el subtítulo de la fila del cerrado, **detrás de `MARKETING_PORTADA_REDISENO`** (apagado = la fila de antes, sin subtítulo).

**Candado** `src/__tests__/components/marketing-cerrados-por-periodo.test.tsx` — **16 casos en 7 bloques**, con los montos REALES de producción adentro. Mutaciones a mano (romper → ROJO → restaurar), **5 de 5 en rojo**, control 🟢 16/16:

| # | Mutación | Resultado |
|---|---|---|
| 1 | `agruparCerradosPorPeriodo` vuelve a agrupar por período **y marca** | 🔴 4 casos |
| 2 | el grupo gana un `total` = suma de sus marcas | 🔴 2 casos |
| 3 | la pestaña cuenta filas (`cerradas.length`) en vez de períodos | 🔴 1 caso |
| 4 | `textoParteDeLaMarca` devuelve siempre vacío | 🔴 2 casos |
| 5 | la pantalla de la marca deja de mirar el interruptor | 🔴 1 caso |
| — | control sin mutar | 🟢 16/16 |

**Pendiente o dudoso.** Con dos marcas la fila **no tiene un destino único**: se entra por el monto de cada marca. Si Daniel prefiere que tocar la fila entera lleve a una de las dos, es una línea — pero elegir cuál sería inventar una preferencia que él no dijo.


---

## 9. Pieza (D) — impulsadoras, el Excel del ZIP y los links de 30 días (22-sep-2026)

Interruptor único: **`src/lib/marketing/zip-e-impulsadoras.ts › ZIP_E_IMPULSADORAS_NUEVO`** (hoy `true`). En `false`, las tres cosas vuelven exactamente a como estaban. **Nada de lo que se guarda cambió de forma**: la limpieza ocurre al ARMAR el papel, no al escribir en la base (Daniel: *«no elimines ni modifiques nada, deja que secretaria lo haga cuando rediseñemos»*).

### 9.1 Impulsadoras — todos los meses sin pagar

🩸 **El defecto.** `listImpulsadoras` miraba DOS meses (`mesAnteriorISO` / `mesActualISO`): un mes sin pagar más viejo que esos dos desaparecía de la pantalla, y la cabecera decía «Todo al día este mes ✓» con meses debajo sin pagar.

🔴 **La regla.** Todos los meses sin pagar **desde el primer pago** hasta el mes en curso de **Panamá** (`hoyPanama()`, no el reloj del servidor), el **más viejo arriba**. «Sin pagar» incluye el mes a medias. Sin ningún pago registrado la lista va VACÍA: `mk_impulsadoras` no tiene fecha de ingreso y **inventar un arranque sería inventar una deuda**. Módulo puro nuevo: `lib/marketing/meses-sin-pagar.ts` (`mesesSinPagar`, `resumenDeLoQueDebe`), encima de `coberturaDelMes` de `periodo.ts`, que ya existía.

**Medido contra producción (22-sep-2026, solo lectura):**

| | Hoy en pantalla | Con el interruptor |
|---|---|---|
| Ana Trejos | 2 chips (ago · sep 2026) | **24 meses sin pagar** (5 a medias), el más viejo **mayo 2024** |
| Cindy de Gracia | 2 chips (ago · sep 2026) | **4 meses sin pagar**, el más viejo **junio 2026** |

**Pantalla:** una línea «Debe 24 meses (5 a medias) — el más viejo, mayo 2024» y los chips del más viejo al más nuevo; se dibujan **6** y el resto se pliega en «Ver los otros N» (24 chips de corrido tapan el monto y los botones). El botón «Registrar pago» ahora sale mientras quede UN mes sin pagar, y el modal **abre en el más viejo** (`mesInicial`). `RegistrarPagoModal` **no se tocó**: solo la prop que recibe.

🔑 **Para Daniel, y él decide:** Ana tiene un pago de **abril 2024** y el siguiente recién en **agosto 2025**. O son 15 meses de 2024-2025 que nunca se pagaron, o ese pago está mal fechado. El sistema no lo puede saber; **no se tocó nada**.
⚠️ Cinco de sus «meses a medias» son meses a los que les falta **un día** (el pago se registró hasta el 30 de un mes de 31). Por eso el resumen los cuenta **aparte** y lo dice.

### 9.2 El Excel que lee la marca — las tres reglas

Medido sobre el ZIP **real** que recibió Tommy (`05-marketing/zip-gastos-del-periodo-cerrado-tommy-hilfiger.zip`, «mid 2026», 15 hojas, 40 gastos, $94.104,43, 429 celdas de texto, 93 archivos):

| Regla | ANTES | DESPUÉS |
|---|---|---|
| 1. Nota interna en el subtítulo | **1 celda**: «mid 2026 · calculado el 20 sept 2026 (este período se cerró sin reporte guardado)» | **0** — queda «mid 2026 · cerrado» |
| 2. Nombre de una empresa del grupo en el concepto | **1 de 40**: «Pago de espacio (mueble) en tienda **para Fashion Wear Inc.**» (+ el **nombre del PDF** de esa fila, que también lo llevaba) | **0** — queda «Pago de espacio (mueble) en tienda» |
| 3. Proveedor en una sola grafía | **10 grafías**, el sufijo de sociedad escrito de **4 formas**: `S a` · `S.a` · `S.a.` · `Corp.` | **10 grafías**, sufijo en **2 formas** (`S.A.` · `Corp.`); **19 de 40 celdas** cambian de escritura |
| 4. Solo lo que `se_reporta` | no se miraba | se filtra (hoy **0 apagados** en producción: ninguna fila cambia todavía) |

- La limpieza se aplica **al final de la preparación** (`zip-marca.ts › limpiarParaLaMarca`), no al armar el Excel: así llega también al **nombre de cada comprobante dentro del ZIP**, que lleva el concepto.
- 🔴 **El proveedor NO se censura.** «Confecciones Boston» es empresa del grupo **y** proveedor legítimo cuando fabrica (Daniel: *«Boston cuando fabrica»*). La regla 2 se aplica **solo al concepto**.
- Los nombres de las ocho empresas se **DERIVAN** de `EMPRESA_KEY_TO_NAME` + `EMPRESA_KEY_TO_NOMBRE_CORTO` + `EMPRESA_FISCAL[*].legal` (de ahí sale el «Inc.»), del más largo al más corto para que «Confecciones Boston» gane antes que «Boston». **Ninguno escrito a mano.**
- 🔴 **El reparto `pct/sumPct` se simplificó encima de `exigirUnaMarca`**: una marca = el total entero (`papel-de-la-marca.ts › porcionDeLaFactura`). **Ningún monto se movió** — medido: 108 de 108 facturas con UNA marca, 72 al «50 %» (el modelo viejo «marca 50 / Fashion Group 50») y 36 al «100 %»; con una sola fila, `total × (pct/sumPct)` ya daba el total. Queda la red por si llegara una repartida: no se rompe el ZIP de un encargado.
- Lo mismo (proveedor + `se_reporta`) se aplicó al respaldo del ZIP por proyecto (`generar-zip.ts`).

### 9.3 Los links de 30 días y el registro de cada ZIP

- 🔴 **30 días** (`TTL_LINK_ZIP_SEGUNDOS`), antes **365**. `firmarLote` (`zip-export.ts`) los firma; el `LINK_TTL_SECONDS` de `zip-marca.ts` era un valor **sin lectores** y se retiró con nota. ⚠️ El default de `firmarPath` **sigue en una hora**: eso firma lo que se mira dentro de la app, no lo que sale de la casa.
- 🔴 **Ruta nueva para volver a firmar**: `POST /api/marketing/zip/firmar-de-nuevo` (`{ paths: [] }` → `{ links, fallaron, vencen_en_dias }`), admin y secretaria. **No es una llave maestra**: se rechaza lo vacío, lo absoluto, lo que trae `..` y lo que trae `://` (`esPathFirmable`).
- 🔴 **Cada ZIP que se baja queda anotado**: `POST /api/marketing/zip-marca` guarda el archivo en `marketing/periodos/<id>/<fecha>.zip` y agrega un registro a `mk_periodos.zips_bajados` con `anotarZip`, **releyendo la fila antes de escribir** (la lista es un jsonb: escribir la que uno tenía en la mano borraría lo que otra persona anotó). `lib/marketing/zips-bajados.ts`. **Falla ABIERTA y nunca lanza**: si Storage o la columna fallan, el encargado igual recibe su ZIP. Multifashion no tiene período y no se anota (no es un error). Dos descargas del mismo día escriben el mismo archivo (upsert) y se anotan las dos.

### 9.4 Candado y mutaciones

`src/__tests__/lib/marketing-zip-e-impulsadoras.test.ts` — **23 casos** en 4 bloques (meses sin pagar · el papel de la marca en módulo puro · el Excel armado de verdad contra un doble en memoria de PostgREST · TTL y registro de ZIP). El doble **recorta las columnas al `select`**, así que el caso «sin la migración» prueba el falla-abierto de verdad.

`scripts/_mutar-candados-marketing-zip-e-impulsadoras.sh` — **11 mutaciones + 1 control, 12/12**:

| # | Mutación | Resultado |
|---|---|---|
| 1 | `mesesSinPagar` vuelve a mirar solo 2 meses | 🔴 |
| 2 | la lista deja de venir del más viejo al más nuevo | 🔴 |
| 3 | un mes a medias deja de contar como sin pagar | 🔴 |
| 4 | vuelve la nota interna al subtítulo | 🔴 |
| 5 | deja de limpiarse el nombre de la empresa del concepto | 🔴 |
| 6 | el sufijo de sociedad vuelve a escribirse como venga | 🔴 |
| 7 | el «50 %» vuelve a partir el monto a la mitad | 🔴 |
| 8 | lo que no se reporta vuelve a entrar al ZIP | 🔴 |
| 9 | los gastos dejan de limpiarse | 🔴 |
| 10 | los links vuelven a durar un año | 🔴 |
| 11 | el ZIP guardado cambia de lugar | 🔴 |
| — | control sin mutar | 🟢 23/23 |

**Candado ajeno que cambió de dirección, con nota fechada:** `marketing-zip-marca.test.ts` — el caso «cerrado SIN reporte congelado: el subtítulo LO DECLARA» EXIGÍA la nota interna; hoy exige que **no** esté, y comprueba que el dato sigue del lado de adentro (`fuenteMontos`).

### 9.5 Pendiente de Daniel

1. 🔑 **El pago de abril 2024 de Ana Trejos** (§ 9.1): o son 15 meses que se deben, o está mal fechado. Nadie lo tocó.
2. ⚠️ **Nadie MUESTRA todavía los ZIP anotados**: `mk_periodos.zips_bajados` se llena desde ahora, pero no hay pantalla que liste «lo que ya se le mandó a esta marca» ni botón que llame a `firmar-de-nuevo`. Es la pantalla del período, territorio de la pieza (C).
3. ⚠️ El respaldo del ZIP **por proyecto** (`generar-zip.ts`) lee `se_reporta` si la ruta `datos-zip` lo manda; hoy esa ruta no lo selecciona, así que ahí todo se reporta (falla ABIERTO).

---

## 10. Los tres remates (22-sep-2026) — editar conserva, el mueble tiene foto, el período dice lo que ya se mandó

> Los tres pendientes que dejaron las piezas A, B y D. Ninguno pedía decisión de Daniel. **Nada de lo que se guarda cambió de forma y ningún número cambió.** Interruptores: `MARKETING_PUERTA_GASTO` (1 y 2) y `ZIP_E_IMPULSADORAS_NUEVO` (3) — **no hay uno nuevo**.

### 10.1 Editar un gasto conserva —y deja cambiar— su tienda, su «se reporta» y su nota

🩸 **El defecto.** `updateFactura` y `updateEntrega` ya aceptaban las tres columnas desde la pieza A, pero **ninguna pantalla de edición las preguntaba** y la ruta `PATCH /api/marketing/inventario/entregas/[id]` armaba `{ items, marcas, notas }` a mano, así que ni siquiera las dejaba pasar. Se podía poner la tienda al CREAR el gasto y nunca más corregirla. Peor: `mapEntrega` (`inventario.ts`) **tiraba** las tres columnas al leer, así que la pantalla ni las veía.

🔴 **La regla.** **Lo que no viaja no se pisa.** Una clave ausente queda `undefined` y `columnasDelGasto` no la escribe; la pantalla de antes —que no manda nada— deja la fila exactamente como está. ⚠️ `tiendaCodigo: null` **sí es una decisión** («General»), por eso se mira la PRESENCIA de la clave (`in`) y nunca si el valor es nulo.

**Lo que se tocó.**

- **Puro nuevo:** `lib/marketing/editar-gasto.ts` — `datosDeLaFila` (abre el formulario con el valor de hoy; `esDeTienda` se DERIVA de que haya código; una fila vieja sin columna abre PRENDIDA como el DEFAULT), `cuerpoDeLaEdicion` (lo que la pantalla manda de vuelta), `columnasQueVinieron` / `traeAlgoDelGasto` (solo las claves presentes, ya normalizadas).
- **Servidor:** `PATCH /inventario/entregas/[id]` deja pasar las tres **solo si vinieron**. `PATCH /facturas/[id]` ya reenviaba el cuerpo entero y `updateFactura` solo lee lo conocido: no cambió. `inventario.ts › mapEntrega` ahora las devuelve por `completarGasto` (falla ABIERTA sin la migración).
- **Pantalla:** `BloqueDatosDelGasto` gana `sinMarca` (la edición ya tiene su propio control de marca) y dice **«Hoy: D-24»** cuando de la fila solo viene el código — 🔴 **no busca el nombre en el directorio**: no puede haber una segunda puerta al directorio (candado `un-solo-selector-de-cliente`); la única es el `ClientePicker` de abajo. `FacturaForm` gana `editarDatosDelGasto` y manda `gasto` en `FacturaFormValues`; `FacturasSection` lo pasa y lo reenvía en el PATCH. `EntregaForm` dibuja el bloque cuando hay `initial` y manda `cuerpoDeLaEdicion` en su PATCH.
- **Intacto:** una marca por gasto (`exigirUnaMarca`) y el freno de duplicados, que al editar **se salta la propia fila** (`frenarSiEditarDejaDuplicado` pasa el `id`).

### 10.2 El mueble tiene foto, colgada de la tienda

🩸 **El defecto.** En «＋ Gasto › Mueble entregado» no había campo de foto: sin proyecto, `mk_adjuntos` no tenía de dónde colgarla. La pieza B ya hizo que las fotos cuelguen de la **tienda** (`mk_adjuntos.tienda_codigo`), así que el campo se enchufó.

- La puerta ofrece **«Foto del mueble»** (solo imagen: un PDF ahí no tendría factura y se rechaza con su mensaje). La factura y la impulsadora **no cambiaron**.
- Se sube por `uploadHelpers › subirAdjunto({ tiendaCodigo })`, que ya existía — **no se inventó otro camino de subida** — y **después** de que la entrega quedó guardada: si el gasto no se guarda, no queda una foto suelta. Nunca tumba el guardado (la plata ya está escrita); si falla, se dice en un aviso.
- 🔴 **Con «General» cuelga de `TIENDA_GENERAL`.** Para que esa foto se pueda VER, el cajón «General» dejó de ser una excepción en `/api/marketing/tienda/[codigo]/fotos`: el GET lee `tienda_codigo = 'GENERAL'` (antes contestaba lista vacía) y el POST lo acepta (antes lo rechazaba con 400). `GENERAL` no colisiona con ningún cliente del directorio (los suyos son `D-xx`). `VistaTienda` dibuja las fotos también en «General».

### 10.3 La pantalla del período lista lo que ya se le mandó a la marca

🩸 **El hueco.** La pieza D anota cada ZIP bajado en `mk_periodos.zips_bajados` y guarda el archivo en `marketing/periodos/<id>/<fecha>.zip`… y **ninguna pantalla lo leía**.

- **Puro nuevo:** `lib/marketing/zips-del-periodo.ts` — `zipsDelPeriodo` (normaliza, **el más nuevo arriba**, lo que no sea lista se lee como lista vacía), `hayZipsQueMostrar`, `cuandoSeBajo` (**hora de PANAMÁ**, nunca la del navegador; sin fecha dice «Sin fecha», no inventa «hoy»), `quienLoBajo` (`sistema` no se dibuja), `loQueLlevaba`, `sePuedeVolverAFirmar`, `DIAS_DEL_LINK = 30`.
- **Lectura:** `GET /api/marketing/periodos/[id]` → `{ zips, sinMigracion }`. **Solo lee** esa columna, por `columnas-opcionales.ts`; sin la columna contesta lista vacía.
- **Pantalla:** `ZipsBajados.tsx`, montado en `DetallePeriodoView` (no en los buckets sin período). Cada renglón: fecha y hora de Panamá · quién lo bajó si se anotó · «N gastos · $X» · **«Volver a firmar»**, que llama a `POST /api/marketing/zip/firmar-de-nuevo` y abre el link nuevo — **no vuelve a armar el ZIP**, que tarda y baja todas las fotos.
- 🔴 **Sin ZIPs anotados no se dibuja nada.**

### 10.4 Medido contra producción (22-sep-2026, solo lectura por REST)

| Qué | Número |
|---|---|
| `mk_periodos` | **6** filas, **`zips_bajados = []` en las 6** → hoy la lista nueva **no aparece en ninguna pantalla** |
| `mk_facturas` vivas | 94 · **86 con `tienda_codigo`** · `se_reporta = false`: **0** · `nota`: **0** |
| `mk_entregas_muebles` | 24 · **24 con `tienda_codigo`** · `se_reporta = false`: **0** · `nota`: **0** |
| `mk_adjuntos` tipo `foto_proyecto` | 60, **60 con `tienda_codigo`** (ninguna en «General» todavía) |

Ninguna fila se tocó: los tres remates cambian PANTALLAS y rutas, no datos.

### 10.5 Candado y mutaciones

`src/__tests__/components/marketing-remates.test.tsx` — **19 casos en 4 bloques**: lo que no viaja no se pisa (y `null` sí es «General») · el duplicado al editar no se cuenta a sí mismo · el mueble ofrece foto y cuelga de la tienda con «General» de respaldo · la lista de ZIPs no se dibuja vacía, ordena el más nuevo arriba, dice la hora de Panamá y «Volver a firmar» llama a la ruta correcta.

`scripts/_mutar-candados-marketing-remates.sh` — **8 mutaciones + 2 controles, 10/10**:

| # | Mutación | Resultado |
|---|---|---|
| 1 | `columnasQueVinieron` manda las tres siempre (pisa con `null`) | 🔴 |
| 2 | la ruta de la entrega vuelve a tirar las tres | 🔴 |
| 3 | `datosDeLaFila` abre siempre con «se reporta» apagado | 🔴 |
| 4 | el mueble vuelve a quedarse sin campo de foto | 🔴 |
| 5 | la foto del mueble deja de caer en `TIENDA_GENERAL` | 🔴 |
| 6 | `hayZipsQueMostrar` devuelve siempre `true` (dibuja vacío) | 🔴 |
| 7 | los ZIPs salen del más viejo al más nuevo | 🔴 |
| 8 | al editar, la factura se acusa a sí misma de duplicada | 🔴 |
| — | control sin mutar (×2) | 🟢 19/19 |

### 10.6 Lo que queda dicho

- ⚠️ La **edición vive en la pantalla vieja del proyecto** (`FacturasSection` / `EntregasSection`): la vista de tienda de la pieza B lista los gastos pero todavía no los deja editar. Es una pantalla más, no un pendiente de este encargo.
- ⚠️ El aviso viejo de duplicado **por número** de factura sigue en `FacturaForm` (avisa y deja continuar); el freno del servidor manda igual.

---

## 11. El freno de duplicados deja subir la misma suma para OTRA tienda (23-sep-2026)

> Daniel, textual: *«me debes dejar subir si las facturas suman igual pero cliente es diferente, como en el caso de Impreco a Nova Lux»*.

Impreco (Impresora Comercial) le hace el mismo trabajo, el mismo día y por el mismo monto a dos tiendas distintas. Con la llave del 22-sep-2026 —proveedor normalizado + monto + fecha— la segunda factura **no se podía guardar**: el servidor contestaba 400 y la secretaria quedaba trabada con plata real en la mano.

### Ahora vs después

| | Antes (22-sep-2026) | Después (23-sep-2026) |
|---|---|---|
| Llave del freno | proveedor normalizado + monto + fecha | **+ TIENDA** (`tienda_codigo`; «General» cuenta como una tienda más) |
| Dos números de factura distintos | No importaban: se frenaba igual | 🔴 **Nunca son la misma factura**: no se frena. Si a alguna le falta el número, decide la llave |
| El mismo número con un cero de más | Se frenaba (y se sigue frenando) | Igual: el número se compara **sin los ceros de relleno** (`numeroClave`) |
| El mensaje | «Ya existe un gasto de X por $Y del Z (N° …)» | «Ya existe un gasto de X por $Y del Z **para \<tienda\>** (N° …). No se guarda dos veces.» |
| Al EDITAR | Se volvía a preguntar si cambiaba proveedor, fecha o monto | También si cambia la **tienda** o el **número** |

### Lo que se tocó

- **Puro:** `lib/marketing/duplicado.ts` — `HuellaDeGasto` gana `tienda` y `numero`; nuevas `tiendaClave` · `numeroClave` · `numerosSeContradicen`; `claveDeDuplicado` termina en `|TIENDA`; `mensajeDuplicado` dice para qué tienda. `TIENDA_GENERAL` se importa de `gasto.ts`, **no se redefine**.
- **Servidor:** `puerta-gasto-server.ts › frenarFacturaDuplicada` lee `tienda_codigo` con `conRespaldoSinColumnas` (**falla ABIERTA**: sin la columna todo cuenta como «General» y el freno queda más suelto, nunca más apretado). `frenarPagoDuplicado` no cambia de comportamiento: la «tienda» de un pago **es la impulsadora** (la lectura ya se acota a la suya), y el mensaje sale sin ese identificador interno.
- **`mutations.ts`:** `createFactura` manda `tienda` y `numero`; `frenarSiEditarDejaDuplicado` lee `numero_factura` y `tienda_codigo` (con respaldo) y el disparo del freno suma `payload.tienda_codigo` y `payload.numero_factura`.
- ⚠️ **El mueble no tiene freno de duplicados y sigue sin tenerlo**: no tiene proveedor, y sin proveedor `claveDeDuplicado` no afirma nada. Las puertas con freno son dos: factura y pago de impulsadora.

### Medido contra producción (solo lectura por REST, 23-sep-2026)

111 facturas · **96 vivas** · **79 vivas que no son pagos de impulsadora**.

| | Grupos repetidos | Facturas |
|---|---|---|
| Llave vieja (proveedor + monto + fecha) | **5** | 10 |
| Llave nueva (+ tienda, + número distinto) | **1** | 2 |

El que **sigue frenado**: Confecciones Boston, $6.163,20 del 10-sep-2026, las dos en «General» y con el mismo número escrito con un cero de más (`11-00007766` / `11-000007766`) — exactamente el caso que el freno nació para atajar.

Los **cuatro que dejan de estar trabados**:

| Proveedor | Monto | Fecha | Tiendas | N° | Por qué entra |
|---|---|---|---|---|---|
| Krysthel Yanneth Morales Martínez | $963,00 | 27-jun-2025 | D-80 Jerusalem De Panamá · **D-25 City Mall Paso Canoa** | 40 / 40 | **Tienda distinta** |
| Krysthel Yanneth Morales Martínez | $214,00 | 27-jun-2025 | D-25 City Mall Paso Canoa · **D-166 Zona Sur Dutty Free** | 39 / 39 | **Tienda distinta** |
| Krysthel Yanneth Morales Martínez | $1.070,00 | 18-dic-2025 | D-80 (las dos) | 81 / 82 | **Número distinto** |
| Impresora Comercial | $55,64 | 8-abr-2026 | D-156 (las dos) | 63894 / 63895 | **Número distinto** |

🔑 **La factura de Impreco a Nova Lux (D-170) no está en la base**: el freno la rechazó, por eso Daniel la reclamó. Lo que sí quedó medido son los dos casos de Krysthel, que tienen exactamente esa forma —mismo proveedor, mismo monto, mismo día, dos tiendas— y hoy estaban trabados. ⚠️ **Nada se tocó ni se limpió**: los 5 grupos siguen en la base tal cual.

### Candado y mutaciones

`src/__tests__/lib/marketing-cimiento.test.ts` (bloque 4, ahora con 4 casos nuevos) y `src/__tests__/components/marketing-puerta-gasto.test.tsx` (bloque 5): la llave termina en la tienda, otra tienda entra, «General» es una tienda más, dos números distintos entran, el mismo número con un cero de más se frena, sin número decide la llave, el mensaje dice para qué tienda, y las puertas del servidor mandan tienda y número.

| # | Qué se rompió | Resultado |
|---|---|---|
| M1 | `claveDeDuplicado` sin la tienda | 🔴 3 rojos |
| M2 | `numerosSeContradicen` siempre `false` | 🔴 2 rojos |
| M3 | `createFactura` deja de mandar `tienda` | 🔴 2 rojos |
| — | control sin mutar | 🟢 74/74 |

### Lo que queda dicho

- ⚠️ El aviso viejo por **número exacto** en `FacturaForm` (avisa y deja continuar) sigue donde estaba; ahora coincide con el servidor: dos números distintos ya no frenan.
- ⚠️ El número se compara **sin ceros de relleno**; si algún proveedor usara el cero como parte del número («007» ≠ «7»), los tomaría como el mismo. No pasa en las 111 facturas medidas.

---

## 12. Tiendas y Marcas — la estructura nueva (23-sep-2026)

> Daniel, textual, el 23-sep-2026: el gasto *«se registra cuando llega la factura del proveedor»*; a la marca se le pasa *«cada 6 meses»*; *«no quiero que se enfoque el módulo en [el cobro], sino en registrar bien los gastos para pasárselos a la marca»*; las impulsadoras *«se le reportan a la marca»*; el mueble se cobra *«al precio reportado»*; lo ven *«contabilidad, admin y secres»*; Multifashion *«se queda aparte, nunca se le cobra a una marca»*. Mockups aprobados: `marketing-estructura.html` (portada Tiendas | Marcas, camino, marca) y `marketing-tienda.html` (la ficha como UNA lista).

**Interruptor:** `MARKETING_TIENDAS_Y_MARCAS` en `src/lib/marketing/tiendas-y-marcas.ts`, **hoy `true`**. En `false`: la portada Abiertos | Cerrados con Herramientas y «Reportes», la vista de tienda por marca (`VistaTiendaAnterior.tsx`) y el overlay del proyecto, intactos. **Nada de lo que se guarda cambia de forma.**

### Ahora → después, pantalla por pantalla

| Pantalla | Antes (23-sep, revisión con 28 capturas) | Después |
|---|---|---|
| **Portada** `/marketing` | Abiertos \| Cerrados por marca + tarjeta «Herramientas» (Multifashion, Mobiliario, Impulsadoras, Reportes). Ninguna tienda tocable; a un cliente solo se llegaba por ⌘K. | **Tiendas · Marcas · Impulsadoras · Mobiliario** (`?tab=`, `replace`). Abre en **Tiendas**: las 16 tiendas con gasto + «General», nombre del DIRECTORIO por código, lo reportado como único monto, el desglose por marca en gris, buscador arriba (solo filtra), y **cada fila es un `<a>` a `/marketing/tienda/<código>`**. Multifashion es una fila más («tienda propia · no se le pasa a ninguna marca»). **Marcas** = la portada Abiertos \| Cerrados de la pieza C sin Herramientas. **Reportes desapareció** (patrón `mayor_lineas`: `ReportePorMarcaView`/`ReportePorTiendaView` y sus rutas se quedan sin puerta; `?vista=reportes` cae en Tiendas). UN botón «＋ Gasto». |
| **Ficha de la tienda** `/marketing/tienda/[codigo]` | Una tabla POR MARCA (Tipo · Proveedor · Detalle · Fecha · Período · Monto), sin editar ni anular, «＋ Gasto» preguntaba la tienda de nuevo, «Sube fotos del proyecto». | **UNA tabla por fecha** con facturas + muebles + pagos de impulsadora: Fecha · Gasto (línea gris «factura N° · subtotal + ITBMS» / «mueble · precio reportado» / «pago de impulsadora · mes») · Marca · Total · PDF · «···». Cabecera con **Total reportado** y cuánto por marca; chips Todos · por marca · **Anulados** (plegados, nunca suman); lo no reportado en gris sin sumar; pie «N gastos · N facturas $X · N muebles $Y · N pagos $Z» y el total. **Editar y anular se hacen AQUÍ** (`FichaTiendaAcciones.tsx`: `FacturaForm` + PATCH/PUT de siempre, `EntregaForm` + PATCH, POST `anular` con motivo, DELETE del mueble que devuelve el stock, «Restaurar» una anulada). «＋ Gasto» abre **con la tienda puesta**; «Excel» (por `workbookBlob`); «Fotos · N»; «Sube fotos de la tienda». |
| **Marca** `/marketing/[marca]` | Con un período saltaba al nivel 3; adentro, la lista de PROYECTOS con «Editar», «Descargar ZIP», «Registrado por error», el overlay del proyecto («Remodelacion», «este proyecto trabaja 2 marcas… no está duplicado», «+ Agregar factura» que caía en General). | **El período abierto con su total y UNA línea por tienda** (indentada, cada una `<a>` a la ficha), ZIP · Cerrar en la fila, LoQueFalta y los ZIPs bajados; los cerrados con el nombre del cierre, «parte Tommy · el resto de Calvin», fecha y nota de crédito, ZIP · Excel. **Sin lista de proyectos, sin overlay**: un `?proyecto=<id>` viejo **redirige** a la ficha de la tienda del proyecto (`useRedirigirProyectoViejo` → `destinoDelProyectoViejo`; sin código → General; «Multifashion Holdings» por texto → D-108). `/marketing/multifashion` redirige a la ficha D-108. Nivel 3 (`[periodo]`) lista tiendas en vez de proyectos y sin buscador. |
| **Mobiliario** | «← Proyectos»; Resumen por tienda con 13 filas y 0 enlaces, nombre del proyecto. | «‹ Marketing»; cada tienda del resumen es un `<a>` a su ficha y el nombre sale del directorio (`/api/marketing/tiendas`); el módulo no cambió nada más (Daniel: no se toca). |

### Los 7 defectos de la revisión, uno por uno

| # | Defecto | Qué se hizo |
|---|---|---|
| a | Ninguna fila de tienda llevaba a la ficha | Portada Tiendas, líneas por tienda de la marca (niveles 2 y 3) y Mobiliario enlazan a `hrefDeTienda` (`FilaNivel` ganó `href` y se dibuja como `<a>`). |
| b | Reportes le cobraba Multifashion a PVH | **UNA regla** (`gastoEsDeMultifashion`: por `tienda_codigo` D-108 o por el proyecto) en el reporte por marca (`sinMultifashion`), el agregador (`tiendasMultifashion`), la marca y el ZIP (`esGastoMultifashion`). Medido: Tommy **$116.675,66** y Calvin **$73.782,95** en portada, marca y reporte. |
| c | La factura de $2.307,32 (Impresora Comercial, proyecto «Multifashion Holdings» sin código) caía en «General» | Migración `20261218120000_marketing_huerfana_multifashion_toma_su_tienda.sql`, **ESCRITA y NO aplicada**: UPDATE por id, 1 fila, `tienda_codigo = 'D-108'` solo si sigue NULL. |
| d | Reportes abría en 2026 y escondía City Mall David | Reportes se fue; la portada Tiendas es «Todos» siempre (`reportePorTiendaRediseno()` sin año). |
| e | «+ Agregar factura» del overlay viejo mandaba el proyecto y no la tienda | Se fue con el overlay; el único camino es «＋ Gasto». |
| f | Textos de «proyecto» en pantalla | «← Proyectos» → «‹ Marketing»; «Sube fotos del proyecto» → «Sube fotos de la tienda»; el buscador «Buscar por proyecto…» no se dibuja con las líneas por tienda; «Este proyecto también tiene…» se fue con el overlay. |
| g | Tres nombres para la misma tienda | El nombre sale SIEMPRE de `clientes_master` por código: portada Tiendas y reportes (`cargarGastosDelRediseno`), líneas por tienda (`nombresDeTienda` en `proyectos-lista`), Mobiliario (`/api/marketing/tiendas`). Falla ABIERTA al texto de antes si la lectura se cae. |
| h | Contabilidad no entraba | `lib/marketing/roles.ts`: `ROLES_MARKETING` (admin · secretaria · contabilidad) para LEER, `ROLES_MARKETING_ESCRITURA` (admin · secretaria) para escribir; `puedeEscribirMarketing` esconde «＋ Gasto», «···», Cerrar, ZIP, Excel. 16 rutas GET aceptan contabilidad; las que escriben contestan **403**. `modules.ts`: `marketing.roles` gana contabilidad y `MODULO_HEREDA_PERMISO_DE.marketing = "gastos-contabilidad"` enciende la ficha ANTES de la migración. Migración `20261218120100_marketing_para_contabilidad.sql`, **ESCRITA y NO aplicada**: `role_permissions.contabilidad` gana `marketing`, 1 fila, idempotente. |

### Medido contra producción (solo lectura por REST, 23-sep-2026) — ANTES y DESPUÉS

111 facturas (96 vivas, 15 anuladas) · 24 entregas (0 sin proyecto, 0 sin tienda) · 24 facturas vivas sin proyecto (22 sin tienda: 17 impulsadoras + 4 muebles Boston + la huérfana) · 0 apagadas · 0 con más de una marca · 16 tiendas con gasto + General.

| Qué | Antes (portada / ficha / Reportes) | Después (Tiendas · ficha · marca) | Cambia |
|---|---|---|---|
| City Mall David D-24 | $37.460,92 | **$37.460,92** | no |
| Jerusalem De Panama D-80 | $35.719,70 | **$35.719,70** | no |
| Nova Lux D-170 | $12.649,97 (la doc del 22-sep decía $12.261,16: subieron 3 facturas el 23) | **$12.649,97** | no |
| City Mall Paso Canoa D-25 | $10.509,75 | **$10.509,75** | no |
| Multifashion D-108 | portada $8.061,63 · ficha $5.754,31 | ficha **$5.754,31** hoy → **$8.061,63** con la migración (c) | solo con (c) |
| General | $37.778,12 | **$37.778,12** hoy → $35.470,80 con (c) | solo con (c) |
| Suma de tiendas | $200.060,24 | **$200.060,24** | no |
| Tommy Hilfiger | portada $116.675,66 · Reportes $117.994,91 | **$116.675,66** en todas | Reportes −$1.319,25 (decisión de Daniel) |
| Calvin Klein | portada $73.782,95 · Reportes $76.260,53 | **$73.782,95** en todas | Reportes −$2.477,58 (decisión de Daniel) |
| Joybees | $1.540,00 | **$1.540,00** | no |
| Multifashion (marcas) | $8.061,63 | **$8.061,63** | no |
| **Cuadre** | — | tiendas $200.060,24 = marcas $191.998,61 + Multifashion $8.061,63 + no reportado $0 | ✔ |

Los tres «cambios» del agregador son de REGLA y no mueven un centavo hoy: Multifashion también por `tienda_codigo` (los 9 gastos de D-108 tienen proyecto), un mueble sin proyecto cuenta en su marca (0 muebles sin proyecto), y el ZIP aplica lo mismo.

### Lo que se tocó

- **Puro nuevo:** `lib/marketing/tiendas-y-marcas.ts` (interruptor · pestañas · `esTiendaMultifashion`/`gastoEsDeMultifashion`/`sinMultifashion` · `filasDeTiendas`/`filtrarTiendas`/`subtituloDeTienda` · `destinoDelProyectoViejo`/`destinoDeVistaVieja` · la ficha: `chipsDeLaFicha`, `filasVisibles`, `lineaDelGasto`, `pieDeLaFicha`, `totalPorMarca`, `textoDelPie`), `lib/marketing/roles.ts`.
- **Agregador:** `resumen-bloques.ts` gana `tiendasMultifashion`, `contarEntregasSinProyecto` y **`detalleTiendas`** (acumulado en la MISMA llamada que `detalle`); `lista-por-periodo.ts › SeccionPeriodo.tiendas`; `proyectos-lista` e `inicio` leen `tienda_codigo` y pasan las banderas; `reportes.ts` marca `esTiendaPropia` y resuelve nombres del directorio; `zip-marca.ts` aplica la misma regla.
- **Rutas:** nueva `GET /api/marketing/tiendas` (= reporte por tienda, año Todos); `GET /api/marketing/inventario/entregas/[id]` (para editar el mueble desde la ficha, `getEntregaById`); `datos.ts` de la tienda devuelve `filas` y `anuladas` con N°, subtotal, ITBMS, PDF, mes; 16 GET con `ROLES_MARKETING`.
- **Pantallas:** `page.tsx` (dos pantallas en el archivo: `MarketingPage` y `MarketingPageDeAntes`), `PortadaTiendasYMarcas.tsx`, `PortadaTiendas.tsx`, `PaginaMarca.tsx` (+ `TiendasDelPeriodo`), `useProyectoViejo.ts`, `tienda/[codigo]/{VistaTienda,FichaTienda,FichaTiendaAcciones,VistaTiendaAnterior}.tsx`, `excel-de-la-tienda.ts`; `[marca]/page.tsx`, `[marca]/[periodo]/page.tsx`, `DetallePeriodoView` (líneas por tienda + `soloLectura`), `PortadaAbiertosCerrados` (`sinHerramientas`, `sinBotonDeGasto`), `FilaNivel` (`href`), `FotosSection`, `mobiliario/page.tsx`, `inventario-resumen.ts` (`tiendaCodigo`), `modules.ts`.
- **Se conserva tal cual:** «＋ Gasto» con sus tres formularios, el freno de duplicados por tienda (servidor), el cierre con nombre y nota de crédito, el ZIP y los links de 30 días, Impulsadoras, Mobiliario.

### Candado y mutaciones

`src/__tests__/components/marketing-tiendas-y-marcas.test.tsx` — **19 casos en 7 bloques, DOM**, con los números reales del 23-sep-2026 adentro: la portada abre en Tiendas con 16 + General y cada fila enlaza · el buscador solo filtra · `?vista=reportes` cae en Tiendas · Mobiliario lleva a su página · Multifashion en Tiendas y en ninguna marca (reporte, agregador con gasto de D-108 sin proyecto, líneas por tienda) · Tommy $116.675,66 / Calvin $73.782,95 y tiendas = marcas + Multifashion · la ficha es UNA tabla con los tres tipos y el pie cuadra · «＋ Gasto» con la tienda puesta · «···» edita y anula por las rutas de siempre · `?proyecto=` viejo redirige · contabilidad: ficha con y sin migración, sin botones, GET 200 y POST 403 · interruptor `false` = como antes.

Candados ajenos que **cambiaron de forma, no de dirección**, con nota fechada: `navegacion-atras-fluido` (dos `router.replace` en `page.tsx`, los dos de enlaces viejos), `marketing-lista-por-periodo` (`anotarDetalle` ganó la tienda), `marketing-vista-tienda` (la vista son DOS pantallas), `marketing-inicio-marcas` y `marketing-direcciones-que-llegan` (vigilan la pantalla DE ANTES). `marketing-portada-y-cierre` exige que `reportes-rediseno.ts` no nombre a Multifashion: por eso el campo se llama `esTiendaPropia` y la regla vive afuera.

Mutaciones a mano (romper → ROJO → restaurar):

| # | Mutación | Resultado |
|---|---|---|
| 1 | `filasDeTiendas` deja de poner `href` (las filas no enlazan) | 🔴 3 casos |
| 2 | `sinMultifashion` deja de filtrar (Multifashion vuelve a Tommy y Calvin) | 🔴 1 caso |
| 3 | el agregador ignora `tiendasMultifashion` (D-108 sin proyecto cae en su marca) | 🔴 1 caso |
| 4 | la ficha dibuja una segunda tabla (una por marca) | 🔴 2 casos |
| 5 | `puedeEscribirMarketing` deja pasar a contabilidad | 🔴 2 casos |
| — | control sin mutar | 🟢 19/19 |

Candados ajenos que cambiaron de forma por la key nueva de contabilidad, con nota fechada: `saldos-banco-modulo` (la lista cerrada de herencias gana `marketing → gastos-contabilidad`, y los módulos de contabilidad ganan `marketing`), `catalogo-roles` y `data-health-dentro-de-usuarios` (los módulos por defecto de contabilidad), `excel-encabezados-fila-1` (31 → 32 lugares que arman una hoja: el Excel de la ficha), `iphone-targets-operacion` (obligó a subir la letra de la cabecera de la ficha a `text-xs`).

### Pendiente o dudoso

- ⚠️ **Impulsadoras y Mobiliario** siguen dibujando sus botones de escritura a contabilidad; el servidor los rechaza (403). Esconderlos es una pasada por esas dos pantallas, que Daniel dijo no tocar.
- ⚠️ Un pago de impulsadora se **anula** desde la ficha pero se **edita** desde Impulsadoras (ahí vive su historial).
- ⚠️ El nivel 3 de un período (`/marketing/[marca]/[periodo]`) sigue existiendo para los cerrados; el abierto se ve entero en la marca.
- 🔑 Las dos migraciones las aplica Daniel: (c) mueve $2.307,32 de «General» a D-108 en la ficha; (h) le pone la key a contabilidad (la ficha ya se enciende por herencia).

### Lo que decía CLAUDE.md hasta el 23-sep-2026 (verbatim, podado ese día)

### Marketing › el rediseño (22-sep-2026) — [docs/postmortems/marketing-rediseno.md](docs/postmortems/marketing-rediseno.md)

- 🔴 **El cimiento está puesto y las pantallas NO** (pieza 1 de 5): un gasto es factura · mueble · impulsadora con **UNA marca** (`exigirUnaMarca`, enchufada en las tres puertas), su **tienda** del directorio o «General» (**el proyecto se va**, Daniel: *«a) Basta la tienda»*), y **`se_reporta`** prendido por defecto (apagado no suma ni va al ZIP). Módulos puros en `lib/marketing/{gasto,proveedor,duplicado,periodo-estado,agrupar-por-tienda,columnas-opcionales}.ts`; duplicado = proveedor NORMALIZADO + monto + fecha + **TIENDA** («General» es una tienda más) y **no se guarda**, salvo que las dos facturas traigan **números distintos** —nunca son la misma— (23-sep-2026, Daniel: *«me debes dejar subir si las facturas suman igual pero cliente es diferente»*); el período tiene DOS estados y la nota de crédito es TEXTO sin cálculo.
- 🔴 **Migraciones `20261216120000` y `20261216120100` APLICADAS el 22-sep-2026** (86 facturas · 24 entregas · 60 adjuntos tomaron la tienda de su proyecto; 22 facturas sin tienda: 17 de impulsadoras sin proyecto, 4 muebles Boston sin proyecto, 1 con proyecto sin tienda): aditivas, COPIARON la tienda del proyecto y **el código falla ABIERTO sin ellas**. 🩸 «Eliminar definitivamente» se retiró (rutas 403) y `mk_proyecto_marcas` quedó sin lectores (`congelada`, no se dropea). El reparto para las piezas A–D vive en el postmortem. Candado: `marketing-cimiento`.
- 🔴 **SE ENTRA POR LA TIENDA, Y «NOVA» YA NO TRAE «RENOVACIÓN»** (pieza B): `/marketing/tienda/<código>` muestra TODO lo suyo agrupado **por marca** —facturas, muebles, impulsadoras y fotos—, con el total **solo de lo reportado** (lo apagado se ve en gris y no suma); la tienda se resuelve **por CÓDIGO** de `clientes_master` y «General» tiene su vista. El resultado de **⌘K** lleva ahí, y el texto se compara **por palabra** (medido: «nova» pasaba de 2 proyectos a 1, «d» de 21 a 6; el **número de factura sigue por subcadena** —79 de 108 con ceros al frente—). Interruptor `VISTA_TIENDA` (`lib/marketing/vista-tienda.ts`, hoy `true`). Candado: `marketing-vista-tienda`.
- 🔴 **UNA PUERTA «＋ Gasto», TRES FORMULARIOS, Y EL DUPLICADO NO ENTRA** (pieza A): pregunta QUÉ es (factura · mueble · impulsadora, derivados de `gasto.ts`), después la **marca (UNA, obligatoria)**, la **tienda del directorio o «General»** (obligatoria si es de una tienda; desde una tienda ya elegida no se pregunta), **«Se reporta a la marca» prendida** y la nota; el botón apagado dice **«Falta: la marca y la tienda»**. La marca viaja **con la factura** (`marcaId`, 400 antes de escribir) y `se_reporta` · `tienda_codigo` · `nota` entran por `columnasDelGasto` en las TRES puertas; el proveedor se **sugiere** del histórico, nunca lista cerrada; **el freno de duplicados es del SERVIDOR** (proveedor normalizado + monto + fecha → 400 `duplicado`, en impulsadora la fecha es `periodo_desde`). Sin proyecto: `proyecto_id = null`. Interruptor `MARKETING_PUERTA_GASTO` (`lib/marketing/puerta-gasto.ts`, hoy `true`). Candado: `marketing-puerta-gasto`.
- 🔴 **ABIERTOS | CERRADOS, Y CERRAR ES PONERLE EL NOMBRE** (pieza C): la portada tiene DOS pestañas —por marca, su período abierto con **lo reportado como único monto**, lo apagado en gris sin sumar y «N días abierto»; en Cerrados, el **nombre que se le puso al cerrar**, la fecha y la nota de crédito—, **sin tarjeta de Multifashion** (es una tienda; se enlaza en Herramientas; 🔴 **sus $8.061,63 NUNCA se le cobran a una marca — decisión de Daniel, 22-sep-2026: *«b) No, nunca»*; no se vuelve a preguntar**) y **sin total del grupo**. Cerrar pide el **nombre obligatorio** y la **nota de crédito como TEXTO**, sella lo del período, **no escribe `reporte`** y abre el siguiente con `abrirSiguiente` («Desde el …», `hoyPanama()`). Reportes **por marca y por tienda** con la marca y la tienda **del GASTO**, solo `se_reporta`, una marca = 100 %, sin pie; 🩸 «Por proyecto» (ruta **410**) y «Exportar Excel» se retiraron. ⚠️ Pendiente de Daniel: si los $8.061,63 de Multifashion entran al período de su marca. Interruptor `MARKETING_PORTADA_REDISENO` (`lib/marketing/portada-rediseno.ts`, hoy `true`). Candado: `marketing-portada-y-cierre`.
- 🔴 **UN PERÍODO CERRADO ES UNA FILA, AUNQUE LO COMPARTAN DOS MARCAS** (22-sep): «mid 2026» es de **PVH** (la casa de Tommy y Calvin) y se veía DOBLE, con «Cerrados 2». Hoy va UNA fila —«mid 2026 · PVH», con los DOS montos, cada uno con su marca y su propia puerta— y la pestaña cuenta PERÍODOS; adentro de la marca dice «parte Tommy Hilfiger · el resto es de Calvin Klein», con SU monto. 🔴 **Nunca se suman** (el grupo no tiene `total`); las marcas salen de los DOCUMENTOS y el nombre de la casa de una tabla chica (`cerrados-por-periodo.ts`). Candado: `marketing-cerrados-por-periodo`.
- 🔴 **NINGÚN MES SIN PAGAR SE ESCONDE, Y EL PAPEL DE LA MARCA SALE LIMPIO** (pieza D): la tarjeta de una impulsadora lista **TODOS los meses sin pagar desde el primer pago**, el más viejo arriba (miraba DOS y desaparecía lo viejo; medido: Ana Trejos **24 meses**, Cindy **4**), y «Registrar pago» abre en el más viejo. El Excel del ZIP pierde la **nota interna** («este período se cerró sin reporte guardado», 1 celda del archivo real de Tommy), el **nombre de las empresas del grupo en el concepto** —derivado de `EMPRESA_KEY_TO_NAME` + `EMPRESA_FISCAL`, **nunca el proveedor**: Boston fabrica— y deja **UNA grafía por proveedor** (el sufijo de sociedad iba de 4 formas a 2, 19 de 40 celdas); entra **solo lo que `se_reporta`** y **una marca = 100 %** (ningún monto se movió). Los links firmados duran **30 días**, no un año, con `POST /api/marketing/zip/firmar-de-nuevo`, y **cada ZIP que se baja se guarda** en `marketing/periodos/<id>/<fecha>.zip` y se anota en `mk_periodos.zips_bajados` releyendo la fila (falla ABIERTA: la descarga sale igual). Interruptor `ZIP_E_IMPULSADORAS_NUEVO` (`lib/marketing/zip-e-impulsadoras.ts`, hoy `true`). Candado: `marketing-zip-e-impulsadoras`.
- 🔴 **EDITAR UN GASTO CAMBIA SU TIENDA, EL MUEBLE TIENE FOTO Y EL PERÍODO DICE LO QUE YA SE MANDÓ** (los tres remates, 22-sep): al editar salen **tienda · «se reporta» · nota** con su valor de hoy y **lo que no viaja no se pisa** (un `null` SÍ es «General»); el duplicado al editar **no se cuenta a sí mismo**; la foto del mueble cuelga de la **tienda** (`TIENDA_GENERAL` si es «General») y se sube **después** de guardar; y la pantalla del período lista los ZIPs de `mk_periodos.zips_bajados` con **«Volver a firmar»** (30 días) — 🔴 **sin ZIPs anotados no se dibuja nada** (hoy los 6 están en `[]`). Candado: `marketing-remates`.

---

## 13. El período manda — Abierto · cada cierre · Todos, y los anulados desaparecen (23-sep-2026)

> Daniel, con el mockup aprobado (`marketing-periodos.html`): *«arriba eliges el período, abajo ves lo de ese período»*; sobre los anulados: *«se elimina y listo… con seguro de que escriban ELIMINAR»*.

**Interruptor:** el existente, `MARKETING_TIENDAS_Y_MARCAS` (`lib/marketing/tiendas-y-marcas.ts`, hoy `true`). Sin uno nuevo. En `false`: la vista de tienda por marca de antes, sin barra; `/api/marketing/tiendas` contesta 404; el cron no borra nada. Nada de lo que se guarda cambia de forma, salvo el borrado a los 90 días.

### La regla

Los períodos son de cada MARCA (`mk_periodos.proveedor_key`: Tommy cierra el suyo, Calvin el suyo) y una tienda mezcla marcas. Por eso el primer chip no es «Período 2026» a secas: es **«Abierto»** —todo gasto que no tiene un sello a un período CERRADO, de cualquier marca— y después cada cierre con su nombre y su casa («mid 2026 · PVH», como en `cerrados-por-periodo.ts`), y **«Todos»** al final. Un gasto con un sello a un cerrado pertenece a ESE cerrado, aunque además lleve un sello a un abierto (medido: la factura de Impreco de D-118 lleva DOS sellos a «mid 2026», y hay entregas con sello a un abierto y a un cerrado). Lo decide quien lee la base (`datos.ts` para la ficha, `reportes.ts › cargarGastosDelRediseno` para la portada); el módulo puro `lib/marketing/periodo-manda.ts` solo parte, agrupa y rotula. **Lo que suma sigue siendo `periodo-estado.ts`.**

### Ahora → después

| Pantalla | Antes | Después |
|---|---|---|
| **Ficha de la tienda** `/marketing/tienda/[codigo]` | Una lista con TODO lo de la tienda mezclado: lo ya pasado a la marca en «mid 2026» junto a lo que Daniela está trabajando, sin que nada lo dijera. Chips Todos · por marca · **Anulados** (plegados, con «Restaurar»). Pie «N gastos · N facturas $X · N muebles $Y». | Barra **Abierto · N** · **mid 2026 · PVH · N** · **Todos · N** arriba de los KPIs; abre en **Abierto**. Los KPIs (total · por marca · gastos), los chips de marca («Todas las marcas» · por marca) y la tabla son SOLO del período elegido; el pie dice **«N gastos · irán al próximo ZIP de Calvin Klein y de Tommy Hilfiger»** (Abierto), **«ya pasados a la marca en «mid 2026 · PVH»»** (un cerrado) o **«N gastos en M períodos»** (Todos). En **Todos**, la tabla se agrupa por período —el más nuevo arriba— con cabecera y subtotal por bloque («Abierto · aún no pasado a la marca · 2 gastos», «mid 2026 · PVH · cerrado el 11 ago 2026 · 2 gastos»), lo cerrado en gris. El Excel baja el período que se mira. El período vive en la URL (`?periodo=`, `replace`). **Sin chip «Anulados», sin «Restaurar».** |
| **Lista de Tiendas** (portada) | «Todos» siempre, sin pie. | La MISMA barra; con Abierto cada tienda muestra su total abierto y su desglose por marca; con un cerrado, lo de ese período; Todos, la suma. Pie: **«Abierto · lo que irá al próximo ZIP · N tiendas»** y el total de las tiendas que se ven. Una tienda sin nada en el período no aparece. |
| **Anular** («···» › Eliminar) | Modal con motivo obligatorio; quedaba plegada en «Anulados» con «Restaurar». | `ConfirmarEliminar`: el botón rojo se prende solo al escribir **ELIMINAR** (exacto; `confirmaEliminar`), porqué OPCIONAL (sin él viaja «Eliminado desde la ficha de la tienda»: la ruta lo exige). **Misma ruta** (`POST …/anular`). El gasto **desaparece de todas las pantallas** (el servidor de la ficha solo manda vivas; el historial de la impulsadora dibuja solo vigentes); la fila queda con `anulado_en`, recuperable solo por la base. Eliminar un mueble (DELETE que devuelve el stock, como siempre) también pide la palabra. |
| **Cron `cleanup-marketing-anulados`** | No existía: un anulado vivía para siempre. | Diario **03:40 UTC** (UNA entrada en `vercel.json`, `SEED_TOLERANT_CRONS`, `docs/crons.md`), patrón de `cleanup-depurador-archivos`: `anulado_en < medianoche de Panamá de hace 90 días` (`corteDeAnulados(hoyPanama())`), ≤500 por corrida, **por lista de ids**: quita los archivos de sus adjuntos del bucket `marketing`, sus sellos en `mk_periodo_documentos` (no cascadean: es polimórfica) y la fila (`mk_adjuntos` y `mk_factura_marcas` cascadean). ⚠️ **`mk_entregas_muebles` NO tiene `anulado_en`** (medido): los muebles se eliminan directo desde la ficha; el cron lo intenta, lo dice y sigue (falla ABIERTA por `esColumnaAusente`). Sin Telegram inmediato: rastro en `cron_email_errors` y el vigía de heartbeats. |

### Medido contra producción (solo lectura por REST, 23-sep-2026) — ANTES y DESPUÉS

96 facturas vivas · 24 entregas · 200 sellos · UN período cerrado («mid 2026», `pvh`, cerrado el 12-ago-2026 01:20 UTC = 11 ago en Panamá) · 15 facturas anuladas.

| Tienda | Antes (ficha, Todos) | Después: Abierto | Después: mid 2026 · PVH | Después: Todos | Cambia |
|---|---|---|---|---|---|
| Outlet Duty Free N3 (D-118) | $6.472,53 (4) | **$1.771,27 (2)** | **$4.701,26 (2)** | **$6.472,53 (4)** | no |
| Nova Lux (D-170) | $12.649,97 (7) | $12.649,97 (7) | — (no aparece) | $12.649,97 (7) | no |
| City Mall David (D-24) | $37.460,92 (9) | — (nada abierto) | $37.460,92 (9) | $37.460,92 (9) | no |
| Multifashion (D-108) | $8.061,63 (9) | $8.061,63 (9) | — | $8.061,63 (9) | no |
| **Portada (suma de tiendas)** | $200.060,24 (17 tiendas) | $59.493,67 (5 tiendas) | $140.566,57 (14 tiendas) | **$200.060,24 (17)** | no |

🔴 **El mockup y el encargo decían Abierto $6.401,27 (3) · mid 2026 $71,26 (1) para D-118, y NO es así.** El mueble de $4.630 (entrega ME-0014, 22 jun 2026) lleva sello a «mid 2026» (`proveedor_key = TH`, sellado el 12-ago-2026 03:21 UTC) **y está en el ZIP real de ese cierre** (`zip-gastos-del-periodo-cerrado-tommy-hilfiger.zip › Outlet Duty Free N3, S.A./facturas/2026-06-22 · Entrega de mobiliario ME-0014 · Tommy Hilfiger.pdf`, y `resumen_gastos.xlsx` trae el 4630): ya se le pasó a Tommy. Ponerlo en «Abierto» lo mandaría en el PRÓXIMO ZIP por segunda vez. Se siguió la definición del encargo («sellado en un período cerrado») y los datos; el total de la tienda no cambia.

Anuladas: **15**; con el corte de hoy (`2026-06-25T05:00:00Z`) **14 se borrarían en la primera corrida** (las de abril, mayo y junio) y la de Nova Lux del 23-sep se queda hasta el 22-dic-2026. Doce de las 14 tienen sello a «mid 2026»: el cron los borra con la fila. El cron **no se ejecutó a mano**.

### Lo que se tocó

- **Puro nuevo:** `lib/marketing/periodo-manda.ts` (`chipsDePeriodos` · `periodoElegido` · `gastosDelPeriodo` · `bloquesPorPeriodo` · `cabeceraDelBloque` · `rotuloDelKpi` · `textoDelPieDelPeriodo` · `textoDelPieDeTiendas` · `tiendasPorPeriodo` · `filasDeTiendasDelPeriodo` · `totalDeTiendas` · `DIAS_PARA_BORRAR_ANULADOS` · `PALABRA_PARA_ANULAR` · `confirmaEliminar` · `corteDeAnulados` · `anuladoCaduco`).
- **Servidor:** `datos.ts` (solo vivas SIEMPRE; `periodo` por fila con el cerrado ganando; `nombre_al_cerrar` por `conRespaldoSinColumnas`), `reportes.ts` (`periodo` por gasto leyendo los sellos de los cerrados con `leerTodoPaginado`; `tiendasPorPeriodoRediseno`), `GET /api/marketing/tiendas` (devuelve `filas` + `periodos` + `filasPorPeriodo`), `lib/marketing/anulados-caducos.ts` + `GET /api/cron/cleanup-marketing-anulados`.
- **Pantallas:** `BarraDePeriodos.tsx` (nueva), `PortadaTiendas.tsx`, `FichaTienda.tsx`, `FichaTiendaAcciones.tsx` + `ConfirmarEliminar.tsx` (nuevo), `excel-de-la-tienda.ts` (el período en el nombre del archivo), `HistorialImpulsadoraModal.tsx` (solo vigentes). `tiendas-y-marcas.ts`: `chipsDeLaFicha(vivas)` sin «Anulados» y con «Todas las marcas»; `FILTRO_ANULADOS` → `FILTRO_ANULADOS_RETIRADO`. `FilaDeTienda.periodo` y `GastoParaReporte.periodo` (opcionales).
- **Registro del cron:** `vercel.json` (+1, `40 3 * * *`), `cron-telemetry.ts › SEED_TOLERANT_CRONS`, `docs/crons.md` (82 entradas).
- **Se conserva:** la ruta `papelera/restaurar` (sin puerta en la ficha), `restaurarFactura`, la pantalla de antes (`VistaTiendaAnterior`), el cierre, el ZIP, Impulsadoras y Mobiliario.

### Candado y mutaciones

`src/__tests__/components/marketing-el-periodo-manda.test.tsx` — **19 casos en 7 bloques**, DOM + puro + barridos, con los números reales de D-118, Nova Lux y City Mall David: abre en Abierto · los chips salen de los gastos (un cerrado sin gastos no existe; `?periodo=basura` cae en Abierto) · en un período solo sus gastos y el KPI cuadra · «Todos» con dos bloques cuyos subtotales suman · la lista de Tiendas por período con su pie · un anulado en ninguna superficie (barridos sobre `datos.ts`, `FichaTienda.tsx`, `FichaTiendaAcciones.tsx`, `tiendas-y-marcas.ts`, `HistorialImpulsadoraModal.tsx`) · ELIMINAR exacto, con la ruta de siempre, también para el mueble · el cron con un Supabase de mentira (`lt("anulado_en", corte)`, archivos, sellos, filas, nada más; 14 de 15 caducan) y su registro (una entrada, un minuto, `SEED_TOLERANT_CRONS`, 401 sin secreto) · interruptor `false`.

Candados ajenos que **cambiaron de forma, no de dirección**, con nota fechada: `marketing-tiendas-y-marcas` (el pie dice a dónde va lo abierto; sin chip «Anulados»; «Anular» pasó a «Eliminar» con la palabra; el doble de `reportes` gana `tiendasPorPeriodoRediseno`), `marketing-vista-tienda` (la ficha lee `pie.total`, que sale de `pieDeLaFicha`), `data-health-sin-pantalla` (el total de entradas de cron pasa de 81 a 82 por la entrada nueva, con nota).

Mutaciones a mano (romper → ROJO → restaurar):

| # | Mutación | Resultado |
|---|---|---|
| 1 | `periodoElegido` cae en «Todos» en vez de «Abierto» | 🔴 2 casos |
| 2 | `chipsDePeriodos` agrega un chip escrito a mano («Período 2026») | 🔴 2 casos |
| 3 | `gastosDelPeriodo` devuelve todos los gastos sin mirar la clave | 🔴 9 casos |
| 4 | `confirmaEliminar` acepta «eliminar» en minúsculas | 🔴 2 casos |
| 5 | el cron corta con «ahora» en vez de hace 90 días | 🔴 1 caso |
| 6 | `datos.ts` vuelve a mandar las anuladas (sin `.is("anulado_en", null)`) | 🔴 1 caso |
| 7 | el subtotal del bloque suma lo apagado | 🟢 pasó → se agregó un gasto apagado a la prueba → 🔴 1 caso |
| — | control sin mutar | 🟢 19/19 |

### Pendiente o dudoso

- 🔴 **El mockup tenía el mueble de D-118 en «Abierto» y la base y el ZIP lo tienen en «mid 2026»**: la pantalla sigue a la base. Si Daniel quiere el mueble en el próximo ZIP, es una decisión suya (se quitaría el sello a mano, por la base).
- ⚠️ Los muebles no tienen `anulado_en`: se eliminan directo (con ELIMINAR), sin los 90 días de gracia. Darles anulación es otra pieza.
- ⚠️ El pie de la lista de Tiendas SUMA las tiendas que se ven (es lo aprobado en el mockup: «$···» al pie); es la misma suma de tiendas que ya se medía ($200.060,24), no un total por marca.
- ⚠️ Un `?filtro=anulados` viejo no existe como URL (el filtro de marca no vive en la URL); `FILTRO_ANULADOS_RETIRADO` queda rotulado por si algún enlace lo trae.
