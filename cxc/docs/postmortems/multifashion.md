# Post-mortems — Multifashion

> Movido de `cxc/CLAUDE.md` el 31-ago-2026 para bajar lo que se inyecta en cada sesión.
> **Nada se resumió ni se borró: el contenido es verbatim**, con sus «Daniel, textual»,
> sus mediciones, sus «Candados», sus «Verificado por mutación» y sus 🩸.
> La REGLA vigente (sin la historia) vive en «Invariantes por módulo» de `cxc/CLAUDE.md`.

---

> ## 🔴 LA VENTANA DE `gerente_acs` SE LEVANTÓ — Multifashion COMPLETO (13-ago-2026)
>
> Daniel, textual: ***"abrile Multifashion completo"***. Desde jul-2026 Jennifer solo podía ver, **dentro** de Multifashion, el mes en curso + el mismo mes del año pasado, impuesto en el SERVIDOR ruta por ruta. **Se retiró entero.** Hoy ve el módulo igual que un admin.
>
> **Por qué se levantó, y por qué no es aflojar un candado:** Jennifer es la GERENTE de Multifashion y **ya veía TODO del mes en curso, incluido el margen**. Lo que la ventana le tapaba no era información sensible: era el HISTÓRICO — o sea la única forma de saber si un mes fue bueno o malo. Y se le paga un **bono mensual por un +10% de crecimiento** que, sin el año anterior completo, no podía verificar. La restricción le costaba más de lo que protegía.
>
> ### Qué se retiró exactamente
>
> - **El módulo entero `src/lib/multifashion/ventana-gerente.ts`**, con sus 6 clamps (`clampAnioMes`, `clampRangoFechas`, `clampFechaDia`, `clampDiaComparable`, `clampPeriodoProductos`, `clampPeriodoVendedoras`), `ventanaGerente`, `esRolAcotado` y sus tipos. **Ningún otro módulo lo usaba**: `ultimoDiaDelMes` de `asistencia/planilla.ts` y de `egresos/reglas.ts` son funciones PROPIAS de esos archivos (otras firmas), y el `fechaPanama` que sobrevive es el de `cheques-aviso-ventana.ts` + `hoyPanama`/`fechaPanamaDe` de `src/lib/fecha-panama.ts`. Nada que mudar, nada roto.
> - **Las 9 rutas** (`overview`, `detalle-mensual`, `bonos`, `vendedoras`, `clientes-wholesale`, `retail-recurrentes`, `caja`, `venta-hoy`, `productos`) usan los parámetros CRUDOS que ya venían parseados.
> - **La UI**: se fue el prop `ventanaAcotada` del shell y de los 4 sub-tabs. El selector de mes con las flechas ‹ ›, los chips de período (mes cerrado / YTD / 3m-6m-12m), las pills de rango de Clientes y la píldora "Últimos 12 meses" de Productos están **visibles y funcionando** para `gerente_acs` igual que para admin, y el selector de año ya no filtra a {actual, anterior}.
> - **`venta-hoy` dejó de tener un camino a medias**: `clampDiaComparable` devolvía `null` para apagar un comparativo fuera de ventana, así que los primeros días de cada mes Jennifer veía la tarjeta sin el "vs el lunes pasado". Ahora los DOS comparativos se piden siempre y `VentaHoy.semanaPasada`/`.ayer` dejaron de ser nulables.
> - **El candado viejo** `src/__tests__/lib/multifashion-ventana-gerente.test.ts` (77 casos) se borró.
>
> ### ⚠️ LO QUE **NO** CAMBIÓ — y es la mitad que importa
>
> **Abrirle el histórico NO le abrió NADA más.** Sigue siendo su **ÚNICO** módulo (`getDefaultModulesForRole("gerente_acs")` = `["multifashion"]`), conserva el **auto-redirect** a `/multifashion` desde `/home`, y las rutas de todos los demás módulos le siguen contestando **403**. Tampoco cambió quién entra a cada ruta de Multifashion: los `requireRole` están intactos.
>
> ⚠️ **La validación de parámetros NO era la ventana y se QUEDA**: `year` entre 2000 y 2100, `mes` 1..12, `periodo` en su lista cerrada, `n` en {3,6,12}, formato `YYYY-MM-DD`, `limit` 1..500 y "la fecha no puede ser futura". Eso protege a la base de un parámetro absurdo y nunca tuvo que ver con Jennifer.
>
> ⚠️ **La empresa sigue siendo una CONSTANTE, no un parámetro.** Multifashion ES `american_classic`; aceptarla por query le abriría desde su único módulo las otras 7 empresas del grupo. Hay candado.
>
> ### El candado nuevo que lo vigila
>
> **`src/__tests__/lib/multifashion-acceso.test.ts` (35 casos).** Conserva lo del archivo viejo que NO era la ventana y agrega lo que faltaba:
> - **Inventario CONGELADO** de `/api/multifashion/**` (bonos, caja, clientes-wholesale, detalle-mensual, fidelizacion, metas, overview, productos, retail-recurrentes, vendedoras, venta-hoy): una ruta nueva en el único módulo de un rol acotado la mira alguien antes de que exista. Ya no se exige clamp —no hay ventana— pero sí que **ninguna** ruta importe el módulo retirado, que todas exijan sesión y rol, y que ninguna lea la empresa de la URL. **`metas` no exige clamp y nunca lo necesitó**: no acepta fechas del navegador, su período sale de la fila de la base.
> - 🔴 **CONDUCTA, rol por rol**: llama a los handlers REALES de 9 módulos ajenos (Ventas, Proveedores, Gastos–saldos, Gastos–egresos, Marketing, Caja Menuda, Packing Lists, Directorio, Asistencia) con una **cookie firmada de `gerente_acs`** y exige **403** — y encima verifica que esas mismas rutas SÍ dejen entrar a `admin`, para que el 403 pruebe algo. Sin cookie → 401.
> - **Y lo que sí ganó**, también medido: las 10 llamadas de Multifashion con períodos que antes se recortaban (año 2024, YTD, rolling 12m, rangos de 3 años, día viejo de caja, `periodo=12m`) responden **200**, y el payload es **byte a byte el mismo que recibe un admin**.
> - El snapshot literal de módulos por rol sigue viviendo en `src/__tests__/lib/catalogo-roles.test.ts` (`gerente_acs: ["multifashion"]`, junto a bodega, contabilidad y vendedor) y **no se aflojó**.
> - **Verificado por mutación:** agregarle `gerente_acs` al `roles[]` de otro módulo rompe 3, agregar una ruta nueva al árbol rompe 1, aceptar `?empresa=` rompe 1, sacarle el `requireRole` a una ruta del módulo rompe 1, abrirle una ruta ajena rompe 1, quitar el auto-redirect de módulo único rompe 1, volver a recortar el período por rol rompe 2 y aflojar una validación de parámetro rompe 1.
>
> ### Lo que sobrevive del bloque viejo
>
> - **Borde de mes = UTC-5 fijo.** Panamá no tiene horario de verano y el 1-ago 02:00 UTC allá todavía es 31-jul. Sigue valiendo para todo lo que corte un día de negocio (`hoyPanama` / `fechaPanamaDe` en `src/lib/fecha-panama.ts`), y los tests siguen usando fechas FIJAS (`vi.setSystemTime`), nunca `new Date()`.
> - **La serie anual del overview se devuelve COMPLETA** (`multifashion_overview_serie_v1(p_year)` da los 12 meses). Antes era una decisión que había que explicar porque convivía con la ventana; ahora es simplemente lo que hace la RPC.

> **Catálogos tiene DOS niveles de rol, y viven en `src/lib/catalogo/roles.ts` (fuente única, 27-jul-2026):**
> - `CATALOGO_ROLES` = admin, secretaria, vendedor, bodega → **ver** el catálogo interno y el hub `/catalogos/marcas`.
> - `CATALOGO_ADMIN_ROLES` = admin, **secretaria** → **administrar** `/catalogos/admin/[marca]` en las 3 marcas: fotos (subida individual, ZIP del banco B2B, selector de variantes), etiqueta `badge`, ocultar del catálogo (`oculto_manual`), "Actualizar ahora", Excel sin foto y el tab Pedidos (borrar individual/masivo, exportar, editar, enviar a Switch).
>
> La secretaria se sumó por pedido de Daniel ("catálogos como a daniel, con administrar también"). **No hizo falta migración:** `role_permissions.secretaria` ya traía `catalogos` — el módulo nunca fue el problema. Lo que faltaba estaba repartido en dos capas y estaba INCONSISTENTE consigo mismo:
> - **UI:** el hub escondía el botón "Administrar" con `role === "admin"`, y `AdminCatalogoClient` pedía `allowedRoles: ["admin"]`. (Ojo: ese `allowedRoles` era decorativo — `hasModuleAccess` cae de vuelta a `fg_modules`, así que cualquiera con el módulo `catalogos` ya entraba por URL. El botón era el único freno real.)
> - **API:** `requireAdmin` (= admin+secretaria) ya protegía casi todo el admin (`products`, `products/variantes*`), pero quedaban dos huecos solo-admin: `upload` en **Joybees y Tommy** (Reebok sí la dejaba → la secretaria no podía subir foto en 2 de las 3 marcas) y `pedidos-publicos/[short_id]` DELETE/PUT (mientras `orders/bulk-delete` con `fuente="publicos"` sí la aceptaba: se podía borrar el MISMO pedido en masa pero no de a uno).
>
> **Lo que NO cambió y no debe cambiar:** los **precios** los manda Switch — la allow-list editable a mano es `image_url`/`badge` (+`name` solo en Tommy, que marca `nombre_manual=true`). Y `createRoles` sigue incluyendo `vendedor` (y el `cliente` legacy en Reebok) para armar pedidos.
>
> Candado: `src/__tests__/lib/catalogo-roles.test.ts` congela **las dos listas**, prueba `requireRole`/`requireAdmin` con cookies firmadas rol por rol, verifica `upload.roles` en las 3 marcas y trae un **snapshot literal de los módulos de `bodega`, `contabilidad`, `vendedor` y `gerente_acs`**: si alguno gana un módulo sin querer, el build se pone rojo. Verificado por mutación (agregar `bodega` a `CATALOGO_ADMIN_ROLES` rompe 10 tests).


