# Post-mortems — Catálogos, pedidos y cotización

> Movido de `cxc/CLAUDE.md` el 31-ago-2026 para bajar lo que se inyecta en cada sesión.
> **Nada se resumió ni se borró: el contenido es verbatim**, con sus «Daniel, textual»,
> sus mediciones, sus «Candados», sus «Verificado por mutación» y sus 🩸.
> La REGLA vigente (sin la historia) vive en «Invariantes por módulo» de `cxc/CLAUDE.md`.

---

## 🔴 Depurador — LA PLANTILLA DE SWITCH ES UNA SOLA, TIENE 25 COLUMNAS, Y AHORA VIVE EN EL REPO (3-sep-2026)

> **Lo que pasaba.** El Depurador (`/productos/cargar`) generaba DOS variantes de 24 columnas (`OUT_COLS_DEFAULT` para Vistana / Fashion Wear / Active Wear / Reebok, `OUT_COLS_SHOES` para Fashion Shoes y Facturas Tienda) y **ninguna coincidía con la plantilla que Switch entrega**, que tiene **25**: la «default» no traía «Composición» (col 21) y las cuatro últimas quedaban corridas; la «shoes» tenía una sola «Costo *» en vez de «Costo FOB *» + «Costo CIF *», así que le faltaba una **obligatoria** y 18 columnas quedaban corridas. Daniel bajó la plantilla de Fashion Shoes y de Multifashion: **idénticas byte a byte** (MD5 `b622f171713642a0393b3c95c7f30de7`, 10.305 bytes), guardadas desde `C:\xampp\htdocs\switch\public\plantillas\` — el archivo fijo de Switch.
>
> **De dónde salió el error — 🩸 los dos cambios se hicieron contra plantillas que hoy no están en el repo:**
> - **27-jun-2026 (Tarea 3, `2a853d26`)**: se quitó «Composición» «a propósito» del header default.
> - **27-jun-2026 (Tarea 5, `310e1d5c`)**: Fashion Shoes recibió su lista propia con la «Costo *» única (= CIF). Facturas Tienda (`0fa27542`) nació sobre esa misma lista.
> - **1-sep-2026 (`f6cd1966`)**: esa columna única pasó de llevar el CIF a llevar el FOB — se cambió el CONTENIDO de una columna que Switch no tiene.
>
> **Las decisiones de Daniel (3-sep-2026), textuales:**
> - *«¿Las otras 4 empresas también descargan este mismo archivo?»* → **«creo que sí, revisa»**. Verificado: se abrió UNA sesión web (Vistana, 22:20 UTC, ventana a ≥15 min de los crons) para sacar la ruta real del enlace «Descargar plantilla modelo» → `/plantillas/productosplantillaimportarpafob.xlsx`. Apache la sirve **sin login**, así que las otras 7 empresas se bajaron sin abrir sesión (cero expulsiones extra). **Las 8 dan el mismo MD5.** Script: `scripts/_bajar-plantilla-articulos-switch.ts`.
> - Fashion Shoes con FOB y CIF separados, CIF = FOB × 1,10 como Vistana → **«sí»**.
> - Multifashion (Facturas Tienda): FOB = CIF = el precio que le factura la empresa del grupo a la tienda → **«mismo número»**.
> - Composición → **«vuelve vacía, no la quiero»**.
> - Tasa de impuesto → **«pon el 0 adelante pues»**: `07` como TEXTO, como dice la guía de Switch (`Flujo_articulo_orden_de_compra_switchsoft2026.pdf`, p. 3). Antes el Depurador escribía `7` y Facturas Tienda `7.00`.
>
> **Lo que quedó:**
> - **`OUT_COLS` (logic.ts) es LA plantilla**: 25 columnas, encabezados exactos (acentos, asteriscos, espacios). `OUT_COLS_DEFAULT`, `OUT_COLS_SHOES` y `outColsForEmpresa` **se retiraron**; `buildAoa` ya no recibe empresa porque las columnas no dependen de ella. Los tres generadores —Depurador CK/TH/KL, `buildTiendaAoa` y `buildSwitchAoa` (Reebok)— escriben la misma fila 1.
> - **Lo que cambia por empresa es el CONTENIDO:** Fashion Shoes FOB 10 → CIF 11 (el cálculo de `processRows`, que nunca cambió); Multifashion FOB = CIF = 12,50; Reebok FOB → CIF × 1,1 como siempre. Composición `""` en los tres. `tasaSwitch()` convierte «7», «7.00», `7` → `"07"` (y `0` → `"0"`, exento); lo que no es número se deja tal cual.
> - **`TEXT_COLS = [0, 1, 2]` no se movió**: es posicional y las tres primeras columnas de la plantilla (Código, Referencia, Código Barra) siguen donde estaban aunque Composición haya vuelto en la 21. Candado explícito.
> - **La plantilla real está en el repo:** `src/__tests__/fixtures/plantilla-switch-articulos.xlsx`. `depurador-plantilla-switch.test.ts` la LEE y exige igualdad posición por posición contra `OUT_COLS` y contra la fila 1 de los tres generadores; si Switch cambia la plantilla, hay que cambiar el fixture a propósito y el test dice qué columna se movió. También fija FOB/CIF por empresa, Composición vacía y la tasa `"07"` (incluido el viaje de escritura+lectura del `.xlsx`: la celda queda `t: "s"`, `v: "07"`).
> - Los candados viejos **cambiaron de dirección** con su nota (`depurador-validate.test.ts` — «24 cols, sin Composición» y el bloque «plantilla por empresa (Tarea 5)»; `reebok-depurador.test.ts` — «24 columnas OUT_COLS_DEFAULT»).
> - **Verificado con Excel reales** (`scripts/_verif-plantilla-switch.ts`: escribe el archivo como la pantalla, lo relee y compara encabezado por encabezado): las 4 empresas del Depurador, Multifashion y Reebok → **25/25 iguales, ninguna distinta**.
> - **Mutación** (`scripts/_mutar-plantilla-switch.sh`): quitar Composición · cambiar un encabezado (tilde) · perder un asterisco · volver a la «Costo *» única · CIF = FOB en Fashion Shoes · Multifashion con flete · Multifashion sin CIF · Composición con texto · tasa «7» · tasa numérica · tienda «7.00» · Reebok tasa cruda · Reebok CIF = FOB → **13 de 13 cazadas, control en verde**.
>
> ⚠️ **Lo que NO se tocó, a propósito:** la plantilla de Switch formatea las columnas 1–13 y 19 como Texto; el sistema sigue forzando a texto solo las 3 primeras y manda Precio/Costos como números — es lo que está «validado al centavo contra plantillas manuales reales» y Switch lo acepta. Cambiarlo es otra decisión.

---

## 🔴 Depurador — LA PANTALLA VALIDA LO QUE SE TECLEA Y NO BORRA EL TRABAJO HECHO (4-sep-2026)

> **El riesgo que esto cierra.** El Depurador es **el único módulo donde un número mal escrito termina DENTRO de Switch** (50-60 corridas/mes: Angela 76 y andrea 42 desde junio). `validarDivisor` existía desde el 27-jul-2026 (el caso `TH Tommy Jeans` con divisor 70), pero **solo corría en las 4 rutas API al guardar fórmulas**: los inputs de divisor de la pantalla (`DepuradorClient.tsx`) no validaban nada. Escribir `70` en vez de `0.70` en el modo global calculaba y **descargaba un Excel con los costos 100× mal**, sin pasar por ningún candado — exactamente la clase de error que motivó el guard, en el único punto donde el número llega al Excel. Y el campo «Tasa» era texto libre: `abc` llegaba tal cual a la columna «Tasa de Impuesto *».
>
> **Lo que quedó:**
> - **El divisor se valida EN LA PANTALLA, reusando `validarDivisor`** (vía `mensajeDivisorEnPantalla`, en `src/lib/depurador/divisor.ts` — el MISMO guard de las rutas, no otra copia de la regla). Fuera de rango: el campo se marca en rojo, sale **«Debe estar entre 0.10 y 1.00. ¿Quisiste poner 0.70?»** (la sugerencia es el valor ÷ 100, solo cuando cae en rango) y **se apaga la DESCARGA, nunca el tecleo** — se puede borrar y corregir sin pelear con el campo. Vale para el input global Y para los de fórmula por marca; **cada modo bloquea solo con SUS divisores** (un 70 en una fórmula por marca no traba el modo global, que no come de ahí). «Aplicar a todo» y el «Guardar fórmula» de la fila también se apagan con el divisor malo.
> - **La tasa pasó de texto libre a una lista de dos.** Daniel, textual: ***«solo existen esas dos»*** — **7%** → `07` (TEXTO, con el cero adelante) y **Exento (0%)** → `0`. `tasaSwitch` **no se tocó** (sigue traduciendo lo que traiga una factura en otros caminos) y `TEXT_COLS = [0, 1, 2]` sigue posicional: la tasa viaja como texto por ser string en el AOA, y hay candado que abre la celda descargada y exige `t: "s"`.
> - 🔴 **Los precios escritos a mano se CONSERVAN.** Antes, cambiar CUALQUIER campo de configuración re-leía el Excel y hacía `setPriceEdits({})`: se perdían todos los precios corregidos a mano. Daniel, textual (respuesta a «¿y si cambias de empresa o de mes?»): ***«y también consérvalos»***. Ahora los edits se guardan por **REFERENCIA de artículo** (`cols["Código *"]`, la llave estable de la fila), **nunca por índice**: al re-procesar se re-pegan solos a su artículo aunque las filas se muevan, y un artículo que salió del archivo conserva su precio por si vuelve (no estorba ni aparece). La pantalla lo dice — «N precios escritos a mano se conservaron» — con el botón **«Borrarlos todos»** (un botón, nunca automático). 🩸 El caso que de verdad importa está mutado: con edits por índice, el precio de un artículo caería en el artículo EQUIVOCADO cuando otro archivo lo corre de fila — y el test lo caza con un archivo B donde el artículo editado cambia de índice.
> - **Año y factor ya no re-procesan en cada tecla**: esperan 300 ms o el blur (`reprocesarLuego` / `reprocesarAlSalir`). Mes y tasa (selects) siguen re-procesando al momento. Cero cambio en el resultado: la misma corrida, disparada menos veces.
> - **La pantalla abre como quedó la última vez.** Empresa, mes, año, tasa, factor, modo de precio y la fórmula global (esta última, COMO QUEDÓ APLICADA — no cada tecla del draft, y un divisor guardado inválido no se revive) se recuerdan por usuario con el patrón de la casa (`useLastUsed` → `fg_last_depurador_*`, sin servidor). El archivo NO se recuerda. «Otro archivo» ya no limpia la empresa: limpiarla era re-elegirla en la corrida siguiente.
> - **CONTROL: con datos válidos el Excel sale IDÉNTICO al de hoy** — mismos 25 encabezados de `OUT_COLS`, mismos valores, mismo FOB/CIF, misma «Composición» vacía. El candado descarga el archivo desde el componente REAL (writeFile capturado), lo relee con la librería de Excel y lo compara celda por celda contra `processRows` + `buildAoa` de siempre.
>
> **Candado: `src/__tests__/lib/depurador-validacion-pantalla.test.tsx` (18).** Monta el `DepuradorClient` real con un Excel de verdad, teclea en los inputs reales y abre el archivo descargado. 🩸 Gotcha de verificación: el caché global de SWR sobrevive entre tests — sin un proveedor propio por render, el catálogo llega ya cacheado en el PRIMER render y el archivo se procesa antes de que la config recordada hidrate (cosa que en producción no pasa: el archivo siempre se suelta después de montar).
> - **Verificado por mutación, 10 de 10 cazadas** (`bash scripts/_mutar-candados-depurador-pantalla.sh`): sin validación en el input global · descarga encendida con divisor malo · por marca sin validar · re-procesar borra los precios a mano · **precios por índice de fila** · tasa como número · tercera opción de tasa · «Borrarlos todos» no borra · la sugerencia divide entre 10 · la tasa deja de recordarse.
>
> ⚠️ **Lo que NO se tocó, a propósito:** el cálculo de precios (`TECHO(CIF ÷ divisor) + extra`), `tasaSwitch`, `fobEstimado`, la plantilla de 25 columnas y su fixture. Y **Reebok y Facturas Tienda tienen sus propios inputs de divisor SIN esta validación de pantalla** (el guard de las rutas API sí les aplica al guardar la fórmula; sus inputs en vivo no validan) — extenderla ahí es otra decisión, con Daniel.

---

## 🔴 EL CLIENTE DE SWITCH TAMBIÉN SE ELIGE DE UN SOLO LUGAR (17-ago-2026)

> El #567 dejó **una excepción anotada a propósito**: el checkout del carrito tenía su PROPIA lista de clientes sobre el MISMO universo de Switch que `ClienteSwitchPicker` —el control del detalle del pedido y de "Duplicar"—, con su propia ruta, su propio buscador y su propia forma de resolver el mostrador. Daniel, textual: ***"si unificalo"***.
>
> **Quedó `ClienteSwitchPicker`, y el checkout delega en él.** Dos controles para la misma pregunta se separan solos: el que gana una mejora deja al otro viejo, y acá el otro es el que manda plata a Switch.
>
> ### 🔴 LO QUE **NO** CAMBIÓ: CÓMO SE MANDA UN PEDIDO A SWITCH
>
> Se verificó ANTES de tocar nada, porque era la condición para hacerlo: el cuerpo del POST a `/api/catalogo/checkout` sigue siendo el MISMO `{ cliente: { id, nombre }, vendedor_id, items, idempotency_key }`, con los MISMOS valores. `switch-envio.ts` no cambió, y el **nombre del cliente que viaja a Switch nunca salió de esta pantalla** — `clienteNombre` solo alimenta el `client_name` local y el aviso de Telegram; lo que Switch recibe es el **id**, y el nombre lo lee el servidor del directorio.
> - 🔴 **El mostrador se sigue guardando como `"Contado"` a secas**, no como la etiqueta de pantalla. Es lo que se escribe en `<marca>_orders.client_name` desde el primer día; cambiarlo cambiaría el dato de los pedidos NUEVOS, y eso no es parte de unificar un selector. Constante con nombre: `NOMBRE_CONTADO_GUARDADO`.
> - **Lo único propio que tenía el checkout se MUDÓ, no se reescribió**: convertir lo elegido en `{ id, nombre }` vive en `clienteParaCheckout()` (`lib/catalogo/cliente-elegido.ts`), el módulo que ya definía la regla del cliente elegido.
>
> ### 🩸 QUÉ HACÍA EL DEL CHECKOUT QUE EL OTRO NO — y cómo se conservó
>
> | | checkout (lo que había) | `ClienteSwitchPicker` (lo que quedó) |
> |---|---|---|
> | fuente | `/api/catalogo/switch-clientes?marca=` — el directorio ENTERO, paginado | `/[marca]/clientes-switch?q=` — 20 por búsqueda |
> | filtrar | en el navegador, sobre la lista ya bajada | en el SERVIDOR, con debounce de 300 ms |
> | mostrador | id histórico `1` escrito a mano, pisado con el TCKCTA hallado en la lista | el servidor devuelve el `contado` de la empresa |
> | id sin resolver | **caía al `1`** | devolvía `null` |
>
> 🔴 **La única de esas cuatro que se podía PERDER era la última, y se conservó.** Si el directorio no resuelve el mostrador, `ClienteSwitchPicker` entrega `id: null`; con eso el botón se encendería y el servidor contestaría **400 con el cliente ya elegido en pantalla** — la peor forma de fallar. `clienteParaCheckout` cae al `ID_CONTADO_RESPALDO = 1`: ante la duda se conserva la elección de la persona, nunca se inventa una. Hay candado y mutación para eso.
> - **Lo que se cambió a propósito es el filtrado**: dejó de bajarse el directorio entero (**1.710 filas paginadas por apertura**) para preguntar solo lo que se busca. Menos carga contra una base en compute Micro, y es exactamente lo que ya hacía el detalle.
> - **La ruta paralela `/api/catalogo/switch-clientes` se RETIRÓ**: sin consumidores, era la segunda puerta al mismo directorio. Con ella se fue el mapa `marca → empresa` como punto de fallo — la ruta que queda deriva la empresa de `getMarcaConfig(marca).empresaKey`, así que **el bug de Calvin no puede volver por construcción**, no por un test.
>
> ### 🔴 Lo que NO se puede romper, y sigue intacto
>
> **El cliente arranca VACÍO y el botón apagado diciendo qué falta** (`useState<ClienteSwitchOpcion | undefined>(undefined)`, "Elige el cliente" en ámbar, *"Falta: elegir el cliente"*) · **"Contado (venta de mostrador)" sigue elegible, primero en la lista y con el id REAL de su empresa** (TCKCTA), pero hay que TOCARLO — el selector recibe `valor={cliente}` sin respaldo, así que nada viene marcado · **el candado del SERVIDOR (422 si un pedido interno no tiene cliente) no se tocó** · **el pedido del LINK conserva su texto libre y no sale solo** · el flujo de 3 toques, duplicar sin confirmar y el modo pedido `?agregarA=` · **Joybees sigue siendo espejo exacto de Reebok y no se tocó nada propio de Reebok**.
>
> ### Verificación contra producción
>
> **`BASE=… node scripts/_verif-checkout-selector-unico.mjs`** (solo lectura; **aborta en el navegador cualquier POST a `/api/catalogo/checkout`** y nunca toca "Enviar a Switch"). Con una sesión de **`vendedor`**, en las 4 marcas: el checkout arranca sin cliente y con el botón apagado, dibuja el buscador del selector único, el directorio devuelve **20 clientes**, "Contado (venta de mostrador)" aparece **exactamente una vez**, escribir dispara una consulta al SERVIDOR y elegir un cliente saca "elegir el cliente" del *"Falta:"* (queda *"Falta: elegir el vendedor"*, correcto: ese usuario no tiene vendedor mapeado).
> - El mostrador se resuelve con el nombre de SU empresa y el mismo id: `active_shoes` "Contado" · `joystep` "Contado" · `fashion_shoes` **"VENTAS LOCA"** · `vistana` **"VENTAS"**, los cuatro `TCKCTA` id **1** — idéntico a lo medido en el #556.
> - 🩸 **Gotcha de verificación:** exigir que el botón se ENCIENDA al elegir cliente da rojo por nada — al usuario de prueba le falta el vendedor, y eso está bien. Lo que se exige es que el CLIENTE deje de faltar.
>
> **Los 3 anchos (+ el iPad acostado), en el navegador contra el build de producción y con pedidos REALES** (`BASE=… node scripts/_medir-cliente-pedido-anchos.mjs`, solo lectura, 5 estados): **390 · 834 · 1024 · 1440 → las cajas del cliente dan 0 px de arrastre, 0 recorte, 0 táctil <44 y 0 texto <12 px** en los 20 casos. Con el selector abierto la caja mide **379 px de alto en los cuatro anchos**: crece **hacia abajo** y no ensancha nada. Los tocables <44 px que el script reporta en el resto de la pantalla (`← Catálogo`, el precio por pieza, `← Volver a Pedidos`, los inputs de cantidad, la `x` y `Eliminar pedido`) son los **PRE-EXISTENTES ya medidos idénticos en `origin/main` en el #556**, en código que este cambio no toca.
>
> ### Candados
>
> **`src/__tests__/un-solo-selector-de-cliente.test.ts`** — se **quitó la excepción de `CheckoutClient`**, así que si alguien le devuelve su lista propia el build se pone ROJO. Y el barrido se **EXTENDIÓ por el otro costado**: ahora también vigila **quién puede PEDIR el directorio de clientes de Switch** (`clientes-switch?q=`), que es lo que el detector de selectores no podía ver — solo `ClienteSwitchPicker`, con una lista de excepciones VACÍA, más un test que exige que las tres pantallas de pedido lo dibujen y otro que impide que la ruta paralela vuelva. El detector se prueba con fuentes SINTÉTICAS y distingue LISTAR de preguntar por el cliente de UN pedido (`?orderId=`) o asignarlo (PATCH), que el detalle hace a propósito.
> - **`lib/cliente-elegido.test.ts`** cubre los bordes de `clienteParaCheckout` —incluido que **todo lo que sale de ahí pasa el candado del servidor** (id entero > 0 y nombre no vacío)— y **`components/pedido-cliente-obligatorio.test.tsx`** es el de CONDUCTA: renderiza el checkout REAL, toca los botones REALES y cuenta qué salió por `fetch`.
> - **Verificado por mutación, 7 de 7 cazadas** (`bash scripts/_mutar-candados-selector-switch.sh`): el checkout vuelve a tener su propia lista · el mostrador viaja con el nombre de su empresa en vez de "Contado" · sin id resuelto se manda un id vacío · el mostrador se reconoce por NOMBRE en vez de por código · el nombre puede viajar vacío · el selector vuelve a preseleccionar el mostrador · el mostrador vuelve a aparecer DOS veces.
> - 🩸 **La restauración del script va por COPIA, no por `git checkout`**: hay archivos NUEVOS y BORRADOS en la rama y git aborta el comando entero sin restaurar nada, así que las mutaciones se apilarían y ninguna se probaría por separado.


> 🔴 **UNA línea atada a `111380`, que no es del grupo** (GT-183, "American Classic Store"). Se coló por el backfill de jun-2026 (`20260607131000`), que filtraba `cm.codigo IS NOT NULL` en vez de `LIKE 'D-%'` — y Boston/Multifashion usan códigos numéricos pelados. **No se corrigió automáticamente porque no es inequívoco** si va a NULL o a un D-XXX ("American Classic Store" de Boston vs "American Classics" D-201 del grupo no son obviamente el mismo negocio). Se arregla desde la pantalla: `/guias` → GT-183 → tocar el chip `111380` → elegir o "Quitar".

> **DESPACHAR ES UNA PANTALLA, NO UN ACORDEÓN — y el N° del transportista es POR LÍNEA (10-ago-2026).**
>
> 🩸 **Había DOS caminos para lo mismo dentro de la misma tarjeta.** Al abrir una guía pendiente en `/guias` aparecía un botón "Editar" arriba **y**, más abajo, el formulario de despacho ENTERO desplegado (placa, N° de guía, receptor, cédula, dos canvas de firma y "Confirmar despacho"). Daniel lo vio en **ESCRITORIO** —o sea que nunca fue un problema de pantalla chica— y fue textual: *"mira como me sale editar al hacer clic en por despachar y esta ya aparece el campo para editar, confunde, solo quiero una y en boton de editar para entrar a la guia y terminarla"*. Y sobre el gesto: *"al hacer slide a la izquierda de una guia no despachada da la opcion de despachar, no quiero eso asi"*.
>
> **Ahora:** la lista solo MUESTRA (los envíos, el chip del cliente, "Imprimir" y el menú "···" siguen igual), **un solo botón "Editar"** lleva a **`/guias/[id]`**, y ahí se corrige y se despacha. Desde esa página se sigue llegando a `/guias/[id]/editar` para cambiar los renglones — el camino viejo no se perdió. **Las guías DESPACHADAS no cambiaron en la lista**: Daniel dijo *"me gusta como esta actualmente las de despachados"*.
> - **`SwipeableRow` NO se borró**: `cheques` lo usa para "depositar" y ahí el gesto se queda. Lo que se quitó es la acción `despachoSwipeAction` de guías, que era su único uso en el módulo.
> - **El estado del despacho se MUDÓ de hook.** `useGuiasState` (la lista) perdió placa/receptor/cédula/chofer/firmas/`confirmarDespacho`; viven en `useDespachoGuia` (`/guias/[id]`). Dejarlos en una pantalla que ya no despacha era la mitad del problema de vuelta. El borrador en `localStorage` por guía se conserva, ahora con los N° por línea adentro.
>
> 🔴 **EL N° DE GUÍA DEL TRANSPORTISTA ES POR LÍNEA.** Daniel: *"la info de guia de transp, debe de ser por linea, no por guia porque nos hacen varias guias el transportista por guia"*. La columna `guia_items.numero_guia_transp` **ya existía** (~470 filas pobladas) — **no hace falta ninguna DDL**. Lo que faltaba era pedirla renglón por renglón y, sobre todo, IMPRIMIRLA: los dos papeles (`PrintDocument` y `pdf-guia`) tenían la columna "N GUIA TRANSP." pero pintaban **`g.numero_guia_transp` (el de la cabecera) en TODAS las filas**, así que aunque la línea tuviera el suyo, el papel mostraba el mismo en todas.
> - **Se guarda con `items_guia_transp`, NUNCA mandando `items`.** `items` en el PUT es un **reemplazo completo** (borra e inserta): usarlo en pleno despacho le cambiaría el id a cada línea y tiraría el trabajo de atar clientes. El campo nuevo toca UNA columna, con `.eq("guia_id", id)` — sin eso, el id de cualquier línea del sistema serviría para escribirle encima.
> - **`guia_transporte.numero_guia_transp` NO se retira**: la usan el buscador de la lista, el Excel y el encabezado del papel. Se llena con el **primer** número de línea que haya (`numeroGuiaDeCabecera`).
> - **Una guía VIEJA sale igual que siempre**: si la línea no trae número propio, hereda el de la cabecera (`numeroTranspDeLinea`).
> - **El encabezado del papel solo anuncia un número cuando hay UNO SOLO en toda la guía** (`numeroTranspUnico`). Con varios distintos, poner uno arriba sería una mentira impresa en un documento que alguien firma.
>
> **EL BOTÓN SE APAGA Y DICE QUÉ FALTA.** Antes se podía tocar siempre y contestaba con un toast por vez que se iba solo a los 3 segundos; faltando tres cosas había que tocar tres veces. Ahora `Despachar` va deshabilitado y justo debajo: *"Falta: placa, recibido por y cédula"*. Las reglas viven en el módulo PURO `src/lib/guias/falta-para-despachar.ts`, **las mismas que aplica el servidor** — si difirieran, el botón se pondría verde y el PUT rechazaría igual, que es peor que el botón apagado. ⚠️ **La placa sigue sin ser obligatoria en entrega directa** (ver `guias-placa-entrega-directa.test.ts`) y **una línea sin número no traba el despacho**: lo que el servidor exige es que **al menos una** lo traiga.
>
> **Verificado con una guía de prueba REAL (creada y borrada el 10-ago-2026):** GT-192 con dos líneas, `TR-4471` y `TR-9999`. En la base quedaron distintas (cabecera `TR-4471`), y **los DOS papeles imprimen el de cada línea**: el PDF de compartir (`scripts/_verif-guia-transp-por-linea.ts` + `pdftotext`) y el impreso HTML (`/guias/[id]/imprimir` a PDF). En los dos, el encabezado **omite** "N GUIA TRANSP.:" porque los números difieren. Las dos guías de prueba se borraron (soft delete) y la lista volvió a 177.
>
> **Los 3 anchos, medidos en el navegador contra el build de producción y CONTRA `origin/main`** (`BASE=… GUIA_PENDIENTE=… GUIA_DESPACHADA=… node scripts/_medir-guias-rediseno.mjs`, solo lectura): **390 · 834 · 1440 → 0 px de arrastre de página en las tres pantallas** (lista, lista abierta, página de la guía pendiente y despachada), **0 blancos táctiles bajo 44 px y 0 textos bajo 12 px en la página de la guía**. Y el rediseño **redujo** los recortes que ya había: la lista a 390 pasó de **7 a 1** recortado y la lista abierta de **19 a 1**; a 834, de 21/33 a 15/15 y el peor recorte de **340 px a 190**. Lo que queda es PRE-EXISTENTE y medido idéntico en main: los `truncate` del resumen de la fila (puntos suspensivos = el mecanismo, no un defecto), el input de búsqueda de 39 px de alto en escritorio/iPad y los 8 px del `-mx-2` de los botones de `SignatureCanvas` (9 veces en main, 3 en la página nueva — es el mismo componente, sin tocar).
>
> Candados: `src/__tests__/lib/guias-despacho-una-sola-puerta.test.ts` (la lista no puede volver a despachar ni por swipe ni por formulario, el hook de la lista no puede recuperar estado de despacho, el papel tiene que imprimir el de cada línea, y el "Falta:" del mockup aprobado) y `guias-placa-entrega-directa.test.ts`, que pasó a probar las reglas sobre el módulo puro en vez de sobre los `if` del formulario.


---

> ## 🔴 Depurador — EL PEDIDO DE REEBOK SALE CON LAS FOTOS PEGADAS, Y LAS FOTOS NO SE SUBEN (17-ago-2026)
>
> Hasta hoy Daniel armaba ese Excel **a mano con un macro de VBA**: pegaba los códigos en una columna, corría el macro, elegía una carpeta y el macro le pegaba la foto de cada código al lado. Lo quiere desde el sistema para que su secretaria (Windows) lo use **sin instalar nada**. Para qué es, textual: ***"interno"*** — nadie más lo usa; esos códigos entran a Switch más adelante, hoy todavía no están.
>
> **El flujo:** se carga el Excel del proveedor como siempre → en *Pedido para cliente* aparece **"Fotos del pedido (opcional)"** → se elige la carpeta (selector de carpeta del navegador, `webkitdirectory`) → antes de descargar la pantalla ya dice **"172 de 172 códigos con foto · no falta ninguna"** → el Excel baja con la foto incrustada en la **primera columna**, a la izquierda del código.
>
> ### 🔑 LAS FOTOS NO SE SUBEN A NINGÚN LADO — todo pasa en el navegador
>
> La carpeta real (`OneDrive-FashionGroup/Reebok/Fotos`) son **4.744 .jpg y ~818 MB**. Subirlas sería otro problema —almacenamiento, sincronización, permisos— que nadie pidió. El emparejado, el achicado y el armado del ZIP ocurren **en la máquina de la persona**: en `fotos-carpeta.ts` no hay un solo `fetch`, y el índice de la carpeta se arma **solo con los NOMBRES** (no se lee el contenido de ningún archivo que no empareje con un código del pedido).
>
> ### 🔴 EL EMPAREJADO ES POR NOMBRE EXACTO, SIN MAYÚSCULAS Y NADA MÁS
>
> `100262385` ↔ `100262385.jpg`. No se quitan guiones, no se recorta, no se comparan parecidos ni distancias de edición. **Es la lección de `Outlet Duty Free N2` vs `N3`** (ver Guías): dos códigos parecidos son DOS artículos, y pegarle al pedido la foto del artículo de al lado **no deja ningún rastro** — el cliente recibe el catálogo con la foto equivocada y nadie se entera nunca. Un código sin foto exacta sale con **`NO IMAGEN`**, que es la verdad, y **la fila NO se salta** (mismo texto que usa hoy el macro). Hay candado con los casos que engañan: `100073063_black.jpg` no es `100073063`, `T1A8-32600-313.jpg` no es `T1A832600313`, `00100262385.jpg` no es `100262385`.
>
> ### ⚠️ `xlsx-js-style` NO SABE INCRUSTAR IMÁGENES — y NO se cambió la librería
>
> Verificado abriendo el bundle publicado (`dist/xlsx.bundle.js`, v1.2.0): **cero apariciones** de `xdr:`, `oneCellAnchor`, `twoCellAnchor`, `xl/media`, `drawing1.xml` y `sheet_add_image`. No hay opción escondida.
>
> **La salida la sigue armando `xlsx-js-style` exactamente como hoy** (mismas celdas, mismos anchos, mismo forzado a texto de los códigos) y después `src/lib/depurador/fotos-xlsx.ts` le agrega al ZIP las partes que le faltan (`xl/media/*`, `xl/drawings/drawing1.xml` + sus rels, el `<drawing r:id>` de la hoja y el Override de `[Content_Types].xml`). **`jszip` YA era dependencia** (lo usa el ZIP de Marketing) y se importa perezoso, así que solo se descarga cuando de verdad hay fotos. Cambiar de librería de exports habría tocado TODO el sistema por un botón.
> - La hoja se resuelve por el índice del propio archivo (`workbook.xml` → `workbook.xml.rels`), no adivinando `sheet1.xml`.
> - El `<drawing>` va al FINAL del `<worksheet>` (después de `<ignoredErrors>`, que es lo último que escribe SheetJS): ese es el orden del esquema.
> - Si la hoja YA tenía un dibujo, **corta con error en vez de pisarlo**.
> - Dos filas con la MISMA foto (el mismo artículo en dos PO) comparten un solo archivo dentro del ZIP: medido, **172 anclas contra 109 imágenes**.
>
> ### Las fotos se achican REUSANDO `compressImage`, no con un segundo compresor
>
> `compressImage` (el de Reclamos) ganó un `opts` OPCIONAL —`{ maxDimension, quality }`— y **sin `opts` se comporta exactamente igual que siempre** (1600 px · JPEG 0.8), así que Reclamos y Mobiliario no cambian. El Depurador le pide **300 px · 0.72**: 203 fotos de 600×600 sin achicar son **20,5 MB** y el Excel sería imposible de mandar por correo.
> - **La foto se encaja en la celda con UNA SOLA escala para los dos ejes** (`encajar`): dos escalas distintas deforman el producto. Nunca agranda una foto más chica que la caja.
> - Una foto que no se puede leer NO deja la celda en blanco: ese código sale de `conFoto` y su celda dice `NO IMAGEN`. Una celda vacía se vería igual que "no se pegó y nadie se dio cuenta".
>
> ### 🔴 SIN CARPETA, EL EXCEL DE HOY SALE IDÉNTICO
>
> `buildCatalogoAoa(rows, mes)` sin el tercer parámetro devuelve **exactamente** las 10 columnas de siempre, y `incrustarFotosEnXlsx` con la lista vacía **devuelve los mismos bytes sin abrir el ZIP** (no lo re-empaqueta "por las dudas"). Medido en el navegador: sin carpeta el archivo pesa **87 KB, primera columna `PO NAME`, 10 columnas, 0 imágenes en el ZIP**.
> - ⚠️ **Con la columna `Foto` adelante, `New Article` pasó del índice 1 al 2** y el `forceTextCols` se corrió con él: forzar el índice viejo habría dejado los códigos en **notación científica**. Verificado en el archivo descargado: `C2 = "100277416"` con `t="s"`.
> - **La plantilla Switch NO lleva fotos** (se sube a Switch, no la mira nadie) y el bloque ni se dibuja en ese modo. **El Depurador CK/TH tampoco cambió**: la carpeta de fotos y los códigos son de Reebok.
> - ⚠️ **No se tocó una sola línea del cálculo de precios** (`TECHO(CIF ÷ divisor) + extra`, `validarDivisor`).
>
> ### Medido con la carpeta REAL y el pedido REAL
>
> `BASE=… node scripts/_medir-fotos-pedido.mjs` (solo lectura sobre la carpeta). **Se le pasa la CARPETA ENTERA de verdad** —las 4.744 fotos, 818 MB—, que es lo que hace la persona; `MUESTRA=1` arma una copia por enlaces duros (mismos bytes, sin copiar) para iterar más rápido, y da los mismos números. La entrada son los **203 códigos del `1000 fiver excel.xlsm`** de Daniel, puestos en el formato Book4 que el Depurador lee.
>
> | | |
> |---|---|
> | del clic a que el archivo baja | **906 ms** |
> | peso del .xlsx | **0,65 MB** (contra **20,5 MB** de originales) |
> | filas / fotos | 172 filas · **172 de 172 con foto** · 109 imágenes distintas |
> | elegir la carpeta de 4.744 y emparejar | **299 ms** |
> | sin carpeta de fotos | 87 KB · `PO NAME` · 10 columnas · 0 imágenes |
>
> ⚠️ **Las 172 filas no son un recorte de las 203 líneas del macro:** el Depurador agrupa por PO + artículo y descarta los que no tienen piezas del mes, que es lo que ya hacía antes de este cambio. Y **109 imágenes contra 172 anclas** es el mismo artículo repetido en dos PO, no fotos perdidas.
>
> **El archivo se abre de verdad, y con DOS parsers independientes:** `xlsx-js-style` lo relee (172 filas, 1ª columna `Foto`, el código sigue siendo texto) y **`openpyxl` ve las 172 imágenes** ancladas en `col 0`, con `alto de fila 72` y `ancho de columna 14,83`. Una de las miniaturas extraída del ZIP es un JPEG real de 300×300 y 7 KB.
>
> **Los 3 anchos (+ el iPad acostado), contra el build de producción:** **390 · 834 · 1024 · 1440 → 0 px de arrastre de página**, y la caja nueva da **0 recorte, 0 blancos táctiles bajo 44 px y 0 textos bajo 12 px** en los cuatro (crece hacia abajo: 211 px de alto a 390, 174 a 834, 156 a 1024 y 1440). Su rótulo va a **12 px y no a los 11 de los dos rótulos vecinos**, a propósito: es texto NUEVO. El único recorte de la pantalla es el **scroller declarado de la vista previa** (`DIV.max-h-[440px].overflow-auto`, 291 px a 390 y 71 a 834): es PRE-EXISTENTE y es el mecanismo, no un defecto. El script **falla** si no encuentra la caja, si falta alguna foto, si el archivo no baja o si no se puede abrir.
>
> **Candado: `src/__tests__/lib/depurador-fotos-excel.test.ts` (26).** No busca texto en archivos: arma libros de verdad, los incrusta, los vuelve a abrir con la librería de Excel y con JSZip, y lee las anclas. Incluye un bloque que corre contra la **carpeta real** si está en la máquina (y se saltea en CI en vez de dar verde por nada).


---

> ## 🔴 Depurador — "FOTOS A MI EXCEL": un camino APARTE que no calcula nada (17-ago-2026)
>
> Daniel, textual: ***"quiero poder subir un excel con el código en la columna B y que también funcione"*** · ***"código en la columna B, y la info en otras columnas pero dejando vacío la columna A para las fotos"*** · ***"es para otro camino, no reemplaza"*** · ***"siempre en la B"***.
>
> **Pestaña nueva del Depurador: `Fotos a mi Excel`** (`/productos/cargar?tab=misfotos`). Subir el Excel → elegir la carpeta → descargar **el mismo archivo** con las fotos pegadas en la columna A. El camino de Reebok (#564) **no se tocó**.
>
> ### 🔴 LO QUE LO HACE DISTINTO: ACÁ NO SE CALCULA NADA
>
> No pasa por el precio (`CEILING(CIF÷divisor)+extra`, `validarDivisor`), no reordena, no agrega ni quita una columna. Es *"tomá mi archivo y ponele las fotos"*. Es exactamente el archivo que hoy resuelve con un macro de VBA (`1000 fiver excel.xlsm`: `NO IMAGEN · New Article · Name · Precio · Piezas · PO NAME`).
>
> ### 🔑 POR ESO NO PASA POR `xlsx-js-style` — y esa es la decisión que sostiene todo
>
> Leer con SheetJS y volver a escribir produce un archivo **NUEVO**: se pierden el `vbaProject.bin` (o sea **el macro**), los `xr:uid`, las extensiones de Excel y todo lo que la librería no entiende. Acá se abre el **.zip que ES el .xlsx/.xlsm**, se tocan **tres partes** (la hoja, el dibujo y el `[Content_Types]`) y se vuelve a cerrar. **Toda entrada que no se nombra sale byte por byte igual.**
> - Módulo PURO: `src/lib/depurador/excel-propio.ts` (entra XML como texto, sale XML como texto). El lado archivo: `app/productos/cargar/excel-propio-archivo.ts`. La pantalla: `MiExcelFotosClient.tsx`.
> - **El emparejador, el compresor y el armador del ZIP se REUSAN** (`fotos-excel.ts`, `prepararFotos`→`compressImage`, `fotos-xlsx.ts`). Si se separaran, dos pantallas pegarían fotos distintas para el mismo código.
>
> ### ✅ EL MACRO SE CONSERVA — medido, no supuesto
>
> `vbaProject.bin` viaja como una entrada más del zip: **26.624 bytes, byte por byte idéntico**, y el archivo baja como **`.xlsm`**. La pantalla lo dice antes de descargar. `nombreDeSalida(nombre, conservaMacro)` existe igual para el caso contrario: si algún día no se pudiera, baja como `.xlsx` y la pantalla lo avisa.
>
> ### 🔴 EL CÓDIGO ESTÁ EN LA COLUMNA B. NO SE BUSCA NI SE ADIVINA
>
> `COL_CODIGO_INDICE = 1`, fijo. La fila 1 es el encabezado y no se toca. **Emparejado EXACTO** (`codigo` + `.jpg`, sin mayúsculas, nada de parecidos — la lección de `Outlet Duty Free N2` vs `N3`). Sin foto, la celda A dice **`NO IMAGEN`** y **la fila nunca se salta**. Una foto que no se puede leer también sale como `NO IMAGEN`: una celda vacía se vería igual que "se pegó y nadie se dio cuenta".
> - Una fila **sin código en B** se deja tal cual (ni foto ni texto) y la pantalla dice cuántas son.
> - 🔴 **El ancla NO es `i + 1`.** Esa cuenta vale para el pedido Reebok, donde el Excel lo arma el sistema; acá las filas son las del archivo y pueden tener huecos. Vive en `filaAnclaDe()` (módulo puro) para que la pantalla no la vuelva a calcular.
>
> ### ⚠️ ORDENAR NO VA A FUNCIONAR, Y ESTÁ DECIDIDO ASÍ
>
> Daniel: *"prefiero ordenar no se pueda y quede solo filtrar"*. Se ancla con **`oneCellAnchor`**, así que al **FILTRAR** la foto se esconde con su fila; al **ORDENAR** las fotos **no se mueven**. La pantalla lo dice en una línea, antes de descargar, para que no lo descubra rompiendo un pedido.
>
> ### Lo demás que la pantalla DICE antes de descargar (enterarse después no sirve)
>
> - **La columna A se reemplaza entera** (es la columna de las fotos) — y si ya tenía algo escrito, dice **cuántas celdas** se van a pisar. Es lo que hace el macro hoy.
> - **Si la hoja ya tiene fotos pegadas** (el archivo de Daniel YA pasó por el macro), se **reemplazan**: se borra el dibujo viejo y sus imágenes, reusando el mismo part y la misma relación. Sin eso el archivo se llevaría el peso de dos juegos de fotos. ⚠️ Es una opción NUEVA (`reemplazarDibujo`) y **por defecto va apagada**: en el pedido Reebok un dibujo preexistente sigue **cortando con error**, porque ahí solo puede ser algo que escribió alguien más.
> - **Si el libro tiene varias hojas**, solo se toca la primera y lo dice con su nombre.
> - **Las fotos no se suben a ningún lado** y el Excel tampoco: en los dos archivos del camino no hay un solo `fetch` (hay candado).
>
> ### La celda la mide el ARCHIVO, no una constante
>
> El ancho de la columna A y el alto de CADA fila se leen del propio libro (`medirCeldaFoto`), porque este camino **no los cambia**. La foto se encaja con `encajar()` —una sola escala para los dos ejes, nunca agranda— dejando 8 px de margen. Medido en el archivo real: celda **94×101 px** → fotos de **86 px** de lado mayor, centradas.
>
> ### Medido con el archivo REAL y la carpeta REAL
>
> `BASE=… node scripts/_medir-excel-propio.mjs` (solo lectura; `MUESTRA=1` usa una copia por enlaces duros). Entrada: `1000 fiver excel.xlsm` (203 filas, 1,26 MB, con macro) y la carpeta entera de **4.744 fotos**.
>
> | | |
> |---|---|
> | leer el Excel y contar los códigos | **45 ms** · 203 de 203 |
> | elegir la carpeta de 4.744 y emparejar | **292 ms** · **203 de 203 con foto** |
> | del clic a que el archivo baja | **945 ms** |
> | peso | 1,26 MB → **0,67 MB** (originales emparejados: 20,5 MB) |
> | fotos | 203 anclas `oneCellAnchor` · **110 imágenes** (el mismo artículo repetido) |
>
> 🔴 **Y la prueba que importa: el archivo vuelve IGUAL.** El script compara **celda por celda contra el original**: **994 celdas fuera de la columna A idénticas · 204 filas en el mismo orden · el macro byte por byte igual**, y el `autoFilter`, el ancho de columna (13,33) y el alto de fila (76 pt) intactos. Verificado además con **openpyxl** (otro parser): 203 imágenes `OneCellAnchor` en la columna 0 y el VBA presente. Verificación fuera del navegador: `npx tsx scripts/_verif-excel-propio.ts <archivo> <carpeta>`.
>
> **Los 3 anchos (+ el iPad acostado), contra el build de producción:** **390 · 834 · 1024 · 1440 → 0 px de arrastre, 0 recorte, 0 blancos táctiles bajo 44 px y 0 textos bajo 12 px.** El script **falla** si no encuentra los 7 avisos, si falta alguna foto, si el archivo no baja, si el macro no viaja o si alguna celda fuera de la columna A cambió.
> - 🩸 **La pestaña nueva hizo desbordar la fila de pestañas a 1024 px** (de 6 a 7 fichas: 24 px de más, o sea la última quedaba fuera de la pantalla — el iPad ACOSTADO, que es justo donde arranca ese layout). El relleno de cada pestaña bajó a `px-2.5` hasta `xl`; desde `xl` vuelve el de siempre. **No se acortó ningún rótulo.**
> - 🩸 **Y un candado viejo FIJABA el defecto**: `iphone-targets-operacion.test.ts` exigía `px-4` LITERAL, cuando lo que protege es que la pestaña mida 44 px, no se comprima y no parta el texto. Pasó a exigir eso.
>
> **Candado: `src/__tests__/lib/depurador-excel-propio.test.ts` (32).** No busca texto: arma libros de verdad, los pasa por los mismos módulos que corre la pantalla y los relee con la librería de Excel **y** con JSZip. Incluye un bloque contra el **.xlsm REAL** de Daniel (se saltea si la carpeta no está, en vez de dar verde por nada) y un barrido de reuso que **borra los comentarios primero**.
> - **Verificado por mutación, 14 de 14 cazadas** (`bash scripts/_mutar-candados-excel-propio.sh`): el código se lee de otra columna · el encabezado entra como código · la celda sin foto queda vacía en vez de decir NO IMAGEN · la celda A se escribe al final de la fila · se pierde su formato · el ancho de columna se inventa · la foto se ancla por índice del par y no por la fila real · las filas sin foto se saltan · Reebok deja de cortar con un dibujo ajeno · las fotos viejas del macro quedan pegadas · el ancla deja de ser `oneCellAnchor` · la pantalla escribe su propio "NO IMAGEN" · la pantalla sube el archivo a algún lado · el `.xlsm` baja como `.xlsx` aunque el macro viaje.
> - 🩸 **La primera corrida dio 0 de 14 y era EL SCRIPT**: `--reporter=basic` no existe en vitest 4, así que la corrida moría y el conteo de fallos daba vacío → todo "sobrevivió". Y dos mutaciones sobrevivieron de verdad por candados flojos (un ternario que quedaba en pie, y un literal en JSX que el barrido buscaba entre comillas). **Un verificador que miente en cualquiera de las dos direcciones es peor que no tenerlo.**


---

## 🔴 Catálogos — LAS ESCRITURAS QUE NO CAMBIAN NADA NO SE HACEN (14-ago-2026)

> Daniel lo autorizó con una condición textual: ***"solo si no me daña nada"***. **Lo único que cambia es CUÁNTAS escrituras se hacen: el `UPDATE` que guardaría exactamente el mismo valor que ya está en la base, no se hace.**
>
> 🩸 **EL DATO.** El sync de Tommy manda **455 UPDATE de a uno** por corrida (Reebok 127, Joybees 79→83, Calvin 79) y esas escrituras eran cerca de la mitad de su tiempo. Medido con `_verif-stock-concurrencia.ts`, que saca foto de las 5 tablas antes y después de cada corrida: **en las 5 vueltas previas al cambio, 1.228 filas y 17.672 campos → 🟢 IDÉNTICO**. O sea que las **744 escrituras de cada vuelta le escribían a la base exactamente lo que ya tenía.**
>
> ### ⛔ LO QUE NO SE HIZO, y es la mitad de por qué se pudo hacer
>
> En ese write path viven la **foto** (`image_url` / `foto_manual`), el **nombre editado** (`nombre_manual`), la **etiqueta** (`badge`), el **"ocultar"** (`oculto_manual`) y el **bulto** (`bulto_pzas`) — trabajo hecho A MANO que **no vuelve de Switch si se pierde**: 389 fotos de Tommy subidas una por una y 493 productos con foto.
> - **NO se agruparon las escrituras en lotes.** Un `upsert` mal armado se lleva puestas las fotos de 490 productos. *"Agrupar las escrituras es OTRO día"* sigue siendo cierto — y ya no hace falta.
> - **NO cambió QUÉ columnas escribe un UPDATE ni con qué valores.** El payload es el MISMO objeto de siempre; lo único que ganó es un nombre (`cambios`) para poder compararlo antes de mandarlo.
> - **NO se reordenó el write path**, ni se tocaron el read-all-then-write, el guard del barrido de páginas (#498), el guard de precios imposibles ni la regla de visibilidad.
> - **El `inventory` de Reebok se sigue escribiendo SIEMPRE**, aunque el producto no cambie: saber si ya tiene esa cantidad exigiría **leer** `inventory`, y eso sí sería una consulta nueva contra una base en compute Micro.
>
> **Comparar no cuesta una lectura extra** — eso se VERIFICÓ antes de avanzar: el motor ya hacía read-all-then-write. Lo único que se agregó son **columnas a la consulta que ya existía** (`existencia`, `disponibilidad`, `stock`, `category`, `gender`, `bulto_pzas`, `codigo_barra_id`): misma consulta, mismo viaje, más columnas. Cero consultas nuevas.
>
> ### 🩸 EL RIESGO REAL NO ES ESCRIBIR DE MÁS: ES NO ESCRIBIR NUNCA
>
> Si la comparación se equivoca diciendo "igual", se saltea el 100% y **el catálogo se congela sin un solo error** — el "cero silencioso" que este repo ya pagó. Tres cosas lo cubren:
> 1. **Comparación por tipo EXPLÍCITO** (`src/lib/switch-api/catalogo-igualdad.ts`, módulo PURO): `entero` / `monto` / `texto` / `booleano` declarados **columna por columna** contra el tipo REAL de la base. 🔴 `campoIgual` devuelve `true` **solo cuando puede PROBAR la igualdad**: columna sin declarar, columna que no se leyó o tipo inesperado ⇒ **se escribe**, o sea el comportamiento de ayer. Los pares que engañan están todos en el test: `0` vs `"0.00"` (iguales, es la misma plata) · `null` vs `""` (**DISTINTOS**) · `"10"` vs `10` (iguales en un entero) · `"Sandals "` vs `"Sandals"` (**DISTINTOS**: el write path escribe el texto tal cual). Los montos se comparan **al centavo con aritmética de texto**, no con `Math.round(n*100)` — en coma flotante `16.555*100` da `1655.4999…` y el precio no se saltearía nunca.
> 2. **Contadores POR CORRIDA**: `comparados` / `escrituras` / `sinCambios` en el resultado (y en el JSON de los 4 routes) y en **`switch_sync_log.skip_details`** con el campo `catalogo_escrituras`. **Sin DDL**: la columna ya existe y los guards de montos ya la usan con SU propio `campo`. `records_updated` y `records_skipped` **no cambiaron de significado** (siguen siendo procesados y ocultados).
> 3. **Guard de sanidad**: saltearse el **100%** queda registrado (`skip_details` + `console.warn`) y **NO falla cerrado, a propósito**: un catálogo que de verdad no se movió entre dos pasadas del mismo día es posible —Joybees son 83 artículos y las 4 pasadas están a 2-3 h—, así que tumbar la corrida sería estrenar la alerta que suena para siempre. Si esto sale todos los días en todos los catálogos, la comparación se rompió.
>
> Y el peor caso del acierto es benigno: si se saltea una actualización que hacía falta, los 4 catálogos corren **4×/día** y la siguiente la agarra. **No existe un camino donde esto borre una foto**, porque no cambia lo que hace una escritura.
>
> 🩸 **LA ESCALERA DE LECTURA, y por qué no alcanzaba el fallback que había.** El motor tenía UN fallback pre-migración: si el SELECT fallaba, se releía con `COLS_BASE` a secas. Con las columnas nuevas adentro, una que todavía no exista (`bulto_pzas` antes de su DDL) habría disparado ese fallback y se habría llevado puesto también **`nombre_manual`** — y sin `nombre_manual` el sync **PISA el nombre editado a mano**. O sea: una optimización de velocidad borrando trabajo manual, justo lo que este cambio no podía hacer. Ahora son **tres escalones** que quitan lo menos posible, y un error ajeno (permisos, red) se propaga como siempre.
>
> ### EL ANTES/DESPUÉS, en producción, 5 corridas de cada lado y MEDIANA
>
> | catálogo | UPDATE/corrida | antes | después | |
> |---|---:|---:|---:|---|
> | Joybees | 83 → **0** | 15 s | **8 s** | −47% |
> | Reebok | 127 → **0** | 53 s | **28 s** | −47% |
> | Calvin | 79 → **0** | 56 s | **57 s** | ~ |
> | Tommy | 455 → **0** | 87 s | **65 s** | −25% |
>
> Las 5 corridas una por una — antes (06:17-06:38 UTC, sobre `main`) y después (08:05-08:23, ya deployado):
> `antes` joybees 36·41·15·15·15 · reebok 41·38·64·53·63 · calvin 56·56·60·106·46 · tommy 77·84·87·109·116
> `después` joybees 8·28·7·22·7 · reebok 57·28·27·39·27 · calvin 47·106·57·47·90 · tommy 37·64·65·65·65
> - ⚠️ **Calvin no se mueve, y es lo esperado**: son 79 escrituras contra el barrido de las **164 páginas** de `vistana` (8.173 artículos), que es lo que se come su sync. Mismo motivo por el que casi no se movió cuando se subió `STOCK_CONCURRENCIA`.
> - ⚠️ **Tommy mejora menos que los ~50 s que se esperaban**: esa cifra salía de una medición de otro horario; en esta franja (01:00-03:30 a.m. Panamá) la base contesta más rápido y las 455 escrituras costaban ~22 s. Lo que sí mejoró mucho es la **dispersión**: de 77-116 s a 37-65 s, o sea que el peor caso —el que ve Daniel esperando en "Actualizar ahora"— se partió casi al medio.
>
> ### 🔴 La identidad, campo por campo — primera foto contra última
>
> La foto de las **06:17** (antes de todo, con el código viejo) contra la de las **08:23**, con **10 corridas de sync de por medio**: `joybees_products` 83 · `products` 284 · `inventory` 284 · `calvin_products` 80 · `tommy_products` 497 = **1.228 filas y 17.672 campos → 🟢 IDÉNTICO, cero cambios**, con las 493 fotos de Tommy y las 283 de Reebok en su lugar. `image_url`, `foto_manual`, el nombre, la etiqueta, `oculto_manual` y el bulto están **fuera** de la lista de movimiento legítimo del verificador: si alguno se hubiera movido, sería un fallo y no un resultado. En las 20 corridas el log dejó `escrituras=0 · sinCambios=744`.
>
> ### Candados
>
> `src/__tests__/lib/catalogo-sin-escrituras-iguales.test.ts` (51 casos). **Son de CONDUCTA, no de texto**: corren el motor REAL contra un Supabase simulado que **proyecta a las columnas pedidas** (como PostgREST) y miran los payloads exactos de cada escritura. Uno recorre las **4 marcas reales** y exige que toda columna del UPDATE esté declarada con su tipo **y** se lea en la misma consulta — si mañana alguien agrega una columna al write path y se olvida, ese catálogo vuelve a escribir siempre (seguro) y el test lo dice.
> - **Verificado por mutación, 14 de 14 cazadas** (`bash scripts/_mutar-candados-catalogo.sh`): `campoIgual` siempre true · "no la leí" = "es igual" · comparación laxa (`null` == `""` == `0`) · textos normalizados · montos en coma flotante · payload vacío = igual · el guard del 100% no marca · el motor no escribe nunca · el motor escribe siempre · la escalera pierde su escalón intermedio · los contadores no se registran · el inventario deja de escribirse · Tommy deja de declarar sus columnas · una columna del UPDATE sin tipo.
> - 🔴 **La prueba de que SÍ actualiza lo que cambió**: `MARCA=tommy DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-catalogo-escribe-lo-que-cambio.ts` corre el motor REAL contra los **productos REALES de producción** y el **Switch REAL**, en `dryRun` (cero escrituras), dos veces: control y con **UNA** columna movida en la RESPUESTA de la lectura (no en la base). Medido el 14-ago-2026: **CONTROL 455 comparados · 0 escrituras · 455 sinCambios** · **MUTADO `T1XH343351800` disponibilidad 20→21 ⇒ 455 comparados · 1 escritura · 454 sinCambios**, y la base quedó **INTACTA** (`disponibilidad=20`). Un solo campo distinto ⇒ exactamente una escritura más.
>   - 🩸 **La primera corrida dio 🔴 y era EL SCRIPT, no el motor**: eligió `FW0FW06158-DW5`, un producto **inactivo**. El loop que compara solo recorre el set de `/stock` (= activos ∪ disponible≥1), así que mover una fila que no está ahí no produce ninguna escritura y el veredicto habría acusado al motor de algo que no hacía. Ahora elige un producto **activo**. Un verificador que miente en cualquiera de las dos direcciones es peor que no tenerlo.


---

## Pedido o COTIZACIÓN — el mismo botón, dos salidas (24-ago-2026)

> ⚠️ **SUPERADO EN PARTE el 25-ago-2026 — ver *«LAS DOS SALIDAS SE OFRECEN DIRECTO»* más abajo.** Lo que cambió es SOLO cómo se ofrecen: **no hay ventana en el medio, no hay párrafo, y el componente `ElegirDocumentoSwitch` YA NO EXISTE**. Todo lo demás de este bloque —el endpoint sin documentar y cómo se mapeó, el 422 del cliente, `normalizarDocumento`, el at-most-once, el aviso de Telegram, el DDL tolerante y el pedido del LINK— **sigue vigente tal cual**.
>
> "Enviar a Switch" tenía UNA sola salida: `POST /apipedido/terminar`, que crea un PEDIDO. Daniel pidió poder mandar también una **cotización** y fue textual sobre cómo: ***"que estén los dos"*** — se elige cada vez, ninguna reemplaza a la otra.
>
> ### El endpoint, y cómo se mapeó SIN ensuciar producción
>
> **`POST /apicotizacion/terminar` EXISTE y NO está documentado** (el PDF solo trae leer cotizaciones —§5.31 `/lista`, §5.32 `/info`— y §5.33 `/correo`). Es el **cuarto endpoint sin documentar** de este conector. Se mapeó el 24-ago-2026 contra `active_shoes` mandando **un campo a la vez y SIN `articulos`**: sin líneas no puede crear nada, así que cada respuesta es solo una validación y la empresa queda intacta.
>
> ```
> {}                       → 400 code 0315 "VENDEDOR NO SE ENCUENTRA DISPONIBLE"
> {vendedorId}             → 400 code 0316 "CLIENTE NO SE ENCUENTRA DISPONIBLE"
> {vendedorId, clienteId}  → 400 code 0319 "INFORMACIÓN DE ARTICULOS INCORRECTA"
> ```
>
> O sea: **contrato idéntico al del pedido**, campo por campo y en el mismo orden de validación. Por eso el motor de envío es UNO solo y lo único que cambia son dos líneas: a qué ruta sale el POST y con cuál se verifica después (`/apicotizacion/info` devuelve `detalle[]` con las mismas columnas que el del pedido).
> - ⚠️ **`/apicotizacion/crear`, `/guardar` y `/nueva` NO existen**: devuelven la página de excepción de Switch con **HTTP 200** (200, no 404). En este conector un endpoint se prueba por el SHAPE de la respuesta, nunca por el status.
> - ⚠️ **El nombre del id de la respuesta NO está medido** (no se manda una cotización de prueba a producción). Se lee con tolerancia —`cotizacionId`, `pedidoId`, `id`— y **el motor nunca depende de él**: sin id la cotización queda creada igual, con su `numeroInterno`, solo que sin verificación. Un id inventado (`Number(undefined)` = NaN, `Number(null)` = 0) sería peor que ningún id, y hay mutación para eso.
>
> ### 🔴 LA PANTALLA DICE LA DIFERENCIA ANTES DE MANDAR
>
> Una cotización **NO aparta mercancía**: si se cotizan 500 pares, a los otros vendedores les siguen apareciendo disponibles y los pueden vender. **Enterarse de eso después es el problema**, así que el botón ahora **pregunta qué** y la advertencia viaja pegada a la opción:
>
> > **Pedido** — Aparta la mercancía para este cliente.
> > **Cotización** — La cotización NO aparta la mercancía: si cotizas 500 pares, a los otros vendedores les siguen apareciendo disponibles y los pueden vender. · *Si después lo compran, duplica el pedido y mándalo como pedido.*
>
> **Un toque más, no un flujo nuevo.** Dos botones gemelos al lado se tocan sin leer —y el que se toca de más manda 500 pares de la forma equivocada—, así que la elección cuesta un toque y ese toque trae la explicación.
> - Los textos viven en **`lib/catalogo/documento-switch.ts`**, no en las pantallas: son TRES las que mandan a Switch (checkout, detalle del pedido y confirmación) y tres copias de una advertencia se separan solas — la que quede vieja es la que manda plata al ERP. Hay candado que prohíbe reescribirla a mano en cualquiera de las tres.
> - **Una sola pieza para las 4 marcas** (`ElegirDocumentoSwitch`): Reebok · Joybees · Tommy · Calvin comparten el mismo componente. **Joybees sigue siendo espejo exacto de Reebok y no se tocó nada propio de Reebok.**
> - El estado de después también lo dice: *"Cotización creada en Switch: 16-…"*, el banner del candado (*"ya está en Switch como cotización #…"*) y, en la confirmación, la misma frase de que no aparta mercancía.
>
> ### 🔴 EL CANDADO DEL CLIENTE CUBRE LAS DOS SALIDAS
>
> `documento` se lee **DESPUÉS** del 422 de `handlePostEnvio` y del 400 de `/api/catalogo/checkout`: una cotización pasa por el MISMO candado que un pedido. Si se saltara por este costado, el agujero de los **15 pedidos por $53.124 a nombre de "Contado"** volvería a estar abierto con otro nombre. Hay test de conducta (se renderiza la pantalla, se toca el botón y se cuenta qué salió por `fetch`) y test de contrato para los dos orígenes, interno y del link.
> - **El servidor NO confía en el navegador**: `normalizarDocumento` acepta exactamente dos valores y **cualquier otra cosa cae a PEDIDO**. El modo de fallo aceptable es crear el documento de siempre, nunca una cotización que nadie pidió. Un body viejo, sin el campo, sigue creando un pedido igual que ayer.
> - **El pedido del LINK público no se tocó ni se amplió**: sigue esperando a que una persona le ponga el cliente.
>
> ### ⚠️ EL CANDADO at-most-once NO SE TOCÓ — y eso tiene una consecuencia que se dice ANTES
>
> El índice parcial único sigue siendo **`(order_id) WHERE estado <> 'error'`**: **UN envío no-fallido por pedido, salga como pedido o como cotización**. Meterle `documento` a la clave permitiría dos escrituras al ERP por el mismo pedido, que es exactamente lo que ese índice existe para impedir.
> - **Consecuencia:** cotizar CONSUME el envío de ese pedido. Para vender de verdad lo cotizado se **duplica** (el botón ya existe y pregunta el cliente). Está dicho en la propia elección —*"Si después lo compran, duplica el pedido y mándalo como pedido"*— y hay test que lo fija.
> - 🔴 **Si Daniel prefiere que una cotización NO trabe el pedido**, es cambiar el índice a `(order_id, documento)`. Es una decisión suya, no de un refactor: se dejó como está a propósito.
>
> ### El aviso de Telegram dice cuál de las dos fue
>
> **📝** en vez de 📦, etapa *"COTIZACIÓN enviada a Switch"* y una línea extra: *"No aparta mercancía — sigue disponible para los demás."* En una lista de avisos el emoji es lo primero que se ve, y quien lee el canal decide cosas con eso. Sigue pasando por el armador único (`telegram-pedido.ts`), no por un texto inline.
>
> ### DDL
>
> **`20260824160000_switch_envios_documento.sql`** agrega `documento TEXT NOT NULL DEFAULT 'pedido'` + CHECK a las 4 tablas de envíos. **No hace falta backfill**: todo lo viejo es pedido, que es lo único que el sistema sabía crear. **El código es TOLERANTE a que no esté corrida** —la escritura reintenta sin la columna y la lectura también—, así que mientras tanto todo se comporta como antes; hay test que lo prueba (con el DDL pendiente la cotización SALE IGUAL).
>
> ### Medición
>
> **`BASE=… node scripts/_medir-cotizacion-anchos.mjs`** (el navegador **ABORTA cualquier POST** a `/api/catalogo/checkout` y a `**/enviar-switch`: abrir la elección no manda nada por diseño, y así es imposible aunque el diseño cambie). Contra el build de producción y con datos reales, en **390 · 834 · 1024 · 1440**: la elección mide **358×399 px en el iPhone** y **448×381 px en los otros tres** (se topa con el ancho disponible y crece hacia ABAJO — en 390 px es 41 px más alta y 90 px más angosta, no más ancha) → **0 arrastre · 0 recorte · 0 táctil <44 px · 0 texto <12 px**, con las dos opciones y la advertencia a la vista en los cuatro. Escrituras bloqueadas: **0**.
> - Los tocables <44 px que el script reporta en el resto de la pantalla (`← Inicio`, `← Catálogo`, el precio por pieza, `← Volver a Pedidos`, `Ocultar de la lista`) son los **PRE-EXISTENTES**, en código que este cambio no toca: se listan aparte como informativos y no tumban la medición.
> - 🩸 **Gotcha de medición:** al usuario de prueba no le corresponde vendedor, así que hay que **elegir uno** además del cliente — si no, el botón queda apagado **con razón** y no hay elección que medir.
> - 🩸 **Bajo el candado post-envío la pantalla NO dibuja el renglón de estado** (`switchLock ? null : …`, comportamiento de siempre): lo que se lee ahí es el BANNER. La primera versión del script exigía el renglón y daba rojo por nada.
>
> ### Candados
>
> **`lib/documento-switch.test.ts`** (la regla, las palabras y la estructura) · **`lib/switch-envio-paralelo.test.ts`** (corre el motor REAL: la cotización sale por `/apicotizacion/terminar` y NO toca `/apipedido/terminar`, la verificación usa la ruta de SU documento, la MISMA pre-validación, el at-most-once, el DDL pendiente y el texto exacto del aviso) · **`components/pedido-cliente-obligatorio.test.tsx`** (CONDUCTA: la advertencia está en pantalla y todavía no salió nada; sin cliente no sale ninguna de las dos) · **`api/catalogo-paridad-enviar-switch.test.ts`** (el 422 para la cotización, el passthrough y la normalización).
> - **Verificado por mutación, 20 de 20 cazadas** (`bash scripts/_mutar-candados-cotizacion.sh`): un documento inventado se acepta · el default se vuelve cotización · la advertencia deja de decir que no aparta · la opción de cotizar pierde su advertencia · todo sale como pedido · todo sale como cotización · la verificación usa siempre la ruta del pedido · el envío no guarda qué se mandó · con el DDL pendiente el envío se cae · un id que no existe se guarda igual · el motor ignora el documento · **el servidor deja pasar una cotización sin cliente** · las dos rutas dejan de pasar el documento · las dos pantallas mandan sin preguntar · el selector dibuja su propia lista · el selector deja de dibujar la advertencia · Telegram no dice cuál fue · Telegram calla que no aparta mercancía.
> - ⚠️ **Las guardas del NAVEGADOR que abren la elección NO son verificables por mutación y se dice de frente**: React no despacha el click de un botón deshabilitado ni forzándole `disabled = false` (vuelto a medir el 24-ago-2026 quitando cada guarda: los 30 casos siguen verdes). Son segunda capa; el candado que no se puede saltear es el 422 del servidor, y ése SÍ está mutado.
> - 🩸 **La restauración del script va por COPIA, no por `git checkout`**: hay archivos NUEVOS en la rama y git aborta el comando entero sin restaurar nada — las mutaciones se apilarían y ninguna se probaría por separado.


---

## 🔴 Pedidos — LA LISTA DEL ADMIN DICE LOS DOS NÚMEROS (25-ago-2026)

> «Administrar catálogo › Pedidos» mostraba **cliente, total y fecha, y ningún número**. Para cruzar un pedido contra Switch había que abrirlos **de a uno**.
>
> Un pedido tiene **DOS** números y ninguno reemplaza al otro:
> - **el de la casa** — `order_number` (`PED-017` · `JBP-041` · `TOM-026` · `CKP-005`), lo pone el sistema al crearlo;
> - **el de Switch** — el `numero_interno` del envío ACTIVO (`16-000000503`).
>
> 🩸 **MEDIDO CONTRA PRODUCCIÓN ANTES DE CONSTRUIR** (`DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-pedidos-numeros-lista.ts`, solo lectura): **42 pedidos internos vivos, los 42 con `order_number` (100%)** · **38 de 42 (90,5%) con número de Switch**, los otros 4 todavía no salieron · **0 envíos activos sin número** · **6 pedidos del LINK sin convertir**, que NO tienen número propio porque se lo asigna la conversión. Un campo que está lleno siempre y otro que falta en el 10% **no se muestran igual**.
>
> ### 🔴 EL NÚMERO DE SWITCH SOLO NO ALCANZA — dice si fue PEDIDO o COTIZACIÓN
>
> Desde el #579 un envío puede ser un pedido **o una cotización**, y **una cotización NO aparta mercancía**. Pintar `Switch: 16-000000503` a secas hace que las dos se vean idénticas en la lista, y quien lo lea va a creer que la mercancía está apartada cuando no lo está. Por eso el texto **siempre nombra cuál de las dos es**: `Pedido en Switch: 16-000000503` / `Cotización en Switch: 16-000000503`.
> - **Medido: los 38 envíos activos de las 4 marcas son `documento='pedido'`** — la primera cotización todavía no existe, y **justamente por eso el rótulo tiene que estar puesto ANTES de que aparezca**.
> - El `documento` se lee con el **escalón tolerante** de siempre (DDL `20260824160000`): si la columna no estuviera, se relee sin ella y todo sale como PEDIDO, que es lo único que el sistema sabía crear. Hay mutación que lo prueba.
>
> ### 🔴 UN PEDIDO QUE NO FUE A SWITCH NO DICE «—»
>
> Un guion en la columna de un número se lee como un cero, o como un dato que no cargó. Dice lo que es:
>
> ```
> Sporting Shoes                          Zapatería Nueva                 Nathalie   [Del link]
> PED-017 · Pedido en Switch: 16-000000503   PED-019 · No se ha mandado    Se numera al abrirlo ·
>                                                       a Switch           No se ha mandado a Switch
> ```
>
> El pedido del **link sin convertir** no tiene número propio y **también lo dice** (*«Se numera al abrirlo»* — se lo asigna la conversión, que es lo que hace «Editar»). Los textos viven en **`src/lib/catalogo/numeros-pedido.ts`** (módulo PURO), no sueltos en la pantalla: la lista es **una sola pieza para las 4 marcas** y una copia que quede vieja es la que le miente a alguien sobre si tiene la mercancía apartada. **Joybees sigue siendo espejo exacto de Reebok y no se tocó nada propio de Reebok.**
> - ⚠️ El **`"?"` heredado** de `pedidos-unificado` (envío activo sin `numero_interno` ni `pedido_switch_id` — hoy **0 casos**) NO se pinta como si fuera un número: se dice *«Pedido en Switch, sin número»*. Un signo de pregunta donde va un número es el vacío que parece un dato.
>
> ### 🔴 NO SON COLUMNAS NUEVAS: van DEBAJO DEL NOMBRE
>
> Dos columnas más ensanchan la tabla justo en el **iPad acostado (1024)**, que es el ancho donde este repo ya se quemó. Los números van como **segunda línea bajo el cliente**: la tabla crece **hacia ABAJO**, que es gratis. La tabla conserva **exactamente sus 6 columnas** y hay candado que las cuenta tabla por tabla.
> - 🩸 **Y aun sin columna nueva la tabla pedía 13 px de más en el iPad de 834**: el número de Switch es un token largo y subía el `min-content` de la columna Cliente de 95 a 108 px. **Los gutters de ESA columna se aprietan por debajo de `lg`** (`px-2 lg:px-4`) — de `lg` para arriba no cambia un píxel. ⛔ **Se probó `overflow-wrap: anywhere` y se DESCARTÓ midiendo**: arregla el ancho, pero **parte el número por la mitad** en 12 de 19 filas de Reebok y 17 de 20 de Tommy a 390 y 834 px. Un número cortado en dos es exactamente lo que este cambio vino a evitar.
>
> ### El buscador encuentra por los DOS números
>
> Pasó de *«Buscar por cliente…»* a **«Buscar por cliente o número…»**: el número que Daniel tiene a mano puede ser el de la casa o el que le dice el ERP. Es el mismo `textoBuscablePedido` del módulo puro.
>
> ### De dónde salen (sin DDL, sin consultas nuevas por fila)
>
> `order_number` **NO está en la vista unificada** (que expone `id_natural`, el uuid), así que `/[marca]/pedidos-unificado` lo pide a la tabla de orders **en UNA sola query por ids** (`.in("id", orderIds)`), al lado de la de envíos que ya existía. Sin DDL y sin barrer la tabla entera — hay mutación para las dos cosas. **`switch_numero` no cambió de significado** (lo usa el modal de eliminación masiva y no se tocó); lo nuevo son `numero_pedido` y `switch_documento`.
>
> ### Medición
>
> **Los 3 anchos + el iPad acostado, en el navegador contra el build de producción, con datos de producción, en las 4 marcas y con TODOS los meses desplegados, y CONTRA `origin/main`** (`BASE=… ETAPA=antes|despues node scripts/_medir-pedidos-numeros-anchos.mjs`, solo lectura — el navegador **aborta todo pedido que no sea GET**):
>
> | recorte de la tabla | 390 | 834 | **1024** | 1440 |
> |---|---:|---:|---:|---:|
> | `origin/main` | 214 · 201 · 227 · 211 | 0 · 0 · **7** · 0 | **0** | 0 |
> | esta rama | 217 · 209 · **218** · 214 | **0 · 0 · 0 · 0** | **0** | 0 |
>
> **0 px de arrastre de página en los 16 casos · 0 textos <12 px · táctiles <44 px IDÉNTICOS a main** (reebok 57 · joybees 3 · tommy 60 · calvin 12 — son las casillas de 16 px y los botones «Editar»/«Eliminar» de 28 px de alto, **PRE-EXISTENTES**, en código que este cambio no toca). El recorte de 390 px es el `overflow-x-auto` que la tabla ya declaraba —arrastrarla ES el mecanismo— y **Tommy MEJORÓ ahí** (227 → 218). Escrituras bloqueadas: las mismas 12 de main (Sentry).
> - 🩸 **El script FALLA si alguna fila no trae sus dos números**, si aparece un guion suelto donde va un número, o si alguna tabla deja de tener 6 columnas.
> - 🩸 **Gotcha de medición que daba «no apareció la tabla» por nada:** por defecto solo se abre el mes ACTUAL, y **los 19 pedidos de Reebok son de julio** — sin desplegar los meses NO hay una sola fila en el DOM. Primero se despliega, después se esperan las filas.
>
> ### Candados
>
> `src/__tests__/lib/numeros-pedido.test.ts` (la regla y las palabras) · **`src/__tests__/components/pedidos-numeros-en-la-lista.test.tsx` (CONDUCTA: renderiza la pestaña real, lee el DOM, cuenta los `<th>`, verifica que los dos números vivan DENTRO de la celda del cliente y que ninguna otra celda los repita, y compara la segunda línea de Reebok y Joybees carácter por carácter)** · `src/__tests__/api/pedidos-unificado-numeros.test.ts` (contrato en las 4 marcas + el escalón tolerante del DDL) · `catalogo-paridad-listas.test.ts`, actualizado.
> - **Verificado por mutación, 18 de 18 cazadas** (`bash scripts/_mutar-candados-pedidos-numeros.sh`): el número de Switch se pinta solo · toda cotización se rotula como pedido · el que no salió vuelve a decir «—» · el del link vuelve a un blanco · nadie está en Switch · todos están en Switch · el «?» se pinta como número · el número propio se ignora · el buscador vuelve a mirar solo el cliente (en el módulo y en la pantalla) · la fila deja de dibujar los números · deja de pintar el de Switch · deja de pintar el propio · el pedido del link se trata como interno · el número no viaja al navegador · qué se mandó no viaja · se pierde el escalón tolerante del DDL · los `order_number` se piden barriendo la tabla entera.
> - 🩸 **La restauración del script va por COPIA, no con `git checkout`**: hay archivos NUEVOS en la rama y git aborta el comando entero sin restaurar nada — las mutaciones se apilarían y ninguna se probaría por separado.
>
> ### Lo que NO se tocó
>
> El modal de eliminación masiva y su `switch_numero` · el candado at-most-once · el envío a Switch · la agrupación por mes · el routing de «Editar» (fila y botón al MISMO lado) · el Excel de «Exportar» · y **nada del detalle del pedido**.


---

## 🔴 EL PAPEL DECÍA «PEDIDO» SIENDO UNA COTIZACIÓN (25-ago-2026)

> Daniel mandó **TOM-027 como COTIZACIÓN**, Switch la aceptó (`15-000000123`), y:
> - la pantalla de confirmación decía **«Pedido TOM-027 guardado»** en el título grande, y recién abajo, en chico, *«Cotización enviada a Switch»* — **el título mentía y es lo primero que se lee**;
> - el **PDF decía «Pedido: TOM-027»** en el encabezado, al lado del cliente y la fecha. **Ese papel se le manda al cliente**, y una cotización NO aparta mercancía: el papel que dice «Pedido» hace creer que sí.
>
> Daniel, textual: ***"esto fue una cotización, porque dice pedidos en pdf?"***
>
> 🩸 **EL CASO ES REAL Y ESTÁ EN PRODUCCIÓN**: al 25-ago-2026, de los **39 envíos activos** de las 4 marcas (reebok 15 · joybees 4 · tommy 18 · calvin 2) hay **UNA sola cotización, y es TOM-027**. Las otras 38 son pedidos. O sea que el bug se disparó con la PRIMERA cotización que existió.
>
> ### 🔴 EL NÚMERO NO CAMBIA — CAMBIA LA PALABRA QUE LO ACOMPAÑA
>
> `TOM-027` es el número de la casa y se llama así **siempre**, salga como pedido o como cotización. No se le pone otro prefijo ni se renombra. Hay mutación para el caso contrario (*el NÚMERO de la casa se renombra con la palabra adelante*).
>
> ### La regla, y por qué son TRES estados y no dos
>
> Todo sale de **`palabraEnSwitch` / `palabraDelPapel`** en `src/lib/catalogo/documento-switch.ts` (módulo PURO):
>
> ```
> envío ACTIVO documento='cotizacion'  → "Cotización"
> envío ACTIVO documento='pedido'      → "Pedido"
> SIN envío activo                     → null  ← no es ninguna de las dos
> ```
>
> - 🔴 **El `null` es el punto del módulo.** Un pedido que todavía no se mandó no es ninguna de las dos y **no se le inventa etiqueta**: cada pantalla se queda con la palabra que ya usaba, o sea **exactamente lo que decía antes de este cambio**. Cero cambio de conducta para lo que no salió a Switch.
> - **Manda lo que hay en SWITCH, no el `status` de la casa**, porque es lo único comprobable. 🩸 Y el status solo NO alcanza, medido: **mandar a Switch escribe `status = confirmado`**, así que la regla vieja del #584 (`status === "confirmado" ? "Pedido" : "Cotización"`) bajaba **`Pedido-TOM-027.pdf` para una cotización**.
> - **«Está en Switch» es el MISMO criterio que el candado de edición** (`ESTADOS_EN_SWITCH = ['enviado','verificado']`, importado por `switch-lock.ts`): dos definiciones de lo mismo se separan solas, y la que quede vieja le miente a alguien sobre si tiene la mercancía apartada.
> - **Escalón tolerante de siempre** (DDL `20260824160000`): sin la columna `documento` se relee sin ella y sale **«Pedido»**. La lectura vive en `palabraDelEnvioActivo` (`switch-lock.ts`); **cualquier error devuelve `null`**, o sea la palabra de siempre — un PDF que no se genera es peor que uno con el rótulo por defecto.
>
> ### Lo que dice AHORA, textual
>
> ```
> COTIZACIÓN          título   «Cotización TOM-027 guardado»
>                     PDF      «Cotización: TOM-027»
>                     archivo  Cotización-TOM-027-2026-08-25.pdf
> PEDIDO              título   «Pedido TOM-027 guardado»
>                     PDF      «Pedido: TOM-027»
>                     archivo  Pedido-TOM-027-2026-08-25.pdf
> NO SALIÓ a Switch   igual que antes: «Pedido …» (y el detalle sigue con el #584)
> ```
>
> ### 🩸 «Cotización» LLEVA TILDE Y `Content-Disposition` ES UN ENCABEZADO HTTP
>
> Un `filename="…ó…"` a secas viaja como latin-1 y el navegador baja **`CotizaciÃ³n-TOM-027.pdf`**. La ruta `/orders/[id]/pdf` usa **RFC 6266**: `filename` en ASCII puro de respaldo **más** `filename*=UTF-8''…` percent-encoded, que es el que ganan Chrome, Safari y Firefox. Hay mutación (*el nombre del archivo pierde el RFC 6266 y la tilde viaja rota*). En el detalle NO hace falta: ahí el nombre va por `doc.save()`, sin encabezado de por medio (es el arreglo del #584 y sigue igual).
>
> ### Se fue el párrafo — y la constante también
>
> Daniel, textual: ***"no siempre tiene que haber explicación, eso ensucia mi ERP"***. La confirmación dibujaba `TEXTO_NO_RESERVA` (*«La cotización NO aparta la mercancía: si cotizas 500 pares…»*) **después** de mandar. Se fue de la pantalla **y la constante se BORRÓ**: dejarla muerta es el párrafo esperando a que alguien la vuelva a montar — el mismo motivo por el que `ElegirDocumentoSwitch.tsx` se borró en vez de dejarse sin usar. Hay candado que exige que el `export` no exista y que **ninguna de las 4 pantallas** vuelva a escribir «500 pares» a mano.
> - **Lo que se queda:** la etiqueta de 3 palabras pegada al botón (`NOTA_COTIZACION`, con su candado de largo) y la línea propia del **aviso de Telegram** (*«No aparta mercancía — sigue disponible para los demás.»*), que es del armador de Telegram y **no se duplicó**: quien lee el canal no estaba ahí cuando se eligió.
>
> ### Las superficies, barridas (con los comentarios borrados antes de grepear)
>
> | Superficie | Antes | Ahora |
> |---|---|---|
> | Título de la confirmación | `Pedido TOM-027 guardado` | **corregida** — la palabra sale del módulo |
> | Encabezado del PDF | `Pedido: TOM-027` | **corregida** — `documentoLabel` |
> | Nombre del archivo, «Ver PDF» de la confirmación | `Pedido-TOM-027-….pdf` | **corregida** + RFC 6266 |
> | Nombre del archivo, «Descargar PDF» del detalle | por `status` (#584) | **corregida** — Switch manda; sin envío, el #584 intacto |
> | Adjunto del correo al cliente | `Pedido-TOM-027-….pdf` | **corregida** (y el papel adentro también) |
> | Detalle: banner del candado y renglón de estado | ya decía cuál | sin tocar |
> | Lista del admin (`numeros-pedido.ts`) | ya decía cuál (#593) | sin tocar |
> | Excel de «Exportar» (columna Switch) | ya decía cuál (#596) | sin tocar |
> | Aviso de Telegram (📝 vs 📦) | ya distinguía | sin tocar, **sin duplicar** |
> | Párrafo rojo de la confirmación | se dibujaba | **BORRADO**, constante incluida |
> | 🔴 Asunto del correo + banda de marca (`marcas.ts` ×4 ×2) | `Recibimos tu pedido X` · `Pedido X — cliente` · `Gracias por tu pedido` | **NO corregida — decide Daniel** |
> | PDF del pedido del LINK público y su WhatsApp | `Pedido-Reebok-….pdf` | no aplica: un pedido del link nunca es una cotización de Switch |
>
> - 🔴 **Por qué el asunto y la banda del correo NO se tocaron:** no es un cambio de palabra, es **reescribir copy que ve el cliente** en 8 plantillas (4 marcas × equipo/cliente). *«Recibimos tu pedido»* → *«Recibimos tu cotización»* suena raro (el cliente no la mandó) y *«Gracias por tu pedido»* no tiene equivalente de una palabra. **El adjunto ya sale bien**, así que el papel no miente; lo que falta es la carta que lo acompaña. **Es decisión de Daniel** y queda escrito acá.
> - 🩸 **MEDIDO Y SE DICE DE FRENTE:** bajo el candado post-envío el detalle **NO dibuja el bloque «Compartir pedido»** (`switchLock ? null : …`, conducta de siempre), así que por «Descargar PDF» **nunca se llega** a la rama de la cotización de Switch. Hoy el papel de una cotización sale por el **«Ver PDF» de la confirmación**, que es una RUTA y está cubierta con 20 casos en las 4 marcas. La regla igual es UNA sola y hay candado de fuente para que el detalle no vuelva a decidir por su cuenta.
>
> ### Verificación
>
> **🔴 EL PDF SE GENERA DE VERDAD Y SE LEE CON `pdftotext`** (`npx tsx scripts/_verif-pdf-dice-la-verdad.mjs`, solo lectura): genera los tres casos con el MISMO core que usa la app, los guarda y les pasa `pdftotext -layout`. Se lee **«Pedido: TOM-027»** y **«Cotización: TOM-027»**, cada archivo pesa **77,7 KB** y **el número no cambia en ninguno**. Además mide el ANCHO del encabezado con la fuente real: la línea vive en columnas FIJAS (Cliente x=14 · documento x=90 · Fecha x=150) y «Cotización: TOM-027» mide **29,8 mm de los 60 disponibles** — no se monta encima de la fecha (el de «Pedido» mide 24,9).
>
> **🔴 EL BUG REPRODUCIDO Y ARREGLADO CONTRA LA APP DE VERDAD, sobre TOM-027**, el mismo pedido de la captura. Los dos builds de producción levantados a la vez (rama :3479 · `origin/main` :3480), el PDF pedido por HTTP y leído con `pdftotext`:
>
> ```
> main   Content-Disposition: inline; filename="Pedido-TOM-027-2026-08-25.pdf"
>        Cliente: A-Amani, S.A.        Pedido: TOM-027        Fecha: 25 de agosto de 2026
>        título «Pedido TOM-027 guardado» · renglón «Cotización» → ❌ SE CONTRADICEN · párrafo ❌ presente
>
> rama   Content-Disposition: inline; filename="Cotizacion-TOM-027-2026-08-25.pdf";
>                             filename*=UTF-8''Cotizaci%C3%B3n-TOM-027-2026-08-25.pdf
>        Cliente: A-Amani, S.A.        Cotización: TOM-027    Fecha: 25 de agosto de 2026
>        título «Cotización TOM-027 guardado» · renglón «Cotización» → ✅ coinciden · párrafo ✅ 0
> ```
>
> El script corrido contra `main` da **16 hallazgos** (el título contradiciendo al renglón + el párrafo, en los 4 anchos); contra la rama, **0**.
>
> **Los 4 anchos, las 4 marcas** (`BASE=… MARCA=… PEDIDO_EDITABLE=… PEDIDO_EN_SWITCH=… node scripts/_medir-documento-directo-anchos.mjs`), contra el build de producción y con datos de producción → **🟢 reebok · joybees · tommy · calvin: 0 arrastre · 0 recorte · 0 táctil <44 px · 0 texto <12 px** en 390 · 834 · 1024 · 1440. Se le sumó al script `verificarTituloConfirmacion`, que exige que **el título nombre lo MISMO que el renglón de abajo**, que **conserve el número** y que **el párrafo no vuelva**. Y una pantalla nueva: la **confirmación de un pedido YA en Switch** —el caso de TOM-027—, donde además se mide que **no vuelva a ofrecer las dos salidas** (at-most-once).
> - 🔴 **El navegador sigue ABORTANDO todo POST** a `/api/catalogo/checkout` y a `**/enviar-switch`. **Escrituras bloqueadas: 0** en todas las corridas.
> - 🔴 **Y CONTRA `origin/main`, mismo build de producción y mismos datos**: `SOLO_PANTALLA=1` corre **el MISMO archivo en las dos ramas** (dos scripts distintos no comparan nada). Resultado en las 4 marcas × 4 anchos: **arrastre 0, recorte 0, textos <12 px 0 y los táctiles <44 px IDÉNTICOS** — reebok 4·6·2·2 · joybees 4·2·2 · tommy 3·21·1·1·2 · calvin 3·5·1·1·3, los mismos números en las dos. Con `SOLO_PANTALLA=1` la exigencia del título NO corre: en main el título todavía miente, que es el punto.
> - Los táctiles <44 px son los **PRE-EXISTENTES** (`← Inicio`, `← Catálogo`, el precio por pieza, `← Volver a Pedidos`, la `x` de quitar línea, `Ocultar de la lista`, `Eliminar pedido`), en código que este cambio no toca.
>
> ### Candados
>
> `lib/documento-switch.test.ts` (la regla, los tres estados, el criterio compartido, la tolerancia al DDL, que el párrafo no exista y que ninguna pantalla lo reescriba) · **`api/pdf-pedido-o-cotizacion.test.ts`** (llama a las RUTAS de verdad: la palabra que le llega al generador, el `Content-Disposition` con su tilde, el adjunto del correo — **32 casos, las 4 marcas**) · **`components/confirmacion-dice-la-verdad.test.tsx`** (CONDUCTA: monta la pantalla REAL en las 4 marcas, lee el `h1` y cuenta **0 POST**) · **`components/pedido-pdf-dice-la-verdad.test.tsx`** (CONDUCTA: toca «Descargar PDF» de verdad).
> - **Verificado por mutación, 32 de 32 cazadas** (`bash scripts/_mutar-candados-cotizacion-dice-la-verdad.sh`): toda salida se rotula pedido · toda salida se rotula cotización · **un pedido que NO salió se rotula igual** · un intento fallido cuenta como «está en Switch» · la palabra ignora lo que hay en Switch · sin envío el papel queda en blanco · **vuelve el PÁRRAFO** · la lectura pierde el escalón tolerante · un error de lectura se vuelve cotización · la lectura no filtra por estado · **el PDF vuelve a decir siempre «Pedido:»** · el PDF ignora la palabra · el PDF pierde el número · la ruta no mira el envío · **el nombre del archivo vuelve a «Pedido-»** · el encabezado y el nombre se separan · **pierde el RFC 6266 y la tilde viaja rota** · **el NÚMERO de la casa se renombra** · el correo no mira el envío · **el adjunto vuelve a «Pedido-»** · el adjunto no lleva la palabra adentro · **el título vuelve a mentir** · el título dice siempre cotización · el título pierde el número · **vuelve el párrafo a la confirmación** · el detalle decide solo por status · el detalle pierde el #584 · en el detalle el archivo y el papel se separan · la lista del admin calla cuál fue · el Excel calla cuál fue · Telegram deja de distinguir 📝 de 📦 · Telegram calla que no aparta.
> - 🩸 **CUATRO NO SE CAZARON EN LA PRIMERA CORRIDA y las cuatro enseñaron algo.** Dos eran del core del PDF: los tests de ruta **mockean** `order-pdf`, así que nadie generaba el papel — se sumó a `catalogo-pdf.test.ts` la lectura del PDF con pdf.js. Una era la consulta: el doble de Supabase **no filtra por su cuenta**, así que sacar el `.in("estado", …)` no cambiaba ningún resultado — ahora se inspecciona la CONSULTA que salió, no la respuesta. Y la cuarta es la del detalle, que abajo se explica por qué solo puede tener candado de FUENTE.
> - El script restaura **por COPIA y no con `git checkout`** (hay archivos nuevos en la rama y git aborta el comando entero sin restaurar nada), **denuncia el patrón que no muta** en vez de darlo por cazado, y **exige que la corrida haya colectado tests** (si vitest muere, «0 fallos» se leería como «sobrevivió»).
> - 🩸 **El reemplazo lo hace `python3`, no `perl -0pi -e 's|A|B|'`**: en este repo un `||` del código real se des-escapa dentro del patrón de perl, la expresión se come el archivo entero y el informe dice «SOBREVIVIÓ». Los textos son literales, no regex.
>
> ### Lo que NO se tocó
>
> El endpoint `/apicotizacion/terminar` y el motor único de envío · el 422 del cliente · `normalizarDocumento` · el at-most-once · el DDL `20260824160000` y su tolerancia · el aviso de Telegram · el pedido del LINK público · la lista del admin (#593) · el Excel (#596) · la etiqueta «no aparta mercancía» pegada al botón · el flujo de 3 toques y «Duplicar».


---

## 🔴 EL AVISO DE TELEGRAM, EN DOS LÍNEAS — y la barra de instalar se fue de iOS (25-ago-2026)

> Daniel, textual: ***"lo quiero más simple… solo quiero lo útil"***, y eligió el formato EXACTO:
>
> ```
> 📝 Cotización TOM-027 · A-Amani, S.A.
> Tommy Hilfiger · $648 · 12 piezas · Switch 15-000000123
>
> 📦 Pedido TOM-028 · Hafez, S.A.
> Tommy Hilfiger · $2,760 · 48 piezas · Switch 16-000002058
> ```
>
> **LA REGLA: línea 1 = QUÉ es + DE QUIÉN es. Línea 2 = marca + monto + piezas + N° de Switch.** El monto va en la SEGUNDA a propósito — lo puso ahí él. Y aplica a **TODOS** los avisos de este tipo: *"este mensaje es solo de ejemplo, así mismo aplicarlo para todos los pedidos, cotizaciones etc"* — los 3 eventos y las 4 marcas.
>
> ### 🔴 LO QUE SE FUE, Y NO VUELVE — cada cosa con su motivo
>
> | Se fue | Por qué |
> |---|---|
> | `No aparta mercancía — sigue disponible para los demás.` | él ya lo sabe, y la advertencia sigue viva **DONDE SE DECIDE** (`NOTA_COTIZACION`, pegada al botón). Un renglón DESPUÉS de mandar no evita nada |
> | `✓ verificado` | es lo NORMAL. Solo se escribe la excepción: **`⚠️ sin verificar`** sigue pegado al número |
> | `— COTIZACIÓN enviada a Switch` | lo dicen ya la primera palabra y el número de abajo. Tres veces lo mismo en dos líneas |
> | `Cliente:` y `Vendedor:` | el nombre tras el `·` ya se lee como el cliente, y **EL VENDEDOR SALIÓ DEL MENSAJE** (sigue en el pedido, en el detalle y en la comisión) |
> | `1 referencia · 1 bulto` | quedan las **PIEZAS**, la unidad que factura Switch |
>
> ⚠️ **LOS AVISOS DE ERROR NO SE PODARON.** Cuando el envío falla o Switch no responde, el mensaje sale por `enviarSistema` desde `switch-envio.ts` y sigue diciendo qué pasó y qué hacer (`🚨 Envío a Switch FALLÓ … (se puede reintentar desde la confirmación)` · `🚨 … AMBIGUO … REVISAR EL PANEL antes de reintentar`). Ahí el detalle ES lo útil. La poda es SOLO del aviso de éxito, y hay candado.
>
> ⚠️ **EL ARMADOR SIGUE SIENDO UNO** (`src/lib/catalogo/telegram-pedido.ts`). No se duplicó: `ResumenAviso` se redujo a `piezas` y los tres emisores le mandan `piezas:` — el `resumen: {referencias, bultos, piezas}` ya no existe.
>
> **EMOJIS:** la creación lleva el de la MARCA (🛒 Reebok · 🐝 Joybees · 🔵 Tommy · ⚫ Calvin) y la salida a Switch **📦 pedido / 📝 cotización** — el mismo pedido se lee avanzando (🔵 TOM-005 → 📦 TOM-005) y las dos salidas se distinguen antes de leer una palabra. **Pedido y cotización NO pueden compartir emoji.**
>
> 🔑 **LA TERCERA LÍNEA DEL PEDIDO DEL LINK NO SE PODÓ** (*"Falta ponerle el cliente y mandarlo a Switch — está en Borradores."*): no es explicación, es una **ACCIÓN pendiente** — es lo único que hay entre el pedido y el ERP, y sin decirla el pedido se queda quieto y nadie se entera.
>
> 🔑 **El canal va SIN `parse_mode` y así se queda** (ver `telegram.ts`): texto PLANO, así un cliente que se llame `Ropa & Más <Panamá>` viaja tal cual sin escapes y sin que Telegram rechace el mensaje. Hay candado que exige que no aparezcan `<>` ni marcado.
>
> **`etapaTelegram()` SE BORRÓ** de `documento-switch.ts` junto con la etapa deletreada — no se deja sin usar: una etapa muerta es la etapa esperando a que alguien la vuelva a montar. La palabra que grita cuál de las dos es la sigue dando `etiquetaDocumento`.
>
> ### 🔴 LA BARRA «Instala Fashion Group» SE FUE DE iOS
>
> Safari **NO dispara `beforeinstallprompt`**, así que ahí la barra nunca pudo instalar nada: lo único que hacía era un párrafo explicando cómo hacerlo A MANO (*"Toca Compartir y luego Agregar a inicio"*), fijo al borde de abajo de la pantalla. Daniel ya tiene la app en su inicio y aprobó sacarla. `isIosSafari()` se **BORRÓ** (su único consumidor era el hint).
>
> ⚠️ **EN ANDROID Y ESCRITORIO SE QUEDA, y está medido.** Ahí el navegador SÍ ofrece instalar y el botón «Instalar app» sigue vivo — **idéntico a `origin/main`, píxel por píxel**.
>
> **Los 4 anchos, en el navegador contra el build de producción y CONTRA `origin/main`** (`BASE=… ETAPA=antes|despues node scripts/_medir-install-prompt-anchos.mjs`, solo lectura — el navegador **aborta todo pedido que no sea GET**; escrituras bloqueadas: 0):
>
> | | 390 | 834 | 1024 | 1440 |
> |---|---|---|---|---|
> | **iPhone · main** | barra SÍ, **tapa 101 px** | SÍ, 101 | SÍ, 101 | SÍ, 101 |
> | **iPhone · esta rama** | **no · 0 px** | no · 0 | no · 0 | no · 0 |
> | **Android · main** | barra SÍ + botón, tapa 138 px | SÍ, 138 | SÍ, 138 | SÍ, 138 |
> | **Android · esta rama** | **IDÉNTICO** | idéntico | idéntico | idéntico |
>
> **0 px de arrastre · 0 táctiles <44 px · textos <12 px IDÉNTICOS (2, PRE-EXISTENTES)** en los 16 casos. Los recortados bajan de 3 a 2 (390) y de 2 a 1 (los otros tres): el que se va es la barra.
> - 🩸 **El script FALLA si mide cero sin haber mirado nada**: en `ETAPA=antes` exige que la barra de iOS APAREZCA (si no, el "antes" no prueba nada) y en las DOS etapas exige que Android conserve barra y botón. Y limpia `fg_modoviaje_install_dismissed` antes de navegar — con esa key puesta la barra no se dibuja NUNCA y todo daría "0" en verde.
> - 🩸 Chrome headless no cumple los criterios de instalación por su cuenta: el script dispara el evento **REAL** `beforeinstallprompt`, con la misma forma que manda el navegador.
>
> ### `NotasProveedorMobiliario.tsx` se BORRÓ (523 líneas)
>
> **Comprobado muerto antes de borrarlo**, con barrido sobre los 1.408 archivos de `src/` **y los comentarios eliminados primero**: 0 imports, 0 `dynamic(`/`import()`, no está en el barril de `components/marketing/`, 0 referencias por string. El único match "vivo" era un comentario de `PreciosProveedorAyuda.tsx` que decía textualmente *"sigue sin montarse en ningún lado"*.
> - 🔴 **SUS 3 CANDADOS SE MUDARON, NINGUNO SE BORRÓ** — los tres vigilaban reglas que siguen vivas en `PreciosProveedorAyuda.tsx`. En `marketing-notas-proveedor.test.ts`, `RUTA_COMPONENTE` → **`RUTA_AYUDA_PRECIOS`** apuntando al archivo vivo (con un helper `soloCodigo()`, porque el archivo vivo **CITA** la regla en su encabezado y eso daba rojo falso). En `poda-textos-ayuda.test.ts`, la aserción salió de la lista `EN_PANTALLA` —que prohíbe esconder un aviso detrás de un ⓘ, y ahora está detrás de un toque **a propósito**— y se mudó a un `describe` propio con el texto íntegro.
>
> ### Candados
>
> `telegram-pedido-origen.test.ts` (33, **CAMBIÓ DE DIRECCIÓN**: exigía las 4 cifras y los rótulos, o sea fijaba lo que Daniel podó; hoy compara el mensaje ENTERO carácter por carácter y exige que lo podado no vuelva) · `documento-switch.test.ts` · `switch-envio-paralelo.test.ts` (corre el motor REAL) · **`components/install-prompt-solo-donde-se-instala.test.tsx` (9), que RENDERIZA el componente y dispara el evento** — un barrido de texto no puede ver que el botón siga llegando a la pantalla, y se cumpliría con el propio comentario que explica el cambio.
> - **Verificado por mutación, 23 de 23 cazadas y 0 sobrevivientes** (`bash scripts/_mutar-candados-telegram-simple.sh`): vuelve el «no aparta mercancía» · vuelve el vendedor · vuelve el «✓ verificado» · vuelve la etapa deletreada · vuelven los rótulos «Cliente:» · vuelven referencias y bultos · **pedido y cotización con el MISMO emoji** · todo se rotula «Pedido» · la marca desaparece de la 2ª línea · el monto se va a la 1ª · el N° de Switch deja de decirse · se inventa un «0 piezas» · el link pierde su acción pendiente · los emisores dejan de mandar las piezas (×2) · **el envío FALLIDO pierde su detalle** · el AMBIGUO pierde el «REVISAR EL PANEL» · el error pierde su 🚨 · la etiqueta del botón deja de decir que no aparta · **la barra vuelve en iOS** · la barra desaparece también de Android · el botón queda decorativo · el botón baja de 44 px.
> - 🩸 **El script trae una mutación de CONTROL que a propósito no matchea**: si no sale ⛔, el denunciador está roto y todos los ✅ valen lo mismo que un barrido con el comentario adentro.
> - 🩸 **Restaura por COPIA, no con `git checkout`** (hay archivos NUEVOS y git aborta el comando entero), **denuncia el patrón muerto**, **exige que vitest haya colectado** antes de creerle a un cero, y **el reemplazo es LITERAL con `python3`, no `perl -0pi -e 's|…|…|'`**: con el delimitador `|`, un `||` del código real se des-escapa a una alternación con rama vacía y **se come el archivo entero**, dando un «SOBREVIVIÓ» falso.
>
> **Dry-run sin spamear el chat** (no importa el canal ni `sendTelegramAlert`, así que no hay camino por el que pueda escribirle a Daniel): `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_dryrun-avisos-pedido.ts TOM-027`.


---

## 🔴 LAS DOS SALIDAS SE OFRECEN DIRECTO — se fue la ventana y se fue el párrafo (25-ago-2026)

> Daniel, textual: ***"quiero que en vez de que diga «enviar a switch», salga cotización o pedido como opción (sin párrafo explicando, btw no siempre hay q estar explicando todo, se vuelve tedioso)"***.
>
> ```
> ANTES (24-ago)                          AHORA
> [ Enviar a Switch ]                     ┌──────────┬─────────────────────┐
>        ↓ abre una ventana               │  Pedido  │     Cotización      │
> ┌────────────────────────────────┐      │          │ no aparta mercancía │
> │ ¿Qué mandas a Switch?          │      └──────────┴─────────────────────┘
> │ Pedido — Aparta la mercancía…  │        (sólido)      (ámbar, contorno)
> │ Cotización — La cotización NO  │
> │ aparta la mercancía: si coti-  │      Falta: elegir el cliente
> │ zas 500 pares, a los otros…  · │
> │ Si después lo compran, dupli-  │
> │ ca el pedido y mándalo como…   │
> │ [ Cancelar ]                   │
> └────────────────────────────────┘
> ```
>
> **Los textos EXACTOS son cuatro palabras: «Pedido» · «Cotización» + «no aparta mercancía».** Un toque manda.
>
> ### 🔴 SE VA EL PÁRRAFO, NO EL DATO — y la etiqueta tiene candado de LARGO
>
> Esto **revierte un criterio del 24-ago** (*"dos botones gemelos al lado se tocan sin leer"*). **La decisión nueva es de Daniel y manda**, pero el riesgo que ese criterio protegía es REAL y no desaparece: **una cotización NO aparta mercancía**, y tocar la equivocada manda 500 pares de la forma que no era. Así que de toda la explicación queda **lo único material, pegado a la opción y en el mínimo de palabras**: `NOTA_COTIZACION = "no aparta mercancía"`.
> - **Eso NO es un párrafo, es una etiqueta, y el largo es parte del candado**: ≤ 4 palabras, ≤ 24 caracteres, sin punto y sin el ejemplo de los 500 pares. Si mañana alguien le agrega media frase "para que se entienda mejor", vuelve a ser lo que Daniel sacó — y el build se pone rojo.
> - **Se fue todo el resto del texto didáctico**: `TEXTO_SI_RESERVA` (*"Aparta la mercancía para este cliente"*) y `TEXTO_COTIZACION_DESPUÉS` (*"Si después lo compran, duplica el pedido…"*) **ya no existen**.
> - ~~**`TEXTO_NO_RESERVA` (la frase larga) SIGUE VIVA donde sí hay lugar para leerla**: la confirmación DESPUÉS de mandar y el aviso de Telegram. No se dibuja antes de mandar.~~ ⚠️ **SUPERADO el 25-ago-2026** — Daniel lo señaló en su captura (*"no siempre tiene que haber explicación, eso ensucia mi ERP"*): la constante **se BORRÓ** y la confirmación ya no la dibuja. Telegram nunca la usó (tiene su propia línea). Ver *«EL PAPEL DECÍA «PEDIDO» SIENDO UNA COTIZACIÓN»*.
> - 🔴 **Y las dos NO se ven iguales, que es lo que impide el toque sin leer**: el pedido es el sólido (negro en checkout/confirmación, verde en el detalle) y la cotización es la de **contorno ámbar** con su etiqueta. Hay mutación para el caso simétrico: si el PEDIDO también llevara etiqueta, vuelven a ser gemelos y el build se pone rojo.
>
> ### 🔴 NINGÚN CANDADO SE AFLOJÓ — y los cuatro están mutados
>
> - **El cliente sigue siendo obligatorio.** El **422** de `handlePostEnvio` se lee ANTES del documento y no se tocó; las dos salidas **nacen APAGADAS y diciendo qué falta** (*"Falta: elegir el cliente y elegir el vendedor"*). La elección directa no es una puerta de atrás: hay test de CONDUCTA que toca las dos opciones sin cliente y cuenta **0 envíos**.
> - **`normalizarDocumento` intacto**: cualquier valor que no sea exactamente `pedido` o `cotizacion` **cae a PEDIDO**. El servidor no confía en el navegador.
> - **El at-most-once no se tocó** (`(order_id) WHERE estado <> 'error'`): cotizar sigue consumiendo el envío de ese pedido, y para vender de verdad se duplica. ⚠️ **Esa consecuencia ya NO se dice en la elección** (era la línea *"Si después lo compran, duplica…"*, que se fue con el párrafo). Se sigue diciendo el banner del candado post-envío. Es lo que costó sacar el párrafo, y queda escrito.
> - **Telegram sigue diciendo cuál fue** (📝 vs 📦, *"COTIZACIÓN enviada a Switch"* + *"No aparta mercancía"*), y **el pedido del LINK público no se tocó**.
> - **Mientras manda, las dos opciones DESAPARECEN** y queda el renglón del paso vivo: sin ventana de por medio, eso es lo que impide el doble toque (más el `enviandoRef` del detalle). Hay mutación.
>
> ### Una sola pieza para las 4 marcas y las 3 pantallas
>
> `src/components/catalogo/EnviarDocumentoSwitch.tsx` — **NO es un modal**: sin `createPortal`, sin `useBodyScrollLock`, sin `autoFocus`. Lo dibujan `CheckoutClient`, `PedidoDetalleClient` y `ConfirmacionClient`; **Joybees sigue siendo espejo exacto de Reebok y no se tocó nada propio de Reebok**. `ElegirDocumentoSwitch.tsx` **se BORRÓ** — dejarlo sin usar sería una segunda forma de mandar plata al ERP esperando a que alguien la vuelva a montar; hay test que exige que el archivo no exista.
> - **En el checkout las dos salidas bajaron del costado del total a un renglón propio a todo el ancho**: en 390 px dos opciones no entran al lado del monto.
> - **Textos que se podaron por quedar repetidos:** en el detalle, *"Elige pedido o cotización, y se crea de verdad en Switch"* → *"Se crea de verdad en Switch (…)"* (las dos salidas están a la vista con sus nombres). En la confirmación se fue el *"Reintentar envío a Switch"*: el estado ya lo dice arriba (*"El envío a Switch falló"* / *"Este pedido aún no se ha enviado"*).
>
> ### El Excel de Pedidos lleva los DOS números
>
> **«Catálogos › Administrar › Pedidos › Exportar»** bajaba un .xlsx **sin los números que la pantalla muestra desde el #593**. Ahora lleva **dos columnas nuevas, AL FINAL**: `N° pedido` y `Switch`.
> - 🔴 **AL FINAL, NO INTERCALADAS.** Daniel puede tener una planilla enganchada a ese archivo y mover una columna existente **se la corre entera**. Las 6 de siempre quedan donde estaban, en su orden, y el orden de las FILAS tampoco cambia. Hay mutación que intercala una columna y pone el build rojo.
> - 🔴 **El que no salió DICE que no salió**: `No se ha mandado a Switch`, **nunca un guion** (un guion en la columna de un número se lee como un cero o como un dato que no cargó). El del LINK sin convertir dice `Se numera al abrirlo`. **Es el criterio EXACTO de la pantalla porque es el MISMO módulo** (`numeros-pedido.ts`), no una copia: hay mutación que reescribe los textos a mano.
> - 🔴 **La columna de Switch dice si fue PEDIDO o COTIZACIÓN**: `Cotización en Switch: 16-000000506`. Con el número solo, las dos se ven iguales en una planilla.
> - **Los datos salen de las MISMAS dos consultas que `pedidos-unificado`** (envío activo + `order_number`, acotadas por los ids que la vista ya trajo), con el **escalón tolerante** del DDL `20260824160000`: sin la columna `documento` el Excel sale igual y todo se lee como pedido.
> - 🔴 **SIN LOS DATOS NO SE INVENTA:** si la vista no pudiera dar `id_natural`/`fuente`, el libro sale **como salía antes, con sus 6 columnas** (`conNumeros: false`). Escribir «No se ha mandado a Switch» en las 42 filas sin haberlo mirado sería una **mentira en una planilla**, que es peor que una columna que no está. Hay mutación.
> - **La banda de TOTALES crece con las columnas**: un `totals` más corto deja las dos últimas celdas sin celda y la banda se ve cortada justo donde están los números nuevos.
>
> ### Medición
>
> **`BASE=… MARCA=… PEDIDO_EDITABLE=… PEDIDO_EN_SWITCH=… node scripts/_medir-documento-directo-anchos.mjs`** — el navegador **ABORTA cualquier POST** a `/api/catalogo/checkout` y a `**/enviar-switch`. Ahora importa MÁS que antes: **tocar una opción MANDA**, así que ese candado es lo único que separa una medición de un pedido de verdad (el script ni las toca, pero medir no puede depender de que nadie se equivoque). **Escrituras bloqueadas: 0.**
>
> Contra el build de producción y con datos de producción, en las **4 marcas** y las **3 pantallas** (checkout · detalle · confirmación) + el detalle YA en Switch: **390 · 834 · 1024 · 1440 → 0 arrastre · 0 recorte · 0 táctil <44 px · 0 texto <12 px**, con las dos opciones y la etiqueta a la vista en los 4 anchos. Las opciones miden **175×56 px en el iPhone** y hasta 428×56 en escritorio: **crecen hacia abajo, no ensanchan nada**.
> - 🔴 **Y CONTRA `origin/main`, mismo build de producción y mismos datos**: `SOLO_PANTALLA=1` mide únicamente la pantalla entera y **corre el MISMO archivo en las dos ramas** (dos scripts distintos no comparan nada). Resultado en las 4 marcas × 4 pantallas × 4 anchos: **arrastre 0, recorte 0, textos <12 px 0 y los táctiles <44 px IDÉNTICOS** — tommy 3·21·1·2 · reebok 4·6·2·2 · joybees 4·2 · calvin 3·6·1·3, los mismos números en las dos. Lo único que se mueve es la ALTURA (el detalle de calvin queda **12 px más CORTO** que en main).
> - Los táctiles <44 px son los **PRE-EXISTENTES** (`← Inicio`, `← Catálogo`, el precio por pieza, `← Volver a Pedidos`, la `x` de quitar línea, `Ocultar de la lista`), en código que este cambio no toca.
> - 🩸 **Gotcha ya documentado y sigue vigente:** al usuario de medición **no le corresponde vendedor**, así que hay que elegirle uno además del cliente — si no, las salidas quedan apagadas **con razón** y no hay nada que medir.
> - 🩸 **El detalle bajo el candado post-envío NO ofrece salidas, y eso se mide como exigencia**: si aparecieran, se podría mandar dos veces.
>
> **🔴 EL EXCEL SE ABRE DE VERDAD, CON DOS PARSERS** (`BASE=… node scripts/_verif-excel-pedidos-numeros.mjs`, solo lectura): pide el archivo a la app corriendo, lo guarda, verifica la firma `PK` del zip y lo lee con **`xlsx-js-style`** y con **`jszip` + el XML crudo de `sheet1.xml`/`sharedStrings.xml`** — dos caminos que no comparten una línea de código. Medido en las 4 marcas: **48 filas, 96 celdas, 0 distintas entre los dos parsers**, columnas `… Fecha · N° pedido · Switch`, **13 pedidos dicen «No se ha mandado a Switch», 6 del link dicen «Se numera al abrirlo»**, y ni un guion. Un test que mire el workbook en memoria no prueba que el archivo salga bien.
>
> ### Candados
>
> `lib/documento-switch.test.ts` (la etiqueta, su largo, que el pedido NO la lleve, y que el modal viejo no exista) · **`components/pedido-cliente-obligatorio.test.tsx`** y **`components/pedido-un-toque.test.tsx`** (CONDUCTA: montan las pantallas REALES, tocan las opciones REALES y cuentan qué salió por `fetch`) · **`api/pedidos-export-numeros.test.ts`** (llama al handler del export, **abre el .xlsx que devuelve** y lee las celdas, en las 4 marcas) · `excel-exports-catalogos.test.ts` · `api/catalogo-paridad-enviar-switch.test.ts` · `lib/switch-envio-paralelo.test.ts`.
> - **Verificado por mutación, 36 de 36 cazadas** (`bash scripts/_mutar-candados-documento-directo.sh`): la etiqueta deja de decir que no aparta · vuelve a ser un párrafo · la cotización la pierde · el PEDIDO también la lleva (gemelos) · un documento inventado se acepta · el default se vuelve cotización · el control dibuja su propia lista · deja de dibujar la etiqueta · las salidas no se apagan sin cliente · el control no dice qué falta · las salidas siguen tocables mientras manda · el checkout / el detalle / la confirmación mandan sin ofrecer las dos salidas · el checkout y el detalle dejan de apagar la elección · **el SERVIDOR deja pasar una cotización sin cliente** · las dos rutas dejan de pasar el documento · todo sale como pedido · todo sale como cotización · el envío no guarda qué se mandó · el Excel pierde las dos columnas · **las columnas se INTERCALAN** · el que no salió vuelve a un guion · la columna de Switch deja de decir cuál fue · toda cotización se rotula como pedido · el Excel escribe los textos a mano · el del link vuelve a un blanco · la banda de totales se corta · la ruta del export no manda el número de la casa / el de Switch / qué se mandó · pierde el escalón tolerante del DDL · barre la tabla de orders entera · **sin `id_natural` el Excel inventa que nadie salió a Switch**.
> - 🩸 **DOS mutaciones no se cazaron en la primera corrida, y las dos enseñaron algo.** Una era del SCRIPT (patrón muerto: el texto no matcheaba, el archivo quedaba SANO y los tests pasaban) — por eso `mutar()` **denuncia el patrón que no muta** en vez de darlo por cazado, y exige que el archivo CAMBIE. La otra era un **candado flojo**: la banda de totales cortada no rompía nada porque ningún test miraba el ESTILO de las últimas celdas de esa fila.
> - 🩸 **La restauración va por COPIA, no con `git checkout`**: hay archivos NUEVOS en la rama y git aborta el comando entero sin restaurar nada — las mutaciones se apilarían y ninguna se probaría por separado.
> - ⚠️ **Las guardas del NAVEGADOR siguen sin ser verificables por mutación y se dice de frente**: React no despacha el click de un botón deshabilitado ni forzándole `disabled = false`. Son segunda capa; el candado que no se puede saltear es el 422 del servidor, y ése SÍ está mutado.
>
> ### Lo que NO se tocó
>
> El endpoint `/apicotizacion/terminar` y el motor único de envío · el 422 del cliente · `normalizarDocumento` · el at-most-once · el DDL `20260824160000` y su tolerancia · el aviso de Telegram · el pedido del LINK público · los dos números en la LISTA del admin (#593) · el resto de las columnas del Excel y el orden de las filas · el flujo de 3 toques, «Duplicar» y el modo pedido.


---

## 🔴 EL PANEL SE LLAMA «COMPROBANTES», Y SE LLEGA EN UN TOQUE (25-ago-2026)

> Daniel, textual: ***"al terminar un pedido, un botón para ver los comprobantes… o dejarlo volver a catálogo y ya en catálogo entras al panel de pedidos (debería de llamarse **comprobantes**, ya que dentro podrás ver las cotizaciones enviadas y los pedidos enviados)"***.
>
> El panel se llamaba «Pedidos» **cuando adentro solo había pedidos**. Desde el #579 un envío sale como PEDIDO o como COTIZACIÓN, así que adentro hay dos cosas y el rótulo viejo nombraba una sola.
>
> 🔑 **EL NOMBRE NO ES UNA OCURRENCIA: ES EL DE SWITCH.** Su propio panel llama **«Reportes de comprobantes»** a esa pantalla y los separa en **8 tipos** —Facturas/Notas · Transacción · Tiquete · Ventas · Pedidos · Cotización · Abonos · Cotización Email— (`docs/switch-panel.md`, extraído de la base pública de Switch el 25-ago-2026). Usamos la palabra del ERP contra el que cuadramos, no una nuestra.
>
> ### ⚠️ EL LABEL CAMBIA, LA LLAVE NO
>
> La `key` de la pestaña **sigue siendo `pedidos`**: `/catalogos/admin/<marca>?tab=pedidos`. Un marcador guardado tiene que seguir llegando, y la medición lo comprueba entrando **por esa URL** en las 4 marcas × 4 anchos. Es la misma decisión ya escrita dos veces en este repo: **Cheques→«Recordatorios»** (*"la key sigue siendo `cheques`"*) y **Asistencia→«Asistencia y Planilla»**.
> - **Y los pedidos internos SIGUEN llamándose pedidos cuando son pedidos**: el badge de la fila, «¿Eliminar pedido?», `order_number`, el `documento` de la API y la lista del vendedor (`/catalogo/<marca>/pedidos`, que se llama «Pedidos» a propósito) **no se tocaron**. Lo que cambió de nombre es el CONTENEDOR y su chrome: la pestaña, los vacíos («No hay comprobantes aún» · «Ningún comprobante coincide») y el contador del mes.
> - **«Comprobantes» no choca con ninguna ficha** de `modules.ts` — hay candado que compara contra las 29 etiquetas, sin tildes y en los dos sentidos (que ninguna sea igual y que ninguna la contenga), y que exige que **no aparezca una key nueva `comprobantes`** (sería un módulo sin fila en `role_permissions`).
> - **La hoja del Excel sigue llamándose «Pedidos» y el archivo también.** Daniel puede tener una planilla enganchada: renombrar la hoja la desengancha. Es el mismo criterio que puso las dos columnas nuevas AL FINAL.
>
> ### 🔴 ADENTRO SE FILTRA POR TIPO — TRES CHIPS, SIN «TODOS» (25-ago-2026)
>
> ```
> [ Pedidos ]  [ Cotizaciones ]  [ Borradores ]
> ```
>
> Daniel, textual: ***"entonces haz un tap de borrador, para q esté organizado. No quiero opción de todos."*** El panel **abre en «Pedidos»**, que es lo que más se mira.
>
> ~~`[ Todos 42 ] [ Pedidos 30 ] [ Cotizaciones 2 ] [ Sin mandar 10 ]`~~ — **SUPERADO**: se fue «Todos» y **«Sin mandar» pasó a «Borradores» CAMBIANDO DE CRITERIO**.
>
> #### 🔴 «BORRADORES» NO ES «SIN MANDAR»: SON DOS PREGUNTAS DISTINTAS
>
> El balde viejo preguntaba *"¿salió a Switch?"*. El nuevo pregunta *"¿está terminado?"* — **`status = 'borrador'`**, lo que la tabla de orders dice y lo que el checkout cambia a `'confirmado'`. **Y hay un caso REAL en producción donde se separan:**
>
> ```
> reebok  PED-018  Hafez, S.A.  $2.520  status='borrador'  Y EN SWITCH como pedido
> ```
>
> un pedido que salió al ERP y cuyo `status` nunca se cerró (el update del checkout tiene reintento). Con el criterio viejo caía en «Pedidos»; con el nuevo cae en «Borradores», que es lo que Daniel pidió ver. **Y al revés**: reebok y calvin tienen un `confirmado` cada uno que NUNCA salió — con el criterio viejo caían en «Sin mandar» y ahora caen en «Pedidos».
>
> #### 🔴 LOS TRES CHIPS PARTICIONAN — ES LO QUE PERMITE QUE «TODOS» SE VAYA
>
> **Esto no es un detalle.** Con «Todos» en la fila, una fila que no encajara en ningún criterio seguía siendo alcanzable. **Sin «Todos», una fila sin chip es una fila INVISIBLE** — y en producción hay **8 filas vivas** que ningún criterio estricto atrapa: los **6 pedidos del LINK sin convertir** (5 reebok + 1 joybees) y **2 confirmados que nunca salieron**. Por eso **«Pedidos» es el balde de RESTO**, y por eso hay candado que exige que la suma de los tres dé SIEMPRE el total y que cada fila caiga en **exactamente un** chip.
>
> El orden de decisión es **borrador → cotización → pedido**: el borrador gana sobre todo (no está terminado, da igual dónde esté).
> - ⚠️ **Y la fila SIGUE diciendo la verdad línea por línea**: `textoEnSwitch` no se tocó, así que un pedido del chip «Pedidos» que no salió sigue leyéndose *«No se ha mandado a Switch»*. **El chip organiza; la fila informa.**
> - **Cero consultas nuevas.** `documento` viaja en la fila desde el #593 y **`status` desde el #607, en la MISMA query que ya traía `order_number`**. La base está en compute Micro. Hay mutación para el caso "se pide en una consulta aparte".
> - 🩸 **EL `.in("id", orderIds)` DE ESA QUERY ES EL FILTRO DE VIDA, no una optimización.** `orderIds` sale de la VISTA, que descarta `deleted = true`. Barrer la tabla entera traería los **67 pedidos borrados** y el chip contaría contra **110 en vez de 43** — el error que ya se cometió una vez con este mismo dato. Hay mutación.
> - **Escalón tolerante también para `status`**: si la columna faltara, la lectura se reintenta sin ella y **nada queda marcado como borrador** (la lista nunca se cae). El del DDL `20260824160000` (`documento`) sigue valiendo. 🩸 Ese sí perdió su mutación **a propósito**: con «Pedidos» de balde de resto la tolerancia dejó de ser una rama que se pueda romper — se intentó y SOBREVIVIÓ con razón, y contarla habría sido inventar una verificación. El lado positivo tiene candado.
> - **El vacío mira si el PANEL está vacío, no si hay un filtro puesto.** Sin «Todos» el filtro SIEMPRE está puesto, y la condición vieja habría dicho *«Ningún comprobante coincide»* hasta con cero comprobantes en la marca. Hay mutación.
> - **Se cruza con el filtro de ORIGEN** (Todos · Del link · Míos), que **NO se tocó** — ése conserva su «Todos». Hay test que toca los dos.
> - **Sin avisos y sin borrado automático.** Daniel: *"no quiero q me avises nada. Que no se borre automático por ahora."*
> - 🔴 **NO ES UNA COLUMNA NUEVA**: la fila de filtros va ARRIBA de la tabla, que conserva **exactamente sus 6 columnas** — el ancho del iPad acostado (1024) no se movió ni un píxel (medido, ver abajo).
>
> **Medido en producción el 25-ago-2026, los tres chips en las 4 marcas × 4 anchos, tocando cada uno y contando las filas que quedan:**
>
> | marca | Pedidos | Cotizaciones | Borradores | = filas vivas |
> |---|---:|---:|---:|---:|
> | reebok | 17 | 0 | **2** | 19 |
> | tommy | 17 | 1 | **3** | 21 |
> | joybees | 5 | 0 | **0** | 5 |
> | calvin | 3 | 0 | **1** | 4 |
>
> 🩸 **Las «filas vivas» del PANEL son 49, no 43.** 43 son los pedidos vivos de las tablas `<marca>_orders` (14 · 21 · 4 · 4); el panel muestra ADEMÁS los **6 pedidos del link sin convertir** que la vista unificada trae. Los **6 borradores** sí son exactamente los 6 medidos: `PED-018` · `PED-019` · `TOM-005` · `TOM-006` · `TOM-023` · `CKP-007`.
>
> **Verificado por mutación, 32 de 32 cazadas** (`bash scripts/_mutar-candados-borradores.sh`): vuelve «Todos» · el filtro deja pasar todo · «Borradores» vuelve a llamarse «Sin mandar» · el panel deja de abrir en «Pedidos» · **«Borradores» vuelve al criterio viejo de «nunca se envió»** · nada/todo es borrador · el del link se cuenta como borrador · el status deja de tolerar mayúsculas · **PED-018 se cuenta como PEDIDO (orden invertido)** · **«Pedidos» deja de ser el balde de resto (filas invisibles)** · los chips dejan de ser disjuntos · **la API barre orders SIN filtrar por ids (el chip cuenta filas borradas)** · el status no viaja · se pierde el escalón · los conteos sobre lo ya filtrado · el filtro pisa al de ORIGEN · la tabla gana una columna · el vacío vuelve a mirar el filtro.
>
> ### 🔴 DE LA CONFIRMACIÓN A LA LISTA: 4 TOQUES → 1, Y EL DESTINO DEPENDE DEL ROL
>
> 🩸 **EL BOTÓN NO PUEDE SER UNO SOLO.** La confirmación la ven los **tres** roles que arman pedidos (`createRoles` = admin, secretaria y **vendedor**), y `/catalogos/admin/<marca>` es de `CATALOGO_ADMIN_ROLES` (admin + secretaria): mandar ahí a un vendedor es mandarlo a una pantalla cuyas peticiones mueren en **403** en el servidor.
>
> | rol | destino | antes | después |
> |---|---|---:|---:|
> | admin · secretaria | `/catalogos/admin/<marca>?tab=pedidos` — **«Ver comprobantes»** | **4** | **1** |
> | vendedor | `/catalogo/<marca>/pedidos` — **«Ver pedidos»** | **2** | **1** |
>
> **Los toques se contaron TOCANDO**, no estimando: el script drivea los clics uno por uno en las 4 marcas y verifica dónde terminó. El camino viejo del admin era `← Inicio` · `Catálogos` · `Administrar` · pestaña `Pedidos`; el del vendedor, `Volver al catálogo` · `Pedidos`.
> - **El destino y su rótulo salen del MISMO lugar** (`lib/catalogo/destino-comprobantes.ts`, módulo puro): un `href` y un `label` que se puedan separar son exactamente un botón que dice una cosa y lleva a otra. Hay mutación para el caso.
> - 🩸 **El default es la lista que NO rebota.** Un rol desconocido, vacío o todavía sin leer de `sessionStorage` va a `/catalogo/<marca>/pedidos`. El modo de fallo aceptable es mandar a alguien a una lista que puede ver, nunca a una que le va a dar 403.
> - `adminHref` pasó a vivir en **`MARCA_THEME`** (las 4 marcas), para que el botón y el «Administrar» del hub salgan del mismo lugar. Hay candado que compara los dos.
> - **El techo de 3 acciones de la confirmación (5-jul) sigue valiendo en el camino normal**: con el pedido ya en Switch no hay «Enviar», así que quedan exactamente tres. Las cuatro solo aparecen cuando el envío falló o todavía no salió, y ahí «Enviar» es lo que la persona vino a hacer. **«Ver PDF» y «Volver al catálogo» no se tocaron.**
>
> ### Y CUATRO TEXTOS QUE SE FUERON (aprobados por Daniel uno por uno)
>
> | dónde | lo que decía |
> |---|---|
> | `CheckoutClient` + `PedidoDetalleClient` | *"La venta se le acredita a esta persona."* — el rótulo dice **Vendedor** y debajo está el nombre |
> | `PedidoDetalleClient` (pie del envío) | *"Se crea de verdad en Switch (BOSTON). Si sale mal, hay que borrarlo a mano en el panel de Switch."* — las dos salidas están a la vista con sus nombres |
> | `PedidoDetalleClient` (modal de ocultar) | *"El pedido sigue en Switch como #4821 — aquí solo se oculta de la lista. Para anularlo de verdad, hazlo en el panel de Switch."* |
> | `CatalogoFilters` | *"Escribe un precio y ves solo ese. El «hasta» se llena solo."* — los campos ya dicen desde/hasta |
>
> 🔴 **SE FUE EL PÁRRAFO, SE QUEDÓ EL DATO.** Del modal de ocultar sobrevive el **número**: el título ya pregunta *"¿Ocultar … de la lista?"* y el botón que lo abre dice *"Ocultar de la lista (el pedido sigue en Switch)"*, así que lo único que el párrafo traía y no estaba en ningún otro lado era `#16-000000503` — y eso no es explicación, es con lo que se busca en Switch. Queda como `En Switch como #16-000000503.`
>
> 🔴 **LO QUE **NO** SE PODÓ, y que nadie lo "termine" después** — los tres tienen candado propio en la sección `EN_PANTALLA` de `poda-textos-cxc-multifashion.test.ts`, y mutación:
> - **`no aparta mercancía`** pegado al botón de Cotización: **no es explicación, es el dato** que decide cuál se toca. Sigue con su candado de LARGO (≤4 palabras, ≤24 caracteres).
> - **"Este pedido reemplaza al PED-XXX. Borra el pedido #… en el panel de Switch para no duplicar"**: frena una acción.
> - **"No tienes vendedor de Switch asignado"**: es la salida de un 422, no una descripción.
>
> ### Medición
>
> **`BASE=… ETAPA=despues node scripts/_medir-comprobantes-anchos.mjs`** — el navegador **ABORTA cualquier petición que no sea GET/HEAD**. Esta medición pasa por pantallas con botones de borrar, de exportar y de **MANDAR A SWITCH**, y desde el 25-ago tocar una salida MANDA sin ventana en el medio: el script no las toca, pero medir no puede depender de que nadie se equivoque. **Escrituras bloqueadas: 35 · mandadas a Switch: 0.**
>
> Contra el build de producción, con datos de producción, **4 marcas × 4 anchos (390 · 834 · 1024 · 1440)**, con TODOS los meses desplegados, y **CONTRA `origin/main` corriendo EL MISMO ARCHIVO** (`ETAPA=antes`; dos scripts distintos no comparan nada):
>
> | panel, por marca | arrastre | recorte @390 | recorte @834/1024/1440 | táctil <44 | texto <12 |
> |---|---:|---:|---:|---:|---:|
> | `origin/main` | 0 | 217 · 209 · 218 · 214 | **0 · 0 · 0** | 57 · 3 · 63 · 12 | 0 |
> | esta rama | 0 | 217 · 209 · 218 · 214 | **0 · 0 · 0** | 57 · 3 · 63 · 12 | 0 |
>
> **Re-medido el 25-ago-2026 con los TRES chips: los recortes siguen IDÉNTICOS** (217 · 209 · 197 · 218 · 214), 0 arrastre en las 16 celdas, **6 columnas** en las 4 marcas × 4 anchos, y el alto de la caja de chips **no cambió** (96 px en 390, 44 px en 834/1024/1440 — los mismos que con cuatro). Los táctiles del contenedor bajan (reebok 57→51, tommy 63→51) **solo porque el chip por defecto muestra menos filas**, no por markup nuevo. **1 toque de la confirmación a la lista en las dos etapas.**
>
> **IDÉNTICO en las 16 celdas**: la fila de filtros vive ARRIBA del contenedor de la tabla, así que la caja que se mide no cambió ni un píxel. El recorte de 390 px es el `overflow-x-auto` que la tabla ya declaraba —arrastrarla ES el mecanismo— y está en main igual. Los táctiles <44 son los **PRE-EXISTENTES** (las casillas de 16 px y los botones «Editar»/«Eliminar» de 28 px de alto), en código que este cambio no toca.
>
> **La confirmación crece 56 px hacia ABAJO y nada más** (main 396/319/319/319 → esta rama 452/375/375/375; Calvin 439/383 → 495/439): **0 arrastre · 0 recorte · 0 táctil <44 · 0 texto <12** en las 4 marcas × 2 roles × 4 anchos, con el botón a la vista en los cuatro.
>
> **El filtro se toca y se comprueba que FILTRA**: en cada marca y cada ancho el script toca «Pedidos», «Cotizaciones» y «Borradores» y exige que las filas visibles sean **exactamente** el número que el propio chip muestra.
> - 🔴 **Y que los tres SUMEN el universo vivo — que ya no se puede leer de la pantalla.** Sin «Todos», las filas que se ven al cargar NO son el universo (son solo los pedidos). La vara se pide aparte a `/api/catalogo/<marca>/pedidos-unificado`, que lee la vista (`deleted = false`), y contra ÉSA se compara la suma. **Si algún criterio dejara una fila afuera, el medidor lo dice.**
> - **El chip «Borradores» se compara contra el `status` de la base, fila por fila**, con los números de pedido en el mensaje de error: si diera otra cosa, estaría contando filas borradas.
> - 🩸 **El «antes» se venció y daba 20 rojos que no eran del cambio.** `ETAPA=antes` exigía que la pestaña dijera «Pedidos» y contaba el camino de 4 toques — **pero el #603 YA está en `origin/main`**, así que main dice «Comprobantes» y tiene el botón de un toque. Se corrigió: las dos etapas esperan lo mismo y **lo único que las separa es el filtro** (`antes` = 4 chips con «Todos» · `despues` = 3 sin él). Un baseline vencido acusa al cambio de algo que ya estaba.
> - 🩸 **Gotcha de medición que daba rojo por nada:** por defecto solo se abre el mes ACTUAL y **los 19 pedidos de Reebok son de julio** — el "¿llegué a la lista?" no puede preguntar por un `<table>`, porque con todos los meses cerrados no hay ninguno. Se pregunta por el filtro por tipo (o, en `antes`, por el buscador).
> - 🩸 **El contador del mes dice «pedidos» en `origin/main` y «comprobantes» acá**: el selector acepta LOS DOS, o `ETAPA=antes` no encontraría un solo mes y el rojo sería del renombre, no de la caja.
>
> ### Candados
>
> **`lib/comprobantes-nombre-y-tipo.test.ts`** (el nombre, la llave congelada, el choque de labels contra `modules.ts`, `tipoComprobante`, los conteos y el destino por rol) · **`components/comprobantes-panel.test.tsx` (CONDUCTA: monta la pestaña REAL y la confirmación REAL en las 4 marcas, TOCA los filtros, lee el DOM, cuenta las `<th>` y verifica que el vendedor no tenga NI UN enlace a `/catalogos/admin/`)** · `poda-textos-cxc-multifashion.test.ts` (los 4 textos que se fueron + los 3 que se quedan) · `lib/numeros-pedido.test.ts` · `components/pedidos-numeros-en-la-lista.test.tsx` · `lib/catalogo-roles.test.ts`.
> - **Verificado por mutación, 38 de 38 cazadas** (`bash scripts/_mutar-candados-comprobantes.sh`): la pestaña vuelve a llamarse «Pedidos» · **la key cambia y rompe el marcador** · el shell escribe el label a mano · el shell deja de dibujar la pestaña · los dos vacíos vuelven a hablar de pedidos · **el que no salió se cuenta como PEDIDO** · **toda cotización se cuenta como pedido** · se pierde el escalón tolerante del DDL · todo se cuenta como cotización · el filtro deja pasar todo · «Cotizaciones» y «Sin mandar» desaparecen · los conteos dejan afuera a los que no salieron · los conteos se quedan en cero · la pantalla esconde el filtro · la pantalla dibuja su propia lista · **el filtro se ignora al filtrar** · el filtro pisa al de ORIGEN · los conteos se calculan sobre lo ya filtrado · **la tabla gana una columna** · el vacío se escribe a mano · **el VENDEDOR sale apuntado al admin (403)** · el ADMIN pierde el panel · los roles se invierten · el rótulo y la dirección se separan · el destino pierde el `?tab=pedidos` · la confirmación pierde el botón · escribe la dirección a mano · deja de leer el rol · el `adminHref` de una marca apunta a otra · **vuelven los 4 textos podados** · **se borran los 2 avisos que se quedan**.
> - 🩸 **DOS mutaciones sobrevivieron en la primera corrida, y las dos eran candados flojos, no falsos positivos**: esconder el filtro con `hidden` y esconder el botón de la lista con el atributo `hidden` dejaban los elementos EN el DOM, y los tests los encontraban con `getByText`. Se arreglaron leyendo la capa que sí distingue: `getAllByRole` (que descarta `hidden`/`aria-hidden`) más un chequeo explícito de las clases que esconden. **Existir en el DOM no es estar en pantalla.**
> - 🩸 **La restauración del script va por COPIA, no con `git checkout`**: hay archivos NUEVOS en la rama y git aborta el comando entero sin restaurar nada — las mutaciones se apilarían y ninguna se probaría por separado. Y **no hay delimitador**: los textos viajan como ARGUMENTOS a python (argv), no dentro de un `s|de|a|` de sed — el código real tiene `||`, `/` y `#`, y cualquier delimitador se des-escapa, se come el archivo y deja un "SOBREVIVIÓ" falso.
>
> ### Lo que NO se tocó
>
> El **422 sin cliente** leído ANTES del documento · `normalizarDocumento` cayendo a PEDIDO ante cualquier basura · el **at-most-once** `(order_id) WHERE estado <> 'error'` · el aviso de Telegram (📝 vs 📦) · el pedido del **LINK público** · el motor único de envío y `/apicotizacion/terminar` · los dos números de la lista (#593) · el Excel, su hoja «Pedidos», sus columnas y el orden de las filas · la lista del vendedor y su «← Volver a Pedidos» · el modal de eliminación masiva · **Joybees sigue siendo espejo exacto de Reebok y no se tocó nada propio de Reebok**.


---

## 🔴 Pedidos — EL CLIENTE SE ELIGE, NUNCA VIENE PUESTO (14-ago-2026)

> El checkout del catálogo nacía con **`Contado` PUESTO** y "Enviar a Switch" no exigía tocar nada: se armaba el pedido, se apretaba, y salía a nombre de Contado sin que nadie lo notara. Daniel, textual: ***"Que arranque vacío y el botón apagado hasta elegir cliente."***
>
> 🩸 **EL DATO, medido contra producción y reproducido al centavo** (`DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-pedidos-sin-cliente.ts`, solo lectura): **18 de 33 pedidos vivos (55%) sin cliente real · 15 ya confirmados y en Switch por $53.124**, ocho de $1.000 o más (TOM-002 $16.920 · TOM-017 $16.722 · TOM-003 $7.254 · PED-017 $2.760 · PED-006 $2.100 · CKP-005 $1.704 · TOM-001 $1.584 · PED-015 $1.560). **Ninguno era venta de mostrador**, y los 18 son INTERNOS — ni uno del link.
>
> ⚠️ **"Sin cliente real" son DOS formas del mismo olvido:** `cliente_switch_id` en NULL (4 pedidos) **o** apuntando al cliente de mostrador (14). Contar solo los NULL da 4 de 33 y esconde el problema.
>
> ### Las dos mitades del arreglo
>
> **1. El checkout arranca VACÍO.** `useState<Cliente | undefined>(undefined)`, la caja dice **"Elige el cliente"** en ámbar y el botón va apagado **diciendo qué falta** (*"Falta: elegir el cliente"*, el patrón de Guías: apagado Y explicado, no un toast por vez). 🔴 **Contado NO desaparece** — sigue primero en la lista, rotulado **"Contado (venta de mostrador)"** con todas las letras, pero hay que TOCARLO; dejó de decir "(default)" porque ya no lo es.
>
> **2. En el detalle el cliente es UNO SOLO.** Había DOS nombres que no se hablaban: el título era un `<input>` de texto libre con sugerencias y más abajo una caja aparte "Cliente de Switch" cuyo "Cambiar" NO tocaba el título. Medido: **PED-004 quedó con `client_name = "CITY MALL PASO CANOA"` y `cliente_switch_id = null`** — el nombre correcto en pantalla y NINGÚN cliente atrás. Ahora manda el picker: al elegir se guarda el cliente **y** se escribe el título (por `clientNameRef`, el mecanismo que este archivo ya usa para que el guardado nunca mande un valor viejo).
>
> ### ⚠️ LA EXCEPCIÓN REAL: EL LINK PÚBLICO, y no se rompe
>
> En un pedido del link no hay sesión que aporte cliente: la persona escribe su nombre a mano y el sistema le asigna el mostrador de la empresa (`publico-switch-actor`, código TCKCTA). **Eso es la regla del sistema, no un olvido** — medido: **PED-022 vive con `client_name = "Nathalie"` y `cliente_switch_id = 1`**. Ahí el texto libre se queda y el envío no se traba.
> - **El origen se mira por `origen_original` Y por `origen_short_id`**, nunca por uno solo: el primero solo viaja en el select base de **Reebok**, así que mirarlo solo dejaría a Joybees/Tommy/Calvin leyendo un pedido del link como interno y **cerrándole el campo al cliente**.
>
> ### 🔴 EL CANDADO QUE NO SE PUEDE SALTEAR VIVE EN EL SERVIDOR
>
> `handlePostEnvio` responde **422** si un pedido interno no tiene cliente. Hacía falta porque justo debajo hay **tres redes que INVENTAN un cliente cuando falta** (el fallback del piloto Reebok y `resolvePublicoSwitchActor`) — exactamente cómo los 15 pedidos se fueron a Switch. **Esas redes NO se retiran**: siguen sirviendo para el pedido del link, que es para lo que se hicieron.
> - ⚠️ **Un candado viejo CAMBIÓ DE DIRECCIÓN**: `catalogo-paridad-enviar-switch.test.ts` exigía que un pedido interno sin cliente cayera al Contado del piloto. **Eso ERA el agujero.** Ahora exige 422, y un test nuevo (con `origen_short_id`) prueba que el fallback sigue vivo para el link.
> - ⚠️ **Los `return` de guarda del NAVEGADOR son segunda capa y NO son verificables por mutación**: React no despacha el click de un botón deshabilitado ni forzándole `disabled = false` (medido). Está dicho así en el código; el candado es el del servidor.
>
> ### 🔴 CONTADO PASA A USAR EL ID REAL — y el destino NO se movió
>
> `null` significaba las DOS cosas a la vez ("elegí mostrador" / "nadie eligió"), y con esa ambigüedad no hay forma de exigir una elección deliberada. Ahora `GET /[marca]/clientes-switch` devuelve el `contado` de la empresa (código **TCKCTA**, el mismo que ya usa el link público) y elegirlo guarda un id.
> - **Verificado en las 4 empresas antes de mergear** (`scripts/_diag-contado-por-empresa.ts`, solo lectura): TCKCTA es **único** en cada una, **es el id 1 en las cuatro** (o sea que el cambio **no mueve el destino**, es idéntico al `1` escrito a mano), **no hay ningún otro cliente con nombre confundible** (0 candidatos), y las cuatro tienen facturación real de mostrador: `active_shoes "Contado"` 43 · `joystep "Contado"` 65 · `fashion_shoes "VENTAS LOCA"` 388 · `vistana "VENTAS"` 500 facturas.
> - 🩸 **La primera medición dijo "0 facturas" en las 4 y era EL SCRIPT**: preguntaba por `cliente_id`, columna que no existe (es `cliente_switch_id`), y devolvía 0 **sin error visible**. Un cero que parece un dato y no es ninguno.
> - **El mostrador se dice SIEMPRE con la misma frase** aunque en Switch cada empresa lo llame distinto: se toca "Contado (venta de mostrador)" y eso mismo se ve después. El nombre que viaja a Switch NO sale de ahí — lo lee el servidor del directorio.
> - **Efecto en las 4 marcas**: el picker es compartido, así que Reebok · Joybees · Tommy · Calvin se comportan igual. **Joybees sigue siendo espejo exacto de Reebok y no se tocó nada propio de Reebok.**
>
> ### Medición
>
> **Los 3 anchos (+ el iPad acostado), en el navegador contra el build de producción y con pedidos REALES** (`BASE=… node scripts/_medir-cliente-pedido-anchos.mjs`, solo lectura, 5 estados): **390 · 834 · 1024 · 1440 → las cajas del cliente dan 0 px de arrastre, 0 recorte, 0 táctil <44 y 0 texto <12px** en los 20 casos. El script **falla** si no encuentra "Elige el cliente", el "Falta:", el botón apagado o el nombre del pedido del link.
> - 🔴 **Los tocables <44px que quedan en el resto de la pantalla se COMPARARON contra `origin/main`** (`scripts/_medir-tactiles-comparar.mjs`, mismo script en las dos ramas): **main 42 · esta rama 39**, y la ÚNICA diferencia es que este cambio **quitó 3** (el input de texto libre del pedido interno). Todo lo demás —`← Catálogo`, `← Volver a Pedidos`, la `x` de quitar línea, `Eliminar pedido`, el precio por pieza y **los inputs de cantidad de 48×26 / 56×26**— está **idéntico en main: es PRE-EXISTENTE y NO se tocó** (Daniel no aprobó arreglarlo; los inputs de cantidad son el hallazgo conocido de Tommy/Calvin/Joybees).
> - 🩸 **Dos falsos hallazgos del MEDIDOR, no del producto:** `innerText` **no incluye el valor de un `<input>`**, así que acusaba al pedido del link de haber perdido "Nathalie" con el campo escrito; y el caso "pedido del link EDITABLE" **no se puede simular en el navegador** — al neutralizar el candado de Switch el autoguardado dispara un PUT, el SERVIDOR (que sí sabe que el pedido está en Switch) responde 409 y el candado vuelve. Se retiró del script y se dice de frente: ese caso lo cubre el candado de conducta. **En el estado REAL no sale ningún PUT, ni acá ni en main** (medido en las dos ramas).
>
> ### Candados
>
> `src/__tests__/components/pedido-cliente-obligatorio.test.tsx` (19) y `cliente-elegido.test.ts` (16). **Son de CONDUCTA**: renderizan las pantallas reales, tocan los botones reales y cuentan qué salió por `fetch` — el `disabled` y el `return` se pueden mutar sin cambiar una palabra del archivo.
> - **Verificado por mutación, 16 de 16 cazadas** (`bash scripts/_mutar-candados-cliente-pedido.sh`): el checkout vuelve a arrancar con Contado · el botón deja de exigir lo que falta · deja de decir qué falta · Contado vuelve a un id escrito a mano · el detalle deja mandar sin cliente · elegir cliente deja de escribir el título · vuelve el texto libre en los internos · el picker vuelve a preseleccionar el mostrador · **el SERVIDOR deja pasar un pedido sin cliente** · el servidor deja de leer el origen · el origen se mira solo por `origen_original` · el pedido del link se traba · `null` vuelve a contar como elegido · el selector ignora el mostrador real · las dos etiquetas.
> - 🩸 **LA PRIMERA CORRIDA DIO 16/16 **MINTIENDO**.** El script restauraba con `git checkout` y `cliente-elegido.ts` es un archivo NUEVO: git **aborta el comando entero** y no restaura NADA, así que las mutaciones se **apilaban** y ninguna se probó por separado. Con restauración por copia el resultado honesto fue **13/16**, y las 3 brechas se cerraron (una era un barrido de texto cuyo regex no matcheaba nunca). **Un verificador que miente en verde es peor que no tenerlo.**
>
> ### 🔴 Lo que NO se tocó
>
> El flujo de ~10 toques a 3 (#504/#506/#508/#509) · **Duplicar sigue preguntando el cliente y agregándolo DE UNA, sin botón de confirmar** · el modo pedido `?agregarA=` · **los 15 pedidos que ya están en Switch NO se corrigen desde acá** (es data en Switch y la decide Daniel aparte) · y nada más del informe de auditoría (precio por pieza/bulto, ITBMS, cantidad escribible en el catálogo público, renombrar los productos de Tommy).


---

## 🔴 Catálogos — EL CÓDIGO DESEMPATA EL ORDEN, y el público ordenaba DISTINTO que el vendedor (17-ago-2026)

> Daniel, mirando el catálogo de **Calvin**: los productos `KCMEENA683`, `KCMEENA004`, `KCMEENA-A210` y `KCMEENAA962` salían **desperdigados** entre los `HW0HW…` y los `KCTO…` en vez de juntos.
>
> 🩸 **LA CAUSA: el orden "Relevancia" ordena por categoría → género → NOMBRE, y los cuatro se llaman igual (`Women-Flip Flops`).** Al empatar el nombre, el orden final quedaba **como viniera de la base**, o sea arbitrario. **El código nunca se miraba.**
>
> **El nombre no distingue, así que tampoco puede ordenar. Medido contra producción el 17-ago-2026:** Tommy tiene **498 productos con solo 19 nombres distintos** (103 dicen `Women-Sneakers`, 99 `Women-Flip Flops`) y Calvin **81 con 5**. O sea que en Tommy **el 100% de las tarjetas empata con alguna otra**.
>
> ### El arreglo: el SKU es el desempate FINAL
>
> `compararCodigos()` (`src/lib/catalogos/orden-codigo.ts`, módulo PURO) va **al final de todo**, después de categoría, género y nombre. **No mueve nada que hoy no empate**, y está medido: la secuencia de SECCIONES es idéntica antes y después en las dos marcas — ningún producto sale de su categoría/género.
> - **También en "Nombre A-Z"**, donde el empate es todavía más obvio.
> - 🔑 **Y también en "Precio: menor a mayor" y "mayor a menor".** Dos productos del mismo precio también quedaban arbitrarios; es el mismo defecto y va al final igual, así que no cambia el orden de nada que tenga precios distintos.
> - 🔴 **SON CUATRO `.sort()`, no uno.** Cada pantalla tiene **DOS pipelines** —la lista plana y los GRUPOS (`groupByModel`, que es como se dibuja Joybees)— y el de grupos desempata por el `baseSku` del grupo. Tocar uno solo dejaba la vista agrupada igual de desordenada; hay candado por mutación para los cuatro.
>
> ### 🔴 HALLAZGO — el MISMO catálogo salía en orden DISTINTO según quién lo mirara
>
> Medido en el navegador contra `origin/main`, mismo build, mismos datos, catálogo de Calvin:
>
> | | vendedor `/catalogo/calvin` | público `/catalogo-publico/calvin` |
> |---|---|---|
> | dónde caen los 4 `KCMEENA` | repartidos entre **#25 y #33** | repartidos entre **#12 y #31** |
> | orden entre ellos | `683 · 004 · -A210 · A962` | `A962 · 004 · 683 · -A210` |
>
> **El código de orden de las dos pantallas era idéntico byte a byte** — lo que difería era el orden en que cada endpoint devolvía las filas, y al empatar el nombre ESE orden era el que mandaba. O sea: el vendedor compartía un link y el cliente veía el mismo catálogo en otro orden. En Tommy el efecto es mayor: la familia `FW0FW08…` salía en **44 corridas** en el público contra **9** en el vendedor, y las dos desordenadas. **Ahora las dos dan #28–#31 y el mismo orden.** No se unificó nada a la fuerza: el desempate hace que el orden deje de depender de la base, y con eso las dos superficies coinciden solas.
>
> ### ⚠️ El ADMIN ordena distinto A PROPÓSITO — se dice, no se fuerza
>
> `/catalogos/admin/[marca]` **no** usa el orden del catálogo: ordena por NOMBRE a secas, y la vista de lista pone primero lo que tiene stock. Es una **cola de trabajo, no una vitrina** (se entra a subir fotos, no a vender), así que ese criterio **no se tocó** — unificarlo con el catálogo es una decisión de Daniel, aparte. Lo que sí se le puso es el mismo **desempate por código**, porque tenía el mismo defecto: con 19 nombres para 498 productos, "ordenado por nombre" dejaba bloques enteros en el orden de la base. En `ProductosTarjetas` era peor todavía — `localeCompare(…, { sensitivity: "base" })` devuelve **0** para todo un bloque de nombres iguales, así que no era orden alfabético de nada.
>
> ### 🔑 LA COMPARACIÓN ES CRUDA Y EN MAYÚSCULAS — se REUSÓ, no se escribió de nuevo
>
> El repo ya tenía esta decisión tomada en `ordenarCodigosAZ` (`fotos-faltantes.ts`, el Excel de la plantilla B2B): **nada de `localeCompare` con opciones**, porque el resultado tiene que ser el mismo en el navegador de Daniel, en Node y en el test, y **las tablas de ICU no lo garantizan**. El cuerpo se **MUDÓ** a `orden-codigo.ts` sin reescribirlo y `ordenarCodigosAZ` ahora lo importa: dos formas de ordenar un código es una que se corrige y otra que se queda vieja.
>
> 🔴 **EL GUIÓN NO SE QUITA, Y ESTÁ MEDIDO, NO SUPUESTO.** Tentaba normalizar (`KCMEENA-A210` contra `KCMEENAA962`), pero al ordenar los **579 SKU reales** de Calvin + Tommy en crudo, **los 41 códigos con guión ya caen pegados a su propia familia**: `KCMEENA-A210` justo antes de `KCMEENA004`, `T1A8-32600-313` justo antes de `T1A8-32600313`, `FW0FW06158-DW5` entre `FW0FW06149-DW5` y `FW0FW06447DW5`. Quitarlo sería maquinaria que no cambia **ni un caso real** y que estrenaría una segunda idea de "qué es el mismo código" al lado de la regla de fotos, donde pegar por parecido está **PROHIBIDO** a propósito (la lección de `Outlet Duty Free N2` vs `N3`). Tampoco es numérico (`numeric: true` / `Intl.Collator`): los segmentos de estos SKU son de ancho fijo, así que en crudo `T30400-800 < T30408-800 < T30547-800` ya sale bien, y la comparación numérica es justo la que depende del entorno.
>
> ⚠️ **Una familia PUEDE quedar partida y estar BIEN.** `FW0FW08…` vive en **5 secciones** de Tommy (sneakers · flip_flops · sandals · shoes · slippers de mujer) y se parte donde cambia la sección, porque **categoría y género le ganan al código**. Medido: de las familias que quedan partidas después del cambio, **el 100% cruza sección** — dentro de una sección no queda ninguna.
>
> ### La medición
>
> **Contra producción, el caso de Daniel** (`DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-catalogo-orden-codigo.ts`, solo lectura, corre el `.sort()` REAL sobre las filas reales):
>
> | | Calvin (81 prod, 5 nombres) | Tommy (498 prod, 19 nombres) |
> |---|---|---|
> | los 4 `KCMEENA` | **#17 · #22 · #37 · #39 → #32 · #33 · #34 · #35** | — |
> | familias (prefijo 7) partidas | **15/18 → 2/18** | **33/38 → 11/38** |
> | secuencia de secciones | **idéntica ✅** | **idéntica ✅** |
>
> **Los 3 anchos (+ el iPad acostado), en el navegador contra el build de producción, con datos de producción y CONTRA `origin/main`** (`BASE=… node scripts/_medir-catalogo-orden.mjs`, solo lectura, 4 superficies × 4 anchos): **390 · 834 · 1024 · 1440 → 0 px de arrastre en los 16 casos**, y los `KCMEENA` **pegados en #28–#31 en los cuatro anchos, en el vendedor Y en el público**. Los recortes (el `DIV.space-y-3` de los filtros a 1024+), los tocables de 217×38 ("Agregar" a 1440) y los textos de 10 px ("Bulto de 12") son **PRE-EXISTENTES y salen IDÉNTICOS en main, uno por uno**: este cambio **no agrega ni quita un solo elemento del DOM** — reordena tarjetas dentro de un `grid-cols-2 sm:3 lg:4 xl:5`, donde el ancho de la columna lo pone el contenedor (`1fr`), no el contenido.
> - 🩸 **Gotcha de medición que daba 0 elementos y verde sin haber mirado nada:** `CatalogoAuthGuard` **NO mira el rol** — mira `sessionStorage.fg_modules`. Sin sembrarlo, la pantalla del vendedor redirige al login y el script mide una pantalla vacía. Por eso **falla** si encuentra menos de 10 tarjetas.
>
> ### Candados
>
> **`src/__tests__/components/catalogo-orden-por-codigo.test.tsx` (10).** Son de **CONDUCTA**: montan `CatalogoVendedorPage` y `CatalogoPublicoPage` de verdad, con los cuatro `KCMEENA` REALES y sus vecinos REALES en el orden en que los devolvía la base, y **leen el orden en que se pintaron las tarjetas**. Un barrido de texto sobre el .tsx no puede ver que los DOS pipelines queden ordenados, y encima se cumple con su propia explicación — este repo ya lo pagó cuatro veces; los barridos que quedan **borran los comentarios primero**.
> - **Verificado por mutación, 11 de 11 cazadas** (`bash scripts/_mutar-candados-orden-codigo.sh`): la lista plana del vendedor pierde el desempate · la vista AGRUPADA (Joybees) lo pierde · la lista plana del público · la agrupada del público · "Nombre A-Z" · "Precio ascendente" · el admin lista · el admin tarjetas · el comparador se come los guiones · el comparador vuelve a `localeCompare` · el comparador siempre devuelve 0.
> - 🩸 **El script de mutación restaura por COPIA, no con `git checkout`**: `orden-codigo.ts` es un archivo NUEVO y git aborta el comando entero, así que las mutaciones se apilarían y ninguna se probaría por separado — un verificador que miente en verde es peor que no tenerlo.
>
> ### Lo que NO se tocó
>
> **Reebok es espejo de Joybees y no se tocó nada propio de Reebok** (el desempate entra por el componente único de las 4 marcas). **La visibilidad no se movió** (`disponibleVendible`, `active`, `oculto_manual`): el conteo de tarjetas es **idéntico en main y acá — 76 en Calvin, 435 en Tommy, en los 4 anchos**. Tampoco el modo pedido, ni el carrito de sesión, ni los precios.


---

## Catálogos — auto-recorte del fondo al subir (12-ago-2026)

> **Las fotos del banco B2B de PVH vienen con el producto CHICO abajo y un fondo enorme; en la tarjeta se ven diminutas al lado de las buenas.** Caso real de Daniel: `HW0HW02958AEF.jpg`, **1364×1819**, una sandalia que ocupa el **9% del área** y el resto es fondo gris en degradado. Fuente única: **`src/lib/catalogos/foto-recorte.ts`** — núcleo PURO (fondo, caja, guardas, plan de encuadre) + un envoltorio de canvas que solo dibuja lo que el plan ya decidió.
>
> **Entra en el pipeline COMPARTIDO de las 4 marcas**, en los dos caminos: `compress()` de `photoUpload.ts` (subida individual y masiva) y `recortarYEncuadrar()` de `zip-b2b-client.ts` (ZIP del banco). Después sigue la compresión de siempre (1600 px, JPEG 0.82).
>
> 🔴 **FAIL-OPEN, y es la regla que manda: el recorte NUNCA puede bloquear ni limitar una subida.** Ante cualquier duda se sube LA ORIGINAL sin tocar. Cinco motivos, cada uno con su nombre en `MotivoNoRecorte`: `muy-chica` (lado menor < 300 px) · `fondo-no-uniforme` · `sin-producto` · `toca-bordes` (los 4) · `ya-encuadrada` (la caja ya llena ≥85% de ancho **y** alto). Dos capas más: `recortarEnCanvas` atrapa CUALQUIER excepción y devuelve `null`, y el `catch` de `compress()` devuelve el archivo original.
> - 🩸 **Fail-open no es solo "no revientes".** Una foto que el detector prefirió no tocar tiene que seguir **comprimiéndose a 1600 como antes**. Un `return file` metido entre el recorte y el resize se ve inofensivo (sube la original) y en realidad subiría fotos de 5 MB sin comprimir a todo el catálogo — **esa mutación sobrevivía a los candados y por eso existe el test que exige que el resize sea ALCANZABLE**, no solo que el texto esté en el archivo.
> - **Daniel preguntó explícitamente si esto tocaría las fotos normales.** No: solo entra cuando el fondo es uniforme **Y** el producto ocupa una parte chica. `ya-encuadrada` es lo que protege a las buenas de un re-encode que solo pierde calidad.
>
> 🩸 **Por qué no alcanzaba `detectarBBox` de `fotos-b2b.ts`** (el detector que el ZIP ya usaba): estima el fondo como el promedio de las 4 esquinas con tolerancia fija 12, y el fondo de estudio de PVH es un **degradado vertical** — las puntas difieren del promedio en más de 12, TODO el fondo se marca como producto, la caja da la imagen entera y el recorte es un **no-op**. Acá el fondo se estima **POR FILA** (banda izquierda + banda derecha, interpolado a lo ancho), que absorbe el degradado vertical **y** el horizontal sin inventar nada. El ZIP prueba primero `medirRecorte` y **cae al detector de siempre** si no es confiable.
>
> **Cómo distingue un fondo de estudio de una foto de local: la RUGOSIDAD del borde**, no su rango. `rugosidadBorde` = promedio de |Δ luminancia| entre píxeles CONSECUTIVOS recorriendo el borde como un camino continuo. Un degradado de estudio da **<1,5** (cambia suave aunque el rango sea grande); una escena da 8-40. El umbral es **4**. `RANGO_BORDE_MAX = 230` es un techo de SANIDAD, no el detector: medido sobre las 33 fotos reales del banco CK, un producto oscuro que asoma al borde sobre fondo blanco llega a **190-215** con rugosidad baja — un rango apretado habría rechazado fotos buenas.
>
> **El encuadre no distorsiona ni agranda:** margen PAREJO de **8%** del lado mayor de la caja en los 4 lados, **una sola escala** para ancho y alto (mirar solo el ancho dejaba salir lienzos de 2320 px de alto), techo 1600. El margen sale de la FOTO REAL —conserva el degradado, sin costuras— y solo lo que se pasa del límite se rellena con el color promedio del borde.
>
> **Medido sobre las 33 fotos reales de `Downloads/CK 2`** (`DIR=… OUT=… npx tsx scripts/_test-recorte-local.ts`, no toca red ni DB): **33/33 recortadas, ocupación previa 8%–35%**. Ninguna cayó en el fail-open porque ninguna era dudosa — no es que el detector sea permisivo. Antes/después en `~/.claude/jobs/5b66fe8c/tmp/recorte-antes-despues/` (`index.html`).
>
> **Re-proceso de las fotos YA subidas: `npx tsx scripts/_recortar-fotos-calvin.ts [--confirm]`** (dry-run por defecto). ⚠️ **SOLO CALVIN** — la tabla y el prefijo van FIJOS, sin parámetro de marca a propósito: Tommy/Reebok/Joybees ya están curadas a mano. Criterio: el MISMO módulo puro, y solo si la caja ocupa menos de **`OCUPACION_REPROCESO` = 50%** del área. Respalda cada original antes de escribir (si el backup falla, esa foto NO se toca), re-sube al MISMO path —la URL no cambia— **renovando el `?v=`** (sin eso, con `cacheControl` de 1 año el navegador seguiría mostrando los bytes viejos y el arreglo sería invisible), y **verifica por HTTP** (200, `image/*`, >5 KB, y que el producto ahora llene ≥70% de la dimensión que manda).
>
> Candado: `src/__tests__/lib/foto-recorte.test.ts` (25 casos con imágenes SINTÉTICAS píxel a píxel — producto abajo sobre degradado → recorta; centrado/lleno → no toca; toca los 4 bordes → no toca; fondo ruidoso → no toca; casi del color del fondo → no toca). Verificado por mutación, **10 de 10 cazadas**: quitar el `catch` de `recortarEnCanvas`, apagar cualquiera de los 4 guards, romper el fail-open de `compress`, saltarse la compresión cuando no hay recorte, que el ZIP deje de caer al detector de siempre, margen desparejo y escala por eje (distorsión).


---

## Catálogos — fotos faltantes (30-jul-2026)

> **El aviso de "entraron productos NUEVOS sin foto" es un delta de ESTADO, no el resultado de una corrida.** Daniel, textual: *"meti productos nuevos al sistema, y no me llega, almenos no instantaneo, q hay productos nuevos para subir fotos"*. Fuente única: `src/lib/catalogos/fotos-nuevos.ts` (I/O) + `planAvisoNuevos` en `fotos-faltantes.ts` (puro).
>
> 🩸 **El aviso ya existía y era imposible que llegara, medido contra producción.** Estaba atado al evento de una corrida: el motor empujaba el código a `nuevosSinFoto` en el MISMO `if` que hacía el INSERT, y solo los 3 routes de cron leían ese resultado. Los 60 productos de Reebok entraron en `2026-07-28T17:23:23` con **`triggered_by='manual'`** —el botón "Actualizar ahora"— y **`/api/admin/sync-now` nunca mandaba ese mensaje**. Las 6 corridas del cron de esos días (12:10 y 17:00 UTC) registraron `records_inserted = 0`: para cuando llegó el cron las filas YA existían y caían por la rama "producto conocido". O sea, **el único camino por el que entraron era justo el que no avisaba, y el aviso no se atrasaba: se perdía para siempre.** (61 en la captura = 60 nuevos + 1 anterior; ya los subió, hoy Reebok está en 0.)
>
> **Se cambió la PREGUNTA:** de "¿esta corrida insertó algo?" a "¿hay productos sin foto más nuevos que la última vez que avisé?". Consecuencias, todas buscadas:
> - **Cubre los 5 caminos**: los 3 crons de catálogo, `sync-now` y los 3 colaterales de `switch-reconciliacion`. Candado: `catalogos-aviso-nuevos-sin-foto.test.ts` incluye un **barrido estático** — un archivo que dispare `syncCatalogo{Reebok,Joybees,Tommy}` sin llamar a `avisarNuevosSinFoto` pone el build ROJO, y otro test prohíbe volver a leer `nuevosSinFotoTotal` desde los routes.
> - **No repite.** Los 61 de siempre no vuelven a sonar a diario (eso lo cubre el resumen semanal de los lunes).
> - **Marca de agua en `cron_heartbeats`**, una fila por marca (`catalogos-fotos-nuevos:<marca>`) — **sin DDL**: es la misma tabla que ya guarda "cuándo salió bien esto por última vez". Los 3 nombres están en `HEARTBEATS_NO_CRON` para que ni el watchdog Telegram ni health-crons los vigilen como crons (nadie los programa → estar stale es su estado normal). Se repiten como literales en `cron-telemetry.ts` a propósito: importar `fotos-nuevos.ts` desde ahí arrastraría `MARCAS_CONFIG` a toda la telemetría. La coherencia la sostiene el test.
> - **La marca de agua nueva es `max(ahora, created_at más nuevo)`**, no `ahora` a secas. Una fila insertada MIENTRAS corría la consulta tiene `created_at > ahora`: entra en este aviso y, sin el `max`, volvería a entrar en el siguiente → el mismo producto anunciado dos veces.
> - **Avanza SOLO si Telegram aceptó el mensaje.** Si falla, el aviso se reintenta en la corrida siguiente en vez de perderse. Y una marca de agua **ilegible ≠ "nunca se avisó"**: si el select falla no se hace nada (tratarlo como `null` sembraría de nuevo y se comería el aviso en silencio).
> - **Primera pasada SIEMBRA EN SILENCIO** (y con la tabla vacía no siembra: escondería el atraso real). Después del deploy, el primer producto nuevo es el primero que suena.
> - **Paginado obligatorio** (`leerTodoPaginado`, orden por `sku`): hoy son 490 filas, pero un aviso ciego a partir del producto 1.001 sin error ni señal es el bug de `db-max-rows` que este proyecto ya pagó. ✅ **`fotos-resumen.ts` (resumen semanal) TAMBIÉN pagina desde el 12-ago-2026.** Tenía el mismo bug latente: hoy la marca más grande es Tommy con 453 activos, pero desde la fila 1.001 el aviso diría *"faltan N fotos"* quedándose corto, sin error y sin señal — **un aviso que subestima es peor que no tenerlo**. 🔴 **EL ORDEN DE NEGOCIO SE CONSERVA**: sigue mandando `disponibilidad` desc (lo más vendible primero, que es lo que se lee en el Telegram) y solo se le agrega `sku` como DESEMPATE — es `text UNIQUE NOT NULL` en las cuatro tablas, así que el orden queda total. Ningún número cambió: las 4 marcas están muy por debajo de 1.000 (products 126 activos · joybees 81 · tommy 453 · calvin 80).
> - **Canal 📊 NEGOCIO** (`enviarNegocio`, sin perilla de silenciar) y el texto de siempre (`buildNuevosSinFotoMsg`, no se tocó). Frecuencia sin cambios (2×/día por marca) — lo que le faltaba a Daniel no era otro horario, era que el clic manual avisara.
> - Para revisar contra producción sin spamear: `npx tsx scripts/_dryrun-fotos-nuevos.ts` (usa el MISMO `avisarNuevosSinFoto` con `dryRun`, no una segunda implementación).

> **El botón "Excel sin foto" sale con la forma de la plantilla del banco B2B.** Daniel: *"quiero que al descargar los codigos de fotos sin excel, se me ponga en orden de a-z en la columna b, para que asi se me descargue automatico (los numeros que aparecen en el excel no deberian de estar ahi, es solo la muestra)"*. Fuente única: `src/lib/catalogos/dash-busqueda-excel.ts`, usada por las 3 marcas.
> - Estructura MEDIDA sobre `Dash Search Template.xlsx` (no supuesta): hoja `DASHBOARD DE BUSQUEDA`, `B1` = "INSERTE ARTICLE NUMBER AQUÍ (máximo 200)" con fondo `FFC000`, `D1` = "COPIAR " combinada D1:K1, `A2:A201` contador, `B2:B201` los códigos, `D2` la expresión combinada D2:K17, anchos A=4 B=52.78 C=8.89 D=85.11. Los ART Number de muestra NO se copian.
> - **`D2` va con la expresión `"cod" OR "cod" OR …` YA RESUELTA como texto.** En la plantilla es una fórmula que apunta a una hoja auxiliar `DATA ` (A=`"`, B=código, C=`"`, D=` OR `, E=CONCAT acumulado); escribirla resuelta hace que el archivo sirva recién abierto, sin recalcular y sin arrastrar la hoja auxiliar. El flujo del portal es copiar esa celda en la barra de búsqueda de Dash, **no subir el archivo** — por eso una segunda hoja no molesta.
> - **DOS hojas, y la de la plantilla va PRIMERA** (es la que abre Excel). La hoja de detalle de siempre ("Sin foto", con descripción/categoría/stock) **NO se quitó**.
> - **Los códigos van como TEXTO**, no número: hay SKU con guión (`T1A8-32600-313`) y con ceros a la izquierda.
> - **Orden A-Z con comparación cruda en MAYÚSCULAS, sin `localeCompare`**: el orden tiene que ser el mismo en el navegador, en Node y en el test, y las tablas de ICU no lo garantizan.
> - **Más de 200 códigos → hojas extra** (`DASHBOARD DE BUSQUEDA 2`, …), porque 200 es el tope del portal.
> - Candados: `dash-busqueda-excel.test.ts` (incluye el viaje completo de escritura+lectura del `.xlsx`, no solo el objeto en memoria) y el `SheetNames` actualizado en `excel-exports-catalogos.test.ts`. Verificado además con **openpyxl** (parser independiente del que escribe).

> **¿Qué foto de Storage está EN USO? — criterio en `src/lib/catalogos/fotos-en-uso.ts` (puro).** Pedido de Daniel: *"revisa todas mis fotos del catalogo de fashion shoes tommy, y borra solo las que no esten en uso"*. **El módulo CLASIFICA y arma el plan; el borrado vive aparte, en un script que por defecto es dry-run**: una foto borrada no vuelve y Daniel subió 389 a mano. Informe: `npx tsx scripts/_diag-fotos-tommy.ts [--lista]` (read-only; sirve para las 3 marcas con `MARCA=`), que le da datos de producción al MISMO módulo que cubre el test, así que informe y candado no pueden contradecirse.
> - **Cuatro clases, y tres de ellas SÍ están en uso:** `EN USO` (su ruta exacta está en `image_url`) · `BANCO VIVO` (variante `_v/{sku}/{n}.jpg` de un SKU que existe — NO referenciada y eso es NORMAL: el selector de variantes las necesita) · `REEMPLAZADA` (objeto de nivel raíz cuyo SKU existe **y** ya tiene otra foto) · `HUÉRFANA` (no se ató a ninguna fila).
> - **Solo se propone borrar las REEMPLAZADAS.** Es la única clase donde el reemplazo es DEMOSTRABLE: la fila existe y tiene otra foto, así que borrar no puede dejar a ningún producto sin foto.
> - 🩸 **La HUÉRFANA NO se borra.** "No hay fila" no significa "no sirve", significa "no encontré la fila", y las dos formas conocidas de eso terminan con la foto necesitándose otra vez: (a) Switch deja de traer un artículo un rato —estar fuera del catálogo es el estado normal y reversible de un agotado—, y (b) un SKU con guión que se corrige en Switch (**precedente real: 12 SKU de Tommy perdieron la foto por eso**). El housekeeping semanal ya borra el caso acotado y verificable (`_v/{sku}/` de un SKU que desapareció, ver `variantes-housekeeping.ts`); acá no se amplía.
> - **Guard anti-catástrofe**, igual que el housekeeping: sin filas de la tabla no se propone NADA ("la query falló" y "la marca no tiene productos" se ven igual, y solo una es segura). Se le pasan **TODAS** las filas, activas e inactivas: un producto oculto o agotado conserva sus fotos.
> - **Tolera las 3 formas de nombre que existen de verdad** (medidas 30-jul-2026): `{skuStorage}.jpg`, `{skuNormalizado}` sin extensión (endpoint legacy `/upload` con SKU) y `{epoch}-{archivo}` (subida masiva legacy SIN SKU — el SKU va adentro del nombre). Ignorar la tercera fue el primer error de medición: daba 39 falsas huérfanas que en realidad son duplicados de productos vivos.
> - **Inventario de Tommy antes de la limpieza (30-jul-2026):** 2.667 archivos / 74,73 MB → **468 EN USO (16,31 MB) · 2.157 BANCO VIVO (52,74 MB) · 42 REEMPLAZADAS (5,67 MB) · 0 HUÉRFANAS**. Las 42 eran 39 subidas el 29-jul y re-subidas ~8 min después (el lote se subió dos veces) + 3 miniaturas de 7-11 KB del 27-jul.
>
> **EJECUTADO el 30-jul-2026 con el OK de Daniel: se borraron 2.199 archivos (58,41 MB) y Tommy quedó en 468 / 16,31 MB.** Dos tandas: primero las 42 reemplazadas, después las **2.157 alternativas del banco**. Lo segundo fue decisión suya, reafirmada tras advertirle dos veces que pierde la posibilidad de cambiar la foto: *"ya escogi la que utilizare, asi que ya no necesito tenerla como opcion"*. Herramienta: `npx tsx scripts/_borrar-fotos-reemplazadas.ts [--confirm]` (dry-run por defecto).
> - 🩸 **"Borrar las variantes de un SKU" es una frase que suena inofensiva y NO lo era: 383 de las 468 fotos elegidas VIVEN dentro de `_v/`.** El selector guarda en `image_url` la ruta de la variante elegida, no una copia aparte — barrer la carpeta habría dejado sin foto a 383 de 490 productos. Por eso `planBorradoAlternativas` opera por OBJETO, no por carpeta, y salva la elegida comparando la ruta exacta.
> - **Segura por construcción:** solo se borra la alternativa de un SKU con foto elegida **VIVA** (que `image_url` traiga una ruta no prueba que el archivo exista: se verifica contra Storage). Un SKU sin elegida viva conserva TODAS sus variantes. Garantía: **ningún producto puede quedar sin foto**. Medido: 468 → 468 en uso, "sin foto" 18 → 18, y 30 fotos al azar verificadas por HTTP (>5 KB, `content-type: image/*`).
> - **Última red independiente del criterio**, en el script: si alguna ruta de la lista aparece en `image_url` de algún producto, aborta sin borrar nada.
> - **El selector ya no deja un control muerto — y el primer intento NO alcanzó.** Daniel, con captura del producto `THS10159C000`: *"no me deberia de salir el boton de Cambiar foto si no hay opciones"*. El botón se pintaba con solo **EXISTIR** la carpeta `_v/{sku}/`, y tras la limpieza esa carpeta conserva UN archivo: **justamente la foto elegida**. Resultado: botón visible → clic → *"Este código no tiene más fotos guardadas"*. Enterarse DESPUÉS de tocar es exactamente lo que se quería evitar.
>   - **La pregunta correcta no es "¿hay carpeta?" ni "¿hay fotos?", es "¿hay alguna foto que NO sea la puesta?"** — `tieneAlternativas` / `contarAlternativas` en `variantes-paths.ts` (puras), alimentadas por el `image_url` que la pantalla YA tiene. El botón ahora dice cuántas hay: `Cambiar foto (2)`.
>   - ⚠️ **El costo era la trampa: saberlo exige el CONTENIDO de cada carpeta, y un `list()` por SKU serían 383 llamadas por carga de pantalla** — los metadatos de Storage viven en el mismo Postgres del negocio. Se resolvió con **`list-v2` + `delimiter: ""`**, que devuelve rutas completas de forma **recursiva**: todo el banco de una marca en **1 llamada** (Tommy: 383 objetos, 1 página, ~230 ms). **Mismo costo que el listado de carpetas que reemplaza.** No está en supabase-js: se llama por REST con las credenciales del MISMO client de la marca (`db.supabaseKey` + `db.storage.url`), nunca leyendo env aparte. Si `list-v2` fallara, se degrada al listado de carpetas con `exacto:false` y el cliente vuelve al comportamiento viejo (mostrar el botón) — **ante la duda se muestra de más, nunca se esconde una función que sirve**.
>   - **Verificado en el navegador contra el build de producción y datos de producción:** Tommy real → **0 botones en los 490 productos** (469 fotos renderizadas, así que el 0 no es "no cargó"); el mismo Tommy con el banco **como estaba antes de la limpieza** → aparece **1 botón, `Cambiar foto (2)`** en `THS10159C000` (vistas 1/6/13 menos la puesta). **Reebok y Joybees NUNCA tuvieron banco** (0 carpetas en `_v/`, medido) → ahí el botón tampoco se pinta, y no se les quitó nada: el control ya estaba muerto para ellas.
>   - ⚠️ **Hoy NO existe en producción ningún producto con alternativas** (Tommy quedó sin banco por decisión de Daniel; Reebok/Joybees nunca lo tuvieron). Por eso el caso positivo se verifica sirviéndole a la pantalla la forma exacta que tenía el banco antes de la limpieza, no inventando datos.
>   - Candado: 9 casos nuevos en `variantes-fotos.test.ts`, incluido el caso real `THS10159C000` (1 foto y ES la puesta → 0 alternativas) y que Reebok/Joybees conserven el botón cuando sí hay banco.
> - ⚠️ **Volver a tener alternativas = volver a subir el ZIP del B2B.** No hay vuelta atrás para las 2.157.
