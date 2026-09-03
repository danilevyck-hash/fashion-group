---
name: numero-no-cuadra
description: Un número de la app no cuadra con Switch, o dos pantallas del sistema muestran cifras distintas para lo mismo. Libreto operativo probado CUATRO veces en un día (2-sep-2026, Ventas › Clientes). Usar cuando Daniel dice «la app dice X y Switch dice Y», cuando compara dos pestañas y no coinciden, o cuando un total, un ranking o un «vs año anterior» se ve raro. También cuando el número parece bien y hay que demostrarlo.
---

# Un número no cuadra

Daniel compara la app contra Switch todos los días. Cuando no cuadra, **a veces es error y a veces no**, y las dos respuestas se demuestran de la misma forma: reproduciendo el número desde `switch_facturas` con la misma ventana. El 2-sep-2026 pasó cuatro veces en un día; una no era error y tres sí. Este es el libreto.

**Regla de oro:** primero reproducir, después explicar, y **contar a cuántos afecta antes de proponer nada**. Nunca proponer un cambio a partir de un solo cliente.

---

## Los cuatro casos del 2-sep-2026, en una línea cada uno

| Pantalla | La app decía | Switch / lo real | Causa | ¿Error? |
|---|---|---|---|---|
| Ventas › Clientes · **Multi Fashion Holding** (D-108) | $50.702 | $49.599 | Una factura de HOY que el cron de ventas todavía no había bajado (las 8 empresas sincronizan a las 11:50/15/19/23 UTC) | **No.** Frescura, no defecto |
| Ventas › Clientes · **City Mall David** · Vistana · 2026 | $227.872 | $113.936 (exacto ×2) | Boston adentro de `clientes_master` (4.910 clientes desde el 28-jul) + `LEFT JOIN … ON nombre_normalized`: dos filas con el mismo nombre → la factura sumaba dos veces | **Grave.** Commits `ad7f2623` + `44be9b16` |
| Ventas › Clientes · **Mostrador** | $25.835 | $54.478 | Se buscaba por NOMBRE (`VENTAS LOCALES`) y Switch escribe `VENTAS LOCA`, `VENTAS`, `CONTADO`: encontraba **1 de 6** mostradores | **Error.** Commit `12791f11`: se reconoce por código `TCKCTA` |
| Ventas › Clientes · columna **«vs 2025»** | +3% | +36% | El año anterior se cortaba a FIN DE MES (`mes <= max_mes`): 8 meses y 2 días contra 9 meses enteros. 37 de 115 clientes cambiaban de número, 6 de signo | **Error.** Commit `d648f4fd`, migración `20260909120000` |

Detalle verbatim y mediciones: `docs/postmortems/ventas-referencia.md` (secciones del 2 y 3-sep-2026).

---

## Paso 1 — Identificar QUÉ produce el número

Antes de tocar nada: **qué vista, RPC o función arma la cifra que Daniel está mirando.** El mapa está en `CLAUDE.md` → sección **«Dónde vive cada dato»** (por pregunta, con las ⚠️ de para qué NO sirve cada tabla).

Atajos que ya se usaron:

```bash
# ¿Qué lee la pantalla?
grep -rn "\.rpc(\"\|from(\"" src/components/ventas/ClientesView.tsx src/lib/ventas/queries.ts src/app/api/ventas/ | grep -v test
# ¿Qué SQL define esa vista/RPC? (la definición FINAL es la última migración que la toca)
grep -ln "clientes_empresa_12m_vw\|clientes_anio" supabase/migrations/*.sql | tail -3
```

| Pantalla | Lo arma |
|---|---|
| Ventas › Clientes, ranking y «vs año» | `clientes_agregado_12m_vw` / `clientes_empresa_12m_vw` (año en curso) · RPC `clientes_anio(año)` (años cerrados) |
| Vista General, Ventas › Resumen | `ventas_rollup_mensual_mv` (hay que refrescarla) · `switch_ventas_unificado_vw` |
| Multifashion | RPCs `multifashion_mensual_v7`, `multifashion_vendedoras_v3`, … (empresa = `american_classic`, fija en el servidor) |
| Comisiones | RPC `comision_b2b_v5` + `netearComisiones` en el servidor |
| CXC del grupo | `switch_estadocuenta_aging` / `_mv` (columna `company_key`, no `empresa_key`) |
| Cartera de Boston | `switch_estadocuenta_aging_boston` — tabla aparte a propósito |

