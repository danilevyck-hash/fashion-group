# Post-mortems — Boston y CXC

> Movido de `cxc/CLAUDE.md` el 31-ago-2026 para bajar lo que se inyecta en cada sesión.
> **Nada se resumió ni se borró: el contenido es verbatim**, con sus «Daniel, textual»,
> sus mediciones, sus «Candados», sus «Verificado por mutación» y sus 🩸.
> La REGLA vigente (sin la historia) vive en «Invariantes por módulo» de `cxc/CLAUDE.md`.

---

> ## 🔴 EL CXC DE BOSTON VA APARTE, Y EL DEL GRUPO CONVIVE CON TODO — LA REGLA, TEXTUAL (12-ago-2026)
>
> Daniel, palabra por palabra: *"debe de ser cxc de fashion group y otro aparte de boston, **no deben de ni convivir juntos**. cxc de fashion group **si debe de convivir con todo el sistema** por guias, marketing, clientes, ventas, ect, ect, eso quiero que este muy claro."*
>
> **Son DOS afirmaciones y las dos son la regla:**
> 1. **Boston NUNCA se mezcla con el CXC del grupo.** Ni una fila, ni un número, en ninguna vista, tarjeta, total, lista, export, correo o badge. Se ve SOLO en su pestaña.
> 2. **El CXC del grupo SÍ convive con el resto del sistema** — guías, marketing, clientes, ventas. No se aísla "por las dudas": **aislarlo de más también es un error**, y es el error fácil de cometer justo después de tapar una fuga.
>
> **Fashion Group son SEIS empresas:** `vistana · fashion_wear · fashion_shoes · active_wear · active_shoes · joystep` (= `B2B_EMPRESA_KEYS` = `CXC_GRUPO_EMPRESA_KEYS` = `empresasConCxc()`). **`confecciones_boston` y `american_classic` NO lo son.**
>
> **DÓNDE SE CIERRA: en la vista `switch_estadocuenta_aging`, UNA sola vez.** Ella ES la definición de "cartera del grupo" y todo lo que la lea queda separado sin tener que enterarse. No se blinda pantalla por pantalla: unas 20 rutas leen esa vista, y blindar 20 sitios deja la garantía a cargo de que nadie se olvide — la pantalla 21 que alguien escriba mañana nacería insegura.
>
> 🩸 **Y ya se olvidaron una vez.** La migración del 28-jul (`20260728120000`) le puso el filtro a la VISTA y **se olvidó de su MV** — `switch_estadocuenta_aging_mv`, que había nacido como copia verbatim de su cuerpo y es **lo que lee `/api/cxc/aging`**. Mientras Boston tuvo 0 filas de estado de cuenta no se vio; desde que su cartera se carga (30-jul), la MV empezó a traerla. Medido en producción el 12-ago-2026: **VIEW 211 filas / 0 de Boston · MV 593 filas / 382 de Boston**.
> - **Las tarjetas del panel NO llegaron a mostrar un número inflado, y está medido en el navegador**: `Total $3.718.004,16 · 99 clientes · 0-90d $1.816.089,65 · 91-120d $763.886,47 · 121d+ $1.138.028,04`, iguales antes y después del arreglo. **Lo que las salvaba era una proyección en React** (`roleClients`/`filtered` en `admin/page.tsx`, que se queda solo con las 6 empresas): las 382 filas de Boston llegaban al navegador y ahí se descartaban. La separación estaba a cargo de un `useMemo`.
> - **Lo que ese `useMemo` tapaba**, si se lo quita o si alguien lee el payload crudo: total **$3.905.038,06** (+$187.033,90, la cartera de Boston entera, tramo por tramo) y **476 clientes** en vez de 99. Y como el CXC consolida por `nombre_normalized`, **5 clientes quedarían con las dos deudas SUMADAS en una sola fila** — ALADDIN ($1.247,00 + $11.176,58), LA FRONTERA DUTY FREE ($380.732,79 + $5.077,69), WOLF MALL CENTER INT, CITY MALL PASO CANOA y VENTAS LOCAL —, que es literalmente lo que Daniel prohibió.
> - **El arreglo (`20260812180000_aging_mv_excluye_boston.sql`, la corre Daniel A MANO) NO le agrega el `NOT IN` a la copia.** Eso arreglaría hoy y dejaría el mismo defecto para mañana: dos cuerpos SQL que hay que acordarse de tocar juntos. **La MV pasa a MATERIALIZAR LA VISTA** (`SELECT v.*, now() AS materializado_en FROM switch_estadocuenta_aging v`), así que hereda el filtro, los buckets y el signo defensivo **por construcción** y no puede volver a apartarse. Hay que `DROP` + `CREATE` porque el cuerpo de una MV no se puede reemplazar; es seguro (dato derivado, se repuebla sola) y **no hay ventana ciega**: `/api/cxc/aging` ya cae solo a la VIEW en vivo, que da los números buenos.
> - **La pestaña de Boston no cambia en nada** (`switch_estadocuenta_aging_boston` no se toca). Medida en el navegador antes y después: **382 clientes · $187.033,90 · 0-90 $51.748,18 · 91-120 $13.627,15 · 121+ $121.658,57**.
>
> **Otras dos fugas del MISMO patrón, encontradas en el barrido y arregladas en el mismo PR.** Las dos son "una fila de Boston contestando una pregunta del grupo", las dos son de FRESCURA (no de plata) y las dos son **LATENTES** — hoy no se notan porque Boston va 13 h más atrasada que el grupo (08:10 UTC contra 21:22, medido), o sea que el `MAX` global da justo el del grupo. Latente es el peor estado posible para un vigía: el día que Boston sincronice más tarde, el número se vuelve mentira sin que nada avise.
> - `integrity-checks.ts` → `last_upload_age_cxc` leía `MAX(synced_at)` de `switch_estadocuenta` **sin filtro**: un sync de Boston taparía un atraso real del grupo y el check quedaría verde justo cuando hay que mirarlo. Ahora `.in("empresa_key", CXC_GRUPO_EMPRESA_KEYS)`.
> - `home_dashboard_summary` → `lastUpload` (el "actualizado hace…" del Inicio), lo mismo. DDL aparte: `20260812190000_home_lastupload_solo_grupo.sql`. **Va en un archivo SEPARADO a propósito**: el arreglo de la MV es el urgente y no puede quedar sin correr porque éste falle. Su cuerpo se copió **programáticamente** de la definición vigente y el diff es **UNA línea** — copiar un cuerpo SQL a mano es justo el mecanismo que produjo el bug de la MV. La PLATA del Inicio (`cxcTotal`, `cxcVencida`) ya salía de la vista y **nunca estuvo mal**.
>
> **EL CANDADO: `src/__tests__/lib/cxc-boston-fuera-de-toda-superficie.test.ts`.** No alcanzaba con probar la vista. `boston-no-se-mezcla.test.ts` protege superficies NOMBRADAS a mano (abre `20260728120000` por su nombre y verifica 6 rutas de una lista literal): caza lo que ya se conoce y **no puede cazar lo que se agregue mañana** — que es exactamente cómo se escapó este bug. El candado nuevo son **dos BARRIDOS sin listas de objetos**:
> - **BARRIDO 1 (SQL)** — recorre `supabase/migrations/` ENTERA, arma la definición **FINAL** de cada VIEW / MV / FUNCTION (respetando redefiniciones y `DROP`s) y exige que **todo** lo que lea `switch_estadocuenta` esté acotado: o excluye la cartera aparte, o es de un solo lado, o recibe la empresa por parámetro, o **DERIVA** de un objeto ya seguro. Un test aparte exige que la MV **no** lea la tabla base (o sea: que siga siendo la vista materializada y no una copia).
> - **BARRIDO 2 (TypeScript)** — recorre `src/` y exige que **toda** lectura de la tabla base acote por `empresa_key` en la misma cadena. Comentarios fuera, así que un ejemplo en la documentación no cuenta como filtro.
> - Las excepciones existen pero son **explícitas y con el motivo escrito** (`SQL_PERMITIDOS` / `TS_PERMITIDOS`), y hay tests que fallan si una excepción queda **zombi** (el objeto o el archivo ya no existe). Los dos barridos empiezan con un test que exige encontrar objetos: un parser roto devolvería 0 y todo pasaría en verde sin haber mirado nada.
> - **También se prueba la SEGUNDA mitad de la regla**: que las 6 sean exactamente las 6, que ninguna esté en la cartera aparte, que la vista **excluya en vez de enumerar** (enumerar deja a joystep pudiéndose caer en silencio otra vez — ya costó $15.262) y que Clientes, Ventas, Búsqueda y Vista General **sigan** mirando la cartera del grupo.
> - **Verificado por mutación, 9 de 9 cazadas:** que la MV vuelva a leer la tabla base con filtro (1) o sin filtro (2) · sacarle el `NOT IN` a la vista (4) · revertir el arreglo de `home_dashboard_summary` (1) · revertir el de `integrity-checks` (1) · **agregar una vista nueva de cartera sin filtro** (1) · **agregar una ruta nueva que lea la tabla base sin empresa** (1) · enumerar las 6 en vez de excluir (3) · que la MV pierda `materializado_en` (1).
>
> **Herramientas (solo lectura):** `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-cxc-boston-mezclado.ts` reproduce las tarjetas del panel desde la MV y desde la VIEW, **con y sin la proyección de React**, y lista los clientes que quedarían sumados. `BASE=… node scripts/_medir-panel-cxc-boston.mjs` lo mide en el navegador, en las dos pestañas.
>
> ⚠️ **`cxc_favorites`, `cxc_client_overrides` y `cxc_contact_log` comparten el namespace de `nombre_normalized` entre grupo y Boston** (no tienen columna de empresa): los 5-10 nombres que existen en los dos lados comparten estrella, contacto y correo. **NO es plata y no se tocó** — arreglarlo pide DDL y una decisión de Daniel (¿el contacto de CITY MALL PASO CANOA es el mismo señor para las dos carteras?). Hoy la pestaña de Boston ni siquiera muestra favoritos (`BostonTab.tsx` pasa `esFavorito: () => false`).



