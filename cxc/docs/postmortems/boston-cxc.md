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
> ⚠️ **`cxc_favorites`, `cxc_client_overrides` y `cxc_contact_log` comparten el namespace de `nombre_normalized` entre grupo y Boston** (no tienen columna de empresa): los 5-10 nombres que existen en los dos lados comparten estrella, contacto y correo. **NO es plata y no se tocó** — arreglarlo pide DDL y una decisión de Daniel (¿el contacto de CITY MALL PASO CANOA es el mismo señor para las dos carteras?). ⚠️ **4-sep-2026: los favoritos ⭐ se retiraron del CXC entero** (Daniel: *«quita favoritos»*; `cxc_favorites` tuvo 0 filas en toda su historia). La tabla queda sin lectores, con candado que impide que una migración la dropee, y el namespace compartido pasó a ser cosa solo de `cxc_client_overrides` y `cxc_contact_log`.



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

---

## 🔴 CUENTAS POR COBRAR, REDISEÑADO ENTERO — ✅ HECHO (5-sep-2026)

> Daniel definió el módulo completo tras una sesión larga de mapeo contra producción. Lo de abajo es
> el **porqué** de cada regla nueva, con sus citas y sus mediciones. La regla vigente, sin la
> historia, vive en «Invariantes por módulo» de `cxc/CLAUDE.md`.
>
> ⚠️ **Ni un centavo se movió.** Medido antes y después contra producción, sobre
> `switch_estadocuenta_aging_mv` (que es lo que lee la pantalla): **$3.685.289,04 en 100 clientes**,
> por tramo `0-90d $1.538.790,86 · 91-120d $876.667,94 · 121d+ $1.269.830,24`. Este rediseño no toca
> una sola consulta de plata de la cartera.

### 1. 🔴 «COBRAR» — UNA HOJA, CUATRO SALIDAS, EN VEZ DE SEIS PUERTAS

**🩸 El defecto.** Para mandarle el estado de cuenta a un cliente había **seis puertas que hacían lo
mismo**: las 4 opciones del menú «···» de la fila (Estado de cuenta · WhatsApp · Enviar correo ·
Copiar mensaje), el botón negro «Estado de cuenta» del panel expandido, y el menú de **clic derecho**.
Ninguna se veía sin abrir algo, el clic derecho **no existe en el iPad**, y las tres listas de
opciones vivían en tres archivos distintos que había que mantener iguales a mano — el candado
`cxc-pestanas-y-menu.test.ts` existía justamente porque ya se habían separado una vez.

Ahora hay **un botón visible en cada fila** (y en cada tarjeta del celular) que abre una hoja. La hoja
dice arriba **qué se va a mandar** (`Estado de cuenta al <fecha> · N empresas · $total`) y ofrece las
cuatro salidas en el orden en que se usan:

1. **Correo** — muestra el destinatario y **manda con un clic**, sin ventana de compose, con
   **«Deshacer» de 5 segundos** (`useUndoAction`/`UndoToast`, el patrón del sistema: el POST real
   ocurre al vencer el plazo, así que «Deshacer» no cancela un correo que ya salió — impide que
   salga). Sin correo cargado la fila sale **apagada** y dice dónde cargarlo: medido, **21 de los 100
   clientes con saldo no tienen correo**.
2. **WhatsApp**, con el mismo texto de siempre. 🔴 **La palabra «vencido» sigue prohibida** hacia el
   cliente: `dias` es la EDAD del documento, no días de mora.
3. **Copiar el mensaje.**
4. **Ver o bajar el PDF** — comparte por la hoja del sistema cuando el navegador puede con
   ARCHIVOS (`canShare({files})` con un `File` de verdad, no solo `navigator.share`), y baja cuando
   no. El rótulo dice algo que es cierto en los dos casos, que es la otra forma de arreglar el
   defecto viejo de «un botón que promete una cosa y hace otra».

**Se conserva «Escribirlo yo»**, que abre el `EnviarEmailModal` de siempre con destinatario, asunto y
cuerpo editables. No se borró nada: es la salida para el caso que la hoja de un clic no cubre.

**En celular la hoja sube desde abajo.** No hace falta un segundo componente: `ModalOverlay` con
`align="center"` **ES** el patrón de hoja-desde-abajo del sistema (`items-end sm:items-center`).

**Quién puede cobrar: los MISMOS roles que ven el módulo** (admin · secretaria · vendedor). No se
agregó ninguna restricción nueva.

### 2. 🔴 LO QUE SE MANDA SON SIEMPRE LAS 6 EMPRESAS — Daniel: *«todo»*

**🩸 El defecto, y es del tipo que le cuesta plata al negocio.** `EnviarEmailModal` le pasaba a la
ruta el **filtro de la pantalla** como `empresa`. Con «Vistana» seleccionado, el **CLIENTE** recibía
un estado de cuenta **de Vistana solamente** —creyendo que ése es todo lo que debe— y el resto quedaba
sin cobrar. Peor: un vendedor con empresa asociada (**Edwin tiene Vistana fija** por
`fg_empresa_filter`) **no podía mandar el completo ni queriendo**, porque la ruta le forzaba su
empresa.

Preguntado si el filtro tenía que recortar el correo, Daniel contestó, textual: **«todo»**.

El filtro de empresa es una herramienta para **MIRAR la pantalla**. Lo que sale hacia afuera —el
correo, el WhatsApp, el PDF adjunto— es la deuda entera, que es la única cifra que el cliente puede
reconocer. La regla vive en el **SERVIDOR** (`empresasDelEnvio()` en `/api/cxc/enviar-email`, y
`CXC_GRUPO_EMPRESA_KEYS` en `/api/cxc/cobrar-lote`), no en la pantalla: el parámetro `empresa` se
dejó de leer.

⚠️ **Esto NO afecta al cajón de documentos** (`/api/cxc/estado-cuenta/[codigo]`), que es lo que se
MIRA: ahí el filtro sigue mandando y el vendedor sigue viendo solo su empresa. Cambia lo que se
**ENVÍA**.

### 3. 🔴 EL AVISO «SIN PAGAR HACE +90 D» — el único dato NUEVO

Es la mejora que Daniel eligió primero. **Días desde el ÚLTIMO PAGO REAL** del cliente en las 6
empresas del grupo, cruzado **por CÓDIGO** (`D-XXX`), nunca por nombre.

- ⚠️ **Las retenciones NO cuentan, ni los recibos en cero.** Es la misma regla de
  `switch_ultimo_pago_cliente_v2` y de la ruta de los últimos pagos: si contaran, **City Mall
  parecería que pagó ayer por $19,60** de retención de ITBMS.
- 🔴 **El que NUNCA pagó también avisa.** Callarlo sería lo contrario de lo que el aviso existe para
  decir: el que nunca pagó es el caso más grave, no el caso desconocido.
- **El «hoy» es el de PANAMÁ** (UTC−5). Entre las 19:00 y la medianoche de Panamá el día UTC ya es el
  siguiente, y todos los días saldrían con uno de más.
- **Cero peticiones nuevas**: el mapa código → última fecha de pago se arma con la MISMA lectura que
  el CXC ya hacía (`/api/cxc/ultimo-pago`), tomando el **máximo** entre las 6. Si se armara solo con
  las empresas donde el cliente TIENE deuda, el que le terminó de pagar a Vistana la semana pasada
  saldría como «no paga hace 300 días».
- La celda 1 de la tira lo dice y **es tocable: filtra la lista** (mismo toggle que los chips de
  tramo, en la URL con `replace`). **Solo con ese filtro encendido** cada fila muestra «no paga hace
  298 d» / «nunca ha pagado»: en las 100 filas normales sería ruido pegado a cada nombre.

**Medido contra producción el 5-sep-2026** (94 clientes con deuda de 100 filas):

| | clientes | monto |
|---|---|---|
| avisan (+90 d **o** nunca pagaron) | **37** | **$647.944,31** |
| de ésos, NUNCA pagaron | 7 | $56.672,56 |
| los otros (con pago, +90 d) | 30 | $591.271,75 |
| de ésos, pasan los 180 días | 24 | $408.414,81 |

**Casos de control, congelados en el candado**: `Internacional Belen` 298 d / $143.713,36 ·
`Grup M.E.L. International, S.A.` 170 d · `Multimarkas` 908 d · `Colon Town By Japanese` 570 d ·
**`ACTIVE SHOES, S.A.` nunca ha pagado / $43.806,10**, y su fila está pintada de **VERDE** porque toda
su deuda es 0-90 d. **Ese contraste es el punto del cambio**: la barrita de color dice «al día» y el
cliente lleva desde 2023 sin mandar un centavo.

⚠️ **«Nunca ha pagado» quiere decir «no hay un solo recibo suyo en lo que este sistema guarda», y
`switch_recibos` arranca en 2023.** No se afirma nada de antes de esa fecha.

🩸 **UN NÚMERO DEL BRIEF NO CUADRABA, y vale la pena decirlo.** El encargo traía «30 clientes,
$591.271,75». Reproducida la consulta, esos 30 son los que tienen un pago viejo — la medición se hizo
con un join que **dejaba afuera a los 7 que nunca pagaron**, entre ellos ACTIVE SHOES, que el mismo
brief pedía como caso de control. La DEFINICIÓN escrita («sin ningún recibo → nunca ha pagado») y la
MEDICIÓN no coincidían. Se implementó la definición: **37 y $647.944,31**. Los cinco casos de control
dan exactos, y la cifra de 180 días del brief ($408.414,81) reproduce **al centavo** la de los 24 que
sí tienen pago — que es lo que confirma de dónde salió la diferencia.

### 4. 🔴 MANDAR A VARIOS — UN CORREO POR DIRECCIÓN, NO POR CLIENTE

**Medido el 5-sep-2026 sobre los 100 clientes con saldo:** 79 tienen correo, 21 no. De esos 79,
**31 comparten 9 direcciones → salen 57 correos, no 79**. El caso grande es
**`oficina@citymoda.store`, compartido por 13 clientes** que deben **$402.376,67** entre todos; el
segundo, `contabilidad@citymall.com.pa`, los dos City Mall (**$480.784,72**).

Mandar un correo **por cliente** le pone trece mensajes en la bandeja a la misma persona el mismo
minuto, cada uno con un pedazo del saldo y ninguno con la cuenta completa. Lo que sale es **UN correo
por DIRECCIÓN con UN PDF** que trae **una hoja por cliente y el total al final**.

- 🔴 **Los que no tienen correo NO abortan el lote**: se manda a los que se puede y se dicen **POR
  NOMBRE** los que quedaron fuera. Cancelar 57 correos porque 21 clientes no tienen dirección es
  castigar al que sí la tiene.
- **Quien decide a quién se le escribe es el SERVIDOR** (`/api/cxc/cobrar-lote`). El navegador
  agrupa para MOSTRARLO en la barra («31 comparten correo → 57 correos»), no para decidirlo.
- ⚠️ **Dos direcciones distintas son dos correos.** Se comparan en minúsculas y sin espacios de los
  bordes, y **nada más**: no se quitan puntos, no se resuelven alias con `+`, no se adivina.
  Adivinar que dos direcciones son la misma persona es el pareo por parecido que este sistema tiene
  prohibido en todas partes.
- **Tope de 40 por tanda**, que no es una regla de negocio: es el techo de la función serverless.
- En una dirección compartida por trece **no se saluda a nadie por su nombre**: elegir a uno de los
  trece sería peor que no saludar.

### 5. 🔴 EL ESTADO DE CUENTA SE PUEDE LEER

**🩸 Cómo estaba, medido:** una lista de dos líneas por documento **sin un solo encabezado de
columna**; dos números apilados —«$1.006,80» y debajo «de $2.978,88»— **sin decir cuál es cuál**; el
total al fondo del pie, así que con los **110 documentos de City Mall Paso Canoa** había que bajar
toda la lista para saber cuánto debía; los subtotales de las otras 5 empresas perdidos entre esas 110
filas; y **36 de esos 110 documentos valen menos de $50 y suman $227,20** — un tercio de la lista para
el **0,05 %** del saldo.

Queda así: **el total grande arriba**, `D-25 · al <fecha> · N documentos en M empresas`, una tira de
**pastillas por empresa con su subtotal** (tocarlas salta a esa sección), y una tabla **con
encabezados**: `Documento` (número arriba, tipo abajo) · `Fecha` · `Días` · `Original` · `Saldo`. Los
dos números apilados se separan en dos columnas, y **`Original` muestra «—» cuando es igual al
saldo** (repetir el mismo número dos veces en la misma fila no dice nada).

🔴 **LO CHICO SE AGRUPA POR MONTO, NUNCA POR TIPO DE DOCUMENTO.** «Las notas de débito son las
chicas» es la tentación obvia y es **FALSA**: hay notas de débito grandes y reales —**$5.000 de
Internacional Belén en 2024, $3.349,10 de City Mall David**— y esconderlas es esconder plata que hay
que cobrar. El corte mira el **valor absoluto** (un crédito de −$12 también es chico).

⚠️ **Contexto que NO se dice en pantalla:** esas notas chicas son, casi todas, de las retenciones —los
7 clientes que las tienen son los 7 que pagan reteniendo—, pero **Switch no manda el motivo**.
Afirmarlo en la pantalla sería inventar. Se agrupa por lo que se puede medir: el monto.

**El pie dejó de decir «Compartir» y dice «Cobrar»**, abriendo la misma hoja de la fila: hasta hoy,
**desde el papel no se podía mandar el papel** — había que cerrar el cajón, volver a la fila y abrir
otro menú. El PDF no se perdió: es una de las cuatro salidas de la hoja.

### 6. 🔴 «ÚLTIMOS PAGOS», POR FECHA Y NO POR EMPRESA

**Medido:** los clientes grandes le pagan a **varias empresas el MISMO día**. El **29-jun-2026, D-25
pagó $241.857,77 repartido en las SEIS**. Con el corte por empresa eso eran **6 bloques de 3 pagos =
18 líneas para decir lo que dicen 3**, y ninguna de las 18 decía cuánto entró ese día.

Lo que se lee ahora, con los números reales de D-25:

```
20 ago · $234,189.21 · Vistana · Fashion Wear · Active Shoes · Fashion Shoes
29 jul · $70,129.85 · Vistana · Fashion Shoes
22 jul · $187,651.51 · Fashion Wear
```

Con el corte por empresa se fueron **el botón «Últimos pagos ›»** y `UltimosPagosFila`: el bloque vive
dentro del panel expandido, junto al desglose por empresa **que Daniel eligió conservar tal cual**.
Ya no hacen falta «dos expandir» —la queja del 4-sep— porque abrir el cliente trae todo.

⚠️ **Se leen 30 recibos por empresa, no 3.** Con `.limit(3)` la lista puede **mentir**: un cliente con
3 recibos del mismo día en Vistana taparía con esa única fecha las otras dos que sí existen. Treinta
por empresa son 180 filas, muy por debajo del tope de 1.000 que corta EN SILENCIO, y cubren con cinco
veces de margen al cliente con más recibos en un día (D-25, con 6).

**En Boston el corte por empresa nunca tuvo sentido** —es UNA empresa—, así que sus 3 pagos se mudaron
adentro de su cajón de documentos, junto a lo que se está cobrando. Sigue usando **su** hook y **su**
ruta.

### 7. 🔴 EL RASTRO DE LO QUE SE MANDÓ — y las palabras no son las mismas para los tres

