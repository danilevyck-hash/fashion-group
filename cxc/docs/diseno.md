# Cómo se diseña una pantalla (estilo Apple)

🔴 **Principio rector:** cada pantalla, flujo y detalle se diseña preguntando *¿cómo lo haría Apple si hiciera un ERP profesional?* La simplicidad y la claridad de Apple, con los conceptos y nombres de un ERP serio (SAP u Odoo: tipos de documento, estados, nombres estándar). Daniel, 2-oct-2026.

> 🔴 Obligatorio al diseñar o rediseñar **cualquier** pantalla, modal, PDF o etiqueta del sistema.
> Daniel, 1-oct-2026: *«ten mentalidad steve jobs, estilo apple»* · *«quiero que se diseñe así cualquier cosa en el futuro»*.
> Los nombres siguen [nombres-erp.md](nombres-erp.md): simple no es coloquial.

## Las reglas

1. **Una pregunta por pantalla.** Antes de dibujar, escribe en una línea qué decide la persona ahí («¿qué va en esta guía?»). Lo que no ayuda a responderla se quita o se esconde.
2. **El orden es el orden del trabajo.** Primero se elige y abajo se ve el resultado. Nunca pongas una tabla vacía antes de la acción que la llena.
3. **Una sola acción principal.** El botón principal es uno solo. En formularios largos va en una barra fija abajo, con el resultado en vivo («12 bultos · 2 envíos · Guardar guía»). Está apagado hasta que haya algo que guardar.
4. **Lo obvio ya viene puesto, pero las decisiones de personas no.**
   - Se puede llenar solo: la fecha de hoy, la empresa única, lo que se calcula.
   - Nunca se preselecciona una decisión de una persona: quién despachó o qué transportista. El campo nace vacío, porque alguien lo deja así por error.
5. **Mide antes de esconder.** Para decidir qué va siempre visible y qué va detrás de un «+ Agregar…», cuenta el uso real en la base.
   - Ejemplo: las observaciones se escribieron en 34 de 74 guías, así que van siempre visibles.
   - Si se usa en menos de 1 de cada 10 casos, va detrás de un enlace.
6. **Los botones dicen lo que agregan, no lo que le falta.** «+ Agregar factura», no «+ Agregar sin etiquetas». El estado va como chip gris en el renglón: «Sin etiqueta».
7. **Los avisos aparecen cuando la persona actúa.** Un aviso sale al tocar Guardar, no antes, y lista **todo** lo que falta de una vez. No uses avisos de borrador, carteles permanentes ni mensajes «por si acaso».
8. **Sin ruido.**
   - Sin asteriscos de obligatorio: el botón apagado y el aviso al guardar ya lo dicen.
   - Sin un título en mayúsculas por cada bloque si el bloque se entiende solo.
   - Sin datos repetidos ni secciones que digan lo mismo.
9. **Campos en su lugar.**
   - El campo que depende de otro va **debajo** de él (el transportista debajo del tipo de despacho).
   - Ningún campo queda solo en una fila con media pantalla vacía.
   - Un dato de 1 a 4 caracteres (bultos, cantidad) usa un campo angosto.
10. **Grande y tocable.**
    - En el celular, todo lo que se toca mide al menos 44 px.
    - Al elegir, una tarjeta entera es más fácil de tocar que una casilla chica.
11. **Impresos.** Las etiquetas de la Zebra (térmica) no llevan fondos negros sólidos: van en texto negro sobre blanco, con negrita para lo importante.
    - **Ningún papel sale con textos encimados ni cortados** (6-oct-2026): todo PDF o Excel nuevo se agrega a `src/lib/papeles-qa/catalogo.ts`. La prueba `papeles-sin-encimar` lo revisa en CI y `npx tsx scripts/revisar-papeles.ts <carpeta>` arma la galería para mirarlos todos de un vistazo.
12. **Rollback.** Todo rediseño entra detrás de un interruptor (`false` = como antes) y con un test candado de lo que no debe cambiar (datos, PDF, reglas).