⚠️ Si la vista es materializada (`_mv`), el número puede ser viejo aunque la fuente esté bien. Mirar `synced_at` / el último refresh antes de declarar un defecto.

---

## Paso 2 — Reproducirlo desde `switch_facturas`, con la MISMA ventana, PAGINANDO

`switch_facturas` es la fuente única de ventas. Reconstruir el número a mano con la misma empresa, el mismo cliente y las mismas fechas que la pantalla. Plantilla probada: `scripts/_diag-clientes-vs-2025-mismos-dias.ts` (solo lectura; reconstruye las dos ventanas, comprueba que la réplica reproduce la vista AL CENTAVO antes de sacar conclusiones, y recién ahí compara).

```bash
DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-clientes-vs-2025-mismos-dias.ts
```

Para una consulta rápida, PostgREST directo (**solo GET**, credenciales en `.env.local`):

```bash
curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/switch_facturas?select=fecha,tipo_comprobante,subtotal,subtotal_descuento,cliente_switch_id,cliente_nombre&empresa_key=eq.vistana&cliente_switch_id=eq.139&fecha=gte.2026-01-01&fecha=lt.2027-01-01&order=id.asc&limit=1000&offset=0" \
  -H "Prefer: count=exact" -D - | grep -i "content-range"
```

`Content-Range: 0-999/1834` → hay 1.834 filas y solo llegaron 1.000. **Seguir con `offset=1000`, `offset=2000`… hasta que el total cuadre.** En código, `leerTodoPaginado` (`src/lib/supabase-paginado.ts`) hace exactamente eso y **falla ruidosamente** si el conteo no cuadra.

Reglas de la réplica, todas obligatorias:
- **Las notas de crédito RESTAN.** `SUMAN = Factura · Tiquete · Transacción · Nota de Débito`; `Nota de Crédito` con signo negativo. Sumarlas da el doble de las devoluciones.
- **Filtrar por año va por RANGO** (`fecha >= … AND fecha < …`), nunca `EXTRACT(YEAR …)`.
- **Siempre acotar por `empresa_key`.** `switch_facturas` incluye ACS (29.584) y Boston (9.145).
- **La réplica tiene que reproducir primero la cifra de la pantalla.** Si no la reproduce, la réplica está mal, no la pantalla. Recién cuando cuadra al centavo, se cambia UNA cosa (la ventana, el join, el filtro) y se mira qué se mueve.

---

## Paso 3 — Si cuadra con la app, buscar qué FILTRO o VENTANA explica la diferencia con la otra pantalla

Cuando la réplica da lo mismo que la app, la diferencia con Switch (o con la otra pestaña) está en **cómo se recortó**, no en la suma. Probar de a una, en este orden:

| Probar | Cómo se ve | Caso real |
|---|---|---|
| **Fechas / frescura** | ¿La última factura en `switch_facturas` es de hoy? ¿A qué hora corrió el último `switch-sync facturas`? | Multi Fashion Holding: $1.103 = una factura de hoy sin bajar. **No era error.** |
| **Cliente: código vs nombre** | ¿La pantalla une por `(empresa_key, cliente_switch_id)` → `switch_clientes.codigo`, o por `nombre_normalized`? | City Mall David ×2 · Mostrador 1 de 6 |
| **Empresa** | ¿Están las 6 del grupo? ¿Se coló Boston o ACS? | Faltaba `joystep` en los filtros; Boston adentro de `clientes_master` |
| **Tipo de comprobante** | ¿Restan las NC? ¿Entran Transacción y Tiquete? Lista en `src/lib/ventas/tipos-comprobante.ts` | — |
| **Bruto vs neto** | `subtotal` (bruto) vs `subtotal_descuento` (neto). **La pantalla mide NETO.** | Mostrador: $55.555 con `subtotal` vs $54.478 con `subtotal_descuento` |
| **Mismos días** | «vs año anterior» = mismos días, con la fecha de Panamá (`hoyPanama` / `fechaPanamaDe`, UTC−5 fijo) | «vs 2025»: +3% vs +36% |

Si después de las seis la diferencia sigue sin explicación, **decirlo así** — no inventar una causa plausible.

---

## Paso 4 — Contar a cuántos afecta ANTES de proponer nada

Un cliente no es una regla. Antes de proponer un cambio de vista, migración o filtro, **medir sobre todo el universo** que esa pantalla muestra:

- Cuántas filas cambian de número.
- Cuántas cambian de **signo** (sube ↔ baja) — es lo que Daniel lee primero.
- Cuánta plata mueve en total y cuáles son las 5 que más se mueven.
- Qué pasa con los casos borde (huérfanos, ids viejos, el mostrador).