**🩸 Medido:** `cxc_emails_enviados` guardaba **solo el correo**, y tiene **19 filas en toda su
historia, todas entre el 9 y el 14 de julio de 2026**. WhatsApp y «copiar el mensaje» —que es como se
cobra de verdad— no dejaban ninguna, así que la pantalla no podía decir si a ese cliente ya le habían
escrito ayer, y dos personas podían mandarle el mismo estado de cuenta el mismo día.

Ahora se anotan los tres (`canal` ∈ `correo` · `whatsapp` · `copia`) y durante **7 días** la fila
muestra una marca gris.

🔴 **Si lo último fue un COPIAR, la frase cambia**: *«Copiaste el mensaje hace 3 días»*, no *«Le
enviaste el estado de cuenta»* — copiar no se lo mandó a nadie. Daniel fue explícito en que no digan
lo mismo.

🔴 **El correo NO se anota desde el navegador.** Lo sigue anotando `/api/cxc/enviar-email` **después
de que Resend confirma**, que es el único lugar que sabe si salió. La ruta nueva
(`/api/cxc/envios`) **rechaza** un `canal: "correo"`: anotar un correo que puede no haber salido es
peor que no anotarlo.

### 8. 🔴 LA CASILLA «CONTACTO» DE LA FICHA DEL CLIENTE

Es el **nombre de la persona con quien se habla**: «con quién pregunto» al llamar a cobrar. Va en la
ficha (`/clientes/[codigo]`), arriba de Correo.

**Por qué hizo falta una columna**, medido el 5-sep-2026:
- `clientes_master` **no tenía dónde guardarlo**. La vista de aging devuelve `contacto` como
  `''::text` **hardcodeado**, justamente porque no había fuente.
- Existe en Switch (`switch_clientes.raw_data->>'nombreContacto'`) pero **está vacío**: lleno en
  **3 de 847** filas de las 6 del grupo, y en **1 solo** de los 100 clientes que deben.
- Lo que sí había estaba escrito a mano en las notas del CXC: **3** (`Alberto levy` → Confecciones
  Boston · `Mohamed` → Zona Sur Dutty Free · `emad` → Internacional Belén).

La migración rescata los 5 (3 de las notas + `Victor Rodriguez` de D-170 y `Narimy` de D-202, que
Switch sí manda) y **no pisa** lo que alguien haya escrito.

🔴 **El sync NUNCA lo pisa.** `contacto` entra a la misma familia que `telefono/celular/email/notas`:
lo escribe la gente. Hay candado que pone el build ROJO si aparece en el `upsert` de
`sync-clientes-master`.

🔴 **El rescate solo mira las 6 del grupo y la cartera `grupo`**: un `nombreContacto` de
`confecciones_boston` o de `american_classic`, o una nota de la cartera de Boston, **no entra al
directorio del grupo**.

**Cuando el cliente tiene contacto, el saludo lo usa** («Buen día Narimy,» / «Estimado/a Narimy,»).
Sin contacto, el texto es **exactamente el de siempre**: no se inventa un nombre ni se saluda con la
razón social, que es lo que dice la factura y no cómo se llama la persona. **Del saludo para abajo no
cambió una coma.**

### 9. LA PANTALLA — dos bloques donde había seis

**Escritorio.** Antes del primer cliente había **SEIS bloques**: la frescura por su cuenta, el aviso
de rechazos, una línea que solo tenía el botón Exportar, un buscador de ancho completo, cuatro
píldoras de tramo y el conteo «N de M clientes · ordenados por …». Quedan **dos**:

1. **Una línea de filtros**: empresa · buscador **angosto** (~230 px; a ancho completo empujaba todo
   lo demás a otro renglón, y lo que se teclea son tres letras del nombre) · la frescura empujada a la
   derecha en texto tenue · **Exportar** (negro) · **Actualizar** (borde).
2. **La tira de totales, pegada a la tabla y en su MISMA grilla de 12 columnas** (4/2/2/2/2), así que
   cada total queda **parado sobre su columna**.

🔴 **En la tira el chip dice SOLO el rango** («0-90d»). El nombre largo **no desapareció**: vive en el
`title` de cada chip, en el celular, en el papel y en el correo, y los cuatro salen de
`tramoLabel()` — la fuente única de siempre. **Cambió dónde se dice, no cuántos nombres hay.** El
candado `cxc-tramos-un-solo-nombre.test.tsx` cambió de dirección con nota fechada: lo que defendía
—que no haya DOS listas de nombres— sigue defendido.

Se fue la línea **«N de M clientes · ordenados por …»**: el conteo vive en el chip de Total y el orden
lo dice la flecha del encabezado de la columna. Eran dos formas de decir lo mismo, y la de texto
tapaba la primera fila. ⚠️ **El comportamiento de orden y filtro no cambió**: sigue saliendo entero de
`lib/cxc-orden`, que no se tocó.

**Celular.** Los tres tramos entran **DENTRO de la tarjeta negra del total** (eran tres tarjetas
grandes debajo), el aviso de +90 d es una línea más de esa tarjeta, buscador y empresa van en **una
sola fila**, y la tarjeta cerrada termina en **[Cobrar] [Ver detalle]**. La abierta trae el desglose
por empresa **sin** las dos líneas de prosa por empresa («Último pago …» / «Última compra …»: con seis
empresas eran 12 renglones, y los pagos vivían en otro botón con 18 más), el bloque «Últimos pagos»
por fecha, y **[Cobrar] [Documentos] [Ficha]**.

🔴 **El nombre del cliente sube de 12 px a 14.** Estaba en el **piso de legibilidad del sistema**
porque la estrella ⭐ (retirada el 4-sep) y el «···» (retirado hoy) le comían el ancho por la derecha.
Ese ancho volvió al nombre y la letra pudo subir **sin cortar más nombres**.

### 10. LA CARTERA DE BOSTON — mismo formato, sin mezclarse

**Se midió antes de tocar los tramos**, que es lo que el encargo pedía: `switch_estadocuenta` de
`confecciones_boston` tiene **985 documentos con saldo, los 985 con `dias` y con `fecha_creacion`**, de
1 a 1.465 días. O sea: el reporte web que llena la vista (cron `boston-cartera`) **sí trae la
antigüedad documento por documento**, y los cortes finos 0-30 / 31-60 / 61-90 / 121-180 / 181-270 /
271-365 / +365 se calculan **exactamente igual que los del grupo**. No hubo que inventar ningún bucket.

🔴 **Los tres tramos que SE VEN no cambiaron**: 0-90 · 91-120 · 121+, los mismos del grupo y las
mismas cifras — que son también los tres que muestra el CXC del grupo. Lo que se agrega es el
**detalle del `title`** que el grupo ya mostraba y Boston no podía porque la vista no lo calculaba.
Verificado contra producción: `d0_90 = d0_30+d31_60+d61_90` y
`d121_plus = d121_180+d181_270+d271_365+mas_365` en los **390 clientes, 0 discrepancias**.

Boston recibe además la **misma forma**: tira de totales alineada a sus columnas, la tabla convertida
a la misma grilla de 12, «Cobrar» y «Documentos» por fila. **No tiene desglose por empresa** —es UNA—
así que tocar un cliente va **directo a sus documentos**, con los mismos encabezados de columna y la
misma agrupación de lo chico por monto.

🔴 **Y sigue aparte, en las dos direcciones.** Su cajón tiene **su propia ruta**
(`/api/cxc/boston/estado-cuenta`) y **no reusa `fetchEstadoCuentaData`**, el lector del grupo: ese
helper recibe una LISTA de empresas y bastaría con pasarle Boston para mezclar los dos mundos por
descuido. Mientras sean dos caminos, mezclarlos no es algo que se pueda hacer sin proponérselo. Sus
teléfonos y correos salen de `switch_clientes` acotado a Boston, **nunca de `clientes_master`**, donde
Boston no está a propósito.

⚠️ **La hoja «Cobrar» de Boston NO manda correos, y es una decisión pendiente, no un olvido.**
Medido: de los **390 clientes con saldo, 272 tienen teléfono pero solo 113 tienen correo**, y el texto
de cobro del sistema está escrito y firmado por **Fashion Group** — Boston no está en esa lista de
empresas. Mandar un correo desde ahí exige decidir **quién lo firma y con qué texto**, y eso es una
decisión de negocio de Daniel, no un detalle de pantalla. Las tres salidas que sí se pueden dar con el
dato que hay —WhatsApp · Copiar · Ver los documentos— están todas, y el mensaje lo firma
**«Confecciones Boston - Departamento de Cobros»**.

### 11. `/admin` PASÓ A `/cxc`, Y LA PANTALLA DE ERROR DEJÓ DE FILTRAR DETALLES

**La dirección ahora dice lo que es.** El **rótulo no cambió**: sigue siendo «Cuentas por Cobrar» en
el home, el sidebar, la barra y la búsqueda. Los enlaces internos (búsqueda global, Vista General,
ficha del cliente, atajo `G+C`, color del módulo) apuntan al nuevo, y hay barrido que pone el build
rojo si alguno vuelve al viejo.

⚠️ **La redirección es de `/admin` EXACTO, no de `/admin/:path*`**: Usuarios y Data Health **no se
movieron**. Y Next arrastra la query, así que los enlaces guardados con `?search=`, `?tab=boston`,
`?risk=` o `?empresa=` siguen llegando enteros.

⚠️ **Es temporal (307), no permanente**, aunque el encargo dijera «permanente»: es el patrón que el
propio encargo citó (los slugs viejos de `/g/`) y la razón está escrita en `next.config.js` — **un 308
se queda pegado en el caché del navegador de cada persona y no hay forma de sacarlo** si un día hay
que revertirlo.

**🩸 La pantalla de error mostraba el mensaje CRUDO y el stack trace completo**, en rojo, en pantalla.
Era la **única del sistema** que lo hacía. A la secretaria le decía cosas como `TypeError: Cannot read
properties of undefined (reading 'd91_120')` —que no le dice qué hacer— y de paso publicaba nombres de
tablas, de columnas y rutas internas a cualquiera que abriera el módulo, incluido un vendedor. Ahora
dice qué pasó, **qué significa** («No se perdió nada: esta pantalla solo consulta saldos, no los
modifica») y qué hacer, con «Intentar de nuevo» e «Ir al inicio». El detalle va a la consola y a
Sentry, que es donde sirve.

### 12. Rutas del CXC sin lectores

- 🩸 **`/api/cxc-rows` se retiró.** Cero llamadas desde `src/` (única mención: un comentario en
  `boston-no-se-mezcla.test.ts`). Leía `switch_estadocuenta_aging` por `nombre_normalized` para una
  pantalla que ya no existe.
- ⚠️ **`/api/cxc/contact-log` NO se retiró, aunque tiene cero lectores.** El seguimiento de cobro no
  existe en este módulo desde el 14-ago (Daniel: *«llamo al cliente por fuera y ya»*) y su GET dejó
  de pedirse ese mismo día. Pero **`boston-acceso.test.ts` la importa por su ruta** para verificar
  que le contesta 403 a `gerente_boston`, y ese candado no se toca. Retirarla es una decisión aparte
  que implica tocar un candado de Boston.
- ⚠️ **`/api/cxc-summary` tampoco**, por lo mismo: `cxc-boston-fuera-de-toda-superficie.test.ts` la
  nombra por su ruta en el barrido de lecturas de `switch_estadocuenta`.
- **Las tablas NO se borran** (patrón `mayor_lineas`): `cxc_rows` y `cxc_contact_log` quedan sin
  lectores, con candado que impide que una migración las dropee.

### Candados

Ocho archivos nuevos y siete cambiados de dirección **con nota fechada** (ninguno borrado):

**Nuevos** — `cxc-sin-pagar.test.ts` (28) · `cxc-correos-por-direccion.test.ts` (16) ·
`cxc-estado-cuenta-legible.test.ts` (20) · `cxc-cobrar-una-hoja.test.ts` (22) ·
`cxc-envios-y-pagos-por-fecha.test.ts` (21) · `cxc-ruta-y-error.test.ts` (14) ·
`cxc-contacto-del-cliente.test.ts` (18) · `cxc-boston-mismo-formato.test.ts` (15) ·
`components/cxc-tira-totales.test.tsx` (13).

**Cambiados de dirección** — `cxc-pestanas-y-menu.test.tsx` (los dos menús ya no existen; hoy exige
que NO vuelvan) · `cxc-estado-cuenta-un-boton.test.tsx` (el PDF se entrega desde la hoja, y el pie del
cajón lleva a cobrar) · `cxc-ultimos-pagos-boton-fila.test.tsx` (el botón se fue; hoy exige que el
panel abierto traiga los pagos en UN solo lugar y con UNA lectura) · `cxc-ultimos-pagos-bloque.test.tsx`
· `cxc-tramos-un-solo-nombre.test.tsx` · `cxc-ultima-compra-pantalla.test.tsx` (el desglose del celular
se acortó; la columna del ESCRITORIO no se tocó) · `cxc-codigo-muerto-podado.test.tsx` (el filtro de
empresa se mudó a la línea de filtros; lo que se impide es que haya DOS).

**Verificado por mutación: 61 mutaciones, 61 cazadas, y 3 CONTROL en verde**
(`bash scripts/_mutar-candados-cxc-rediseno.sh`). Entre ellas: el umbral pasa de 90 a 120 · el que
nunca pagó deja de avisar · el aviso cuenta el saldo a favor · el «hoy» deja de ser el de Panamá · se
agrupa por cliente en vez de por dirección · el que no tiene correo aborta el lote · el PDF deja de
dar una hoja por cliente · el envío vuelve a mirar el filtro de empresa · vuelve el «···» a la fila ·
el corte de lo chico sube y esconde plata real · vuelven los dos números apilados sin rótulo · el pie
vuelve a decir «Descargar PDF» · los pagos se agrupan por empresa · las retenciones vuelven a contar ·
copiar dice «le enviaste» · el sync pisa el contacto · el rescate se lleva la cartera de Boston al
directorio del grupo · la migración de Boston toca la vista del grupo · el cajón de Boston deja de
acotar a su empresa · sus contactos salen de `clientes_master` · su mensaje lo firma Fashion Group y
dice «vencido» · la redirección se lleva `/admin/usuarios` · vuelve el mensaje crudo a la pantalla de
error.

🩸 **Siete sobrevivieron en la primera corrida y las siete eran huecos REALES del candado**, todos del
mismo tipo: la aserción miraba el **import** o la **desestructuración** y no la **llamada** — el
mutante rompía el valor y el nombre seguía en el archivo. Ejemplo: `expect(src).toContain("hoyPanama")`
pasa aunque `const hoy = new Date()`. Se ajustaron a mirar el uso real (`const hoy = hoyPanama()`,
`scheduleAction({`, `const lote = agruparPorCorreo(destinos)`).

🩸 **Y los tres CONTROL salieron ROJOS en la primera corrida**, lo que era un hallazgo aparte: el
script mutaba `src/lib/cxc/estado-cuenta-email.ts` sin tenerlo en su lista de respaldo, así que esa
mutación **nunca se restauraba** y contaminaba todo lo que corriera después. Un script de mutación que
muta un archivo que no respalda es peor que no tenerlo.

---

## 🔴 «DESCARGAR» SON DOS COSAS, EN PDF Y EN EXCEL — Y AL SALDO A FAVOR NO SE LE COBRA (8-sep-2026)

> Daniel, textual: *«en ningún lado quiero exportar CSV, solo Excel»* · *«no quisiera eso»* (por las
> columnas de Estado, Correo, Teléfono, Celular y Contacto) · *«las compañías deberían estar adentro
> del cliente, no como separado»* · *«se tiene que sumar el total del cliente y ponerlo ABAJO del
> cliente, las sumas, no arriba»* · *«se queda»* (el mostrador `TCKCTA`) · *«que lo pueda usar igual
> que yo, a todo su poder»* (el vendedor).

