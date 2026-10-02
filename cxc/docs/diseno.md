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