---

## 🔴 LA CARTERA DE BOSTON SE CONGELÓ 5 DÍAS Y LA PANTALLA NO LO DIJO — ✅ RESUELTO (24-ago-2026)

> **Switch cambió el motor de sus reportes el 19-ago-2026 a las 12:37:21** y la ruta que usaba `boston-cartera` dejó de existir: `POST /estadodecuenta/obtener` pasó a devolver la página de excepción de Switch con `Controller method not found` adentro. Último sync bueno: **19-ago 03:10**. Primer fallo: **20-ago 03:10**. Cinco corridas seguidas caídas (20, 21, 22, 23 y 24).
>
> ⚠️ **NO ES LA SESIÓN NI LAS CREDENCIALES**, y se descartó midiendo: el login funciona, la página del reporte carga (74 KB) y el archivo nuevo del panel es **idéntico en las 8 empresas** — Switch actualizó a todas. Boston es la única que se rompe porque es la única que usa ese reporte.
>
> ### 🩸 LO PEOR NO FUE LA CAÍDA: FUE QUE NADIE SE ENTERÓ
>
> Dos vigías tenían que haber avisado y ninguno lo hizo, cada uno por su lado:
> - **La pestaña de Boston no menciona la fecha del dato ni una vez.** Mostraba `$187.018,00 · 383 clientes` como si fuera de hoy, y era del 19-ago. **Un número viejo presentado como actual es peor que no tener número**: con el número ausente uno pregunta; con el número puesto, uno cobra.
> - **La regla 1 («un dato que mirás está viejo») excluía a Boston**, con un motivo que se había vencido hacía tres semanas (ver el bloque de `EMPRESAS_ESTADOCUENTA_FUERA_DE_CRON`).
>
> ### 1. La pestaña dice de cuándo es su plata
>
> **`BostonTab.tsx` monta el MISMO `<SyncStatus />`** que el panel del grupo ya montaba en `admin/page.tsx` y en `PanelCxcMobile.tsx` — misma tabla, mismo umbral de 26 h, mismo ámbar. **No es un aviso nuevo ni una alerta nueva**: lo único que cambia es a qué empresa le pregunta. Arriba de todo, antes de las píldoras: `Actualizado: 18 ago 2026, 10:10 p m` y, cuando el dato pasa el umbral, `⚠️ Confecciones Boston sin actualizar desde 18 ago`.
> - 🔴 **Y NO MEZCLA.** La lista de empresas se DERIVA de `empresasCarteraAparte()` (= `estadoCuenta:true` + `cxc:false`, o sea SOLO Boston) en vez de escribirse a mano en la pestaña, que es la misma regla que ya cumple `switch_estadocuenta_aging`: una lista paralela es la que un día se aparta en silencio. `/api/sync-status` consulta **por empresa** (`.eq("empresa_key", …)`), así que ni una fila del grupo entra acá — y el BARRIDO 2 de `cxc-boston-fuera-de-toda-superficie.test.ts` lo sigue vigilando.
>
> ### 2. Boston entra en la regla 1, que ya existía
>
> `empresasDe("cartera")` pasó de `empresasConCxc()` filtrado por `EMPRESAS_ESTADOCUENTA_FUERA_DE_CRON` (un filtro que además era **no-op**: Boston es `cxc:false`, así que nunca había estado adentro) a **`empresasConEstadoCuenta()`** — las 6 del grupo **+ Boston**, o sea *toda cartera cuyos saldos traemos y que alguien mira en una pantalla*.
> - 🔴 **NO ES UNA CUARTA ALERTA.** Es la regla 1 de siempre, con el mismo umbral de 24 h, el mismo dedup de 20 h y el mismo canal 🔧 SISTEMA. La lista de reglas **no crece**.
> - ⚠️ **Tampoco mezcla:** la medición es **por empresa** (una consulta con `.eq`, nunca un `MAX` global) y el mensaje **nombra** a cada una. No hay un total, ni una suma, ni una fila de Boston contestando una pregunta del grupo. Lo único que comparten es la frase *"la cartera está vieja"*, que no es plata.
> - 🔑 **El invariante que reemplaza a la vieja exclusión, y que NO envejece:** *toda empresa vigilada tiene que tener un cron que le refresque la cartera* — las 6 por `switch-sync estadocuenta`, Boston por su `boston-cartera` de las 08:10 UTC. Antes la protección contra la alerta-que-suena-para-siempre era una lista de empresas a no mirar (y se quedó vieja el día que el cron se arregló); ahora es una condición que se verifica sola contra `SWITCH_CRON_ENTRADAS`. ⚠️ `switch-sync all 0630` también NOMBRA a Boston y **no la certifica**: no le trae la cartera (la excluye `empresasConEstadoCuentaEnCron`).
> - ⚠️ **Mientras el reporte siga roto, esto va a sonar una vez por día.** Es lo que Daniel pidió y es lo correcto —el dato está viejo de verdad y hay que actuar—, pero **el día que la alerta deje de tener acción posible, la salida NO es volver a excluir a Boston**: es arreglar el sync.
>
> ### 3. ✅ LA BAJADA VUELVE A FUNCIONAR — el motor nuevo (24-ago-2026)
>
> El reemplazo **no se adivinó**: se leyó del propio código del panel y se ejecutó contra producción ANTES de escribir una línea de parser. Está en `assets/js/reportesmanager.js` y `assets/js/estadodecuenta.js`, que se bajan con la sesión abierta.
>
> ```
> 1. POST reportesmanager/crearreporteconsola      → {response:true, uuid, estatus:"CREADO"}
> 2. GET  reportesmanager/buscarreporteconsola/<uuid>  cada 2.000 ms
>      → {response, estatus, data:{data:[…], totales:{…}}}
>      TERMINADO = listo · ERROR/CANCELADO = cortar · otro = seguir
> ```
>
> 🔑 **Es un UUID, no un número de orden** (`61bfc136…`), y los parámetros salen del botón que dibuja la antigüedad: `generarEstadoCuentaCliente(today, today, '4')` → **`desde = hasta = hoy`, `claseReporte:'4'`, `tipoReporte:'ESTADOCUENTACLIENTE'`**. Sin `tipoReporte` el endpoint contesta `{"error":"TIPO_REPORTE_REQUERIDO"}`. **Ya NO hay rondas** (`chunk`/`key`): el universo llega completo en la respuesta del uuid.
>
> **Lo que cambió de nombre**, campo por campo — `elements[]` → **`comprobantes[]`**, `secuencial` → `nSistema`, `numeroFiscal` → `nFiscal`, `fechaCreacion` → `fecha`, `codigo`/`nombre` → `clienteCodigo`/`clienteNombre`, y los totales dejaron de ser el array `saldosTotales[{title,saldo}]` para ser el objeto **`totales{bucket: valor, total}`**. `abrev` y `numeroOrden` ya no vienen.
>
> 🔴 **EL `saldo` POR DOCUMENTO YA NO EXISTE Y NO SE ADIVINA: SE DERIVA.** El reporte trae `saldoAcumulado`, que es el **corrido del cliente**, no del documento (en el caso real: 25,15 y después 266.541.377,15). El aporte propio de cada movimiento es **`debito − credito`**. No es una corazonada: **cuadra al centavo** contra los `totales` que publica Switch, en las tres franjas, y si algún día dejara de cuadrar `cuadraConSwitch` corta la corrida y no se escribe nada.
>
> ⚠️ **`switch_estadocuenta` NO se enteró.** El módulo puro trae un ADAPTADOR (`adaptarReporteConsola`) que traduce el formato nuevo al viejo, así que `construirFilas`, la tabla de signos, `ccteIdSintetico`, el cuadre, el guard de montos y el reconcile **no se tocaron** y sus candados siguen valiendo tal cual. El `ccte_id` sigue saliendo del secuencial, que en el formato nuevo es `nSistema` y tiene el MISMO formato `serie-correlativo`.
>
> **Certificado contra producción el 24-ago-2026** (`scripts/_diag-boston-cartera.ts`, solo lectura): **386 clientes / 932 documentos, uuid TERMINADO en ~4 s (1 sondeo)**, cuadre ✅ al centavo, y contra la base **882 documentos pareados por secuencial con 0 diferencias** en |saldo|, tipo y cliente — la misma certificación que se le hizo al camino viejo el 30-jul.
>
> ### 4. 🔴 EL GUARD DEL REPORTE INCOMPLETO — el que impide poner saldos buenos en CERO
>
> El reconcile pone `saldo = 0` a TODO documento que la corrida no reescribió. Eso es correcto cuando el universo llegó entero y es una **catástrofe** cuando llegó a medias: cada cliente que faltara quedaría con la deuda en cero, en silencio y con la corrida anotada `success`.
>
> ⚠️ **Y el cuadre NO cubre esto**, que es lo que lo hace fácil de pasar por alto: compara nuestros totales contra los `totales` **del mismo reporte**, así que un reporte corto **cuadra al centavo consigo mismo**. Son guardas de cosas distintas — el cuadre dice *"leí bien lo que me mandaron"*, éste dice *"me mandaron todo"*.
>
> **`PISO_CLIENTES_REPORTE = 0.7`**, el mismo piso y el mismo patrón que el guard de barrido corto de `sync-articulo-marca`. La vara son los **clientes con saldo != 0 que la tabla ya conoce** — exactamente los que el reconcile zerearía —, no todos los clientes: hay 496 distintos pero 113 ya están en cero de reconciles anteriores, y contarlos correría la vara sin motivo. Medido el 24-ago: la tabla conoce **383** y el reporte trae **386**. Con la tabla vacía no hay vara y se deja pasar (primera carga). **Un dry-run corto también falla**, a propósito: un dry-run existe para saber si la corrida de verdad se podría escribir.
>
> ### Candados
>
> **`src/__tests__/lib/boston-cartera-consola.test.ts` (25)** — el mapa de nombres campo por campo, los totales, el guard, el transporte por uuid, y el **CUADRE contra una muestra REAL de producción** (`fixtures/boston-cartera-consola.json`: 6 clientes, 37 documentos, los 6 tipos de comprobante y las 3 franjas con plata). Sus `totales` salen de sumar los `buckets` que Switch publica cliente por cliente, o sea **aritmética suya**: nosotros sumamos documento por documento con `dias` y ellos por bucket, así que el cuadre compara dos caminos independientes. Más 3 casos de CONDUCTA en `boston-cartera-web.test.ts` que llaman al sync de verdad y verifican que un reporte corto **no escribe ni una fila**.
> - **Verificado por mutación, 14 de 14 cazadas** (`bash scripts/_mutar-candados-boston-consola.sh`): el saldo suma en vez de restar el crédito · usa `saldoAcumulado` · el secuencial sale de `nFiscal` · la fecha sale de `fechaVence` · los totales dejan de descartar `total` · `claseReporte` 1 en vez de 4 · otro `tipoReporte` · los geográficos vuelven a `"null"` · deja de reconocer la página de excepción · ignora ERROR/CANCELADO · acepta un crear sin uuid · el guard deja pasar todo · el piso baja a 0 · el guard se calcula y no corta.
> - 🩸 **El verificador de mutaciones se corrigió a sí mismo**: una de las 14 no matcheaba nada, el archivo quedaba intacto, los tests pasaban y el reporte decía *"SOBREVIVIÓ"* — acusaba al candado de un agujero que no existía. Ahora `mutar()` exige que el archivo CAMBIE (md5 antes/después) y aborta el informe entero si alguna es no-op.
>

