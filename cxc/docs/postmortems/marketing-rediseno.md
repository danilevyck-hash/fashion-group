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
