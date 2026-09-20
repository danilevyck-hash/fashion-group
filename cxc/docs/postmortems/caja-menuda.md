# Caja Menuda — el porqué

> Post-mortem del módulo `/caja`. Nació el 14-sep-2026 al mover acá, verbatim, lo que CLAUDE.md decía de los dos defectos del 11-sep-2026.


---

## Los cuatro arreglos del 20-sep-2026

Cuatro cosas que Daniel aprobó después de mapear el módulo contra producción (3 períodos, 77 recibos vivos por $563.28, una sola persona cargando: Angela).

### 1. Contar la plata al cerrar

🩸 **El cierre nunca preguntó cuánta plata hay.** Sumaba los recibos, los restaba del fondo y escribía «Queda en caja $36.72». Medido: **los dos cierres de toda la historia dieron exactamente $0.00**, y en los dos el **último recibo cargado —7 y 10 segundos antes de cerrar— es exactamente lo que faltaba para llegar a $200**. El sistema no tiene cómo distinguir «cuadró» de «le puse lo que faltaba».

Lo que ahora hace:

- Campo **obligatorio** en la ventana de cerrar: «¿Cuánto dinero hay en la caja?», con la línea «Cuenta los billetes y las monedas que quedan, y escribe el total».
- La diferencia se dice en palabras — **«Faltan $2.00» / «Sobran $1.50» / «Cuadra con la cuenta del sistema.»** (`lib/caja/conteo-cierre.ts`, puro) — en vivo mientras se teclea, y otra vez en el aviso de después de cerrar.
- 🔴 **Un descuadre NO frena el cierre**: se anota y se sigue. Frenarlo empuja justo a lo que esto viene a cerrar — inventar un recibo para cuadrar.
- 🔑 **El cero es un conteo válido** (caja vacía); lo que no vale es el vacío, las letras y los negativos.
- Lo contado y la diferencia se congelan con el período: `caja_periodos.efectivo_contado` y `.diferencia_cierre` (migración **`20261211120000`, escrita y SIN correr** — la corre Daniel).
- 🔴 **Falla ABIERTA en dos escalones**: se intenta con las columnas nuevas, si no con `saldo_cierre` (la foto de siempre, DDL `20260920120000`, **aplicada**) y si no, como antes de que existiera ninguna. Sin conteo no se intenta el escalón nuevo: no hay nada que anotar.

⚠️ **Sobre `saldo_cierre`**: la columna existe y el cierre la escribe. Los 3 períodos la tienen en NULL porque los dos cerrados cerraron **antes** de que la columna existiera y el tercero sigue abierto — no hay nada roto que arreglar; la primera foto llegará con el próximo cierre, ahora acompañada del conteo.

Candados: `caja-contar-la-plata.test.ts` (12) · `caja-cerrar-contando.test.tsx` (8).

### 2. El aviso de fecha deja de pedir un clic

🩸 Al guardar un recibo con fecha anterior a la apertura saltaba una ventana: «Este recibo es del 23 de junio, antes de que abriera el período Nº3 — ¿Guardar igual?». Medido: **saltaba en 25 de los 26 recibos del período abierto** (36 de 77 en toda la historia) y **siempre se contestaba igual**, porque los recibos se cargan de golpe al cerrar. Una ventana que siempre se contesta que sí no es un aviso: es un trámite.

- El caso normal pasa a ser una **línea gris debajo del campo de fecha**: se sigue diciendo, sin ventana ni clic (`notaFecha`, `avisoDeFechaPideVentana`).
- 🔴 **La ventana se queda para la fecha POSTERIOR al cierre**, que sí es rara.
- **No se tocaron**: el aviso del recibo repetido (que sí frena) ni el freno de fecha futura del servidor, que rechaza en vez de avisar.

⚠️ Dos casos de `caja-pantalla-rediseno.test.tsx` cambiaron de dirección, con nota fechada adentro.

Candado: `caja-fecha-sin-ventana.test.tsx` (7).

### 3. «Descripción» se vuelve «Nota», y las categorías se pueden crear

Daniel, textual: *«opino eliminar descripción y se convierta como nota como en guías, en caso tal que quieran apuntar algo, y la categoría está, y si algún momento hay una categoría nueva, pon el más para configurarla y que los que tengan el módulo las puedan crear para siempre en todos los usuarios»*.

- 🩸 «Descripción» era **obligatoria** y decía **«Comida» en 38 de los 77 recibos**, con la categoría al lado diciendo «Alimentación»: el mismo dato dos veces. Ahora es **«Nota», opcional**, y se guarda en la **MISMA columna `descripcion`** — nada de lo ya escrito se toca, y el buscador la sigue mirando.
- Sin nota, la tarjeta del celular se encabeza con el **PROVEEDOR** (y entonces no lo repite abajo); la confirmación de eliminar también nombra el recibo por su proveedor.
- 🔴 **El «＋» al lado de la categoría la crea en la BASE**, no en el navegador de quien la creó — mismo trato que los destinos y los transportistas de Guías. La crea **cualquiera que tenga el módulo** (antes solo el dueño: la secretaria, que es quien carga la caja, no podía).
- 🔴 **La repetida se rechaza por clave exacta** (minúsculas y sin acentos): «alimentacion» es «Alimentación», pero **«Material» NO es «Materiales»** — juntarlas pediría distancia de edición, prohibida en este repo con nombres.
- 🔴 **Quitar es soft delete FIRMADO, nunca DELETE**, única entre ACTIVAS, y una categoría quitada **se puede volver a agregar** (se revive su fila). Quitar sigue siendo del dueño y una categoría **en uso** no se quita.
- Migración **`20261212120000`, escrita y SIN correr**: agrega `deleted` · `deleted_at` · `deleted_by` · `created_by`, cambia el UNIQUE total por un **único parcial** `WHERE NOT deleted` y firma la baja con un CHECK. Falla ABIERTA: sin ella se lee, se crea y se quita como hoy.
- 🩸 **Cuatro reglas de sugerencia muertas se borraron**: `CATEGORIA_KEYWORDS` tenía 8 categorías y el catálogo real tiene 6 (Materiales · Transporte · Alimentación · Papelería · Mantenimiento · Otros). **Combustible, Limpieza, Envíos y Servicios no existen**, así que sus palabras clave no podían preseleccionar nada. Quedan las cuatro que sí tienen categoría detrás. ⚠️ «Papelería» y «Mantenimiento» nunca se usaron y **se quedan**.