---

> ## 🔴 SWITCH REINICIÓ LA NUMERACIÓN Y LA CARTERA DE BOSTON SE IDENTIFICABA SOLO POR EL NÚMERO — ✅ RESUELTO (25-ago-2026)
>
> **El mismo `secuencial`, en la misma empresa y con el mismo tipo, nombra DOS documentos distintos separados por años.** Medido en producción, **52 grupos** así:
>
> ```
> confecciones_boston  11-000000009 → Factura 2022-10-14 $285,16 · Factura 2026-07-23 $271,25
> confecciones_boston  13-000000003 → NC      2022-12-13 $9.955,60 · NC     2026-03-19 $187,79
> ```
>
> **Solo Boston está expuesta.** Las otras 7 empresas usan el `ccte_id` **nativo** que trae el API; Boston lo DERIVABA del `secuencial` (`serie × 10⁷ + correlativo`) porque su cartera baja por el reporte web. Dos documentos distintos daban la MISMA fila y el upsert por `(empresa_key, ccte_id)` colapsaba uno **en silencio** (lotes distintos) o **reventaba la corrida** (mismo lote).
>
> 🩸 **Y ningún guard lo tapaba, por dos motivos que valen la pena recordar:**
> - El guard de colisión de `construirFilas` **solo cortaba cuando dos secuenciales DISTINTOS daban el mismo id**. Dos documentos con el **MISMO** secuencial ni lo despertaban — había un test que lo declaraba: *"el MISMO documento repetido no es una colisión"*. **Esa suposición era justo la que rompía el reinicio de serie.**
> - `cuadraConSwitch` **tampoco puede verlo**: el resumen se calcula sobre las filas **ANTES** del upsert, así que cuadra al centavo contando los dos y recién después el upsert colapsa uno.
>
> ### 1. La identidad lleva el AÑO adentro
>
> ```
> ccte_id = serie × 10.000.000 + (año − 2000) × 100.000 + correlativo
> ```
>
> y **se lee de corrido en decimal**: `11-000000009` del 2026 da `112600009`, o sea `11` · `26` · `00009`. Que sea legible no es cosmético — es lo que deja auditar una fila sin volver a correr nada.
> - **Techo verificado**: 200×10⁷ + 99×10⁵ + 99.999 = **2.009.999.999** < 2^31−1. El presupuesto de un `int` no da para más: con serie ≤ 200 y 100 años, el correlativo no pasa de ~107.000, así que los **100.000** de la fórmula son el máximo redondo que entra. Medido en producción: serie máx **155**, correlativo máx **7.649**, años **2022-2026**, **0** documentos sin fecha.
> - **Disjunto de los ccteId reales por CONSTRUCCIÓN**: el mínimo que produce es 10.000.000 y el ccte_id real más alto de toda la tabla es 16.388.
> - 🔴 **Un documento sin fecha, o con el año fuera de 2000-2099, se RECHAZA** y va a `skip_details`. Como el resumen se arma solo con lo que sí se construyó, ese rechazo **desarma el cuadre** y la corrida entera se corta sin escribir. Preferimos la cartera de ayer entera y un error a la vista, que la de hoy con un documento menos.
>
> ### 2. El guard CAMBIÓ DE DIRECCIÓN
>
> La identidad de un documento son **tres campos: secuencial + fecha + monto**. Un secuencial repetido con **cualquier** diferencia **corta la corrida**; solo la repetición EXACTA se deja pasar (el upsert la colapsa). Con el año adentro del id, el caso que motivó todo ni llega al guard —2022 y 2026 dan ids distintos y conviven como dos filas—; lo que queda para el guard es lo que el año no puede separar (mismo secuencial en el MISMO año), y eso, en vez de pisarse, corta. **Fail-closed y ruidoso, nunca una fila pisando a otra.**
>
> ### 3. El orden: la cartera nunca queda en cero ni a medias
>
> El reconcile pone `saldo = 0` a todo lo que tenga `synced_at < runStamp`, así que al cambiar el `ccte_id` las filas viejas quedan huérfanas. **El orden `upsert → reconcile` es lo que lo hace seguro**: primero entra la generación nueva CON su plata y recién después se cierra la vieja, así que la cartera **nunca pasa por cero ni por un total corto** — el único estado transitorio posible es "de más", y dura lo que tarda un UPDATE. Invertirlo (reconcile primero) la dejaría en CERO, y hay una mutación que lo caza.
>
> **La transición ya ocurrió, una sola vez, medida contra producción el 25-ago-2026:** 931 documentos escritos con la identidad nueva, 931 filas viejas cerradas, y la pestaña **idéntica antes y después, POSICIÓN POR POSICIÓN, campo por campo** — `$198.296,55 · 386 clientes · 0-90 $60.730,75 · 91-120 $16.002,61 · 121+ $121.563,19` —, y el grupo también (`$3.515.744,63 · 98 clientes`, 209 filas de vista). ⚠️ El documento de **$266.541.352** lo sigue rechazando el guard de montos: **está mal EN SWITCH** y es un pendiente de Daniel, no de acá.
>
> ⚠️ **Al comparar dos fotos de `switch_estadocuenta_aging`, el orden hay que fijarlo en el cliente**: la vista tiene una fila por (empresa, cliente) y ordenar solo por `codigo` deja empates que PostgREST devuelve como le conviene — dos fotos idénticas se ven distintas. `scripts/_comparar-fotos-cartera.mjs` ordena por la fila entera.
>
> ### 4. Las 2.178 filas muertas
>
> Boston arrastraba **1.069 filas zombi** del sync viejo por API (`ccte_id` nativo, sincronizadas el 28-30 de julio) y la transición sumó **1.109** más de la identidad vieja. **Las 2.178 en saldo $0,00**, verificado antes de tocarlas; la vista de aging ya las excluía, así que **no mueven plata** — solo ensuciaban cualquier conteo. Se barren en `20260826150000_boston_barrer_filas_muertas.sql` con la **LISTA EXPLÍCITA de cada `ccte_id`, nunca un `LIKE` ni un rango**, más un `COALESCE(saldo,0)=0` de cinturón por si alguna tuviera plata el día que corra. La lista la arma `scripts/_generar-sql-limpieza-boston.ts` (solo lectura), que **se niega a escribir el SQL** si encuentra una con saldo.
>
> ### Candados
>
> **`src/__tests__/lib/boston-cartera-web.test.ts` — sección D (la llave) y sección F (CONDUCTA).** La F llama al **sync de verdad contra un doble** y mira **qué filas se escribieron y en qué orden**: el bug vive en la juntura `cuadre → upsert`, y un test de `construirFilas` sola nunca lo vería porque ahí las dos filas están. Se prueba el caso real de punta a punta (dos ccte_id, `$556,41` completos), que el reconcile va después del upsert, y que una colisión o un documento sin fecha **no escriben NI UNA fila**.
> - **Verificado por mutación, 13 de 13 cazadas** (`bash scripts/_mutar-candados-identidad-boston.sh`, primera mitad): la identidad vuelve a ser solo el número · todos los documentos usan la misma fecha · el factor del año es 0 · una fecha inventada tapa la que falta · el año se envuelve fuera de la ventana · el guard vuelve a mirar solo el secuencial · la identidad deja de mirar la fecha · deja de mirar el monto · el guard se calcula y no corta · la fila guarda otra fecha que la de su id · un correlativo de 6 dígitos pisa los dígitos del año · **el reconcile corre ANTES del upsert** · el cuadre se calcula y no corta.
>