### Lo que hay ahora

El botón negro de la línea de filtros dice **«Descargar»** —era «Exportar»— y abre **dos líneas sin
subtítulo**, cada una en los dos formatos:

```
TODOS LOS CLIENTES
  Total por cliente          PDF · EXCEL
  Detallado por compañía     PDF · EXCEL
```

🔴 **Lo mismo en la computadora y en el celular.** Las dos pantallas montan el MISMO componente
(`app/cxc/components/MenuDescargar.tsx`) y llaman al MISMO hook
(`app/cxc/hooks/useDescargasCartera.ts`). 🩸 Antes el «···» del teléfono bajaba un **CSV distinto** al
del menú de escritorio: otras columnas, otro nombre de archivo. Dos archivos para la misma pregunta es
cómo se arregla uno y queda mal el otro.

- **«Total por cliente»** — un renglón por cliente: `Código · Cliente · 0 a 90 días · 91 a 120 · 121 y
  más · Total`, con Total al pie. **Los TRES tramos de la pantalla**, no los ocho finos, y sus rótulos
  salen de `tramoLabel()` como en todas las superficies.
- **«Detallado por compañía»** — un renglón por cliente **y** compañía. En el **PDF** el nombre del
  cliente encabeza su bloque, debajo van sus compañías y **el total del cliente cierra el bloque**. En
  el **Excel** el código y el cliente **se repiten en cada renglón**: sin eso no se puede filtrar por
  cliente ni armar una tabla dinámica, que es para lo que se baja una hoja.

### 🩸 EL «PDF DETALLADO» SE CONTRADECÍA A SÍ MISMO

Con una empresa puesta en el filtro, el encabezado de cada cliente traía el total de **esa** empresa y
debajo listaba **las seis**: `filtered` recorta los totales pero **no recorta `c.companies`**, y la
lista de empresas del papel salía de `cxcCompanies`, que no mira el filtro. Medido contra producción el
8-sep-2026 (`scripts/_medir-cxc-descargas.mjs`), empresa por empresa:

| Empresa | ANTES · encabezados | ANTES · filas de abajo | DESPUÉS · las dos cosas |
|---|---:|---:|---:|
| Vistana | $843.796,40 | $3.142.648,65 | $845.197,43 |
| Fashion Wear | $1.228.400,31 | $2.782.535,19 | $1.228.523,06 |
| Fashion Shoes | $852.966,71 | $3.075.076,59 | $859.625,45 |
| Active Shoes | $413.375,01 | $2.406.851,71 | $413.689,50 |
| Active Wear | $310.859,07 | $2.052.435,18 | $310.859,17 |
| Joystep | $64.726,17 | $1.552.544,52 | $64.856,07 |

Quién decide qué empresas se dibujan vive ahora en **una función pura**, `companiasDeLaVista()`
(`src/lib/cxc/descargas.ts`), y el total de cada bloque es **la suma de sus renglones**, no un número
que llega por otro lado. ⚠️ La diferencia entre el «ANTES · encabezados» y el «DESPUÉS» de cada fila
son los clientes con saldo a favor de esa empresa, que salieron del archivo (ver abajo).

### 🩸 A CINCO CLIENTES SE LES ESTABA COBRANDO PLATA QUE LES DEBEMOS

Medido el 8-sep-2026: **5 clientes tienen saldo A FAVOR, −$1.220,05 en total**, y a los cinco les salía
el botón negro **«Cobrar»**. El mensaje de WhatsApp que ese botón arma decía, textual:

```
Total: $-1,147.52
Agradecemos su pronta atencion a este saldo.
```

| Código | Cliente | Saldo |
|---|---|---:|
| D-139 | Viva Panama Dutty Free | −$1.147,52 |
| D-116 | Novedades La Reina, S.A. | −$37,45 |
| TCKCTA | VENTAS LOCAL | −$19,00 |
| D-75 | Ines Collection | −$13,93 |
| D-69 | Grupo Tova | −$2,15 |

La regla vive en **un solo lugar** (`src/lib/cxc/cobrable.ts`, `seLeCobra(total)`) y la leen la fila del
escritorio, la tarjeta del celular, el panel desplegado, el pie del cajón de documentos y las dos
descargas. 🔴 **También se cae la casilla de «mandar a varios»**: mandar a varios es cobrar, y
«Seleccionar a todos» ahora selecciona solo a los que se cobran.

⚠️ **En la pantalla siguen viéndose**, en su bloque «Saldo a favor» del pie, exactamente como hoy:
esconderlos sería otro defecto, esa plata existe y alguien la tiene que ver.

⚠️ **El mostrador `TCKCTA` se queda en la cartera** —Daniel: *«se queda»*—; hoy tiene −$19,00, así que
le aplica esta regla **por su saldo, no por ser el mostrador**. Hay candado que exige que ni el módulo
de decisiones ni el de cobro nombren ese código.

### 🔴 EL NOMBRE DEL CLIENTE VA CAPITALIZADO

`nombre_normalized` está en MAYÚSCULAS porque es **la llave** con la que se consolidan las 6 empresas,
no un texto para leer. El nombre que Switch manda (`nombre`) —el mismo que ya usa el papel que se le
envía al cliente— viene capitalizado. Medido: de las **213 filas** de la cartera, **211 difieren** entre
uno y otro.

🔑 **No se transforma nada**: se muestra la grafía de Switch tal cual. Las **3** que él manda en
mayúsculas son siglas —`R.J.A.S.A.`, `ACTIVE SHOES, S.A.` y `VENTAS LOCAL`— y capitalizarlas a la
fuerza daría `R.j.a.s.a.`.

### 🩸 DOS PDF DEL MISMO MENÚ QUE NO SE PARECÍAN

El «Resumen» llevaba el encabezado de tabla casi **blanco** (`#F9FAFB`, letra gris) y el «Detallado»
casi **negro** (`#111827`, letra blanca); uno vertical y el otro horizontal; uno con cuatro cajas de
totales y una barra de colores que el otro no tenía. Se fusionaron en los dos archivos de arriba, con
**una sola cabecera y un solo pie**: logo arriba a la izquierda y debajo en gris qué es y de qué
empresa; a la derecha la fecha (`fmtDate`, la del sistema) y `Hoja N de M`; encabezado de tabla en el
**navy `#1B3A5C`** —el mismo `pri` de los Excel de la casa—, filas alternadas suaves, montos a la
derecha, Total con borde superior navy, y al pie `Confidencial` · `fashiongr.com`.

El **Excel** sale por el estándar de la casa (`buildReportSheet` + `workbookBytes`): **título en la
fila 1, fila 2 vacía, encabezados en la 3 con filtro y fila fija**, y la plata como NÚMERO con
`$#,##0.00`. Para eso `buildReportSheet` ganó un `titulo` **opcional** — sin él, los encabezados siguen
en A1 y el archivo que sale es el de siempre; el panel fijo se acomoda solo porque lo deriva del `ref`
del filtro.

Los nombres dicen **qué es · de quién · de cuándo**, con guiones y sin espacios:
`CXC-cartera-2026-09-08.pdf` · `CXC-cartera-por-compania-2026-09-08.xlsx`. 🩸 Y la fecha **no se pierde
en el camino** (hay un caso conocido en Caja donde el servidor arma el nombre con fecha y el navegador
lo guarda sin ella): acá el nombre se arma del lado del navegador y viaja entero al `download` del
enlace y al `doc.save()`.

### Permisos

- 🔴 **Descarga TODO el que ve el módulo, también el VENDEDOR.** Era admin y secretaria, y el vendedor
  es justamente el que sale a cobrar con la lista en la mano. La lista se DERIVA de `veCxc()`.
- ⚠️ **`/api/cxc/aging-por-cliente/[codigo]` dejaba entrar a `contabilidad`**, un rol que **no tiene el
  módulo CXC**, y devuelve el saldo de cualquier cliente con solo saber su código. No fue una decisión:
  era una **cuarta copia** de la lista de roles que se quedó atrás. Ahora las cuatro salen de
  `src/lib/cxc/roles.ts`. La tarjeta que se abre al pasar el mouse en Ventas › Clientes —su único
  llamador— no se rompe: **Ventas es solo de admin**.

### ⚠️ Boston no se toca

Ni el módulo de decisiones, ni los dos formatos, ni el hook nombran `confecciones_boston` (hay candado).
Las empresas salen de `B2B_COMPANIES`, que ya excluye a Boston, y la cartera sale de la vista del grupo.
**La pestaña de Boston no cambió en nada**, y su hoja «Cobrar» sigue siendo la decisión pendiente de
siempre.

### Medición y candados

- Medición: `scripts/_medir-cxc-descargas.mjs` (solo lectura contra producción). Cartera del 8-sep-2026:
  **100 clientes con saldo ≠ 0 · $3.714.123,67** (0-90 $1.405.572,85 · 91-120 $932.610,65 · 121+
  $1.375.940,17). Lo que baja cada archivo: **95 renglones** el «Total por cliente» y **207 renglones**
  el «Detallado», los dos sumando **$3.715.343,72** — uno reparte lo que el otro junta.
- Candados: `src/__tests__/lib/cxc-descargas.test.ts` (41) · `src/__tests__/components/cxc-descargas-pantalla.test.tsx` (8).
  **35 mutaciones, 35 cazadas**, con 2 controles sanos (`scripts/_mutar-candados-cxc-descargas.sh`).
- Cuatro candados **cambiaron de dirección con nota fechada, ninguno se borró**:
  `cxc-papel-vocabulario` (tres pruebas: el corte del bloque de helpers ya no puede apoyarse en
  `exportCSV`; la derivación del tramo se exige sobre los ENCABEZADOS de las dos tablas en vez de sobre
  las cajas KPI que se retiraron; y el encabezado del papel), `comisiones-forma` (el verbo «Descargar»
  del CXC en celular vive ahora en el componente compartido) y `excel-encabezados-fila-1` (los lugares
  que arman una hoja pasan de **25 a 27**: entran las dos descargas, que antes eran un CSV armado a
  mano).

---

## Los datos fiscales de las SEIS empresas (9-sep-2026)

El estado de cuenta que recibe el cliente copia la forma del de Switch, que arriba imprime **cuatro
líneas de la empresa que cobra**: nombre legal, identificación, teléfono y correo. Hasta hoy solo se
conocía **Fashion Wear** —medida del papel del 8-sep— y las otras cinco salían con el nombre corto de
siempre y sin esas líneas, que era lo correcto mientras no se supieran: **lo que no se sabe no se
escribe**.

Daniel bajó de Switch el papel de las seis y dictó, verbatim:

| Empresa | Nombre legal | Identificación |
|---|---|---|
| `fashion_wear` | FASHION WEAR, INC | 40254-103-278837 |
| `vistana` | VISTANA INTERNATIONAL PANAMA, S.A. | 626251-1-455645 |
| `fashion_shoes` | FASHION SHOES HOLDINGS, S.A. | 1481660-1-643734 |
| `active_shoes` | ACTIVE SHOES S.A | 155727670-2-2022 |
| `active_wear` | ACTIVE WEAR S.A | 155727673-2-2022 |
| `joystep` | JOYSTEP CORP | 155769235-2-2025 |

**Dos cosas se apartan de lo que dice Switch, por decisión suya:**

- 🔴 **El teléfono va VACÍO en las seis.** Switch tampoco lo trae. La línea `TEL:` sale como en el
  papel de Switch, sin número.
- 🔴 **El correo de las SEIS es `info@fashiongr.com`.** Textual: *«los correos de todos debe de ser
  info@fashiongr.com»*. Los papeles de Switch traen `vistanaa@cwpanama.net`, `alberto@cboston.net`,
  `albertolevyalberto@cboston.net` y `fashionvista.pa@gmail.com` — **ninguno se usa**.

🔑 **Y ese correo se escribe UNA sola vez** (`CORREO_DEL_GRUPO`, `src/lib/cxc/empresa-fiscal.ts`): las
seis fichas se ARMAN con él. Repetido seis veces, el día que cambie queda corregido en cinco empresas y
viejo en la sexta — que es exactamente la clase de dato que nadie vuelve a mirar.

⚠️ **Sigue siendo una lista escrita a mano**, como el amarre de proveedores y el alias de vendedores. No
se deriva del `numero_fiscal` de las facturas: la identificación vive adentro de ese texto sin separador
que diga dónde termina, y sacarla a fuerza de recortar ceros es el «adivinar» que esta casa prohíbe.

⚠️ **Ninguna empresa puede salir con los datos de otra** — escribir en el papel de un cliente la
identificación equivocada es una mentira fiscal, no un detalle de forma. Una clave que no está en la
lista (Boston, Multifashion) sale con el nombre de la pantalla y las tres líneas en blanco.

> 🔄 **Actualización del mismo 9-sep-2026, más tarde: Confecciones Boston YA tiene su ficha** —Daniel
> bajó también su papel de Switch— **y su correo NO es el del grupo**. Ver el bloque del correo de
> Boston, al final de este archivo. Multifashion sigue sin ficha, y sigue saliendo en blanco.

- Candado: `src/__tests__/lib/cxc-empresa-fiscal-las-seis.test.ts` (11).
- Un candado **cambió de dirección con nota fechada, no se borró**:
  `cxc-estado-cuenta-forma-switch` › «una empresa sin ficha NO toma los datos de otra» — exigía las
  cinco vacías; ahora exige que nadie herede nada, con el CONTROL de una clave fuera de la lista.
- Mutaciones: ver `scripts/_mutar-candados-papel-pdf.sh` (**17 mutaciones, 17 cazadas**, 2 controles).

---

## 🔴 EL PAPEL DICE DÓNDE SE PAGA — CADA EMPRESA EN SU PROPIA CUENTA (20-sep-2026)

🩸 **Cómo estaba.** El estado de cuenta le decía al cliente cuánto debe y **ningún lugar donde
pagarlo**: los ocho `telefono` de `empresa-fiscal.ts` estaban en `""`, no había un solo número de
cuenta en el sistema y el correo cerraba con «Favor confirmar su programación de pagos» — que es
pedirle que confirme un pago sin decirle a dónde lo manda.

Daniel dictó las ocho cuentas y **eligió que cada empresa cobre en la suya**, no una sola del grupo.
Todas en **Banco General**, todas **cuenta corriente**, teléfono **212-0790**:

| Empresa | Cuenta |
|---|---|
| `fashion_wear` | 03-02-01-094730-4 |
| `fashion_shoes` | 03-02-01-103566-3 |
| `vistana` | 03-02-01-119821-6 |
| `joystep` | 04-02-00-001055-7 |
| `active_wear` | 04-02-97-548356-3 |
| `active_shoes` | 04-02-97-602364-7 |
| `american_classic` | 03-02-01-114161-3 |
| `confecciones_boston` | 03-02-01-110198-4 |

### Las reglas

- 🔴 **Viven en la MISMA ficha que la identidad fiscal** (`src/lib/cxc/empresa-fiscal.ts`), al lado del
  nombre legal y la identificación. No se abrió una segunda lista: es el mismo dato —quién cobra— y la
  cuenta se pregunta por `empresa_key`, igual que el logo, la firma y la cabeza del papel.
- 🔴 **El banco, el tipo de cuenta y el teléfono se escriben UNA sola vez** (`BANCO_DE_TODAS`,
  `TIPO_DE_CUENTA`, `TELEFONO_DE_TODAS`), como `CORREO_DEL_GRUPO`. Solo la `cuenta` es de cada una.
