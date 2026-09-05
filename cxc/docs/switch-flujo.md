# Switch → sistema: el mapa de flujo, dato por dato

**Para consultar, no para leer de corrido.** Una sección por cada cosa que el sistema sabe de Switch, siempre en el mismo orden: *sale de Switch por · lo trae · cae en · se ve en · empresas · se rompe si · para consultarlo al momento*. Cada afirmación está verificada contra el código y contra **producción** (Management API, `count=exact`) el **5-sep-2026**, y lleva `archivo:línea` (relativo a `cxc/`). ⚠️ Las citas de `client.ts` se re-midieron: la pasada del 3-sep quedó corrida entre 4 y 12 líneas y ahora cada endpoint va con **nombre de método Y línea**. Lo que cambió está en la sección **D**. Cuando el código y un documento se contradicen, **gana el código**, y la contradicción queda anotada al final.

Por qué existe: la semana del 1-sep se perdieron tardes por no tener claro el camino de punta a punta (se dijo que `sync-articulo-info` traía rubro/subrubro por `/apiarticulos/info` y llamaba a `/lista`; se buscaron atributos de artículos en la tabla de facturas; se dijo que ACS no tenía renglones cuando el reporte web los tenía; se dijo que Analítica estaba cerrada cuando las 8 empresas se consultan por la web). Este documento es el que faltaba.

Complementos: [`switch-referencia.md`](switch-referencia.md) (los 52 métodos del API, página por página) · [`switch-panel.md`](switch-panel.md) (el panel web) · `CLAUDE.md › Dónde vive cada dato` (por pregunta) · skills `numero-no-cuadra`, `switch-cambio-algo`, `traer-reporte-switch`.

---

## Índice