---

### Tablas anchas en iPhone y iPad (30-jul-2026)

> **Cuatro pantallas del grupo "Ventas y clientes" se adaptaron, y el ancho que fallaba era el que nadie miraba: el iPad.** Medido en el navegador contra el build de producción, ANTES:
>
> | Pantalla | 390 | 834 | Qué pasaba |
> |---|---:|---:|---|
> | **Multifashion › Clientes** | **288 px RECORTADOS** | **92 px RECORTADOS** | el top-50 perdía columnas **sin forma de alcanzarlas** |
> | Proveedores | 0 | **249 px** de arrastre | columnas de la cuenta por pagar |
> | Clientes › Directorio | 0 | **226 px** de arrastre | columnas de contacto |
> | Multifashion › Vendedoras | 0 | **208 px** de arrastre | columnas de la derecha |
>
> **DESPUÉS: 0 en los cuatro anchos medidos (390 · 834 · 1024 · 1440), en las 4 pantallas.**
>
> 🔑 **LO QUE DECIDE ES EL ANCHO ÚTIL, NO EL DE LA VENTANA.** La barra lateral se lleva 224 px, así que un iPad de 834 deja **610** y su contenido ~552-562 — **más angosto que un iPhone acostado**. Por eso el corte de layout es `lg` (1024) y no `sm` (640) ni `md` (768): a 640 y a 768 la tabla NO entra, y dibujarla ahí ES el bug.
>
> ⚠️ **1024 no es "escritorio": es el MISMO iPad, acostado.** Con el corte en `lg` las tablas reaparecían justo ahí y volvían a arrastrar 18-59 px. Se resolvió haciéndolas ENTRAR en 1024 (relleno `px-1.5 xl:px-3` **solo por debajo de xl**, y el piso de Vendedoras de 760 → 720) en vez de empujar el corte a `xl`, que le habría sacado la tabla a un escritorio de 1024-1279 donde sí cabía. **El escritorio no cambió en nada.**
>
> 🩸 **"Recortado" es PEOR que "hay que arrastrar", y Multifashion › Clientes era el caso.** Su grilla de ancho fijo (`2.5rem 1fr 7rem 4rem 5rem 6rem 5.5rem 2.5rem 1.25rem` = 644 px) vive en una `Card` con `overflow-hidden` y **sin scroller propio**: los píxeles que sobran no se alcanzan de ninguna manera, ni sabiendo que están. Encima el `1fr` del NOMBRE era lo único elástico y se lo comía el resto: **la columna "Cliente" se veía vacía** (0 px de ancho). Es la causa que ya apareció tres veces — contenido dentro de un contenedor recortado y sin scroller adentro. Y está hecha de `div`, sin un solo `<table>`, que es por lo que ningún barrido genérico la había cazado.
> - **Patrón: tarjetas**, el de `admin/components/PanelCxcMobile.tsx` y `components/ventas/ResumenViewMobile.tsx`. No se inventó uno nuevo.
> - **Los meses van en LISTA VERTICAL, no en el gráfico a lo ancho** del escritorio: con 12 meses en 356 px cada columna del sparkline queda en ~29 px y la etiqueta ("May '25", con `whitespace-nowrap`) se sale de su celda. La barra sigue estando —la comparación no se pierde, cambia de eje— y la escala es la MISMA (`peakMes`, compartida entre mayoreo y retail).
> - **El WhatsApp pasó de 24×24 a 44 px** de alto (regla de la casa).
>
> **Las otras tres NO necesitaron componente nuevo:** ya tenían su layout de tarjetas, funcionando y verificado, escondido detrás de `sm:`/`md:`. Solo se les amplió el tramo hasta `lg`.
>
> **NINGÚN número cambió, y está medido:** `node scripts/_verif-tarjetas-vs-tabla.mjs` compara las tarjetas contra la tabla **elemento por elemento** — **215 montos, 0 distintos**, y **0 blancos táctiles bajo 44 px** en las 4 pantallas a 390 y 834.
> - 🩸 **La trampa que el script evita:** verificar buscando el elemento por su clase de breakpoint (`.md\:hidden`) devuelve **vacío** en cuanto el corte se mueve → el chequeo compara CERO y **pasa en verde sin haber mirado nada**. Por eso cada layout lleva un `data-vista` FIJO ("tarjetas"/"tabla") y el script **falla si encuentra cero**.
> - **El pareo va por POSICIÓN, no por nombre**: los dos layouts recorren el MISMO arreglo ya ordenado. Parsear nombres daba falsos "sin par" (nombres partidos en dos líneas, el renglón "Ver N sin saldo" que no es una entidad).
> - **Solo se comparan montos con `$`**: un extractor de "todo lo que parezca número" leía las etiquetas de tramo del CxP ("91-120 días", "121+ días") como cifras y daba 31 falsos positivos.
> - **La tolerancia sale de la precisión MOSTRADA**, media unidad del último dígito visible y sin casos especiales: `$1,234.56` → 0,005 · `$11,406` → 0,50 · `$27K` → 500. La tarjeta de Vendedoras muestra los montos sin centavos; exigirle 0,005 la marcaba como "cambió" cuando la diferencia era el redondeo que ella misma declara.
>
> **Medición cruda sin umbrales: `node scripts/_diag-recorte-exacto.mjs`.** El censo (`_medir-scroll-lateral.mjs`) usa un umbral de 100 px para separar una tabla recortada de un texto con puntos suspensivos — correcto para barrer 26 pantallas, pero **esconde los recortes chicos**: por eso el censo reportó 0 en Multifashion › Clientes a 834 cuando en realidad recortaba 92. Para arreglar una pantalla hace falta el número crudo.
>
> Candado: `src/__tests__/lib/tablas-anchas-ipad.test.ts` (18 casos, verificado por mutación: devolver un corte a `sm` rompe 2).


---

### Multifashion › Productos — de planilla a respuesta (7-ago-2026)

> Daniel, textual: *"no me encanta, piensa como un CEO quisiera ver de manera simple rapida y minimalista y arreglalo asi"*. **Los números estaban bien; el problema era la forma.** La pestaña entregaba 570 categorías (o 3.928 códigos) × 6 columnas de cifras y nada más: para sacar una conclusión había que leerla entera. **Ningún número cambió** — la matemática sigue viviendo en `productos-ranking.ts` y no se tocó.
>
> **El orden nuevo es el orden en que un dueño PREGUNTA**, no el de las columnas: (1) cómo vamos —unidades, venta, utilidad y margen, cada uno con su cambio contra el año pasado—, (2) qué se vende más y qué deja más plata, en dos listas SEPARADAS con barra proporcional, (3) qué se vende mucho y deja poco, (4) qué movió la aguja en dólares, (5) la tabla completa detrás de **"Ver todo"** (sigue entera: buscador, filtro por categoría, orden por columna y paginado). Derivaciones en `src/lib/multifashion/productos-resumen.ts` (módulo PURO).
>
> **LO NUEVO ES LA COMPARACIÓN, y es una LECTURA, no una estimación.** Se lee el MISMO período un año antes, de la MISMA tabla, agregado con la MISMA función. Medido en producción el 7-ago: 12 meses = **$690.034,75 contra $615.155,70 (+12,2%)** con unidades **+21,2%** y margen **34,7% contra 36,9% (−2,2 puntos)** — o sea *se vende más y se gana proporcionalmente menos*, que es exactamente la conclusión que la planilla tenía adentro y no mostraba.
> - 🩸 **Un mes EMPEZADO se compara contra los MISMOS DÍAS del año pasado.** El 7 de agosto, medir 7 días contra los 31 de agosto-2025 habría mostrado una caída del ~78% que no ocurrió — el error más caro posible acá, porque se ve idéntico a un dato. La pantalla lo dice con las dos fechas: *"Comparado con 1 ago 2025 – 7 ago 2025 (los mismos días del año pasado, para que sea comparable)"*. Medido: **$9.779,01 contra $6.997,07 = +39,8%**. El período actual NUNCA se infla con una proyección; lo que se recorta es el de comparación (`rangoComparativo`).
> - **Contra el AÑO pasado y no contra el mes anterior**, por dos razones que apuntan al mismo lado: en ropa la temporada manda, y es el único otro período que `gerente_acs` puede ver.
> - **El Δ% lo calcula `variacionPct` de `@/lib/variacion`, no este módulo.** Esta pantalla tiene la misma forma de datos que produjo el *"+363024750%"* (grupos con centavos en un período y miles en el otro), así que reescribir la división habría reproducido el bug. El candado `pct-variacion.test.ts` lo impide.
>
> ⚠️ **SUPERADO el 13-ago-2026: la ventana de `gerente_acs` se levantó entera** (*"abrile Multifashion completo"*, ver § Roles). Lo de abajo queda como registro de por qué se hizo así mientras existió; el clamp ya no está y el candado vive en `multifashion-acceso.test.ts`. 
>
> 🔴 **SON DOS RANGOS, y los DOS pasan por el clamp.** La regla de esa ruta ya no es "la ruta tiene un clamp" sino **ningún rango llega a la DB sin que el rol lo haya aprobado**: el comparativo se deriva del período YA acotado y encima se revalida con `clampRangoComparativo`, que exige que quepa ENTERO en uno de los dos meses permitidos (pedir solo que las dos puntas estén "dentro de la ventana" dejaría pasar un rango que las une y se lleva los once meses del medio). Para Jennifer el rango pedido ES el mismo mes del año pasado, así que sí ve su comparación; el guard existe para que eso siga siendo cierto si algún día `rangoComparativo` se mueve. El candado ahora mira **TODAS** las lecturas de `switch_articulo_diario`, no la primera — mirar solo la primera habría dejado la segunda sin vigilancia.
>
> **Costo medido, y falla ABIERTO.** 12 meses = 20.445 + 18.281 filas = 38.726, **7,6 s** contra los 60 s de `maxDuration`; un mes suelto 344 + 236 filas, **1,9 s**. Las dos lecturas van en paralelo y el payload comprimido pasa de **129 KB a 190 KB**. Si la segunda lectura se cae, `comparativo` sale `null`, la pantalla se dibuja completa sin deltas y el error viaja en `comparativoError`: una comparación que no cargó no puede tumbar los números que sí cargaron.
>
> **Lo que NO cambió:** el orden por defecto de la tabla sigue siendo **UNIDADES** y las demás columnas se siguen ordenando con un clic; la línea de que **las notas de crédito ya están restadas** sigue ahí (sin ella, cuadrar contra Switch da exactamente el doble de las devoluciones); el margen puede ser **"—"** y los "—" van al final al ordenar; las descripciones se muestran **tal cual vienen de Switch**; y el agrupador **por marca** no se tocó.
>
> **Diseño dentro del sistema que ya existe** (tarjetas con borde y sin sombra, Playfair en títulos, Geist Mono en toda cifra). Lo único que se agrega es jerarquía: la cifra del pulso a 24 px contra los 13-14 px del resto, **teal = plata / gris = piezas** (son unidades distintas y verlas iguales era la mitad del problema), verde-rojo SOLO para la dirección del cambio y ámbar SOLO para la advertencia de margen. **La barra se mide contra el LÍDER de su lista, no contra el total**: con 570 categorías, contra el total quedan cinco hilos de 1-3 px que no comparan nada; el % del total va como número al lado.
>
> **Los 3 anchos, medidos en el navegador contra el build de producción** (`BASE=… node scripts/_medir-productos-ceo.mjs`, solo lectura), con el detalle cerrado **y** abierto: **390 (útil 390) · 834 (útil 610) · 1440 (útil 1216) → 0 px de arrastre, 0 recortados y 0 blancos táctiles bajo 44 px en los seis estados.** Las dos listas del punto 2 van una debajo de otra hasta `lg` por la misma razón de siempre: a 610 px útiles, dos columnas dejan ~295 px por lista y un monto de 5 cifras con centavos pide 92 px sin contar etiqueta ni barra.
>
> Candados: `src/__tests__/lib/multifashion-productos-resumen.test.ts` (34 casos) y los 4 que en su momento se sumaron a `multifashion-ventana-gerente.test.ts` (archivo retirado el 13-ago-2026 junto con la ventana). Verificado por mutación: comparar contra el mes COMPLETO rompe 2, comparar contra el mes anterior rompe 7, medir la barra contra el total rompe 1, dejar entrar los márgenes "—" en la alerta rompe 3, rankear los movimientos por % en vez de por dólares rompe 2, y aceptar el rango de comparación sin mirar el rol rompe 3.


