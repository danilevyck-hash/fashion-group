> ### La limpieza — APLICADA el 2-sep-2026
>
> Daniel: *«la ficha de cliente por dirección se va. El directorio por dentro se va.»* Se marcaron **4.914 filas** con `deleted = true` (4.883 de Boston + 31 que Switch conoce en boston+ACS; **4.910 habían entrado el 28-jul**). Quedan **150**. Los **3 huérfanos se quedan** (`D-201`, `D-173`, `D-101`): Switch no conoce su código y `mundos.ts` ya explicó que esconderlos rompe el Directorio.
>
> **Soft delete y no `DELETE`**: la columna existe, todos los lectores del ranking, la ficha, el Directorio y el CXC filtran `deleted = false` (auditado), y es reversible con un `UPDATE`. `node scripts/_verif-clientes-master-boston.mjs` (solo lectura) reporta el estado y la regla.
>
> ### 🔴 Y LA FICHA POR DIRECCIÓN, que era la otra puerta abierta
>
> `/api/clientes/[codigo]` **servía y dejaba EDITAR** las 4.915 fichas de Boston: el GET y el PATCH miraban solo `deleted = false` y ninguno pasaba por la puerta de mundo — la única que filtraba era la página SSR. Igual `historial-mensual`, que devuelve el nombre y 25 meses de venta. Los tres preguntan ahora `esCodigoDelGrupo()` y contestan **404, el mismo que un código inexistente**: un 403 diferenciado sería un oráculo que confirmaría desde afuera qué códigos hay en la cartera de Boston. El guard **falla ABIERTO** en los tres casos de `soloClientesDelGrupo` (consulta caída · sin código · Switch no lo conoce), porque esconder de más es peor que mostrar de más.
>
# Post-mortems — Ventas, Referencia y Comisiones

> Movido de `cxc/CLAUDE.md` el 31-ago-2026 para bajar lo que se inyecta en cada sesión.
> **Nada se resumió ni se borró: el contenido es verbatim**, con sus «Daniel, textual»,
> sus mediciones, sus «Candados», sus «Verificado por mutación» y sus 🩸.
> La REGLA vigente (sin la historia) vive en «Invariantes por módulo» de `cxc/CLAUDE.md`.

---

> ## 🔔 EL CENTINELA DE TIPOS DE COMPROBANTE DE VENTA (25-ago-2026)
>
> **En mayo de 2025 Switch estrenó el tipo «Transacción»** (reemplazó a «Tiquete»). Alguien lo agregó a tiempo y no se perdió una venta — **por suerte**. Si mañana Switch inventa otro tipo, esa venta cae al `ELSE 0` de las **19 copias** del CASE que hay en las vistas de ventas y **desaparece del tablero sin una sola alerta**: no hay error, no suena nada, el total sale más bajo y nadie se entera.
>
> **En cartera ese guard existía desde mayo-2026** (`switch_estadocuenta_tipos_sin_clasificar` + el check `aging_tipos_sin_clasificar`). **En ventas no había equivalente.** Esto es el mismo mecanismo, calcado a propósito.
>
> **La lista se dice en UN solo lugar: `src/lib/ventas/tipos-comprobante.ts`** — los 5 tipos largos (`Factura · Tiquete · Transacción · Nota de Débito · Nota de Crédito`) y los códigos cortos de `switch_articulo_diario` (`FA · TQ=Tiquete · CNF=Transacción · ND · NC`). `clientes-ytd.ts` la **importa** en vez de repetirla, y un test lee el SQL de la migración y exige que diga lo mismo. Una lista paralela es la que un día se aparta en silencio.
>
> **Dos vistas, riesgos OPUESTOS** (`20260826140000_ventas_tipos_sin_clasificar.sql`, aditiva):
> - `switch_facturas_tipos_sin_clasificar` — el `ELSE 0`: un tipo nuevo hace que la venta valga **CERO**. La plata DESAPARECE.
> - `switch_articulo_diario_tipos_sin_clasificar` — el contrario: ahí es `CASE WHEN tipo='NC' THEN -x ELSE x END`, o sea que un código nuevo **SUMA sin permiso** e infla costo y utilidad.
>
> 🔴 **NO estrena una cuarta alerta.** Entra en la **regla 2** y sale por `alertSwitchCronErrors` → canal 🔧 SISTEMA, en la **MISMA** llamada que ya hacía `switch-sync` (dos llamadas serían dos mensajes por la misma corrida). **La venta NO se descarta**: sigue guardada con su tipo y sigue valiendo 0 en los reportes — adivinarle un signo sería inventar plata. Lo único que cambia es que **avisa**.
> - 🔑 **Y por eso deja su propia fila en `switch_sync_log`** (`sync_type = 'ventas_tipos'`, una por empresa y corrida, con su DDL en la MISMA migración). La racha se mide sobre el par `(empresa, sync_type)`: **sin filas propias**, `evaluateSwitchEscalation` caería en `sin-historia` (fail-open) y avisaría en la PRIMERA corrida **y en todas las siguientes, para siempre**. Con filas, se comporta como cualquier sync: la 1ª se calla, la 2ª avisa, y el día que alguien clasifique el tipo la fila vuelve a `success` y la racha se reinicia sola.
> - ⚠️ **No toca el heartbeat.** Un tipo nuevo no significa que el cron de facturas haya fallado —las facturas se escribieron bien—, así que el latido se sigue registrando y no despierta además al vigía de crones caídos.
> - **Un tipo nuevo SIN plata no despierta a nadie**: queda anotado en el log y en `/admin/data-health` (check `ventas_tipos_sin_clasificar`, `warning` sin plata / `critical` con plata). Misma gradación que la cartera.
> - **Si las vistas todavía no existen** (la migración la corre Daniel a mano), el centinela lo reconoce, lo dice en el log y **no avisa ni tumba nada**. La app funciona igual antes de correrla.
>
> **El texto exacto que llega al celular**, cuando ya van 2 corridas:
> ```
> 🔧 SISTEMA · Una sincronización con Switch no se está recuperando sola.
> · Vistana International: van 2 corridas seguidas fallando desde 26 ago 2026, 03:10.
> Qué significa: hay ventas que el tablero está contando como CERO: Switch estrenó un tipo de comprobante que el sistema todavía no sabe leer.
> Qué hacer: avisame para revisarlo.
> Detalle: Switch mandó un tipo de comprobante que el sistema no sabe contar: "Transacción B" en 12 venta(s) por $45,231.50, que el tablero está contando como CERO. Hay que clasificarlo (¿suma o resta?) para que la plata vuelva a los totales.
> ```
>
> **Candado: `src/__tests__/lib/ventas-centinela-tipos.test.ts` (23).** Prueba **las dos direcciones**, que es lo único que sirve en un centinela: con los tipos REALES **no avisa nunca**, con un tipo inventado que trae plata **avisa siempre**. Y el SQL se verificó **contra un Postgres de verdad** (pglite, tablas stub con las columnas reales) antes de entregarse.
> - **Verificado por mutación, 13 de 13 cazadas** (segunda mitad del script): el centinela nunca avisa · mide y descarta lo medido · no devuelve nada para alertar · avisa también sin plata (el ruido diario) · la lista pierde «Transacción» · CNF deja de ser Transacción · un tipo desconocido suma en vez de valer 0 · el SQL y el TS dejan de decir lo mismo · la vista de artículos pierde CNF · el `sync_type` desaparece del código · los hallazgos no entran a la llamada de alerta · **dos llamadas a `alertSwitchCronErrors`** · **el centinela suprime el heartbeat**.
>
> ### Candados de lo anterior
>
> **`src/__tests__/components/cxc-boston-fecha-del-dato.test.tsx` (7) RENDERIZA la pestaña** con el dato congelado del 19-ago y con uno fresco, y lee lo que el navegador habría mostrado: con dato viejo el aviso aparece y nombra a Confecciones Boston, con dato fresco **no aparece**. Un barrido estático se satisface con el `import` — dejaría pasar el componente montado con la empresa equivocada, con `className="hidden"` o detrás de un `{false && …}`; hay un caso que recorre la cadena de clases desde el aviso hasta la raíz porque **jsdom no resuelve Tailwind**. Más `datos-viejos.test.ts` (19), donde el candado de Boston cambió de dirección.
> - **Verificado por mutación, 8 de 8 cazadas:** quitar el `<SyncStatus>` de la pestaña · montarlo con las 6 del grupo · esconderlo con una clase · que el aviso nunca se pinte · que se pinte también con el dato fresco · devolver el filtro viejo a `empresasDe("cartera")` · volver a `empresasConCxc()` · borrar la entrada de `boston-cartera` del cronograma (rompe el invariante del cron).
> **Qué sincroniza cada empresa vive en UN solo lugar: `EMPRESA_SYNC_CAPABILITIES` (`src/lib/switch-api/empresas.ts`).** Cinco banderas por empresa — `facturas`, `cxc`, `cxp`, `recibos`, `utilidad` — y los syncs DERIVAN sus listas de ahí: `RECIBOS_EMPRESA_KEYS` (sync-recibos) = `empresasConRecibos()`, `B2B_COMISION_KEYS` (sync-utilidad) = `empresasConUtilidad()`, y el cronograma de sesión única de `cron-telemetry.ts` (`CRON_EMPRESAS_*`) también. **No volver a escribir un array de empresas a mano.**
>
> 🩸 **Por qué (27-jul-2026):** eran arrays literales repartidos en tres archivos y se contradecían en silencio. `joystep` estaba en `B2B_EMPRESA_KEYS` (o sea, con CXC y pestaña de comisiones) pero **no** en el sync de recibos ni en el de utilidad, **desde el commit que creó cada sync** (`86b0d0d4`) y sin un comentario que lo explicara. La certificación contra Switch lo midió: **$15.262,00 de cobros de julio invisibles**, `switch_factura_utilidad` con **cero filas de joystep en toda su historia**, comisión de julio en **$0,00 con 0 vendedores**, y los clientes de sus **$60.606,37** de cartera abierta sin "último pago" porque `switch_ultimo_pago_cliente_v2` no tenía una sola fila suya. Daniel: *"fue un olvido — activalo"*, con histórico hacia atrás. Peor que el agujero era que el cronograma de crons repetía las mismas listas: el candado que protege la sesión única de Switch (`cron-calendario.test.ts`) medía un calendario que no era el real.
>
> **Invariante que lo habría cazado el día 1, ahora en `src/__tests__/lib/empresa-capabilities.test.ts`: toda empresa con `cxc: true` tiene que tener `recibos: true`** — una cartera abierta sin recibos es una ficha de cliente que nunca puede decir cuándo pagó. La implicación va en UN solo sentido: `american_classic` es `cxc:false` + `recibos:true` a propósito (retail sin cuenta corriente pero con cobros de mostrador). El mismo test fija que `B2B_EMPRESA_KEYS` ≡ `empresasConCxc()` — no se puede derivar en código porque `empresas.ts` importa el tipo `EmpresaKey` de `empresa-mapping.ts` y sería circular, así que la coherencia la sostiene el test.
>
> ⚠️ **CORREGIDO EL 31-ago-2026 — esta nota decía que `confecciones_boston` estaba excluido de recibos Y de utilidad, y solo la mitad seguía siendo cierta.**
>
> - 🔴 **RECIBOS: SÍ sincroniza, y desde hace un mes.** El PR **#347** (28-jul-2026, la pestaña de Boston) le cambió la bandera —`recibos: false → true` en `EMPRESA_SYNC_CAPABILITIES`— y la nota nunca se actualizó, así que afirmó lo contrario durante un mes. Medido en producción el 31-ago: **7.636 filas suyas en `switch_recibos`** y las 4 corridas diarias en `success` (la última, 31-ago 15:19, con 620 recibos en la ventana). Daniel lo confirmó: **debe sincronizar recibos.** Hoy el código dice `confecciones_boston: { facturas: true, cxc: false, estadoCuenta: true, cxp: false, recibos: true, utilidad: false }`.
> - ✅ **UTILIDAD: sigue excluido, y eso sí es diseño.** Medido el mismo día: **0 filas de Boston en `switch_factura_utilidad`**, en toda su historia. Su margen nunca se sincronizó ni se certificó — es la misma razón por la que la pestaña de Ventas de `/boston` no publica utilidad.
>
> 🩸 **La lección no es el dato: es que la nota sobrevivió un mes afirmando lo contrario de lo que hacía el código.** Es el mismo modo de fallo que este archivo documenta en otros diez lugares —dos listas que se separan en silencio—, solo que acá una de las dos era la documentación.
>
> **Guard del "cero silencioso" en `sync-utilidad`:** si el reporte de Switch devuelve 0 documentos **pero `switch_facturas` sí tiene documentos en el rango**, la empresa queda `ok:false` con el error en `switch_sync_log` en vez de anotarse `success` con la tabla vacía. Cero filas sigue siendo legítimo cuando la empresa no facturó. Candado: `src/__tests__/lib/utilidad-cero-silencioso.test.ts`. (Ojo, un dato que se prestó a confusión: el `success` diario de joystep en `switch_sync_log` es `sync_type='costo'`, que escribe `switch_costo_diario` — 92 filas correctas, julio $4.310,00 — y **no** tiene nada que ver con `switch_factura_utilidad`. No eran el mismo cron.)


---

## 🔴 Ventas › Clientes mostraba el DOBLE — y la causa era Boston adentro de `clientes_master` (2-sep-2026)