**Ventas** — [1 Facturas y notas](#1-facturas-y-notas-de-créditodébito-cabecera) · [2 Renglones](#2-renglones-de-factura) · [3 Utilidad por factura](#3-utilidad-por-factura) · [4 Costo del día](#4-costo-y-venta-del-día-el-fantasma) · [5 Ventas por artículo y día](#5-ventas-por-artículo-y-día) · [6 Caja del día de ACS](#6-la-caja-del-día-de-acs)
**Cartera y clientes** — [7 Cartera del grupo](#7-cartera-del-grupo-lo-que-me-deben-6-empresas) · [8 Cartera de Boston](#8-cartera-de-boston) · [9 Cobros](#9-cobros-recibos) · [10 Clientes por empresa](#10-clientes-como-los-ve-cada-empresa) · [11 Directorio del grupo](#11-directorio-del-grupo) · [12 Fidelización ACS](#12-fidelización-de-acs)
**Artículos** — [13 La lista](#13-la-lista-de-artículos-existencia-precio-cif) · [14 La ficha](#14-la-ficha-del-artículo-rubro--subrubro--marca) · [15 La marca por marcaId](#15-la-marca-por-marcaid-multifashion) · [16 Los 4 catálogos](#16-el-catálogo-de-cada-marca-reebok--joybees--tommy--calvin)
**Compras, gastos, proveedores** — [17 Llegadas](#17-llegadas-de-mercancía-compré) · [18 Gastos](#18-gastos-egresos-varios) · [19 Cuentas contables](#19-cuentas-contables) · [20 Proveedores](#20-proveedores-y-lo-que-les-debo)
**Hacia Switch** — [21 Pedidos y cotizaciones](#21-lo-que-se-escribe-en-switch-pedidos-y-cotizaciones)
**A mano** — [22 Ventas Artículos de ACS](#22-ventas-artículos-de-acs-a-mano) · [23 Inventario de ACS](#23-inventario-de-acs-a-mano) · [24 Lo que NO viene de Switch](#24-lo-que-no-viene-de-switch)
**Al final** — [A · Las dos vías](#a--las-dos-vías-de-entrada) · [A-bis · Frescura medida](#a-bis--frescura-medida--5-sep-2026-1700-utc) · [B · Trampas transversales](#b--las-trampas-transversales) · [C · Por dónde empezar](#c--cuando-algo-no-cuadra-por-dónde-empezar) · [D · Contradicciones](#d--contradicciones-encontradas-código-vs-documentos)

Convenciones: horas en **UTC (Panamá = UTC−5 fijo)**. «API» = el API JSON con token (`client.ts`). «Panel» = la app web Laravel con sesión y cookies (`web-client.ts`). Las 8 empresas: `vistana · fashion_wear · fashion_shoes · active_shoes · active_wear · joystep` (las 6 del grupo = `B2B_EMPRESA_KEYS`, `src/lib/empresa-mapping.ts:87-95`) + `confecciones_boston` + `american_classic` (Multifashion/ACS).

---

## Ventas

### 1. Facturas y notas de crédito/débito (cabecera)

**Sale de Switch por:** API — `GET /apifactura/lista` (`client.ts:1078`, `listFacturas`), `GET /apinotacredito/lista` (`:1096`, `listNotasCredito`) y `GET /apinotadebito/lista` (`:1112`, `listNotasDebito`), con `desde/hasta/porPagina/paginaActual`. Usuario del API por empresa (`SWITCH_<EMPRESA>_API_USER`, `client.ts:129-153`, `readConfig`). ⚠️ **`.env.local` NO tiene `_API_USER` ni `_API_PASSWORD` de ninguna empresa** — solo `_API_URL`, `_WEB_USER` y `_WEB_PASSWORD` (24 variables, medidas el 5-sep). O sea: **el camino del API no se puede probar en local, solo el del panel**; las credenciales del API viven únicamente en Vercel. Lo de «es `daniel` en 7 de 8» está en un **comentario** (`client.ts:277`), no medido; lo que sí se midió, sin imprimir un solo valor, es que **7 de las 8 empresas comparten el mismo `_WEB_USER` y una tiene otro**, y que las 8 `_API_URL` son distintas).
**Lo trae:** el cron `switch-sync`. `tipo=all` a las 05:30 (vistana, active_wear) · 05:35 (fashion_shoes, fashion_wear) · 05:40 (active_shoes, joystep) · 06:30 (american_classic, confecciones_boston) — `cron-telemetry.ts:628-631`. `tipo=facturas` las 8 empresas a las 11:50 · 15:00 · 19:00 · 23:00 (06:50 · 10:00 · 14:00 · 18:00 Panamá) y solo ACS a las 13:00 · 17:00 · 21:00 · 00:15 — `cron-telemetry.ts:683-750`. Ventana por defecto: **7 días hacia atrás** (`switch-sync/route.ts:166-167`). Función: `syncEmpresaFacturas` (`sync-empresa.ts:405`). Cierra sesión en el `finally` (`route.ts:293-298`).
**Cae en:** `switch_facturas`, una fila por `(empresa_key, switch_factura_id)` (`sync-empresa.ts:390-392`). Guarda `secuencial, tipo_comprobante, fecha, subtotal, descuento, subtotal_descuento, impuesto, total, saldo, condicion_venta, cliente_switch_id, cliente_nombre, cliente_email, vendedor_switch_id, vendedor_nombre, sucursal_*, raw_data` (`:194-215`). **Descarta** `urlswitchpay` (queda solo en `raw_data`). Las notas no traen `tipoComprobante`: el sync lo escribe a mano, `"Nota de Crédito"` / `"Nota de Débito"` (`:537, :547`). **Las NC llegan negativas y se guardan en valor absoluto** (`:296-297`); el signo lo pone la lectura (`src/lib/ventas/tipos-comprobante.ts:36-44`: suman Factura · Tiquete · Transacción · Nota de Débito; resta Nota de Crédito; un tipo desconocido vale **0** y el centinela `ventas_tipos` avisa). Upsert ciego (el SELECT previo solo cuenta, `:362-372`).
**Se ve en:** Ventas › Resumen (RPC `ventas_dashboard_summary`, `src/lib/ventas/queries.ts:82`) · Vista General (`api/dashboard/vista-general/route.ts:195,212`) · Ventas › Clientes (RPC `clientes_anio`, `queries.ts:323`; vistas `clientes_*_12m_vw`) · Multifashion (RPC `multifashion_mensual_v7`, `queries.ts:521`; vista `_multifashion_sf_vw`) · mes×año y anual (`ventas_rollup_mensual_mv`, `api/ventas/mes-anio/route.ts:65`) · Home (`switch_ventas_unificado_vw`, `api/home-stats/route.ts:89`).
**Empresas:** las 8 (`empresasConFacturas()`, `empresas.ts:144`; capability `facturas: true` en las 8, `:98-138`). Boston y ACS **sí** están: filtrar siempre por `empresa_key`.
**Se rompe si:** Switch capa `porPagina` en silencio → el corte es por acumulado contra `total` y deja `*_paginacion_incompleta` en `skip_details` (`sync-empresa.ts:446-451, 512-524`) · una cifra imposible **no se escribe** y el upsert conserva la anterior (`:483-503`, guard `factura`, piso $1M) · un `tipo_comprobante` nuevo suma 0 hasta que alguien lo clasifique · dos syncs de la misma empresa se tumban el token (code 0006).
**Para consultarlo al momento:** botón «Actualizar ahora» del CXC/Ventas → `POST /api/admin/sync-now {modulo:"facturas", empresa}` (una empresa por clic, `api/admin/sync-now/route.ts:3-10`). O el MCP `Switch` (`ventas_totales_periodo`, `ventas_resumen`), que entra con **su propia sesión** — vale la misma regla de los 15 min.

### 2. Renglones de factura

**Sale de Switch por:** API — `GET /apifactura/info?facturaId=` (`client.ts:1128`, `getFactura`) y `GET /apinotacredito/info?notacreditoId=` (`:1138`, `getNotaCredito`; el parámetro es `notacreditoId`, todo junto y con c minúscula; el de NC **no está en el PDF**, `sync-factura-lineas.ts:14-24`).
**Lo trae:** cron `sync-factura-lineas`, **03:30** (`vercel.json:44-45`). No tiene ventana de fechas: es una **cola** — lee `switch_facturas` con `lineas_synced_at IS NULL` (`sync-factura-lineas.ts:113-114`), tope **300 documentos por empresa y corrida** (`route.ts:61`), reanudable. Función `sincronizarLineasEmpresa` (`:150`).
**Cae en:** `switch_factura_lineas`, una fila por `(empresa_key, tipo_comprobante, switch_factura_id, linea_orden)` (`:187-190`). Guarda la cabecera copiada + `articulo_switch_id, codigo, descripcion, rubro, subrubro, marca, cantidad, precio, descuento_pct, subtotal_con_descuento` (`factura-lineas-parse.ts:58-79`). **No hay costo** → no hay margen por cliente (`src/lib/ventas/productos-por-cliente.ts:26`). Primero el upsert de líneas, después la marca `lineas_synced_at` (`:193-205`): al revés, un fallo dejaría un hueco permanente.
**Se ve en:** Ventas › Productos con filtro por cliente (`src/lib/ventas/productos-por-cliente-server.ts:153`, `api/ventas/productos/por-cliente/route.ts`).
**Empresas:** **solo las 6 del grupo** (`empresasConDetalleDeLinea()` = `B2B_EMPRESA_KEYS`, `factura-lineas-parse.ts:30-32`). ACS excluido: sus 27.938 facturas son tiquetes de mostrador a `TCKCTA`, serían 29.000 llamadas para una columna que diría siempre lo mismo (`:12-26`). Boston excluido: su cuenta corriente va por Brand It. Y solo `Factura` y `Nota de Crédito` tienen endpoint de detalle: un tiquete/transacción devuelve vacío (`TIPOS_CON_DETALLE`, `:37`).
**Se rompe si:** se usa como catálogo — **solo tiene lo que se vendió** (en active_shoes 1.126 artículos contra 1.763 del catálogo; el error de los «204 de 238 sin dato» de esta semana). Para atributos de artículo → §13-14 · el signo de NC compara `=== 'Nota de Crédito'` con tilde (`:163-168`) · Switch devuelve 400 transitorios → 1 reintento (`:57-63`).
**Para consultarlo al momento:** una factura suelta: `client.getFactura(id)`. Los renglones de **ACS** existen en el panel: reporte «Ventas Artículos» (§22).

### 3. Utilidad por factura

**Sale de Switch por:** **panel web** — `GET /reportesventa/comprobantes` (token CSRF, `web-client.ts:263`) + `POST /reportesventa/facturas` (DataTables JSON, `:296`, `length: "1000"`, `tipoComprobante: "facturasnotas"`, `desde/hasta` = el mes). Es la **única** fuente de costo/utilidad por documento: el API solo da agregados (`web-client.ts:1-7`). Usuario web `SWITCH_<EMPRESA>_WEB_USER` (`:84-90`), login con `changesession="SI"` (`:178`) que **expulsa a quien esté en el panel**.
**Lo trae:** cron `sync-utilidad`, **07:00** (02:00 Panamá, `cron-telemetry.ts:632`). Meses: `mesesCronDiario()` = el mes en curso, **más el anterior los días 1-5** (`sync-utilidad.ts:525-532`). Serial por empresa (`:506`). Solo se recupera en la pasada de reconciliación de las 10:00, nunca en las de oficina (`cron-telemetry.ts:113-133`).
**Cae en:** `switch_factura_utilidad`, una fila por `(empresa_key, secuencial, fecha)` (`sync-utilidad.ts:303`) — la fecha entra en la llave porque Switch **reinició numeraciones** y el secuencial solo no es identidad (`:74-81`). Guarda `switch_id` (cruce con `switch_facturas` por `secuencial|fechaPanamá`, `:126-180`), `tipo_comprobante, vendedor` (= **dueño de la cartera** del cliente, fallback al vendedor de la factura, `:204-211`), `cliente, subtotal_con_descuento, costo, utilidad, pct_utilidad` (`:197-221`). De paso escribe el maestro de vendedores (`:256`).
**Se ve en:** Comisiones (RPC `comision_b2b_v5`, `api/ventas/comisiones/route.ts:60`) · Ventas › Utilidad por cliente (RPC `utilidad_por_cliente_v2`, `api/ventas/utilidad-cliente/route.ts:66`).
**Empresas:** **las 6 del grupo** (`utilidad: true`, `empresas.ts:99-108`). ACS `false`: retail sin comisión sobre venta (`:97-98`). Boston `false` (`:135-138`).
**Se rompe si:** se pregunta utilidad de 2025 → vacío, no cero (solo desde ene-2026) · un documento con costo corrupto se rechaza **entero** (guard `utilidad`, `:422-432`) · la sesión web se cae a mitad (reintentos, `web-client.ts:202-216`) · alguien corre el sync en horario de oficina: saca a Daniel del panel.
**Para consultarlo al momento:** `POST /api/admin/sync-now` **no** cubre utilidad (`api/admin/sync-now/route.ts:3-10`). Solo el cron, o entrar al panel a mano (skill `traer-reporte-switch`), de madrugada.

### 4. Costo y venta del día (el cuadre)

**Sale de Switch por:** API — `GET /apireporte/totalventas?tipo=03` (`client.ts:1198`, `getReporteMesActual`; el literal en `:1202`): el mes en curso por día, sin parámetro de fecha. Es el reporte del panel «Reportes › Total de ventas», y **sí trae las notas de débito** (a diferencia de `ventasucursal`, §5).
**Lo trae:** viaja dentro de `switch-sync tipo=all`, **una vez por empresa y por día** (05:30/05:35/05:40/06:30 UTC = 00:30–01:30 Panamá), `syncCostoDiario` (`sync-empresa.ts:1108`; disparo en `switch-sync/route.ts:196`). Reescribe el mes entero en cada pasada, sin escritura selectiva.
**Cae en:** `switch_costo_diario`, una fila por `(empresa_key, fecha)` (`:1211-1212`): `venta_total, costo_total, utilidad_total`. Descarta `etiqueta` y los totales del mes (`types.ts:201-215`). Guard sobre las TRES columnas (`:1186-1206`).
**Se ve en:** 🔴 **En ninguna pantalla, a propósito.** Tiene DOS defectos que la descalifican para mostrar: **(a) el último día de cada mes vale $0 para siempre** — se lee a las 00:30 de Panamá y el día 1 el reporte ya es del mes nuevo (medido: vistana 31-ago-2026 = $13.606,69 de costo real, $0 en la tabla; may–ago 2026 dejaron ~$40 K de costo sin escribir en los últimos días); **(b) un día que Switch manda corrupto se queda con la última foto parcial** (Boston 30-jul-2026: $40 contra $1.649,64 — el 31-jul el guard rechazó el día y sobrevivió la lectura de las 09:01 del propio 30). Desde el **3-sep-2026 tiene UN lector: el cuadre mensual** `cuadre_costo_mensual_v1` (migración `20260915120000`) + `src/lib/alertas/cuadre-costo.ts`, colgado de la reconciliación (10/14/18 UTC): por (empresa, mes cerrado), esta tabla contra la fuente del Resumen (`switch_costo_unificado_v2`), sumando SOLO los días comparables (nunca el último del mes, ni los sin fila, ni los leídos antes de cerrar el día en Panamá); **>2 % y >$100 → 🔧 SISTEMA**, anti-loop 7 días por (empresa, mes). Sigue siendo el centinela de la alerta A bajo `costo` (`silencio-de-datos.ts:135`). 🩸 **Mientras nadie la leía, tuvo durante tres meses el número bueno de Active Wear agosto ($5.558,17) frente al −$44.483,03 del Resumen.**
**Empresas:** las 8.
**Se rompe si:** Switch manda una cifra imposible (pasó: Boston 14-jul-2026, $1.000.000.049,22 de costo contra $493 de venta — de ahí nació el guard de montos; ese mes el propio panel de Switch sigue diciendo $900 M de costo) · alguien la usa como fuente de pantalla (ver los dos defectos) · `ventas_dashboard_prev_same_period` v1–v3 la leían en su CTE `dia_costo` para el AÑO ANTERIOR: vacío mientras el año anterior sea 2025, pero el 1-ene-2027 habría alimentado el «costo vs 2026» con los últimos días en $0 — `_v4` ya no la lee (candado: `costo-con-notas-de-debito.test.ts`).
**Para consultarlo al momento:** `/apireporte/totalventas?tipo=04` da el año en curso por mes con costo y utilidad — el panel visto por mes. `scripts/_diag-costo-nd-panel.ts` lo baja para las 8 empresas (⚠️ abre sesión de API con el usuario del panel: expulsa a quien esté).

### 5. Ventas por artículo y día

**Sale de Switch por:** API — `GET /apireporte/ventasucursal?sucursalId&fecha&porPagina&paginaActual` (`client.ts:1207`, `getVentaSucursal`), un día por llamada, por artículo y tipo.
**Lo trae:** cron `switch-articulos`, **08:40** (`cron-telemetry.ts:640`), ventana **3 días hacia atrás** (`switch-articulos/route.ts:44-45`), día por día. `syncArticulosDiario` (`sync-articulos.ts:63`). El mismo cron dispara el diccionario de marcas de ACS (§15).
**Cae en:** `switch_articulo_diario`, una fila por `(empresa_key, fecha, articulo_id, tipo)` (`:181-182`), la tabla más grande (203 K). Guarda `codigo, descripcion, tipo (FA/TQ/CNF/ND/NC), total_comprobantes, cantidad_total, venta_total, costo_total` (`:144-157`) en **magnitud**; el signo lo pone la lectura por `tipo` (`:5-8`). Dos guards: costo sospechoso → se guarda con `costo_total = 0` (`:132-141`); cifra imposible → no se escribe (`:165-178`). **Sin Telegram**, pedido de Daniel del 3-ago (`:33-46`).
**Se ve en:** Multifashion › Productos (`api/multifashion/productos/route.ts:236-249`, paginado a mano) · Ventas › Productos (RPC `switch_top_descripciones_reciente`, `api/ventas/productos/route.ts:121`) · Ventas › Referencia como «Vendí» (`src/lib/ventas/referencia.ts:30,57`) · el margen del Resumen vía `switch_costo_unificado_v2` (migración `20260915120000`), que le SUMA el costo de las notas de débito de `switch_factura_utilidad` (§3): 🩸 **`ventasucursal` no trae ND** y Active Wear agosto 2026 salió con costo −$44.483,03 (la NC de $74.166 restada, su ND de $73.752 nunca sumada). La vista v2 excluye el código `ND` de esta tabla a propósito: si Switch lo estrenara, se contaría dos veces.
**Empresas:** el cron corre **las 8** (`empresasConFacturas()`, `route.ts:52`); `src/lib/ventas/productos.ts:14-15` dice que Boston no se backfilleó. **Llega hasta AYER** (corre 03:40 Panamá): toda comparación se corta con `ultimoDiaCargado` (`src/lib/ventas/ultimo-dia-cargado.ts:29-36`).
**Se rompe si:** un día con más de 3.000 filas (tope 60 páginas × 50, `:159-161`) · un código de tipo nuevo **suma** en silencio (`tipos-comprobante.ts:71-85`; centinela) · se compara «hasta hoy» contra un dato que llega hasta ayer.
**Para consultarlo al momento:** no hay botón. MCP `Switch › ventas_articulos` / `venta_inventario` con su propia sesión.

### 6. La caja del día de ACS

**Sale de Switch por:** API — `GET /apireporte/diarioventas?sucursalId=1&desde&hasta` (`client.ts:1371`, `getDiarioVentas`). `hasta` es **exclusivo** (para el día D: `desde=D, hasta=D+1`; con `desde=hasta` responde ceros, `client.ts:661-663`, contra el ejemplo del PDF).
**Lo trae:** ningún cron. **A demanda** desde la pestaña, con caché en `multifashion_caja_diaria` (`api/multifashion/caja/route.ts:29,100`, upsert por `fecha`) para no abrir una sesión por cada mirada.
**Cae en:** `multifashion_caja_diaria`, una fila por día. Si Switch falla y hay caché, responde `stale: true` (`:108`).
**Se ve en:** Multifashion › Caja (`src/components/multifashion/CajaSubtab.tsx:28`).
**Empresas:** solo `american_classic` (constante del servidor).
**Se rompe si:** `totalDescuentos` viene ≈ `granTotal` (no confiable, `client.ts:664-665`) · cada consulta sin caché abre sesión de ACS y puede chocar con un cron (ventas ACS cada 2 h).
**Para consultarlo al momento:** es esto mismo.

---

## Cartera y clientes

### 7. Cartera del grupo (lo que me deben, 6 empresas)

**Sale de Switch por:** API — primero `GET /apicliente/lista` paginado (`sync-empresa.ts:842`; Switch **ignora `porPagina`** y capa ~50, así que el corte es por acumulado, `:830-848`), después `GET /apicliente/estadocuenta?clienteId=` **uno por cliente** (`client.ts:1188`, `getEstadoCuenta`; 6 en paralelo, `sync-empresa.ts:98`). Es lo que hace que Boston (4.912 clientes) no quepa en la función y vaya por otro camino (§8).
**Lo trae:** cron `switch-sync`. Dentro de `tipo=all` a las 05:3x (solo las 6; `empresasConEstadoCuentaEnCron()`, `switch-sync/route.ts:185`) y `tipo=estadocuenta` en pares: 16:00 (active_shoes, joystep) · 16:05 (fashion_shoes, fashion_wear) · 16:10 (vistana, active_wear) y 21:10 · 21:15 · 21:20 al revés (`cron-telemetry.ts:706-708, 733-735`). `syncEmpresaEstadoCuenta` (`sync-empresa.ts:807`). ~101/121/152 s por empresa (p50/p90/máx).
**Cae en:** `switch_estadocuenta`, una fila por `(empresa_key, ccte_id)` (`:793`). Guarda `cliente_switch_id, cliente_nombre, cliente_codigo, secuencial, numero_fiscal, tipo_comprobante, abrev, total, saldo, debito, credito, saldo_original, total_original, plazo_credito, dias, fecha_creacion (DD-MM-YYYY → ISO), raw_data` (`:619-671`). **Descarta el aging que Switch ya calcula** (`Saldos[]` y `saldoTotal` no están ni en el `interface`, `types.ts:246-250`; el equivalente de proveedores sí se guarda). Y de paso escribe **`switch_clientes`** (§10, `:869-875`).
🔴 **Orden obligatorio: upsert → reconcile.** El reconcile pone `saldo = 0` a todo documento de la empresa con `synced_at < runStamp` y saldo > 0 (`:1026-1030`) — «no vino en esta corrida» = «se pagó». Excluye los clientes cuyo `/estadocuenta` falló (`failedClienteIds`, `:890-895, 1039-1047`) y los documentos que el guard de montos rechazó (`:1033-1036`): sin eso el guard sería destructivo.
**Se ve en:** CXC (`/admin`) vía la vista `switch_estadocuenta_aging` materializada en `switch_estadocuenta_aging_mv` (`api/cxc/aging/route.ts:132`; cae a la vista en vivo si la MV falla, `:138`). La vista **excluye** `confecciones_boston` con `NOT IN` (`supabase/migrations/20260728120000_aging_grupo_y_boston_aparte.sql:72`), llama a la empresa **`company_key`** (`:77`) y arma los tramos `d0_30 … mas_365` (`:94-101`). La MV es `SELECT v.*` de la vista (`20260812180000_aging_mv_excluye_boston.sql:117-119`) y se refresca al final de cada `switch-sync` (`switch-sync/route.ts:239`), en `refresh-clientes-views` 07:35 (`route.ts:47-49`) y en «Actualizar ahora». Frescura: regla 1 de alertas mira `switch_estadocuenta.synced_at` por empresa (`src/lib/datos-frescos.ts:65-67`).
**Empresas:** las 6 del grupo por cron (`estadoCuenta: true` + `cxc: true`, `empresas.ts:99-108`). ACS `estadoCuenta: false` → 0 filas. Boston `estadoCuenta: true, cxc: false` → sus filas están en la **misma tabla** pero fuera de la vista (§8).
**Se rompe si:** un `statement timeout` a mitad (pasó el 25-jul: saldos viejos 5 h) · dos escritores sobre la misma tabla con reconciles distintos (§8) · alguien lee `switch_estadocuenta` sin acotar `empresa_key` y suma a Boston · se lee sin paginar (2.737 filas > 1.000).
**Para consultarlo al momento:** «Actualizar ahora» en CXC (`modulo:"estadocuenta"`, una empresa). MCP `Switch › estado_cuenta_cliente` para un cliente.

### 8. Cartera de Boston

**Sale de Switch por:** **panel web** — `GET /estadodecuenta` (token, `web-client.ts:437`) → `POST /reportesmanager/crearreporteconsola` (devuelve un **uuid**) → `GET /reportesmanager/buscarreporteconsola/<uuid>` cada 2 s hasta `TERMINADO` (`web-client.ts:324-373`). Parámetros copiados del botón del panel: `desde = hasta = hoy`, `claseReporte:'4'`, `tipoReporte:'ESTADOCUENTACLIENTE'` (`:340-344`). Es el reporte «Estado de cuenta › Antigüedad», **todos los documentos abiertos en una respuesta** (~4 s) en vez de 4.912 llamadas. Función `fetchCarteraAntiguedad` (`:428`).
**Lo trae:** cron `boston-cartera`, **08:10** (03:10 Panamá, `vercel.json:104-105`; `cron-telemetry.ts:639`). `syncCarteraWeb` (`sync-estadocuenta-web.ts:266`). **No lo recupera la reconciliación** (no está en `COLATERAL_CRONS`, `switch-reconciliacion/route.ts:275-616`): si falla, espera a mañana — y la regla 1 (24 h) es la que avisa.
**Cae en:** la **misma** `switch_estadocuenta` (`:222`, misma llave `empresa_key, ccte_id`). Como el reporte no trae `ccteId`, se **sintetiza**: `serie × 10.000.000 + (año − 2000) × 100.000 + correlativo` (`estadocuenta-web.ts:134-138, 223-253`); un documento **sin fecha se rechaza y la corrida se corta sin escribir** (`:114-118, 242`). El `saldo` por documento tampoco viene: se deriva `debito − credito` y se **cuadra al centavo contra los `totales` que publica Switch** antes de escribir (`cuadraConSwitch`, `sync-estadocuenta-web.ts:195, 334`). El formato nuevo del 19-ago se traduce al viejo con `adaptarReporteConsola` (`estadocuenta-web.ts:386`), así que las filas tienen la misma forma que las del API. Reconcile propio en la misma corrida (`:237-256`) — válido porque el universo llega completo.
**Se ve en:** CXC › pestaña Boston, vía la vista `switch_estadocuenta_aging_boston` (`api/cxc/boston/route.ts:43`; definida en `20260728120000…sql:130-163`, tramos **`d0_90 / d91_120 / d121_plus`**, columna `cliente_switch_id`). Es una **vista**, no una tabla. Últimos pagos por `switch_ultimo_pago_cliente_v2` (`:74`). Muestra la fecha del dato con el mismo `<SyncStatus />` del grupo.
**Empresas:** solo `confecciones_boston` (`EMPRESA_CARTERA_WEB`, `sync-estadocuenta-web.ts:83`). Su estadocuenta por API sigue vetado por cron (`EMPRESAS_ESTADOCUENTA_FUERA_DE_CRON`, `empresas.ts:210-212`) pero el sync manual lo acepta.
**Se rompe si:** Switch vuelve a cambiar el motor de reportes (19-ago-2026: `POST /estadodecuenta/obtener` dejó de existir y devolvió **HTTP 200 con la página de excepción**; 5 días congelada; ver `docs/postmortems/boston-cxc.md:47-108`) · el reporte viene corto: `PISO_CLIENTES_REPORTE = 0.7` contra los clientes con saldo que la tabla ya conoce, y si no llega **no se escribe ni se reconcilia** (`:129, 405-406`) — porque el reconcile pondría en cero a los que faltan · un documento con monto imposible (el de $266M que rechaza todos los días) queda en `skip_details` y **se dice en pantalla**, sin Telegram (`SIN_AVISO_DE_MONTOS`).
**Para consultarlo al momento:** `npx tsx scripts/_diag-boston-cartera.ts` (solo lectura, abre sesión web → expulsa del panel de Boston; ese usuario es el de Daniel).

### 9. Cobros (recibos)

**Sale de Switch por:** API — `GET /apireporte/recibos?desde&hasta&porPagina&paginaActual` (`client.ts:1246`, `listRecibos`). **No está en el PDF**, y no trae `id` ni `secuencial` de recibo (`sync-recibos.ts:4-8`): por eso la unidad de reemplazo es el **mes entero**.
**Lo trae:** cron `sync-recibos` a las **07:50 · 15:15 · 19:15 · 23:15** (`cron-telemetry.ts:633, 705, 722, 749`), siempre los **últimos 3 meses** (`mesesCronRecibos`, `:72`): Switch permite anular y retro-cargar recibos. Escritura **selectiva** desde el 26-jul: lee el mes guardado paginado (`leerMesGuardado`, `:413`), lo compara (`diffRecibos`, `recibos-diff.ts`) y escribe solo altas/bajas (`:499-533`).
**Cae en:** `switch_recibos`, una fila por recibo, sin llave natural. Guarda `fecha, fecha_creacion, cliente_switch_id, cliente_codigo, cliente_nombre, vendedor_registro` (quien cobró), `vendedor_cartera` (dueño del cliente), `total, es_retencion` (`:357-379`). `es_retencion` es una **heurística** (el recibo cuadra con `impuesto/2` de una factura del cliente ±35 días) y **nunca se aplica al mostrador `TCKCTA`** (`:308-320`). Los recibos de $0 son cruces/anulados y se guardan tal cual (`:26-32`).
**Se ve en:** CXC › «Últimos pagos ›» (`api/cxc/ultimos-pagos/route.ts:52`, lee `switch_recibos` directo) · «último pago» del cliente (`switch_ultimo_pago_cliente_v2`) · Comisiones sobre cobro (RPC `comision_cobro_v3`).
**Empresas:** las **8** (`recibos: true` en todas, `empresas.ts:98-138`; Boston entró el 28-jul, PR #347). ⚠️ Dos comentarios del código siguen diciendo «6 B2B + Multifashion, excluye Boston» y están viejos (§D).
**Se rompe si:** se lee sin paginar: ACS jun-2026 tiene 1.259 recibos → las 259 invisibles se re-insertarían en cada corrida (`:231-239`) · un recibo con cifra imposible haría borrar el bueno (protección aparte, `crons-alertas.md`) · el mes en curso trae 0 el día 1 — **eso es normal**, por eso `recibos` no está en la alerta A.
**Para consultarlo al momento:** «Actualizar ahora» (`modulo:"recibos"`, una empresa). El panel tiene `/reportesventa/recibosfacturas` (cobros **contra factura**), que el sistema no baja — Daniel lo descartó el 3-sep.

### 10. Clientes, como los ve cada empresa

**Sale de Switch por:** API — `GET /apicliente/lista` (`client.ts:1178`), la misma llamada del §7. El API trae `id, codigo, nombre, razonsocial, email, identificacion, dv, telefono, celular, direccion, vendedorId, vendedor` (`types.ts:78-91`; **`vendedor` no está en el PDF** y es de donde sale la cartera de comisiones).
**Lo trae:** 🔴 **hay UN solo camino de escritura, `src/lib/switch-api/clientes-directorio.ts`, y TRES ritmos distintos que lo usan** (nació después de la pasada del 3-sep, cuando este documento decía que el escritor vivía dentro de `sync-empresa.ts`): **(a)** las 6 del grupo, cada día dentro del sync de estadocuenta (§7, `sync-empresa.ts` importa de `clientes-directorio`); **(b)** ACS, con el de fidelización (§12, `sync-acs-fidelizacion.ts:76-77` — el único que todavía escribe la tabla por su cuenta); **(c)** Boston, con **su propio cron SEMANAL** `sync-clientes-boston` (`10 7 * * 0` en `vercel.json` = domingos 07:10 UTC, 2:10 a.m. de Panamá), nacido el 5-sep-2026.
**Cae en:** `switch_clientes`, una fila por `(empresa_key, cliente_switch_id)` (`:751`). Guarda `codigo, nombre, razonsocial, email, telefono, celular, identificacion, raw_data` (`:733-746`). 🔑 **Descarta 30 de los 42 campos que Switch manda.** Medido el 5-sep-2026 abriendo el `raw_data` que ya está guardado (`select k from switch_clientes, lateral jsonb_object_keys(raw_data) k`), y entre lo que se tira hay cosas que hoy nadie tiene: la **`direccion` del cliente** (702 de 847 la traen, y **no existe columna para ella** ni aquí ni en `clientes_master`), la **`fechaCreacion`** de la ficha (100 códigos nuevos en 2026), la **lista de precios** (`listaPrecioNombre`, 846 de 847 en «Lista A») y el `tipocliente`. Y lo contrario, que vale igual: `limiteCredito` llega en el 100 % y vale **`0.00` en las 847** — el campo existe y está vacío; `zona` viene vacío en las 847 y `clienteRetenedor` sin marcar en todas (por eso `es_retencion` de §9 sigue siendo una heurística). El detalle campo por campo, en [`switch-referencia.md` §1.7-bis](switch-referencia.md#17-bis--lo-que-switch-sí-manda-y-hoy-no-usamos--medido-en-la-base-5-sep-2026). También se descartan `clienteImpuesto/clienteImpuestoCodigo` (el que decide el ITBMS del pedido) y `vendedor`, que solo se lee de `raw_data`. **Nunca borra**: un cliente que desaparece de Switch se marca `activo=false` (`:673-700`).
**Se ve en:** es el **puente** id → código: `switch_facturas (empresa_key, cliente_switch_id) → switch_clientes.codigo → clientes_master` (`:676-679`). Lo usa Ventas › Clientes (migración `20260907120000_clientes_ranking_por_codigo.sql`), el selector `ClienteSwitchPicker` (`api/catalogo/switch-clientes`) y Multifashion › Clientes.
**Empresas:** **las 8**, medidas hoy: **6.800 filas** — Boston 4.915 · ACS 1.038 · active_wear 147 · vistana 142 · active_shoes 140 · joystep 140 · fashion_shoes 139 · fashion_wear 139.
🩸 **Boston estuvo 37 días congelado y ninguna alerta lo cubría.** Medido el 5-sep-2026: sus 4.915 filas tienen el `synced_at` idéntico **2026-07-30 06:31:07** — **898 horas**, el día exacto en que su estado de cuenta salió del cron por API (`EMPRESAS_ESTADOCUENTA_FUERA_DE_CRON`, `empresas.ts:226`) y su cartera se mudó al reporte web (§8). El directorio viajaba **adentro** de ese sync, así que la cartera quedó al día y el directorio se quedó atrás sin que nada lo dijera. `select empresa_key, max(synced_at), count(*) from switch_clientes group by 1`. El cron nuevo lo arregla desde el primer domingo; **al momento de esta medición todavía no había corrido ninguna vez** (no hay una sola fila `clientes_boston` en `switch_sync_log`), así que la cifra de 898 h es la del hueco, no la del arreglo.
🔴 **`sync-clientes-boston` escribe SOLO `switch_clientes` con `empresa_key='confecciones_boston'`. `clientes_master` no se toca** (Daniel: *«los clientes de Boston no quiero que toquen los de Fashion Group»*); dos guardas antes de marcar a nadie ausente —lista completa **y** que no haya encogido bajo el 70 % de lo conocido— y lista vacía = error, no se escribe nada. Lo vigila la alerta B de silencio con umbral **semanal** (165 h).
**Se rompe si:** se une por **nombre** en vez de por código (City Mall David ×2 el 2-sep) · el mismo cliente tiene un `cliente_switch_id` viejo en facturas antiguas (370 facturas, 0,07% de la venta, caen a «Otros clientes» con y sin fallback).
**Para consultarlo al momento:** MCP `Switch › clientes`. O `/apicliente/lista?filtro=`.

### 11. Directorio del grupo

**Sale de Switch por:** **no toca Switch.** `sync-clientes-master` lee `switch_clientes` de **nuestra** base (`sync-clientes-master.ts:2, 29`), pidiendo por **inclusión** `.in("empresa_key", EMPRESAS_DEL_GRUPO)` (`:153-158`; la lista en `src/lib/clientes/mundos.ts:59-66` = las 6).
**Lo trae:** cron `sync-clientes-master`, **07:00** (`vercel.json:189`); lo recupera la reconciliación.
**Cae en:** `clientes_master`, una fila por **`codigo`** (`:239-240`). **No tiene `empresa_key`**: adentro un cliente de Boston es indistinguible de uno del grupo — de ahí las 4.914 filas de Boston que estuvieron cinco semanas (28-jul → 2-sep) y multiplicaron la venta del ranking al unir por nombre; hoy marcadas `deleted`, quedan 150 vivas. **Nunca pisa** `telefono/celular/email/notas/provincia`: eso lo escribe la gente (`:25, 232`).
**Se ve en:** Clientes (`/clientes`, `api/clientes/route.ts`) · Ventas › Clientes (`clientes_agregado_12m_vw` para «Todas», `clientes_empresa_12m_vw` por empresa, `src/lib/ventas/queries.ts:294-339`; se refrescan en `refresh-clientes-views` 07:35 con `refresh_clientes_empresa_12m_vw`, `route.ts:47`) · Recordatorios (selector de cliente D-XXX) · CXC (nombres, `api/cxc/aging/route.ts:69`).
**Empresas:** solo las 6 del grupo, por construcción.
**Se rompe si:** alguien vuelve a pedir por exclusión (`.neq`) en vez de inclusión · se une por `nombre_normalized` (candado `clientes-master-solo-del-grupo.test.ts`) · se confunde con `directorio_clientes` (33 contactos a mano).
**Para consultarlo al momento:** «Actualizar ahora» (`modulo:"clientes-master"`), sin sesión de Switch.

### 12. Fidelización de ACS

**Sale de Switch por:** API — `GET /apicliente/lista` (directorio de ACS con teléfono, celular, `codTelefono`, `fechaCreacion` en `raw_data`) y `GET /apifactura/info` por factura para leer `descuentoGlobalPorcentaje` (`sync-acs-fidelizacion.ts:1-14`).
**Lo trae:** cron `acs-fidelizacion`, **11:30** y **16:30** (la 2ª es segunda oportunidad, no-op si la 1ª salió bien; `cron-telemetry.ts:680, 709`). Tope 200 facturas por corrida, de la más nueva a la más vieja (`:14, 27`).
**Cae en:** `switch_clientes` (`empresa_key='american_classic'`, `:76-77`) y `switch_facturas.descuento_global_pct` + `detalle_synced_at` (`:117-121`).
**Se ve en:** Multifashion › Clientes (`api/multifashion/fidelizacion/route.ts:81-121`; paginado con `.order("id")`).
**Empresas:** solo `american_classic` (`:24`).
**Se rompe si:** el comentario del archivo dice que corre a las 08:15 y que se espacia de `multifashion-sync` 05:00 (`:16-18`) — los dos datos están viejos (§D) · comparte sesión de ACS con las ventas cada 2 h: 11:30 está a 20 min de las 11:50.
**Para consultarlo al momento:** no hay botón.

---

## Artículos

### 13. La lista de artículos (existencia, precio, CIF)

**Sale de Switch por:** API — `GET /apiarticulos/lista?porPagina=50&paginaActual=N` (`client.ts:1222`, `getArticulos`; `sync-articulo-info.ts:406`), barrido entero de la empresa. 🔴 **Este endpoint NO trae `rubro`, `subrubro` ni `marca`** — está medido y escrito en el propio archivo (`sync-articulo-info.ts:69-78`; `client.ts:760-766`). Trae `id, codigo, descripcion, codigoBarra, disponible, precio, costo, marcaId, proveedor…`. Fue el error de la semana: creer que esta llamada traía la clasificación.
**Lo trae:** cron `sync-articulo-info` en 3 entradas de 2 empresas: **04:30** (vistana, active_wear) · **04:40** (fashion_shoes, fashion_wear) · **04:50** (active_shoes, joystep) (`cron-telemetry.ts:625-627`; `?empresas=` obligatorio y subconjunto de las 6, `sync-articulo-info/route.ts:31, 72`). vistana sola mide 155 s / 8.122 artículos. `syncArticuloInfo` (`sync-articulo-info.ts:369`). También lo dispara el botón «Actualizar datos de Switch» de **`/referencia`** (`api/ventas/referencia/actualizar/route.ts`), una empresa por disparo. ⚠️ Hasta el 4-sep-2026 aquí decía «del tab Ventas › Referencia, solo admin»: la pestaña se retiró el 12-ago-2026 (hoy la pantalla es el módulo `/referencia`), y desde el 4-sep la ruta abre para **`REFERENCIA_ROLES`** = admin · vendedor · bodega, con un cooldown de 10 min por empresa que la hace no-op si ya se trajo hace poco.
**Cae en:** `switch_articulo_info`, una fila por `(empresa_key, codigo)` (`:453`). Guarda `articulo_id, descripcion, existencia` (= **`disponible`**, existencia física menos comprometido, `:121-122, 154`), `precio_etiqueta` (= `precio`), `costo_api` (= `costo`, que es el **CIF**, `:9-16`), `synced_at` (`:133-162`). **Descarta** `listaPrecioId, unidadmedida, proveedor, marcaId, talla, color, cantidadPorCaja`. El `codigoBarra` se conserva en memoria solo para la fase 2 (§14).
**Se ve en:** Ventas › Referencia — «Stock» y el precio de etiqueta (`api/ventas/referencia/route.ts:30-34`; `src/lib/ventas/referencia.ts`) · el FOB se **calcula** `CIF ÷ 1,10` (`src/lib/ventas/referencia-info.ts:26-38`).
**Empresas:** **solo las 6 del grupo** (`B2B_EMPRESA_KEYS` en el route; `REFERENCIA_EMPRESA_KEYS = B2B_EMPRESA_KEYS`, `src/lib/ventas/referencia.ts:31`). Boston y ACS = 0 filas **a propósito** (decisión de Daniel). Medido el 5-sep-2026: **16.658 filas** — vistana 8.273 · fashion_wear 5.111 · active_shoes 1.763 · fashion_shoes 712 · active_wear 592 · joystep 207; **4.924 con existencia > 0**.
**Se rompe si:** el endpoint ignora `porPagina` → el corte es por **página vacía** (`:28, 408`) y llegar a `MAX_PAGES = 400` es error, no éxito a medias (`:49, 417-419`) · el catálogo baja de 70% de lo guardado → no se escribe (`PISO_BARRIDO`, `:56`) · existencia > 500.000 se rechaza (`EXISTENCIA_MAX`, `:65`; Switch mandó 4,46 billones el 27-jul) · **`/lista` repite artículos** (ACS: 9.126 renglones, 8.447 ids; §15) · la alerta B avisa si `synced_at` pasa 40 h sin escribirse (`silencio-de-datos.ts:244+`).
**Para consultarlo al momento:** el botón «Actualizar datos de Switch» de Referencia (abre sesión API de esa empresa; respetar los 15 min). MCP `Switch › articulos` / `inventario`.

### 14. La ficha del artículo (rubro · subrubro · marca)

**Sale de Switch por:** API — `GET /apiarticulos/info?codigoBarra=` (`client.ts:1285`, `getArticuloInfo`; el literal en `:1290`), **de a UNO por código de barra**. Devuelve ~29 campos; se toman `rubro, subrubro, marca` (`client.ts:754-782`) y se descartan `imagen, fechacreacion, tipoArticulo, articuloImpuesto, listaPrecioId…`.
**Lo trae:** la **fase 2 del mismo cron** `sync-articulo-info` (`sync-articulo-info.ts:457+`, `traerFichas` `:248`), solo para `EMPRESAS_CON_FICHA = ["active_shoes"]` (`:99`), solo a quien **todavía no la tiene** (`ficha_at IS NULL`, `:266-270`), **primero los que tienen existencia** (`pendientesDeFicha`, `:221-231`), tope **400 por corrida** (`:109`) y 240 s de presupuesto (`:114`). Las 1.363 que faltaban el 2-sep **ya drenaron casi todas**: medido el 5-sep-2026, **1.408 de 1.763 tienen `ficha_at`** y quedan **355**, o sea una corrida más. `select count(*) filter (where ficha_at is not null) from switch_articulo_info where empresa_key='active_shoes'`. Las otras 5 empresas siguen en **0 fichas**, a propósito.
**Cae en:** las columnas `rubro, subrubro, marca, ficha_at` de `switch_articulo_info` (migración `20260906120000_clasificacion_catalogo.sql`, aplicada 2-sep). 🔴 **`ficha_at` es lo único que distingue «todavía no pregunté» de «pregunté y Switch no dijo nada»**: la fila la crea el §13 con los tres campos en NULL. Confundir las dos cosas fue la falsa alarma de los «233 productos sin clasificar».
**Se ve en:** el catálogo Reebok — `sync-catalogo-reebok.ts:112-122` lee `codigo, rubro, subrubro, marca, ficha_at` y `src/lib/reebok-clasificacion.ts` decide: la **marca** manda la categoría (FOOTWEAR/APPAREL/HARDWARE), el **subrubro** el género, `UNISEX` → Hombre salvo `WOMEN`/`W` en el nombre. Sin `ficha_at` no se clasifica ni se avisa (`fichaLlego`).
**Empresas:** solo `active_shoes`. Las otras 5 tienen la fila del §13 con la ficha vacía; **eso no es un error**.
**Se rompe si:** se agrega una empresa de 8.000 artículos a `EMPRESAS_CON_FICHA` (el tope 400 lo frena) · alguien mira `rubro IS NULL` sin mirar `ficha_at` · `/apiarticulos/lista` acepta `rubroId` (PDF p. 30) y nadie lo probó: podría dar el **rubro** en bloque, no el subrubro ni la marca (`switch-referencia.md` Parte 3, #2).
**Para consultarlo al momento:** `client.getArticuloInfo(codigoBarra)` para un artículo. El botón de Referencia corre las dos fases.

### 15. La marca por `marcaId` (Multifashion)

**Sale de Switch por:** API — `GET /apiarticulos/lista` entero (id → `marcaId`, ~183 páginas) + `GET /apiarticulos/info?codigoBarra=` **una vez por `marcaId` desconocido** usando un artículo cualquiera de esa marca (33 la primera vez, 0 en régimen) (`sync-articulo-marca.ts:2-16, 245`).
**Lo trae:** el cron `switch-articulos` de las **08:40**, después de las ventas por artículo (`switch-articulos/route.ts:104-106`). `syncArticuloMarca` (`sync-articulo-marca.ts:210`).
**Cae en:** `switch_articulo_marca`, una fila por `(empresa_key, articulo_id)` (`:323`). Un `marcaId` sin nombre **no se escribe** y el módulo lo muestra como «Sin marca» (`:20`).
**Se ve en:** Multifashion › Productos › por marca (`api/multifashion/productos/route.ts`; `src/lib/multifashion/productos-marca.ts`). Lo que Switch llama «marca» es marca + departamento; el mapa prefijo → marca es explícito y lo desconocido cae en «Otros».
**Empresas:** solo `american_classic` (8.631 filas; las 6 del grupo tienen **cero**, no es su catálogo de marcas).
**Se rompe si:** `/lista` repite artículos y el upsert manda la misma llave dos veces en un lote → se deduplica antes (`dedupeCatalogo`, `:117`; el 7-ago la tabla se quedó en 2.000 filas, 22% del catálogo) · el barrido trae < 70% de lo guardado → no se escribe (`PISO_BARRIDO`, `:91`) · el `sync_type` no está en el CHECK de `switch_sync_log` → la corrida no deja fila (pasó dos veces; candado `sync-log-tipos-check.test.ts`).
**Para consultarlo al momento:** no hay botón; `FASE=a npx tsx scripts/_diag-articulo-marca-hueco.ts` (abre sesión de ACS).

### 16. El catálogo de cada marca (Reebok · Joybees · Tommy · Calvin)

**Sale de Switch por:** API, tres llamadas por pasada: `GET /apiarticulos/lista` (el universo + `disponible`, `sync-catalogo.ts:560`), `GET /apiarticulos/stock?articuloId=` **una por artículo del set acotado** (activos ∪ `disponible ≥ 1`; `saldo` = existencia física, `:25-32`; en paralelo), y `GET /apiarticulos/tallacolor` para tallas (`client.ts:1295`, `apiarticulosTallaColor`). Motor común `syncCatalogo` (`sync-catalogo.ts`) + una envoltura por marca:

| Marca | Empresa Switch | Filtro | Tablas | Dónde |
|---|---|---|---|---|
| Reebok | `active_shoes` | proveedor `LATIN FITNESS GROUP` (excluye `KL*`) | **`products` + `inventory`, en OTRO proyecto Supabase** (`reebokServer`) | `sync-catalogo-reebok.ts:43, 57-70, 167` |
| Joybees | `joystep` | proveedor `JCBBRANDS` | `joybees_products` (stock en la fila) | `sync-catalogo-joybees.ts:1-12, 34, 51-57` |
| Tommy | `fashion_shoes` | `marcaId === 3` | `tommy_products` | `sync-catalogo-tommy.ts:55-65, 122-128` |
| Calvin | `vistana` | `marcaId === 8` (CK FOOTWEAR; **el 3 en vistana es CK Legwear**) | `calvin_products` | `sync-catalogo-calvin.ts:7-11, 52-63, 120-125` |

**Lo trae:** 4 crons × 4 pasadas dentro del horario de uso de Panamá: tommy 14:30 · 17:00 · 19:40 · 21:55, calvin +5 min, reebok +10, joybees +15 (`cron-telemetry.ts:700-703, 715-719, 728-731, 744-747`). Solo la reconciliación de las 18:00 los recupera. Tommy y Calvin se **omiten limpio** si su DDL no corrió (`tommy-catalogo/route.ts:31-32`).
**Cae en:** una fila por SKU. El motor escribe existencia, disponibilidad, precio (**el precio lo manda Switch**), `active`; respeta `nombre_manual`, `foto_manual`, `badge`, `keep_visible` (`sync-catalogo.ts:44-51, 152, 212`). `gender`/`category` los pone cada marca, no el motor (`:751`); en Reebok salen de la ficha (§14). Escritura **selectiva**: solo lo que cambió (`catalogo-igualdad.ts`). Un producto nuevo con precio imposible **no se crea**; uno existente conserva su precio (guard `producto`, piso $10.000).
**Se ve en:** hub `/catalogos/marcas`, el catálogo público de cada marca (`api/catalogo/[marca]/public/route.ts:68-70`, que le pide a la base de cada marca) y el checkout (§21). «Disponible» en pantalla = `disponible` neto de pedidos abiertos (`src/lib/catalogos/disponible.ts:3-5`).
**Empresas:** una por marca, fija en el código (tabla de arriba). El `marcaId` es **por empresa**: nunca usar el número suelto.
**Se rompe si:** el catálogo crece más de `MAX_PAGES = 250` páginas → **error, nunca éxito a medias** (`sync-catalogo.ts:77-80`; el 12-ago Calvin entró con 4 productos de ~80 con el tope en 80) · `/lista` viene vacía o el **filtro** queda vacío (Switch cambió el campo proveedor) → **no se oculta nada en masa** (`:855-864`) · alguien pide precios con `clienteId` (lista de precios por cliente) — hoy nadie lo hace, y por eso el precio del catálogo es el de la lista por defecto (`switch-referencia.md` Parte 3, #4) · Tommy 156 s: es el más largo y el que más cerca queda de la reconciliación.
**Para consultarlo al momento:** «Actualizar ahora» en el admin del catálogo (`modulo:"catalogo-reebok"|…`, `CatalogoSyncNow.tsx`).

---

## Compras, gastos, proveedores

### 17. Llegadas de mercancía («Compré»)

**Sale de Switch por:** **panel web** — `GET /reportes/ingresomercancia` (token, `web-client.ts:786, 915-917`) + `POST /reportes/stockingresomercanciadetalle` («Descargar Detalle», una fila por artículo, `:788`) + `POST /reportes/stockingresomercancia` (una fila por documento, solo para cuadrar, `:790`). No es DataTables: es un **acumulador por rondas** (`chunk=500`, `key`, `file`; cuando responde `response:false` el archivo está en `GET /log/<file>`; `acumularIngresos`, `:815`) y devuelve un **CSV con `;`** validado por contenido (`pareceCsvDeIngresos`, `:809`). El rango viaja **en el POST** (`:778-780`). `fetchIngresosMercancia` (`:906`).
Por qué no el API: `GET /apiingresomercancia/lista` responde 200 con solo 10 campos de cabecera y **cero líneas**, ignora `estatus` y trae basura no filtrable (`ingresos-mercancia.ts:9-15`; `src/lib/proveedores-derivados.ts:28-53`). ⚠️ El PDF dice que `/apiingresomercancia/info` **sí** trae `detalle[]` y el único sondeo del repo nunca miró esa llave (`switch-referencia.md` Parte 3, #3): está sin verificar.
**Lo trae:** cron `sync-ingresos-mercancia`, **09:05** (04:05 Panamá, `cron-telemetry.ts:658`). Ventana **45 días** hacia atrás, estirada hasta 7 días antes de la última fecha cargada, tope 400 (`ingresos-mercancia-web.ts:121-137, 178-185`). No lo recupera la reconciliación.
**Cae en:** `switch_ingresos_mercancia`, una fila por `(empresa_key, n_interno, linea)` con `linea` **ordinal** (`:378-380`; `ingresos-mercancia.ts:146-157`: el mismo artículo se repite dentro de un documento). Guarda `fecha, sucursal, proveedor, codigo_articulo, articulo, referencia, precio, cantidad, costo_fob, costo_cif, costo_sin_desglosar, costo_promedio, utilidad_pct` (`:140-175`). **FOB y CIF tal como vienen, sin corregir**: medido el 5-sep-2026 sobre las **32.079 líneas que traen los dos**, **30.487 tienen FOB = CIF — el 95 %** (el 93 % del comentario era la muestra vieja de vistana). Es un error de carga en Switch, no del sync (`:35-43`). 🔴 Y **fashion_shoes casi no participa de esa cuenta**: de sus 3.581 líneas, **3.493 (97,5 %) van en `costo_sin_desglosar`** porque su reporte llega con 12 columnas y un solo `COSTO`; solo 88 traen FOB y CIF separados. `select empresa_key, count(*) filter (where costo_sin_desglosar is not null) from switch_ingresos_mercancia group by 1`. `fobConfiable()` es una **función al leer**, no una columna (`:251-255`). `fashion_shoes` manda el reporte con **12 columnas y un solo `COSTO`** → `costo_sin_desglosar` (`:88-105`). Upsert + poda de la cola, **nunca DELETE+INSERT** (`ingresos-mercancia-web.ts:50-67`); los documentos anulados se **reportan**, no se borran (`:69-74`).
**Se ve en:** Ventas › Referencia — «Compré» y «última llegada» (`api/ventas/referencia/route.ts:160`; `src/lib/ventas/resumen-articulo.ts:230-265, 541` `medirTandas`: los tres grandes son **de la última llegada** cuando la bodega quedó en 0 y volvió a entrar; nada de FIFO).
**Empresas:** **solo las 6 del grupo** (`INGRESOS_EMPRESA_KEYS = B2B_EMPRESA_KEYS`, `ingresos-mercancia-web.ts:99-111`; Daniel, 24-ago: *«solo quiero las compañías de fashion group, las 6»*). Boston y ACS = 0 filas.
**Se rompe si:** el cuadre detalle-vs-resumen documento por documento no da → **no se escribe nada** (`:317-333`) · reporte vacío o < 70% de lo guardado → error (`:343-364`) · Switch cambia el encabezado del CSV (las columnas se leen por **nombre**, `ingresos-mercancia.ts:63-86`) · una toma de inventario aprobada con filtro TODOS pone en cero lo no escaneado y **no pasa por este reporte** (`switch-panel.md` §20).
**Para consultarlo al momento:** `scripts/_bajar-ingresos-mercancia.ts` (sesión web, expulsa del panel). MCP `Switch › kardex`.

### 18. Gastos (Egresos Varios)

**Sale de Switch por:** **panel web** — `GET /caja/listaegresosvarios` (token, `web-client.ts:558, 590-592`) + `POST /caja/egresosvariosexportar` en rondas (`:560, 614-624`; `EGRESOS_CHUNK = 500`), archivo final en `GET /log/<file>` (`:660-662`), **CSV con `;`**, validado por contenido (`pareceCsvDeEgresos`, vive con el parser). `fetchEgresosVarios` (`:581`). El API **no tiene nada de caja ni bancos** (`switch-referencia.md` §1.8).
**Lo trae:** cron `sync-egresos-varios`, **10:35** (05:35 Panamá, `cron-telemetry.ts:677`). Pide **el año entero** (`rangoDelAnio`, `sync-egresos-varios.ts:124-126`) y **reemplaza mes a mes** con la RPC `egresos_reemplazar_mes`, los 12 meses aunque vengan vacíos (`:260-289`): un anulado desaparece, una fecha corregida no queda duplicada. Antes de tocar Switch pregunta si la DDL corrió (`route.ts:89-107`). No lo recupera la reconciliación.
**Cae en:** `egresos_varios`, una fila por renglón `(empresa, mes, n_interno, linea_nro)`, solo la ventana cargada. `egresos_importaciones` se inserta **antes** de los renglones (`:242-258`): es lo que permite decir «este mes no tuvo movimientos» en vez de «no sabemos nada». El parser guarda **todos** los grupos de cuenta; `esGasto` = `startsWith("6.")` decide al leer (`src/lib/egresos/parser.ts:29-37`; `src/lib/contable/cuentas.ts:23`). `PROVEEDOR` viene vacío; el dato humano está en `REFERENCIA` (`parser.ts:38-41`).
**Se ve en:** Gastos › pestaña Gastos (`api/gastos-contabilidad/egresos/route.ts:30`; `src/lib/egresos/leer.ts:104`). «Cargado hasta \<mes\>» y «puede estar a medio cargar» (3+ meses previos y < 25% de la **mediana**, `src/lib/egresos/al-dia.ts:72-85`). Sin renglones: «Todavía no hay gastos registrados», nunca `$0.00` (`ResumenEgresos.tsx:49-61`). 🔴 **Las 8 se ven, nunca se suman** (`src/lib/egresos/reglas.ts:27-39`).
**Empresas:** el módulo muestra las 8; el cron entra a **7** — `confecciones_boston` fuera porque *«ese usuario es mío y no entraré»* (`EMPRESAS_EGRESOS_FUERA_DE_CRON`, `empresas.ts:254-262`; el sync manual `?empresas=confecciones_boston` la sigue aceptando). `joystep` y `american_classic` traen **0 siempre**, y eso es normal.
**Se rompe si:** Switch cambia el CSV — pasó el **1-sep-2026**: la celda de cuenta llegó como `6.03.98.00.00 - GASTO DE TARJETA DE CREDITO` y el módulo quedó 2 días vacío. Ahora `codigoDeCuenta()` lee el código **por el principio** y `CUENTA_RE` conserva su `$` para el valor (`src/lib/contable/csv.ts:28-100`); el archivo crudo **nunca se vio**, se dedujo del `error_message` (`:73-84`) · un renglón ilegible **ya no desaparece**: `skip_details` + pantalla + 🔧 SISTEMA con anti-loop de 7 días por N. INTERNO (`renglones-ilegibles.ts:27-73`) · la alerta B avisa a las 40 h sin escribir `egresos_varios.created_at` (la tabla del **dato**, no `egresos_importaciones`).
**Para consultarlo al momento:** `GET /api/diag/egresos-varios?empresas=<una>&desde&hasta` con `Bearer CRON_SECRET` — baja y parsea **sin escribir** (`api/diag/egresos-varios/route.ts:1-11`), pero **expulsa del panel**: decir empresa y hora antes, madrugada de Panamá, 15 min de cualquier cron de esa empresa. Y `node scripts/_diag-egresos-log.mjs <fecha>` lee `switch_sync_log` sin abrir sesión.

### 19. Cuentas contables

**Sale de Switch por:** **panel web** — `GET /cuentacontable/cuentas`, **JSON directo**, sin token ni rondas (`web-client.ts:689-708`; `fetchCatalogoCuentas` `:722`). Se descubrió leyendo el `.js` público del panel (`:684-687`). Una ruta inexistente aquí devuelve **200 con HTML** (`:703-706`).
**Lo trae:** **no tiene cron propio y no debe tenerlo**: va pegado a la sesión que `sync-egresos-varios` ya abrió, justo después del login y **antes** de los egresos (`sync-cuentas-contables.ts:4-10`; `sync-egresos-varios.ts:177-185`). Nunca tumba al sync de egresos, nunca alerta (`sync-cuentas-contables.ts:12-27`).
**Cae en:** `cuentas_contables`, una fila por `(empresa_key, cuenta)` (`:118-120`): `nombre` (normalizado), **`nombre_switch`** (crudo, para auditar), `nivel`. Un catálogo corto no pisa el bueno (`MINIMO_CUENTAS`, `:94-100`).
**Se ve en:** Gastos, como nombre de cada cuenta (`src/lib/cuentas/leer.ts:113-139`; solo los códigos que el mes usa). Falla **abierta**: sin nombre se muestra el código pelado. El nombre que viene pegado en el CSV de egresos desde el 1-sep **no se toma de ahí** (`csv.ts:92-95`).
**Empresas:** las 7 del cron de egresos.
**Se rompe si:** el panel cambia la ruta del JSON (200 + HTML) · alguien le pone cron propio y duplica la sesión web.
**Para consultarlo al momento:** MCP `Switch › catalogo_cuentas`.

### 20. Proveedores y lo que les debo

**Sale de Switch por:** API — `GET /apiproveedor/lista` paginado (`client.ts:1262`, `listProveedores`) + `GET /apiproveedor/info?proveedorId=` **uno por proveedor** (`:1275`, `getProveedorInfo`). El `/info` **no está en el PDF** y devuelve **200 con HTML** cuando falla: se valida el **shape** (`saldos` y `elements` arrays, `sync-proveedores.ts:122-127`).
**Lo trae:** cron `sync-proveedores`, **09:30** (`cron-telemetry.ts:659`), serial por empresa; lo recupera la reconciliación. `finally` con `logoutAllSwitchSessions()` (`route.ts:78-80`).
**Cae en:** `switch_proveedor_estadocuenta`, una fila por `(empresa_key, proveedor_switch_id)` (`sync-proveedores.ts:245-247`). Guarda `codigo, nombre, identificacion, dv, direccion, contacto, telefono, celular, email, tipo_proveedor, saldo_total`, **`aging` jsonb tal como Switch lo calcula** (`:146`) y **`elements` jsonb** (el ledger completo, `:148`). 🔴 **Es un snapshot con `DELETE` real** de los proveedores que ya no están en la lista (`:252-262`), solo con lista completa y no vacía; **no hay soft delete** (la tabla no tiene `deleted`). `comprado_ytd/pagado_ytd/num_*` **ya no se escriben ni se leen** (`:81-83`).
**Se ve en:** Proveedores (`api/proveedores/route.ts:9-20`; `src/lib/proveedores.ts:60-68`). «Comprado YTD», «Pagado YTD» y «Último pago» se **recalculan al leer** desde `elements` con el mismo módulo puro que usa el sync (`src/lib/proveedores-derivados.ts`). Agrupa entre empresas por nombre normalizado (`proveedores.ts:41-43`).
**Empresas:** las 6 del grupo + ACS (`cxp: true`, `empresas.ts:98-108`; `empresasConCxp`, `:280-284`). Boston `cxp: false` (`:138`).
**Se rompe si:** 🔴 **el ledger es solo lo ABIERTO** (0 de 821 renglones con saldo cero): una factura pagada al 100% desaparece **y se lleva su pago** → los YTD se quedan cortos por diseño, y «Pagado YTD» no tiene arreglo por API (`proveedores-derivados.ts:16-26`) · las NC contaban como pagos (`esPagoAProveedor` = `abrev === "PP"`, `:158-163`) · las fechas vienen `YYYY-MM-DD`, al revés que el estado de cuenta de clientes (`:58-67`; 821 nulls hasta el 27-jul) · el guard `proveedor` tiene piso **$20M** porque hay saldos legítimos de $2,07M (`sync-proveedores.ts:221-233`).
**Para consultarlo al momento:** «Actualizar ahora» (`modulo:"proveedores"`, una empresa). MCP `Switch › proveedores_resumen` / `estado_cuenta_proveedor`.

---

## Hacia Switch

### 21. Lo que se escribe en Switch: pedidos y cotizaciones

**Solo cinco `POST` existen en el conector** (`client.ts`): `/autenticacion` (`:342`), `/cierresesion` (`:1402`, en `logout`), `/apipermiso` (`:1389`, en `verificarPermiso` — es una consulta, no escribe), `/apipedido/terminar` (`:1334`, `apipedidoTerminar`) y `/apicotizacion/terminar` (`:1355`, `apicotizacionTerminar`). **El sistema no factura, no cobra, no crea clientes ni artículos, no mueve inventario.**
**Quién lo dispara:** el checkout del vendedor (`api/catalogo/checkout/route.ts:184`) y el botón «Enviar a Switch» del comprobante (`api/catalogo/[marca]/orders/[id]/enviar-switch/route.ts` → `src/lib/catalogo/enviar-switch-route.ts:217`). El pedido del **link público ya no sale solo** a Switch (se quitó el 14-ago: un pedido en Switch queda bloqueado para editar, `pedido-publico/[id]/confirmar/route.ts:40-64`).
**El camino** (`src/lib/catalogo/switch-envio.ts`, `enviarPedidoSwitch` `:190`): candado at-most-once en `<marca>_switch_envios` (`:201-210`; índice parcial único `(order_id) WHERE estado <> 'error'`, `20260704100000_reebok_switch_envios.sql:25-27` y espejos) → por cada SKU `GET /apiarticulos/lista?filtro=SKU` **sin `clienteId`** (`:242`) + `GET /apiarticulos/tallacolor` (`:273`) → precio: si difiere ≥ $0,01 del catálogo, aviso `precio_distinto` y **se manda el del pedido** (`:257-268, 352-357`) → si hay precio editado, `POST /apipermiso?proceso=0001` (`permiso-precio.ts:32, 67-83`; fail-open) → vendedor de `GET /apivendedor/lista` (`vendedor-switch.ts:245-258`) → cliente (`clienteId`; sin cliente **422**; mostrador = `TCKCTA`, `publico-switch-actor.ts:36`) → fila `pendiente` **antes** del POST (`:386-397`) → `POST /apipedido/terminar` o `/apicotizacion/terminar` según `normalizarDocumento` (todo lo que no sea `"cotizacion"` es pedido, `documento-switch.ts:60-73`) → verificación con `/apipedido/info` o `/apicotizacion/info`: `verificado` solo si las líneas cuadran (`:449-484`).
**Qué manda:** `{ vendedorId, clienteId, articulos:[{ codigoBarraId, cantidad (piezas), precio, descuento:"0.00" }] }` (`:69, 352-357, 386`). **No manda** `descuentoGlobal` (el cliente lo soporta, `client.ts:1327`, nadie lo usa) ni `comprobante/comprobanteId` (convertir cotización → pedido sin reescribir; hoy «para vender se duplica»).
**Cae en:** `<marca>_switch_envios` (`estado`: pendiente · enviado · verificado · error; `numeroInterno`, `pedidoId`), sobre `<marca>_orders`. Marca → empresa: Reebok `active_shoes` · Joybees `joystep` · Tommy `fashion_shoes` · Calvin `vistana` (`src/lib/catalogo/marcas.ts:278-283, 361-366, 445-450, 531-536`).
**Se ve en:** «Comprobantes» (`ComprobantesPanel.tsx`), el detalle del pedido con su `numeroInterno` (`PedidoDetalleClient.tsx:1174`), el PDF cuya palabra («Pedido»/«Cotización») la decide el **envío activo**, no el `status` (`documento-switch.ts:156-183`).
**Se rompe si:** Switch responde **200 con HTML** — `/apicotizacion/crear`, `/guardar`, `/nueva` no existen y contestan así (`client.ts:1001-1003`): un endpoint se valida por la **forma**, nunca por el status · timeout a mitad → `enviado` con `error_detalle: "AMBIGUO…"` y **bloquea reintentos** hasta que alguien mire (`:435-446`) · el parámetro **0072** de Switch (control de comprobantes) restablece precios al facturar si está activo — verificado **apagado** en las 4 empresas el 3-sep, no encenderlo · el cliente tiene **lista de precios propia** y el catálogo muestra la de por defecto (`switch-referencia.md` Parte 3, #4).
**Para consultarlo al momento:** el panel de Switch › Ventas › Buscar comprobantes, o `client.apipedidoInfo(id)`.

---

## A mano

### 22. Ventas Artículos de ACS (a mano)

**Sale de Switch por:** **panel web** — `GET` + `POST /reportesventa/ventasarticulos` (DataTables: `draw/start/length`, `_token`; `scripts/_bajar-acs-ventasarticulos.ts:24, 41-56, 77-96`). Trae **renglón por renglón con número de documento** (`secuencial` `11-` factura, `13-` NC), código, cantidad, precio, `subTotalConDescuento`. Es lo que «no existía» para ACS mientras `switch_factura_lineas` lo excluye (§2).
**Lo trae:** nadie. Se corre a mano por meses (`MESES=2026-07,2026-08`), sonda `length=1` para `recordsTotal`, páginas de ≤ 2.000 (lo que el propio panel pide), y **cuadra `leidas === total`** o dice `🔴 NO CUADRA` (`:140-141, 169-180`).
**Cae en:** **disco local**, `/tmp/acs/datos/<mes>.jsonl` + `_resumen.json` (`:23, 136, 182`). 🔴 **Nada entra a la base sin que Daniel defina tabla y grano** (`:8`). Daniel el 3-sep: *«solo quiero saber cuánto se vendió, y eso ya lo tengo al centavo»* — no se construye.
**Se ve en:** nada. Análisis puntuales.
**Empresas:** `american_classic` (`:121`). El mismo script sirve para cualquiera cambiando la env de URL y la empresa.
**Se rompe si:** se corre encima de un cron de ACS (ventas cada 2 h) · se baja un año de golpe y se confía en `recordsTotal` · el HTML de excepción con 200 (`esError()`, `:39`).
**Para consultarlo al momento:** es esto. Ventana ya usada: 05:00-06:10 UTC. Antes, avisar empresa y hora (skill `traer-reporte-switch`).

### 23. Inventario de ACS (a mano)

**Sale de Switch por:** **panel web** — `POST /reportestock/listadoinventario` (existencia **hoy** + costo) y `POST /reportes/listadoinventario` (existencia **a una fecha**, `hasta=`), DataTables con `_token` (`scripts/_bajar-acs-inventario.ts:5-7, 40-45, 169-176`). El API no tiene inventario a fecha (`/stock` es «ahora», PDF p. 36).
**Lo trae / cae en / se ve en:** igual que §22: a mano, `/tmp/acs/inventario`, JSONL + resumen con `ok: leidas === total` (`:28, 221-228`), **no escribe en la base** (`:9`).
**Empresas:** `american_classic` (`:135-136`). Fue el insumo del análisis del 3-sep ($123K a costo, 3,4 meses de rotación, $34,8K sin rotación).
**Para consultarlo al momento:** MCP `Switch › inventario` / `inventario_talla_color` para el hoy.

### 24. Lo que NO viene de Switch

- **Saldos de banco** (`bancos_saldos`): los escribe contabilidad a mano en Gastos › Saldos de banco, upsert `(empresa_key, fecha_dato)` (`api/saldos-banco/route.ts:138-146`). Cero crons.
- **El mayor contable** (`mayor_lineas`, `mayor_importaciones`): **retirado el 13-ago-2026**. Ningún `sync-mayor` en `vercel.json` ni en `src/` (hay test que lo fija, `vista-general-gasto-egresos.test.ts:319, 375-379`). Una sola lectura viva: `src/lib/cuentas/leer.ts:176-180`, como fallback de nombres de cuenta. El transporte muerto quedó documentado con la trampa de que **su rango viajaba en la sesión, no en el POST** (`web-client.ts:549-555`).
- **Asistencia** (el reloj), **cheques/recordatorios**, **caja menuda**, **guías**, **reclamos**, **marketing**, **préstamos**, **packing lists**: propios del sistema.
- **`ventas_raw` y `cxc_rows`** (los CSV de antes de jun-2026): congeladas, sin lectores en la app.

---

## A · Las dos vías de entrada

| | **API JSON** (`src/lib/switch-api/client.ts`) | **Panel web** (`src/lib/switch-api/web-client.ts`) |
|---|---|---|
| Cómo entra | `POST /autenticacion {usuario, password}` → token JWT; header `Authorization: <token>` **sin `Bearer`** (`client.ts:9-13, 342`) | `GET /users/login` (cookies + `_token`) → `POST /users/login` multipart con **`changesession: "SI"`** (`web-client.ts:163-200`; el `"SI"` en `:178`) |
| Credenciales | `SWITCH_<EMPRESA>_API_URL / _API_USER / _API_PASSWORD` (`client.ts:129-153`) — **ninguna de las dos está en `.env.local`, solo en Vercel** | `SWITCH_<EMPRESA>_API_URL` (misma base) + `_WEB_USER / _WEB_PASSWORD` (`web-client.ts:81`, `readWebConfig`) — las 24 sí están en `.env.local`. Prefijos en `SWITCH_EMPRESA_ENV_MAP` (`empresas.ts:35-44`; ojo: vistana = `VISTANA_INTERNATIONAL`, ACS = `MULTIFASHION`) |
| Qué va por aquí | §1 facturas · §2 renglones · §4 costo día · §5 ventas por artículo · §6 caja ACS · §7 cartera del grupo · §9 recibos · §10 clientes · §12 fidelización · §13-16 artículos y catálogos · §20 proveedores · §21 pedidos | §3 utilidad · §8 cartera de Boston · §17 llegadas · §18 gastos · §19 cuentas · §22-23 a mano |
| Por qué | Tiene JSON tipado, paginación, token renovable | Lo que el API **no expone**: costo por documento, el reporte de antigüedad completo, caja y bancos, el detalle de ingreso de mercancía |
| Cómo sale | `POST /cierresesion` en el `finally` de cada cron (`logoutAllSwitchSessions`, `client.ts:1062-1070`) | `GET /users/logout` (`cerrarSesionWeb`, `web-client.ts:948`), best-effort |
| Cómo falla | Errores como `{error:{code,http_code,message}}`, a veces con **HTTP 200** (`client.ts:227-232`); `0005` token expirado (renueva con `new_token` sin re-login, `:266-300`), `0006` **te sacaron** (re-login) | El **HTML de excepción llega con 200** (`jsonDeSwitch`, `web-client.ts:405-425`; `Controller method not found`); un 302 a `/users` = sesión caída |
| Reintentos | 3 intentos con backoff ante red/timeout/5xx/401 (`client.ts:97-118`); logins en vuelo deduplicados por empresa (`:398-431`) | `LOGIN_MAX_ATTEMPTS = 3` (`:42`; `loginSwitchWeb` en `:203`) |

**La sesión es por USUARIO, no por empresa.** Está en el PDF, p. 6: *«solo habrá un token válido a la vez por usuario»* (citado en `client.ts:266-280`), y medido el 3-sep. El sistema entra como **`daniel`** en 7 de las 8 empresas por el API (`client.ts:277`) y **con el usuario de Daniel** por la web (`cron-telemetry.ts:117-118`). Consecuencias:

- Cada cron o script que abre sesión **saca a Daniel del panel** de esa empresa, y si Daniel entra al panel mientras corre un cron, **el cron recibe `0006`** y re-loguea (o falla, y la reconciliación lo reintenta).
- Dos crons del sistema sobre la **misma empresa** se tumban entre sí. Por eso: crons que tocan la misma empresa van a **≥ 15 min** (`SEPARACION_MINIMA_MIN`, `cron-telemetry.ts:773`; ≥ 50 para los largos), el calendario vive en `SWITCH_CRON_ENTRADAS` (`:609-751`) y un test (`cron-calendario.test.ts`) recorre los pares. Los crons de login web van todos de **madrugada de Panamá** (utilidad 07:00, boston-cartera 08:10, ingresos 09:05, egresos 10:35) y solo se recuperan en la pasada de las 10:00.
- Un usuario dedicado por empresa lo resolvería. **Daniel dijo que no** (3-sep): *«no»*. No volver a proponerlo.
- El API y la web de la misma empresa **también chocan entre sí** (`scripts/_probe-switch-sesion-web-api.ts`): el «Actualizar ahora» de un módulo puede expulsar a quien esté en el panel.
- Lo único que **no** consume sesión: `GET /validar` (¿está vivo Switch?) y el token renovado por `new_token`.
- El **MCP `Switch`** (las tools `ventas_resumen`, `inventario`, `estado_cuenta_cliente`…) entra con **su propia sesión** y vale la misma regla: una consulta a las 10:00 Panamá choca con lo que esté corriendo.

Un candado más: `switch_sync_log` tiene un índice único parcial sobre `status='running'` por `(empresa_key, sync_type)`; una corrida atascada se suelta sola a los **30 min** (`RUNNING_STALE_MIN`, `sync-log.ts:60-72`, derivado del techo de 800 s de la función).

---

### Los reportes del panel, en una tabla — verificado el 5-sep-2026

Todas las rutas que `web-client.ts` toca en producción. `baseUrl` = la misma `SWITCH_<EMPRESA>_API_URL` del API.

| Ruta del panel | Método | Qué baja | Formato | Cae en | Función |
|---|---|---|---|---|---|
| `/users/login` · `/users/logout` | POST · GET | sesión (multipart con `changesession: "SI"`, `web-client.ts:178`) | HTML + cookies | — | `attemptLogin` `:163` · `cerrarSesionWeb` `:948` |
| `/reportesventa/comprobantes` | GET | solo el token CSRF de la página | HTML | — | `fetchUtilidadMes` `:256` (`:263`) |
| `/reportesventa/facturas` | POST | **costo y utilidad por documento** (`length:"1000"`, `tipoComprobante:"facturasnotas"`, `desde/hasta` = el mes) | JSON DataTables | `switch_factura_utilidad` | `fetchUtilidadMes` `:296` |
| `/estadodecuenta` | GET | solo el token CSRF | HTML | — | `fetchCarteraAntiguedad` `:428` (`:437`) |
| `/reportesmanager/crearreporteconsola` | POST | encarga el reporte de antigüedad (`claseReporte:"4"`, `tipoReporte:"ESTADOCUENTACLIENTE"`, `desde = hasta = hoy`, `:469-470`) | JSON `{response, uuid, estatus}` | — | `:483` |
| `/reportesmanager/buscarreporteconsola/<uuid>` | GET | **la cartera completa de Boston** en una respuesta (~4 s, 2 sondeos), con sus `totales` | JSON `{data:{data[],totales}}` | `switch_estadocuenta` de `confecciones_boston` | `:502` |
| `/caja/listaegresosvarios` | GET | token CSRF | HTML | — | `fetchEgresosVarios` `:581` (`:558`) |
| `/caja/egresosvariosexportar` | POST | **Egresos Varios** en rondas de 500 | acumulador → archivo | `egresos_varios` | `:560, :611` |
| `/cuentacontable/cuentas` | GET | **catálogo de cuentas contables** (sin token, sin rondas) | JSON directo | `cuentas_contables` | `fetchCatalogoCuentas` `:722` |
| `/reportes/ingresomercancia` | GET | token CSRF | HTML | — | `fetchIngresosMercancia` `:906` (`:786`) |
| `/reportes/stockingresomercanciadetalle` | POST | **llegadas, una fila por artículo** (13 columnas; 12 en fashion_shoes) | CSV con `;` | `switch_ingresos_mercancia` | `:788` |
| `/reportes/stockingresomercancia` | POST | lo mismo resumido por documento, **solo para cuadrar** | CSV con `;` | — (se compara, no se guarda) | `:790` |
| `/log/<file>` | GET | el archivo que arman los acumuladores cuando responden `response:false` | CSV | — | `:665` |

🔑 **El `uuid` no es fijo ni configurable: Switch lo emite en cada pedido de reporte** y solo vale para esa corrida. Buscar «el uuid de Boston» en el repo no encuentra nada porque no existe.

⚠️ Dos rutas más aparecen en el archivo y **no se llaman**: `/menu/stockreportes` y `/apiingresomercancia/lista` (citada en un comentario, dentro de `web-client.ts`, para explicar por qué NO se usa el API).

---

## A-bis · Frescura medida — 5-sep-2026, 17:00 UTC

Foto de producción para saber, de un vistazo, **qué está al día y qué no**. Dos columnas, porque **no son lo mismo**:

- **Último dato escrito** = `max(synced_at)` de la tabla.
- **Última corrida OK** = `max(started_at)` con `status='success'` en `switch_sync_log`, por (empresa, `sync_type`).

```sql
select sync_type, empresa_key,
       max(started_at) filter (where status='success') ultimo_ok,
       round(extract(epoch from (now()-max(started_at) filter (where status='success')))/3600.0,1) horas
from switch_sync_log group by 1,2 order by 1,2;
```

🔴 **La trampa, y es la más fácil de creerse al revés: en los syncs de escritura selectiva, un `synced_at` viejo NO significa que el sync esté roto — significa que no hubo nada nuevo que escribir.** Medido hoy: `switch_facturas` de `active_wear` tiene el último dato de hace **214 h**, y su sync corrió bien hace **0,6 h**. Esa empresa simplemente no facturó. Lo mismo con `switch_recibos` de `active_wear` (218 h) y `switch_factura_lineas` de joystep (205 h). **Antes de decir «se congeló», mirar `switch_sync_log`, no `synced_at`.** La única tabla donde `synced_at` sí es un termómetro directo es la que se reescribe entera en cada pasada (`switch_estadocuenta` por API, `switch_articulo_info`, `switch_costo_diario`).

| Sync | Empresas | Última corrida OK | Estado |
|---|---|---|---|
| `facturas` | las 8 | 0,6 – 2,0 h | ✅ |
| `estadocuenta` (API) | las 6 del grupo | 0,8 – 1,0 h | ✅ |
| `estadocuenta` (web, Boston) | `confecciones_boston` | 8,8 h | ✅ (cron diario 08:10) |
| `recibos` | las 8 | 1,7 h | ✅ |
| `articulos` (ventas por artículo) | las 8 | 8,3 h | ✅ |
| `articulo_info` | las 6 del grupo | 12,1 – 12,5 h | ✅ |
| `articulo_marca` | `american_classic` | 8,3 h | ✅ |
| `factura_lineas` | las 6 del grupo | 13,5 h | ✅ |
| `utilidad` | las 6 del grupo | 9,9 – 10,0 h | ✅ |
| `costo` | las 8 | 10,5 – 11,5 h | ✅ |
| `ingresos_mercancia` | las 6 del grupo | 7,9 h | ✅ |
| `egresos_varios` + `cuentas_contables` | 7 (sin Boston) | 6,4 h | ✅ |
| `proveedores` | las 6 + ACS | 7,4 – 7,5 h | ✅ |
| los 4 catálogos | una empresa cada uno | 2,2 – 2,5 h | ✅ |
| **directorio de Boston** | `confecciones_boston` | **nunca** | 🔴 **898 h sin escribir** — ver §10. El cron `sync-clientes-boston` es semanal y nació el 5-sep; no hay una sola fila suya en `switch_sync_log` todavía |

**Cero corridas en `error` en los últimos 3 días**, en los 14 tipos de sync × 8 empresas (`count(*) filter (where status='error' and started_at > now()-interval '3 days')` = 0 en todas las filas).

Tres tipos de sync siguen en la tabla con su última corrida vieja, y **no es una avería**: `mayor` (13-ago-2026, retirado), `multifashion` (26-jul-2026, retirado) y `estadocuenta` de `american_classic` (29-may-2026: ACS tiene `estadoCuenta: false`, no tiene cartera). Son historia, no huecos.

Y el tamaño de cada tabla, medido el mismo día (`count(*)`):

`switch_articulo_diario` 204.010 · `switch_factura_lineas` 163.722 · `switch_facturas` 54.474 · `switch_recibos` 46.717 · `switch_ingresos_mercancia` 35.572 · `switch_articulo_info` 16.658 · `switch_sync_log` 9.644 · `switch_articulo_marca` 8.736 · `switch_clientes` 6.800 · `switch_estadocuenta` 2.759 · `switch_factura_utilidad` 1.837 · `switch_costo_diario` 1.223 · `switch_proveedor_estadocuenta` 65.

---

## B · Las trampas transversales

| Trampa | Qué pasa | Caso real | Dónde está el freno |
|---|---|---|---|
| **`db-max-rows` = 1000 corta en silencio** | PostgREST devuelve 1.000 filas y parece completo | Una réplica de Ventas › Clientes dio $41.287 en vez de $390.084 (2-sep); recibos de ACS (1.259/mes) se re-insertaban | `leerTodoPaginado` con `.order()` estable + `count: "exact"` (`src/lib/supabase-paginado.ts:4, 63, 70`) |
| **Sesión única por usuario** | Un login tumba al otro; `0006` | `active_shoes`/`active_wear` un día sin datos (jun); Daniel expulsado del panel a las 9 a.m. por una recuperación | 15 min entre crons (`cron-telemetry.ts:773`); login web solo de madrugada (`:113-133`); `finally` con logout |
| **Un reporte que corta a N páginas y se anota `success`** | El sync escribe poco y parece sano | Calvin 12-ago: 4 productos de ~80 con `MAX_PAGES = 80` | Llegar al tope es **error** (`sync-catalogo.ts:77-80`; `sync-articulo-info.ts:417-419`); guards de barrido corto al 70% (`sync-articulo-marca.ts:91`, `sync-estadocuenta-web.ts:129`, `ingresos-mercancia-web.ts:154`, `sync-egresos-varios.ts:98`) |
| **Success con cero donde siempre hay cientos** | Nadie mira un `success` | Gastos 1-2 sep (100% de renglones ilegibles) | Alerta A/B en `src/lib/alertas/silencio-de-datos.ts:130-262`, solo para `SYNCS_DE_UNIVERSO_COMPLETO` |
| **Una empresa excluida a mano** | «No hay dato» cuando nunca estuvo | ACS y Boston no tienen renglones (§2), ni llegadas (§17), ni artículos (§13); Boston no tiene egresos por cron (§18) | Antes de decir «falta», mirar la lista: `empresas.ts:98-138, 210, 254`, `factura-lineas-parse.ts:30`, `ingresos-mercancia-web.ts:99`; la vista de aging **excluye** con `NOT IN` (`20260728120000…sql:72`), nunca enumera |
| **`synced_at` viejo ≠ sync roto** | En un sync de escritura selectiva, `max(synced_at)` dice cuándo se escribió algo, no cuándo corrió | `switch_facturas` de `active_wear`: último dato de hace 214 h, última corrida OK hace 0,6 h (5-sep). No vendió, nada más | Mirar `switch_sync_log` por (empresa, `sync_type`), no la tabla del dato. Ver la sección **A-bis** |
| **Un campo que Switch manda y el `interface` descarta** | El dato existe en Switch y no en la base | `Saldos[]`/`saldoTotal` del estado de cuenta; `rubro/subrubro/marca` estuvieron entre los ~24 campos tirados de `/info`; `urlswitchpay`, `clienteImpuesto`, `imagen`. **Medido el 5-sep: `/apicliente/lista` manda 42 campos y se guardan 12** — entre los 30 que se van está la **dirección del cliente**, presente en 702 de 847 (`switch-referencia.md` §1.7-bis) | `raw_data` conserva el elemento crudo en facturas, estadocuenta y clientes; en artículos no hay `raw_data` |
| **Nombre vs código** | El nombre es de cada empresa; el código es del grupo | Mostrador: `CONTADO`/`VENTAS`/`VENTAS LOCA` por empresa, siempre `TCKCTA` (encontraba 1 de 6); City Mall David ×2 por unir por nombre | Identidad = `codigo` (`D-24` es City Mall en las 6; 138/147 cuadran); puente `switch_clientes` (§10); `esMostrador` por código |
| **UTC vs Panamá** | Panamá es UTC−5 **fijo**; los crons se escriben en UTC | Un fix commiteado a las 14:33 UTC «no funcionó» contra un cron de las 10:35 UTC; el YTD de proveedores se vaciaba 5 h antes; la RPC del Resumen cortaba en UTC | `hoyPanama`/`fechaPanamaDe` (`src/lib/fecha-panama.ts`); `ultimoDiaCargado` para lo que llega hasta ayer |
| **HTTP 200 con HTML** | El status no dice nada | Boston 19-ago (5 días), `/apiproveedor/info`, `/apicotizacion/crear` | Validar por **forma**: `jsonDeSwitch` (`web-client.ts:405-425`), shape de `saldos/elements` (`sync-proveedores.ts:122-127`) |
| **`porPagina` capado a 50** | Pedir 200 devuelve 50 | `/apicliente/lista` dejaba fuera el 60% de vistana con el corte viejo | Cortar por acumulado contra `total` o por página vacía (`sync-empresa.ts:830-848`) |
| **Fechas en dos formatos** | `DD-MM-YYYY` en estado de cuenta; `YYYY-MM-DD` en proveedores, recibos y egresos | 821/821 nulls en «Último pago» (jul) | `parseFechaDMY` (`parse.ts`) vs `fechaPanamaDelLedger` (`proveedores-derivados.ts:122`); `fechaEgresoAIso` acepta las dos |
| **La misma tabla con dos escritores** | `switch_estadocuenta`: API (§7) y reporte web (§8), cada uno con su reconcile | Partir Boston en tandas por API ponía en cero lo de la tanda anterior | Cada escritor reconcilia **solo su empresa** y solo con universo completo (`sync-estadocuenta-web.ts:19-28`) |
| **El `sync_type` no está en el CHECK** | La corrida no deja fila: invisible, corra bien o mal | `catalogo_tommy` (jul), `articulo_marca` (7-ago) | `SYNC_LOG_TYPES` (`sync-log-tipos.ts:28-58`) + `sync-log-tipos-check.test.ts` |

---

## C · Cuando algo no cuadra, por dónde empezar

```
¿Es un NÚMERO de pantalla que no da con Switch o con otra pestaña?
   → skill `numero-no-cuadra`: reproducir desde switch_facturas con la MISMA ventana,
     paginando; frescura primero (¿cuándo corrió el último sync de ESA empresa?);
     código, no nombre; NC restan; mismos días. Antes, mirar §1 / §5 / §7 para saber
     qué vista o RPC arma ese número.

¿DEJÓ DE LLEGAR un dato (módulo vacío, congelado, dos fallos seguidos)?
   → skill `switch-cambio-algo`: `node scripts/_diag-egresos-log.mjs <fecha>` o
     switch_sync_log por (empresa, sync_type); corte limpio en varias empresas = cambió
     Switch; ver el archivo real antes de tocar el parser; ensanchar el envoltorio,
     nunca aflojar el valor; buscar el descarte silencioso. El eslabón: la fila
     «Se rompe si» del dato en este mapa.

¿FALTA un dato que Switch SÍ tiene y ninguna tabla lo trae?
   → primero este mapa (§1-24) y «Dónde vive cada dato»: ¿de verdad no está? ¿o está
     con otro nombre, en otra empresa, o descartado por el interface (fila «Cae en»)?
   → si no está: skill `traer-reporte-switch` — panel web, avisar empresa y hora,
     madrugada, por meses, cuadrar contra switch_facturas, disco local, nada a la base
     sin que Daniel defina.

¿Es un dato de HOY que el cron todavía no trajo?
   → la fila «Para consultarlo al momento» del dato: «Actualizar ahora» (facturas,
     estadocuenta, recibos, clientes-master, proveedores, catálogos), el botón de
     Referencia, o el MCP Switch — todos abren sesión: respetar los 15 min.
```

Y para saber **en qué eslabón** mirar, la cadena es siempre la misma: **Switch (endpoint/reporte) → sync (`src/lib/switch-api/*.ts`, con su guard) → `switch_sync_log` (¿corrió? ¿qué descartó en `skip_details`?) → tabla → vista/RPC → pantalla.** Un dato viejo se ve en la tabla (`synced_at`); un dato descartado, en `skip_details` y en la línea ámbar de la pantalla; un dato que nunca existió, en la lista de empresas del sync.

---

## D · Contradicciones encontradas (código vs documentos)

Verificadas el 3-sep-2026. Gana el código; lo que hay que arreglar es el doc o el comentario.

| # | Dónde lo dice | Qué dice | Qué es verdad (código) | Estado |
|---|---|---|---|---|
| 1 | `CLAUDE.md` › Dónde vive › proveedores | «Única tabla `switch_*` con soft delete» | `DELETE` real de los ausentes (`sync-proveedores.ts:252-262`); la tabla no tiene `deleted` | ✅ corregido en `CLAUDE.md` |
| 2 | `CLAUDE.md` › Switch Soft | «Upload: 100% manual (drag-drop), no hay API/SFTP» | 25 endpoints en uso y 79 crons (`switch-referencia.md` #15 ya lo marcaba) | ✅ corregido en `CLAUDE.md` |
| 3 | `switch-referencia.md:7` y #16; `switch-panel.md:8`; `client.ts:574` | El PDF del API «no está versionado en el repo», vive en `~/Downloads`; se cita como `docs/api-switch.pdf` | **Sí está**: `docs/switch/api-documentacion.pdf` (commit `d648f4fd`). La ruta citada es la que no existe | ✅ corregido el 3-sep: `switch-referencia.md:7` y #16, `switch-panel.md:8`, `client.ts:574` citan `docs/switch/api-documentacion.pdf` |
| 4 | `client.ts:401-403`, `sync-log.ts:64`, `cron-telemetry.ts:113, 549, 755`, `types.ts` (nota del 0006), `switch-sync/route.ts:22` | «Switch admite UNA sesión **por empresa**» | Es **por usuario** (PDF p. 6; `client.ts:19-23, 266-280`; medido 3-sep). Coincide en la práctica porque el usuario es `daniel` en 7 de 8 | ✅ corregido el 3-sep en los 6 lugares: dicen «por USUARIO (PDF p. 6)» y por qué coincidía (un usuario de API por empresa). La regla de 15 min no cambió |
| 5 | `switch-panel.md` §13 | «Sesión única — NO está documentada» | Documentada en el PDF del API, p. 6 (`switch-referencia.md` Parte 3, #1) | ✅ corregido el 3-sep: §13 cita el PDF p. 6 y conserva los dos barridos negativos (sitio y guías del panel) |
| 6 | `empresas.ts:281, 287`; `sync-recibos.ts:46` | Recibos = «6 B2B + Multifashion, **excluye Boston**» | `confecciones_boston` tiene `recibos: true` (`empresas.ts:138`): son las 8 | ✅ corregido el 3-sep en `empresas.ts:287` y `sync-recibos.ts:50` («las 8», PR #347). `empresas.ts:281` se dejó: habla de **CxP**, y ahí Boston sí está excluida (`cxp: false`) |
| 7 | `sync-acs-fidelizacion.ts:16-18` | «corre en su propio cron (08:15 UTC), espaciado de multifashion-sync (05:00)» | Corre 11:30 y 16:30; `multifashion-sync` se retiró el 26-jul | ✅ corregido el 3-sep: 11:30 y 16:30 UTC, con sus vecinos de `american_classic` (11:50, 15:15, 17:00) |
| 8 | `cron-telemetry.ts:494` | `sync-factura-lineas` «02:30 UTC = 9:30 p.m. Panamá» | `vercel.json:45`: **03:30** (`30 3 * * *`) | ✅ corregido el 3-sep (03:30 UTC = 10:30 p.m. Panamá) |
| 9 | `sync-empresa.ts:297`; `types.ts:163` | «El signo contable lo aplica `switch_ventas_netas_vw`» | Esa vista se **borró** el 26-jul (`20260726210100`); el signo vive en `tipos-comprobante.ts` y en `switch_ventas_unificado_vw` | ✅ corregido el 3-sep en los dos: `signoVenta()` (`tipos-comprobante.ts`) en TS y el CASE de `switch_ventas_unificado_vw` en SQL |
| 10 | `CLAUDE.md` › Dónde vive › Boston | «`switch_estadocuenta_aging_boston` es una **tabla** aparte» | Es una **vista** (`20260728120000…sql:130`) | ✅ corregido en `CLAUDE.md` |
| 11 | `CLAUDE.md` › Dónde vive › costo | `switch_costo_unificado_vw` «vista muerta: cero lecturas en `src/`»; `switch_costo_diario` sin advertencia | La vista **sí** la lee la RPC `ventas_dashboard_summary` (SQL, no TS) y desde el 6-jun se arma sobre `switch_articulo_diario`. La que nadie leía era **`switch_costo_diario`**, que se escribe **1×/empresa/día** en las 8 (aquí decía «4×/día» y era falso: son 4 slots de `tipo=all`, uno por par de empresas). Desde el 3-sep-2026 la lee el cuadre mensual (§4) | ✅ corregido en `CLAUDE.md` (y recorregido el 3-sep) |
| 12 | `CLAUDE.md` › Dónde vive › llegadas | «hay bandera `fob_confiable`» | Es una **función** al leer (`fobConfiable()`, `ingresos-mercancia.ts:251-255`), no una columna | ✅ corregido en `CLAUDE.md` |
| 13 | `CLAUDE.md` › Dónde vive › `switch_articulo_diario` | No dice qué empresas | El cron corre las 8 (`switch-articulos/route.ts:52`); `src/lib/ventas/productos.ts:14-15` dice que Boston no se backfilleó | ✅ anotado en `CLAUDE.md` |
| 14 | skill `traer-reporte-switch` › Paso 2 | «revisar el cuerpo con `esError()`» como si fuera de `web-client.ts` | `esError()` es una copia local de los scripts (`_bajar-acs-*.ts:39, 51`); en `web-client.ts` es `jsonDeSwitch` (`:405-425`) | ✅ corregido el 3-sep: la skill nombra `jsonDeSwitch` (privada de `web-client.ts`) y `esError` como copia local de los scripts |

### Segunda pasada — medido el 5-sep-2026

Lo de arriba se verificó contra el **código**. Esta tanda salió de medir contra **producción** y contra `.env.local`.

| # | Qué decía este documento | Qué es | Cómo se midió |
|---|---|---|---|
| 15 | 🩸 **Las citas de `client.ts` estaban corridas de 4 a 12 líneas** en casi todos los endpoints (`listFacturas` en `:1086` → real `:1078`; `totalventas` en `:1197` → real `:1202`; `listRecibos` en `:1245` → real `:1246`, `logoutAllSwitchSessions` en `:1051` → real `:1062`) | Un commit del 3-sep movió el archivo el mismo día en que se escribió el documento | `grep -n '\`/api' src/lib/switch-api/client.ts`. Corregido, y ahora cada endpoint se cita por **nombre de método** además de la línea |
| 16 | §10: «**Boston no** (su estadocuenta por API no corre): 6.794 filas medidas» | Boston **sí está** en `switch_clientes`, con **4.915 de las 6.800 filas**, y **congelado 898 h** (todas con `synced_at = 2026-07-30 06:31:07`). Desde el 5-sep tiene cron propio, `sync-clientes-boston`, **semanal** (domingos 07:10 UTC) | `select empresa_key, count(*), max(synced_at) from switch_clientes group by 1`. §10 reescrito |
| 17 | §10: «Lo trae: el sync de estadocuenta como paso 1b (`sync-empresa.ts:869-875`)» | El escritor se extrajo a **`src/lib/switch-api/clientes-directorio.ts`** — un solo camino, tres ritmos (las 6 diario, ACS por fidelización, Boston semanal) | `grep -rl 'from("switch_clientes")' src/lib` + los imports de `clientes-directorio` |
| 18 | Sección A: «Credenciales `SWITCH_<EMPRESA>_API_URL / _API_USER / _API_PASSWORD`», sin decir dónde viven | **`.env.local` NO tiene `_API_USER` ni `_API_PASSWORD` de ninguna empresa.** Solo `_API_URL`, `_WEB_USER` y `_WEB_PASSWORD` — 24 variables. El camino del API **no se puede probar en local**; sus credenciales están solo en Vercel | `grep -oE '^SWITCH_[A-Z_]+' .env.local \| sort` (nombres, nunca valores) |
| 19 | «es `daniel` en 7 de 8 empresas» presentado como hecho | Del lado del **API** es un comentario de código, no una medición, y no se puede verificar en local (ver #18). Del lado **web** sí se midió, sin imprimir un solo valor: **7 de las 8 comparten el mismo `_WEB_USER` y una tiene otro**; las 8 `_API_URL` son distintas | `grep _WEB_USER .env.local \| cut -d= -f2- \| sort \| uniq -c` — solo el conteo |
| 20 | §17: «en el 93 % de las líneas FOB = CIF» | Hoy es el **95 %** (30.487 de 32.079 con los dos costos). Y **fashion_shoes casi no entra en esa cuenta**: 3.493 de sus 3.581 líneas (97,5 %) van en `costo_sin_desglosar` | `select empresa_key, count(*) filter (where costo_sin_desglosar is not null), count(*) filter (where abs(costo_fob-costo_cif)<0.005) from switch_ingresos_mercancia group by 1` |
| 21 | §14: «las 1.363 que faltaban drenan solas a 400/día» | Quedan **355**: hay **1.408 de 1.763** con `ficha_at`. Una corrida más | `select count(*) filter (where ficha_at is not null) from switch_articulo_info where empresa_key='active_shoes'` |
| 22 | Nada distinguía «último dato escrito» de «última corrida» | En un sync de escritura selectiva, un `synced_at` de hace 214 h puede convivir con una corrida OK de hace 0,6 h. Trampa nueva en la tabla **B** y sección **A-bis** con la foto completa | `switch_sync_log` por (empresa, `sync_type`) contra `max(synced_at)` de cada tabla |
| 23 | La tabla de tamaños («203 K», «46.556», «2.737»…) venía del 2-sep | Re-medidas todas el 5-sep. Sección **A-bis** | `count(*)` tabla por tabla |

Lo que **no** era contradicción y se confirmó: `SEPARACION_MINIMA_MIN = 15` (`cron-telemetry.ts:773`) · los 6 crons «sin documentar» ya están en la tabla de `CLAUDE.md` · el hover de CXC ya está corregido en `CLAUDE.md:512` · Boston y recibos (corregido el 31-ago) · `/apiarticulos/lista` no trae rubro/subrubro/marca (`sync-articulo-info.ts:69-78`, `client.ts:760-766`) · el parámetro 0072 apagado en las 4 empresas.