- 🔴 **Las tres líneas salen de UN armador** (`lineasDePago`), que leen el papel y el correo: si el PDF
  dijera «Cuenta corriente 03-02-01-094730-4» y el correo «Cta. Cte. 03 02 01 094730 4», el cliente
  tendría que decidir cuál copia. Dicen **a nombre de quién · Banco General · Cuenta corriente · el
  número · el teléfono**.
- 🔴 **En el papel va al pie de la hoja de CADA empresa, ANTES del «RECIBIDO CONFORME»**, que no se
  movió (`dibujarComoPagar`, `pdf-estado-cuenta-hoja.ts`). Un recuadro de tres líneas, 104 mm de ancho,
  con su propio salto de página: el bloque nunca queda partido ni pisa el pie de la hoja.
- 🔴 **En el correo van TODAS las empresas que viajan en ese papel** (`buildCuentasHtml`), al cierre,
  debajo del resumen de saldos. El envío manda SIEMPRE las 6 del grupo con un PDF por empresa, así que
  una sola cuenta le diría al cliente que pague seis saldos en el banco de una. Se arma del MISMO
  `result` que hace el resumen y los adjuntos, así que no puede nombrar una empresa que no va en el
  papel; el lote (`cobrar-lote`) junta las de todos los clientes de esa dirección, sin repetir.
- 🔴 **Texto plano y suelto, no una tabla**: esto se copia y se pega en la app del banco.
- ⚠️ **El teléfono se dice UNA vez cuando es el mismo en todas.** Hoy las ocho contestan en el mismo
  número: repetirlo seis veces tapa las seis cuentas, que es lo que se vino a leer. Si alguna llega a
  tener el suyo, cada bloque vuelve a llevar el propio.
- 🔴 **«Favor confirmar su programación de pagos» no se tocó**: sigue siendo el texto editable de
  siempre, y los datos van debajo.
- 🔴 **Confecciones Boston cobra en la suya, por su propia ruta** (`/api/cxc/boston/estado-cuenta` y su
  correo): su papel ya firmaba como Boston y ahora también le paga a Boston. La cuenta se pregunta por
  su `empresa_key`, así que la del grupo no tiene por dónde entrar — y hay candado en las dos
  direcciones.
- 🔴 **Falla ABIERTA en los dos lados**: una empresa sin cuenta cargada deja la hoja y el correo
  exactamente como estaban. Nunca la cuenta de otra empresa.
- ⚠️ **El preview del modal muestra el MISMO bloque que sale**: el HTML lo arma el SERVIDOR y viaja
  como `cuentasHtml`.

### Lo que queda pendiente de Daniel

- ⚠️ **El teléfono de Boston.** Dictó `212-0790` para «todas», pero lo dijo **antes** de dar la cuenta
  de Confecciones Boston. Está puesto en las ocho; falta que él confirme que Boston contesta ahí.

### Candados

- `src/__tests__/lib/cxc-donde-pagar.test.ts` (23): las ocho con cuenta y teléfono, los ocho números
  **dígito por dígito** contra lo dictado, ninguna con la de otra, el bloque en el papel antes del
  «RECIBIDO CONFORME», las seis cuentas en el correo, Boston con la suya y sola, las tres rutas que lo
  pasan y el preview del modal. Con controles: clave desconocida, lista vacía y correo sin bloque.
- Dos candados **cambiaron de dirección con nota fechada, no se borraron**: `cxc-empresa-fiscal-las-seis`
  y `planilla-tres-descuentos` exigían el teléfono VACÍO. La regla que protegían —se escribe UNA vez y
  es el mismo en todas— no cambió; cambió el valor que Daniel dictó. ⚠️ El comprobante de la planilla
  solo lee el nombre legal y la identificación: ese número no sale en ningún papel suyo.

---

## 🔴 EL CORREO DE COBRO DE CONFECCIONES BOSTON — «FIRMA CONFECCIONES BOSTON» (9-sep-2026)

**Daniel, textual:** *«Firma Confecciones Boston»*.

Hasta hoy la hoja «Cobrar» de Boston tenía tres salidas —WhatsApp · Copiar el mensaje · Ver los
documentos— y **no mandaba correos**. No era un olvido: estaba anotado como decisión pendiente desde
el 5-sep, porque el texto de cobro del sistema lo firma **Fashion Group**, que no es quien le vendió a
ese cliente, y quién firma el correo de Boston es una decisión de negocio. Daniel la tomó.

### Lo que se midió ANTES de prenderlo (producción, 9-sep-2026)

| | |
|---|---|
| Clientes con saldo en Boston | **398** |
| Total de su cartera | **$197.799,82** |
| Con teléfono cargado | **284** |
| Con correo cargado | **119** |
| Códigos que existen en las DOS carteras | **1** (`TCKCTA`, el mostrador) |

Idénticas después: **esto prende un botón, no toca un número** (`scripts/_medir-boston-correo.mjs`).

### Las reglas

- 🔴 **UN CLIC, CON DESHACER DE 5 SEGUNDOS.** El mismo patrón del grupo (`useUndoAction`/`UndoToast`):
  el POST real ocurre recién al vencer el plazo, así que «Deshacer» no cancela un correo que ya salió
  —**impide que salga**—.
- 🔴 **NADA DE LO QUE RECIBE UN CLIENTE DE BOSTON DICE FASHION GROUP.** Ni el remitente, ni el asunto,
  ni el cuerpo, ni la firma, ni el membrete de la banda negra, ni el nombre del archivo adjunto, ni el
  PDF —que además sale **sin el logo** de Fashion Group y **sin `fashiongr.com`** en el pie.
- 🔑 **QUIÉN FIRMA NO SE ELIGE: SE DERIVA DE LA EMPRESA** (`src/lib/cxc/casa-del-papel.ts`,
  `casaDeEmpresa` / `casaDeEmpresas`). Un parámetro «casa» con valor por defecto arreglaba hoy y dejaba
  el defecto para mañana: el día que alguien no lo pase, un cliente de Boston recibe un cobro firmado
  por una empresa que no le vendió nada. La casa se pregunta por `empresa_key`, que el papel ya tiene
  en la mano. La lista de casas es **explícita** —derivarla de `empresasCarteraAparte()` haría que una
  empresa nueva heredara el membrete de Boston sin que nadie lo decida— y hay candado que exige que
  toda empresa de cartera aparte esté nombrada ahí.
- 🔴 **SIN LOGO, PORQUE NO SE PRESTA EL DE OTRO.** Boston no tiene logo cargado en el sistema. Su papel
  sale sin ninguno: la misma regla de `empresa-fiscal.ts` —lo que no se sabe no se escribe, y **nunca**
  se escriben los datos de otra empresa.
- 🔴 **SU PROPIA RUTA** (`/api/cxc/boston/enviar-email`), no un parámetro en la del grupo:
  `/api/cxc/enviar-email` manda SIEMPRE las 6 empresas (`empresasDelEnvio()`), y abrirle una puerta a
  Boston es exactamente la mezcla que esta casa prohíbe.
- 🔴 **SU PROPIA CONSULTA** (`src/lib/cxc/boston-estado-cuenta.ts`): `.eq("empresa_key",
  EMPRESA_BOSTON)` en la misma cadena, ficha del cliente de `switch_clientes` **acotado a Boston**, y
  **nunca** `clientes_master` ni `fetchEstadoCuentaData`. La consulta salió de la ruta del cajón para
  que el papel lea EXACTAMENTE los mismos documentos que muestra la pantalla — dos consultas para el
  mismo estado de cuenta es cómo se llega a que el papel diga un número y el cajón otro.
- 🔴 **UN SOLO PDF, con la FORMA DE SWITCH.** Boston es UNA compañía: no hay desglose por empresa, así
  que es una hoja. Es el MISMO `buildEstadoCuentaPDF` del grupo — se comparte la FORMA, no la CONSULTA.
- 🔴 **EL ENVÍO SE ANOTA DESPUÉS DE QUE RESEND CONFIRMA**, nunca antes: anotar antes deja la marca gris
  puesta por un correo que no salió. Mismo orden que `cheques.aviso_vencido_en`.
- 🩸 **Y LA ANOTACIÓN DICE DE QUÉ CARTERA ES** (`empresas: ["confecciones_boston"]`, la columna que la
  tabla ya tenía — cero DDL). Sin eso, un cobro de Boston pintaría su marca gris en el CXC del grupo:
  medido, `TCKCTA` existe en las dos carteras. **Un badge también es mezclar**, así que la lectura del
  grupo (`/api/cxc/envios`) ahora salta esas filas; las viejas, sin `empresas`, siguen siendo del grupo.
- ⚠️ **Sin correo cargado el botón sale APAGADO** y dice dónde cargarlo — **solo 119 de 398 lo tienen**.
  Y no se inventa ninguno: sin fila, el destinatario va vacío.
- ⚠️ **NO se estrenó el «mandar a varios»**: el encargo era el correo de UN cliente, y el lote sin
  decidir qué pasa con los 279 sin correo sería inventar una regla que nadie aprobó.
- ⚠️ **La palabra «vencido» sigue prohibida** hacia el cliente: los tres tramos del correo se rotulan
  por su RANGO, con `tramoRango()` de `cxc-aging` — la misma lista que rotula la pantalla y el papel.
- **Quién entra:** `ROLES_BOSTON` = admin + `gerente_boston` (David). Secretaria y vendedor no ven esta
  cartera y la ruta les contesta **403**.

### Lo que queda pendiente de Daniel

1. ✅ **RESUELTO EL MISMO DÍA — las cuatro líneas fiscales.** Daniel bajó el papel de Switch de
   Confecciones Boston y dictó, verbatim: `CONFECCIONES BOSTON S.A` · `Identificación: 655-544-133465`
   · `TEL:` (vacío, Switch tampoco lo trae) · `ventas@cboston.net`. Ya viven en
   `src/lib/cxc/empresa-fiscal.ts` con la clave `confecciones_boston`, y la cabeza de su papel dejó de
   salir con las líneas en blanco.
2. ⚠️ **El dominio del remitente.** Resend solo tiene verificado `fashiongr.com`, así que el correo
   sale como `Confecciones Boston <cobros@fashiongr.com>`: lo que el cliente LEE dice Confecciones
   Boston, la dirección técnica sigue siendo la nuestra. Verificar un dominio propio de Boston (por
   ejemplo `cboston.net`) es una decisión suya.

### 🔴 EL CORREO DE LA CABEZA: DOS REGLAS QUE SE CRUZAN

Para **las 6 del grupo** Daniel dictó *«los correos de todos debe de ser info@fashiongr.com»*, y ahí
**no** se usa el que trae cada papel de Switch. Para **Boston manda la otra regla**: su papel **no dice
Fashion Group en ninguna parte** —se le quitó el logo del grupo y el `fashiongr.com` del pie— porque lo
lee un cliente que le compró a Confecciones Boston. Ponerle `info@fashiongr.com` en la cabeza fiscal le
devolvería exactamente lo que se le acaba de sacar.

🔴 **Por eso Boston usa `ventas@cboston.net`**, el que Switch imprime en SU papel. Es **la única
excepción** a `CORREO_DEL_GRUPO`, y está escrito en el código **por qué** — para que el próximo no la
«unifique» sin querer. El correo del grupo se sigue escribiendo **una sola vez**, y el de Boston
también.

⚠️ **El REMITENTE del correo no cambia.** Daniel, preguntado: *«fashiongr»* — sigue saliendo como
`Confecciones Boston <cobros@fashiongr.com>`. Lo que cambió es la cabeza del PDF, que es la que dice
quién cobra.

### Candados

- `cxc-empresa-fiscal-las-seis.test.ts` (17) — las cuatro líneas de Boston, su correo propio, y el
  CONTROL de que ninguna de las seis se llevó el suyo.
- `boston-correo-lo-firma-boston.test.ts` (33) — el texto, el papel de verdad generado con jsPDF, la
  conducta de la ruta (roles, orden del anotado, Resend caído) y la lectura del grupo.
- `boston-hoja-cobrar-correo.test.tsx` (7) — la hoja **pintada**: el botón prendido, apagado, y lo que
  programa.
- **37 mutaciones, 37 cazadas** con 2 controles (`scripts/_mutar-candados-boston-correo.sh`).
- Cuatro candados **cambiaron de dirección con nota fechada, ninguno se borró**:
  `cxc-boston-mismo-formato` › «la hoja de Boston NO manda correos» pasó a exigir que el correo salga
  por LA RUTA DE BOSTON; `cxc-estado-cuenta-legible` › la consulta de Boston se busca ahora en su
  módulo, con el CONTROL de que la ruta ya no arma la suya; `cxc-empresa-fiscal-las-seis` › la lista
  pasó de «exactamente las 6» a «las 6 + Boston», sigue siendo exacta y cerrada; y
  `cxc-estado-cuenta-forma-switch` › «una empresa sin ficha no toma los datos de otra» cambió su
  ejemplo de Boston a Multifashion, sumando el control de que Boston tampoco hereda nada.


---

## 🔴 EL CUADRE SE LEE DESDE ADENTRO — el saldo de Switch estaba un piso más abajo (18-sep-2026)

### Lo que pasaba

Desde el 9-sep-2026 el sync guarda en `switch_estadocuenta_saldo` lo que Switch dice que debe cada cliente (`saldoTotal`) y su aging por tramos (`Saldos[]`), para que el cajón y la hoja «Cobrar» avisen cuando nuestra suma de documentos no coincide. **Medido el 14-sep y remedido el 18-sep: 835 filas, `synced_at` de hace horas, y CERO con `saldo_total`, CERO con `saldos`.** El aviso «esto no cuadra» no podía saltar nunca y el cajón se comportaba como si siempre cuadrara.

### Por qué

Switch **sí manda** los dos campos, pero **anidados**. La fuente oficial (`docs/switch/api-documentacion.pdf`, §5.15, p. 23):

```
data: { estadocuenta: { elements: [...], Saldos: [ { title: "0-30", saldo: 0 }, … ], saldoTotal: 0.00 } }
```

El sync los buscaba un piso más arriba (`sync-empresa.ts`: `ec?.saldoTotal` y `ec?.Saldos`, donde `ec` es `data`). Ahí no hay nada → NULL siempre. El origen estaba en el tipo: `types.ts` declaraba `Saldos?` y `saldoTotal?` como **hermanos** de `estadocuenta`, y el código se escribió confiando en el tipo.

🔑 **La prueba de que era la ruta y no un campo que falta**: el endpoint gemelo de proveedores (`/apiproveedor/info`) tiene la MISMA forma y `sync-proveedores.ts` sí lee `info.estadodecuenta.saldoTotal` — **65 de 65 proveedores con su saldo lleno**. Se copió ese patrón.

### Lo que cambió

