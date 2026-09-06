# Los mapas — un módulo por archivo, medidos contra producción

Escritos el **5 y 6 de septiembre de 2026** por nueve agentes en paralelo, a pedido de Daniel:
*«¿Por qué no mandas a todos los agentes a mapear así que cuando veamos un módulo ya tienes la
info?»*. Cada mapa mide contra producción (solo lectura) y **ningún número sale de la
documentación** — cuando algo la contradice, va marcado 🩸.

Los tres ejes que Daniel fijó: **números · eficiencia · que se sienta más fácil todo.** Por eso
cada mapa lleva una sección **«Cuánto cuesta hacer las cosas»**: las tareas reales, cuántos toques
cuestan hoy y cuántos podrían costar.

🔴 **Esto es la etapa de MAPEAR. Nada de esto se ejecuta hasta que Daniel lo defina**, uno por uno.

## Estado

| módulo | mapa | lo más fuerte que salió | estado |
|---|---|---|---|
| **Guías de Despacho** | [guias.md](guias.md) | «Despachar» no despacha el 74% de las veces (549 guardados, 142 cambian el estado); el atajo nuevo escribe `11-000002534` donde toda la historia dice `2534` (518 de 519) | **en discusión** |
| Asistencia y Planilla | [asistencia.md](asistencia.md) | 0 quincenas cerradas en toda la historia, y hoy no se puede cerrar ninguna: las 15 de 15 combinaciones empresa × período están frenadas | pendiente |
| Vista General | [vista-general.md](vista-general.md) | La mitad de abajo está vacía cada vez que entras (0 renglones de gasto en agosto y septiembre); tres avisos mienten por factores de 25, 4,5 y 3,5 | pendiente |
| Multifashion | [multifashion.md](multifashion.md) | Dos «YTD» distintos en la misma pantalla ($3.364,19 de diferencia); la pantalla no comprueba el rol y 10 de 11 rutas dejan entrar a secretaria | pendiente |
| Confecciones Boston | [boston.md](boston.md) | La regla está sana en las dos direcciones (0 filas suyas en la cartera del grupo, su venta sí suma); su directorio llevaba 38 días congelado | pendiente |
| Proveedores | [proveedores.md](proveedores.md) | Confecciones Boston se parte en tres filas por la grafía, y una cuarta con su misma cédula se llama `FASHION WEAR, INC` con $76.165,72 | pendiente |
| Catálogos | [catalogos.md](catalogos.md) | El 76% de las corridas no escribe nada (174 de 230 sesiones de Switch escribieron CERO); $33.912,00 en 7 pedidos vivos nunca llegaron a Switch y nada lo dice | pendiente |
| Referencia | [referencia.md](referencia.md) | «VENDIDO no pasa de 100%» vale solo para el 57%: sin ficha de catálogo la cuenta es otra y puede decir 207%, y alcanza a 11.698 códigos (43%) | pendiente |
| Reclamos | [reclamos.md](reclamos.md) | 26 de 34 reclamos vivos no se pueden editar sin rellenar 134 campos; $12.218,27 llevan más de 45 días sin un segundo correo | pendiente |
| Packing Lists | [packing-lists.md](packing-lists.md) | El módulo está vacío: el cron borró las 28 listas el 14-may sin copia, y lo usó una sola persona 7 veces en abril | pendiente |
| Marketing | [marketing.md](marketing.md) | `bultos` está lleno en 0 de 111 renglones y ocupa 6 de los 13 casilleros; borrar una entrega es un DELETE de verdad y falta la entrega 23 | pendiente |
| Caja Menuda | [caja.md](caja.md) | Mueve $563,28 en 5 meses — el 0,07% de lo que ya se mide en Gastos; 93 gastos escritos en 18 días | pendiente |
| Gastos | [gastos.md](gastos.md) | El módulo abre en septiembre y le dice a 7 empresas «este mes no salió plata» — Vistana saca $34.763,21 de caja al mes; Saldos de banco se usó UNA vez, el 10-ago | pendiente |
| Comisiones | [comisiones.md](comisiones.md) | Un descuento de $1.573,08 sin fecha se resta TODOS los meses ($14.157,72 en 2026), y el interruptor «Activo» de las tasas no hace nada | pendiente |
| Depurador | [depurador.md](depurador.md) | 38 de 140 descargas son repeticiones exactas (21 de ellas a menos de 30 minutos de la anterior); el Historial que lo cura tiene 0 archivos | pendiente |
| Usuarios | [usuarios.md](usuarios.md) | Angela y Andrea no ven «Asistencia y Planilla» aunque su rol se lo da; el desplegable ofrece 5 de los 7 roles | pendiente |
| Data Health | [data-health.md](data-health.md) | 551 resultados en 90 días, los 551 «todo bien», y el botón se tocó 1 vez en 120 días | pendiente |

## Cómo se usa esto

Cuando abramos un módulo: se lee su mapa, se contestan sus preguntas (todas traen opciones
**a · b · c** con una recomendación), y recién ahí se ejecuta. El mapa no es la decisión: es lo
que se pone sobre la mesa para tomarla.

Las decisiones que Daniel vaya cerrando se anotan **con su cita textual** en
[`../estado-actual.md`](../estado-actual.md), no aquí.