---

> ## 🔴 EL MÓDULO CONFECCIONES BOSTON — el espejo de la regla de Boston (27-ago-2026)
>
> Daniel, textual: *"si crea el usuario david, david debe de ver cxc boston… el es mi hermano y ve toda la operacion de confecciones boston, **no quiero que vea info de fashion group**"*.
>
> 🔴 **SON DOS REGLAS OPUESTAS Y LAS DOS VALEN AL MISMO TIEMPO.** La de siempre (§ arriba, 12-ago) garantiza que **Boston no se mezcle con el grupo** y se cierra en `switch_estadocuenta_aging`. Ésta garantiza lo contrario: que **quien ve Boston no vea el grupo**. La primera protege la PLATA del grupo de las filas de Boston; ésta protege a David de VER la plata del grupo. **Un cambio que "arregle" una rompiendo la otra no es un arreglo.**
>
> ### El molde es `gerente_acs`, y se copió — no se inventó nada
>
> Jennifer ya había resuelto el mismo problema: un rol con UN solo módulo, auto-redirigido ahí desde `/home`, y con 403 en las rutas de todos los demás. `gerente_boston` usa el MISMO mecanismo, y su candado (`boston-acceso.test.ts`) es el gemelo de `multifashion-acceso.test.ts`.
>
> **Fuente única: `src/lib/boston/rol.ts`.** El rol, la empresa, la key del módulo, los roles que entran, las pestañas y la línea de los sueldos viven ahí y las leen la navegación, las rutas y la pantalla. Es la lección literal de `boston-roles.ts`: la lista que vivía adentro de un route y la copia que la UI no miraba dejaron a los 3 vendedores tocando una pestaña que siempre les contestaba 403.
>
> ### Las SEIS pestañas de `/boston`
>
> | Pestaña | De dónde sale | Acotada a Boston por |
> |---|---|---|
> | **Inicio** | `/api/boston/inicio` — cartera, ventas del mes/año, personas en planilla y con préstamo | `.eq()` en las 4 consultas |
> | **Por cobrar** | el **MISMO** `<BostonTab />` contra el **MISMO** `/api/cxc/boston` | `switch_estadocuenta_aging_boston`, disjunta por construcción |
> | **Ventas** | `/api/boston/ventas` ← `ventas_rollup_mensual_mv` | `.eq("empresa_key", EMPRESA_BOSTON)` |
> | **Clientes** | `/api/boston/clientes` ← `switch_clientes` + la cartera de Boston | `.eq("empresa_key", EMPRESA_BOSTON)` |
> | **Planilla** | el **MISMO** `/api/asistencia/planilla` y el MISMO motor | la empresa la **FUERZA el servidor** |
> | **Préstamos** | `/api/boston/prestamos` — **TODOS**, la única excepción | ⚠️ ninguna, a pedido de Daniel |
>
> 🔑 **NINGUNA cuenta se reimplementó.** La cartera es la misma vista, la planilla es el mismo motor que la contadora cuadró al centavo contra su Excel, las ventas salen del mismo rollup que usa `/api/ventas/resumen-anual`, y el saldo de un préstamo sale de `calcularSaldoPrestamo` — la función que se **extrajo** de `PrestamosClient.tsx` para que las dos pantallas la compartan. Dos definiciones de "lo que debe" son dos números que un día no coinciden: es el error que ya costó la MV de la cartera.
>
> ### 🔴 LAS DOS FUGAS, tapadas
>
> **1 · LA BÚSQUEDA GLOBAL.** Cubre 8 módulos: si David teclea «City Mall» no puede recibir clientes, ventas ni cheques del GRUPO. Está cerrada por los DOS lados y **ninguno hizo falta agregarlo**: `/api/search` ya exige `["admin","secretaria","vendedor","bodega","contabilidad"]` (→ 403), y `/home` solo le dibuja la barra a admin y secretaria. Lo que se agregó es el **candado**, en las dos direcciones.
>
> **2 · EL INICIO DEL GRUPO.** David nunca llega a `/home`: su único módulo es `boston`, y el auto-redirect de "rol con un solo módulo" —el mismo que ya manda a Jennifer a `/multifashion`— lo lleva directo a `/boston`. El Inicio de Boston es lo que hace que ese destino tenga algo que mostrar.
>
> ⚠️ **Y el CXC del GRUPO también le contesta 403** (`/api/cxc/aging` ya exigía admin/secretaria/vendedor), que es la fuga que más importa después de esas dos.
>
> ### 🔴 LOS SUELDOS SON UNA LÍNEA — la pregunta que Daniel no contestó
>
> `VE_SUELDOS_DE_BOSTON = false` en `lib/boston/rol.ts`. **Por defecto David NO ve los sueldos de las 21 personas**: mostrar de más un sueldo no se puede deshacer. El día que Daniel diga que sí, el cambio es **esa línea y nada más**.
>
> 🔑 **El recorte va en el SERVIDOR, y eso es lo que hace que la línea alcance** — es el mismo mecanismo de `soloApruebaRoles()` (Julio Garay aprueba horas extra y la ruta le contesta sin el bloque de dinero). Esconder la columna en la pantalla dejaría el sueldo viajando en el JSON.
> - **Se ENUMERA lo que viaja, nunca lo que se va** (`CAMPOS_SIN_DINERO`): un `delete linea.dinero` deja pasar cualquier campo de plata que alguien agregue mañana. Y no era solo `dinero`: la línea lleva **SEIS** campos con plata adentro (`salarioMensual`, `baseSeguros`, `quincenalReferencia`, `extraMedido.monto`, `dinero`, `manuales`).
> - **Tampoco viaja el MONTO de las extras**: 5,5 h a 1,25 por $43,45 dice que la rata es $6,32, y de la rata sale el mensual. Las horas sí viajan enteras — es la operación de Boston, que es justo lo que él tiene que ver.
> - **La EMPRESA la fuerza el servidor**, no se valida: un `?empresa=vistana` de un marcador viejo devuelve Boston, no un 400 que deje la pantalla en blanco.
>
> ### ⛔ LO QUE QUEDÓ AFUERA, y por qué
>
> - **CATÁLOGOS.** Las cuatro marcas (Reebok, Joybees, Tommy, Calvin) son de `active_shoes`, `joystep`, `fashion_shoes` y `vistana` — **cuatro empresas de Fashion Group**. No existe un catálogo de Confecciones Boston. Darle esa ficha sería darle un hub de marcas del grupo y una puerta hacia sus clientes (`clientes-switch`, `clientes-search`) y sus pedidos. **Es la única de la lista aprobada que contradice la frase de Daniel, y por eso se paró en vez de construirla.** Decisión suya.
> - **GUÍAS**, que él mismo excluyó.
> - **La UTILIDAD de las ventas de Boston.** El rollup trae `costo_total` y `utilidad`, pero Boston es **`utilidad: false`** en `EMPRESA_SYNC_CAPABILITIES`: ese reporte nunca se sincronizó ni se certificó, y los márgenes que salen oscilan entre 12% y 53% de un mes al otro. Publicar un margen que nadie cuadró es peor que no publicarlo — con eso se ponen precios. La pantalla lo DICE, y la bandera se **deriva** de `empresasConUtilidad()`: el día que Daniel encienda el sync, se entera sola.
> - **PRÉSTAMOS: solo lectura.** El módulo de Contabilidad tiene 6 rutas con 9 verbos de escritura (y 3 ni siquiera pasan por `requireRole`). Sumarle el rol le habría abierto los nueve de una. `/api/boston/prestamos` tiene **UN solo verbo, GET**: no hay nada que gatear porque no hay nada que escribir, y la pantalla de la contadora no se tocó ni un carácter.
>
> ### 🩸 Las 6 pestañas NO entraban en el iPhone — medido, no supuesto
>
> La tira desbordaba **164 px a 390** y «Préstamos» —la última— quedaba fuera de la pantalla, alcanzable solo arrastrando. Es el MISMO defecto que Multifashion pagó al pasar de 5 a 6 sub-tabs. El arreglo es el suyo: `text-xs` + `px-1` por debajo de `lg`, el contenedor recupera su propio relleno, y **«Cuentas por Cobrar» pasó a «Por cobrar»** — que es exactamente lo que ya dice la tarjeta del Inicio que lleva ahí: la puerta y el destino se llaman igual. Medido: **164 px → 0**.
> - ⚠️ **El rótulo más corto medía 41 px de ancho** (la altura ya cumplía los 44). Se le puso `min-w-[44px]` y se volvió a medir la tira: sigue en 0.
> - 🔑 **Texto NUEVO va a 12 px, no a 11.** Los 11 px de los módulos viejos son PRE-EXISTENTES y se respetan donde están; un rótulo nuevo no nace bajo el piso. Los 7 que salieron a 11 px se subieron.
>
> ### Medición
>
> **Los 3 anchos + el iPad ACOSTADO, en el navegador contra el build de PRODUCCIÓN y con datos de producción** (`BASE=… TOKEN=<session_token vivo> node scripts/_medir-boston-anchos.mjs`, solo lectura — el navegador **aborta todo pedido que no sea GET/HEAD**): **390 · 834 · 1024 · 1440 × las 6 pestañas = 24 casos → 0 px de arrastre de página y 0 px de desborde de la tira, en los 24.**
>
> | | mis pantallas (inicio · ventas · clientes · planilla · préstamos) | pestaña CXC |
> |---|---|---|
> | táctiles < 44 px | **0** | 391 / 391 / 394 / 394 |
> | textos < 12 px | **0** | 8 / 8 / 14 / 14 |
>
> 🔴 **Y los de la pestaña CXC son PRE-EXISTENTES, comprobado midiendo — no afirmado.** `scripts/_medir-boston-baseline-cxc.mjs` mide el MISMO `<BostonTab />` donde ya vive hoy (`/admin?tab=boston`, con sesión de admin) y lo compara contra `/boston?tab=cxc`: **IDÉNTICO en los cuatro anchos**, 391 filas en las dos. Los recortes que quedan son los `truncate` del nombre del cliente — puntos suspensivos, o sea el mecanismo, no un defecto.
> - 🩸 **Gotchas de medición, todos ya documentados en este archivo y todos vigentes:** no alcanza con FIRMAR la cookie (el middleware valida el `sessionToken` contra `user_sessions`, así que se toma prestado —solo leyendo— un token vivo y se le firma encima el rol a medir); `useAuth` no mira el rol sino `sessionStorage`; y hay que matar el service worker antes de navegar. **El script FALLA si no encuentra las 6 pestañas o si una pantalla sale vacía**: medir cero y darlo por bueno es el peor resultado posible.
>
> ### Candados
>
> **`src/__tests__/lib/boston-acceso.test.ts` (57)** — el inventario de `/api/boston/**` congelado, que ninguna ruta lea la empresa de la URL, que Boston sea su ÚNICO módulo rol por rol, el auto-redirect, y **CONDUCTA: los handlers REALES de 14 rutas ajenas le contestan 403 con cookie FIRMADA** —búsqueda global, CXC del grupo, Ventas, Comisiones, Proveedores, Gastos, Marketing, Caja, Packing, Directorio, Multifashion y la escritura de Préstamos— **más que esas mismas rutas SÍ dejen entrar a `admin`**, sin lo cual el 403 no probaría nada. Y `boston-david-sin-contrasena.test.ts` (5), que llama al login REAL.
> - **Verificado por mutación, 23 de 23 cazadas y 0 sobrevivientes** (`python3 scripts/_mutar-candados-boston.py`): el módulo se abre a otro rol · David gana un segundo módulo · el rol deja de existir · **la búsqueda global se le abre** · **/home le dibuja el buscador** · **/home pierde el auto-redirect** · **el CXC del grupo se le abre** · una ruta escribe su propia lista de roles · una ruta queda ABIERTA · una ruta lee la empresa de la URL · una ruta escribe la empresa a mano · **la planilla deja de recortar el dinero** · el recorte alcanza a todos · **la línea deja pasar el sueldo mensual** · **deja pasar el monto de las extras** · **la planilla deja de forzarle la empresa** · la planilla le contesta 403 · **la cartera de Boston se le cierra** · **los favoritos del grupo se le abren** · los de Boston se le cierran · Catálogos vuelve como pestaña · una pestaña inventada se acepta · aparece una ruta nueva sin que nadie la mire.
> - 🩸 El script trae una **mutación de CONTROL que a propósito no matchea**: si no sale ⛔, el denunciador está roto y todos los ✅ valen lo mismo que un barrido vacío. Restaura **por COPIA** (hay archivos NUEVOS y `git checkout` aborta el comando entero), el reemplazo es **LITERAL** (el código real tiene `||` y `/`, y con `perl -0pi -e 's|A|B|'` el delimitador se des-escapa y se come el archivo), y **exige que vitest haya COLECTADO tests** antes de creerle a un cero.
> - **Dos candados existentes CAMBIARON DE DIRECCIÓN, y los dos hicieron su trabajo:** `cxc-boston-permiso.test.ts` congelaba `ROLES_BOSTON = ["admin","secretaria"]`, y `comisiones-contabilidad.test.ts` exige que el mapa rol→Comisiones cubra TODOS los roles del sistema — o sea que **obligó a decidir por escrito** que David no ve Comisiones (son de las SEIS empresas del grupo, y Boston además no comisiona en este sistema).
>
> ### 🔴 LA CONTRASEÑA DE DAVID NO ESTÁ EN NINGÚN LADO DEL REPO
>
> El usuario se creó (`20260827120000_boston_rol_y_usuario_david.sql`, corrida y verificada) con `role = gerente_boston`, activo, y **un centinela en vez de una contraseña**. El login de este sistema es SOLO por contraseña, así que escribirla acá la dejaría en texto plano en el repo y en el historial de git, para siempre.
>
> **`isHash()` en `src/app/api/auth/route.ts` saltea toda contraseña que no empiece con `$2a$`/`$2b$`, así que el login es IMPOSIBLE hasta que alguien le ponga una de verdad.** Fail-closed por construcción, y probado por CONDUCTA llamando al handler REAL: el centinela da 401, una contraseña bien hasheada da 200, y cuando David tenga la suya entra con `modules: ["boston"]` — o sea el único módulo que dispara el auto-redirect.
>
> 🔑 **DÓNDE SE LE PONE:** Daniel entra a **Usuarios** (`/admin/usuarios`), toca **david**, escribe la contraseña y guarda. Eso la hashea con bcrypt(10) y verifica que no choque con la de nadie más (mínimo 8 caracteres).


