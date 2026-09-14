# Caja Menuda — el porqué

> Post-mortem del módulo `/caja`. Nació el 14-sep-2026 al mover acá, verbatim, lo que CLAUDE.md decía de los dos defectos del 11-sep-2026.


---

## Lo que decía CLAUDE.md hasta el 14-sep-2026 (movido acá, verbatim)

> El 14-sep-2026 CLAUDE.md pasaba de 333 mil caracteres (el tope del harness es 150 mil) y las instrucciones se cortaban a la mitad. Se dejó ahí un resumen de las reglas vigentes y el texto completo —mediciones, citas de Daniel, candados y mutaciones— se movió acá sin cambiar una palabra.

### Caja Menuda — los dos defectos del 11-sep-2026

- 🔴 **LAS FOTOS DEL RECIBO SE VEN CON EL PERÍODO CERRADO.** 🩸 El menú «···» que las abre se dibujaba **solo** con el período abierto, así que el único archivo de comprobantes del módulo quedaba inalcanzable apenas se cerraba el ciclo —hoy **2 de los 3** períodos están cerrados— y `ZonaFotos soloVer={!isOpen}` era código muerto: esa condición no podía ser `true`. Ahora el menú existe siempre y, cerrado, lleva **una sola cosa**: «Foto del recibo», con la zona en SOLO LECTURA. La lista vive en `lib/caja/menu-del-gasto.ts` y la leen la tabla y la ficha. ⚠️ Editar y borrar siguen cerrados en la pantalla **y en el servidor**.
- 🔴 **VUELVE «RESTAURAR», y el aviso deja de mentir.** 🩸 Se había retirado el 7-sep por cero usos, pero el aviso de eliminar siguió prometiendo *«Podrás restaurarlo desde Gastos eliminados si es un error»* y esa pantalla quedó de solo lectura: la promesa fue falsa cuatro días. Daniel, textual: *«a) vuelve Restaurar»*. El soft delete ya existía (`deleted`, `deleted_by`, `deleted_at`); se agregó el botón por fila y su rama en el servidor — 🔴 en **su propia rama**, nunca por `ALLOWED_FIELDS`, y **solo con el período ABIERTO**: devolver un gasto a un período cerrado le cambiaría el total a algo que ya se imprimió.
- Candados: `caja-y-marketing-defectos.test.ts` (20) · `caja-periodo-cerrado-fotos.test.tsx` (3, de conducta). `caja-columnas-retiradas` cambió de dirección con nota fechada: «Restaurar» sale de la lista de lo retirado, con el CONTROL de que vuelve SOLO en la lista de eliminados.