- **`src/lib/switch-api/estadocuenta-cuadre.ts`** (nuevo, puro): `cuadreDeSwitch(data)` lee `data.estadocuenta.saldoTotal` y `data.estadocuenta.Saldos`, **aceptando las dos grafías** `Saldos` (así lo imprime el PDF de clientes) y `saldos` (así lo manda proveedores; no se sabe cuál manda cada empresa). `filaDeCuadre(...)` arma la fila entera de `switch_estadocuenta_saldo`; es la ÚNICA puerta por la que el sync la construye.
- **`types.ts`**: `Saldos?` · `saldos?` · `saldoTotal?` pasaron **adentro** de `estadocuenta`, con el bucket tipado (`{ title, saldo }`) tal cual el PDF.
- **`sync-empresa.ts`**: ya no toca el JSON a mano; llama `filaDeCuadre` con la respuesta entera.
- 🔴 **Falla ABIERTO**: sin el campo se guarda NULL, como hoy, y nada se rompe. **Nunca un cero inventado** — un cero es un saldo, y decir «debe $0» cuando no se sabe es peor que no decir nada. Un `0.00` que SÍ viene es un cero de verdad. Un aging que no sea lista se guarda NULL, no como si lo fuera.
- ⚠️ **Sin migración**: la tabla existe y ya se escribe. En la siguiente corrida de `switch-sync tipo=estadocuenta` las 835 filas se llenan solas; el cajón y «Cobrar» empiezan a poder avisar sin que nadie toque nada más.
- ⚠️ **No se llamó a Switch**: `.env.local` no trae las credenciales del API (solo las del panel web) y entrar expulsa a quien esté adentro. Se trabajó con el código, la doc y lo guardado. **Lo que queda es comprobarlo tras la corrida siguiente** (`docs/pendientes-vivos.md` § 4): si las filas siguen en NULL, el defecto es OTRO.

### 🔑 Un segundo cuadre que ya está pagado — y que NO se construyó

Hallazgo de la investigación: cada documento trae `saldoConsecutivo` (el saldo corrido que Switch imprime) y **eso sí lo guardamos** en `switch_estadocuenta.raw_data`. Medido contra las 6 empresas y 1.896 documentos: **227 de 227 clientes con saldo abierto cuadran al centavo, 0 no cuadran.** Es una comprobación más débil que `saldoTotal` y ya está en la base sin costo; Daniel no la pidió, así que **se anota y no se construye**. Si algún día se construye, dos advertencias:

- **(a)** Compara el corrido de Switch contra **los documentos que Switch mandó**, así que **no atrapa una lista que llegue incompleta** — la misma limitación que el cuadre de la cartera de Boston (ver arriba: «un reporte corto cuadra al centavo consigo mismo»). Para eso está `saldoTotal`.
- **(b)** En los clientes **SIN documentos abiertos el corrido queda viejo y no sirve**: 58 casos no evaluables, y **sin ese filtro salen 66 falsos desajustes**.

### Candados

- **`src/__tests__/lib/cxc-cuadre-desde-adentro.test.ts`** — con la respuesta del PDF tal cual (p. 23): se lee desde `estadocuenta` y el nivel de afuera NO cuenta (un 999 puesto afuera no gana al 50,9 de adentro; solo afuera → NULL) · las dos grafías · sin campo, basura, vacío o ilegible → NULL, nunca 0 · `0.00` → 0 · coma de miles · la fila entera · barrido: el sync arma la fila SOLO por `filaDeCuadre` con la respuesta entera y no vuelve a leer `ec?.saldoTotal`; el tipo declara el cuadre adentro (indentación de 4, no de 2) y compila con la forma del PDF.
- `cxc-estado-cuenta-forma-switch.test.ts` › «el sync dejó de tirar `saldoTotal`» **cambió de dirección con nota fechada**: exigía `ec?.saldoTotal` — ESA era la lectura del nivel de afuera — y ahora exige `filaDeCuadre({`.
- **Verificado por mutación: 12 mutaciones, 12 cazadas, 2 controles verdes** (`scripts/_mutar-candados-cuadre-desde-adentro.sh`): leer de `data` en vez de `data.estadocuenta` · solo `Saldos` · solo `saldos` · 0 sin campo · 0 con vacío · 0 con ilegible · «debe $0» sin `estadocuenta` · aging que no es lista guardado tal cual · coma de miles sin quitar · el sync lee el JSON a mano · el sync pasa un pedazo y no la respuesta · el tipo sube `saldoTotal` afuera.

## 🔴 LAS CINCO DE DANIEL DEL 20-sep-2026 (Cuentas por Cobrar)

Cinco cosas que Daniel aprobó el mismo día, cada una con su medición y su candado.

### 1 · La lista abre por «más viejo sin pagar»

🩸 **Cómo estaba.** Abría por MONTO. Medido contra producción: de los **10 clientes más grandes**
—el **63 % de la plata**— **nueve** habían pagado en los **últimos 80 días**, y el que lleva
**313 días sin pagar** ($143.713) salía en el **puesto 8**. La lista ponía arriba justo a los que
ya estaban pagando.

Y el dato que ahora ordena estaba ESCONDIDO: `avisoSinPagarDe` devolvía `null` mientras el filtro
de «+90 d» estuviera apagado, así que la pantalla quedaba ordenada por una antigüedad que no se
podía leer en ninguna fila.

**Cómo quedó.** `ORDEN_AL_ABRIR` (`lib/cxc-orden.ts`) es un **override anclado a «Total
pendiente»**, no un cuarto valor de `ordenParaRiskFilter`: por eso las tres píldoras de tramo
siguen ordenando por SU tramo (regla del 27-jul-2026, intacta) y un toque en el título «Total»
vuelve al orden por monto. El que **nunca pagó va PRIMERO** —misma regla que `avisaSinPagar`—, y la
edad se compara, no se resta (`Infinity − Infinity` es `NaN`, y un comparador que devuelve `NaN`
deja la lista en cualquier orden). **Falla ABIERTO**: sin el resolutor de días, desempata el nombre.

Colateral: el celular **dejó de reordenar por su cuenta**. Volvía a ordenar con
`ordenParaRiskFilter(riskFilter)`, que sin chip encendido siempre decía «por total» — o sea que las
dos pantallas del mismo módulo habrían abierto con un primer cliente distinto.

- Candado: `cxc-abre-por-mas-viejo.test.ts` — **7 mutaciones, 7 cazadas**.
- Cambian de dirección, con nota fechada adentro: `cxc-sin-pagar` (exigía que los días salieran
  SOLO con el filtro encendido) y el control del celular en `cxc-favoritos-retirados`.

### 2 · El papel del cliente deja de salir con líneas rotas

🩸 **Cómo estaba.** En **cada página de cada** estado de cuenta:
`Identificación:1513069-1-650069`, `Límite de crédito0.00`, `Tiempo de Morosidad0` — sin espacio, y
el valor comiéndose los dos puntos.

**La causa, medida a 8 pt.** El rótulo se dibuja en negrita y su ancho se medía **después** de
volver a la letra normal, que es más angosta:

| Rótulo | Negrita | Normal | Falta | Hueco |
|---|---|---|---|---|
| `Nombre:` | 11,57 mm | 10,75 mm | 0,82 mm | 1,5 mm → **entra** |
| `Identificación:` | 19,05 mm | 17,16 mm | **1,89 mm** | 1,5 mm → **se monta** |
| `Código:` | 10,64 mm | 9,65 mm | 0,99 mm | 1,5 mm → **entra** |
| `Límite de crédito:` | 23,45 mm | 21,53 mm | **1,92 mm** | 1,5 mm → **se monta** |

Por eso salía mal en **dos líneas de cuatro** y no en todas: los rótulos cortos se salvaban de
casualidad. Ahora el ancho lo mide `inicioDelValor()` **con la negrita puesta**, y el hueco de
1,5 mm es un dato con nombre (`HUECO_ROTULO_MM`).

🩸 **Y se fueron dos líneas**: «Límite de crédito» y «Tiempo de Morosidad» valen **CERO en los 100
clientes** de la cartera, o sea que esa línea decía `0.00` y `0` para todo el mundo. Los campos
**no se borran** de `FichaCliente` —el sync de Switch los sigue leyendo—: lo que se retira es la
línea del papel.

- Candado: `cxc-ficha-sin-lineas-rotas.test.ts`, que **mide el PDF renderizado**: saca con pdfjs la
  X de cada rótulo y de su valor en las DOS hojas y exige que el valor arranque después de donde el
  rótulo termina. Un candado de texto («contiene Identificación:») pasaba en verde con el defecto
  puesto. **4 mutaciones, 4 cazadas.**

### 3 · El Excel y el PDF de la cartera cierran con el total de la pantalla

🩸 **Cómo estaba.** El papel decía **$4.244.028,67** y la pantalla **$4.242.821,12**. La diferencia,
**$1.207,55**, son los **5 clientes con saldo a favor**: la pantalla los muestra en su bloque
«SALDO A FAVOR (5)» al pie de la lista y del papel y del Excel **desaparecían sin que nada lo
dijera**. Dos números para la misma cartera, el mismo día, y ninguno explicaba por qué.

**Cómo quedó.** Los dos formatos llevan, en ese orden: los que se cobran · **«Total por cobrar»** ·
**«Saldo a favor (N)»** —el mismo rótulo de la pantalla— · sus renglones · **«Total general»**, que
es el número de la pantalla. Sin nadie a favor el archivo sale **exactamente como antes**, con su
única fila «Total».

⚠️ **No cambia a quién se le cobra**: `lib/cxc/cobrable.ts` no se tocó. Al saldo a favor sigue sin
mandársele correo, sin botón «Cobrar» y sin casilla de lote. Lo que cambia es que ahora SE VE.

- Candado: `cxc-cartera-cierra-igual.test.ts` — **8 mutaciones, 8 cazadas**.
- Cambian de dirección, con nota fechada: las dos líneas de `cxc-descargas` que exigían que el saldo
  a favor NO entrara al archivo y que el Total no lo restara.

### 4 · Boston: los montos encimados

🩸 **Cómo estaba.** **269 de 408 filas (66 %)** dibujaban el monto rojo de 121d+ **encima** del
negro del Total. No era el dato: era el ancho. La fila metía **DOS botones** —«Cobrar» y
«Documentos»— en la misma celda `col-span-2` donde la cartera del grupo mete uno. Medido a 1280 px
de ventana (menos los 224 de la barra lateral), esa celda da **~164 px** y los dos botones más el
monto pedían **~226**: los 62 que sobraban se derramaban sobre la columna de al lado.

**Cómo quedó.** «Documentos» sale de la fila y lo abre **tocar la fila**, como en el grupo. Y la
celda del total lleva `flex-wrap`, que es el candado de verdad: a cualquier ancho en el que no
entren, el botón baja de renglón en vez de derramarse. La grilla sigue siendo la del grupo
(4/2/2/2/2), para que la tira de totales siga parada sobre sus columnas, y las tarjetas del celular
no se tocaron —ahí los dos botones van a ancho completo y nunca se encimaron—.

🔴 **Es DIBUJO, no datos**: ninguna lectura, ruta ni lista de empresas se tocó.

- Candado: `cxc-boston-montos-que-se-leen.test.tsx` — **5 mutaciones, 5 cazadas**.

### 5 · Los tres conteos de la tira se van

🩸 **Cómo estaba.** Debajo de los tres montos decía **12 · 32 · 76**. Parecen las tres partes de los
**100 clientes** y no lo son: **suman 120**, porque **27 están contados dos veces** —un cliente
puede tener plata en los tres tramos a la vez— y **7 no están en ninguno**. El chip de 0-90d cuenta
**excluyendo** (los que no tienen nada en 91-120 ni en 121+) y los otros dos cuentan **a quien tenga
algo**: por eso se solapan.

Se fueron también los del celular, que además contaban con **otra regla** (excluyente, `else if`)
—dos definiciones del mismo chip en el mismo módulo—.

⚠️ Queda **«Total · N»**, que sí es el número de clientes de la lista y no es parte de nada, y queda
la cuenta del aviso «sin pagar hace +90 d», que dice a cuántos hay que ir a buscar. **Ni un monto se
movió.**

- Candado: `cxc-tira-solo-plata.test.tsx` — **6 mutaciones, 6 cazadas**.
- Cambia de dirección, con nota fechada: el conteo de `cxc-tramos-un-solo-nombre`, que fijaba
  `["0", "2", "2"]` y cuyo propio comentario ya señalaba que con dos clientes en los tres tramos
  «Por vencer» decía **0**.

---

## 🔴 «COMENTARIO» SALE DE LA TABLA Y BAJA AL PIE (20-sep-2026)

Daniel, textual: *«deja comentario abajo general como siempre»*.

🩸 **Cómo estaba.** «Comentario» era la **tercera de las diez columnas** del papel del cliente y la
**única en `auto`**, así que se quedaba con todo el sobrante: **37,9 mm de los 191,9 útiles — el
20 % del ancho**. Y va **vacía en los 3.003 documentos**, porque el API de Switch no manda ese
campo (se revisaron las 20 llaves de cada renglón). Una quinta parte del papel en blanco a
propósito, mientras «Comprobante» y «N. Interno» se partían en dos renglones por falta de sitio.

**Cómo quedó.** Nueve columnas, el mismo orden de Switch. Los 37,9 mm se reparten entre las dos que
se partían: «Comprobante» de **23 a 42 mm** y «N. Interno» de 24 a `auto` (**~42,9 mm**). El
comentario baja al pie como un **recuadro en blanco**, con la forma que ya tiene la guía de despacho
en «OBSERVACIONES GENERALES DEL ENVÍO», pegado al «RECIBIDO CONFORME» — las dos cosas que se llenan
a mano.

⚠️ **No se inventa contenido**: el dato no existe en ningún lado de Switch, así que el recuadro sale
vacío. Ningún número se recalcula y las otras nueve columnas no se tocan.

- Candado: `cxc-comentario-abajo.test.ts`, que mide el PDF renderizado (dónde cae el recuadro y que
  «Nota de Crédito» entre en un solo renglón). **7 mutaciones, 7 cazadas.**
- Cambian de dirección, con nota fechada: las «DIEZ columnas» de `cxc-estado-cuenta-forma-switch` y
  los encabezados de `cxc-papel-vocabulario`.

---

## 🔴 EL NOMBRE DEL CLIENTE SE ESCRIBE IGUAL EN TODAS LAS PANTALLAS (20-sep-2026)

🩸 **Cómo estaba.** La lista del grupo **gritaba** `CITY MODA DEL ESTE SA` —el `nombre_normalized`,
la llave con la que se consolidan las seis empresas— y el papel del MISMO cliente decía
`City Moda Del Este, S.A.`. Guías y Reclamos también lo escriben capitalizado, y la pestaña de
Boston ya usaba el nombre de Switch. El mismo cliente, dos grafías.

Y la regla ya existía: `nombreDelPapel()` —el nombre de Switch tal cual y, solo si Switch no lo
manda, el normalizado capitalizado respetando siglas—. Lo que faltaba era usarla: había **TRES
copias sueltas** del `find(...)?.nombre ?? nombre_normalized` (la hoja «Cobrar», el modal de correo
y el cajón del estado de cuenta), cada una **sin el respaldo capitalizado**, y la lista ni eso.

**Cómo quedó.** La regla vive en `lib/cxc/nombre-cliente.ts` y la comparten la fila del escritorio,
la tarjeta del celular, la barra de «mandar a varios», los textos del WhatsApp y del «copiar
mensaje» —que los **lee el cliente**— y las descargas.

🔴 **El pareo NO se toca**: `nombre_normalized` sigue consolidando las seis empresas, ordenando,
buscando, recordando qué fila está abierta y viajando aparte al lote (`nombreNormalizado`).

🔴 **Y esto no junta a Boston con el grupo.** Daniel, textual: *«no puedes juntar Boston con Fashion
Gr, nunca te darán los mismos nombres, por eso no se mezclan»*. Boston ya mostraba el nombre de
Switch y lo lee de SU propia fuente; su pestaña no importa nada del grupo y la regla del grupo no
sabe de Boston, con candado en las dos direcciones.