---

### Multifashion › Productos — el filtro de MARCA (8-ago-2026)

> Daniel, textual: *"y si quiero ver mis articulos top sellers? o descripciones top seller?"*. El agrupador (categoría / artículo / marca) lo obligaba a **bajar nivel por nivel**. Lo aprobado: **un filtro de marca ARRIBA que filtra todo lo de abajo — un toque, no cuatro.**
>
> 🔴 **LO QUE SWITCH LLAMA "MARCA" NO SON MARCAS, y ese es el corazón del cambio.** El campo `marca` del catálogo de american_classic trae **marca + departamento pegados** (`TH MENSWEAR`, `TH FOOTWEAR`, `CK JEANS`): por eso hay **32 valores con ventas**. **Marcas de verdad hay CINCO.** Medido contra producción el 8-ago (ventana de 12 meses `2025-09-01 → 2026-08-08`, NC restadas, total **$690.034,75**):
>
> | Marca | Venta | % | Margen |
> |---|---:|---:|---:|
> | Tommy Hilfiger | $447.830,67 | 64,9% | 37,8% |
> | Calvin Klein | $160.286,09 | 23,2% | 32,4% |
> | Karl Lagerfeld | $63.296,14 | 9,2% | **23,4%** |
> | Reebok | $15.200,40 | 2,2% | **18,2%** |
> | Joybees | $2.590,80 | 0,4% | 25,3% |
> | Otros | $830,65 | 0,1% | 58,4% |
>
> ⚠️ **Karl Lagerfeld y Reebok venden $78.496 al año con márgenes de 23,4% y 18,2% contra el 37,8% de Tommy.** Ese es el hallazgo, y por eso el filtro **no es un desplegable**: es una tarjeta "Marcas" siempre visible que muestra venta, % y **margen** de cada una, y que además ES el control. **Un solo control** — dos (píldoras arriba + tabla abajo) es el error que este módulo ya pagó con los dos selectores de período. El **ámbar** marca el margen por debajo del general del período (34,7%), el MISMO criterio de la alerta "se vende mucho pero deja poco" que ya existía más abajo.
>
> **El mapa prefijo → marca es EXPLÍCITO** (`src/lib/multifashion/marcas-grupo.ts`, módulo PURO): `TH`→Tommy Hilfiger, `CK`→Calvin Klein, `KL`→Karl Lagerfeld, `RBK`→Reebok, `JOYBEES`→Joybees. Se compara la **PRIMERA PALABRA COMPLETA**, por igualdad exacta — **nada de `startsWith`**, que es un colador: un `THX SPORT` empieza con "TH" y no es Tommy. Todo lo que no esté en el mapa (incluido un nombre que aparezca mañana en Switch) cae en **"Otros"**: la pantalla sigue funcionando y sumando 100%, y nunca se le inventa una marca a un texto que nadie definió.
>
> **Departamentos mal escritos: se juntan AL MOSTRAR (aprobado por Daniel; corregirlo en Switch es tarea suya, aparte).** Lista EXPLÍCITA y corta, no un algoritmo de parecido — `TH MEN` y `TH MENSWEAR` se parecen, pero dos departamentos legítimamente distintos también, y una fusión equivocada no deja rastro. Medido: `TH ACCESSORIES` ($57.669,44) + `TH ACCESORIES` ($2.923,55) = **$60.592,99** · `TH MENSWEAR` + `TH MEN` · `TH OTHER` + `TH OTHERS`. Los 32 departamentos quedan en **29**.
>
> **El agrupador "Por marca" pasó a llamarse "Por departamento"**, y es lo único que cambió de nombre: con el filtro de marca arriba, llamarle "marca" a los 32 valores de Switch dejaba dos controles diciendo cosas distintas con la misma palabra. Sus números no cambiaron (salvo la fusión de los mal escritos).
>
> **NINGÚN NÚMERO CAMBIA, y no se recalcula nada a mano.** Cada marca se agrega con `agregarRanking`, la MISMA función que produce los totales de siempre: las NC siguen restando **dentro de cada marca**, el margen sale del agregado y los "—" siguen siendo "—". Verificado contra producción: **la suma de las 6 marcas da $690.034,75, exactamente el total sin filtrar (diferencia $0,00)**, y lo mismo en el comparativo ($616.960,32). El orden por defecto sigue siendo unidades y la línea de "las devoluciones ya están restadas" sigue ahí.
>
> 🔴 **EL FILTRO NO ES UN PARÁMETRO DE LA RUTA — y eso es lo que lo mantiene fuera del clamp.** Las mismas filas ya leídas se reparten en las 5 marcas (+Otros) y viajan particionadas en `porMarca`; el navegador filtra **sin red**. Un `?marca=TH` habría sido (a) otro rango contra la base por cada toque —20.445 filas, 9 s— contra una base que ya se cayó por saturación, y (b) una superficie nueva que tendría que pasar por `clampPeriodoProductos`. **No se agregó ni un parámetro ni una lectura**, así que el inventario de rutas del candado estructural no se movió y sigue verde (hoy en `multifashion-acceso.test.ts`). Jennifer ve el filtro sobre SU mes, con la comparación de SU mes.
>
> **La comparación contra el año pasado también se filtra**, y por eso el comparativo viaja particionado igual: con Tommy elegido, compararlo contra el total del período daría una caída del 35% que es puro artefacto del filtro. Una marca que no existía el año pasado lo DICE ("En ese período esta marca no vendió nada") en vez de dejar tres "sin comparación" sueltos.
>
> **Las filas particionadas viajan LIVIANAS** (`{g,c,u,v,k,a}`, nombres de un carácter porque se repiten 4.573 veces) y el navegador rearma `utilidad = venta − costo` y el margen con `margenDe` — **las MISMAS funciones del servidor**, no una segunda definición de margen. La descripción del artículo se reusa del arreglo completo que ya viajaba (es el texto más pesado del payload). **Costo medido, 12 meses: 1.721 KB crudos / ~303 KB comprimidos (antes 190 KB) y 9,1 s contra los 60 s de `maxDuration`; un mes suelto 129 KB y 1,87 s (sin cambio).** Si algún día hay que bajarlo, la palanca es mandar los códigos con una etiqueta de marca en vez de particionarlos (un código pertenece a UNA marca: medido, 0 de 3.928 caen en dos) — no cortar listas.
>
> **Fail-open:** sin diccionario de marcas (`marcaDisponible=false`) `porMarca` sale `null`, no se dibuja el filtro y la pantalla queda **exactamente como estaba**. Un artículo que el diccionario no conoce cae en "Otros", nunca se descarta: si se descartara, las marcas no sumarían el total. Medido el 8-ago: **0 filas del período sin entrada en el diccionario.**
>
> **Los 3 anchos, medidos en el navegador contra el build de producción** (`BASE=… node scripts/_medir-productos-marca.mjs`, solo lectura), en tres estados (Todas / una marca / una marca con "Ver todo" abierto): **390 (útil 390) · 834 (útil 610) · 1440 (útil 1216) → 0 px de arrastre, 0 recortados y 0 blancos táctiles bajo 44 px en los NUEVE estados.** El selector mide 447 px de alto en celular y iPad (7 filas de ~56 px, ya en el piso táctil) y **253 px desde `xl`**, donde va a dos columnas: a 1216 px útiles una sola columna dejaba ~900 px de blanco entre el nombre y el monto. No se pasa a dos columnas antes de `xl` porque a 610 px útiles el renglón "% del total · N piezas" empieza a recortarse.
>
> Candados: `src/__tests__/lib/multifashion-marcas-grupo.test.ts` (30 casos: los 32 departamentos reales caen en su marca, `THX SPORT`→Otros, las 3 equivalencias y solo esas, las particiones suman el total, las NC restan por marca, rehidratar es idéntico campo por campo a `agregarRanking`) y **`src/__tests__/components/multifashion-filtro-marca.test.tsx`** (11 casos que RENDERIZAN el componente real y tocan la marca: el riesgo verdadero no es la matemática sino que el filtro llegue a unos bloques y a otros no — un pulso de Tommy con la tabla de todas se ve normal y es una pantalla mintiendo). Verificado por mutación: dejar la tabla sin filtrar rompe 3, dejar el pulso con los totales globales rompe 2, comparar la marca contra el período completo rompe 1, cambiar el mapa a `startsWith` rompe 1, quitar las equivalencias rompe 2, descartar los artículos sin marca rompe 6 y tocar la cuenta de utilidad al rehidratar rompe 10. Diagnóstico read-only: `npx tsx scripts/_diag-marcas-multifashion.ts`.