Precedentes medidos: «vs 2025» → 37 de 115 cambiaban de número, 6 de signo · join por código → 370 facturas (4,52%) con id viejo, $3.817,74 (0,07%) que caen a «Otros clientes» **con y sin** fallback, así que el fallback no se dejó.

Y **se verifica por mutación** después del arreglo: `scripts/_mutar-candados-clientes-master.sh` (21 de 21 cazadas), `scripts/_mutar-mostrador-por-codigo.sh`, `scripts/_mutar-clientes-mismos-dias.sh`.

---

## Paso 5 — Reportar en el formato de Daniel

**Qué pantalla · qué dato · ahora vs después.** Sin nombres de tabla cuando se puede decir con el nombre que él usa. Cuando el número está bien, decirlo igual de claro y decir por qué difiere.

```
Ventas › Clientes · City Mall David · Vistana · 2026
  ahora:   $227.872   (la factura se cuenta dos veces: hay un City Mall del grupo y otro de Boston con el mismo nombre)
  después: $113.936   (= Switch)
Afecta a 24 clientes más, mismo mecanismo. Migración lista para que la apliques.
```

```
Ventas › Clientes · Multi Fashion Holding
  app $50.702 · Switch $49.599 → diferencia $1.103 = una factura de hoy que baja a las 15:00 UTC.
  No es error. Nada que tocar.
```

Y si hace falta un mockup, es **ahora vs después, dos cuadros, sin párrafos**. Regla 3 de «Cómo trabajar con Daniel»: mapear → definir juntos → ejecutar. **El arreglo se escribe después de que él define de dónde sale el dato**, no antes.

---

## 🩸 Las trampas que costaron el 2-sep-2026

- 🩸 **`db-max-rows` = 1000 y corta EN SILENCIO.** Una réplica sin paginar dio **$41.287 en vez de $390.084** y parecía completa. Siempre `order` estable + `offset`/`range` hasta cuadrar contra `count=exact`, o `leerTodoPaginado`. Sin `.order()` por columna única la paginación repite o saltea filas — cambia la forma del error, no lo arregla.
- 🩸 **`subtotal` vs `subtotal_descuento`.** La pantalla mide NETO. Con el bruto el mostrador dio **$55.555 en vez de $54.478** y parecía «casi». «Casi» es la señal de que se usó la columna equivocada.
- 🩸 **La tabla de facturas no sirve para atributos de un artículo ni de un cliente.** `switch_facturas` / `switch_factura_lineas` solo tienen lo que SE VENDIÓ: en active_shoes 1.126 artículos distintos contra 1.763 del catálogo. Atributos de artículo → `switch_articulo_info`; de cliente → `switch_clientes` + `clientes_master`.
- 🩸 **El nombre del cliente es de cada empresa; el CÓDIGO es del grupo.** Daniel, textual: *«todos los D-24 son de City Mall across mis 6 empresas»* (138 de 147 códigos cuadran en las 6). Unir por nombre multiplica (City Mall David ×2) o pierde (mostrador 1 de 6). El camino es `switch_facturas (empresa_key, cliente_switch_id) → switch_clientes → codigo → clientes_master`, sin fallback por nombre.
- 🩸 **«Mismo período» = mismos DÍAS, con la fecha de Panamá.** Cortar el año anterior por mes entero compara 8 meses contra 9. La regla ya existía en Multifashion (`rangoComparativo`) y en el resumen de ACS; el 29-feb cae en el 28. Espejo en `src/lib/ventas/clientes-corte-comparativo.ts`.
- 🩸 **Frescura antes que defecto.** Mirar la hora del último sync de esa empresa (`switch_sync_log`, `sync_type = facturas`) antes de abrir el SQL. Una diferencia del tamaño de una factura, el mismo día, casi siempre es eso.

---

## Errores que no hay que repetir

- ❌ Declarar «error» sin haber reproducido primero el número de la pantalla al centavo.
- ❌ Reproducir sin paginar y comparar contra un total truncado.
- ❌ Proponer un cambio de vista a partir de un solo cliente, sin contar cuántos se mueven.
- ❌ Arreglar el join y dejar un fallback por nombre «por si acaso»: un camino muerto es una trampa.
- ❌ Reportar con nombres de tabla y sin «ahora vs después».
- ❌ Escribir el arreglo antes de que Daniel defina de dónde sale el dato.