- Candado: `cxc-un-solo-nombre-del-cliente.test.ts` — **8 mutaciones, 8 cazadas**.
- Cambia de forma, con nota fechada: el respaldo sin nombre de Switch en `cxc-descargas` sale
  capitalizado en vez de a los gritos.

---

## 🔴 «VENTAS BOSTON» — DAVID VE LO MISMO QUE TODOS, ACOTADO A SU EMPRESA (23-sep-2026)

Daniel, textual: *«Llámalo Ventas Boston entonces. Y dale acceso a los otros módulos»*. Y el mismo día, sobre Asistencia: *«Asistencia que pueda ver todo como yo»*.

### Lo que se midió antes (auditoría del 23-sep-2026, producción)

- David (`gerente_boston`) entró **6 veces** desde que nació el módulo (27-ago) y la bitácora no tiene una sola acción suya: el módulo no escribe `activity_logs`. Seis pestañas propias no le sirvieron.
- Su pestaña Préstamos mostraba **$18.754,89 de 17 personas, y solo $2.102,35 (11 %) era de Boston**: Julio Guzmán (Vistana) solo era el 51 %. Con esta pieza esa pestaña se va y los préstamos de su gente se ven en Asistencia › Préstamos, recortados por el servidor.
- `role_permissions.gerente_boston` = `boston · catalogos · asistencia`; `fg_users.david.modulos_override` = `null`; `fg_users.david.email` = `null`.
- Fichas de Asistencia: **23 de Boston** (de 49); fichas de préstamo vivas: 34, **14 de Boston**, 8 sin código.

### Lo que hay ahora, pantalla por pantalla

| Dónde | Antes | Después |
|---|---|---|
| Ficha del menú | «Confecciones Boston» | **«Ventas Boston»** — misma key `boston`, misma ruta `/boston`, misma casa |
| `/boston` | 6 pestañas: Inicio · Por cobrar · Ventas · Clientes · Planilla · Préstamos | **Inicio · Ventas**. Las tarjetas del Inicio siguen siendo puertas: «Por cobrar» → `/cxc`, «En planilla» → Asistencia › Planilla, «Con préstamo» → Asistencia › Préstamos (`destinoFueraDeBoston`). Un `?tab=` viejo cae en Inicio |
| `/cxc` | rebotaba a David | **La MISMA pantalla del grupo con la cartera de Boston y nada más**: tira con «N sin pagar hace +90 d», abre por «más viejo sin pagar», bloque «Saldo a favor (N)», Excel y PDF firmados por Boston (`CASA_BOSTON`: sin logo del grupo, sin `fashiongr.com`), «Cobrar» con correo y Deshacer de 5 s por `/api/cxc/boston/enviar-email`. Sin pestañas: no tiene otra cartera que elegir |
| `/cxc?tab=boston` (admin) | `BostonTab` (tira sin «sin pagar», sin saldo a favor, sin Excel/PDF) | **La misma `CarteraBoston`** que ve David: una sola pantalla de Boston, no dos |
| `/asistencia` | solo Aprobaciones | **Las mismas pestañas que el admin** (Colaboradores · Asistencia · Aprobaciones · Planilla · Préstamos), con el selector de empresa clavado en Boston y **sin «Cerrar quincena»** |

### Las reglas

- 🔴 **Todo cuelga de `VENTAS_BOSTON`** (`src/lib/boston/ventas-boston.ts`, hoy `true`). En `false`: las seis pestañas, el rótulo viejo, David sin `cxc` aunque la fila de la base ya lo diga (se PODA en `getVisibleModules` y `/cxc` lo manda a su casa), y `ASISTENCIA_ROLES` / `PRESTAMOS_ROLES` / `MIRAN_PERO_NO_CIERRAN` vuelven a las listas de antes (`rolesQueSumaVentasBoston()` devuelve `[]`). Nada de lo que se GUARDA cambia con el interruptor.
- 🔴 **Falla ABIERTA mientras la migración no corra.** `20261217130000_cxc_para_gerente_boston.sql` (escrita, **NO aplicada**; la aplica Daniel) agrega `cxc` a la fila de `gerente_boston` con `array_append` idempotente: 1 fila. Sin ella, «Por cobrar» sigue adentro de `/boston` (`pestanasDeBoston({ tieneCxc: false })`, y `tieneCxc` lo decide la MISMA regla que el menú, `hasModuleAccess`) y el módulo no le aparece. El rol NO se hardcodea en `cxc.roles[]`: entra por la key.
- 🔴 **Boston nunca se mezcla con el grupo, en las DOS direcciones, y lo decide el ROL en la pantalla y las rutas.** `carteraDelRolEnCxc(gerente_boston) = "boston"` con o sin interruptor; para él `useAdminData` no dispara (clave nula) ni se pide `/api/cxc/envios`. Los datos entran por `/api/cxc/boston` —la única ruta de cartera que su rol puede leer; las 12 del grupo le siguen contestando 403— y toman la forma del grupo en `lib/cxc/boston-como-grupo.ts`, un módulo puro que **no toca `useAdminData` ni `fetchEstadoCuentaData`**. Admin en `/cxc` sigue viendo solo las 6 (`getVisibleModules`, `ROLES_CXC` y `cxc.roles[]` no cambiaron).
- 🔴 **Ningún número de la cartera se recalcula**: tramos y total son los de `switch_estadocuenta_aging_boston`; los finos, cuando vienen, los de la misma vista (sin finos, el tramo grueso entero en su primer corte para que las sumas no se muevan). Medido con el mismo módulo puro contra producción el 23-sep-2026: **410 clientes · $193.347,32 · 289 deben $214.574,35 · 121 a favor −$21.227,03 · 53 nunca pagaron $5.930,03** — iguales a la auditoría. **«Sin pagar +90 d» = 199 clientes / $129.817,95** con la regla del grupo (último pago real por `fecha_creacion` de `switch_ultimo_pago_cliente_v2`, sin retenciones ni recibos en cero); el 146 / $123.887,92 de la auditoría no se reproduce con ninguna variante (máx. por `fecha`: 199; cualquier recibo: 184). Es la misma regla que el grupo, no un número nuevo.
- 🔴 **Lo que la pantalla de Boston NO tiene, y no se inventa**: «mandar a varios» (no hay ruta de lote), la marca «le enviaste hace N días» (el registro de envíos es del grupo) y la ficha `/clientes/…` (Boston no está en `clientes_master`). El cajón de documentos es el de Boston de siempre (`BostonDocumentosDrawer`, 6 columnas), no el de 9 columnas del grupo: pasarlo a la forma de Switch es otra pieza.
- 🔴 **El papel firma como Boston**: `pdf-cxc.ts` recibe `opts.casa` (`CasaDelPapel`) y `useDescargasCartera` la pasa; sin `casa`, el grupo como siempre. El subtítulo dice «Confecciones Boston», nunca «Fashion Group · 6 empresas».
- 🔴 **Asistencia: David entra al módulo COMPLETO y el SERVIDOR le recorta todo a Boston.** `ASISTENCIA_ROLES` y `PRESTAMOS_ROLES` lo suman por el interruptor; `MIRAN_PERO_NO_CIERRAN` también, y de ahí se deriva lo que **NO** gana: cerrar/reabrir/borrar la quincena, cargar el día libre de la empresa, la foto de la cédula, el cargo y la cédula de la ficha, esconder códigos, anotar un abono, «Aplicar quincena» de Préstamos. El recorte vive en UN lugar (`lib/asistencia/alcance-boston.ts`, puro, + `alcance-boston-server.ts`): `alcanceDelRol` = `[confecciones_boston]` solo para él; **las listas se filtran por la empresa de la FICHA** (`asistencia_personas.empresa`; sin ficha no hay empresa y no entra) y **toda escritura por persona rechaza con 403** si el código no es suyo (`rechazarFueraDeAlcance`), incluidas las que llegan por `id` (justificación, vacación, corrección, renglón de otros servicios, ficha y movimiento de préstamo: se mira de QUIÉN es antes de tocarla). Reporte y Justificaciones le **fuerzan** `empresa=confecciones_boston` pase lo que pase en la URL (mismo criterio que la planilla). Lo que es de TODAS las empresas —feriados, reglas— lo lee y no lo cambia (403 con `rechazarLoDelGrupo`). Para los demás roles `alcanceDelRol` es `null` y no se lee una sola fila de más.
- 🔴 **Las tres pantallas de Asistencia que David abre son las del grupo** (`PlanillaTab`, `ReporteTab`, `ConfiguracionTab`, `PrestamosTab`), no copias: el selector de empresa le ofrece solo Boston (`empresasQueVe` + `/api/asistencia/alcance`), la Planilla pide con `?empresa=` y el servidor lo fuerza, «Descargar ⌄» le sirve Excel, PDF y comprobantes solo de su gente (`/api/asistencia/comprobante` filtrado). `PlanillaBoston.tsx` y `PrestamosBoston.tsx` quedan solo para el interruptor apagado.
- ⚠️ **Catálogos se queda** (Daniel, 27-ago: «catalogo para david si, solo eso»): con la migración David tiene CUATRO fichas —Ventas Boston · Cuentas por Cobrar · Asistencia y Planilla · Catálogos—, no tres. No se tocó.
- ⚠️ **Pendientes de Daniel**: cargarle correo a David (`fg_users.email = null`: el correo de cobro sale sin copia para él); la sección Reglas de Colaboradores le muestra el formulario y el servidor le contesta «lo cambia contabilidad o un administrador» (esconderlo es cosmético, otra pieza); el cajón de documentos de Boston en 9 columnas.

### Candados

- **`boston-ventas-boston.test.tsx`** (nuevo, 31 casos): `/boston` con solo Inicio y Ventas y el DOM de `BostonShell` (con y sin el permiso); `?tab=cxc|planilla|prestamos|clientes` cae en Inicio; el rótulo; la cartera por rol y el DOM de `CarteraBoston` con «Saldo a favor (1)» y «2 sin pagar hace +90 d» sin una sola lectura del grupo; `/api/cxc/aging` 403 y `/api/cxc/boston` 200 para David con cookie firmada; Asistencia con las mismas pestañas que admin, `puedeCerrar` en `false`, y por ruta: `comprobante` y `prestamos/empleados` con 0 filas de otra empresa (admin las ve todas), `horarios` 403 a un código ajeno, `feriados`/`reglas`/`aplicar-quincena` 403; barrido que exige el recorte en las 15 rutas que escriben por persona y las 6 que listan; la migración aditiva e idempotente; el interruptor en `false`.
- **Cambiaron de dirección con nota fechada** (no de regla): `boston-acceso` (§2 «solo Aprobaciones» → «las mismas pestañas que admin, sin cerrar»; `/api/prestamos/empleados` pasa de ajena a propia), `asistencia-aprobador-empresa` (David en `ASISTENCIA_ROLES`), `prestamos-un-solo-lugar` (`PRESTAMOS_ROLES` con David), `asistencia-modulos-efectivos` (lo que frena sin la key es el MÓDULO). Los 12 candados de aislamiento Boston↔grupo (`cxc-boston-fuera-de-toda-superficie`, `boston-no-se-mezcla`, `cxc-boston-permiso`, `cxc-boston-mismo-formato`, …) siguen verdes sin tocarse.
- **Verificado por mutación (6, todas en rojo)**: dejar Planilla en `/boston` (6 casos); `alcanceDelRol` devolviendo `null` para todos (5); sacar a David de `MIRAN_PERO_NO_CIERRAN` (2); `CarteraBoston` leyendo `/api/cxc/aging` (2); el rótulo de vuelta a «Confecciones Boston» (3); `/cxc` disparando `useAdminData` para David (1).

---

## Lo que decía CLAUDE.md hasta el 14-sep-2026 (movido acá, verbatim)

> El 14-sep-2026 CLAUDE.md pasaba de 333 mil caracteres (el tope del harness es 150 mil) y las instrucciones se cortaban a la mitad. Se dejó ahí un resumen de las reglas vigentes y el texto completo —mediciones, citas de Daniel, candados y mutaciones— se movió acá sin cambiar una palabra.

### Boston y CXC — [docs/postmortems/boston-cxc.md](docs/postmortems/boston-cxc.md)

- 🔴 **Boston NUNCA se mezcla con el CXC del grupo** — ni una fila, ni un total, ni un export, ni un badge. Se ve SOLO en su pestaña.
- 🔴 **El CXC del grupo SÍ convive con el resto del sistema** (guías, marketing, clientes, ventas). **Aislarlo de más también es un error.**
- Se cierra en la vista `switch_estadocuenta_aging`, **UNA sola vez**; `switch_estadocuenta_aging_mv` **materializa esa vista** (`SELECT v.* FROM switch_estadocuenta_aging v`), no copia su cuerpo.
- **Fashion Group son SEIS empresas:** `vistana · fashion_wear · fashion_shoes · active_wear · active_shoes · joystep` (= `B2B_EMPRESA_KEYS` = `empresasConCxc()`). `confecciones_boston` y `american_classic` NO lo son. La vista **EXCLUYE**, no enumera.
- Toda lectura de `switch_estadocuenta` acota por `empresa_key` en la misma cadena.
- `gerente_boston` (David): módulos `boston` + `catalogos` (**solo VER**), casa `/boston` vía `MODULO_CASA_POR_ROL`. No ve búsqueda global, CXC del grupo, Ventas, Comisiones, Guías, la lista de comprobantes ni administrar catálogos.
- Los **sueldos se recortan en el SERVIDOR** (`VE_SUELDOS_DE_BOSTON`, hoy en **`true`** desde el 3-sep-2026 — David SÍ ve los sueldos de su planilla; el mecanismo de recorte se conserva intacto); se ENUMERA lo que viaja (`CAMPOS_SIN_DINERO`), nunca se borra lo que se va.
- El `ccte_id` de Boston lleva el AÑO adentro: `serie × 10.000.000 + (año − 2000) × 100.000 + correlativo`. Un documento sin fecha se **rechaza** y la corrida se corta sin escribir.
- Orden obligatorio del sync: **upsert → reconcile**, nunca al revés (el reconcile pone `saldo = 0` a todo lo que no se reescribió).
- 🔴 **SU PLATA SUMA; SUS CLIENTES NO SE VEN.** Daniel, textual (2-sep-2026): *«solo se queda CXC de Boston en su tab, sin que toque ni se mezcle con los otros. **Déjalo en Vista General**»* y *«Boston también quiero verlos en ventas-resumen»*. Es la línea fina de todo: **la VENTA de Boston sigue sumando** en Ventas › Resumen y Vista General ($463.898,47 = 7,4% de 2026). Lo que sale de las superficies del grupo son sus **CLIENTES**, nunca su venta. Hay candado en las dos direcciones.
- 🩸 **Boston tampoco entra a `clientes_master`** (2-sep-2026). Estuvo adentro cinco semanas —4.910 filas del 28-jul— y el ranking de Ventas publicó **$2,55 millones de venta que no existió** por unir clientes por NOMBRE. Se marcaron 4.914 filas como borradas; quedan **150**. Ver el bloque de Ventas.
- La **ficha por dirección también se cierra**: `/api/clientes/[codigo]` (GET, PATCH e historial) pregunta `esCodigoDelGrupo()` y contesta **404**, el mismo que un código inexistente — un 403 sería un oráculo de qué clientes tiene Boston.
- 🔴 **Su DIRECTORIO de clientes se refresca solo, SEMANAL, y sigue sin tocar al grupo** (5-sep-2026). `switch_clientes` de Boston llevaba **37 días congelado** (4.915 filas con el mismo `synced_at`, 30-jul-2026 06:31:07): el único escritor del directorio vivía dentro del estado de cuenta por API, que para Boston está vetado, así que el día que salió de ese cron su directorio se congeló y **ninguna alerta lo cubría**. Lo trae `/api/cron/sync-clientes-boston` (domingos 07:10 UTC — Daniel: *«semanal»*), reusando el MISMO escritor que las 6 del grupo (`clientes-directorio.ts`). 🔴 **Escribe SOLO `switch_clientes` con `empresa_key = 'confecciones_boston'`; `clientes_master` no se toca** — Daniel: *«los clientes de Boston no quiero que toquen los de Fashion Group… no quiero volver a pasar por el mismo error»*. Dos guardas antes de marcar a alguien como ausente (lista completa **y** que no haya encogido por debajo del 70% de lo conocido); lista vacía = error, no se escribe nada. Y ahora **sí se vigila**: alerta B de `silencio-de-datos.ts` sobre esa tabla, solo Boston, umbral SEMANAL de 165 h (a la primera corrida perdida: no hay segunda oportunidad hasta el domingo siguiente). Candado: `boston-clientes-no-tocan-el-grupo.test.ts` (21 casos); 29 mutaciones, 29 cazadas (`scripts/_mutar-candados-respaldo-boston.sh`).
- 🔴 **LA SECRETARIA COBRA, Y EL MÓDULO LE SALE EN EL MENÚ (11-sep-2026).** Daniel, textual: *«a) sí, le doy CXC completo»*. 🩸 Ya cobraba —la pantalla la nombraba en sus `allowedRoles`, las 12 rutas de `/api/cxc/*` salen de `ROLES_CXC` y desde la ficha del cliente le salía «Cobrar» y le funcionaba—, pero el catálogo de módulos tenía la lista **escrita a mano** (`["admin","vendedor"]`) y `role_permissions.secretaria` tampoco traía la key: para llegar había que saberse la dirección. Ahora `modules.ts` importa `ROLES_CXC` y hay migración `20261117120000_cxc_para_secretaria.sql` (**aplicada y verificada**, `array_append` solo si no estaba). ⚠️ **Boston sigue afuera**: esa cartera es otro módulo con su propia lista. Candado: `cxc-secretaria-cobra.test.ts`.
- Candados: `cxc-boston-fuera-de-toda-superficie.test.ts` · `boston-acceso.test.ts` · `boston-cartera-web.test.ts` · `boston-clientes-no-tocan-el-grupo.test.ts`.