---

> ## 🔴 DAVID VE EL CATÁLOGO — solo VER, y su casa sigue siendo Boston (27-ago-2026)
>
> Daniel, textual: ***«catalogo para david si, solo eso»***.
>
> ### Este bloque CAMBIÓ DE DIRECCIÓN, no se borró
>
> El #659 dejó Catálogos AFUERA a propósito y el motivo era bueno: las 4 marcas (Reebok, Joybees, Tommy, Calvin) son de `active_shoes`, `joystep`, `fashion_shoes` y `vistana` — **cuatro empresas de Fashion Group** —, no existe un catálogo de Confecciones Boston, y la frase de Daniel era *«no quiero que vea info de fashion group»*. **Se paró en vez de construirlo y se le pasó la decisión. Él decidió que sí, sabiendo eso.** Lo que se movió es su decisión, no el mecanismo.
>
> ### 🔴 QUÉ SE LE ABRIÓ, EXACTAMENTE — DOS superficies, medidas ruta por ruta
>
> `gerente_boston` entró a **UNA** lista, `CATALOGO_ROLES` (`lib/catalogo/roles.ts`), y solo dos cosas la leen: el **hub** `/catalogos/marcas` y el **GET** de `/api/catalogo/[marca]/products`. Todo lo demás del módulo deriva de otra lista y **le contesta 403**, medido con cookies FIRMADAS contra los handlers REALES en las **4 marcas**:
>
> | | |
> |---|---|
> | **VE** | el hub · el catálogo por marca (fotos, código, nombre, existencia, disponibilidad y el **precio de VENTA**) |
> | **403** | la lista de comprobantes · el feed del panel de admin · crear un pedido · exportarlos a Excel · mandarlo por correo · el checkout · editar un producto · el directorio de **clientes de Switch** · los **vendedores de Switch** · la búsqueda del directorio · el estado del sync · el permiso de precio |
>
> 🔑 **Y por eso NO es «como bodega».** Bodega entró a `COMPROBANTES_ROLES` el 25-ago; **David no**. Los pedidos de esas 4 marcas traen el **cliente** y el **monto** de cada venta del grupo — justo lo que la regla de Boston protege. **Ver ≠ ver los pedidos.**
>
> 🔑 **EL CATÁLOGO NO MUESTRA COSTO NI MARGEN, y no es una decisión de la lista de roles: es la forma de la consulta.** `MARCAS_CONFIG[*].products.cols` enumera las columnas que viajan y la única de plata es **`price`** — el precio de VENTA, el mismo que ve el cliente final en el catálogo público. No hay `costo`, `cif`, `fob` ni `margen` en ninguna de las 4 marcas, y hay un caso que lo lee sobre la **respuesta REAL**, no sobre la constante. El margen del grupo vive en OTRO módulo (Ventas › Referencia) y ahí le sigue dando 403.
>
> ⚠️ **Lo que SÍ ve del grupo, dicho de frente:** el catálogo de venta de 4 marcas del grupo —fotos, códigos, existencias y precio de lista—, que es exactamente lo que Daniel pidió. **Es información del grupo.** No es plata (ni cartera, ni ventas, ni márgenes, ni clientes, ni pedidos), pero no es cero.
>
> ### 🔴 SIGUE SIN SER UNA PESTAÑA DE `/boston`
>
> Las 6 pestañas (`PESTANAS_BOSTON`) **no se tocaron**: son de Confecciones Boston, y el catálogo es del grupo. Meterlo ahí diría que es parte de su empresa, que es falso. Vive donde vive para todo el mundo: su ficha en el menú y `/catalogos/marcas`.
>
> ### 🔴 EL ATERRIZAJE — la fuga nº 2, que este cambio podía reabrir
>
> El auto-redirect de `/home` es «rol con UN solo módulo → llevalo ahí», y con dos módulos **deja de alcanzarlo**: sin reemplazo, David aterrizaría en el **Inicio del GRUPO**, que es exactamente la fuga que el #659 tapó.
>
> **`MODULO_CASA_POR_ROL` (`lib/modules.ts`): la CASA de un rol es el módulo donde aterriza aunque tenga varios.** La de David sigue siendo Boston.
> - **El destino se resuelve contra los módulos VISIBLES**: si un día le quitaran `boston`, `/home` no lo mandaría a una pantalla que no puede ver.
> - **`/home` NO nombra el rol** (`moduloCasaDeRol(role)`, no un `role === "…"`): el rol se dice UNA vez, en `lib/boston/rol.ts`. Y el candado que exige que `/home` no escriba `"gerente_boston"` sigue verde.
> - **El auto-redirect de módulo único NO se retiró**: sigue mandando a bodega a Guías y a Jennifer a Multifashion.
>
> ### 🔴 LAS DOS FUGAS DEL #659, RE-MEDIDAS
>
> Agregar un módulo es justo el cambio que puede reabrirlas, así que se vuelven a medir con los handlers reales, no de palabra: **la búsqueda global le contesta 403** (y a admin no: el 403 prueba algo) y **el Inicio del grupo lo sigue esquivando**, ahora por su casa. El CXC del grupo, Ventas, Comisiones y las otras 14 rutas ajenas de `boston-acceso.test.ts` **siguen en 403 sin tocar una línea**.
>
> ### ⚠️ DDL ADITIVA — **YA CORRIDA** (27-ago-2026), y la app funcionaba ANTES
>
> `supabase/migrations/20260902130000_boston_catalogos.sql` le agrega `catalogos` a `role_permissions.gerente_boston` con `array_append` (no escribe la lista completa: eso le borraría un módulo futuro). Medido antes y después — **`gerente_boston: ["boston"] → ["boston","catalogos"]` y las otras 6 filas IDÉNTICAS**; corrida dos veces seguidas, sigue en dos.
> - 🩸 **Y la app funcionaba antes, por DOS mecanismos y hacían falta los dos.** `MODULO_HEREDA_PERMISO_DE["catalogos"] = "boston"` enciende la ficha en el menú… **y no alcanzaba**: `CatalogoAuthGuard` mira `sessionStorage.fg_modules` con un `includes` a mano, así que la ficha se pintaba y la pantalla lo **rebotaba a `/`** — un botón que saca de la app se lee como que la app está rota. El guard pasa a preguntar con `fgModulesDaAcceso`, **la MISMA regla del menú**. Con dos reglas, el menú ofrece lo que la página rechaza.
> - ⚠️ **La conducta de los demás NO cambia**: admin, secretaria, vendedor y bodega tienen `catalogos` DIRECTO, y el permiso directo sigue mandando sin mirar roles. Hay caso que lo prueba montando el guard.
> - **La herencia se retira del código cuando la DDL esté verificada**, no antes. Ya lo está: queda como red mientras haya sesiones vivas con el `fg_modules` viejo (el login lo copia una sola vez).
>
> ### Medición
>
> **Los 3 anchos + el iPad ACOSTADO, en el navegador contra el build de PRODUCCIÓN, con datos de producción, en las 5 pantallas (hub + las 4 marcas) y CONTRA UN BASELINE** (`bash scripts/_medir-boston-catalogo.sh`, y `ROL=vendedor` para el baseline; solo lectura — el navegador **aborta todo pedido que no sea GET/HEAD**):
>
> | 390 · 834 · 1024 · 1440 × 5 pantallas = 20 casos | David | vendedor (baseline) |
> |---|---:|---:|
> | arrastre de página | **0 px** | **0 px** |
> | recortados | 271 | **271** |
> | táctiles < 44 px | 710 | **710** |
> | textos < 12 px | 8.745 | **8.745** |
> | **«Administrar»** | **0** | 0 |
> | **«Pedidos»** | **0** | **32** |
>
> 🔴 **Los cuatro números de layout salen IDÉNTICOS a los del rol que YA tenía el catálogo: son PRE-EXISTENTES del catálogo**, que este cambio no toca — los `truncate` del nombre, el «Agregar» de 204×38 px, el «← Inicio» de 47×34 y los «Bulto de 12» a 10 px. Lo único que difiere es lo que tenía que diferir: los 32 botones «Pedidos» que el vendedor ve y David **no**.
> - 🩸 **El baseline se mide con EL MISMO ARCHIVO** (`ROL=`): dos scripts distintos no comparan nada. Y el script **exige** que el vendedor SÍ vea «Pedidos» — si no, el medidor está roto y el «0» de David no probaría nada.
> - 🩸 **A David se le siembra `fg_modules = ["boston"]` A PROPÓSITO**: es el caso PEOR (la DDL sin correr) y lo que prueba que la herencia y el guard hacen su trabajo. El script **falla si la pantalla lo rebota**, si el catálogo no dibuja productos o si aparece un botón prohibido.
> - 🩸 **Antes de creerle a la medición hay que verificar que el servidor es el TUYO**: un `next start` que muere por EADDRINUSE deja al medidor midiendo el build de otro worktree (ya pasó en este repo). `scripts/_serve-medicion-3521.sh` se niega a arrancar si el puerto está tomado.
>
> ### Candados
>
> **`src/__tests__/api/boston-ve-catalogo.test.ts` (40)** — CONDUCTA: llama a los handlers REALES con cookies FIRMADAS, exige **200 con filas** en `products` (4 marcas), **403 en las 12 rutas ajenas** (4 marcas), que **admin entre a esas mismas rutas**, que la respuesta real no traiga costo ni margen, y **re-mide las dos fugas del #659**. Y **`src/__tests__/components/catalogo-guard-modulo-prestado.test.tsx` (7)**, que MONTA el guard y mira si el hijo llegó a la pantalla — que el archivo importe `fgModulesDaAcceso` no prueba que lo llame.
> - **Candados que CAMBIARON DE DIRECCIÓN** (los cuatro estaban fijando lo viejo, y los cuatro hicieron su trabajo: frenaron el build hasta que la decisión quedó escrita): `boston-acceso.test.ts` exigía UN solo módulo · `catalogo-roles.test.ts` congelaba la lista de VER en cuatro roles · `boston-david-sin-contrasena.test.ts` exigía `modules: ["boston"]` en el login REAL · `saldos-banco-modulo.test.ts` congelaba la lista de herencias. **Ninguno se aflojó**: siguen siendo listas EXACTAS y un módulo de más pone el build rojo.
> - **Verificado por mutación, 16 de 16 cazadas y 0 sobrevivientes** (`bash scripts/_mutar-candados-boston-catalogo.sh`): David pierde el catálogo · gana ADMINISTRAR · gana la LISTA DE COMPROBANTES · gana editar/duplicar · la ficha escribe su propia lista de roles · la ficha se abre a todos · **David pierde su CASA y cae en el Inicio del grupo** · `/home` deja de aterrizar al rol con casa · `/home` pierde el auto-redirect de módulo único · todos los roles caen en Boston · se cae la herencia (sin la DDL la ficha no se pinta) · la herencia deja de recortar por `roles[]` · **el guard vuelve al `includes` a mano y lo rebota** · el guard deja pasar a cualquiera · **Catálogos vuelve como pestaña de `/boston`** · el módulo Boston se le abre a otro rol.
> - 🩸 **Tres sobrevivieron en la primera corrida y las tres eran huecos REALES, no falsos positivos**: `CatalogoAuthGuard` no tenía UN solo test (por eso existe el archivo nuevo) y una mutación estaba mal escrita. **Un verificador que da 13/16 y se publica igual es peor que no correrlo.**
> - 🩸 El script restaura **por COPIA** (hay archivos NUEVOS y el checkout de git aborta el comando entero sin restaurar nada), el reemplazo es **LITERAL con python** (con `perl -0pi -e 's|…|…|'` el `||` del código real des-escapa el delimitador y **se come el archivo**, dejando un «SOBREVIVIÓ» falso), **denuncia el patrón que no muta**, **exige que vitest haya colectado tests** antes de creerle a un cero, y trae una **mutación de CONTROL que a propósito no matchea**: si no sale ⛔, el denunciador está roto y todos los ✅ valen lo mismo que un barrido vacío.
>
> ### ⚠️ Queda ABIERTO — decide Daniel
>
> - **La lista de comprobantes.** Hoy le da 403 a propósito: trae el cliente y el monto de cada venta de las 4 marcas del grupo. Si Daniel quiere que también la vea, es agregarlo a `COMPROBANTES_ROLES` — una decisión suya, no un refactor.
> - **Administrar el catálogo** (fotos, badges, ocultar, mandar a Switch) sigue en admin + secretaria y no se tocó.


