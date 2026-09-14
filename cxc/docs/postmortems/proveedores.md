# Proveedores — el porqué

> Post-mortem del módulo `/proveedores` (un proveedor, una fila — 6-sep-2026; la lectura caída y el rótulo del cartel — 11-sep-2026). Nació el 14-sep-2026 al mover acá, verbatim, lo que CLAUDE.md decía.


---

## Lo que decía CLAUDE.md hasta el 14-sep-2026 (movido acá, verbatim)

> El 14-sep-2026 CLAUDE.md pasaba de 333 mil caracteres (el tope del harness es 150 mil) y las instrucciones se cortaban a la mitad. Se dejó ahí un resumen de las reglas vigentes y el texto completo —mediciones, citas de Daniel, candados y mutaciones— se movió acá sin cambiar una palabra.

### Proveedores — un proveedor, una fila (6-sep-2026)

- 🔴 **QUIÉN ES QUIÉN SALE DE UNA LISTA ESCRITA A MANO** (`proveedor_amarre`), no del nombre y no de la cédula. Daniel, textual: *«no te fijes por la cédula, solo por nombre para saber cuáles son iguales»*. Es el mismo camino que las grafías de Reynaldo en Comisiones. **Nada por parecido**: ni distancia de edición, ni trigramas, ni fonética.
- 🩸 **LA CÉDULA MIENTE EN LAS DOS DIRECCIONES.** De los seis grupos de filas que comparten identificación, **TRES son empresas distintas** — `FASHION WEAR, INC` ($76.165,72) **no es** Confecciones Boston (*«fashion wear no es boston»*), `CIF EXPRESS SA.` no es `Luis Alberto Torres De Gracias`, `ACTIVE SHOES S.A` no es `BDL SERVICES INC`. Y al revés: **American Fashion Wear, el proveedor más grande ($3.633.293,25), tiene DOS cédulas** que difieren en un guion, así que unir por cédula lo partiría en dos. En los tres casos **Switch tiene la cédula mal**; queda escrito en el código y en la migración para quien mantenga Switch.
- 🔴 **El grano es `(empresa_key, proveedor_switch_id)`** — la UNIQUE de la tabla, la llave del upsert del sync y la de su purga. El **código solo NO es identidad**: 10 códigos nombran proveedores distintos según la empresa. El par `(empresa, código)` sí distingue las 65 filas de hoy, pero `codigo` es nullable y lo teclea una persona en Switch.
- ⚠️ **`switch_proveedor_estadocuenta` no tiene soft delete** y el sync borra de verdad lo que Switch deja de listar. Por eso el amarre vive en **su propia tabla**: si un proveedor se cae del estado de cuenta y vuelve, el amarre sigue valiendo.
- **CUATRO grupos confirmados y nada más**: ACTIVE WEAR ($52.479,52) · GRUPO J NAVARRO ($0,00) · **CONFECCIONES BOSTON** (sus 4 grafías en 5 empresas, $4.165,96) · LATIN FITNESS GROUP ($288.358,84). Medido: la lista pasa de **47 filas a 43** (34 con saldo → 31) y el total **$5.199.705,82 no se mueve ni un centavo** — esto reagrupa, no cambia plata.
- **La pantalla muestra UN proveedor por fila y DE QUÉ EMPRESAS viene** (nombres cortos). Antes esa columna era un número pelado que además mentía. El buscador mira **todas las grafías**, no solo la que se enseña.
- 🩸 **UNA LECTURA CAÍDA SE DICE, NO SE DISFRAZA DE «no hay nada» (11-sep-2026).** El `fetch` de la lista ignoraba todo lo que no fuera 200 —sin guardar el error y sin reintentar—, así que cualquier fallo dejaba la pantalla con **«Sin proveedores — No hay datos sincronizados aún»**: con $4.696.830,50 en la cartera, decirle a la contadora que no hay datos es la peor respuesta posible. Ahora dice **«No se pudo cargar. Intenta de nuevo en unos segundos»** con su botón de 44 px, y **lo que ya estaba en pantalla no se borra**.
- 🩸 **EL CARTEL GRANDE DICE DE QUÉ ES SU NÚMERO (11-sep-2026).** Con una búsqueda escrita el total ya era el de lo buscado y el rótulo seguía diciendo «Por pagar · **grupo**»: escribir «boston» dejaba en pantalla `Por pagar · grupo $4,165.96`. La regla vive en un módulo puro (`lib/proveedores/rotulo.ts`) y **la búsqueda manda sobre el chip de empresa**, que es el filtro más fino; lo buscado se muestra **tal como se tecleó**, solo sin bordes. Candado: `proveedores-error-y-rotulo.test.ts`.
- Candados: `proveedores-identidad.test.ts` · `proveedores-una-fila-por-proveedor.test.tsx`; **32 mutaciones, 32 cazadas** (`scripts/_mutar-candados-proveedores-identidad.sh`, con 2 controles); medición `scripts/_medir-proveedores-amarre.mjs`.