**La planilla de David es la de Yulissa — PLATA (11-sep-2026).**
- 🔴 **Las columnas de dinero salen de UN solo lugar** (`lib/asistencia/columnas-dinero-planilla.ts`). 🩸 El 10-sep la del grupo pasó a **19** columnas con «Salida temprana» —una deducción real: `totalBruto = … − ausencias − tardanzas − salidaTemprana`— y la de Boston se quedó en **18**: con cualquiera que saliera temprano, las columnas visibles de David no daban el Total bruto ni el Neto. Medido 1–15 sep: **18 de 19** personas de Boston traen plata en esa columna. `PlanillaTab` y `PlanillaBoston` leen la MISMA lista, y el candado exige que lo que Boston dibuja sea EXACTAMENTE esa lista.
- 🔴 **Boston pide con el MISMO corte que la contadora**: el GUARDADO de la quincena cerrada, o el sugerido (13/28) — `lib/boston/planilla-corte.ts` (`corteParaBoston`). 🩸 Pedía SIN `corte` mientras el grupo propone 13/28 y lo guarda al cerrar. **Medido 16–31 ago contra producción: sin corte, 3 de 18 netos cambiaban** (Alejandra 216,63 vs 217,25 · Andrés 371,21 vs 371,98 · Yeritza 247,10 vs 250,00; total 4.800,55 vs **4.804,84**); con el corte, **David = Yulissa neto por neto** (18 de 18; 1–15 sep: 19 de 19, $4.593,88). Para saber si la quincena está cerrada, `GET /api/asistencia/planilla-guardada` acepta a `gerente_boston` **forzándole Boston** (un `?id=` ajeno contesta 404; cerrar y reabrir siguen siendo de quien cierra). La pantalla DICE el corte («Corte 13 sep · …») y el ajuste de la quincena anterior al pie (`notaAjuste`) y en el `title` de la celda, igual que el grupo.
- 🔴 **Su Préstamos suma las tres cuentas.** 🩸 `/api/boston/prestamos` pedía `deduccion_dano` (sin lectores desde el 10-sep: el daño no propone cuota) y nunca `deduccion_terceros`: el «descuenta $X por quincena» era menor al que la planilla aplica. Ahora saldo = `calcularSaldoPrestamo` (préstamo + daño + terceros) y cuota = préstamo + terceros.
- Candados: `boston-planilla-mismas-columnas.test.tsx` · `boston-prestamos-tres-cuentas.test.ts` · `boston-planilla-con-dinero.test.tsx` (cambió a 19 con nota) · `asistencia-reglas-de-la-contable.test.ts` (cambió de dirección: el rótulo vive en el módulo); medición `integration/boston-planilla-mismos-numeros.test.ts` (`RUN_DB_TESTS=1`, solo lectura).

**El rediseño del módulo (5-sep-2026).** Cuentas por Cobrar vive en **`/cxc`** (era `/admin`; el rótulo NO cambió y `/admin/usuarios` NO se movió — la redirección es de `/admin` EXACTO, temporal 307, con la query intacta).

- 🔴 **«Cobrar» es la ÚNICA puerta de cobro, y se VE en cada fila.** Una hoja con cuatro salidas —Correo (un clic, con **Deshacer de 5 s**) · WhatsApp · Copiar el mensaje · Ver o bajar el PDF— más «Escribirlo yo», que abre el formulario completo de siempre. Reemplaza a SEIS puertas: el menú «···» (4 opciones), el botón negro del panel y el menú de **clic derecho**. Los dos menús se retiraron y hay candado que impide que vuelvan. El pie del cajón de documentos también dice «Cobrar»: desde el papel no se podía mandar el papel. Cobra **todo el que ve el módulo** (admin · secretaria · vendedor).
- 🔴 **LO QUE SE MANDA SON SIEMPRE LAS 6 EMPRESAS**, sin importar el filtro de la pantalla. Daniel, textual: *«todo»*. 🩸 El modal le pasaba el filtro a la ruta, así que con Vistana seleccionado el CLIENTE recibía un estado de cuenta de Vistana solamente — y Edwin, con Vistana fija por `fg_empresa_filter`, **no podía mandar el completo ni queriendo**. La regla vive en el SERVIDOR (`empresasDelEnvio()`); el parámetro `empresa` se dejó de leer. ⚠️ El **cajón de documentos** (`/api/cxc/estado-cuenta/[codigo]`) SÍ conserva el filtro: eso es lo que se MIRA.
- 🔴 **Mandar a varios: UN correo por DIRECCIÓN, nunca uno por cliente.** Los que comparten dirección reciben **un solo correo con UN PDF** de una hoja por cliente y un total al final. Medido: de los 79 clientes con correo, **31 comparten 9 direcciones → 57 correos**; `oficina@citymoda.store` lo comparten **13 clientes** ($402.376,67). Quien agrupa es el SERVIDOR. Los **sin correo NO abortan el lote**: se manda a los que se puede y se dicen **por nombre** los que quedaron fuera (21 de 100 no tienen). Dos direcciones distintas son dos correos: se comparan en minúsculas y sin bordes, **nada más** (nada de alias con `+` ni de quitar puntos).
- 🔴 **Aviso «sin pagar hace +90 d»**: días desde el ÚLTIMO PAGO REAL en las 6, cruzado por **CÓDIGO**. **Las retenciones NO cuentan, ni los recibos en cero** (si contaran, City Mall parecería que pagó ayer por $19,60). **El que NUNCA pagó también avisa.** El «hoy» es el de PANAMÁ. Cero peticiones nuevas: el máximo sale de la lectura que ya se hacía (`/api/cxc/ultimo-pago`), mirando las 6 empresas y no solo donde el cliente debe. Es un filtro más (URL, `replace`) y **solo con él encendido** la fila dice «no paga hace 298 d» / «nunca ha pagado». Medido 5-sep-2026: **37 clientes · $647.944,31** (7 nunca pagaron, $56.672,56), entre ellos **ACTIVE SHOES, S.A. con $43.806,10 y la fila pintada de VERDE** — ese contraste es el punto del cambio.
- 🔴 **En el estado de cuenta, lo chico se agrupa POR MONTO (< $50), NUNCA por tipo de documento.** «Las notas de débito son las chicas» es falso: hay ND de **$5.000** (Internacional Belén) y **$3.349,10** (City Mall David). Mira el valor absoluto. Medido: 36 de los 110 documentos de City Mall Paso Canoa valen menos de $50 y suman $227,20. ⚠️ Esas notas chicas son casi todas de retenciones, pero **Switch no manda el motivo**: no se afirma en pantalla. El cajón lleva **encabezados de columna** y separa `Original` de `Saldo` (`—` cuando son iguales).
- 🔴 **«Últimos pagos» se agrupa POR FECHA**, no por empresa: los clientes grandes le pagan a varias el mismo día (29-jun-2026, D-25: $241.857,77 en las SEIS = 18 líneas para decir lo que dicen 3). Vive en el panel expandido; el botón «Últimos pagos ›» y `UltimosPagosFila` se retiraron. Se leen **30 recibos por empresa** (no 3: con 3 del mismo día una sola fecha taparía las otras).
- 🔴 **Se anota lo que se manda por los TRES canales** (`cxc_emails_enviados.canal` ∈ correo · whatsapp · copia) y la fila lo dice 7 días. **Si lo último fue un COPIAR la frase cambia** («Copiaste el mensaje hace 3 días»): copiar no se lo mandó a nadie. 🩸 Antes solo el correo dejaba rastro: **19 filas en toda la historia**, todas del 9 al 14-jul-2026. El correo lo anota `/api/cxc/enviar-email` **después de que Resend confirma**; `/api/cxc/envios` rechaza `canal: "correo"`.
- 🔴 **La ficha del cliente tiene «Contacto»** (el nombre de la persona con quien se habla), arriba de Correo. **El sync NUNCA lo pisa** — misma familia que `telefono/celular/email/notas`, con barrido que lo exige. Existía en Switch y estaba vacío (**3 de 847** filas, 1 de los 100 que deben); los 3 que había estaban escritos a mano en las notas del CXC. Con contacto, el saludo del correo y del WhatsApp lo usa; **sin contacto el texto es el de siempre** y del saludo para abajo no cambia una coma. En un correo compartido por varios **no se saluda a nadie**.
- **La pantalla pasó de SEIS bloques a DOS**: una línea de filtros (empresa · buscador **angosto** ~230 px · frescura a la derecha · Exportar · Actualizar) y la **tira de totales pegada a la tabla, en su MISMA grilla de 12 columnas** (4/2/2/2/2). En la tira el chip dice **solo el rango**; el nombre completo sigue en su `title`, en el celular, el papel y el correo, y los cuatro salen de `tramoLabel()`. Se fue «N de M clientes · ordenados por …» (el conteo está en el chip de Total, el orden en la flecha del encabezado). ⚠️ **El comportamiento de orden y filtro NO cambió**: `lib/cxc-orden` no se tocó.
- **En celular** los tres tramos entran DENTRO de la tarjeta negra del total, el aviso de +90 d es una línea más, buscador y empresa van en una fila, y **el nombre del cliente sube de 12 px a 14** (el ancho se lo devolvieron la estrella y el «···»). La hoja «Cobrar» sube desde abajo (`ModalOverlay align="center"`, el patrón del sistema).
- 🔴 **Boston recibe el mismo FORMATO y sigue APARTE.** Su cajón de documentos tiene **su propia ruta** (`/api/cxc/boston/estado-cuenta`) y **no reusa `fetchEstadoCuentaData`** —ese helper recibe una lista de empresas y bastaría con pasarle Boston—; sus teléfonos y correos salen de `switch_clientes` acotado a Boston, **nunca de `clientes_master`**. Como es UNA empresa, no hay desglose: tocar un cliente va directo a sus documentos. **Sus tramos finos SÍ se pueden calcular** (medido: 985 documentos con saldo, los 985 con `dias`) y se agregan con los MISMOS cortes del grupo; los tres que se VEN (0-90 · 91-120 · 121+) **no cambian**. ⚠️ **Su hoja «Cobrar» no manda correos y es una decisión pendiente, no un olvido**: 272 de 390 tienen teléfono pero solo 113 correo, y el texto de cobro lo firma Fashion Group — quién firma el de Boston lo decide Daniel.
- 🩸 **La pantalla de error del CXC mostraba el mensaje CRUDO y el stack**, la única del sistema. Ahora dice qué pasó, qué significa («no se perdió nada: esta pantalla solo consulta saldos») y qué hacer; el detalle va a la consola y a Sentry.
- 🩸 **`/api/cxc-rows` se retiró** (cero llamadas desde `src/`). ⚠️ **`/api/cxc/contact-log` y `/api/cxc-summary` NO**, aunque tampoco tienen lectores: los nombran por su ruta `boston-acceso.test.ts` y `cxc-boston-fuera-de-toda-superficie.test.ts`, que son candados de Boston que no se tocan. Las tablas `cxc_rows` y `cxc_contact_log` **no se borran** (patrón `mayor_lineas`).
**El estado de cuenta sale con la FORMA DE SWITCH (9-sep-2026).** Daniel, textual: *«el sistema debe de mandar el estado de cuenta tal cual como sale en Switch cuando descargas el historial. Mismos números, mismos nombres, mismo todo!!!!»*. Eligió copiar la **forma** con los documentos ABIERTOS, no la historia completa — lo mismo que hace el botón del avioncito de Switch, que «envía el estado de cuenta pendiente».