## Detalles aprendidos (se aplican en TODO el sistema)

Daniel, 2-oct-2026: *«cada vez que encontramos algo así de detalle, para que siga esa línea»*. Cuando aparece un detalle en un módulo, se escribe aquí y **se revisa en qué otros módulos pasa lo mismo**.

- **El logo o título va en la misma línea que «← Volver/Inicio»**. No se le dedica una franja propia. Lo primero que se ve tiene que ser el contenido: fotos, lista o tabla.
- **Nunca dos veces la misma marca o logo en pantalla.** Pasó en Reebok, con un logo arriba y otro en el encabezado.
- **Nunca dos veces la misma palabra seguida.** Por ejemplo, el rótulo «Marca» encima de un desplegable que dice «Seleccionar marca»: o el rótulo, o el texto del desplegable.
- **Nombres de personas como se escriben: «Daniel Levy»**, nunca «DANIEL LEVY». La capitalización se hace en pantalla, sin tocar el dato.
- **Un cero que dice que falta algo SÍ se muestra.** Por ejemplo, «Fotos · 0» avisa que la tienda no tiene fotos. Solo se esconde el cero que no le dice nada a nadie, como un contador de filtros.
- **Los mismos colores en todos los módulos.** Botones, chips, estados y acentos salen de los mismos tokens. Un módulo no inventa su paleta: todo el sistema se tiene que sentir como uno solo.
- **La paleta estándar** (Daniel la aprobó el 2-oct-2026). Cada rol tiene una sola clase:
  - Neutro: familia `gray`. Fondo de página `bg-gray-50`, tarjeta `bg-white`.
  - Botón principal: `bg-black text-white hover:bg-gray-800`.
  - Enlace o acción de texto con color: `text-blue-600 hover:text-blue-800`.
  - Éxito: `emerald` (texto `-700`, fondo `-50`, borde `-200`).
  - Aviso: `amber` (texto `-700`, fondo `-50`, borde `-200`).
  - Error y negativos: `red` (texto `-600`, fondo `-50`, borde `-200`).
  - Borde: tarjeta `border-gray-200`, separador de filas `border-gray-100`, campo `border-gray-300`.
  - Radios, solo tres: `rounded-md` en botones y campos, `rounded-lg` en tarjetas y modales, `rounded-full` en chips. Sin `rounded-[Npx]`.
  - Seleccionado: `bg-gray-900 text-white` en chip; `border-b-2 border-gray-900 text-gray-900` en pestaña. Nunca el color del módulo.
  - Título de sección: `text-xs font-medium uppercase tracking-wide text-gray-400`, y solo si el bloque no se entiende solo.

  Prohibido en pantallas: `stone`, `slate`, `teal`, `green`, `rose`, `orange`, `sky`, `indigo`, `violet`, `purple`, `fuchsia` y los hex sueltos (`bg-[#…]`). El acento del módulo vive solo en `moduleColors.ts` (la raya del encabezado y el ícono del menú). Los grises del iPhone en las pantallas de celular son tokens, no hex: `bg-fondo-celular` (#F2F2F7), `bg-control-celular` (#E9E9EB) y `bg-pista-celular` (#E3E3E8). Excepciones: los colores de marca del catálogo público y los pedidos, y los que llevan información (semáforos, ▲ verde / ▼ rojo). Candado: `paleta-unica.test.ts` exige **cero** fuera de su lista de excepciones, cada una con su porqué y un tope que solo baja (fase 2, 2-oct-2026: de 1.189 a 0).
- **Una sola tipografía, también en los números** (Daniel, 6-oct-2026): montos y cantidades van con la letra del sistema y `tabular-nums`, nunca `font-mono`. Candado: `una-tipografia.test.ts`.
- **Un solo aviso (toast)**: `CajaAviso` de `ToastSystem.tsx`, que usan `useToast()` y `<Toast>`. Éxito negro (3 s), error rojo y aviso ámbar (8 s).
- **Todos los avisos salen en el mismo lugar: abajo al centro, como en el iPhone** (Daniel, 2-oct-2026). `useToast()`, `<Toast>` y `UndoToast` entran en una sola pila (`EnLaPilaDeAvisos`, en `CajaAviso.tsx`). En el celular la pila se sienta encima de la barra de pestañas (`--fg-alto-tab-bar`, `TAB_BAR_2026_10`) y nunca queda por debajo de la barra fija de abajo (`--fg-alto-barra-fija`) ni de la franja de iOS (`safe-area-inset-bottom`). Si salen varios, se apilan uno sobre otro sin taparse. Los avisos sueltos (Guías, «Actualizar ahora», Catálogos › Administrar, Asistencia, el «No tienes acceso» de `useAuth`) también entran a la pila con la misma caja. Ningún aviso nuevo se posiciona por su cuenta (`fixed … left-1/2`, `top-4 right-4`): el candado `aviso-unico.test.tsx` barre todo `src/`. Única excepción: el catálogo PÚBLICO que ve el cliente puede usar el color de su marca, pero en la misma pila.
- **Un solo aviso en línea: `<Aviso>`** (`src/components/ui/Aviso.tsx`, Daniel, 2-oct-2026: *«esto se puede optimizar, esos tipos de mensaje across el sistema»*). Todo mensaje dentro de una pantalla (aviso, error, información, éxito) es UNA fila compacta: ícono a la izquierda, texto corto y la acción a la DERECHA como texto azul («Duplicar y corregir», «Sincronizar», «Reintentar»). En el celular, si no cabe, la acción baja alineada a la derecha. Relleno `px-3 py-2`, `rounded-lg`, tonos de la paleta: aviso ámbar, error rojo, información gris, éxito verde. Sin punto suelto en una línea propia, sin botón negro dentro del aviso. El texto secundario va detrás de un ⓘ que se abre al tocarlo, o se quita si no aporta. Ejemplos: «Pedido ya enviado a Switch (#16-000002125). No se puede editar.» · «Relojes de Multifashion y Boston sin señal · hace 1 día». Un aviso que bloquea una acción dice qué se bloquea. Interruptor `AVISOS_2026_10`, prendido (Daniel lo aprobó el 2-oct-2026; las cajas de antes se borraron). Excepción: la nota de UN campo pegada a su control (Usuarios › Editar usuario, «Cambiar tu propio rol…») se queda como línea chica: el aviso en línea pesaba más que el campo (Daniel: *«lo empeoraste»*). Candado `aviso-en-linea.test.tsx`: una caja nueva con fondo `amber/red/blue/yellow-50` y borde fuera del componente pone el build rojo.
- **Sin modo oscuro** (retirado el 2-oct-2026) hasta que se decida hacerlo completo.
- **Cuando Daniel encuentra un error o un detalle, se verifica si tiene sentido y se busca y corrige en TODO el sistema, no solo donde lo vio.** Todo botón visible tiene que hacer algo; se audita con `scripts/auditar-botones.ts` antes de publicar un rediseño (Daniel, 2-oct-2026: *«auditar todos los botones para asegurarse que funcionen»*).
- **Lo que se toca en el celular recibe el dedo entero.** Un selector o calendario nativo que se dibuja como título («Aprobaciones ▾») va invisible ENCIMA de lo que se ve, nunca dentro de un `<label>` más ancho que él: en el iPhone tocar el rótulo no abre la lista.
- **En la computadora, nada se estira: todo crece en proporción con la pantalla** (Daniel, 2-oct-2026: *«lo prefiero centrado que a la izquierda, pero ¿se podrá que no exista el espacio en blanco como los ERP?»*; sobre la lista de CxC a todo el ancho, *«se ve peor así alargado, ¿no es mejor agrandarlo?»*; sobre un panel con su propia escala, *«no va con el sistema»*). El blanco salía de que cada pantalla vive en su caja (`max-w-4xl` a `max-w-7xl` o 1280 px) y la pantalla era más grande que la caja. La regla es UNA para todas las pantallas, como macOS con «texto más grande»: hasta 1279 px como hoy; la letra base pasa de 14 a **15 px desde 1280**, a **16 desde 1600** y a **18 desde 1920**, y todo lo demás crece en la misma proporción —campos, aire, íconos, el menú, las tablas, los paneles y las hojas—. Cada pantalla conserva su forma: una tabla se ve más grande y legible, no más ancha, y sus columnas quedan cerca; un panel lateral mide lo mismo en proporción, con sus bordes y su sombra de siempre. En el celular nada cambia. Se hace en UN lugar: `SidebarAwareMain` pone la clase y `globals.css` escala la raíz (interruptor `ESCALA_PANTALLA_2026_10`, **prendido**: Daniel aprobó el 2-oct-2026, «si te parece sí»). **Todo va centrado**: un formulario angosto (Nueva guía) se centra en su caja y su barra de guardar lo sigue. **Un formulario se abre en la misma ventana centrada en todo el sistema** (Daniel: *«el panel abierto de Nuevo gasto debe ser como lo hace ya el sistema en Reclamos, Marketing»*): `components/ui/VentanaCentrada.tsx`, la forma de «Registrar gasto» de Marketing; Nuevo gasto de Caja menuda ya la usa. 🔴 **Todo lo que mide en la pantalla y escribe una posición o un alto en el estilo divide entre la escala** (`lib/ui/escala-raiz.ts`: `escalaRaiz`, `aPxDeEstilo`); ya pasan por ahí `DesplegableFlotante`, `OverflowMenu`, la altura del encabezado, la barra fija de abajo y el menú plegado. 🩸 Sin eso, el menú del usuario quedaba 101 px corrido en 1440 y fuera de la pantalla en 1920. 🩸 Dos intentos anteriores quedan guardados y apagados: las tablas a todo el ancho con formularios en una columna que escala (`CONTENIDO_ANCHO_2026_10`) y las 2 columnas (`DOS_COLUMNAS_2026_10`).
- **Una hoja o un menú con opciones se LEE: vidrio grueso, nunca transparente, y nunca vacío** (Daniel, 4-oct-2026, desde su iPhone en Comisiones › Multifashion: *«no veo el refresh»*). Tocaba «···» y solo veía «Cancelar» sobre una franja borrosa. Dos causas: en Multifashion la hoja no traía ninguna opción, y el vidrio v2 (22 % de blanco) dejaba ver a través la barra de pestañas y la barra negra del total. Reglas: (1) los paneles de vidrio con opciones (`.vidrio.rounded-2xl`: hojas, «···», desplegables) llevan 92 % de blanco y desenfoque largo; la transparencia del 22 % queda para la barra de pestañas y el ☰; (2) si no hay nada que ofrecer, no se dibuja el «···» ni la hoja; (3) la hoja va por portal al final de `<body>`. Ventas y Comisiones usan la MISMA hoja (`HojaMenuCel`, `components/celular/Piezas.tsx`); CxC, Referencia, Catálogos y Multifashion ya iban por portal y heredan el vidrio. Candado `hoja-menu-celular.test.tsx`.
- **Una sola línea de frescura en TODO el sistema: «Actualizado 4:00 pm ↻» en el celular y «Actualizado hace 5 min · Actualizar» en la computadora** (Daniel, 4-oct-2026, al aprobar el mockup: *«tiene que estar así en TODO el sistema. No en uno sí y otro diferente»*). Toda pantalla que trae datos de Switch o del reloj dice de cuándo es el dato y lo actualiza con UN componente, `LineaDeFrescura` (`components/shared/LineaDeFrescura.tsx`, interruptor `FRESCURA_VISIBLE_2026_10`, **prendido**):
  - Mismo texto, mismo ícono (↻) y mismo toque: al tocar, actualiza y el ↻ gira; en una secuencia dice «Actualizando… (3/6)». En el celular va como línea gris bajo el título; en la computadora, al lado del título.
  - Nunca escondido en el «···» ni en la hoja «Más». Si el «···» se queda sin nada, no se dibuja.
  - Se fueron las variantes: el botón con borde «Actualizar ahora», «Actualizado HH:MM · Actualizar ahora» de Nueva guía, el texto azul dentro del aviso de Etiquetas, «hace X h ↻» de Catálogos, la pastilla «Actualizado: 4 oct 2026, 1:45 am», «Actualizar datos de Switch» de Consulta de artículos y la pastilla con «Sincronizar» de Asistencia.
  - Cuando la acción es otra, cambia solo la palabra: el reloj de Asistencia dice «Actualizado hace 5 min · Sincronizar» (le deja el pedido a la PC). Consulta de artículos muestra la línea solo cuando hay una búsqueda, porque actualiza lo buscado.
  - CxC con una empresa actualiza esa empresa; con «Todas», las 6 una tras otra, como Ventas.
  - Los avisos («Relojes sin señal · hace 2 días», «Vistana sin actualizar desde…») siguen siendo avisos, aparte de la línea.
  - Candado `frescura-unica.test.ts`: un `SyncNowButton` suelto, un ↻ o un `RefreshCw` a mano, o un texto de los de antes fuera de `LineaDeFrescura` ponen el build rojo (excepciones con su porqué y un tope que solo baja).
- **Las tarjetas de una lista dicen lo esencial en dos líneas.** El detalle va al tocarlas, no en una pared de chips (por ejemplo, 23 meses pendientes dibujados uno por uno).
- **Nada de párrafos explicativos arriba del contenido: lo que aporta va en UNA línea gris al final** (Daniel, 4-oct-2026, desde su iPhone en Comisiones › Multifashion: *«Quítame estos mensajes que no son necesarios. No solo aquí sino en todo el sistema. O bien resumido abajo en una línea.»*). Arriba de la lista había tres: «4 vendedoras · $16,795.58 ventas · 270 tickets», «La Δ compara contra octubre 2025, los mismos días (del 1 al 4).» y la regla del bono entera.
  - Arriba de una lista o tabla no va ninguna aclaración: cómo se calcula, contra qué compara, reglas, «Toca una empresa para…».
  - Si el dato aporta, va **una sola línea gris chica (`text-xs text-gray-500`) AL FINAL** de la lista o la tabla, resumida: «$16,796 ventas · 270 tickets · vs oct 2025, mismos días · bono al cierre del mes ⓘ». El detalle largo, solo detrás del ⓘ.
  - Un resumen con números se queda solo si no repite lo que ya se ve (el número de vendedoras son las filas; el conteo que ya dice un chip). Si se queda, va en esa misma línea final y sin centavos.
  - **No se quitan**: los avisos que piden actuar (errores, relojes sin señal, sin sincronizar), los estados vacíos y las etiquetas de campo.
  - Candado: `src/__tests__/textos-explicativos-al-pie.test.ts`.

- **Una lista desplegable se abre pegada a su botón y dentro de la pantalla, también con la escala** (Daniel, 5-oct-2026, en Multifashion en la computadora: *«al tocar Octubre 2026 no me deja cambiar»*). La lista de meses se abría corrida 88 px a la derecha, cortada («Febrero 202…») y tapando el chip de «Ventas diarias». Causa: el `zoom` de la escala en `<html>` volvía a multiplicar la posición que Radix (Select, Popover, Tooltip) mide en píxeles de la pantalla.
  - Arreglo común en `globals.css`: el envoltorio de Radix deshace la escala y su contenido la vuelve a poner. Lo propio de la casa ya dividía entre la escala (`escala-raiz.ts`).
  - Un selector arriba a la derecha abre alineado a la derecha de su botón (`align="end"`).
  - Medido en Chrome y WebKit a 1440 y 1920; Guías, Ventas y Comisiones (390 y 1440) ya cambiaban de mes bien. Candado `escala-flotantes.test.tsx`.
- **La ✕ de un chip quita ese filtro, y solo ese** (Daniel, 5-oct-2026, en Multifashion › Productos en la computadora: *«Calvin Klein ✕ · Accessories ✕ · Hombre ✕ · Men-Bags ✕»* y tocar la ✕ no hacía nada). Causa: el chip agranda su toque a 44 px con un `::before` absoluto (`CHIP_V4`), y ese velo quedaba ENCIMA de la ✕; el clic caía en el chip y abría la lista.
  - Todo lo que se toca DENTRO de un chip o un botón con `::before` va posicionado encima (`relative z-[1]`).
  - Quitar o cambiar un chip suelta los que dependían de él y quedan sin opción (`podarElegidos`); los que siguen siendo válidos se quedan.
  - Arreglado en la pantalla común (`ChipLista`): Ventas › Productos y Multifashion › Productos, en celular y computadora. Candado `productos-chip-quitar.test.tsx`.
- **Toda tabla de datos se ordena tocando el encabezado** (Daniel, 6-oct-2026, en Multifashion › Productos: *«Quiero poder ordenar por Descripción, Unidades, Venta, Margen y Stock. No solo en esta pantalla, sino en todo lo que tenga sentido»*). UN núcleo: `lib/orden-tabla.ts` (la regla) y `components/ui/OrdenTabla.tsx` (`useOrdenTabla` · `ThOrden` · `OrdenarEnLaBarra`).
  - Tocar ordena, tocar otra vez invierte, y al lado va ▲/▼ chico. Los números empiezan de mayor a menor y el texto de la A a la Z; sin dato va al final.
  - Abre en el orden de siempre de la pantalla, sin flecha. El orden elegido se recuerda en el aparato; donde Daniel fijó cómo ABRE una lista, solo durante la visita.
  - En el celular, sin encabezados, va «Ordenar ▾» en la barra con las mismas opciones, solo en las listas largas (Productos, Clientes, CxC).
  - Donde Daniel decidió que una lista NO se ordena o tiene un orden fijo, se respeta. Candado `orden-tabla.test.tsx`, con las dos listas.

## Mockup: siempre, con capturas reales

Daniel, 1-oct-2026: *«siempre mockup»* y *«dejamos fijo que las propuestas se muestran con capturas reales»*.

1. **Hoy**: captura real de cada pestaña (computadora y celular, 390 px), sacada con Playwright sobre el servidor local como admin, **en solo lectura** (se bloquea todo POST/PUT/PATCH/DELETE, incluido el registro de visitas).
2. **Propuesta**: se programa en local detrás de su interruptor, **sin publicar**, y se captura igual. Lo que Daniel ve es lo que va a recibir, con sus datos.
3. Se muestra «hoy | propuesta» lado a lado, uno por módulo. Con su «sí» se publica; con un «no» se descarta y no se publicó nada.
4. Para un ajuste chico (un nombre, mover un campo) basta un dibujo rápido con el estilo real.
5. **En la computadora, la captura va con el menú lateral PLEGADO** (Daniel, 1-oct-2026).
6. **Lo que cambia se marca con un recuadro ROJO** sobre la captura (borde rojo de 3 px y un número que se explica en una línea debajo), en «hoy» y en «propuesta». Así se ve qué mirar sin revisar cada detalle de la pantalla. Daniel: *«ponle un cuadro rojo para saber qué mirar»*.

## Checklist antes de entregar

- [ ] ¿Cuál es la pregunta de la pantalla? ¿Todo lo visible ayuda a responderla?
- [ ] ¿Se lee de arriba abajo en el orden del trabajo?
- [ ] ¿Hay una sola acción principal?
- [ ] ¿Lo escondido se usa poco, según datos medidos?
- [ ] ¿Cada botón dice lo que hace o agrega?
- [ ] ¿Algún campo queda solo en su fila, o hay tablas vacías o asteriscos?
- [ ] ¿Los nombres cumplen [nombres-erp.md](nombres-erp.md)?
- [ ] ¿Funciona en el celular, sin scroll horizontal y con todo lo tocable de al menos 44 px?