---

### Multifashion › Productos — la suma la hace Postgres (9-ago-2026)

> **9,0 s → menos de 1 s, y NINGÚN número cambia.** El filtro de marca había subido la pestaña de 7,6 a 9,1 s. La causa no era el filtro ni la matemática: **la ruta se bajaba las filas CRUDAS y las sumaba en JavaScript**, y bajarlas cuesta 49 viajes a Supabase puestos uno atrás de otro.
>
> **Medido contra producción el 9-ago (ventana `2025-09-01 → 2026-08-09`):** 20.483 filas del período (21 páginas de PostgREST, `db-max-rows`=1000) + 18.417 del comparativo (19 páginas) + 8.454 del diccionario de marcas (9 páginas, y **estas empezaban recién cuando las otras dos terminaban**). Respuesta: **8.622 / 9.030 / 8.622 ms**, payload 1.723 KB crudos / **303,5 KB** comprimidos. Un mes suelto: 382+372 filas, **1.628-1.801 ms**, 24,8 KB.
>
> **La palanca: agrupar en Postgres.** `multifashion_articulo_diario_agrupado_v1` (migración `20260809140000`) devuelve el período ya sumado por `(articulo_id, codigo, descripcion, tipo)`: **20.483 filas → 4.740 (4,32× menos) en UNA llamada**, y de 3,70 MB a 0,40 MB entre Supabase y Vercel. Con `multifashion_articulo_marca_v1` para el diccionario, las **tres** lecturas van en paralelo y son **3 viajes en vez de 49**.
> - **El trabajo REAL de Postgres está medido, no supuesto: 222 ms** para agregar las 20.483 filas (383 ms de una RPC equivalente que ya existe en producción, `switch_top_descripciones`, menos 161 ms de piso de red medido con una RPC trivial). Una sola página de 1.000 filas cuesta **364 ms**: la agregación entera sale igual que UNO de los 21 viajes que elimina.
> - **Lo que NO era el problema, medido:** agregar en JavaScript cuesta **35-75 ms** y serializar los 1.723 KB **3-4 ms**. Los 9 segundos eran red, enteros.
>
> 🩸 **`tipo` ES PARTE DE LA LLAVE DE AGRUPACIÓN Y LA RPC NO FIRMA NADA.** Devuelve MAGNITUDES, igual que la tabla; las notas de crédito las sigue restando `signoDeTipo()` en `productos-ranking.ts`, que es la ÚNICA definición del signo que tiene la pantalla. Firmar en el SQL habría creado una segunda — el bug que este repo ya pagó dos veces, y cuya firma es que la diferencia da exactamente el DOBLE de las NC (acá serían $51.694,14 sobre $25.847,07).
>
> **Por qué agrupar así es seguro por construcción: la llave del SQL es más FINA que la del código.** La pantalla agrupa por categoría (`descripcion` con los espacios colapsados) y por código; el SQL agrupa por el texto CRUDO sin normalizar nada. Lo que Postgres deja separado, el código lo junta igual que siempre. Al revés sería imposible de deshacer.
>
> **Tres detalles sin los cuales sí cambiaban números:**
> - **`ORDER BY MIN(id)`.** La lectura vieja paginaba con `.order("id")`, y de ese orden depende un dato VISIBLE: la 2ª línea de "por artículo" es la descripción de la PRIMERA fila que la traiga. Medido: **69 de 3.941 códigos tienen MÁS DE UNA descripción** en la ventana (`Women-Polo S/S Core` vs `Women-Polos S/S Core`). Sin el orden, esas 69 filas podían mostrar la otra. Se ordena por `id::text` —el uuid se imprime en hex de sus 16 bytes en orden, así que el orden de texto es EL MISMO— para no depender de `min(uuid)`, que solo existe desde PG14.
> - **`filasLeidas` sigue contando filas CRUDAS, no grupos.** La RPC devuelve `COUNT(*)` en la misma pasada. Ese campo es la prueba de que no hubo truncado silencioso; hacerlo significar otra cosa lo habría vaciado de sentido.
> - **Las sumas no pueden redondear distinto, y está medido.** Postgres suma `numeric` exacto y el código suma en coma flotante: un total parado justo en el borde `.005` podría redondear a centavos distinto. Sobre las 20.483 filas de la ventana, `cantidad_total` no tiene decimales y `venta_total`/`costo_total` tienen **como máximo 2** → toda suma es múltiplo exacto de un centavo y ese borde no existe en este dato.
>
> ⚠️ **SUPERADO el 13-ago-2026: la ventana de `gerente_acs` se levantó entera** (*"abrile Multifashion completo"*, ver § Roles). Lo de abajo queda como registro de por qué se hizo así mientras existió; el clamp ya no está y el candado vive en `multifashion-acceso.test.ts`. 
>
> 🔴 **LA VENTANA DE `gerente_acs` NO SE MOVIÓ DE LUGAR.** `p_desde`/`p_hasta` los sigue decidiendo el servidor DESPUÉS de `clampPeriodoProductos` y `clampRangoComparativo`; la RPC no sabe de roles y no debe. El candado `multifashion-ventana-gerente.test.ts` ahora normaliza **las dos formas de leer** (`lecturasArticulos()`: los argumentos de la RPC **y** los `.gte()/.lte()` de la tabla) y las mira juntas — vigilar una sola habría dejado la otra abierta, que es exactamente el error que ese archivo ya había corregido cuando la ruta pasó a leer dos períodos. Sube de 75 a 77 casos, con uno nuevo que prueba el **fallback** y otro que prueba que la empresa no se cambia ni por query.
>
> ⚠️ **DDL PENDIENTE — `supabase/migrations/20260809140000_multifashion_productos_agregado.sql`, la corre Daniel A MANO. La pantalla funciona ANTES de que corra.** Si PostgREST contesta "no existe esa función" (PGRST202/42883), la ruta cae sola al camino paginado de siempre, lo escribe en el log de Vercel y lo dice en el campo nuevo **`fuentes`** de la respuesta (`{"periodo":"rpc|paginado", …}`). **Verificado contra producción con la migración SIN correr:** las respuestas de 12 meses y de un mes salen **idénticas campo por campo** a las de producción. `esFuncionAusente()` es estrecho a propósito: un timeout o un permiso denegado se propagan — caerse al camino de 49 consultas ante un error de verdad sería esconderlo y agrandarlo contra una base que ya se cayó por saturación.
>
> **El camino paginado NO es decorado y se queda:** `db-max-rows`=1000 corta EN SILENCIO, y sin paginar se leerían 1.000 de 20.483 filas — el 4,9% de las ventas SIN UN SOLO ERROR.
>
> **Verificación, y es la que importa: `ANTES=/tmp/mf-antes/12m.json npx tsx scripts/_verif-productos-rpc-equivalencia.ts`** (solo lectura). Reconstruye la respuesta ENTERA por los dos caminos sobre las MISMAS filas de producción y las compara contra la respuesta real capturada, campo por campo: **0 diferencias en los tres pares**, y **la suma de las 6 marcas da $691.237,28 = el total sin filtrar, diferencia $0,00**. Medición: `SESSION_TOKEN=… BASE=… OUT=… node scripts/_medir-productos-multifashion.mjs`. Diagnóstico del agrupamiento (cuántos grupos, decimales, códigos con dos descripciones): `node scripts/_diag-agrupacion-articulo-diario.mjs`.
>
> Candado: `src/__tests__/lib/multifashion-productos-lectura.test.ts` (20 casos; `agruparComoPostgres()` simula el SQL y se exige EQUIVALENCIA con `agregarRanking` ×2, `agregarProductos` y `armarPorMarca`). Verificado por mutación: firmar las NC en el SQL rompe 7, sacar `tipo` de la llave rompe 6, perder el `tipo` al traducir rompe 7, quedarse sin `ORDER BY MIN(id)` rompe 3, sacar `descripcion` de la llave rompe 3, reordenar al traducir rompe 2, un `esFuncionAusente` generoso rompe 1 y devolver los grupos como `filasLeidas` rompe 1. En el candado de la ventana: mandarle a la RPC el rango sin clamp rompe 7, mirar solo la tabla rompe 13 y aceptar la empresa por query rompe 1.


---

### Multifashion › la venta de HOY, en pantalla (8-ago-2026)