- 🔴 **El papel tiene las DIEZ columnas de Switch**, en su orden: `Fecha · Comprobante · Comentario · N. Interno · Débitos · Créditos · Saldo · Vence · Plazo · Días`, con la cabeza de la empresa acreedora centrada, la ficha del cliente en dos columnas, el `N. Fiscal:` en gris bajo cada documento electrónico y el `RECIBIDO CONFORME` al pie. Fechas en **DD-MM-AAAA**. Sigue siendo NUESTRO papel: lleva el logo de Fashion Group y el pie de la casa (`Confidencial · fashiongr.com`).
- 🔴 **MEDIDO CONTRA EL PAPEL DE SWITCH, D-25 City Mall Paso Canoa en Fashion Wear: `Total General $130.699,36` en los dos**, al centavo, con **31 documentos abiertos** contra los 1.354 que imprime Switch (`scripts/_medir-estado-cuenta-switch.mjs`; muestra en `_paraclaude/cxc/`).
- 🔑 **Los números no se recalculan: salen de dos columnas que ya guardábamos y nadie miraba.** `switch_estadocuenta.debito` y `.credito` son lo que Switch imprime, y `debito − credito` de cada fila da EXACTAMENTE el saldo firmado que ya calculaba `signo(tipo) × saldo` — medido sobre los 943 documentos abiertos de las 6. El **saldo corrido** se acumula de ahí y es el mismo `saldoConsecutivo` de Switch. 🔴 Por eso el orden `(fecha, ccte_id)` **no se puede mover**: cambiaría los números intermedios aunque el total siga igual.
- 🔴 **Los TRES tramos de la pantalla, no los ocho de Switch.** Daniel: *«solo los 3 de mi lista»*. Salen de `cxc-aging` (`AGING_ORDER` + `tramoRango()`), la misma lista de siempre. ⚠️ En el papel del CLIENTE se rotulan por su **rango** (`0 a 90 días · 91 a 120 días · 121 días y más`) y no con `tramoLabel()`: ese dice «Vencido reciente» y hay invariante que prohíbe la palabra «vencido» en lo que lee el cliente —`dias` es EDAD, no mora—. El papel de Switch tampoco los juzga. `tramoLabel()` **no cambió** para adentro de la casa. Medido: los tres primeros tramos de Switch (0-30 $10.057,27 · 31-60 $80.748,65 · 61-90 $39.893,44) suman exactamente nuestro «0 a 90 días».
- 🔴 **TODOS los documentos: nada se pliega por ser de menos de $50.** Daniel: *«En ninguno. Quiero ver todo.»* 🩸 La regla vivía SOLO en la pantalla y nunca en el PDF, así que el cajón de D-25 mostraba **74 renglones y el papel imprimía 111** — dos superficies del mismo estado de cuenta diciendo cosas distintas. Se retiró de los DOS cajones (grupo y Boston) el mismo día. `lib/cxc/documentos-chicos.ts` se conserva sin lectores, con su candado (patrón `mayor_lineas`): agrupar por MONTO y jamás por tipo sigue siendo la regla el día que se vuelva a plegar algo.
- 🔴 **El nombre del cliente es el que escribe Switch** («City Mall Paso Canoa»), no el `nombre_normalized` que la pantalla usa para PAREAR. Sin nombre de Switch se capitaliza, respetando las siglas («A-Amani, S.A.» no se rompe).
- 🔴 **«Vence» se DERIVA de la fecha + el `plazo_credito`** — Switch no guarda la fecha de vencimiento. Comprobado contra el papel: 16-06-2026 + 90 = 14-09-2026. ⚠️ **Con plazo 0 la celda va VACÍA**, igual que en Switch: un recibo no vence y escribirle una fecha sería inventarla.
- 🔴 **EL CUADRE QUE SWITCH YA MANDABA Y SE TIRABA.** `/apicliente/estadocuenta` devuelve `Saldos[]` y `saldoTotal`, y el sync los descartaba a propósito (estaba escrito así en `docs/switch-referencia.md`): el sistema sumaba los documentos **sin nada con qué comprobarse**. Ahora caen en `switch_estadocuenta_saldo` (migración `20261023120000`, **pendiente de aplicar**; `saldo_total` a columna y `Saldos[]` crudo en jsonb, porque su forma no está documentada) y el cajón **y** la hoja «Cobrar» **dicen en pantalla** cuando el total no coincide, antes de mandar nada. Tolerancia de **un centavo** (el propio papel de Switch cierra su corrido en 130.699,35 y su Total General en 130.699,36). Sin dato de Switch **no se afirma nada**, y sin la DDL todo se comporta como hoy. ⚠️ El desfase **NO va en el papel del cliente**: no tiene qué hacer con nuestra sincronización.
- ⚠️ **La columna «Comentario» va vacía y no es un olvido**: el API de Switch no manda el comentario del documento (se revisaron las 20 llaves de cada renglón). En el papel de Switch solo las notas lo llevan; las facturas van vacías igual. Inventarlo sería escribir algo que el sistema no sabe.
- ⚠️ **La cabeza de la empresa acreedora sale de una lista ESCRITA A MANO** (`lib/cxc/empresa-fiscal.ts`) — nombre legal, identificación, teléfono y correo. Ninguno de los cuatro existe en la base, y NO se derivan del `numero_fiscal` (la identificación está adentro sin separador: recortar ceros sería adivinar). **Hoy solo se conoce Fashion Wear**, medida del papel de Daniel; las otras cinco salen con su nombre corto y sin esas líneas — **nunca con los datos de otra empresa**. Falta que Daniel dicte las cuatro líneas de cada una.
- ⚠️ **Boston no tiene papel**: su hoja «Cobrar» sigue sin mandar correos (decisión pendiente de Daniel, ver arriba). Lo único que cambió de su lado es que su cajón dejó de plegar.
- Candados: `cxc-estado-cuenta-forma-switch.test.ts`; **39 mutaciones, 39 cazadas** con 2 controles (`scripts/_mutar-candados-estado-cuenta-switch.sh`). Tres candados **cambiaron de dirección con nota fechada**, ninguno se borró: `cxc-estado-cuenta-legible` (los dos cajones ya no pliegan, con el control de que la regla por MONTO sigue probada sobre el módulo puro), `cxc-papel-vocabulario` (encabezados de Switch, «Total General», montos sin `$`) y `pdf-cliente-layout` (el «29 documentos = 2 páginas» pasó a medirse como lo que siempre quiso decir: ningún renglón se dibuja encima del pie, comprobado en milímetros sobre el PDF de verdad).

- Candados del rediseño: `cxc-sin-pagar.test.ts` · `cxc-correos-por-direccion.test.ts` · `cxc-estado-cuenta-legible.test.ts` · `cxc-cobrar-una-hoja.test.ts` · `cxc-envios-y-pagos-por-fecha.test.ts` · `cxc-ruta-y-error.test.ts` · `cxc-contacto-del-cliente.test.ts` · `cxc-boston-mismo-formato.test.ts` · `cxc-tira-totales.test.tsx`; **61 mutaciones, 61 cazadas** (`scripts/_mutar-candados-cxc-rediseno.sh`).

---

## Lo que decía CLAUDE.md hasta el 22-sep-2026 (movido acá, verbatim)

### Boston y CXC — [docs/postmortems/boston-cxc.md](docs/postmortems/boston-cxc.md)

> Detalle completo (mediciones, citas, candados, mutaciones): [docs/postmortems/boston-cxc.md](docs/postmortems/boston-cxc.md) › «Lo que decía CLAUDE.md hasta el 14-sep-2026».
> ⚠️ Las reglas de PANTALLA de este módulo (qué se dibuja, dónde, rótulos, tamaños) viven SOLO en ese postmortem: léelo antes de tocar una pantalla suya.

- 🔴 **Boston NUNCA se mezcla con el CXC del grupo** (ni fila, total ni export); 🔴 **el del grupo SÍ convive con el resto**: aislarlo de más también es error.
- **Fashion Group son SEIS empresas** (`B2B_EMPRESA_KEYS` = `empresasConCxc()`); Boston y ACS no. La vista **EXCLUYE, no enumera** (`switch_estadocuenta_aging`, `..._aging_mv` la materializa). Toda lectura acota por `empresa_key`.
- `gerente_boston` (David): `boston` + `catalogos` **solo VER**, casa `/boston`. No ve búsqueda global, CXC del grupo, Ventas, Comisiones, Guías, comprobantes ni administrar catálogos.
- **Sueldos recortados en el SERVIDOR** (`VE_SUELDOS_DE_BOSTON`, hoy `true`); se ENUMERA lo que viaja (`CAMPOS_SIN_DINERO`).
- `ccte_id` de Boston lleva el AÑO adentro (`serie × 10.000.000 + (año − 2000) × 100.000 + correlativo`): sin fecha se **rechaza** y la corrida se corta. Sync: **upsert → reconcile**.
- 🔴 **SU PLATA SUMA; SUS CLIENTES NO SE VEN**: su venta sigue en Ventas › Resumen y Vista General; de las superficies del grupo salen sus CLIENTES, en ambas direcciones. 🩸 **Ni entra a `clientes_master`**.
- `/api/clientes/[codigo]` pregunta `esCodigoDelGrupo()` y contesta **404**, nunca 403.
- 🔴 **Su DIRECTORIO se refresca SEMANAL sin tocar al grupo**: `sync-clientes-boston` (domingos 07:10 UTC) escribe **SOLO `switch_clientes` de Boston**. Para marcar ausente: lista completa y sin encoger bajo el **70%**; vacía = error. Alerta B, **165 h**.
- 🔴 **La secretaria cobra y ve el módulo** (`ROLES_CXC`). ⚠️ **Boston sigue afuera**: otra lista.
- Candados: `cxc-boston-fuera-de-toda-superficie` · `boston-acceso` · `boston-cartera-web` · `boston-clientes-no-tocan-el-grupo` · `cxc-secretaria-cobra`.

**La planilla de David = la de Yulissa.**

- 🔴 **Las columnas de dinero salen de UN lugar** (`columnas-dinero-planilla.ts`, 19): `PlanillaTab` y `PlanillaBoston` leen la MISMA lista.
- 🔴 **Boston pide con el MISMO corte que la contadora**: el de la quincena cerrada, o el sugerido (`corteParaBoston`); `planilla-guardada` le **fuerza Boston** (`?id=` ajeno → 404).
- 🔴 **Su Préstamos suma las tres cuentas**: saldo = `calcularSaldoPrestamo` (préstamo + daño + terceros), cuota = préstamo + terceros (el daño sin cuota es **pendiente**, no diseño).
- Candados: `boston-planilla-mismas-columnas` · `boston-prestamos-tres-cuentas` · `boston-planilla-con-dinero` · `integration/boston-planilla-mismos-numeros`.

**El rediseño.** Vive en **`/cxc`**; `/admin` EXACTO redirige 307 con su query.

- 🔴 **Cobra todo el que ve el módulo**, por la única puerta «Cobrar» (correo con **Deshacer de 5 s**).
- 🔴 **Abre por «más viejo sin pagar»** (20-sep, `ORDEN_AL_ABRIR`, override anclado a «Total pendiente»); el que nunca pagó primero y **los días se ven SIEMPRE en la fila**. `cxc-abre-por-mas-viejo`.
- 🔴 **El papel y el Excel cierran con el total de la PANTALLA** (20-sep): bloque «Saldo a favor (N)» y «Total general»; faltaban $1.207,55. `cxc-cartera-cierra-igual`.
- 🔴 **La tira dice plata, no conteos** (20-sep): 12 · 32 · 76 sumaban 120 sobre 100 clientes. `cxc-tira-solo-plata`.
- 🔴 **En Boston ningún monto se encima** (20-sep): UN botón, y tocar la fila abre los documentos. `cxc-boston-montos-que-se-leen`.
- 🔴 **Se mandan SIEMPRE las 6 empresas**, mire lo que mire el filtro: lo decide el SERVIDOR (`empresasDelEnvio()`). ⚠️ El cajón SÍ conserva el filtro: es lo que se MIRA.
- 🔴 **UN correo por DIRECCIÓN, nunca uno por cliente**: un PDF con una hoja por cliente y un total al final, agrupado en el SERVIDOR. Los **sin correo NO abortan el lote** y se dicen por nombre.
- 🔴 **«Sin pagar hace +90 d»**: días desde el ÚLTIMO PAGO REAL en las 6, por **CÓDIGO**; **retenciones y recibos en cero no cuentan**, y **el que nunca pagó avisa**. «Hoy» es el de PANAMÁ.
- 🔴 **Se anota lo que se manda por los TRES canales** (correo · whatsapp · copia), 7 días; el correo lo anota `enviar-email` **tras confirmar Resend**.
- 🔴 **«Contacto» en la ficha: el sync NUNCA lo pisa**. Lo usa el saludo del correo y del WhatsApp; sin contacto, el de siempre; en un correo compartido **no se saluda a nadie**.
- 🔴 **Boston: mismo FORMATO, APARTE.** Ruta propia, **no reusa `fetchEstadoCuentaData`**; sus teléfonos y correos de `switch_clientes` acotado a Boston, **nunca de `clientes_master`**.
- 🩸 `/api/cxc-rows` se retiró; `contact-log` y `cxc-summary` se quedan. `cxc_rows` y `cxc_contact_log` **no se borran**.
- Candados: `cxc-sin-pagar` · `cxc-correos-por-direccion` · `cxc-estado-cuenta-legible` · `cxc-cobrar-una-hoja` · `cxc-envios-y-pagos-por-fecha` · `cxc-ruta-y-error` · `cxc-contacto-del-cliente` · `cxc-boston-mismo-formato`.

**La FORMA DE SWITCH** — solo documentos ABIERTOS.

- 🔴 **NUEVE columnas, en el orden de Switch** (eran DIEZ hasta el 20-sep-2026): `Fecha · Comprobante · N. Interno · Débitos · Créditos · Saldo · Vence · Plazo · Días`; fechas **DD-MM-AAAA**.
- 🔑 **Los números no se recalculan**: `debito` y `credito` son los de Switch, `debito − credito` el saldo firmado y el corrido se acumula de ahí. 🔴 El orden `(fecha, ccte_id)` **no se mueve**.
- 🔴 **Los TRES tramos de la pantalla, no los ocho de Switch** (`cxc-aging`). ⚠️ Ante el CLIENTE van por **rango**: **«vencido» está prohibido** —`dias` es EDAD, no mora—.
- 🔴 **Nada se pliega por valer menos de $50**, en los DOS cajones; si vuelve, se agrupa **POR MONTO y NUNCA por tipo**. `documentos-chicos.ts` se conserva sin lectores.
- 🔴 **El nombre del cliente es el que escribe Switch**, no el `nombre_normalized` del PAREO; sin él se capitaliza. 🔴 **Y en TODAS las pantallas** (20-sep, `cxc/nombre-cliente.ts`); Boston aparte. `cxc-un-solo-nombre-del-cliente`.
- 🔴 **«Vence» se DERIVA de la fecha + el `plazo_credito`**; con plazo 0 la celda va **VACÍA**.
- 🔴 **El cuadre**: `Saldos[]` y `saldoTotal` caen en `switch_estadocuenta_saldo` (`20261023120000`, aplicada). El cajón y «Cobrar» avisan con **un centavo** de tolerancia; sin dato de Switch no se afirma nada. ⚠️ El desfase **NO va en el papel del cliente**.
- 🔴 **SE LEE DESDE ADENTRO (18-sep-2026)**: vienen ANIDADOS en `data.estadocuenta` y los arma `filaDeCuadre` (las DOS grafías), que **falla ABIERTO a NULL — nunca un cero inventado**. ⚠️ `saldoConsecutivo` **NO construido**. Candado `cxc-cuadre-desde-adentro`.
- 🔴 **«Comentario» bajó al PIE, en blanco** (20-sep): era el 20 % del ancho y vacía en los 3.003 documentos. `cxc-comentario-abajo`.
- 🔴 **El rótulo de la ficha se mide CON la negrita**, y salen «Límite de crédito» y «Tiempo de Morosidad» (20-sep). `cxc-ficha-sin-lineas-rotas`.
- ⚠️ **La empresa acreedora sale de una lista ESCRITA A MANO** (`empresa-fiscal.ts`), no del `numero_fiscal`; **las OCHO cargadas**, y la que falte sale con su nombre corto, **nunca con datos de otra**.
- 🔴 **AHÍ MISMO VIVE DÓNDE SE PAGA, CADA UNA EN SU CUENTA (20-sep-2026)**: las 8 salen por `lineasDePago`, en el PDF al pie de CADA hoja y en el correo con TODAS las del papel. **Falla ABIERTA**. Candado `cxc-donde-pagar`.
- 🔴 **Boston FIRMA COMO BOSTON** (Daniel: *«Firma Confecciones Boston»*). La casa se pregunta por `empresa_key` (`casa-del-papel.ts`): su papel sale **sin el logo del grupo y sin `fashiongr.com` en el pie**. ⚠️ Su correo sale por Resend desde `fashiongr.com`: **un dominio propio sigue pendiente**.
- Candados: `cxc-estado-cuenta-forma-switch` · `cxc-papel-vocabulario` · `pdf-cliente-layout`.