---

> ## 🔴 CXC y Clientes — EL AVISO QUE MANDABA A ARREGLAR ALGO QUE NO SE ARREGLABA (24-ago-2026)
>
> Cinco defectos de flujo, aprobados por Daniel. **Ningún número de cartera se movió, y está medido.**
>
> ### 1. 🩸 El WhatsApp mandaba a la ficha, y al volver seguía diciendo lo mismo
>
> Al tocar «WhatsApp» sobre un cliente sin teléfono, el CXC decía *"Este cliente no tiene teléfono registrado. Edite el contacto primero"*. Se iba a la ficha, se escribía el teléfono —que se guarda en **`clientes_master`**—, se volvía… **y seguía diciendo lo mismo**. El panel lee `/api/cxc/aging`, que sale de **`switch_estadocuenta_aging_mv`**: una vista MATERIALIZADA. La persona quedaba pensando que la app está rota.
>
> 🔑 **EL ARREGLO ES EL CAMINO MENOS SORPRESIVO: que el CXC lo VEA.** Los montos siguen viniendo de la MV (precalculada, rápida, y es lo que hace que ningún número se mueva); lo único que se relee en vivo son los **TRES campos de contacto que la vista ya toma de `clientes_master`** — `email`, `telefono`, `celular`, los mismos y del mismo lugar.
> - 🔴 **NO se toca `nombre` ni `nombre_normalized`**: el CXC consolida por nombre, así que pisarlo movería la AGRUPACIÓN de la pantalla. Hay mutación para eso.
> - ⚠️ La lectura va **ACOTADA a los códigos que la cartera del grupo ya trajo** (~98) y **PAGINADA con `leerTodoPaginado`**: `clientes_master` tiene miles de filas (97% de Boston) y `db-max-rows` = 1000 corta EN SILENCIO. Lotes de 300 por `.in()`.
> - 🔑 **Boston no entra ni por acá**: sólo se releen códigos que la MV del GRUPO ya devolvió, y los clientes de Boston no están en `clientes_master` (usan ids numéricos de Switch, no D-XXX). El archivo **no toca `switch_estadocuenta`** y hay candado.
> - 🔴 **FALLA ABIERTO**: si el maestro no se puede leer, se conservan los datos de la MV y el CXC se dibuja igual. Una cartera que no carga es mucho peor que un teléfono viejo.
> - 🩸 **EL HUECO, medido contra producción** (`DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-telefono-mv-vs-maestro.ts`, solo lectura): la MV se refresca a las **07:35 UTC**, en cada sync de `estadocuenta` (16:0x y 21:1x) y en la reconciliación (10/14/18), o sea que **el hueco más largo es de 21:20 a 07:35 = 10 h 15 min** — justo la noche y la mañana temprano. Medido el 24-ago a la 01:41 UTC: MV materializada hace **4,3 h**, 209 filas, 98 códigos, **0 contactos difiriendo hoy** (nadie había editado desde el último refresco). **El arreglo es LATENTE y se dice así**: no cambia nada hoy, y evita el desconcierto la próxima vez que alguien escriba un teléfono.
>
> ### 2. La búsqueda se perdía al volver de una ficha
>
> `search`, `provincia` y `page` de `/clientes` vivían en `useState`: entrar a la ficha de un cliente y volver dejaba el buscador **VACÍO** y de nuevo en la página 1. Revisar 10 clientes seguidos era escribir la búsqueda 10 veces. **La regla de navegación de la casa ya lo resolvía y esta pantalla no la usaba**: se REUSÓ `useUrlState` — filtros y páginas a la URL con `replace`, drill-down con `push` (que es lo que ya hacían el `<Link>` y el `router.push` de la tarjeta, y no se tocó).
> - **Lo que se debouncea (250 ms) es la ESCRITURA en la URL**, no el input: sin eso cada tecla sería una navegación.
> - 🩸 **DOS `useUrlState` en el MISMO tick se pisan**, y el segundo borra el filtro que acaba de escribir el primero: cada setter reconstruye la query desde `searchParams`, que todavía no alcanzó. Por eso el reset de página a 1 se dispara mirando los parámetros **REALES** de la URL (`useSearchParams()`), no el valor optimista del hook.
> - ⚠️ El `?search=` pegado a mano o guardado en un marcador **sigue llegando igual** — ahora es el mismo parámetro que la pantalla escribe, no un prefill aparte que se leía una sola vez al montar.
>
> ### 3. Boston arrastraba su tabla en el iPad
>
> La pestaña de Confecciones Boston dibujaba su tabla de 6 columnas desde `sm` (640). Medido en el navegador contra el build de producción: **184 px de arrastre a 834**. Es el MISMO defecto y el MISMO arreglo de las cuatro pantallas del 30-jul-2026 — **el corte es `lg` (1024)**, porque lo que decide es el ancho ÚTIL (la barra lateral se lleva 224 px, un iPad de 834 deja 610). **No se rediseñó nada: sus tarjetas ya existían y sólo se les amplió el tramo**, y se le pusieron los `data-vista` FIJOS. `BostonTab.tsx` es la QUINTA pantalla de `tablas-anchas-ipad.test.ts`.
> - **Medido: 834 → de 184 px a 2 px de arrastre.** Los 2 px que quedan son el desbordamiento de la píldora de tramo, **idéntico en `origin/main`** (medido en los dos builds): es PRE-EXISTENTE, estaba tapado detrás de los 184.
> - 🔴 **Y las tarjetas dicen EXACTAMENTE lo mismo que la tabla**: `BASE=… node scripts/_verif-boston-tarjetas-vs-tabla.mjs` compara 834 contra 1440 **cliente por cliente, POR POSICIÓN y por ROL** — **383 clientes · 1.915 montos · 0 diferencias**. Se compara por rol y no por el orden del texto porque los dos layouts dicen las mismas cifras en distinto orden a propósito (la tarjeta pone el TOTAL arriba, pegado al nombre; la tabla, al final de la fila).
> - ⚠️ **La pestaña del GRUPO NO se tocó, y su corte NO es `lg`: es `md`** (`hidden md:block` en `admin/page.tsx`). O sea que a 834 el grupo dibuja su tabla, no tarjetas. **No arrastra** porque es una grilla `grid-cols-12` que se reparte el ancho (docOverflow 0 en los cuatro anchos, medido antes y después). Moverlo a `lg` cambiaría el layout del grupo entre 768 y 1023 sin un solo píxel de arrastre que justificarlo: queda anotado, no hecho.
>
> ### 4. Dos botones que prometían cosas distintas y hacían la misma
>
> En el cajón de estado de cuenta, en la computadora, «Compartir» terminaba **descargando el mismo PDF** que el botón «PDF». Y si el archivo no se podía armar, el `catch` sólo escribía en la consola: el botón volvía a la normalidad, **no pasaba nada visible**, y la persona tocaba de nuevo.
> - **Un solo botón, rotulado con lo que de verdad va a pasar**: «Compartir» (hoja del sistema) o «Descargar PDF».
> - 🩸 **La pregunta se hace con un `File` de verdad** (`canShare({ files })` mira el TIPO del archivo): preguntar sólo por `navigator.share` daría un falso sí en navegadores que comparten texto pero no archivos — el mismo defecto con otro disfraz. Hay candado y mutación para ese caso exacto.
> - **El error se ve** (`role="alert"`, accionable) y **cerrar la hoja de compartir NO es un error** (`AbortError`).
>
> ### 5. 🔴 Código muerto retirado — cuatro cosas, y el riesgo de las cuatro es el mismo
>
> No es el peso: es que **alguien arregle el buscador EQUIVOCADO y jure que la pantalla no cambia**.
> - **`ClientTable`**: un SEGUNDO buscador, un botón «Filtros», su `BottomSheet` y una tira de píldoras de tramo, detrás de `!hideSearchAndRiskFilters` — y el único que monta esa tabla le pasaba la bandera **SIEMPRE**. Con el bloque se fueron sus props (`setSearch`, `setRiskFilter`, `hideSearchAndRiskFilters`). ⚠️ **El filtro de EMPRESA sí se dibuja y se queda.**
> - **`ClientRow`**: una tarjeta de celular tras `sm:hidden`, dentro de un padre que vive tras `hidden md:block` — los dos tramos **no se cruzan nunca**, así que no se pintó jamás en ningún ancho. La vista de celular del CXC de verdad es `PanelCxcMobile`.
> - **`handleSaveEdit` + `onSaveEdit`**: el guardado de contacto que ya no llamaba nadie (la edición se mudó a la ficha). ⚠️ **`cxc_client_overrides` NO se toca y se sigue LEYENDO**: un override guardado antes le sigue ganando al maestro. Lo que se retiró es la escritura.
> - **`CompanySummary.tsx`**: una vista entera de deuda por empresa **con cero importadores**. Se BORRÓ (no se encendió): duplicaba lo que ya dan el filtro de empresa y las tarjetas, y encender una superficie nueva de cartera es justo donde este repo se quemó con Boston.
> - **`/api/vendors` y `/api/upload`**: **2 de 6 peticiones por cada apertura del CXC**, contra una base en compute Micro. La primera llenaba el objeto global `VENDOR_MAP`, que ninguna pantalla lee; la segunda armaba `uploads`, que llegaba a `admin/page.tsx`, se desestructuraba y no se usaba en una sola línea. **Quedan 4.** ⚠️ `src/lib/vendors.ts` y la ruta `/api/vendors` NO se borraron (la ruta tiene su POST y su test).
>
> ### La prueba de que ningún número se movió
>
> **En el navegador, contra DOS builds de producción con datos de producción y comparando POSICIÓN POR POSICIÓN** (`BASE=… node scripts/_medir-cxc-clientes-t310.mjs`, solo lectura; el «antes» es un build de `origin/main` en el commit base REAL de la rama, no uno viejo):
>
> | | grupo | Boston |
> |---|---|---|
> | tarjetas / píldoras | **IDÉNTICAS en 390 · 834 · 1024 · 1440** | **IDÉNTICAS en los 4** |
> | montos en orden | **0 distintos** (258 · 387 · 387 · 387) | **0 distintos** a 390 · 1024 · 1440 |
> | conteo de la lista | 98 clientes, igual | 383 clientes, igual |
>
> Cifras medidas: grupo **Total $3.515.744,63 · 98 clientes · 0-90d $1.410.793,95 · 91-120d $946.759,94 · 121d+ $1.158.190,74**; Boston **$187.018,00 · 383 clientes · 0-90 $52.169,15 · 91-120 $13.969,43 · 121+ $120.879,42** — las mismas antes y después.
> - **A 834 los montos de Boston cambian de CANTIDAD a propósito** (la tabla pasa a tarjetas y las tarjetas emiten otros textos). Ése es el único caso, y se verifica aparte con `_verif-boston-tarjetas-vs-tabla.mjs`: **1.915 montos, 0 diferencias**.
> - **El payload crudo también**: `/api/cxc/aging` en los dos builds → **209 filas, 9 campos de plata × 209 = 1.881 comparaciones, 0 distintas**, `nombre`/`nombre_normalized` idénticos, total **$3.515.744,63** en los dos, y **0 filas de `confecciones_boston`** antes y después.
> - **Arrastre y táctiles**: el único cambio es Boston a 834 (**184 → 2 px**). Todo lo demás queda **idéntico píxel por píxel** (grupo 148/137/74/0; Boston 196/·/0/0; `docOverflow` 0 en los 8 casos, antes y después) y **no aparece ni un blanco táctil nuevo** — Boston a 834 baja de 385 a 383.
>
> ### Candados
>
> `api/cxc-telefono-en-vivo.test.ts` (11), `components/clientes-busqueda-en-la-url.test.tsx` (7), `components/cxc-estado-cuenta-un-boton.test.tsx` (7) y `components/cxc-codigo-muerto-podado.test.tsx` (14), más `BostonTab` sumado a `tablas-anchas-ipad.test.ts`. **Son de CONDUCTA**: llaman al handler real, montan la pantalla real, escriben en el buscador real y cuentan qué salió por el router y por `fetch`. Los pocos barridos de texto **borran los comentarios primero** — este repo ya pagó cuatro veces el candado que se cumple con su propia explicación, y estos archivos CITAN lo que prohíben.
> - **Verificado por mutación, 21 de 21 cazadas** (`bash scripts/_mutar-candados-cxc-clientes.sh`): el CXC vuelve a leer el teléfono viejo de la MV · el teléfono no se refresca · el refresco toca la PLATA · borrar el teléfono en la ficha no se refleja · el contacto deja de fallar abierto · el lote del `.in()` pasa el tope de PostgREST · la búsqueda / la página / la provincia vuelven a `useState` · el filtro empieza a crear entradas de historial · el drill-down deja de crearlas · el error del PDF vuelve a ser invisible · el botón vuelve a decir «Compartir» aunque descargue · se promete compartir sin preguntar por el archivo · cerrar la hoja se muestra como error · vuelve un segundo buscador · vuelve la segunda copia del nombre · vuelve la petición a `/api/vendors` · las tarjetas / la tabla de Boston vuelven al corte `sm` · Boston pierde su marca fija.
> - 🩸 **UNA sobrevivió en la primera corrida y era un hueco REAL**: `setPuedeCompartir(true)` sin preguntar. Ninguno de mis casos la cazaba porque los dos extremos (sin `share` / con `share` y `canShare` true) daban el mismo resultado. El caso que faltaba —**comparte texto pero no archivos**— es exactamente el que produce un botón que dice una cosa y hace otra. Se agregó y quedó 21/21.
> - 🩸 **Dos candados existentes CAMBIARON DE DIRECCIÓN, y los dos estaban fijando lo retirado**: `cxc-anotaciones-cartera.test.ts` exigía ≥4 apariciones de `CARTERA_GRUPO` en el panel y quedaron 3 al irse la escritura de overrides (**siguen siendo todas las llamadas que escriben: el piso baja, el invariante no se aflojó**), y `swr-datos-del-servidor.test.ts` congelaba el nombre `provinciaDebounced`.