> Daniel, textual: *"quiero ver también venta del día en multifashion"*. Ese número existía —y era correcto— pero **solo le llegaba por Telegram a las 8pm** (cron `acs-resumen-diario`, 01:00 UTC). Ahora es lo PRIMERO que se ve al abrir el módulo, arriba de los sub-tabs y del selector de mes.
>
> 🔴 **NO SE ESCRIBIÓ UNA SEGUNDA CUENTA.** La venta retail del día vive en **`src/lib/multifashion/retail-dia.ts`** (`leerRetailRango`), y de ahí salen **los dos**: el mensaje de Telegram (`acs-resumen-diario.ts` perdió su consulta y ahora la importa) y la tarjeta de la pantalla (`/api/multifashion/venta-hoy`). Si la pantalla y el Telegram dieran números distintos, Daniel no dejaría de creerle al que está mal: dejaría de creerle a los dos. El candado `multifashion-venta-hoy.test.ts` corre **los dos consumidores sobre las mismas filas y exige el mismo centavo**, más un barrido estático que pone el build ROJO si `acs-resumen-diario.ts` vuelve a tener su propio `.from("_multifashion_sf_vw")` o su propio `.eq("is_wholesale", …)`.
>
> **Semántica (la del módulo, sin cambios):** `_multifashion_sf_vw`, **retail puro** (`is_wholesale=false`), `SUM(subtotal)` FIRMADO sobre `subtotal_descuento` — **las notas de crédito RESTAN**. `documentos` es el `COUNT(*)` de siempre (NC incluidas), el mismo que el Resumen muestra como "tiquetes".
>
> 🩸 **La firma del error de signos, medida el 8-ago-2026:** ACS tuvo **48 facturas por $2.718,44 y 2 NC por $98,75**. Sumando todo en crudo dan **$2.817,19**; restando las NC —lo correcto, y lo que hace la vista— dan **$2.619,69 con 50 documentos**. La diferencia ($197,50) es **exactamente el doble de las NC**. El número bueno es $2.619,69, y así lo dice el Telegram desde siempre.
>
> **La frescura NO es opcional, y por eso viaja SIEMPRE en el payload.** El sync de facturas de ACS corre cada ~2 h: el número nunca es "ahora mismo", es "hasta el último sync". Una pantalla que a las 11pm muestre `$2.619` a secas cuando lo último que entró es de las 8pm **está mintiendo**, y encima miente hacia abajo justo cuando el dueño quiere saber cómo cerró el día. `sync.ultimo` = el `finished_at` del último sync **success** de `(american_classic, facturas)` cuyo rango cubre el día; pasadas **3 h** (`REZAGO_MS`, una corrida perdida) la tarjeta cambia a ámbar y dice *"sin actualizar desde las …"*. Sin poder confirmarlo dice eso mismo, nunca inventa una hora. No hay rama que pinte el monto sin su hora — el test lo verifica leyendo el componente.
>
> **$0 y "todavía no hay ventas" NO son lo mismo.** La bandera es `hayVentas = documentos > 0`, **no el monto**: a las 9am la tienda no facturó porque recién abre, y pintar "$0" ahí asusta a quien mira. Pero un día que vendió $100 y los devolvió tiene neto $0 **con** movimiento, y ése es un cero de verdad que se muestra como cero.
>
> **El titular compara contra el MISMO DÍA DE LA SEMANA PASADA (−7 días), no contra ayer.** Se calculan y se muestran los dos, pero el grande es el de hace 7 días: en una tienda de mostrador el día de la semana manda sobre casi todo, y "hoy lunes vs ayer domingo" produce una caída enorme que es del calendario, no del negocio. Hace 7 días es el mismo día de semana **y** está a una semana (misma temporada, mismos precios). Es la misma razón por la que el Telegram compara el día contra −364 días. "Ayer" queda en chico y rotulado. Mientras la tienda no cierre (7pm Panamá) la tarjeta rotula el día como **en curso**, para que el comparativo contra un día completo no se lea como un desplome a media mañana.
>
> **Panamá es UTC-5 fijo.** "Hoy" sale de `hoyPanama()`; calculado en UTC pelado, entre las 7pm y la medianoche el día saltaría al siguiente y la pantalla mostraría $0 todas las noches. Los tests usan fechas FIJAS (`vi.setSystemTime`).
>
> ⚠️ **SUPERADO el 13-ago-2026: la ventana de `gerente_acs` se levantó entera** (*"abrile Multifashion completo"*, ver § Roles). Lo de abajo queda como registro de por qué se hizo así mientras existió; el clamp ya no está y el candado vive en `multifashion-acceso.test.ts`.  Hoy los DOS comparativos se piden siempre.
>
> 🔴 **La ventana de `gerente_acs`, con un matiz nuevo.** "Hoy" cae en el mes en curso, así que para Jennifer siempre está adentro y `clampFechaDia` nunca lo mueve — **el clamp va igual**, porque la regla del módulo es que ninguna ruta toca la base sin acotar con `auth.role`. Lo que SÍ se cae de la ventana son los **días comparativos** los primeros días de cada mes (el 3 de agosto, "hace 7 días" es el 27 de julio): **`clampDiaComparable` devuelve `null` y ese comparativo no se consulta ni se muestra**. Devolverle "hoy" —como hace `clampFechaDia`— habría sido comparar hoy contra hoy: un **0% perfectamente falso**, peor que no mostrar nada.
>
> **Los 3 anchos, medidos en el navegador con datos de producción** (`BASE=… node scripts/_medir-venta-hoy-anchos.mjs`, solo lectura): **390 · 834 · 1440 → 0 px de arrastre, 0 recortados y 0 hijos desbordados**. La tarjeta es de solo lectura (sin controles), así que no hay blancos de 44 px que respetar. Verificación read-only del dato: `node scripts/_diag-venta-hoy-acs.mjs`.
>
> Candado: `src/__tests__/lib/multifashion-venta-hoy.test.ts` (26 casos) + los 5 que entonces vivían en `multifashion-ventana-gerente.test.ts` (archivo retirado el 13-ago-2026 junto con la ventana). Verificado por mutación (9 de 9 cazadas): quitar el filtro retail rompe 7, sumar las NC rompe 7, calcular "hoy" en UTC rompe 3, hacer que `clampDiaComparable` devuelva siempre la fecha rompe 4, mirar el monto en vez de los documentos rompe 1, dar la frescura siempre por buena rompe 1, comparar contra ayer en vez de hace 7 días rompe 6, sacarle el clamp a la ruta rompe 1 y sacar la tarjeta del shell rompe 2.


---

### Multifashion › METAS — configurables, con proyección por temporada (13-ago-2026)