Candados: `caja-categorias-del-equipo.test.ts` (11) · `caja-nota-y-categorias.test.tsx` (10).

### 4. El papel: de ocho columnas a cinco

Medido sobre los 77 recibos vivos:

| Lo que se quitó | Por qué |
|---|---|
| **Nota** | Opcional desde hoy, y hoy no imprimiría ni una |
| **Sub-total + ITBMS** | Lo tienen **9 de 77**; en el período Nº3 las **26 filas van en $0.00**, con el Sub-total idéntico al Total |

- 🔴 **Una columna vacía no se dibuja, y vuelve sola cuando hay dato**: la regla mira los DATOS, no una configuración (`lib/caja/papel-caja.ts`, puro). Con todo vacío quedan **Fecha · Proveedor · Categoría · N° Factura · Total**.
- 🔴 **El encabezado dice el rango REAL de los recibos**: «Recibos del 23 jun al 2 sept 2026 · Período Nº 3, abierto». 🩸 Decía «Apertura: 2 sept 2026» y su primera fila es del **23 de junio** — 36 de 77 recibos caen fuera de la ventana de su período, porque el papel llega tarde y se teclea cuando aparece. Un período cerrado lo dice con su fecha de cierre; sin recibos, «Sin recibos».
- 🩸 De paso: el papel era **la última pantalla de Caja que no pasaba por `montoEnPantalla`** y escribía la plata negativa como «$-1.50». Ahora dice **«−$1.50»**. El número no cambia.
- **No se tocaron** el Fondo Inicial, la responsable, el Saldo Final, «A reponer» ni las firmas de «Preparado por / Aprobado por». **El Excel tampoco**: es otra superficie.

Candado: `caja-papel-cinco-columnas.test.tsx` (12).

### Mutaciones

**15 mutaciones, 15 cazadas**, con 2 controles en verde (`scratchpad/mutar-caja.sh`). La que más enseñó: devolverle el asterisco de obligatorio al campo «Nota» pasaba en VERDE — la conducta estaba cuidada (se guarda sin nota) y la PANTALLA no. Se agregó el caso.

---

## Lo que decía CLAUDE.md hasta el 14-sep-2026 (movido acá, verbatim)

> El 14-sep-2026 CLAUDE.md pasaba de 333 mil caracteres (el tope del harness es 150 mil) y las instrucciones se cortaban a la mitad. Se dejó ahí un resumen de las reglas vigentes y el texto completo —mediciones, citas de Daniel, candados y mutaciones— se movió acá sin cambiar una palabra.

### Caja Menuda — los dos defectos del 11-sep-2026

- 🔴 **LAS FOTOS DEL RECIBO SE VEN CON EL PERÍODO CERRADO.** 🩸 El menú «···» que las abre se dibujaba **solo** con el período abierto, así que el único archivo de comprobantes del módulo quedaba inalcanzable apenas se cerraba el ciclo —hoy **2 de los 3** períodos están cerrados— y `ZonaFotos soloVer={!isOpen}` era código muerto: esa condición no podía ser `true`. Ahora el menú existe siempre y, cerrado, lleva **una sola cosa**: «Foto del recibo», con la zona en SOLO LECTURA. La lista vive en `lib/caja/menu-del-gasto.ts` y la leen la tabla y la ficha. ⚠️ Editar y borrar siguen cerrados en la pantalla **y en el servidor**.
- 🔴 **VUELVE «RESTAURAR», y el aviso deja de mentir.** 🩸 Se había retirado el 7-sep por cero usos, pero el aviso de eliminar siguió prometiendo *«Podrás restaurarlo desde Gastos eliminados si es un error»* y esa pantalla quedó de solo lectura: la promesa fue falsa cuatro días. Daniel, textual: *«a) vuelve Restaurar»*. El soft delete ya existía (`deleted`, `deleted_by`, `deleted_at`); se agregó el botón por fila y su rama en el servidor — 🔴 en **su propia rama**, nunca por `ALLOWED_FIELDS`, y **solo con el período ABIERTO**: devolver un gasto a un período cerrado le cambiaría el total a algo que ya se imprimió.
- Candados: `caja-y-marketing-defectos.test.ts` (20) · `caja-periodo-cerrado-fotos.test.tsx` (3, de conducta). `caja-columnas-retiradas` cambió de dirección con nota fechada: «Restaurar» sale de la lista de lo retirado, con el CONTROL de que vuelve SOLO en la lista de eliminados.

