# Cómo se diseña una pantalla (estilo Apple)

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

  Prohibido en pantallas: `stone`, `slate`, `teal`, `green`, `rose`, `orange`, `sky`, `indigo`, `violet`, `purple`, `fuchsia` y los hex sueltos (`bg-[#…]`). El acento del módulo vive solo en `moduleColors.ts` (la raya del encabezado y el ícono del menú). Excepción: los colores de marca del catálogo público y los pedidos. Candado: `paleta-unica.test.ts`, con un techo que solo baja.
- **Un solo aviso (toast)**: `CajaAviso` de `ToastSystem.tsx`, que usan `useToast()` y `<Toast>`. Éxito negro (3 s), error rojo y aviso ámbar (8 s).
- **Todos los avisos salen en el mismo lugar: abajo al centro, como en el iPhone** (Daniel, 2-oct-2026). `useToast()`, `<Toast>` y `UndoToast` entran en una sola pila (`EnLaPilaDeAvisos`, en `CajaAviso.tsx`). En el celular la pila se sienta encima del botón ☰, que a su vez respeta la barra fija de abajo (`--fg-alto-barra-fija`) y la franja de iOS (`safe-area-inset-bottom`). Si salen varios, se apilan uno sobre otro sin taparse. Los avisos sueltos (Guías, «Actualizar ahora», Catálogos › Administrar, Asistencia, el «No tienes acceso» de `useAuth`) también entran a la pila con la misma caja. Ningún aviso nuevo se posiciona por su cuenta (`fixed … left-1/2`, `top-4 right-4`): el candado `aviso-unico.test.tsx` barre todo `src/`. Única excepción: el catálogo PÚBLICO que ve el cliente puede usar el color de su marca, pero en la misma pila.
- **Un solo aviso en línea: `<Aviso>`** (`src/components/ui/Aviso.tsx`, Daniel, 2-oct-2026: *«esto se puede optimizar, esos tipos de mensaje across el sistema»*). Todo mensaje dentro de una pantalla (aviso, error, información, éxito) es UNA fila compacta: ícono a la izquierda, texto corto y la acción a la DERECHA como texto azul («Duplicar y corregir», «Sincronizar», «Reintentar»). En el celular, si no cabe, la acción baja alineada a la derecha. Relleno `px-3 py-2`, `rounded-lg`, tonos de la paleta: aviso ámbar, error rojo, información gris, éxito verde. Sin punto suelto en una línea propia, sin botón negro dentro del aviso. El texto secundario va detrás de un ⓘ que se abre al tocarlo, o se quita si no aporta. Ejemplos: «Pedido ya enviado a Switch (#16-000002125). No se puede editar.» · «Relojes de Multifashion y Boston sin señal · hace 1 día». Un aviso que bloquea una acción dice qué se bloquea. Interruptor `AVISOS_2026_10` (`false` = cada pantalla dibuja su caja de antes). Candado `aviso-en-linea.test.tsx`: una caja nueva con fondo `amber/red/blue/yellow-50` y borde fuera del componente pone el build rojo.
- **Sin modo oscuro** (retirado el 2-oct-2026) hasta que se decida hacerlo completo.
- **Cuando Daniel encuentra un error o un detalle, se verifica si tiene sentido y se busca y corrige en TODO el sistema, no solo donde lo vio.** Todo botón visible tiene que hacer algo; se audita con `scripts/auditar-botones.ts` antes de publicar un rediseño (Daniel, 2-oct-2026: *«auditar todos los botones para asegurarse que funcionen»*).
- **Lo que se toca en el celular recibe el dedo entero.** Un selector o calendario nativo que se dibuja como título («Aprobaciones ▾») va invisible ENCIMA de lo que se ve, nunca dentro de un `<label>` más ancho que él: en el iPhone tocar el rótulo no abre la lista.
- **Las tarjetas de una lista dicen lo esencial en dos líneas.** El detalle va al tocarlas, no en una pared de chips (por ejemplo, 23 meses pendientes dibujados uno por uno).

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