> Daniel, textual: *"si armalo, en multifashion, y que sea configurable para el futuro hacer otras metas grupales y por vendedora (incluyendo a la gerente jennifer que comisiona por tienda y ventas personales)"*.
>
> La primera meta —**ya anunciada al personal, o sea que el número NO se toca**— es **"Meta del viaje" · 1-sep a 31-dic-2026 · $420.000 · premio: un viaje para todas ($2.000)**. Pero lo que se construyó **no es esa meta**: es un sistema donde Daniel crea las que quiera, con período libre, tipo (grupal o por vendedora) y participantes.
>
> **Pestaña nueva: Multifashion › Metas** (6ª). El módulo pasa de 5 a 6 sub-tabs.
>
> ### 🎯 La meta también va en el Telegram de las 8pm (3-sep-2026)
>
> Daniel, textual: *«el mensaje de telegram igual que hoy en día solo que diciéndome si están qué porcentaje arriba o abajo para la meta, pero tienes que calcular bien cómo hacerlo para hacerlo accurate»* y, al confirmar la cuenta: *«es calcular 23% arriba del mismo día año anterior sumando todos los días pasados?»* → sí.
>
> Al resumen diario de ACS (`acs-resumen-diario`, canal NEGOCIO PRIVADO, los DOS lugares: el cron de la 01:00 y la recuperación de `switch-reconciliacion`) se le agrega **UNA línea al final** y nada más cambia: `🎯 Meta  ▲ +13% arriba del ritmo` / `🎯 Meta  ▼ -4% abajo del ritmo`, con su separador, dentro del mismo `<pre>`. **La cuenta** (`src/lib/multifashion/meta-ritmo.ts`, puro): `factor = objetivo ÷ venta del rango COMPLETO un año antes` (420.000 ÷ 340.698,55 = **1,2328**); `ritmo = venta del año pasado desde desde−1a hasta corte−1a × factor` (`unAnioAntes`, 29-feb → 28-feb); `% = vendido ÷ ritmo − 1`, con la misma flecha y redondeo de las filas Día/Mes/Año (`fmtVariacion`, **0 decimales** como el mockup que aprobó Daniel — la línea no está en la rejilla de columnas, no hay nada que alinear). Como el año pasado ya trae adentro que diciembre pesa el 58,8 %, este ritmo NO es la regla de tres por días que la pantalla rechaza: es la misma idea de temporada, día a día.
>
> **De dónde sale cada número** (`meta-ritmo-lectura.ts`): la meta es la fila ACTIVA de `multifashion_metas`, `tipo = 'grupal'`, no borrada, cuyo rango cubre el **`corte`** del resumen (el mismo que Mes/Año: si el día no sincronizó, ayer); con varias, la de `created_at` más reciente. El «vendido» sale de `leerVentasDelPeriodo` + `totalDe` —la MISMA lectura de la pestaña Metas (`multifashion_meta_ventas_v1`, con caída a la paginada)—, así que el Telegram y la pantalla no pueden decir dos «vendido» distintos. **Cuándo no sale la línea:** sin meta que cubra el día (en enero desaparece sola), sin venta del año pasado en el rango completo, ritmo bajo la base comparable ($100, `variacionPct`), o si la lectura falla — **falla abierto**, se loguea y el resumen sale igual.
>
> **Medido contra producción el 3-sep-2026** (`scripts/_medir-meta-ritmo-telegram.ts`, solo lectura, con la RPC real): vendido 1..3-sep **$4.599,07** · sep–dic 2025 **$340.698,55** · 1..3-sep-2025 **$3.294,33** → ritmo **$4.061,12** → **+13,25 % → «▲ +13% arriba del ritmo»**, exactamente el número del mockup. Candado `src/__tests__/lib/acs-resumen-meta-ritmo.test.ts` (33 casos: cuenta pura, mensaje completo con y sin meta y con ⏳, lectura con base simulada); **22 mutaciones, 22 cazadas** (`scripts/_mutar-candados-meta-ritmo-telegram.sh`). Los candados de siempre (`acs-resumen-diario`, `acs-resumen-canal-privado`, `multifashion-venta-hoy`) siguen verdes: la línea no cambia el prefijo ni el canal.
>
> ### 🔴 QUÉ ES "VENTA" PARA UNA META — la misma definición de siempre, sin una segunda
>
> `_multifashion_sf_vw` (american_classic), **`is_wholesale = false`**, y la suma del subtotal **FIRMADO** — con el descuento ya aplicado y las **notas de crédito RESTANDO**. Es exactamente lo que ya usaban `leerRetailRango` y el Resumen; no se escribió una segunda cuenta.
>
> 🩸 **NO es `subtotal` a secas de `switch_facturas`: ése es ANTES del descuento.** Factura real: `subtotal 354,10 − descuento 221,01 = subtotal_descuento 133,09`, más ITBMS 9,32 = total 142,41. Daniel mira el subtotal **sin ITBMS**, o sea `subtotal_descuento` — que es justo lo que la vista proyecta como `subtotal`. Usar el otro **infla la meta ~5%**. Y si las NC se suman en vez de restarse, la diferencia da EXACTAMENTE el doble de las devoluciones.
>
> **Medido contra producción el 13-ago-2026** (`DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-metas-multifashion.ts`, solo lectura), y estos números son los fixtures de los tests: retail **ene-jul 2026 $305.092,60** · **sep-dic 2025 $340.698,55** · **1-13 ago 2026 $21.055,23** (contra $14.376,71 los mismos días de 2025).
>
> ### 🔴 LA PROYECCIÓN NO VA POR DÍAS, Y ES TODO EL PUNTO
>
> Daniel pidió *"que vean cómo van"*. La respuesta ingenua —regla de tres sobre los días transcurridos— **MIENTE**, con un error medido:
>
> | mes | venta 2025 | % de la temporada |
> |---|---:|---:|
> | septiembre | $36.430,41 | 10,7% |
> | octubre | $46.429,63 | 13,6% |
> | noviembre | $57.580,78 | 16,9% |
> | **diciembre** | **$200.257,73** | **58,8%** |
>
> Al 31 de octubre habrán pasado **61 de 122 días (la mitad del calendario) pero apenas el 24,3% de la venta esperada**. Con regla de tres, una tienda que va **PERFECTA** para llegar a $420.000 se vería como si fuera a cerrar en **~$204.000**: la pantalla anunciaría un fracaso rotundo en el mes en que todavía no pasó nada. Y el error simétrico es igual de caro.
>
> Así que el reloj de esta pantalla **no son los días: es cuánta temporada pasó**. `proyección = vendido ÷ (temporada transcurrida ÷ temporada total)`, donde el peso de cada día sale de lo que ESE MISMO mes vendió el año pasado. Misma idea que `multifashion_proyeccion_cierre_v1` usa para el año, acá sobre un rango libre. Módulo PURO: `src/lib/multifashion/metas-avance.ts`.
> - ⚠️ **El peso de un mes se reparte entre los días de ESE MES, no del período.** Un período que agarra medio diciembre no puede llevarse el peso de diciembre entero — y diciembre pesa el 58,8%.
> - ⚠️ **Sin año pasado se cae a los días Y LA PANTALLA LO DICE.** Proyectar con una regla peor sin avisarlo sería el problema; la regla peor no.
> - 🔴 **Al principio NO se proyecta.** Con el 2% de la temporada transcurrida, dividir por 0,02 multiplica por 50 cualquier ruido: un día bueno "proyecta" el triple de la meta. Por debajo de `FRACCION_MINIMA_PARA_PROYECTAR` (5%) la pantalla dice *"todavía es muy pronto para saber si el ritmo alcanza"*. **Un número inventado con cara de dato es peor que no tener número.**
> - 🔑 **Los pesos NO cuestan una lectura cara**: salen de `multifashion_overview_serie_v1(anio)`, una RPC que ya está en producción desde jun-2026 y devuelve los 12 meses en una llamada. **La proyección ponderada funciona ANTES de que corra la DDL.**
>
> ### 🩸 LOS NOMBRES DE VENDEDORA ESTÁN PARTIDOS EN DOS, Y UNA META MEDIRÍA LA MITAD
>
> Medido: **14 nombres distintos en Switch para 11 personas**. Tres están cargadas de dos formas — `Ana Trejos`/`ANA TREJOS`, `Yeisibeth Muñoz`/`YEISIBETH MUÑOZ`, `Cindy De Gracia`/`CINDY DE GRACIA` — así que una meta por vendedora sobre el texto crudo mediría **la mitad** de lo que esa persona vendió, sin un solo error a la vista.
>
> Fuente única: **`claveVendedora`** (`src/lib/multifashion/metas-clave.ts`) — mayúsculas, sin acentos, espacios colapsados, **igualdad EXACTA**. La MISMA función arma la lista que se elige y suma el avance, así que **lo elegido y lo medido no se pueden separar**.
> - 🔴 **Nada de parecido ni distancia de edición.** Es la lección de las tiendas (`Outlet Duty Free N2` vs `N3`, ver § Guías): dos personas fusionadas por parecido repartirían un premio mal.
> - 🔴 **NO se corrigen los nombres en Switch ni en la base.** No se escribe una sola fila; se agrupa AL LEER. Corregirlos es decisión de Daniel y va aparte.
> - 🔴 **NO hay lista negra de personas.** Solo se excluye `DEFAULT` (el marcador del sistema, con el MISMO criterio que ya usa `multifashion_vendedoras_v3`). Cualquier otro nombre se muestra y **simplemente no se marca** — decidir por código quién es vendedora sería decidir por Daniel.
> - **Quién participa se elige de una LISTA, nunca se escribe.** Y cuando alguien está cargada de varias formas, la fila lo dice (*"En Switch está escrita de 2 formas: …"*): si la agrupación juntara a dos personas distintas, se vería ahí en vez de esconderse dentro de un total.
>
> 🔴 **LA LISTA DICE DESDE CUÁNDO NO VENDE CADA UNA.** Varias de las que aparecen con ventas grandes ya no trabajan, y el premio de esta meta es un viaje. Medido (venta 2026, 1-ene → 13-ago): **Jailine $90.777,30** (última 13-ago) · **Milagros Torres $83.537,61** (13-ago) · **Sheynee Batista $62.112,09** (13-ago) · **Jennifer Miranda $42.669,12** (13-ago) · **Witney Miranda $27.018,20 (última 28-mar — hace 4 meses)** · Yeisibeth Muñoz $7.269,10 (29-jun) · Ana Trejos $6.739,75 (21-jul) · **Cindy De Gracia $3.203,24 (11-ago, o sea que SÍ está vendiendo)** · Angel pizza $1.310,57 (13-feb) · Yerling Gómez $9,97 (6-mar).
> - ⚠️ **El sistema NO las filtra: lo DICE** (fecha + ámbar pasados 45 días) y elige Daniel.
>
> ### 🔴 UNA META GRUPAL MIDE LA TIENDA ENTERA — elegir participantes NO recorta lo que se mide (14-ago-2026)
>
> Daniel, textual: ***"la meta es de 420 del subtotal para la tienda. Mostrar aporte porcentual de cada vendedora de las 4 q están todos los meses"***.
>
> **El código del #547 hacía lo contrario y era el defecto más caro del módulo:** `avanceDeMeta` sumaba SOLO a las participantes en cuanto había alguna elegida, así que marcar a las 4 habría hecho que la meta midiera únicamente lo de ellas. Hoy el avance de una meta `grupal` es **SIEMPRE `totalDe(filas)`** —el total pelado, `DEFAULT` incluido, el mismo número contra el que Daniel verifica en la pantalla de Ventas— y **los participantes pasan a ser solo a quién se le MUESTRA el aporte**. En una meta `tipo === "vendedora"` no cambia nada: ahí cada una tiene su objetivo escrito a mano y el grupo ES la suma de las elegidas.
>
> 🩸 **POR QUÉ, medido contra producción (may-jul 2026, `scripts/_verif-meta-mide-la-tienda.ts`, solo lectura):** la tienda vendió **$147.737,77** y las 4 vendedoras **$141.705,00 = 95,9%**. El otro **4,1% ($6.032,77)** son ventas facturadas con **códigos viejos que siguen abiertos en Switch** — `YEISIBETH MUÑOZ $2.042,21` (última 29-jun), `ANA TREJOS $1.786,77` (21-jul), `CINDY DE GRACIA $1.607,98` (11-ago) y `DEFAULT $595,81`: gente que **ya no es vendedora** y cuyos usuarios alguien sigue usando para facturar. Sobre los $420.000 de la meta eso son **~$17.000**, y la proyección al ritmo real cierra en **$378.654** — o sea que esos $17.000 deciden si el viaje se gana o no. **Una venta de la tienda no puede desaparecer del viaje porque se facturó con el código equivocado.**
>
> 🔴 **LA CONSECUENCIA SE MUESTRA, NO SE ESCONDE: los aportes suman ~96% y la pantalla dice por qué.** Una lista que suma 96% sin explicación se lee como una cuenta mal hecha y hace desconfiar del número entero. La línea es *"El 4% que falta son ventas hechas con el código de alguien que no está en esta lista — casi siempre, gente que ya no trabaja acá. Cuentan para la meta igual."*, y va **al pie de la lista de aportes en las DOS pantallas** (la tarjeta de Metas y el bloque dentro de Vendedoras), sacada del MISMO módulo puro (`textoAporteNoAsignado` en `metas-clave.ts`) — dos redacciones del mismo hecho se separan con el tiempo.
> - ⚠️ **EL PORCENTAJE SE CALCULA DEL PERÍODO DE CADA META** (`MetaConAvance.aporteNoAsignado`), **no es un 4% escrito a mano**: sobre sep-dic 2025 con las mismas 4 da **59,3%**. El día que esos códigos se cierren en Switch baja solo hasta 0 y la línea **desaparece** de la pantalla.
> - ⚠️ **LA CAUSA VA COMO "CASI SIEMPRE", NO COMO CERTEZA.** Lo que SIEMPRE es cierto es que esa venta salió con el código de alguien que no está en la lista; que sea gente que ya no trabaja acá es lo que pasa HOY. En el 59,3% de sep-dic 2025 son personas que en ese momento sí trabajaban — afirmar la causa haría que la pantalla mienta en cuanto cambie el período.
> - **No se dibuja nunca "el 0% que falta"**: por debajo de `APORTE_NO_ASIGNADO_MINIMO` (0,5%) devuelve `null`.
>
> **El formulario lo dice AL ELEGIR, no después.** La opción grupal pasó de *"Se suma lo que venden todas juntas"* a **"Cuenta toda la venta de la tienda."**, y el texto de participantes de *"Si no marcas a nadie, la meta cuenta toda la venta de la tienda"* (que insinuaba lo contrario) a **"La meta cuenta toda la venta de la tienda, marques a quien marques. A las que marques se les muestra cuánto aportó cada una."**
> - 🩸 **Y de paso se corrigió un texto que MENTÍA** en el otro tipo de meta: decía *"ponle su monto (si lo dejas vacío, usa el monto de arriba)"* y **ese monto NO se hereda** — `avanceDeMeta` deja `objetivo` en `null` a propósito (*"Las metas personales las pongo yo a mano"*), así que dejarlo vacío deja a esa vendedora **SIN meta**. **El código está bien y no se tocó**; lo que llevaba a dejar campos vacíos era el texto. Ahora dice **"La que quede sin monto no tiene meta."** (y el placeholder, *"sin esto no tiene meta"*). Guardar con montos vacíos **ya estaba bloqueado** por `falta` → *"Falta: el monto de N vendedoras"*, y ahora hay candado que lo fija.
>
> **Medido contra producción:** el avance con las 4 elegidas da **$147.737,77 = el total de la tienda**, idéntico a pedirlo **sin ningún participante**; los aportes son Sheynee 32,4% · Milagros 28,0% · Jailine 23,9% · Jennifer 11,6% = **95,9%**, y lo no asignado **4,1%** — los aportes más el faltante dan exactamente 100% al centavo.
>
> **Los 3 anchos (+ el iPad acostado), en el navegador contra el build de producción** (`BASE=… node scripts/_medir-metas-anchos.mjs`, solo lectura): **390 · 834 · 1024 · 1440 → 0 px de arrastre, 0 recorte, 0 blancos táctiles bajo 44 px y 0 textos bajo 12 px** en los 14 casos. La línea nueva crece hacia abajo (la tarjeta pasa de 767 a **789 px** de alto a 390 px).
>
> **Candados:** los del archivo de siempre (`multifashion-metas.test.ts`, ahora 92) **ejecutan `avanceDeMeta` de verdad** con la base doblada — un barrido de texto no serviría, la regla vieja y la nueva se distinguen por UNA línea — más **`src/__tests__/components/multifashion-meta-aporte-tienda.test.tsx` (9), que RENDERIZA las dos pantallas**.
> - 🩸 **El primer candado de la línea pasaba en VERDE con la línea borrada**, porque buscaba `textoAporteNoAsignado` dentro del .tsx y el `import` de arriba ya lo contiene. **Cuarta vez que este repo paga lo mismo** (ver el `revalidateOnFocus` de Reclamos, el `<h1>` de Saldos y el `fetchMayorAsientos` del mayor). Por eso el candado bueno pinta la pantalla.
> - **Verificado por mutación, 8 de 8 cazadas:** volver a la regla vieja (6 tests) · hardcodear el 4% (3) · borrar la línea de la tarjeta (1) o de Vendedoras (1) · devolver el texto viejo de la opción grupal (1) · devolver la mentira del monto heredado (1) · afirmar la causa como certeza (1) · dibujar la línea aunque redondee a 0% (3).
>
> ### 🔴 UNA META GRUPAL NO GENERA METAS INDIVIDUALES
>
> Daniel, textual: *"las vendedoras no deberian de tener meta individual diferente cuando se abre una nueva meta, lo de verlo en la vendedora es solo si se programa meta por vendedora"* y *"Las metas personales las pongo yo a mano… es cuando no hay metas grupales, sino individuales"*.
>
> **No existe ningún reparto automático**: ni en partes iguales ni a prorrata de lo vendido, y **no hay `?? meta.objetivo` de respaldo** (sería inventarle un objetivo a alguien). En una meta por vendedora, cada monto **se escribe a mano** y el monto del grupo es la **SUMA** de esos — la dirección contraria. Una participante sin monto puesto se muestra *"sin monto puesto"*, no con uno inventado. Candados por conducta + barrido estático.
>
> **Las dos vistas, según el tipo:**
> - **GRUPAL** → cuánto **APORTÓ** cada una al avance (`Jailine · $28.140 · 29% del avance`).
> - **POR VENDEDORA** → la meta de cada una y su avance contra ella.
> - **Pueden CONVIVIR**, y cada bloque nombra su meta: sin eso, alguien leería el avance de la grupal como si fuera el de su meta personal.
>
> ⚠️ **SIN PODIO, SIN MEDALLAS, SIN "1º/2º/3º"** — aunque vaya ordenado por aporte. El premio grupal es colectivo (*"el viaje es de todas o de ninguna"*) y un ranking acá le daría **dos mensajes contradictorios a la misma gente**: "compitan" y "ayúdense". La competencia individual ya existe y vive **FUERA de este módulo**: el bono de $50 mensual a la mejor vendedora y los $100 de la gerente **no entran acá** (decisión de Daniel) y no se tocaron.
>
> **Las metas terminadas quedan como historia** — Daniel: *"pero que esté ordenado y no tenga mucho protagonismo"*. Van al pie, **una línea cada una** (nombre, período, cierre, cumplida/no) de la más reciente a la más vieja, y se despliegan al tocarlas. La meta viva es la que manda la pantalla. El estado lo decide el SERVIDOR: si lo recalculara el navegador, una laptop con la fecha corrida movería una meta de sección.
>
> ### ⚠️ EL COSTO ESTÁ MEDIDO, y por eso la suma la hace Postgres
>
> El período de la meta real (sep-dic) tuvo el año pasado **6.610 documentos**: leerlos crudos son **~8 viajes paginados y 1,5 s POR CARGA DE PANTALLA**, contra una base en compute Micro que ya se cayó varias veces esta semana. Mismo problema que resolvió `multifashion_articulo_diario_agrupado_v1` bajando 49 viajes a 3.
> - **Camino 1 (bueno):** `multifashion_meta_ventas_v1(desde, hasta)` devuelve el período ya sumado por `(vendedor, mes)` con su última venta — **1 viaje, decenas de filas**.
> - **Camino 2 (respaldo):** lectura paginada con `leerTodoPaginado`. **No es decoración:** `db-max-rows` = 1000 corta EN SILENCIO, así que sin paginar se leerían 1.000 de 6.610 documentos —el 15% de la venta— **sin un solo error**. Un avance que se queda corto y no avisa es peor que no tenerlo.
> - **La RPC devuelve MAGNITUDES, no vuelve a firmar las NC** (la vista ya las firma). Firmarlas dos veces da exactamente el doble de las devoluciones de diferencia.
> - **La RPC agrupa por el texto CRUDO** — una llave más FINA que la del código. Lo que Postgres deja separado, `claveVendedora` lo junta igual; una segunda normalización escrita en SQL podría separarse de la de la pantalla.
> - El GET recorre las metas **secuencialmente**, no en paralelo: hoy hay una, y dispararlas todas juntas convierte una pantalla en una ráfaga.
>
> ### 🔑 EL CÁLCULO Y EL PERMISO ESTÁN SEPARADOS — y se probó en la práctica
>
> `avanceDeMeta` calcula **siempre el período entero** y **no mira ni un rol**; quién lo recibe se decide en `src/lib/multifashion/metas-permiso.ts`. Cuando se construyó, Jennifer (`gerente_acs`) tenía la ventana acotada y las metas quedaron detrás de una perilla a la espera de que Daniel decidiera. **Decidió** (*"abrile Multifashion completo"*, ver § Roles) → **habilitarla fue agregar un rol a una lista, no rehacer ninguna cuenta.** Si el permiso hubiera estado metido dentro de la aritmética —por ejemplo recortando el rango antes de sumar— habría sido un rediseño, y ahí es donde aparecen los números que no cuadran entre dos pantallas.
> - **La perilla se BORRÓ en vez de dejarse en `true`**: una perilla que ya no puede estar en `false` es una mentira que alguien lee como una opción viva. Candado que lo verifica.
> - **Quién entra hoy:** `admin` y `secretaria` ven; `gerente_acs` **ve** (desde el 13-ago); **solo `admin` edita**. ⚠️ **VER NO ES EDITAR**, y va aparte a propósito: Jennifer comisiona por la tienda **y** por sus ventas personales, así que dejarla editar metas sería dejarla editarse su propio objetivo.
> - ⚠️ **La ruta `/api/multifashion/metas` NO acepta ni una fecha del navegador**: el período sale de la fila de la meta. No hay nada del cliente que acotar, y recortarlo sería mostrar un avance recortado con el rótulo de "el avance de la meta" — un número MAL en vez de un permiso bien.
>
> ### ⚠️ DDL ADITIVA PENDIENTE — la corre Daniel A MANO, y la app funciona ANTES
>
> **`supabase/migrations/20260813170000_multifashion_metas.sql`**. Crea `multifashion_metas` + `multifashion_meta_participantes` (con RLS prendida, solo `service_role`) y la RPC de agregado. Patrón `cols-opcionales`: **sin las tablas, la pestaña se dibuja y dice en ámbar qué archivo falta** (no en rojo, que se leería como que algo se rompió), y **ningún otro número de Multifashion cambia**.
> - 🔴 **NO se reusó `ventas_metas`.** Existe y tiene 7 filas cargadas a mano el 13-may-2026, pero su forma es `(empresa, anio, mes) → un número`: no sabe de rangos libres, ni de tipo, ni de participantes, ni de premio. Y tiene una trampa medida: **el repo la declara con la columna `año` mientras las 11 RPC vivas la consultan como `anio`**. Se deja intacta — la lee la proyección viva de `/ventas`.
> - **Soft delete** (`deleted`): una meta anunciada al personal no se borra, se retira.
> - Los participantes cuelgan con `ON DELETE CASCADE` (son parte de la definición de la meta, no evidencia).
>
> ### 🔴 "METAS FANTASMA" — confirmadas, y NO se tocaron
>
> La auditoría de jul-2026 tenía razón y sigue vigente. Es código muerto **ajeno a este módulo** y retirarlo de paso habría sido un recorte que nadie pidió:
> - `meta_efectiva` / `gap_vs_meta` / `meta_total` se calculan en `ventas_proyeccion_cierre_v7` y están tipados en `src/components/ventas/types.ts` — **cero renders**.
> - `ventas_meta_sugerida_v2(int)` está instalada en producción con **cero llamadores** en todo el repo.
> - `ResumenKpis.metaAnualMultifashion` se pide con una RPC `get_app_setting` **en cada carga del Resumen** y no lo lee nadie.
> - `Multifashion.metaAnual` (= `app_settings['multifashion_meta_anual_2026']` = $800.000) y `expectedTodayPct` viajan por el cable y **no se pintan en ninguna pantalla**.
> - El comentario de `src/app/ventas/reporte/page.tsx:4` sigue prometiendo *"metas y proyección"*, que hoy es falso.
>
> ⚠️ **Ese $800.000 anual NO es la meta de Daniel** ($420.000 de sep a dic) y no se relacionan. Y el bono de Multifashion (`multifashion_bonos_v3`) es crecimiento YoY, **no una meta**: está vivo y no depende de nada de esto.
>
> ### 🩸 LA 6ª PESTAÑA NO ENTRABA — medido, no supuesto
>
> Con Metas el módulo pasa de 5 a 6 sub-tabs, y la tira **volvió a desbordar**: medido en el navegador, **433 px contra 390 en el iPhone (43 de más) y 565 contra 554 en el iPad (11 de más)**. Una tira que desborda deja la última pestaña —justamente la nueva— fuera de la pantalla, alcanzable solo arrastrando: el MISMO defecto que ya se había corregido cuando entró Productos.
> - **Los íconos pasan de esconderse en celular a esconderse hasta `lg`.** Cada uno se lleva 18 px (12 del `h-3 w-3` + 6 del `gap-1.5`, que un hijo con `display:none` deja de generar): 6 × 18 = **108 px**, y el iPad pasa de 565 a **457 sobre 554**. En celular ya estaban ocultos, así que ahí lo que cierra la cuenta es el relleno: `px-1.5` en vez de `px-2.5` son 8 px por pestaña × 6 = **48 px**.
> - **Resultado medido: 390/390 · 554/554 · 744/744 · 1000/1000 · 1160/1160 — entra en los cinco anchos.** Desde `lg` los íconos vuelven, donde sobra ancho.
> - ⚠️ **NO se acortó ningún rótulo.** Son texto que el personal lee y cambiarlos es decisión de Daniel; hay un candado que los congela.
>
> ### Los 3 anchos (+ el iPad acostado)
>
> `BASE=… node scripts/_medir-metas-anchos.mjs` (solo lectura), en cuatro estados —tarjeta de meta en curso, meta cumplida, la ventana de "Nueva meta" y la pestaña Vendedoras con el bloque de aporte—: **390 · 834 · 1024 · 1440 → 0 px de arrastre, 0 recorte, 0 blancos táctiles bajo 44 px y 0 textos bajo 12 px** en los 14 casos. La tarjeta crece hacia abajo (647 px de alto a 390, 507 a 1440).
> - 🩸 **LA DDL NO CORRIÓ TODAVÍA, así que la medición INTERCEPTA `/api/multifashion/metas`** y le inyecta una respuesta con la forma exacta y los números REALES medidos. El componente medido es el REAL; no se toca la base ni se aprieta ningún botón que guarde. El script **falla** si no encuentra la tarjeta, la línea de la proyección, el aviso de "última venta" de Witney, el del nombre partido en dos o el aporte en Vendedoras — y también si aparece un podio.
> - 🩸 **Dos falsos hallazgos que costaron una vuelta, los dos del MEDIDOR y no del producto:** los encabezados llevan `uppercase` por CSS, así que `innerText` los devuelve en mayúsculas y compararlos tal cual decía que faltaba un texto que estaba; y un checkbox de 16 px DENTRO de una etiqueta de 44 px cumple la regla táctil (lo que se toca es la etiqueta entera), así que contarlo marcaba en rojo el patrón de la casa.
>
> ### Candados
>
> `src/__tests__/lib/multifashion-metas.test.ts` (**92 casos** desde el 14-ago-2026, todos con los números REALES medidos). Ejecutan la conducta, no buscan texto: corren la proyección con la temporada real, agrupan los nombres partidos y verifican los permisos rol por rol. Incluye barridos estáticos que ponen el build ROJO si vuelve el reparto automático del objetivo, si alguien lee `switch_facturas` en vez de la vista, si el SQL vuelve a firmar las NC, si la migración deja de ser aditiva o si el cálculo del avance empieza a mirar roles.
> - 🩸 **Los barridos borran los comentarios PRIMERO** — este repo ya pagó **tres** veces el candado que se cumple (o se rompe) por su propia explicación, y acá volvió a pasar en las dos direcciones: el barrido de la perilla acusaba al archivo que solo la documenta, y el del SQL encontraba `ventas_metas` en el comentario que explica **por qué NO se reusa**. Hay un stripper aparte para SQL, donde el comentario empieza con `--`.
> - ⚠️ **El caso del "ritmo exacto" no exige `alcanza === true`**: cae JUSTO en el borde y el redondeo a centavos decide por un centavo. Lo que se exige es que la proyección diga 420.000 y no 204.000, y un caso 1% por encima sí exige que alcance.