> Daniel, contra Switch: **City Mall David · Vistana · 2026 → la app decía $227.872,28; Switch dice $113.936,14. Exactamente 2,000x.**
>
> Y cuando le contamos el mecanismo, señaló la causa raíz que se nos había pasado, textual: ***"¿por qué confundirías City de Boston si ya había dicho que Boston no puede tocar esos módulos? Boston es estricto para ver sus ventas y tiene hasta su propio CXC, no quiero que se mezcle en mi grupo"***.
>
> ### 🩸 EL DEFECTO REAL: LOS CLIENTES DE BOSTON NUNCA DEBIERON ENTRAR
>
> El **28-jul-2026 a las 07:01 UTC**, `sync-clientes-master` metió **4.910 clientes de Confecciones Boston** en `clientes_master`. El sync tenía `.neq("empresa_key", "american_classic")` — excluía ACS y **solo** ACS. Boston entraba por la puerta de al lado.
>
> 🔴 Eso viola el invariante más fuerte del repo (`boston-cxc.md`): *"Boston NUNCA se mezcla con el CXC del grupo — ni una fila, ni un total, ni un export, ni un badge"*. Y **`clientes_master` no tiene columna `empresa_key`**: es una fila por CÓDIGO, compartida por las 6 del grupo. Una vez adentro, **un cliente de Boston es indistinguible de uno del grupo**. Ese es el punto: no hay forma de arreglarlo aguas abajo.
>
> ### El mecanismo del ×2, y por qué HACEN FALTA LOS DOS ARREGLOS
>
> `clientes_empresa_12m_vw` y `clientes_anio()` resolvían el código del cliente **uniendo por NOMBRE**:
> ```sql
> LEFT JOIN clientes_master mc ON mc.nombre_normalized = a.cliente_norm
> ```
> Un LEFT JOIN contra una tabla que puede tener el mismo nombre en dos filas **no "elige una": devuelve LAS DOS**, y el `SUM` de más abajo cuenta la factura dos veces. Medido: **46 `nombre_normalized` repetidos entre filas vivas**, **24** mezclando un código del grupo con uno de Boston (`CITY MALL DAVID` = `D-24` del grupo y `83` de Boston; `CITY MALL PASO CANOA` = `D-25` y `84`; …). **42 de los 46 nacieron el 28-jul.**
>
> 🔴 **Y sacar a Boston NO alcanza, está medido:** quedan **3 nombres repetidos entre clientes del propio grupo** (`CITY MODA CHORRERA` D-30/D-26 · `METRO SHOES PANAMA SA` D-103/D-173 · `EL MACHETAZO SAN MIGUELITO` D-171/D-101 — códigos desfasados en el panel de Switch, los mismos que `mundos.ts` ya documentaba) que siguen valiendo **$13.426,00 de doble conteo**. Al revés tampoco: arreglar el join sin sacar a Boston deja clientes del grupo **rotulados con código de Boston** — `NIPMAR SA` y `CEPREDENAC`, ventas de fashion_shoes/vistana atribuidas a los códigos `390` y `154345` de Boston.
>
> ### 🔴 LA IDENTIDAD DEL CLIENTE ES EL CÓDIGO — y el camino existe sin tocar un nombre
>
> Daniel, después de que le contáramos el mecanismo: ***«se debería de usar el código del cliente, ya que todos los D-24 por ejemplo son de City Mall across mis 6 empresas»***. Medido y es exacto: de los **147 códigos** del grupo en `switch_clientes`, **138 aparecen en las 6 empresas con el MISMO nombre**, 2 en cinco y 7 en una sola (normal: no todo cliente le compra a todas).
>
> ```
> switch_facturas (empresa_key, cliente_switch_id)
>    └─→ switch_clientes (empresa_key, cliente_switch_id) → codigo
>         └─→ clientes_master.codigo        (índice ÚNICO, 20260530000200)
> ```
> El par `(empresa_key, cliente_switch_id)` es **único por construcción**: este join **no puede multiplicar** una factura, ni hoy ni cuando dos clientes se llamen igual. Y mata los 3 homónimos internos que sacar a Boston NO arreglaba ($13.426,00).
>
> ⚠️ **La objeción que había —«`switch_facturas` no trae el código»— era cierta y estaba incompleta:** sí trae `cliente_switch_id`, y `switch_clientes` hace de puente. La rama del grupo YA lo usaba (`COALESCE(sc.codigo, mc.codigo)`); la rama de Boston/Multifashion era la única que resolvía **solo por nombre**, y es la que traía clientes de Boston a la mesa del grupo. Ahora las dos usan el puente.
>
> ### 🔑 NO SE DEJA FALLBACK POR NOMBRE — un camino muerto es una trampa
>
> Se midió antes de decidir, que es lo que pidió Daniel:
> - De las **8.181** facturas del grupo que el ranking mira, **370 (4,52%)** traen un `cliente_switch_id` que no cruza el puente. **No son clientes ausentes: son ids VIEJOS** — `AIDY SHOP NO2` factura con `vistana|3` cuando su par vivo es `vistana|139`.
> - Valen **$3.817,74 de 2026 (0,07%)** y **caen a «Otros clientes» con fallback y sin fallback**: los 3 únicos con plata —`KAREN DUTY FREE SA` $2.382,00 · `FERIA INT DE DAVID` $1.018,75 · `MAZAR CITY SHOES` $417,00— **no están en `switch_clientes` NI en `clientes_master`**, así que ningún fallback podía darles un código. Ya eran huérfanos. El total de huérfanos **no cambia: $3.817,74 antes y después.**
> - Lo ÚNICO que el fallback lograba de verdad era **rotular ventas del grupo con códigos de BOSTON**: `NIPMAR SA` → `390`, `CEPREDENAC` → `154345`, `BAZAR PALESTINA` → `113493`. Esas filas desaparecen, y está bien que desaparezcan.
>
> **`AIDY SHOP NO2` (D-2) y `A-AMANI SA` (D-1) siguen en la lista**, que era la preocupación: 2 filas cada uno (fashion_wear $1.549,00 · vistana $526,00 · vistana $2.006,77 · fashion_wear −$90,00). Las 3 filas extra son de **$0,00**.
>
> 🩸 **Hubo un diseño intermedio que se descartó**: una vista `clientes_master_por_nombre_unico_vw` (`GROUP BY nombre_normalized HAVING COUNT(*) = 1`) que se abstenía ante un nombre ambiguo. Era un buen parche mientras el nombre era la única llave; con una llave de verdad es **deuda que alguien va a volver a tocar**. Hay candado de que no reaparezca.
>
> ### ⚠️ TCKCTA — el único código que miente
>
> El mostrador se llama `CONTADO` en active_shoes/active_wear/joystep, `VENTAS` en fashion_wear/vistana y `VENTAS LOCA` en fashion_shoes: es el único código del grupo que no nombra al mismo cliente en las 6. **No puede juntar seis mostradores en una fila, y no por suerte: el grano de estas vistas es (cliente_key, EMPRESA)**, así que da como mucho una fila POR empresa. Medido después del cambio: **1 sola fila TCKCTA** en todo el payload (fashion_shoes, $25.835,65), la misma que hoy.
>
> ⚠️ **Defecto PRE-EXISTENTE que se reporta y NO se toca:** el filtro excluye `'VENTAS LOCALES'` pero Switch escribe `VENTAS LOCA` (truncado), así que el mostrador de fashion_shoes se cuela. La pantalla lo saca del ranking y lo muestra aparte con la etiqueta ámbar «Mostrador» (`isVentasLocal`), o sea que **no se mezcla con clientes reales** — pero esa fila dice **$25.835,65** cuando el mostrador del grupo entero es **$54.478,59**. Es un número que Daniel LEE: es decisión suya, no se cambia de paso.
>
> ### La medición, reproduciendo la aritmética de la vista sobre datos REALES
>
> | escenario | filas | suma 2026 YTD | City Mall David · vistana |
> |---|---:|---:|---:|
> | **antes de todo** (nombre, Boston adentro) | 255 | $7.911.210,10 | **$227.872,28** |
> | con Boston fuera de `clientes_master` ← **YA APLICADO** | 255 | $5.371.023,39 | **$113.936,14** |
> | + la migración (join por código) | **258** | **$5.357.597,39** | **$113.936,14** |
>
> El «antes» reproduce **exacto** lo que publicaba la MV. **No se pierde ningún cliente**: las 258 son 255 + 3 filas de $0,00 de ids viejos. El sobreconteo era **$2,55 millones, +47,7%**.
>
> **«Filtré Vistana, no hace sentido que sume las de Boston si puse Vistana»** — queda cerrado por construcción: el grano es (cliente, EMPRESA) y el código sale del par (empresa, id). Medido: **67 filas de vistana, 0 con código ajeno.**
>
> **Los años cerrados también estaban duplicados hacia atrás**: `clientes_anio()` tiene el mismo join y lee el `clientes_master` de HOY. Verificado en 2025/vistana: City Mall Paso Canoa $1.118.329,60 contra $559.164,80 real.
>
> ### 🩸 SE PARCHÓ DOS VECES SIN MIRAR LA TERCERA SUPERFICIE
>
> El coletazo del 28-jul ya se había atendido en **Directorio (#387)** y en el **buscador ⌘K (#388)**, los dos el 30-jul. Las dos veces se arregló la pantalla que alguien notó. **Nadie miró el ranking de Ventas**, que llevaba cinco semanas publicando plata inventada. Por eso el arreglo de hoy va en la ÚNICA puerta de escritura (el sync) y el candado es un **barrido**, no una lista de superficies.
>
> ### Lo que NO se tocó (verificado, no supuesto)
>
> `ventas_dashboard_summary` (Resumen y totales de Ventas) **no menciona `clientes_master`** · `ventas_rollup_mensual_mv` tampoco · `comision_b2b_v5` tampoco · `switch_estadocuenta_aging` (CXC) joinea por `codigo`, que es único · la ficha `/clientes/[codigo]` usa `cliente_ficha_ventas`, que joinea por `codigo` y **ya daba el número correcto**. **Los totales de venta no se mueven: acá se listan CLIENTES.**
>
> 🔴 **LAS VENTAS DE BOSTON SIGUEN SUMANDO, y es lo primero que había que no romper.** Daniel: *«solo se queda CXC de Boston en su tab, sin que toque ni se mezcle con los otros. **Déjalo en Vista General**»* y *«Boston también quiero verlos en ventas-resumen»*. Medido en producción DESPUÉS de la limpieza: **$463.898,47 = 7,4%** de la venta de 2026, intacto. **Su plata suma; sus clientes no se ven.** Hay candado en las dos direcciones — uno que exige que `ventas_dashboard_summary` y `ventas_rollup_mensual_mv` NO excluyan a Boston, y otro que exige que no miren `clientes_master` (si un total dependiera del directorio, limpiarlo movería plata).
>
> Y **ninguna superficie de Boston lee `clientes_master`** — auditado: `/api/boston/clientes` y `/api/cxc/boston` leen `switch_clientes` y `switch_estadocuenta_aging_boston`, con un comentario que ya decía *"`clientes_master` NO SIRVE ACÁ… no tiene columna de empresa"*. Sacarlo no rompe nada suyo.
>
> ### El código de Boston tampoco se filtró a las otras tablas, y está medido
>
> Los backfills de 8-ago (`guia_items.cliente_codigo`, `cheques.cliente_codigo`, `directorio_clientes.cliente_codigo`, `mk_proyectos.tienda_codigo`) también parean por nombre normalizado y corrieron DESPUÉS de la carga de Boston — pero traían dos guardas: `codigo LIKE 'D-%'` y un `NOT EXISTS` de gemelo con el mismo nombre. Medido en producción: **0 códigos que no sean del grupo en las 4 tablas.**
>
> ⚠️ Ojo con la guarda de FORMA: se evaluó un `CHECK` sobre `clientes_master.codigo` (`D-<n>` o `TCKCTA`) y **NO SIRVE** — el grupo tiene el código **`12188`**, pelado y numérico. Habría rechazado a un cliente legítimo. Por eso la garantía estructural es la puerta de escritura + el barrido, no la forma del código.
>
> ### La limpieza de lo ya cargado
>
> `node scripts/_verif-clientes-master-boston.mjs` (**solo lectura**, no borra nada) aplica la MISMA regla de `soloClientesDelGrupo()` y reporta: **se quedan 150, se marcarían 4.914** (4.883 de Boston + 31 que Switch conoce en boston+ACS), de las cuales **4.910 entraron el 28-jul-2026**. Los **3 huérfanos se quedan** (`D-201`, `D-173`, `D-101`): Switch no conoce su código y `mundos.ts` ya explicó que esconderlos rompe el Directorio. Se recomienda **soft delete** (`deleted = true`) y no `DELETE`: la columna existe, todos los lectores del ranking, la ficha, el Directorio y el CXC filtran `deleted = false`, y es reversible con un `UPDATE`. **El script imprime el SQL pero no lo ejecuta.**
>
> ### Candados
>
> `src/__tests__/lib/clientes-master-solo-del-grupo.test.ts` (18) — dos BARRIDOS, la conducta del sync, el mostrador `TCKCTA`, la puerta de la ficha y las ventas de Boston. El barrido SQL arma la definición FINAL de cada VIEW/MV/FUNCTION del repo (mismo motor que `cxc-boston-fuera-de-toda-superficie`) y exige que ninguna una la TABLA `clientes_master` por `nombre_normalized`: **un objeto SQL nuevo nace vigilado**. Incluye un caso que prueba el DETECTOR contra el SQL roto, el sano y el correcto-por-código — un barrido que no distingue los tres no sirve. El de conducta llama al sync REAL con supabase doblado y **cuenta qué consulta salió**: que la lista contenga las 6 no prueba que la consulta las use.
> - 🔑 **Se prohíbe el JOIN, NO los nombres repetidos**, y la razón es la medición de arriba: quedan 3 homónimos legítimos entre clientes del propio grupo. Un test de datos que fallara por ellos estaría rojo para siempre y terminaría silenciado; además falla o pasa por razones que ningún cambio de código causó, así que no protege ninguna ruta. El join es estructural, se caza en el build, y caza la PRÓXIMA superficie.
> - **Verificado por mutación, 21 de 21 cazadas + 1 control en verde** (`bash scripts/_mutar-candados-clientes-master.sh`): el sync vuelve al `.neq` de ACS · alguien "agrega" Boston a la inclusión · el sync se olvida de joystep · el sync no acota nada · la MV vuelve al fallback por nombre · la rama no-B2B también · `clientes_anio()` también · el puente pierde `empresa_key` · el puente se cambia por un pareo contra el nombre · la ficha del ranking se resuelve por nombre · **el grano pierde la EMPRESA (los seis mostradores caen en una fila)** · **alguien saca la VENTA de Boston de Vista General** · vuelve el filtro que escondía joystep · la lista de píldoras se escribe a mano · la PANTALLA esconde joystep al pintar · alguien agrega Boston a la tira · el GET de la ficha deja de preguntar · el PATCH deja de preguntar · el 404 se vuelve 403 · el guard falla CERRADO · los 3 huérfanos pierden su ficha. Control (no debe dar rojo): cambiar el tamaño del lote del upsert.
> - 🩸 **DOS mutaciones SOBREVIVIERON en la primera corrida y las dos eran candados flojos**: el grano (el test pedía que *algún* `GROUP BY` llevara la empresa, y basta que UNO se olvide) y una mutación mal escrita que reintroducía el `COALESCE` sin el JOIN. Se cerraron pidiendo que **TODOS** los agrupamientos por `cliente_key` lleven la empresa.
> - 🩸 **Y el CONTROL salió rojo por una razón que no era el control**: se mutó la migración de `ventas_dashboard_summary` **sin haberla puesto en `ARCHIVOS`**, así que la restauración no la tocó y la mutación quedó viva contaminando los casos siguientes. Es el mismo modo de fallo que el encabezado del script ya advertía. Ahora `mutar()` **verifica que el archivo esté respaldado antes de tocarlo** y aborta si no.

---

## 🔴 Ventas › Clientes — «vs 2025» comparaba OCHO meses contra NUEVE (3-sep-2026)

> **Medido, no supuesto.** Multi Fashion Holding (D-108), «Todas», 2026: la pantalla decía **$238.486 · +3%**. La vista tenía `compras_ytd = 238.485,70` (1-ene → 2-sep-2026) y `compras_anio_anterior = 231.485,02`, que es exactamente Multi Fashion Holding del **1-ene al 30-sep-2025** — nueve meses completos contra ocho meses y dos días. Los mismos días de 2025 dan **$174.821,02 → +36,4%**.
>
> **Dónde estaba:** en `clientes_empresa_12m_vw` (y en `clientes_anio()` para el año en curso) el año anterior se cortaba por MES — `max_mes AS (SELECT MAX(k.mes) … WHERE k.anio = año_en_curso)` y `prev_year … WHERE k.mes <= max_mes`. No era `date_trunc + 1 month`: era `mes <= 9`, que es «hasta el 30 de septiembre». Cada día del mes la comparación se corregía sola un poco, el 30 por fin decía la verdad, y con la primera factura del mes siguiente volvía a saltar. Un cliente que crece de verdad se veía plano casi todo el mes. Venía así desde `20260510040000_fix_clientes_delta_same_period.sql`, que arregló «4 meses contra 12» y dejó «N meses contra N meses enteros».
>
> 🩸 **Es la misma clase de error que la casa ya pagó dos veces**, y la regla ya existía y esta vista no la cumplía: *«un mes empezado se compara contra los MISMOS DÍAS del año pasado»* (Multifashion, `rangoComparativo`); el resumen diario de ACS (`ventanasResumen`: 1..D contra 1..D, 29-feb → 28-feb — el 2-sep se revisó justamente su línea «Mes» del día 1 y se dejó: calendario contra calendario); Ventas › Productos (`productosRangoComparativo` con `unAnioAntes`).
>
> **La regla, ahora también aquí** (`20260909120000_clientes_vs_anio_anterior_mismos_dias.sql`, espejo TS en `src/lib/ventas/clientes-corte-comparativo.ts`):
> - `corte` = el **último día con ventas cargadas** del año en curso, nunca después de **HOY en Panamá**; `corte_prev` = la misma fecha un año antes (`- INTERVAL '1 year'`, el 29-feb cae en el 28); año anterior = 1-ene → `corte_prev`.
> - **«Último día cargado» y no «hoy» a secas** porque la vista es MATERIALIZADA y se refresca a las 02:35 de Panamá: a esa hora el año en curso llega hasta ayer, y cortar el año pasado en «hoy» le regalaría un día. Si el sync se atrasa, las dos ventanas se acortan JUNTAS. Es el criterio que Resumen ya usaba en la misma pantalla (`fecha_corte` = MAX(fecha) del mes en curso).
> - **HOY es el de Panamá**: `(NOW() AT TIME ZONE 'America/Panama')::date` alimenta el año en curso, el piso de los 12 meses y el corte. Se fueron los `CURRENT_DATE` y `date_trunc('month', NOW())`, que son UTC.
> - **«Compras 2026» no se mueve un centavo**: sigue siendo todo lo cargado del año. Lo único que cambia es hasta dónde se suma el año ANTERIOR.
> - Un año cerrado no tiene caso especial: corte 31-dic, un año antes el 31-dic anterior.
>
> **El resto de la pantalla, auditado:** Resumen compara por día (`ventas_dashboard_prev_same_period_v2`) ✅ · Productos con `unAnioAntes` ✅ · Utilidad **no tiene columna «vs 2025»** (Ventas · Utilidad · Margen %) — nada que comparar ✅ · Clientes era la única que no. El texto *«El cambio compara contra el mismo período de 2025»* **no se tocó: después del arreglo es verdad.**
>
> **Efecto sobre TODOS los clientes** (`scripts/_diag-clientes-vs-2025-mismos-dias.ts`, solo lectura; primero reconstruye la ventana VIEJA y **cuadra al centavo 116 de 116** filas publicadas). Sobre los 115 del ranking, 82 con «vs 2025»: **37 cambian de número, 6 de signo** — 2 pasaban de «baja» a «sube» (D-142 Sporting Shoes N 4, $164.900: −0,2% → **+24,1%** · D-32 City Moda Los Andes: −7,4% → **+10,1%**) y 4 pierden el número porque hasta esa fecha 2025 da 0 o negativo (D-10 · D-49 · D-54 · D-23: «—» en vez de un % inventado). Las que más se mueven: D-156 Wolf Mall +105% → +964% · D-43 De Moda +26% → +355% · D-117 Outlet Duty Free N2 +862% → +1.065% · D-1 A-Amani −58% → −0,9% · D-108 +3% → +36,3%.
>
> Candado: `src/__tests__/lib/clientes-vs-anio-anterior-mismos-dias.test.ts` (16) — la regla con **fechas fijas** (2-sep a mitad de mes, el día 1 a las 02:35 y con la primera factura, 29-feb, 21:00 de Panamá con el UTC ya en mañana, sync atrasado) y el texto EJECUTABLE de las dos ramas del SQL. **Verificado por mutación, 13 de 13 cazadas** (`bash scripts/_mutar-clientes-mismos-dias.sh`, control 0): vuelve el corte a fin de mes · rompe el 29-feb (`make_date` con el día tal cual) · corta en UTC (`CURRENT_DATE`) · el corte es «hoy» a secas · «Compras 2026» se recorta · las tres en la función de años cerrados · el mostrador deja de reconocerse por código · y las cuatro del espejo TS. `clientes-ytd.test.ts` y `ventas-mostrador-por-codigo.test.tsx` ahora leen la migración vigente (20260909120000): lo del mostrador por código sigue ahí, palabra por palabra.

---

## Los mismos días, en TODAS las comparaciones — seis lugares más (3-sep-2026)

> Arreglado Clientes, una auditoría medida contra producción (`scripts/_diag-mismos-dias-6-lugares.ts`, solo lectura) buscó la misma clase de error en el resto del sistema y encontró **seis lugares**. Daniel aprobó arreglarlos todos, con una excepción textual: en Vendedoras, *«el rótulo (que diga "vs mes anterior", que es lo que hace)»*.

> **Lo medido, antes → después (3-sep-2026, corte 3-sep / 2-sep según la fuente):**
> 1. **Ventas › Resumen › Anual** — 2026 hasta hoy contra ene–sep ENTERO de 2025 (`yearTotalUpTo(mes <= 9)`). Grupo **−7,0% → +2,5%**; Vistana +0,4% → +10,5% · Fashion Wear −13,8% → −5,9% · Fashion Shoes −6,1% → +7,2% · Boston −15,5% → −0,3% · ACS +3,8% → +13,9%. Cinco de ocho cambiaban de signo, y el día 1 de cada mes la comparación saltaba un mes entero. Ahora el previo del año en curso sale de la MISMA RPC del KPI (`prev-same-period.ts`): meses cerrados enteros + el mes en curso recortado por empresa.
> 2. **Ventas › Resumen › Mes×año** — el servidor mandaba `prev: null` para la celda del mes en curso y la pantalla lo ignoraba (`byMonth[m][y−1]`, el mes entero). Fashion Wear sep **−99,4% → −98,5%**; **Boston −93,5% → +2,2%** ($5.864,05 contra $5.739,70 de los mismos tres días). La celda toma `cell.prev` del servidor y, en el mes en curso, los mismos días de la RPC, con rótulo «vs 1–3 sep 2025».
> 3. **Vista General › tarjeta Ventas** — lo que va del mes contra el mes ENTERO (MV). Grupo **−97,9% → −92,7%** (tres días contra un mes). La tarjeta dice «vs 1–3 sep 2025»; si la RPC no contesta queda sin Δ, nunca contra el mes entero.
> 4. **Ventas › Productos y Multifashion › Productos** — el comparativo cortaba en HOY, pero `switch_articulo_diario` se carga a las 03:40 y llega hasta AYER: el año pasado llevaba un día de más, siempre. Fashion Wear «Año en curso» **−6,0% → −0,7%**; Multifashion sep **+4,2% → +46,1%** (el Resumen de al lado ya decía +46,1%). `ultimoDiaArticuloDiario` (una consulta chica por índice) trae el MAX(fecha) del período y es parámetro OBLIGATORIO de `productosRangoComparativo` y `rangoComparativo`; la ventana previa del filtro por cliente corta en el mismo día.
> 5. **Multifashion › Vendedoras** — la columna decía «Δ vs año pasado» pero `multifashion_vendedoras_v3` compara contra el MES ANTERIOR (`p_mes − 1`): «Agosto (cerrado)» +30,1% era contra julio ($53.012,36 contra $40.740,67 = julio entero al centavo). **Se arregló el rótulo, no la comparación**: «Δ vs agosto 2026» en el chip en curso y «Δ vs julio 2026» en el cerrado — se NOMBRA el mes para que no quede ambiguo—, más la nota «La Δ compara contra agosto 2026, los mismos días (del 1 al 3)». YTD y «Últimos N meses» sí comparan contra el año pasado y conservan su rótulo (`vendedoras-rotulo.ts`).
> 6. **La RPC del Resumen cortaba en UTC** (`CURRENT_DATE`, `fecha::date`). Una factura después de las 7 p.m. cae en el día UTC siguiente y corre el corte un día hasta la mañana: Fashion Wear la noche del 12-may-2026 (factura nocturna de $11.972) comparaba 1–12 may contra 1–13 may 2025 → **+1,3% en pantalla, +45,1% real**. En 2026 hubo **30 pares empresa-noche** así (joystep 10 · ACS 10 · vistana 5 · fashion_wear 4 · active_shoes 1). `ventas_dashboard_prev_same_period_v3` (migración `20260910120000`, **pendiente de aplicar**) usa `multifashion_hoy_panama()` y `mf_panama_date(fecha)`, topa el corte por empresa en hoy y deja que una empresa sin filas caiga al corte global (active_wear sep: de comparar contra $0 a comparar contra los $503 de los mismos días). El código pide `_v3` y cae a `_v2` → `_v1` mientras la DDL no corra.

> **Una sola definición.** Todo sale de `src/lib/ventas/clientes-corte-comparativo.ts` (`corteVsAnioAnterior` · `ventanaUnAnioAntes` · `unAnioAntes`, que se mudó ahí desde Multifashion y se re-exporta). `rangoComparativo` y `productosRangoComparativo` son envoltorios. Efecto colateral deliberado: un febrero cerrado de 28 días contra uno bisiesto compara 1–28 contra 1–28 en Productos, como ya hacía Multifashion — antes los dos criterios divergían justo ahí.

> Candados: `mismos-dias-todas-las-comparaciones.test.ts` (26: la definición con fechas fijas —mitad de mes, día 1, 29-feb, 9 p.m. de Panamá—, el Anual y Vista General con el handler REAL y una base simulada, la cadena de versiones de la RPC y el texto de la migración) · `multifashion-productos-corte-cargado.test.ts` · `resumen-mes-anio-mes-en-curso.test.tsx` (pinta el panel de Boston: +2% y nunca −93%) · `multifashion-vendedoras-rotulo.test.ts` · los de Productos que cambiaron de dirección con su nota. **26 mutaciones, 26 cazadas** (`bash scripts/_mutar-mismos-dias-6-lugares.sh`, control 0). El después con el código real: `scripts/_verif-mismos-dias-6-lugares.ts`.

---

## Ventas › Clientes — faltaba JOYSTEP en la tira de empresas (2-sep-2026)

> Daniel, mirando la misma pantalla: ***"deberían estar solo las 6 de Fashion Group, que son las 5 de las fotos y joystep"***.
>
> **Era una lista escrita a mano**, y el comentario que estaba al lado afirmaba que joystep se ocultaba por *"decisión visual"* — no lo era: se quedó en 5 cuando joystep entró al grupo. **Es la CUARTA vez que este repo paga una lista de empresas copiada a mano** (el precedente exacto: `ComisionesView.tsx` con su propio `.filter(k => k !== "joystep")` mientras las otras tres vistas ya leían la constante; y antes, joystep fuera de recibos y utilidad, **$15.262,00 de cobros invisibles**).
>
> 🔑 **Lo primero fue medir si faltaba PLATA o solo un botón**, porque llevan a arreglos distintos. **Faltaba solo el botón:** el modo «Todas» lee `clientes_agregado_12m_vw`, cuyo `b2b_only` incluye a joystep desde siempre — medido, joystep aporta **14 filas de cliente** al ranking y su venta ya estaba dentro del total del grupo. Lo que no se podía era **filtrar** por ella.
>
> Ahora `EMPRESA_PILLS` **se DERIVA de `B2B_EMPRESA_KEYS`** y el rótulo sale de `EMPRESA_KEY_TO_NAME`. Boston y Multifashion no aparecen porque no son del grupo: la lista nombra a las 6 que sí, no excluye a las 2 que no.
>
> **El criterio de empresas en las 5 pestañas de Ventas, auditado:** Comisiones deriva (`EMPRESAS_COMISIONAN` = `B2B_EMPRESA_KEYS`) ✅ · Utilidad deriva (`empresasConUtilidad()`, con `EMPRESAS_UTILIDAD_V1` solo como rótulo de respaldo mientras la migración de la v2 no corra) ✅ · Resumen muestra las 8 a propósito ✅ · Productos enumera **7** (`PRODUCTOS_EMPRESAS`: las 6 + Multifashion, sin Boston) — es OTRO conjunto a propósito, «las que tienen `switch_articulo_diario` poblado», y está completo ✅ · Clientes era la única incompleta.
>
> Candado: `src/__tests__/components/ventas-clientes-las-seis-empresas.test.tsx` (4). **RENDERIZA la vista real** y lee los botones: que la constante derive no prueba que la pantalla los pinte — un `.slice()`, un `hidden` o un `{cond && …}` dejarían el test verde con joystep invisible otra vez. Prueba las dos direcciones: que estén las 6 **y** que Boston/Multifashion no estén (el bug opuesto, y más caro).
> - 🩸 **`ventas-vista-general-ipad.test.ts` CAMBIÓ DE DIRECCIÓN: era él el que fijaba el bug.** Su caso se llamaba *"las 6 píldoras siguen estando"* pero enumeraba CINCO empresas + «Todas», y exigía que los rótulos estuvieran **escritos a mano** (`label: "Vistana International"`). Hoy exige lo que ese archivo siempre quiso decir —que el rótulo no se abrevie, que es una regla de ANCHO para el iPad— y que la lista se DERIVE.

---

## 🔴 Comisiones — FASHION GROUP SON SEIS EMPRESAS, y Multifashion es OTRO módulo (14-ago-2026)

> Daniel, textual: ***"joystep sí debe de tener comisiones al 0.5%"***, y después, para cortar el enredo de raíz: ***"joystep mismo criterio que las otras de fashion group. multifashion es otro módulo de comisiones, ese ya está bien. me explico? no quiero que te enrredes aquí, ponlo en md."***
>
> ### 1. Las SEIS empresas de Fashion Group comisionan igual
>
> `vistana · fashion_wear · fashion_shoes · active_shoes · active_wear · joystep` — **las seis**, con la MISMA función (`comision_b2b_v5`) y los mismos argumentos. **Joystep no es un caso especial: es la sexta empresa del mismo módulo.**
>
> 🔴 **SOBRE QUÉ SE APLICA EL %, porque es fácil decirlo mal:** sobre la **VENTA** (`subtotal_con_descuento`). **La utilidad NO es la base: es el CRITERIO de entrada** — solo comisionan las facturas con `pct_utilidad > 20`, y **las notas de crédito RESTAN**. Está en la línea 53 de `20260703120000_comision_b2b_v5_vendedor_factura.sql`. Decir *"comisionan sobre utilidad"* es incorrecto y ya se dijo mal una vez.
>
> **Reglas duras que joystep hereda sin excepción:** las **retenciones NO comisionan** (`r.es_retencion = false`) y **`TCKCTA` (mostrador) queda fuera de la base de cobro**. La RPC **no conoce a joystep**: es la misma función para las seis, así que entrar a la matriz no puede mover a las otras cinco.
>
> ### 2. La tasa de joystep es 0,5% — y NO se escribió una sola fila
>
> `comision_b2b_v5` ya aplica `COALESCE(t.tasa_venta, 0.0050)` a todo vendedor **sin fila propia** en `comision_vendedor_tasa`. O sea que el 0,5% **ya era el default del cálculo**: entrando a la matriz, joystep lo hereda sin tocar la tabla. **`comision_vendedor_tasa` NO se tocó.**
>
> ⚠️ **La tasa es GLOBAL por vendedor, no por empresa** — por eso escribirla habría sido peligroso: la misma fila la usan todas las empresas donde esa persona trabaja. Así conviven Edwin al 0,5% y Reinaldo al 1%. **Cambiarle la tasa a alguien para "poner joystep en 0,5%" le movería la comisión en las otras empresas.**
>
> 🔴 **Joystep tiene DOS vendedores y ninguno de los dos es una persona que cobre hoy:** `DEFAULT` (el centinela "cliente sin dueño", sin fila de tasa → 0,5% por default, y es de donde sale TODO el dinero) y `DANIEL LEVY` (**tasa propia 1%, compartida con vistana**, con base **$0,00 en los tres meses medidos**). En pantalla, lo de `DEFAULT` se muestra en la fila **"Sin asignar"**, igual que en las otras cinco — no es una anomalía de joystep: `active_wear` de mayo-2026 tiene $1.259,04 y son 100% DEFAULT.
>
> **Medido contra producción (14-ago-2026):** julio **$56,33** · junio **$18,83** · mayo **$50,13**. El de julio **coincide exacto** con lo que midió la auditoría. La fórmula de Multifashion sobre los mismos datos habría dado $21,55 — **no es la de acá**.
>
> ### 3. 🔴 MULTIFASHION ES OTRO MÓDULO Y ESTÁ BIEN COMO ESTÁ — NO FUSIONAR
>
> Multifashion (`american_classic`) comisiona con **OTRA base**: `SUM(subtotal firmado) × 0.5%`. **No es `comision_b2b_v5` y no debe serlo.**
>
> **Que los dos digan "0,5%" es una COINCIDENCIA, no una relación.** Uno es 0,5% de la venta de las facturas que superan el 20% de utilidad; el otro es 0,5% del subtotal firmado, sin filtro de utilidad. **Sobre los mismos datos dan números distintos.** No compartir código entre los dos, no unificar las listas de empresas, no tocar un archivo de Multifashion para "arreglar" comisiones de Fashion Group. Este párrafo existe porque Daniel pidió que quedara escrito ANTES de que alguien lo intente.
>
> ### Por qué joystep estaba afuera, y qué lo cambió
>
> `EMPRESAS_COMISIONAN` (`src/lib/comisiones/empresas.ts`) restaba joystep **a propósito y documentado** (*"Joystep tiene CXC pero NO comisiona"*). Era un olvido con el mismo perfil que el de recibos y utilidad: **los insumos estaban COMPLETOS desde siempre** —`switch_factura_utilidad` y `switch_recibos` con datos, la RPC devolviendo cifras correctas— y **nadie los veía porque la empresa no se dibujaba**. Es el precedente exacto de este repo: cuando joystep se activó en recibos y utilidad aparecieron **$15.262,00 de cobros de julio invisibles** que llevaban meses sin contarse. **Lo que no se dibuja, no se cuenta.**
>
> ### 🔑 La lista se DERIVA, y había una CUARTA copia escrita a mano
>
> `EMPRESAS_COMISIONAN = B2B_EMPRESA_KEYS` — sin `.filter`, nunca escrita a mano. El módulo existe justamente para que la lista viva en un solo lugar, y aun así **`ComisionesView.tsx` tenía su propia línea** `B2B_EMPRESA_KEYS.filter((k) => k !== "joystep")` mientras las otras tres ya leían la constante. Alimentaba el banner **"Sincronizado"**: al entrar joystep a la matriz, las tablas lo habrían mostrado y el vigía de frescura habría seguido sin mirarlo. Ya no.
>
> ⚠️ El prop `empresas` de `ComisionesTarjetas.tsx` pasó a `readonly string[]`: la lista viene de un `as const` y esas tarjetas solo la RECORREN.
>
> ### La prueba de que las otras cinco no se movieron un centavo
>
> `node scripts/_verif-joystep-no-mueve-las-otras.mjs` (**solo lectura**) corre la MISMA aritmética que `ComisionesConsolidadoView` —el pivot por vendedor y el descuento restado de LA CELDA de su empresa— sobre datos REALES, dos veces: con la lista de 5 y con la de 6, y compara **celda por celda**. Medido: **93 celdas, 0 distintas**.
>
> | período | grupo antes → después | joystep aporta | Sin asignar |
> |---|---|---:|---|
> | 2026-07 | $11.394,57 → **$11.450,90** | $56,33 | $245,75 → $302,08 |
> | 2026-06 | $10.086,82 → **$10.105,65** | $18,83 | $1.197,44 → $1.216,27 |
> | 2026-05 | $14.340,89 → **$14.391,02** | $50,13 | $1.639,26 → $1.689,39 |
>
> El total del grupo sube **exactamente** lo de joystep, y **todo cae en "Sin asignar"**: ninguna persona que cobra cambió de número.
>
> **Los 3 anchos (+ los dos iPad acostados), en el navegador contra el build de producción y con datos de producción** (`BASE=… COOKIE_FILE=… node scripts/_medir-comisiones-tabla.mjs`, solo lectura, nunca toca "Actualizar ahora" ni "Excel"): **390 · 834 · 1024 · 1180 · 1440 → 0 px de arrastre de página, 0 px de arrastre interno, 0 px de recorte**, en los dos modos (Todas / Por empresa), y **0 tocables bajo 44 px y 0 textos bajo 12 px**. La 6ª columna **no ensanchó nada**: en celular y iPad la vista ya es de **tarjetas** (`ComisionesTarjetas.tsx`, la tabla va `hidden`), y ahí joystep entra como una fila más que crece **hacia abajo**.
>
> ### Candados
>
> `src/__tests__/lib/comisiones-joystep-entra.test.ts` (15). Son de **CONDUCTA**: llaman a los handlers REALES de `/api/ventas/comisiones/consolidado` y `/api/ventas/comisiones` con supabase mockeado y **cuentan qué RPC salió de verdad** — que la lista contenga "joystep" no prueba que el endpoint lo pida. El barrido de texto que queda **borra los comentarios primero**: este repo ya pagó cuatro veces el candado que se cumple con su propia explicación.
> - **Verificado por mutación, 6 de 6 cazadas:** volver a restar joystep en `empresas.ts` (5 tests) · devolver el filtro a mano en `ComisionesView.tsx` (1) · el punto decimal mal en la RPC, `0.0050 → 0.5` (1) · un caso especial por empresa dentro de la RPC (1) · quitarle el guard de retenciones (1) · sacar joystep del consolidado (2).
> - El candado viejo de `comisiones-consolidado-neto.test.ts` exigía un `.filter` en `empresas.ts` — **era el candado el que fijaba el bug**. Pasó a exigir lo que siempre quiso decir: que la lista se DERIVE de `B2B_EMPRESA_KEYS`, y suma `ComisionesView.tsx` a los archivos vigilados.


---

## 🔴 Comisiones — EL COBRO SE PAGA A QUIEN REGISTRÓ EL RECIBO, y DEFAULT y Daniel no se pagan (3-sep-2026)

> Daniel, textual: ***«el que vende a veces no es el que cobra. Edwin puede vender 50k a City Mall y Daniel o DEFAULT cobrar esa plata. Los 50k en comisiones en venta va a Edwin y los 50k en cobros irían a DEFAULT por ejemplo»***. Y sobre esa plata que cae en la oficina o en él: ***«se queda sin pagar, pero qué importa? Acuérdate que si yo cobro no le pago a nadie porque no me autopago»***.
>
> ### Tres vendedores, tres papeles — para que no se vuelva a confundir
>
> | En el panel de Switch | En la base | Qué comisión alimenta |
> |---|---|---|
> | **Vendedor** (de la factura) | `switch_facturas.vendedor_nombre` | **VENTA** — como desde la v5 (jul-2026). No cambió. |
> | **Vendedor Recibo** (quien registró el pago) | `switch_recibos.vendedor_registro` | **COBRO** — **el cambio** (`comision_b2b_v6`). |
> | **Vendedor de cartera** (dueño del cliente en el maestro) | `switch_recibos.vendedor_cartera` | **Ninguna.** Hasta la v5 pagaba el cobro; ya no se lee. |
>
> La ayuda oficial de Switch lo dice con las mismas palabras (`docs/switch-referencia.md`, «El vendedor del recibo NO es el vendedor de la venta»): *«El vendedor del recibo es quien procesó el pago, mientras que la venta pudo haber sido realizada por otro vendedor»*. Hasta hoy el sistema pagaba el cobro al **dueño de la cartera** porque `vendedor_registro` se guardaba desde el 3-jun-2026 pero nadie lo usaba: el comentario de la v5 decía «los recibos no exponen a qué facturas se aplican», que era cierto y no venía al caso — la pregunta nunca fue *qué factura pagó el recibo*, sino *quién lo cobró*, y eso sí estaba en la tabla.
>
> ### Qué cambia y qué no (`20260911120000_comision_b2b_v6_cobro_quien_registro.sql`, pendiente de aplicar)
>
> - `comision_b2b_v6`: **función NUEVA**, idéntica a la v5 salvo el CTE `cobros`, que agrupa por `NULLIF(TRIM(vendedor_registro), '')`. El CTE `ventas` es **byte a byte el mismo** (candado que compara los dos textos). La v5 **no se dropea**: es la vara de comparación. Las dos rutas llaman `leerComision` (`lib/comisiones/rpc.ts`), que pide la v6 y **cae a la v5 mientras la DDL no corra**, diciendo `regla_cobro: "cartera"` — el fallback confiesa.
> - `comision_b2b_detalle` v3, **en la misma DDL**: el modal lista los recibos que ESA persona registró. Resumen y detalle cambian de regla en la misma corrida, nunca uno solo.
> - **TRIM**: joystep registra a `"DANIEL LEVY "` con espacio final (40 recibos en 2026). Sin recorte saldría como otro vendedor y no cruzaría con `comision_vendedor_tasa`.
> - Retenciones, mostrador (`TCKCTA`) e intercompañía **siguen fuera**, en las dos funciones. `comision-cobro-sin-retenciones.test.ts` ya vigila la v6 en su lista explícita y en el barrido.
> - `vendedor_registro` **nunca viene vacío** en 2026 (0 de 1.615); si un día viniera, ese recibo no comisiona a nadie (no se le adivina dueño).
> - **La VENTA no cae a cartera en ningún documento de 2026**: 0 de 1.818 filas de utilidad quedan sin match en `switch_facturas`. El fallback `COALESCE(dv.vendedor_factura, f.vendedor)` de la v5 se conserva en la v6 pero no lo usa nadie.
>
> ### DEFAULT y Daniel: se calcula, se muestra, NO se paga
>
> `DEFAULT` es el usuario #1 de cada empresa en Switch — la oficina — y con la regla nueva junta cobro de verdad: **2.868,71 USD en ene–ago 2026** (119 recibos, 573.739,59 de base). Daniel, **2.333,15**. La decisión: la fila queda con su número (hay que poder cuadrar qué se cobró), pero **no entra al total**. La lista vive en **un solo lugar**, `VENDEDORES_SIN_PAGO` (`lib/comisiones/sin-pago.ts` = `DEFAULT · DANIEL LEVY`, comparación recortada y en mayúsculas); el servidor marca `se_paga` en las dos rutas —igual que `netearComisiones`— y las pantallas y el Excel solo leen la marca: fila gris con **«no se paga»**, pie **«Total a pagar»** que suma solo lo pagable, y en el Excel el rótulo va pegado al nombre para que sobreviva a cualquier filtro. La fila `DEFAULT` pasó de **«Sin asignar»** a **«Oficina (DEFAULT)»**: «sin asignar» era cierto cuando solo caían ventas de clientes sin dueño; ahora sí está asignado, a la oficina, y Daniel la llama por su nombre de Switch.
>
> ### La medición — con el SQL REAL, antes de aplicar
>
> `PGLITE_DIR=… node -r dotenv/config scripts/_medir-comision-cobro-v6.mjs` (solo lectura) baja recibos, utilidad, facturas, vendedores y tasas de 2026 de las 6 del grupo, los carga en un Postgres local (pglite) con las columnas reales y **corre los dos archivos `.sql` del repo sin editarlos**. Primero cuadra: la v5 local contra la RPC v5 de producción, **640 celdas, 0 distintas** — los datos son los de producción. La venta entre v5 y v6: **0 celdas movidas**.
>
> Comisión de **cobro**, ene–ago 2026, hoy (cartera) → nuevo (quien registró):
>
> | vendedor | hoy | nuevo | diferencia |
> |---|---:|---:|---:|
> | REINALDO ESPINOSA (+ su usuario «REYNALDO» en Active Wear) | 41.044,08 | 43.551,22 | **+2.507,14** |
> | DANIEL LEVY | 389,29 | 2.333,15 | +1.943,86 |
> | EDWIN | 7.126,38 | 4.485,88 | **−2.640,50** |
> | DEFAULT (oficina) | 3.131,50 | 2.868,71 | −262,79 |
> | Rodrigo | 252,19 | 0,00 | −252,19 |
> | AGUAS | 67,27 | 24,98 | −42,29 |
> | **GRUPO** | **52.012,43** | **53.266,01** | **+1.253,58** |
>
> Por empresa: Active Shoes +1.159,25 · Active Wear +579,81 · Fashion Shoes −75,64 · Fashion Wear −409,85 · Joystep +0,01 · Vistana 0,00 (todos al 0,5%: la plata cambia de mano, no de monto). El +1.253,58 del grupo es Reinaldo cobrando al **1%** recibos que antes se atribuían a la cartera de DEFAULT (0,5%). El centavo de joystep es el TRIM: «DANIEL LEVY » y «DANIEL LEVY» eran dos filas redondeadas por separado.
>
> **Lo que de verdad se paga** (sin DEFAULT ni Daniel): hoy **48.491,64** → nuevo **48.064,15** (**−427,49** para la empresa). Lo que se muestra pero no se paga: 3.520,79 → **5.201,86**.
>
> Recibos que comisionan: 727; **140 cambian de mano** (1.262.227,88 de base): Vistana 45 · Active Wear 38 · Active Shoes 23 · Fashion Wear 13 · Joystep 12 · Fashion Shoes 9. Rodrigo es dueño de cartera y nunca registra un recibo: pasa a 0.
>
> ### Candados
>
> `comision-cobro-quien-registro.test.ts` (21): el SQL sin comentarios (cobros por `vendedor_registro`, cero `vendedor_cartera` en la DDL, CTE ventas idéntico a v5, v5 intacta, los tres filtros), `leerComision` con supabase doblado (v6 primero, v5 solo si la función no existe y confesando `cartera`, un timeout NO cae), Boston y Multifashion nunca llegan a la RPC, y `se_paga` en las dos rutas. `comisiones-no-se-paga.test.tsx` (7) monta las DOS vistas reales y lee la celda, la marca, el pie y lo que recibe el Excel. Cuatro candados que fijaban «v5» o «Sin asignar» **cambiaron de dirección** con su nota (`comisiones-consolidado-neto` · `comisiones-descuentos-una-sola-resta` · `comisiones-joystep-entra` · `excel-exports-ventas`); ninguno se borró.
> - **Verificado por mutación, 17 de 17 cazadas** (`scripts/_mutar-candados-comision-cobro-v6.sh`): el cobro vuelve a cartera en la v6 · el detalle vuelve a cartera · se pierde el TRIM · el CTE ventas cambia · se cae el filtro de retenciones · la DDL dropea la v5 · `rpc.ts` vuelve a la v5 · el fallback no confiesa · **Boston entra** · Daniel sale de la lista · `sumarPagable` suma todo · la ruta pierde la marca · DEFAULT se esconde · el gran total suma lo que no se paga (matriz) · ídem «Por empresa» · ídem Excel · la oficina vuelve a «Sin asignar». CONTROL verde (113).


---

## 🔴 Comisiones — CLIENTES QUE NO COMISIONAN para un vendedor, y la pestaña Configuración (3-sep-2026)

> Daniel, textual: ***«crea configuración en comisiones para desactivar cálculos de clientes»***. Grano: ***«cliente vendedor»***. ¿Aplica a la venta también? ***«correcto, también venta»***. Sobre el nombre y el lugar: ***«lo de las exclusiones, no lo llames así y ponlo en Configuración»***, y después ***«¿por qué en card y no como tab en toda la pantalla normal?»***. Y de paso: ***«en comisiones me gusta que lo separes, pero cuando lo configures tú, pon a Reinaldo 1 y 1»***.
>
> ### Qué pidió, en una tabla
>
> | Empresa | Vendedor | Clientes que NO le comisionan |
> |---|---|---|
> | Active Shoes | REINALDO ESPINOSA | D-84 Kheriddine · D-103 Metro Shoes · D-145 Super Centro La Competencia · D-104 Millenium Sports · D-115 Novedades El Dollar |
> | Active Wear | REINALDO ESPINOSA **y REYNALDO ESPINOSA** | D-156 Wolf Mall Center · D-49 El Punto Poderoso · D-98 Lutylui · D-42 De City Moda Del Norte · D-104 Millenium Sports · D-50 El Remate |
>
> Los 11 códigos se verificaron contra `switch_clientes` de cada empresa antes de cargarlos. En Active Wear Reinaldo tiene **dos usuarios de Switch** (medido 2026: 20+4 facturas, 25+28 recibos con cada grafía); **no hay tabla de alias** — la exclusión se carga una vez por grafía, así que son **17 filas para 11 pares**.
>
> ### Cómo se resta (`20260912120000_comision_exclusion_v7.sql`, pendiente de aplicar)
>
> - Tabla `comision_exclusion`: `empresa_key · cliente_codigo · vendedor` (los dos últimos guardados ya en `UPPER(TRIM())`, con CHECK), `activa`, quién y cuándo la creó y la quitó. **Soft delete firmado y nunca DELETE** (el GRANT no lo da; hay barrido sobre `src/` y sobre las migraciones). La unicidad es **solo entre activas**: excluir, quitar y volver a excluir son tres filas, una activa. Sin columna `motivo`: Daniel no la pidió. RLS solo `service_role`.
> - `comision_b2b_v7`: **función NUEVA**, la v6 byte a byte (candado que compara los dos cuerpos sin las líneas de exclusión) más un `LEFT JOIN comision_exclusion ce … AND ce.activa = true` + `WHERE ce.id IS NULL` en el CTE `ventas` **y** en el CTE `cobros`. En la venta el código del cliente no está en `switch_factura_utilidad`: se resuelve por el puente de siempre `switch_facturas.cliente_switch_id → switch_clientes.codigo` (0 documentos de 2026 sin puente). El detalle (`comision_b2b_detalle` v4, misma DDL) excluye lo mismo, para que el modal cierre al centavo con la tabla.
> - `leerComision` pide v7 → cae a v6 → cae a v5, y la respuesta dice `version`, `regla_cobro` y `exclusiones_aplicadas` — el fallback confiesa.
> - La misma DDL deja escrito **Reinaldo 1 % venta / 1 % cobro** (las dos grafías). Medido antes de escribirlo: **ya estaba en 1 y 1 en producción desde el 26-ago** — el `UPDATE` es idempotente y hoy no toca ninguna fila.
>
> ### La medición — con el SQL REAL, antes de aplicar
>
> `PGLITE_DIR=… node -r dotenv/config scripts/_medir-comision-exclusiones-v7.mjs` (solo lectura): baja recibos, utilidad, facturas (con `cliente_switch_id`), clientes de Switch, vendedores y tasas de 2026, los carga en pglite y corre los tres `.sql` del repo sin editarlos. Cuadre v5 pglite vs v5 producción: **695 celdas, 0 distintas**.
>
> Comisión total ene–sep 2026, v6 → v7:
>
> | | v6 | v7 | diferencia |
> |---|---:|---:|---:|
> | Active Shoes · REINALDO ESPINOSA | 5.504,65 | 5.056,98 | **−447,67** (venta −150,96 · cobro −296,71) |
> | Active Wear · REINALDO ESPINOSA | 465,91 | 345,73 | **−120,18** (solo cobro) |
> | Active Wear · REYNALDO ESPINOSA | 333,34 | 302,33 | **−31,01** (solo cobro) |
> | **GRUPO** | **90.789,79** | **90.190,93** | **−598,86** |
>
> **Nadie más se movió** (las otras 4 empresas y los demás vendedores: 0,00 en todas las celdas) y **nadie sube**. Lo que quedó fuera: en Active Shoes 4 documentos de venta (D-84 y D-145, 15.096 de base) y 9 recibos (29.671,20); en Active Wear 8 recibos (15.118,21). En Active Wear la venta no se movió porque **todas las facturas a esos clientes las hizo DEFAULT**, que sigue comisionando — es exactamente la regla «otro vendedor con el mismo cliente sí». Un recibo de D-49 registrado por DEFAULT en Active Wear sigue comisionando por la misma razón.
>
> Reinaldo al 1 % de venta (como está): 29.538,29 en ene–sep; al 0,5 % sería 14.769,15. Efecto del `UPDATE` de la migración sobre 2026: **0,00**.
>
> ### La pantalla: Comisiones › Configuración
>
> Era el modal «Configurar» de «Por empresa», con una sola tasa. Ahora es el **tercer chip** del módulo `/comisiones` (solo admin; la pestaña Comisiones de Ventas no lo lleva — *«es el módulo Comisiones aparte, no la pestaña de Ventas»*), a pantalla completa, con dos tarjetas con borde: **«Tasas por vendedor»** (Venta y Cobro por separado; DEFAULT y Daniel en gris con «no se paga» y sin cajas) y **«Clientes que no comisionan»** (Empresa · Cliente con nombre y código · Vendedor · Desde · ×; «+ Agregar» abre una fila inline Empresa → Cliente con `ClienteSwitchPicker`, el único selector permitido → Vendedor → Guardar; quitar pide confirmación con `ConfirmDeleteModal`). El vendedor se elige de los que **de verdad aparecen** en facturas y recibos del año de esa empresa (más el maestro y las tasas), así que «REYNALDO ESPINOSA» sale aunque el maestro no lo conozca. En las tablas de comisiones el vendedor lleva **«N clientes sin comisión»** con los nombres en el tooltip — informativo: quien resta es la RPC, y si la tabla no existe la marca no sale y la tabla sí (falla abierto). El botón «Configurar» de Por empresa lleva a la pestaña. Nunca se escribe «exclusión» en pantalla.
>
> ### Candados
>
> `comision-exclusion-v7.test.ts` (33): el SQL sin comentarios (tabla, unicidad parcial, RLS, GRANT sin DELETE, las 17 filas, Reinaldo 1 y 1, v7 = v6 sin las líneas de exclusión, JOIN en ventas y cobros y en el detalle), **la conducta con el SQL corriendo en pglite** (activa resta en venta y cobro; DEFAULT con el mismo cliente sigue; inactiva no resta; se puede volver a excluir; el detalle cierra; atrapa el nombre con espacio o en minúsculas) — ese bloque se omite si pglite no está instalado —, `leerComision` v7 → v6 → v5 confesando, validación fail-closed, la marca normalizando el nombre, las rutas (403 a todo rol menos admin, 401 sin cookie, POST valida, DELETE = UPDATE firmado y 404 al repetir) y el barrido anti-DELETE. `comisiones-configuracion-pantalla.test.tsx` (10): el chip solo admin y solo en `/comisiones`, la pestaña no dice «exclusión», Reinaldo 1.00/1.00, Daniel sin cajas, la lista sin Motivo, quitar con confirmación y sin DELETE hasta confirmar, «+ Agregar» con el selector compartido. Cuatro candados cambiaron de dirección con su nota (`comision-cobro-quien-registro` · `comisiones-consolidado-neto` · `comision-cobro-sin-retenciones` · `ventas-poda-textos`).
> - **Verificado por mutación, 29 de 29 cazadas** (`scripts/_mutar-candados-comision-exclusiones-v7.sh`): inactiva sigue restando · la venta deja de excluir · el cobro deja de excluir · el cliente queda excluido para todos · el detalle no excluye · v7 deja de ser v6 · la DDL dropea la v6 · unicidad total · GRANT con DELETE · falta una de las 17 · Reinaldo no queda en 1 y 1 · vuelve `motivo` · rpc.ts vuelve a v6 · el fallback miente · quitar hace DELETE · la ruta se abre a secretaria · el directorio a contabilidad · pasa TCKCTA · pasa Boston · se pierde la normalización · se pierde la marca · el chip lo ve cualquiera · el chip en Ventas · vuelve «exclusión» · Daniel con cajas · vuelve Motivo · quitar sin confirmar · voseo · selector propio. CONTROL verde.

---

## 🔴 Comisiones — LOS DESCUENTOS SE RESTAN UNA SOLA VEZ, EN EL SERVIDOR (24-ago-2026)

> 🩸 **LA MISMA PERSONA, EL MISMO MES, DOS NÚMEROS EN LA MISMA PANTALLA.** La pestaña **«Por empresa»** mostraba el SUBTOTAL —sin restar los descuentos fijos— mientras **«Todas las empresas»** y el detalle del vendedor sí los restaban. Medido contra producción, **REINALDO ESPINOSA en Fashion Shoes** (sus dos descuentos: `Descuento` $1.400,00 + `Descuento de adelanto` $173,08 = **$1.573,08**, los ÚNICOS dos descuentos vivos de todo el sistema):
>
> | período | Por empresa (antes) | Todas | Por empresa (después) |
> |---|---:|---:|---:|
> | junio 2026 | $3.208,42 | **$1.635,34** | **$1.635,34** |
> | julio 2026 | $2.859,65 | **$1.286,57** | **$1.286,57** |
> | agosto 2026 | $2.571,48 | **$998,40** | **$998,40** |
>
> **Y el Excel de esa vista bajaba el número inflado.** Daniel ya había reclamado exactamente esto el 3-ago-2026 (*"me sale en el web el total, y no me resta el descuento"*) y **se arregló en UNA pestaña y no en la otra** — la resta quedó viviendo DENTRO del pivot de `ComisionesConsolidadoView`, así que la otra pestaña, que pide otro endpoint, nunca la tuvo.
>
> ### 🔑 EL ARREGLO NO ES UNA SEGUNDA RESTA: ES MOVER LA ÚNICA AL SERVIDOR
>
> **`netearComisiones()` en `src/lib/comisiones/descuentos.ts`** —el módulo que ya existía para que la LECTURA de descuentos y la regla del `activo` efectivo no se duplicaran— y **las DOS rutas la aplican antes de responder**: `/api/ventas/comisiones` y `/api/ventas/comisiones/consolidado`. Las vistas **solo dibujan `comision_total`**; ninguna resta nada.
> - **Copiar la resta en la vista que faltaba habría cerrado el bug de hoy y dejado el mecanismo intacto** para mañana: dos implementaciones son dos totales posibles para el mismo mes. Hay barrido que pone el build ROJO si una vista vuelve a restar (`- monto`, `- v.descuento`, `-=`…), con los comentarios borrados primero.
> - La respuesta trae además **`descuento`** por vendedor: es lo que deja explicar en pantalla por qué el total no es la suma de las dos comisiones.
> - **`DEFAULT` no recibe descuento**: es el centinela "cliente sin dueño", no una persona.
> - ⚠️ **La RPC `comision_b2b_v5` NO SE TOCÓ.** La base sigue siendo la **VENTA** (`subtotal_con_descuento`) de las facturas con `pct_utilidad > 20`, las NC restan, y las 6 empresas comisionan igual.
>
> ### La asimetría de los errores se conserva, y ahora en las DOS rutas
>
> **Los descuentos fallan ABIERTO** (si su lectura se cae, la tabla sale con descuentos en 0 en vez de quedar en blanco) y **un error de las COMISIONES sí se propaga (500)**: una tabla vacía silenciosa se leería como *"este mes no se vendió nada"*.
>
> ### En pantalla: se dice CUÁNTO se restó, y crece HACIA ABAJO
>
> Debajo del nombre del vendedor, `− $1.573,08 en descuentos` (13 px, gris) — y en la tarjeta del celular, una línea `Descuentos`. **No se agregó una columna**: una séptima habría ensanchado la tabla justo en el iPad acostado, que es el ancho que nadie mira. Se sumó también el mismo pie que ya tenía la matriz (*"Ya están descontados lo devuelto y los descuentos"*): las dos pestañas muestran el mismo neto, así que tienen que explicarlo igual.
>
> ### Medición contra producción, ANTES y DESPUÉS
>
> `BASE=… node scripts/_medir-comisiones-dos-pestanas.mjs` (solo lectura) abre las DOS pestañas en el navegador contra el build de producción, recorre 3 períodos × 6 empresas y compara **la CELDA RENDERIZADA**, no el JSON.
> - **ANTES: 33 iguales · 6 distintas.** DESPUÉS: **36 iguales · 0 distintas de plata.**
> - **Ningún otro número se movió** (`node scripts/_verif-comisiones-nada-mas-se-movio.mjs`, por POSICIÓN y no como conjunto): **478 celdas comparadas · 6 cambiaron · las 6 son la celda de Reinaldo y el total al pie de Fashion Shoes en los 3 períodos**. La matriz de «Todas las empresas» **no movió una sola celda**.
> - **Los 4 anchos + el iPad Pro acostado** (`_medir-comisiones-tabla.mjs`): **390 · 834 · 1024 · 1180 · 1440 → 0 px de arrastre de página, 0 de arrastre interno y 0 de recorte**, en los DOS modos. Y `_medir-comisiones-letra-y-tocables.mjs`: **0 textos bajo 12 px y 0 tocables bajo 44 px**.
> - ⚠️ **Las 3 diferencias que QUEDAN son de AGUAS y son PRE-EXISTENTES**: la matriz lo esconde a propósito desde el 3-ago-2026 (*"quita el vendedor aguas, no lo quiero ver"*) y «Por empresa» lo sigue mostrando. **No es plata mal sumada, es visibilidad**, y unificarlo es decisión de Daniel — se anota, no se cambia de paso.
>
> ### Candados
>
> `src/__tests__/lib/comisiones-descuentos-una-sola-resta.test.ts` (16) y `src/__tests__/components/comisiones-por-empresa-neto.test.tsx` (8). **Son de CONDUCTA**: llaman a los handlers REALES con supabase doblado y comparan las dos pestañas celda por celda, y montan las vistas REALES para leer la celda, la tarjeta del celular y **lo que recibe el Excel** (que arma su propia hoja: puede bajar un número que nadie vio).
> - **El candado viejo de `comisiones-consolidado-neto.test.ts` CAMBIÓ DE DIRECCIÓN**: exigía que la resta viviera dentro del pivot de la vista (`target.porEmpresa[...] = round2(...)`), o sea que **era el candado el que fijaba el bug**. Hoy exige lo que siempre quiso decir: que el descuento caiga en la celda de SU empresa, restado UNA vez.
> - **Verificado por mutación, 13 de 13 cazadas** (`bash scripts/_mutar-candados-comisiones-descuentos.sh`): `netearComisiones` no resta · no redondea · le resta al centinela DEFAULT · «Por empresa» vuelve a devolver la RPC cruda (el bug) · los descuentos dejan de fallar abierto · un error de comisiones se disfraza de tabla vacía · «Todas» deja de restar · el descuento cae en la empresa equivocada · la pantalla deja de decir cuánto se restó · la celda vuelve a pintar el subtotal · el Excel baja el subtotal · vuelve una SEGUNDA resta a la vista consolidada · la tarjeta del celular deja de decirlo.
> - 🩸 **DOS mutaciones SOBREVIVIERON en la primera corrida y las dos eran candados flojos**: la segunda resta en la vista consolidada (el barrido miraba `- monto` y no `- v.descuento`) y la tarjeta del celular (no la cubría ningún test). Se cerraron con tests que **pintan** la vista consolidada y la tarjeta, no con más barrido de texto.
> - 🩸 **La restauración del script de mutación va por COPIA, no con `git checkout`**: hay archivos NUEVOS en la rama y git aborta el comando entero sin restaurar nada.
> - 🩸 **Gotchas de medición, y los tres daban verde (o rojo) sin haber mirado nada:** esta app **no tiene `<main>`** —buscar `main table` devuelve `null`—; esperar "hay tabla con filas" JUSTO después del clic mide **la tabla VIEJA**, la que sigue en pantalla mientras sale el pedido nuevo (hay que esperar la RESPUESTA del endpoint); y tocar la pestaña o la empresa que YA está activa **no dispara ningún pedido**, así que esperar una respuesta ahí cuelga la medición.


---

### Ventas (April 10-11)
- View preference saved to localStorage

> **Ventas › Resumen en CELULAR: tarjetas, no matriz (30-jul-2026).** Daniel, textual: *"todavia hay q hacer mucho scroll a la derecha para ver la info"*. Medido en el navegador a 390 px sobre el build de producción: el heatmap pedía **1.109 px contra 356 visibles = 753 px de arrastre**, el peor de las 26 pantallas censadas (el CXC, ya pasado a tarjetas, mide 0). Con 12 meses en 390 px se ven DOS a la vez, así que el heatmap no cumplía ni su propia promesa —comparar empresas dentro del mismo mes— porque para llegar a la columna había que perder de vista la de nombres.
> - **Después: 54 px, y NO son de la tabla** — es la tira de pestañas del módulo (Resumen/Clientes/Productos/Utilidad), que ya desbordaba lo mismo en los 4 tabs desde antes. La tabla pasó de 753 a **0**.
> - **El patrón es el de `admin/components/PanelCxcMobile.tsx`** (tabla ancha → tarjetas), no uno nuevo. Cerrada, la tarjeta muestra empresa + total del año + **el período en curso** (lo que era la columna resaltada del heatmap: sin eso habría que abrir las 8 tarjetas para ver cómo va el mes). Abierta, la lista vertical de los 12 meses (o 4 trimestres) + Total + Proyección, y un enlace al panel mes × año.
> - **El ESCRITORIO NO SE TOCÓ.** Sigue con su matriz en `ResumenView.tsx` detrás de `hidden md:block`: en una pantalla ancha se ve entera y es mejor que las tarjetas. Por eso NO se unificaron, y por eso los candados de `ventas-fila-detalle.test.ts` ahora verifican cada regla contra la vista que le corresponde — exigirle al celular un `colSpan` o un ancho medido sería exigirle la tabla de vuelta.
> - **NINGÚN número cambió, y está medido:** `node scripts/_verif-ventas-tarjetas.mjs` abre las 9 tarjetas en 390 px, lee sus 12 meses + Total + Proyección y los compara **celda por celda contra la matriz del escritorio a 1440 px** — 79 celdas, 0 distintas. ⚠️ El texto crudo de las dos vistas NO es comparable tal cual: el escritorio pega el Δ al monto en la misma celda y el celular usa formato compacto en los totales (`$27K`) desde mucho antes de este cambio. La tolerancia sale de la **precisión que se muestra** (`$27K` no distingue nada por debajo de medio millar), no de un porcentaje al ojo — con un 0,5 % fijo, 27K contra 26.574,97 se leía como "cambió el número" siendo solo el redondeo.
> - **El detalle por período se conserva y sigue abriendo donde se tocó**, ahora como `FilaDetalleBloque` (un `<div>`) en vez de `FilaDetalleTr`. `FilaDetalle.tsx` dibuja el contenido UNA vez (`FilaDetalleContenido`) para las dos formas: cinco copias de la misma celda es lo que ya había divergido en el heatmap —la Proyección del grupo era un `<td>` mudo mientras la de cada empresa sí explicaba de dónde salía—. El bloque de tarjeta **no lleva ancho fijo**: no hay contenedor con scroll lateral que compensar, que es justo lo que se vino a eliminar.
> - **Cerrar la tarjeta cierra el detalle que tuviera adentro.** Sin eso queda vivo en el state del padre y reaparece al volver a abrirla.
>
> **CENSO de scroll lateral a 390 px — `node scripts/_medir-scroll-lateral.mjs`** (26 pantallas, solo lectura). Lo que queda pendiente, de peor a mejor: **Comisiones 628 px** (7 columnas), **Data Health 448**, **Préstamos › Detalle 315** (+218 px cortados), **Depurador 295** (tira de pestañas), **Multifashion › Clientes 288 CORTADOS**, **Ventas › Utilidad 284**, **Ventas › Productos 204**, **Vista General 204**. Sanas en 0: CXC, Cheques (lista y calendario), Caja, Préstamos lista, Guías, Reclamos, Proveedores, Clientes (lista y ficha), Multifashion Resumen/Vendedoras, Marketing, Gastos de Empresa.
> - **Dos desbordes del censo son CARRUSELES a propósito, no defectos:** Ventas › Clientes 369 px y Caja › Período 327 px, los dos con `scroll-snap`. El script los anota igual —no adivina intención— y guarda el `snap` en el JSON para poder distinguirlos a mano.
> - 🩸 **"Recortado" y "hay que arrastrar" NO son lo mismo, y el peor de los dos es el que no se ve.** `Multifashion › Clientes` pierde 288 px con `overflow:hidden`: el dato queda fuera de la pantalla y **no hay forma de alcanzarlo ni arrastrando**. El script lo reporta aparte (`CORTADO`). Distinguir esos de un texto con puntos suspensivos —donde que `scrollWidth` pase del `clientWidth` ES el mecanismo, no un defecto— necesitó dos criterios, porque un `<table>` adentro no alcanza: esa tabla está hecha de `div`. El segundo es de tamaño y el umbral está MEDIDO: en las 26 pantallas todo recorte de texto quedó en **≤53 px** y el único recorte de datos real fue de **288**. Contar los recortes de texto era ruido puro — el CXC, que ya está resuelto, salía con 2 px por un nombre de cliente.
> - ⚠️ **Una tabla vacía mide 0 px y no prueba nada.** El veredicto lo dice (`SIN-DATOS`), y el largo del texto NO sirve para detectarlo: Reclamos, con 26 reclamos y 5 tarjetas, tiene menos texto que el mensaje de "no hay nada" de otra pantalla. La señal confiable es que la pantalla lo DIGA ("No hay…"). Hoy solo Packing Lists está genuinamente vacía.
> - **Gotchas de medición:** sembrar la cookie de sesión **y** `sessionStorage.cxc_role` (si no, todo redirige al login), y `delete Navigator.prototype.serviceWorker` antes de navegar (bloquear el SW de otra forma mata la hidratación). **Préstamos › Detalle se mide por URL directa**: en un viewport <640 px `handleRowClick` abre un bottom sheet en vez de navegar, así que su tabla de movimientos no se alcanza tocando la lista.

### Upload (April 10-11)
- 3-step progress indicator


---

### Ventas › Referencia — la primera caja deja de INTERPRETAR (11-ago-2026)

> ⚠️ **ESTA SECCIÓN ES DE LA MAÑANA. Lo de la fila de costos, el botón "Ver las otras N compras" y los dos pies de página quedó SUPERADO esa misma noche** — ver *"UNA fila de plata, y el mismo número una sola vez"* más abajo. Todo lo demás (la caja de Compras cruda, el fin del reparto FIFO, el cotejo agregado) sigue vigente tal cual.

> 🩸 **LA CAJA "Mi última compra" NO SERVÍA, Y NO ERA UN PROBLEMA DE REDACCIÓN.** Decía *"todavía no se acaba · llegó 180 el 19 feb · van 0"*, y ese "van 0" salía de un **reparto FIFO** que le asignaba ventas a cada llegada para poder contestar "¿cuánto tardó ESTA compra?". Eso solo se sostiene si la mercancía viene marcada por tanda, y **no viene**: cuando llega un contenedor SOBRE stock que todavía no se acaba, decir de qué compra salió una venta es **INVENTAR**. Y el caso real de Daniel es exactamente ése — `NB2570001` tiene tres compras recientes que bajo FIFO no habían vendido nada, así que la caja más visible de la pantalla anunciaba **"van 0 de 180"** mientras el artículo vendía **28 u/mes**. Cero información, en el peor lugar.
>
> Daniel, textual: *"si llego una compra mientras tenia stock, yo lo que quiero ver en cuanto tiempo se me mueve el articulo, para saber si con el stock actual que tengo debo de comprar mas, menos o no comprar. **pero no quiero que decidas tu, lo decido yo con la data que me extraigas**"*.
>
> **AHORA la primera caja se llama "Compras" y muestra FECHA y CANTIDAD, la más reciente arriba.** Nada más. Los dos números que sí contestan su pregunta —**Vendo por mes** y **Me queda para**— no se tocaron.
>
> ```
> Compras                    Vendo por mes      Me queda para
> 19 feb 2026 · 180 u             28 u             13 meses
> 11 feb 2026 · 120 u        promedio de los     345 en bodega
> 21 oct 2025 ·  60 u        últimos 12 meses
>  9 abr 2025 · 240 u
> Ver 1 compra más           ← botón: la 5ª de los 3 años, ya en el payload
> y 2 más de hace años       ← texto: ésas NO vienen, solo el conteo
> ```
>
> **Cuántas se muestran: 4** (`COMPRAS_VISIBLES`, el número del mockup aprobado). Es lo que cabe sin empujar a las otras dos cajas —la caja crece HACIA ABAJO y a 390 px las tres van una debajo de otra— y lo que se está decidiendo es REPONER, o sea que pesan las últimas. **El resto sigue alcanzable de un toque, y el enlace del pie de la tarjeta ("Ver las N compras anteriores") se INTEGRÓ en la caja**: tener el resto de la lista en otro lugar de la tarjeta que la enseña no ayudaba a nadie. Con **una sola compra** la caja lo dice: `26 dic 2025 · 180 u` + *"única compra"*.
>
> 🔴 **DOS LÍNEAS DISTINTAS PORQUE SON DOS COSAS DISTINTAS.** Las compras que no entran en las 4 pero **sí están dentro de los 3 años ya vienen en la respuesta** → botón, se despliegan sin tocar la red. Las de **más de 3 años NO vienen** (solo el conteo) → texto, no se pueden desplegar. Juntarlas en un solo "y N más" prometería desplegar algo que no está.
>
> **El límite de 3 años se conserva, y el aviso también** — reescrito: *"Hay N compras más viejas de 3 años que no se muestran — lo que trajeron sí cuenta para lo que hay en bodega"*. Sin eso, el total de bodega no cerraría contra las compras que se ven y la pantalla parecería equivocada. (Antes decía *"sí cuentan para el reparto"*, que era lenguaje del FIFO que se fue.)
>
> **La línea `Esta: … · Anterior: …` SE ELIMINÓ**: nacía del mismo reparto inventado.
>
> #### Qué código se borró, y la prueba de que nada más lo usaba
>
> De `src/lib/ventas/compras.ts` se fueron **`repartirFifo` · `RepartoFifo` · `medirCompra` · `CompraMedida` · `EstadoCompra` · `repartirExistencia` · `resumirArticulo` · `ResumenArticulo` · `mesesVendiendo` · `estaAgotada` · `textoMesesVendidos` · `nombreMes` · `diasEntre` · `DIAS_POR_MES` · `UMBRAL_VENDIDO`**; de `resumen-articulo.ts`, **`resumirCompra` · `ResumenCompra` · `lineaComparacion`**; de `referencia-excel.ts`, **`textoSeVendio` · `mesesDeCompra` · `textoAgotadas`**. `ArticuloCompras.compras` pasó de `CompraMedida[]` a `Compra[]` (fecha, cantidad, costos, proveedor, documento) y `ArticuloCompras.resumen` desapareció del contrato del API.
>
> **Los consumidores se auditaron uno por uno antes de borrar** (`grep` sobre `src/` y `scripts/`): la vista `ReferenciaView.tsx`, el route `/api/ventas/referencia`, el Excel `referencia-excel.ts`, 4 tests y 4 scripts `_diag`/`_verif`. **Ninguna otra pantalla y ningún otro export los tocaba.** El Excel SÍ los consumía y por eso se actualizó (ver abajo) en vez de romperse. Los 3 scripts que existían solo para medir el diseño removido se borraron (`_diag-formas-resumen`, `_diag-bordes-resumen`, `_diag-resumen-articulo`) y `_verif-compras-referencia.ts` se reescribió sobre la caja nueva.
>
> #### Lo que ocupó el lugar del FIFO, y por qué hacía falta algo
>
> Tres cosas seguían dependiendo del reparto y **no son atribución**: los avisos *"se vendieron N antes de la primera compra"* / *"N vendidas de más"*, el gate del **ajuste de inventario** y el *"N en bodega sin compra que las respalde"*. Todo eso se puede afirmar **en agregado**, sin marcar cajas, y ahora sale de **`cotejarVentasConCompras()`**: recorre los días en orden, va sumando lo que fue LLEGANDO y pregunta si alcanza. Devuelve `{vendidoAntes, vendidoDeMas, respaldado}` y **NADA por compra** — hay un test que lo fija leyendo las claves del objeto.
> - **La semántica de los dos baldes es EXACTAMENTE la de antes**, borde por borde: una venta anterior a toda compra va a `vendidoAntes`, una posterior que no cabe va a `vendidoDeMas`, y una devolución sin nada consumido deja `vendidoDeMas` **negativo**. ⚠️ El borde fino: *"¿ya llegó alguna?"* se pregunta por la **cantidad de compras llegadas**, no por las unidades — una compra de 0 unidades igual es una llegada, y preguntarlo mal manda el sobrante al balde equivocado.
> - **El aviso del ajuste sale del CUADRE del artículo** (`comprado − vendido − existencia`), no de repartirle faltantes a cada compra. Da el mismo número en el caso que Daniel reconstruyó a mano (`40HM265032`: 280 − 279 − 0 = **1 unidad**) y es más correcto cuando hay compras de más de 3 años, porque las cuenta.
> - **`stockSinRespaldo`** = `existencia − (comprado − respaldado)`, acotado a ≥ 0.
> - 🔴 **El cotejo mira TODAS las compras, también las de más de 3 años.** Si la ventana de pantalla lo recortara, las ventas viejas quedarían sin respaldo, la pantalla avisaría un hueco inexistente y —peor— **apagaría el aviso del ajuste**, que exige que la cuenta cierre. Hay un test.
>
> #### El Excel refleja la caja nueva
>
> **Hoja "Referencia"** (una fila por ARTÍCULO): perdió `Mi última compra`, `Vendidas`, `Meses en venderse`, `Anterior: meses` y `Compras anteriores`; ganó **`Última compra: llegó` · `Última compra: cuánto` · `Compras (últimos 3 años)` · `Compras de más de 3 años`**. Conserva `Anterior: llegó/cuánto`, los tres números, `Vendí a` · `Me costó (CIF)` · `Margen`, los costos y los **12 meses en columnas** (encabezados derivados de la MISMA ventana que la pantalla).
> **Hoja "Compras"** (una fila por COMPRA): queda con **fecha, cantidad y costos** (`Llegó` · `Cuánto` · `CIF` · `FOB` · `FOB de dónde` · `Lista` · `Proveedor` · `Documento`). Perdió `U. vendidas`, `Meses`, `Queda`, `Meses en que vendió` y `Salió a` — las cinco eran atribución. Un test recorre los encabezados de **las dos hojas** y falla si alguna de esas columnas vuelve.
>
> #### Lo que NO se tocó, a propósito
>
> **"Vendo por mes" y "Me queda para"** (incluido que el promedio se divide entre los meses que el artículo lleva vendiéndose y que **el mes en curso NUNCA entra** — medido: 18,3 vs 34,3 u/mes el mismo día) · las **barras de 12 meses** con oct·nov·dic resaltados y la línea de temporada · la **fila de costos completa** con el ⓘ del FOB no confiable y el **margen contra el CIF** · el buscador único · el aviso del ajuste de inventario (*"si hay menos es porq robaron"*) · el "Bajar a Excel".
>
> #### Medición
>
> **Los 3 anchos, en el navegador contra el build de producción y con datos de producción** (`BASE=… CODIGO=… node scripts/_medir-referencia-simple.mjs`, solo lectura): **390 · 834 · 1024 · 1440 → 0 px de arrastre, 0 recortados, 0 blancos táctiles bajo 44 px y 0 textos bajo 12 px**, en los cinco casos reales (`NB2570001` con la lista desplegada Y cerrada, `QD3958033` de una sola compra, `40HM265032` agotado, `RETENCION` sin compra registrada, y el modelo `40HM265` con **43 tarjetas** a la vez). La caja crece **hacia abajo**, que es lo único que puede regalar sin ensanchar nada. El script ahora **falla si encuentra en pantalla cualquiera de los textos de la atribución** (`Mi última compra`, `todavía no se acaba`, `van 0`, `Esta:`).
>
> **Contra producción, los dos artículos de Daniel** (`DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-compras-referencia.ts`, solo lectura, corre los MISMOS módulos puros que la pantalla): `NB2570001` → 4 compras + 1 desplegable + 2 de hace años · 28 u/mes · 13 meses · vendí a $26.92 · margen 39%. `QD3958033` → única compra 26-dic-2025 180 u · 8 u/mes · 16 meses · $6.78 · 34%.
>
> Candados: `src/__tests__/lib/ventas-compras.test.ts` (53), `ventas-resumen-articulo.test.ts` (39) y `ventas-poda-textos.test.tsx` (26, **renderiza la pantalla de verdad y toca el botón de desplegar** — que la lista completa siga alcanzable de un toque no lo puede ver un test de función pura). Incluyen dos barridos estáticos: uno prohíbe que los símbolos del reparto (`repartirFifo`, `medirCompra`, `repartirExistencia`, `CompraMedida`, `UMBRAL_VENDIDO`) vuelvan a `compras.ts`, y otro que ninguna compra del payload traiga campos de atribución (`vendidas`, `quedan`, `meses`, `estado`, `precioVendido`…).


---

### Ventas › Referencia — UNA fila de plata, y el mismo número una sola vez (11-ago-2026, noche)

> Daniel, sobre la pantalla que se acababa de publicar: *"me gusta pero no se siente simple, facil"*. Los números estaban bien; el diagnóstico concreto era que **el mismo $16.56 aparecía TRES veces** en la misma tarjeta —en "me costó", en "CIF de hoy" y en "FOB"— porque Switch manda el FOB **igual al CIF en el 93% de las líneas** (error de carga conocido). Cinco bloques pasaron a tres.
>
> ```
> ANTES                                        AHORA
> Vendí a $26.92 · me costó $16.56 · margen 39%   Precio prom $26.92 · Costo CIF $16.56 ·
> ┌──────────┬─────────────┬───────┬──────────┐   Costo FOB (calculado) $15.05 · margen 39% ·
> │CIF de hoy│CIF anterior │  FOB  │  Lista   │   lista $27.00
> │  $16.56  │   $16.56    │$16.56 │  $27.00  │
> └──────────┴─────────────┴───────┴──────────┘
> Hay 2 compras más viejas de 3 años que…          (los dos pies se fueron)
> Lo que queda en bodega es de Switch, al…
> ```
>
> 🔴 **EL COSTO FOB ES UNA CUENTA NUESTRA, Y SE ROTULA COMO TAL.** Daniel, textual: *"pon costo fob (calcula fob/1.1)"*. **NO se usa el FOB de Switch** — llega igual al CIF en 93 de cada 100 líneas, o sea que no distingue nada. El calculado por lo menos significa siempre lo mismo, y el rótulo dice **"(calculado)"**: un número que parece traído y no lo es sería peor que no tenerlo. **Se REUSA `fobEstimado()`** de `referencia-info.ts`, que ya era la única definición de esta división en el repo (CIF ÷ 1,10, **nunca** CIF × 0,9: no es la inversa y da otro número — Daniel mismo cazó esa diferencia en su día). Candado estático: `costos.fob` y `fobOrigen` **no pueden volver** a `ReferenciaView.tsx`.
>
> 🔴 **EL CIF ANTERIOR APARECE SOLO CUANDO CAMBIÓ**, pegado al costo: `Costo CIF $16.56 (antes $9.46 ↑)` en rojo si subió, en verde si bajó. Era una columna fija que repetía el mismo número en la mayoría de los artículos; ahora es **la señal de que te subieron el costo**, no un dato de relleno. Medido en producción (vistana, 6.250 códigos): **396 tienen el CIF cambiado entre sus dos últimas compras — 118 subieron y 278 bajaron**. Ejemplos reales: `NB3705906` $16.56 (antes $9.46 ↑) · `U2661946` $13.33 (antes $15.79 ↓).
> - ⚠️ **Se compara a la precisión que se MUESTRA (centavos).** Los costos son promedios PONDERADOS de varias líneas: dos compras "iguales" pueden diferir en la milésima, y anunciar "(antes $16.56)" al lado de "$16.56" sería una señal que no señala nada.
>
> 🩸 **`toFixed(2)` y la pantalla NO coincidían, y el caso está en producción.** El CIF de `NB2570001` es **16,555**: la pantalla (Intl) redondea sobre el decimal y muestra **$16.56**, mientras `(16.555).toFixed(2)` mira el binario —que en realidad es 16,554999…— y da **16.55**. O sea que el Excel decía **un centavo menos que la ficha del mismo artículo**. Fuente única: **`centavos()`** en `resumen-articulo.ts`, que formatea con el MISMO formateador de la pantalla y lee el número de vuelta — la igualdad queda garantizada por construcción, no por parecido. La usan el Excel (las dos hojas) y el script de verificación. **Todo monto va a 2 decimales; las unidades siguen enteras.**
>
> **La caja de Compras: 4 líneas y UNA línea gris que no se despliega.** `y 3 compras más`, sin enlace. Antes eran DOS renglones —un botón "Ver las otras N compras" y un texto "y 2 más de hace años"— separados por un detalle NUESTRO (unas venían en el payload y otras no); Daniel ve cuatro fechas y lo que quiere saber es cuántas hay detrás. `ListaCompras` **ya no expone el arreglo escondido** (`{visibles, restantes, unica}`) — si lo expusiera volvería el botón, y con él los dos renglones.
>
> **LOS DOS PIES DE PÁGINA SE ELIMINARON:**
> - *"Hay N compras más viejas de 3 años que no se muestran — lo que trajeron sí cuenta para lo que hay en bodega"*: la caja ya dice "y N compras más", y —lo que hacía falta verificar antes de borrarla— **el total de bodega NO sale de las compras que se ven**. Sale de `switch_articulo_info.existencia`, medido: `NB2570001` = **345**, tal cual en la base, mientras las 4 compras visibles suman 600 y el total comprado es 935. El número no cambia; se va la explicación de una cuenta que la pantalla no hace.
> - *"Lo que queda en bodega es de Switch, al 10-ago, 11:30 pm"*: una hora que no cambia ninguna decisión. (`fmtFrescura` **sigue existiendo** y con su test — solo dejó de usarse acá.)
>
> #### El Excel
>
> **Hoja "Referencia"** — los MISMOS rótulos que la pantalla y en el mismo orden: `Precio prom` · `Costo CIF` · **`CIF anterior (solo si cambió)`** · `Costo FOB (calculado)` · `Margen` · `Lista`. Se fue **`FOB de dónde`** de esta hoja (ya no hay dos procedencias que distinguir: hay una cuenta).
> - **La columna del CIF anterior SE QUEDA pero se llena solo cuando difiere** — decisión tomada: una columna que aparece y desaparece rompe cualquier planilla que apunte a ella, y **vacío ES el dato** ("no cambió"), igual que en pantalla. Está dicho en el subtítulo de la hoja.
> - **Hoja "Compras": intacta, y conserva el FOB CRUDO de Switch con su `FOB de dónde`.** No es una contradicción: esa hoja es el registro tal como llegó, y ahí `"igual al CIF (revisar)"` es justamente el dato que hay que ver para corregirlo EN Switch. La cuenta de la ficha vive en la hoja 1. Lo único que cambió ahí son los 2 decimales.
>
> #### Medición
>
> **Los 3 anchos + el iPad acostado, en el navegador contra el build de producción y con datos de producción** (`BASE=… CODIGO=… node scripts/_medir-referencia-simple.mjs`, solo lectura): **390 · 834 · 1024 · 1440 → 0 px de arrastre, 0 recortados, 0 blancos táctiles bajo 44 px y 0 textos bajo 12 px**, en los seis casos reales (`NB2570001`, `QD3958033` de una sola compra, `NB3705906` con el costo subido, `40HM265032` agotado, `RETENCION` sin compra registrada, y el modelo `40HM265` con **43 tarjetas** a la vez). La fila fusionada es más larga y **crece HACIA ABAJO**: 44 px de alto a 1440, 69 a 834/1024 y 94-119 a 390 (dos o tres líneas), sin empujar nada de lado. El script ahora **falla si encuentra en pantalla** `CIF de hoy`, `Vendí a`, `me costó`, `Lo que queda en bodega es de Switch` o `compras más viejas de 3 años`.
>
> **Contra producción, los dos artículos de Daniel** (`scripts/_verif-compras-referencia.ts`, solo lectura, corre los MISMOS módulos puros que la pantalla y ahora imprime la fila de plata tal como se lee):
> ```
> NB2570001  Precio prom $26.92 · Costo CIF $16.56 · Costo FOB (calculado) $15.05 · margen 39% · lista $27.00
> QD3958033  Precio prom $6.78  · Costo CIF $4.47  · Costo FOB (calculado) $4.06  · margen 34% · lista $7.00
> ```
>
> Candados: `ventas-resumen-articulo.test.ts` (58), `ventas-compras.test.ts` (59), `ventas-poda-textos.test.tsx` (31, **renderiza la pantalla y compara el renglón entero, carácter por carácter**) y `articulo-info.test.ts`. Verificado por mutación: mostrar el FOB de Switch rompe 3, escribir la división a mano rompe 1, volver a `toFixed(2)` en el Excel rompe 2, devolver el botón de desplegar rompe 2 y mostrar el CIF anterior cuando no cambió rompe 2.


---

### Ventas › Referencia — los TRES GRANDES, la línea del 90% y el MODO PEDIDO (12-ago-2026)

> Daniel, sobre la ficha recién publicada: *"el numero importante estan chiquito. cuanto compre es importante, cuanto vendi en total es importante… me queda 2 meses de venta / vendo 11u mes es lo que mas llama la atencion y no es lo mas importante ya que un mes puedo vender mucho y otros meses no, vendo b2b al por mayor no retail"*. La tarjeta se reordenó entera y la vista ahora son TRES archivos: `ReferenciaView.tsx` (buscador y despacho), `ReferenciaTarjeta.tsx` (la tarjeta y su cuerpo) y `ReferenciaTablaPedido.tsx` (modo pedido). Los candados que barren el código de la vista miran los tres.
>
> **1. LOS TRES GRANDES: Compré · Vendí · Me quedan (34 px, unidades).** `Compré` = TODAS las compras registradas (también las de +3 años que la lista no muestra) = `cuadre.comprado`; `Vendí` = neto histórico con NC restadas = `cuadre.vendido`; `Me quedan` = `switch_articulo_info.existencia`, NUNCA deducido. 🔴 **NO SE FUERZA EL CUADRE**: medido en producción, `NB2570001` da 935 − 552 = 383 contra 345 en bodega (residuo 38), y los peores descuadres del barrido (`scripts/_diag-descuadres-referencia.ts`, read-only) son `TERMO` (active_shoes, vendió 1.648 de 796 compradas — faltan compras) y `UMBRELLATH000` (850 compradas, 50 vendidas, 98 en bodega → 702 desaparecidas). Cada número dice su verdad y los avisos de descuadre de siempre (ajuste / vendido sin compra / stock sin respaldo) son la válvula. Debajo de Compré va la lista aprobada (4 líneas `fecha · cantidad` + `y N compras más` gris sin enlace); con UNA compra dice `23 oct 2025 · única compra` (la cantidad ya es el número grande). Vendí dice el % de lo comprado (`textoParteVendida`).
>
> **2. LA LÍNEA DEL 90% reemplaza al "vendo por mes" como protagonista.** Daniel: *"creo que es mas importante saber en cuanto meses se vendio digamos que el 80%? 90%? siento que es mas util que unidades por mes"* — confirmó 90% (su regla vieja: la cola no cuenta). `medirNoventa()` en `resumen-articulo.ts`, tres formas según lo que se pueda AFIRMAR:
> - Compra ÚNICA cruzada: `El 90% se vendió en 17 meses` (40HM265032; granularidad MENSUAL — índice de mes de la llegada al mes del cruce, por eso da 17 y no el 16 de la medición vieja por días).
> - Compra ÚNICA viva: `En 10 meses va el 80% de la compra` (CVM253CR02001, exacto al mockup).
> - VARIAS compras: **agregado ROTULADO** — `Desde oct 2025 llegaron 360 u · van vendidas 295` (NB2570001). El FIFO sigue prohibido. 🩸 **El ancla se EXTIENDE hacia atrás** hasta que lo llegado cubra lo vendido desde entonces: `NB3705906` (120 u de jul-2024 vivas + 20 de sep-2025) anclado en sep decía *"llegaron 20 · van vendidas 36"* — roto; extendido dice `Desde jul 2024 llegaron 140 u · van vendidas 97`. Si ni la compra más vieja con fecha alcanza (36 códigos en producción, p.ej. `40HM265540`: llegaron 860 · van 1.327), el texto queda así y el aviso "vendidas de más" explica.
> - El `· vendo 28 u por mes` quedó de dato chiquito al final (`textoVendoPorMes`); sin ventas no se dice "vendo 0". El texto entero sale de `textoLineaNoventa()` — pantalla y verificación comparan contra ESO.
>
> **3. LAS BARRAS SE ANCLAN A LA LLEGADA (mockup aprobado).** `vistaDeBarras()`: con UNA compra las barras arrancan el mes que llegó — título `Desde que llegó · 23 oct 2025 · 120 u`, subtítulo `10 meses en bodega · van vendidas 96 de 120`, y debajo corre el **ACUMULADO en verde** (0 · 12 · 36 · 36 · 36 · 72 · 72 · 96 · 96 · 96 — idéntico al mockup, verificado contra producción). Una compra de +12 meses se recorta a los PRIMEROS 12 y el subtítulo lo dice. Con VARIAS compras quedan los últimos 12 meses y **cada llegada se marca con ▲ bajo su mes** (fila propia, no pegada al rótulo del mes — a 390 px no entra) + leyenda `▲ oct: llegaron 60 u · ▲▲ feb: llegaron 120 y 180 u`. El mes en curso sigue sin dibujarse; el "van vendidas" del subtítulo SÍ lo incluye (es acumulado, no promedio). Oct·nov·dic resaltados y la línea de temporada se conservan — la temporada se calcula SIEMPRE sobre la ventana de 12 meses (`ficha.temporada`), no sobre la ventana dibujada.
>
> **4. LA FILA DE PLATA, AGRUPADA.** Daniel: *"precio prom y precio lista porque estan separado"* → `Precio prom $26.92 · lista $27.00 | Costo CIF $16.56 · FOB $15.05 | margen 39%`. Precios juntos (¿estoy descontando?), costos juntos, margen al final; un grupo sin datos no deja un `|` colgado. 🔴 **"(calculado)" SE FUE del rótulo del FOB** (*"la palabra calculado esta de mas"*) — sigue siendo CIF ÷ 1,10 vía `fobEstimado()` y el ⓘ lo explica; el candado de `articulo-info.test.ts` ahora exige `k="FOB"` y prohíbe "(calculado)" en las tres piezas de la vista. El `(antes $X ↑/↓)` del CIF cuando cambió SE QUEDA.
>
> **5. MODO PEDIDO (mockup aprobado).** Daniel pega hasta 50 códigos para armar pedido: con **2+ códigos pegados** (el MISMO `parsearListaCodigos` del route — no un segundo parseo) sale una TABLA `Código · Compré · Vendí · Quedan · 90% en · Margen · Últ. compra`, **una fila por color EN EL ORDEN PEGADO** (`ordenarComoPegado`, puro en `referencia.ts`) para leerla con su Excel al lado. Quedan 0 en ROJO. Tocar una fila abre **el cuerpo REAL de la tarjeta** (`CuerpoArticulo`) ahí mismo, acordeón de a una; el detalle va FUERA del scroller horizontal (adentro, a 390 px habría que arrastrar para leerlo), y la tabla se parte en segmentos con `colgroup` de anchos FIJOS para que queden alineados. La tabla scrollea ELLA SOLA (overflow-x-auto); el body nunca. **El Excel baja la misma lista en el orden pegado** (el botón exporta `articulosOrdenados`). Un código solo sigue mostrando tarjetas.
>
> **El Excel refleja la ficha:** hoja Referencia con `Compré` · `Vendí` · `En bodega` primero, columna `90% en` (misma métrica, `textoNoventaCorto`), y la plata en el orden de pantalla `Precio prom · Lista · Costo CIF · CIF anterior (solo si cambió) · Costo FOB · Margen` — sin "(calculado)" en el encabezado. La hoja Compras quedó como estaba.
>
> **Medido en el navegador contra el build de producción y datos de producción** (`BASE=… node scripts/_medir-referencia-simple.mjs` y `_medir-referencia-pedido.mjs`, solo lectura): **390 · 834 · 1024 · 1440 → 0 px de arrastre de página, 0 recortados, 0 blancos táctiles <44 px y 0 textos <12 px** en los 5 artículos de prueba y en el modo pedido cerrado y abierto (el scroller declarado de la tabla no cuenta como recorte: es el mecanismo). Verificación de números contra producción: `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-compras-referencia.ts` (corre los MISMOS módulos puros).
>
> Candados: `ventas-resumen-articulo.test.ts` (72 — tres grandes, 90% con el caso NB3705906, barras ancladas con el acumulado del mockup), `referencia-tabla-pedido.test.tsx` (10 — renderiza la tabla real, toca filas, espía el Excel) y `ventas-poda-textos.test.tsx` (35 — la fila de plata carácter por carácter, y "Vendo por mes"/"Me queda para"/"(calculado)" PROHIBIDOS en pantalla).


---

### Ventas › Referencia — la regla del 90% SE FUE y el Excel quedó en 13 columnas (12-ago-2026, noche)

> 🩸 **EL RELOJ NO SE DETENÍA CON VARIAS COMPRAS, Y AL ARREGLARLO DANIEL SIMPLIFICÓ LA REGLA ENTERA.** El caso de su captura (`4G5004G030`, vistana): 2 compras el MISMO día (5-oct-2025: 30 + 6 = 36), vendió 12 en oct y 24 en nov — TODO, stock 0 — y la ficha decía *"Meses: 10 · de venta, desde oct 2025"*. Daniel: *"dice que vendi 36 en 10 meses, pero enverdad fueron en dos meses"*. En el camino cazó dos contradicciones más (*"como stock 0 y vendido 90%?"*) y cerró, textual: *"debe de ser cuanto tiempo de venta tiene y % de la venta, asi en todo el modulo… podemos no tener esa regla y entender la info?"* → **la regla del 90% (congelar en el cruce) se ELIMINÓ del módulo entero.**
>
> **UNA regla para ficha, tabla del modo pedido y Excel:**
> - **VENDIDO = el % REAL**: `Vendí ÷ Compré` (los totales de los tres grandes). 100% si stock 0 y se vendió todo. ⚠️ **SUPERADO esa misma noche**: "vendido > comprado" YA NO es "—" — se muestra el % igual (TERMO 207%), ver *"VENDIDO muestra el % real aunque pase de 100%"* más abajo. El "—" quedó solo para sin compras registradas o vendido negativo.
> - **MESES = tiempo de venta**, meses CALENDARIO desde el ancla (la extendida de siempre): **AGOTADO (stock 0) → hasta el mes de su ÚLTIMA venta neta, CERRADO ahí** (la cola en bodega no infla el tiempo); **VIVO → hasta hoy**, corriendo. Negro = agotado, gris = vivo.
> - ⚠️ **El conteo del agotado es INCLUSIVE** (oct → nov = **2** meses, como cuenta Daniel: *"fueron en dos meses"*); el vivo sigue contando meses TRANSCURRIDOS (oct-2025 → ago-2026 = 10). Al agotarse, el mes que cierra el episodio se suma.
> - ⚠️ La última venta **SÍ puede ser el mes en curso** (es un hecho, no un promedio); los promedios siguen sin verlo. Y una compra que llegó DESPUÉS de la última venta NO corre el reloj (test del borde en `ventas-resumen-articulo.test.ts`).
> - **Sin FIFO, como siempre**: el mes de la última venta es del ARTÍCULO y aplica igual con 1 o N compras. `medirNoventa`/`LineaNoventa`/`textoNoventa*`/`PARTE_NOVENTA` **ya no existen** → `medirAvance`/`LineaAvance`/`textoAvance`/`textoAvanceCorto`/`textoLineaVenta`; `FichaArticulo.noventa` → `avance`. La ficha del agotado dice **"Se vendió todo en 2 meses"** (o *"Se vendió el 80% en…"* si el % real no llega a 100 — los avisos explican el resto), KPI *"Meses: 2 · en venderse"*; los vivos quedaron EXACTAMENTE como estaban ("En 10 meses va el 80% de la compra" / el agregado rotulado "Desde oct 2025 llegaron 360 u · van vendidas 295" con su ancla extendida). `(bajó por devoluciones)` y el retroceso del cruce murieron con la regla.
> - **Medido contra producción** (`scripts/_verif-compras-referencia.ts`, ahora con `4G5004G030` en la lista): `4G5004G030` → **100% · 2 meses** · `CVM253CR02001` 80%·10 vivo (no cambió) · `NB2570001`/`QD3958033`/`RETENCION` sin cambios · **`40HM265032` cambió A PROPÓSITO: era "90% en 17" y ahora es 100% · 23 meses** (última venta sep-2025, ancla nov-2023, inclusive) — el 17 era el cruce del 90%, que ya no es la pregunta.
>
> **EL EXCEL "LO ESENCIAL" — hoja Referencia en 13 COLUMNAS, aprobadas por Daniel** (*"mucha info, quiero lo escencial"*, y después sumó la Lista): `Referencia · Descripción · Compré · Vendí · Stock · Vendido · Meses · Última compra · Precio prom · Lista · Costo CIF · Margen · Nota`. Se fueron las otras 26 (Empresa, los 12 meses en columnas, Oct-nov-dic ×2, Vendo por mes, Me queda para, CIF anterior, Costo FOB, Anterior: llegó/cuánto, Compras últimos 3 años / +3 años, Última compra: cuánto, Meses de venta, "Si no hay margen, por qué" — **su contenido se FUSIONÓ en la Nota**, solo cuando el margen baja). Sin margen (vendedor/bodega) son 12: se quita solo `Margen`. **La hoja Compras quedó INTACTA** (es el registro crudo, con su FOB de Switch y "FOB de dónde"). Candado: `ventas-compras.test.ts` fija el encabezado EXACTO (`TRECE`) y una lista de columnas que no pueden volver; el orden pegado se conserva (`articulosOrdenados`).
>
> **Medido en el navegador contra el build de producción y datos de producción** (`_medir-referencia-simple.mjs` y `_medir-referencia-pedido.mjs`): **390 · 834 · 1024 · 1440 → 0 px de arrastre, 0 recortados, 0 blancos <44 px, 0 textos <12 px**, ficha y tabla (cerrada y abierta). Candados: `ventas-resumen-articulo.test.ts` (fixture `4G5004G030` EXACTO + el borde de la compra tardía + TERMO agotado "—"·17), `ventas-compras.test.ts` (Excel), `referencia-tabla-pedido.test.tsx` (100%·3 del agotado en negro) y `ventas-poda-textos.test.tsx` (**"El 90% se vendió" y "en vender el 90%" están PROHIBIDOS en pantalla**).


---

### Ventas › Referencia — el reloj se REINICIA cuando la bodega quedó en 0 (12-ago-2026)

> ⚠️ **DOS COSAS DE ESTA SECCIÓN QUEDARON SUPERADAS esa misma noche** — ver *"los TRES GRANDES pasan a ser de la ÚLTIMA LLEGADA"* más abajo: **(a)** *"Compré · Vendí · Stock siguen siendo los históricos TOTALES (72 · 61 · 12)"* — Compré y Vendí ahora son de la última llegada (36 · 25) y **solo Stock** sigue siendo el total de bodega; **(b)** la frase perdió el `→ me quedan 11 u` **y** el `→ va el 69% en 5 meses`, y quedó en `Llegaron 36 u en mar 2026 · vendo 8.7 u por mes`. **Todo el motor de llegadas (`medirTandas`, el umbral del cero, los tres vetos del timeline, el ritmo sin los meses vacíos) sigue vigente tal cual** — es la misma medida, mostrada en más lugares.

> 🩸 **EL TIEMPO DE VENTA SEGUÍA SUMANDO LOS MESES CON LA BODEGA VACÍA.** El caso de la captura de Daniel (`4G5004G001`, vistana): compró 36 u en oct-2025 (30 + 6 el MISMO día), las vendió TODAS en oct-nov, estuvo **dic-feb sin una sola unidad**, y en mar-2026 llegaron 36 más. La ficha decía *"Meses: 10 · de venta, desde oct 2025"* y *"Vendo 6.1 u por mes"*. Daniel, textual: *"no me hace sentido que me dice 10 meses de venta, entonces pense no comprar porque yo compro para 3 o 4 meses. pero me lo suma y me lo aplaza"*, y la regla la fijó él: *"si llego a 0 y llego mercancia, cual es la logica q me muestre 10 meses? me debe de mostrar la ultima (y mira q hubo dos el mismo dia (se tienen que sumar))"*.
>
> **EL MOTOR: una LLEGADA (episodio) se corta donde la bodega quedó en 0.** `medirTandas()` en `resumen-articulo.ts` recorre el **neto acumulado compras − ventas mes a mes** (la misma granularidad MENSUAL de todo el módulo, con los datos que la ficha ya tenía) y abre episodio **solo** cuando entra mercancía con el saldo en cero. Compras que llegan con **stock vivo — o el mismo día, o el mismo mes — se SUMAN** a la llegada abierta.
> - 🔴 **NO ES EL FIFO PROHIBIDO.** El FIFO repartía ventas ENTRE compras con stock vivo encima — inventado, nadie marcó las cajas. Acá el corte es un **hecho agregado**: si el stock tocó 0 antes de la siguiente compra, todo lo vendido hasta ahí salió de lo que había llegado hasta ahí, no hay nada que atribuir. **Dentro de una llegada todo sigue siendo agregado.**
> - ⚠️ **"Quedó en 0" = saldo ≤ `min(2, 10% de lo llegado)`** (`umbralTandaCero`). El 10% protege a las llegadas chicas: 2 en bodega de una de 8 u NO es cero (le queda el 25%); de una de 36 sí (94% vendido, la cola no cuenta). Medido: con 0 exacto serían 422 códigos en vez de 468 — quedarían fuera los que tienen 1-2 u de ajuste.
> - ⚠️ **CUÁNDO NO SE PUEDE AFIRMAR EL TIMELINE** (y entonces **TODO queda como siempre**): compras de **+3 años** (sus fechas no viajan, el saldo arrancaría mentiroso), **ventas anteriores a la primera compra**, o **"vendidas de más"** que pasen del ruido de ±2 (`TERMO` vendió 1.648 de 796: con el saldo en −852 cada compra "abriría llegada" sobre un cero falso). `NB2570001` y `TERMO` caen acá y **no cambiaron en nada**.
> - 🔴 **CON UNA SOLA LLEGADA NO CAMBIA NADA**: `armarFicha` solo activa el camino nuevo con **2+**; con una, `medirAvance`/`medirRitmo`/`medirVendidoMeses` se comportan EXACTAMENTE como antes (ancla extendida, agotado en la última venta, etc.).
>
> **LA FRASE, protagonista de la ficha** (`fraseLlegadaActual`) — 🔴 **la palabra "tanda" NO existe en pantalla**, Daniel rechazó ese formato: se dice "llegada" o la fecha a secas.
> ```
> Llegaron 36 u en mar 2026 → va el 69% en 5 meses → me quedan 11 u · vendo 8.7 u por mes
> La anterior (oct 2025): 36 u — se vendió toda en 2 meses          ← gris, debajo
> ```
> - **Viva** = *"va el X% en Y meses"* (gris, en curso). **Agotada** = *"se vendió toda en Y meses"* (negro, cerrada) y **sin "me quedan"**: la bodega quedó en 0.
> - ⚠️ **"me quedan N u" es de ESA llegada** (llegaron − vendidas), no el stock total. En `4G5004G001` dice 11 y Switch dice 12: **el cuadre NO se fuerza**, lo explica el aviso de siempre (*"Hay 1 unidad en bodega que no sale de ninguna compra registrada"*).
> - La historia (`textoLlegadaAnterior`) detalla **solo la anterior**; con 3+ suma *"· y N llegadas anteriores"* en gris sin enlace — el detalle de llegadas de hace años no decide la compra de hoy.
> - **NO hay predicciones** ("te dura ~2 meses"): los veredictos siguen PROHIBIDOS en este módulo.
>
> **LO DEMÁS, sobre la ÚLTIMA llegada:** las columnas **VENDIDO · MESES** de la tabla del modo pedido y del Excel (`medirVendidoMeses`, la misma función de siempre) → **69% · 5** para ese código, gris viva / negro cerrada; el **KPI grande "Meses" = 5** con subtítulo **"de venta · desde mar 2026"** (`pieGrandeMeses`, base `tanda-viva`). **Compré · Vendí · Stock siguen siendo los históricos TOTALES** (72 · 61 · 12). El **"Vendo X u por mes" excluye los meses SIN mercancía** (además del mes en curso, como siempre): 61 ÷ **7 meses con stock** = 8.7, no 61 ÷ 10 = 6.1 — es el MISMO timeline, no una segunda cuenta. El Excel **no ganó columnas**; solo la leyenda dice que Vendido/Meses son de la última llegada.
>
> **Medido contra producción** (`scripts/_verif-compras-referencia.ts`, ahora con `4G5004G001`): `4G5004G001` → llegadas `oct-2025: 36 u, vendidas 36, CERRADA, 2 m` + `mar-2026: 36 u, vendidas 25, viva, 5 m`; `4G5004G030` (una sola llegada, agotada) **sigue 100% · 2, sin un carácter de diferencia**; `CVM253CR02001` 80%·10, `NB2570001` 59%·10, `QD3958033` 30%·8, `40HM265032` 100%·23, `RETENCION` "—" y `TERMO` "—" **idénticos**. **Impacto medido** (`scripts/_diag-tandas-referencia.ts`, read-only, vistana): de **8.108 códigos**, **468 cambian de número** (2 llegadas: 432 · 3: 30 · 4: 6 — 151 con la actual viva, 317 agotada); 5.350 tienen una sola llegada y 2.290 no tienen timeline afirmable → **7.640 no se mueven**.
>
> **Medido en el navegador contra el build de producción y datos de producción** (`_medir-referencia-simple.mjs` en los 6 artículos y `_medir-referencia-pedido.mjs` con la tabla cerrada y abierta): **390 · 834 · 1024 · 1440 → 0 px de arrastre de página, 0 recortados, 0 blancos <44 px, 0 textos <12 px**. En la tabla se lee `4G5004G001 · 69% · 5` en gris (viva) contra `4G5004G030 · 100% · 2` en negro (agotada), una al lado de la otra.
>
> Candados: `ventas-resumen-articulo.test.ts` (el fixture `4G5004G001` EXACTO, mismo-día que suma, stock vivo que NO abre, cero que SÍ abre, el umbral chico/grande, los tres vetos del timeline, 3+ llegadas y la regresión "una sola = idéntico") y `ventas-poda-textos.test.tsx` (renderiza la pantalla y compara la frase carácter por carácter; **"Tanda " y "tandas anteriores" quedaron PROHIBIDOS**). Verificado por mutación: no sumar el mismo día rompe 4, que toda compra abra llegada rompe 5, que nunca corte en 0 rompe 12, dividir el vendo/mes por los meses vacíos rompe 4, activar el camino nuevo con una sola llegada rompe 4 y no cerrar el reloj de la llegada agotada rompe 9.


---

### Ventas › Referencia — los TRES GRANDES pasan a ser de la ÚLTIMA LLEGADA (12-ago-2026, noche)

> 🩸 **LA FICHA SE CONTRADECÍA CONSIGO MISMA, Y DANIEL LO VIO EN LA MISMA PANTALLA.** Sobre `4G5004G001`, textual: *"mira que sigue diciendo compre 72 cuando enverdad son 36"*. El #501 había puesto la frase y el KPI sobre la ÚLTIMA llegada, pero los tres números grandes seguían siendo el histórico:
> ```
> ANTES                                          AHORA
> Compré 72  Vendí 61  Stock 12  Meses 5          Compré 36  Vendí 25  Stock 12  Meses 5
>   ↑ (29 mar 36u · 5 oct 30u · 5 oct 6u)           ↑ las mismas 3 fechas
>                                                   72 u en total · 61 vendidas   ← gris
> Llegaron 36 u en mar 2026 → va el 69% en 5      Llegaron 36 u en mar 2026 · vendo 8.7 u por mes
> meses → me quedan 11 u · vendo 8.7 u por mes    La anterior (oct 2025): 36 u — se vendió toda en 2 meses
> ```
> Él eligió la salida entre las opciones que se le ofrecieron: *"(a) Los grandes pasan a ser de la última llegada: Compré 36 · Vendí 25 · Stock 12 — **que sea coherente**"*.
>
> 🔴 **NO ES UNA SEGUNDA CUENTA.** `tresGrandes(art, tandas)` recibe la MISMA `medirTandas()` que ya alimenta la frase, el reloj y el ritmo desde el #501, y `armarFicha` le pasa la misma medida a los cuatro. Si acá se volviera a calcular la llegada, dos definiciones del mismo episodio se separarían con el tiempo — hay un candado de mutación para eso.
>
> 🔴 **STOCK SIGUE SIENDO LA EXISTENCIA REAL DE BODEGA** (`switch_articulo_info.existencia`), nunca deducida y **nunca recortada a la llegada**. Lo eligió Daniel explícitamente. En `4G5004G001` dice **12** mientras la llegada da 36 − 25 = **11**: el cuadre NO se fuerza, como siempre, y la unidad la explica el aviso de siempre (*"Hay 1 unidad en bodega que no sale de ninguna compra registrada"* — de paso se le corrigió el verbo, decía "no salen" con "1 unidad").
>
> **UNA SOLA CIFRA POR CONCEPTO — de la frase se podó DOS veces, y las dos por lo mismo: decía números que ya estaban arriba.**
> - **`→ me quedan 11 u`**: era lo que quedaba DE ESA llegada mientras el grande Stock decía **12**. Dos cifras para *"¿cuántas me quedan?"* hacen desconfiar de las dos, y la que hay que creer es la de bodega.
> - **`→ va el 69% en 5 meses`** (y su gemelo cerrado *"se vendió toda en 2 meses"*): con los grandes ya de la llegada quedó repetido palabra por palabra — el 69% es el pie de Vendí y los 5 meses son el KPI "Meses". Es la misma poda del *"$16.56 tres veces"* de la fila de plata.
> - Lo que la frase SÍ aporta es la **FECHA** de la llegada (que ningún grande dice) y el ritmo. `fraseLlegadaActual` quedó en una línea. **La historia gris NO se tocó** (`La anterior (oct 2025): 36 u — se vendió toda en 2 meses`): habla de OTRA llegada, no repite nada. El estado sigue diciéndose con el peso de la letra (negro = agotada, gris = viva) y con el Stock.
>
> **EL HISTÓRICO NO SE PIERDE:** viaja en `grandes.historico` y se lee en chico bajo la lista de compras — **`72 u en total · 61 vendidas`** (`textoHistoricoTotal`). Con **UNA sola llegada** en toda la historia, esa llegada ES el histórico: `historico` sale `null`, la línea no se dibuja y la ficha queda **idéntica a la de ayer** (repetir el mismo número dos veces en la misma caja sería el defecto que este módulo viene podando).
>
> **COHERENCIA EN TODO EL MÓDULO, sin encabezados nuevos:**
> - **Tabla del modo pedido:** las celdas `Compré`/`Vendí` leían `art.cuadre` CRUDO — o sea que la misma fila decía *72 · 61* al lado de *69% · 5*. Ahora salen de `armarFicha`, la misma ficha que se abre al tocarla. `Stock` sigue siendo la existencia.
> - **Excel:** las filas ya salían de `f.grandes`, así que se corrigieron solas. **Los 13 encabezados NO se tocaron** (candado `TRECE`): matizarlos rompería cualquier planilla que apunte a ellos, y el que decide es el mismo criterio que ya rige VENDIDO·MESES desde el #501. Lo que se actualizó es la **leyenda de la hoja**, que ahora dice que `Compré`, `Vendí`, `Vendido` y `Meses` son de la última llegada cuando la bodega quedó en 0, y que `Stock` es SIEMPRE la existencia total.
>
> **Medido contra producción** (`scripts/_verif-compras-referencia.ts`, corre los MISMOS módulos puros): `4G5004G001` → **Compré 36 · Vendí 25 (el 69% de esa llegada) · Stock 12 · Meses 5**, frase `Llegaron 36 u en mar 2026 · vendo 8.7 u por mes`, histórico `72 u en total · 61 vendidas`. **`4G5004G030` (una sola llegada) → 36 · 36 (el 100% de lo comprado) · 0 · 2, sin un carácter de diferencia**; `CVM253CR02001` 120·96·24·10, `NB2570001` 935·552·345·10, `QD3958033` 180·54·126·8, `40HM265032` 280·279·0·23, `RETENCION` y `TERMO` (207% de lo comprado, sin tope) **idénticos**.
>
> **Medido en el navegador contra el build de producción y datos de producción** (`_medir-referencia-simple.mjs` en 7 casos —incluido el modelo `40HM265` con 43 tarjetas— y `_medir-referencia-pedido.mjs` con la tabla cerrada y abierta): **390 · 834 · 1024 · 1440 → 0 px de arrastre de página, 0 recortados, 0 blancos <44 px, 0 textos <12 px**. En la tabla se lee `4G5004G001 | 36 | 25 | 12 | 69% | 5` contra `4G5004G030 | 36 | 36 | 0 | 100% | 2`, y al abrir la primera la ficha dice los MISMOS cuatro números. El script de medición ahora **falla si aparece "me quedan" en pantalla**.
>
> Candados: `ventas-resumen-articulo.test.ts` (los grandes de la llegada, Stock = existencia real y ≠ llegaron − vendidas, el histórico visible, "no queda ninguna cifra rival de lo que me queda" y la regresión de **una sola llegada = idéntica**), `referencia-tabla-pedido.test.tsx` (renderiza la tabla real, lee las celdas y las compara contra la ficha que abre debajo) y `ventas-compras.test.ts` (la fila del Excel + la leyenda). Verificado por mutación: dejar los grandes en el histórico rompe 5, devolver el `me quedan` a la frase rompe 7, deducir Stock de la llegada rompe 5 y volver a repetir el % y los meses en la frase rompe 7.


---

### Ventas › Referencia — VENDIDO muestra el % real aunque pase de 100% (12-ago-2026, noche)

> 🩸 **DOS PANTALLAS DECÍAN COSAS DISTINTAS DEL MISMO ARTÍCULO, A TRES CENTÍMETROS DE DISTANCIA.** Daniel, con captura de `44D202G110` (vistana; compré 64, vendí 66, stock 0, una sola compra del 28-oct-2025): la tabla del modo pedido decía **`VENDIDO —`** y su propia ficha, justo debajo, decía **"el 103% de lo comprado"**. Textual: *"PORQUE NO SALE PORCENTAJE?"*.
>
> **El bug NO era el 103%: era la contradicción.** Y nació de lo de siempre — **DOS cuentas del mismo porcentaje**. `tresGrandes` lo calculaba sin tope (para la ficha) y `medirVendidoMeses` lo volvía a calcular con un guard `vendido <= comprado` (para la tabla y el Excel). Mientras nadie vendiera de más las dos coincidían; el día que pasó, se separaron.
>
> **EL ARREGLO, en dos partes:**
> - 🔴 **UN SOLO CAMPO.** `medirVendidoMeses` ya no calcula nada: **LEE `f.grandes.parteVendida`**, el mismo número que muestra la ficha. Ahora la coincidencia es por construcción, no por parecido — el candado de mutación exige que volver a calcularlo acá ponga el build rojo.
> - 🔴 **EL % SE MUESTRA AUNQUE PASE DE 100%.** Vender más de lo comprado no es "no calculable": es un **descuadre real** que el número INFORMA — dice *se vendió todo y además faltan compras por registrar*, que es justo lo que hay que ver. Esconderlo detrás de un "—" es peor. Lo explica el aviso de siempre, que ya existía y funciona: *"Se vendieron 2 unidades más de las que llegaron según los ingresos registrados"*.
>
> **El "—" queda SOLO para lo que de verdad no se puede dividir:** sin compras registradas con fecha (`RETENCION`), comprado 0, o **vendido negativo** (*"el −5% de lo comprado"* no es castellano). Esos tres siguen exactamente igual.
>
> ⚠️ **`TERMO` pasó de "—" a 207%** (vendió 1.648 de 796 compradas), y **es correcto**: su ficha ya decía "el 207% de lo comprado" desde siempre. El candado que fijaba `TERMO → "—"` se actualizó a la semántica nueva en los dos archivos (`ventas-resumen-articulo.test.ts` y el Excel en `ventas-compras.test.ts`) — era el candado el que estaba fijando el bug.
>
> **MESES no cambió, y su "—" sigue significando lo mismo:** solo aparece sin fecha de llegada utilizable. `44D202G110` da 9 (agotado, cerrado en su última venta) y `TERMO` 7.
>
> **Los tres dicen lo mismo (ficha · tabla · Excel), medido contra producción** (`scripts/_verif-compras-referencia.ts`, corre los MISMOS módulos puros):
>
> | Código | Ficha (pie de Vendí) | Tabla (VENDIDO · MESES) | Excel |
> |---|---|---|---|
> | `44D202G110` | el **103%** de lo comprado | **103% · 9** | 1,03 · 9 |
> | `TERMO` | el **207%** de lo comprado | **207% · 7** | 2,07 · 7 |
> | `RETENCION` | — | **— · —** | vacío · vacío |
>
> Y los patrón de siempre, **sin un carácter de diferencia**: `4G5004G001` 36·25 (69% de esa llegada)·12·5 · `4G5004G030` 36·36 (100%)·0·2 · `CVM253CR02001` 80%·10 · `NB2570001` 59%·10 · `QD3958033` 30%·8 · `40HM265032` 100%·23.
>
> **Verificado en el navegador contra el build de producción y datos de producción** (`_medir-referencia-pedido.mjs`, 12 filas reales): **390 · 834 · 1024 · 1440 → 0 px de arrastre, 0 recortados, 0 blancos <44 px, 0 textos <12 px**, tabla cerrada y abierta. La celda más ancha posible sigue siendo de 4 caracteres (`207%` mide lo mismo que `100%`), así que **no se tocó ni un ancho**. Leída en pantalla, la fila dice `44D202G110 | 64 | 66 | 0 | 103% | 9` y al abrirla la ficha dice `el 103% de lo comprado` con su aviso de las 2 unidades.
>
> **Candado en la otra dirección** (el que caza ESTE bug, no el que lo fijaba): `ventas-resumen-articulo.test.ts` trae el fixture `44D202G110` EXACTO y un **barrido de coherencia** que recorre los fixtures de siempre —vivos, agotados, con devoluciones, sin compra, vendido de más y con 2 llegadas— y exige que `medirVendidoMeses().parte` sea **el mismo campo** que el pie de Vendí y que los textos no puedan discrepar. `referencia-tabla-pedido.test.tsx` renderiza la tabla real, lee la celda, abre la fila y compara contra el pie de la ficha. Verificado por mutación: devolver el guard `vendido <= comprado` rompe 4, volver a calcular el % dentro de `medirVendidoMeses` rompe 5 y topear el % en 100% rompe 4.


---

### 🔴 Ventas › Referencia — UNA UNIDAD DE AJUSTE VALÍA 7 MESES Y 4 PUNTOS (25-ago-2026)

> Daniel, sobre `4LD230G110` (vistana): llegó el **5-ago-2025** (48 u, única compra), vendió **sep 1 · nov 32 · dic 15 = 48**, y **quedó 1 unidad**. Su hermano `4LD230G001` tiene la MISMA llegada y la MISMA venta pero stock 0. La ficha decía:
>
> ```
> ANTES                                   AHORA
> 4LD230G110  48 · 48 · 1 · 100% · 12     4LD230G110  48 · 48 · 1 ·  98% · 5
> 4LD230G001  48 · 49 · 0 · 102% ·  5     4LD230G001  48 · 49 · 0 · 100% · 5
> ```
>
> **Dos artículos idénticos con 7 meses de diferencia por una unidad de ajuste** — y uno diciendo 100% con mercancía en bodega al lado de la columna que dice 1.
>
> ⚠️ **NO SE AGREGÓ NINGUNA NOTA, PUNTO ÁMBAR NI AVISO.** Daniel rechazó explícitamente una versión con *"Falta registrar 1 compra"*, que además era **FALSA**: esa unidad entró por un **ajuste de inventario que él mismo hizo** (se vio en el kardex de Switch). **El sistema NO lee los ajustes de Switch, y por eso `Compré − Vendí ≠ Stock`.** Con los números nuevos el dato deja de mentir y no hay nada que explicar.
>
> ### 1 · EL RELOJ SE PARA CUANDO QUEDA LA COLA, NO EN EL CERO EXACTO
>
> 🔑 **NO ES UN UMBRAL NUEVO: ES EL QUE YA DECIDÍA CUÁNDO UNA LLEGADA SE AGOTÓ.** `umbralTandaCero(llegaron)` = `min(2, 10% de lo llegado)` existe desde el #501 y ahora lo REUSA `esColaDeBodega(existencia, llegaron)` para cerrar el reloj de MESES. Dos definiciones de *"quedó en 0"* se separarían con el tiempo.
> - El 10% protege a las llegadas chicas: **2 en bodega de una de 8 u NO es cola** (le queda el 25%); **1 de 48 sí** (98% vendido).
> - ⚠️ **Existencia DESCONOCIDA (`null`, Switch no tiene el código en el catálogo) NO es cola**: sin la foto de bodega no se puede afirmar que se agotó. Son 30 de 8.199 códigos en vistana.
> - **Existencia NEGATIVA (sobreventa registrada) SÍ es cola**: no queda nada.
> - Se aplica en los DOS lugares que decidían el agote: el gate de `medirAvance` y el cierre de la ÚLTIMA llegada en `medirTandas`.
>
> Daniel eligió explícitamente **5** (el tiempo en bodega hasta agotarse) y **no 2** (los meses en que de verdad se vendió).
>
> ### 2 · EL % SALE DE LO QUE DE VERDAD HUBO
>
> **`parteVendidaReal(vendido, quedan, comprado)` = `Vendí ÷ (Vendí + Stock)`**, no `Vendí ÷ Compré`. El denominador viejo era **lo REGISTRADO como compra**, y lo registrado no es lo que hubo.
> - 🔴 **CONSECUENCIA BUSCADA: el % queda amarrado al Stock POR CONSTRUCCIÓN.** Stock 0 ⇒ 100%; Stock > 0 ⇒ menos de 100%; y **el % ya no puede pasar de 100**. Medido en producción (vistana, 8.199 códigos): **394 códigos con más de 100% → 0**, y **43 que decían 100% con mercancía en bodega → 0**.
> - ⚠️ **ESTO SUPERA la decisión del 12-ago-2026** (*"VENDIDO muestra el % real aunque pase de 100%"*): `44D202G110` pasa de **103% a 100%** y `TERMO` de **207% a 100%**. Lo aprobó Daniel con su propio ejemplo (`4LD230G001`: 102% → 100%). **El descuadre lo siguen diciendo las columnas Compré/Vendí y el aviso de siempre** (*"Se vendieron 2 unidades más de las que llegaron"*), que es su trabajo — no el del porcentaje. **Lo que NO se aflojó es el candado que nació de ese bug: la tabla y la ficha siguen leyendo EL MISMO campo** (`grandes.parteVendida`), así que no pueden discrepar.
> - **El `"—"` queda para los tres casos de siempre**: sin compra registrada (`RETENCION`), comprado 0 y vendido negativo. Más uno nuevo: **`Vendí + Stock = 0`** (todo se fue en ajustes).
> - ⚠️ **Sin catálogo (`quedan == null`) se cae a `Vendí ÷ Compré`** — degradación documentada, no una segunda cuenta: es lo mejor que se sabe, y son 30 códigos que **ni siquiera muestran Stock** en pantalla, o sea que no hay columna que contradecir. Es el único camino por el que un % puede pasar de 100%.
>
> 🩸 **Y EL DEFECTO VOLVÍA POR LA PUERTA DEL REDONDEO.** `344 ÷ 345` es **99,7% y redondeaba a 100%** al lado de una columna Stock que decía **1**: la misma contradicción con dos decimales menos, en **10 códigos** medidos. `pctVendido()` topea eso: **con algo en bodega nunca se dice 100%**. ⚠️ El tope es de **UN solo lado** — 0,4% sigue redondeando a 0%, que es la convención de siempre de la celda. El 100% es una AFIRMACIÓN ("no queda nada") y la única fuente que puede hacerla es el Stock.
>
> ### 🔴 EL % TIENE UNA SOLA BASE EN TODO EL MÓDULO, Y POR ESO CAMBIARON DOS TEXTOS
>
> - **El pie de Vendí** decía *"el 80% de lo comprado"* (y *"de esa llegada"* con 2+ llegadas). Con el denominador nuevo eso sería **falso en la misma caja**: `4LD230G110` compró 48 y vendió 48 — *"el 98% de lo comprado"* al lado de esos dos números se lee roto. Dice **"el 98% de lo que hubo"**, una sola redacción para los dos casos.
> - **La línea de venta** decía *"En 10 meses va el 80% de la compra"* → **"En 10 meses va el 80%"**. Y `medirAvance` dejó de calcular su propio %: usa el MISMO `parteVendidaReal`. Con dos cuentas, la línea y el pie de la misma ficha podían discrepar — es el bug de `44D202G110` con otro disfraz.
>
> **Mockup aprobado:** https://claude.ai/code/artifact/94b52cea-95f1-4724-b79f-2472ee7693cd
>
> ### 3 · LA TABLA DEL MODO PEDIDO SE ORDENA POR COLUMNA
>
> Tocar el encabezado ordena. **`src/lib/ventas/referencia-orden.ts`** (módulo PURO), ciclo de TRES pasos:
>
> ```
> 1er toque → ordena (texto de la A, números de mayor a menor)
> 2do toque → invierte
> 3er toque → VUELVE AL ORDEN PEGADO
> ```
>
> 🔴 **EL DEFAULT SIGUE SIENDO `ordenarComoPegado`**, que existe para que Daniel lea la tabla con su Excel al lado. El sort es un **override**, y el tercer paso es lo que impide que un toque sin querer le deje el mapa perdido para siempre — el mismo criterio con el que la píldora de tramo del CXC se apaga al volver a tocarla.
> - 🔑 **EL SORT NO MIDE NADA**: ordena por los valores que la fila YA calculó desde `armarFicha` (`vm.parte`, `grandes.*`). Si volviera a leer el artículo, una columna podría ordenar por un número distinto del que pinta — hay mutación para ese caso exacto.
> - 🔴 **Los `"—"` van al FINAL en las DOS direcciones**: un artículo sin margen no es "el de margen más bajo", es uno del que no se puede decir.
> - **El desempate es el ORDEN PEGADO y sale gratis**: `Array.sort` es estable, así que dos filas con el mismo valor conservan el orden con el que entraron.
> - **El texto se compara CRUDO en mayúsculas, sin `localeCompare` con opciones** — el orden tiene que ser el mismo en el navegador, en Node y en el test (la misma decisión que ya rige `compararCodigos` y `ordenarCodigosAZ`).
> - **El encabezado es un botón de 44 px** (`min-h-[44px]`): esta tabla se usa en el iPad, con dedo. El chevron **no** es una columna ordenable.
> - ⚠️ **El "Bajar a Excel" sigue exportando el ORDEN PEGADO** (`articulosOrdenados` en `ReferenciaView`): es una decisión anterior y no se cambió de paso. Hay candado.
>
> ### Impacto medido contra producción
>
> `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-vendido-meses-referencia.ts vistana antes|despues` (solo lectura; **cachea las filas crudas en `.diag-cache/` para que la segunda corrida NO le pegue a Supabase** — una auditoría no es motivo para saturar una base en compute Micro). Corre los MISMOS módulos de la pantalla y compara fila por fila:
>
> | | vistana, 8.199 códigos |
> |---|---|
> | cambian de número | **2.367** (VENDIDO 2.204 · MESES 56 · los dos 100) |
> | **no se mueven** | **5.832** |
> | con % **mayor a 100%** | **394 → 0** |
> | con **100% y mercancía en bodega** | **43 → 0** |
>
> **Y los dos hermanos** (`scripts/_verif-compras-referencia.ts`, que ahora los trae por defecto): `4LD230G110` → **48 · 48 · 1 · 98% · 5 meses (en venderse)**; `4LD230G001` → **48 · 49 · 0 · 100% · 5**. Los patrón de siempre: `4G5004G001` 36·25·12·**68%**·5 (era 69%: 25 de las 37 que hubo) · `4G5004G030` 36·36·0·100%·2 · `CVM253CR02001` 80%·10 · `NB2570001` **62%**·10 (era 59%: 552 de 897, no de 935) · `QD3958033` 30%·8 · `40HM265032` **100%**·23 (era 98%).
>
> ### Medición en el navegador
>
> **Los 3 anchos + el iPad acostado, contra el build de producción y con datos de producción** (`BASE=… node scripts/_medir-referencia-pedido.mjs` y `_medir-referencia-simple.mjs`, solo lectura): **390 · 834 · 1024 · 1440 → 0 px de arrastre de página, 0 recortados, 0 blancos táctiles bajo 44 px y 0 textos bajo 12 px**, en la ficha de los 6 códigos de siempre + los dos hermanos + el modelo `40HM265` con **43 tarjetas**, y en la tabla del modo pedido en **TRES** estados: cerrada, abierta y **ordenada**. En pantalla se lee `4LD230G110 | 48 | 48 | 1 | 98% | 5` justo encima de `4LD230G001 | 48 | 49 | 0 | 100% | 5`.
> - El script del modo pedido **falla si el encabezado tocado no se anuncia como ordenado** (`aria-sort`): sin eso el chequeo pasaría en verde con la flecha perdida.
> - 🩸 **GOTCHA DE MEDICIÓN QUE COSTÓ UNA VUELTA ENTERA, y es nuevo: MEDÍ EL BUILD DE OTRO AGENTE.** `next start -p 3479` falló con **EADDRINUSE** —otro worktree ya escuchaba ahí—, el proceso murió, y el medidor se conectó igual y midió la rama ajena: reportó `100% · 12` (los números VIEJOS) y "0 encabezados ordenados", o sea el bug intacto sobre código ya arreglado. **Antes de creerle a una medición hay que verificar que el servidor que contesta es el tuyo** (`lsof -nP -iTCP:<puerto> -sTCP:LISTEN` y el log del `next start`).
> - 🩸 **Y la cookie de medición se vence**: la página valida el `sessionToken` contra `user_sessions` y una vieja redirige al login — el medidor mediría una pantalla vacía. `node scripts/_cookie-medicion.mjs` toma prestada, **solo leyendo**, una sesión de admin viva.
>
> ### Candados
>
> `src/__tests__/lib/ventas-resumen-articulo.test.ts` (**118**, con los dos hermanos como fixture EXACTO: mismos meses, % distinto, y el caso de 3 en bodega que ya NO es cola), `ventas-referencia-orden.test.ts` (**11**, el ciclo de tres pasos y los "—" al final), `ventas-compras.test.ts` (el Excel, leyendo las celdas del `.xlsx`), `components/referencia-tabla-pedido.test.tsx` (**24**, RENDERIZA la tabla y toca los encabezados) y `components/ventas-poda-textos.test.tsx` (**38**, compara la ficha carácter por carácter).
> - **Varios candados CAMBIARON DE DIRECCIÓN porque fijaban lo viejo**: `40HM265032` exigía 99% (276÷280) · `TERMO` exigía 150% · `44D202G110` exigía "el 103% de lo comprado" · el pie de `4G5004G001` exigía "el 69% de esa llegada" · las tres frases con *"de la compra"*.
> - **Verificado por mutación, 22 de 22 cazadas** (`python3 scripts/_mutar-candados-referencia-cola.py`): la cola vuelve al cero exacto (en `esColaDeBodega`, en `medirAvance` y en el cierre de la última llegada) · una existencia desconocida se lee como cola · el % vuelve a medirse contra lo comprado · una existencia negativa resta de lo que hubo · sin catálogo se devuelve null · los grandes de la llegada vuelven a `parteDeTanda` · el agotado vuelve al guard `vendido <= comprado` · la línea de venta vuelve a calcular su propio % · el pie vuelve a decir "de lo comprado" · el pie deja de dibujarse · el Excel deja de decir de qué sale el % · **el redondeo vuelve a prometer 100% con algo en bodega** · la celda se salta el tope · el tercer toque no vuelve al orden pegado · el orden pegado deja de ser el default · los "—" van primero · los números arrancan al revés · la tabla ignora el orden · el encabezado deja de ser botón · el sort vuelve a medir por su cuenta.
> - 🩸 **TRES SOBREVIVIERON en la primera corrida y las tres eran huecos REALES, no falsos positivos**: no había un solo fixture con la ÚLTIMA llegada cerrada por cola (solo por cero exacto), ninguno con una compra viva donde `van ÷ comprado` difiriera del % nuevo, y en la tabla los tres artículos daban el mismo % por las dos cuentas. Se cerraron con casos nuevos, no aflojando la mutación.
> - 🩸 **El script de mutación aplica el reemplazo LITERAL con python, no con `perl -0pi -e 's|…|…|'`**: el código real tiene `||`, y con ese delimitador el patrón se des-escapa en una alternación con rama vacía que **se come el archivo entero** y produce un "SOBREVIVIÓ" falso. Restaura **por COPIA** (hay archivos NUEVOS y `git checkout` aborta el comando entero sin restaurar nada), **denuncia el patrón que no muta** en vez de darlo por cazado, **no lee un cero de vitest como "sobrevivió"** si la corrida no colectó tests, y trae una **mutación de CONTROL que a propósito no matchea**: si no sale ⛔, el denunciador está roto y todos los ✅ valen lo mismo que nada.
>
> ### Lo que NO se tocó
>
> El motor de llegadas (`medirTandas`, los tres vetos del timeline, el ritmo sin los meses vacíos) · que los TRES GRANDES sean de la última llegada y **Stock siga siendo la existencia REAL de Switch, nunca deducida** · el histórico en chico · la frase de la llegada y su historia gris (`fraseLlegadaAnterior` sigue con `parteDeTanda`: habla de un episodio CERRADO, donde el stock de hoy no dice nada) · las barras · la fila de plata y el FOB calculado · los 13 encabezados del Excel (candado `TRECE`) · la hoja Compras · el buscador y el orden pegado.