---

### Multifashion › Resumen — los números pegados de "Mes a mes" (30-jul-2026)

> Daniel, mirando el iPhone: *"mira en multifashion, en resumen, lo pegado que estan los numeros, arreglalo"*. Medido en el navegador a 390 px con las cifras reales (5 dígitos con centavos, el peor caso es la fila YTD): el aire entre el monto del año actual y el del anterior era **−4,8 px**. **No estaban apretados: se SUPERPONÍAN** (`$302,556.86$271,191.20`).
>
> **DESPUÉS: +16 px, con desborde 0. iPad y escritorio quedaron IDÉNTICOS** (93,2 px a 834 · 188,2 a 1024 · 396,2 a 1440, los mismos antes y después), y el arrastre horizontal sigue en **0 en los cuatro anchos**.
>
> 🩸 **La causa NO era el relleno ni el interletrado — que es lo que uno toca si arregla a ojo.** Con las 4 columnas en una sola línea, a cada monto le tocaba una pista de **79,6 px** cuando el texto pide **92,4**: cada uno desbordaba **12,8 px** y eso se comía los 8 px del `gap` (8 − 12,8 = −4,8). Las dos columnas estaban **compitiendo** por un ancho que no alcanzaba. Por eso el diagnóstico mide **pista contra texto** y no solo el hueco: distingue "falta aire" de "no entra", que se arreglan distinto.
>
> **La cuenta que cierra el caso, a 390 px:** quedan 326 px útiles dentro de la tarjeta, y Mes (44,8) + dos montos (92,4 × 2) + Δ (96) + 3 separaciones = **350,4**. **Faltan 24,4 px.** Las 4 columnas en una línea no entran, y las dos salidas baratas están prohibidas: **la letra no baja de 12 px** (#301, y esta pantalla es de plata) y **los montos van completos con centavos** (nada de `$33.2K`).
>
> **Solución: en celular la fila usa DOS líneas.** Arriba Mes + los dos montos; abajo el Δ (porcentaje y absoluto, uno al lado del otro), alineado a la derecha.
> - **Los montos van en columnas `auto`, no en fracciones.** En un grid, una pista `auto` vale lo mismo para TODAS las filas (el ancho del contenido más largo, el YTD), así que los montos siguen **alineados de arriba abajo** —que es lo que permite comparar de un barrido— y el aire entre ellos es **exactamente el `gap-x-4` = 16 px**, ni más ni menos. Con `1fr 1fr` el aire habría salido de 48 px y variable; con `auto` es el que se elige.
> - **La columna Mes se queda con el sobrante** (`minmax(2.8rem,1fr)`), que es donde no molesta.
> - **El corte es `md` y no `sm`:** a 640 px la tabla quedaría con **8 px de aire total**, otra vez al borde de tocarse.
> - **Desde `md` no cambia NADA**: vuelve el reparto de 4 columnas en una línea. El encabezado "Δ" se esconde solo en celular (un encabezado suelto en la segunda línea sobra; el valor ya se explica con su signo, % y $).
>
> **Ningún número cambió, y está medido:** `node scripts/_verif-mes-a-mes.mjs` compara las 8 filas celda por celda entre 390 y 1440 — **32 celdas, 0 distintas**. La comparación va contra `data-col`, **no** contra la clase del breakpoint: buscar por `.md\:block` devuelve vacío en cuanto el corte se mueve, el chequeo compara CERO y **pasa en verde sin haber mirado nada**; el script falla si encuentra cero.
>
> **Diagnóstico reproducible: `ETAPA=antes node scripts/_medir-aire-mes-a-mes.mjs`** (390/834/1024/1440, solo lectura). Mide sobre la fila del **peor caso** —la de más dígitos, no la primera—: un mes de 4 cifras no prueba nada sobre uno de 5 con centavos. Deja capturas de la tabla en cada ancho.
>
> **De paso, blancos táctiles de Multifashion › Clientes:** las píldoras de período (Mes / 3 meses / 6 meses / 12 meses) medían **26 px** y los chips de segmento (Todos / Frecuentes / Dormidos / 5% disponible) **28**. Los dos grupos pasaron a **44** con `-my-1.5` para que crecer no separe el filtro del título. Verificado: **0 blancos bajo 44 px** en Resumen y Clientes, a 390 y 834.
>
> Candado: `src/__tests__/lib/multifashion-numeros-aire.test.ts` (12 casos; verificado por mutación: volver a `minmax(0,1fr)` en celular rompe 1). Incluye los candados de las reglas que no se pueden romper para ganar espacio — que la letra siga en `text-sm` y que la tabla no use `fmtMoneyCompact`.
