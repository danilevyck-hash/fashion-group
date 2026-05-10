# Audit: Δ VS 2025 en Tab Clientes

Fecha: 2026-05-10
Estado: investigación, sin acción

## Pregunta

¿Por qué los top clientes en tab Clientes muestran deltas de −70% a −90%
consistentemente, cuando el negocio no ha caído a esa magnitud?

## Cadena de data

- **Componente**: `cxc/src/components/ventas/ClientesView.tsx`
  - Columna `Compras YTD` ← `c.ytd` (línea 273)
  - Columna `Δ vs 2025` ← `c.delta` (línea 275)
  - Subtitle del header ← `"últimos 12 meses · ordenados por última compra"` (línea 144)
- **Carga inicial**: server-side via `cxc/src/app/ventas/page.tsx` → `fetchClientes({ year })`
- **Refetch al cambiar pill empresa**: `GET /api/ventas/clientes-12m?empresa=X` → `cxc/src/app/api/ventas/clientes-12m/route.ts` → `fetchClientes({ year, empresaKey })`
- **Query function**: `cxc/src/lib/ventas/queries.ts:216-267` (`fetchClientes`)
  - Branch "Todas": `SELECT * FROM clientes_agregado_12m_vw` (línea 229)
  - Branch empresa específica: `SELECT * FROM clientes_empresa_12m_vw WHERE empresa = X` (línea 234)
  - Mapeo JS: `ytd: toNum(r.compras_ytd)` (254), `delta: toNum(r.delta_vs_2025)` (255)
- **View granular**: `clientes_empresa_12m_vw` — definida en `cxc/supabase/migrations/20260510030000_clientes_empresa_12m_vw.sql` (líneas 25-99)
- **View agregada (Todas)**: `clientes_agregado_12m_vw` — misma migration (líneas 114-145), suma window functions sobre la materialized view granular
- **Tabla base**: `ventas_raw` (columnas `cliente`, `empresa`, `fecha`, `anio`, `mes`, `subtotal`)

## Definición exacta de "Compras YTD"

CTE `ytd_actual` en la materialized view (líneas 63-68):

```sql
ytd_actual AS (
  SELECT f.cliente_norm, f.empresa, SUM(f.subtotal) AS compras_ytd
  FROM filtered f, current_year cy
  WHERE f.anio = cy.y
  GROUP BY f.cliente_norm, f.empresa
)
```

Donde `cy.y = EXTRACT(YEAR FROM CURRENT_DATE)` = `2026` hoy.

- **Período cubierto**: 2026-01-01 a 2026-04-30 (último mes con uploads). En sentido literal del filtro: cualquier fecha con `anio = 2026`, así que la fecha tope avanza con cada upload.
- **Tamaño**: ~4 meses (Ene + Feb + Mar + Abr 2026, asumiendo data hasta cierre Abr).

En el modo Todas la suma se agrega cross-empresa con `SUM(compras_ytd) OVER (PARTITION BY cliente)`. El período por empresa-fila no cambia.

## Definición exacta de "Δ VS 2025"

CTE `prev_year` (líneas 69-74):

```sql
prev_year AS (
  SELECT f.cliente_norm, f.empresa, SUM(f.subtotal) AS compras_anio_anterior
  FROM filtered f, current_year cy
  WHERE f.anio = cy.y - 1
  GROUP BY f.cliente_norm, f.empresa
)
```

Fórmula del delta en el SELECT final (líneas 87-91):

```sql
CASE
  WHEN COALESCE(py.compras_anio_anterior, 0) > 0
    THEN ((COALESCE(ya.compras_ytd, 0) - py.compras_anio_anterior) / py.compras_anio_anterior)::numeric
  ELSE NULL
END AS delta_vs_2025
```

- **Período de comparación**: 2025-01-01 a 2025-12-31. El filtro es `f.anio = cy.y - 1 = 2025`, sin restricción de mes — captura el AÑO COMPLETO 2025.
- **Tamaño**: 12 meses.
- **Fórmula del delta**: `(YTD_4m_2026 − full_year_2025) / full_year_2025`.

## Diagnóstico

- [x] **Las ventanas NO son comparables → bug confirmado.**

  **Razón**: el numerador `compras_ytd` cubre **4 meses** (Ene–Abr 2026), el denominador `compras_anio_anterior` cubre **12 meses** (Ene–Dic 2025). Se está comparando un tercio de año contra un año completo y dividiendo por la magnitud del año completo. Para cualquier cliente cuyo run-rate 2026 sea cercano al run-rate 2025, el delta resultante converge a aproximadamente `(1/3 − 1) = −66%`. Eso explica el patrón sistemático de −70% a −90% en top clientes:

  ```
  delta ≈ (4 × ratemes − 12 × rate_2025) / (12 × rate_2025)
        = (rate_2026 − 3 × rate_2025) / (3 × rate_2025)
  ```

  Si `rate_2026 ≈ rate_2025` → delta ≈ −67%.
  Si `rate_2026 = 0.5 × rate_2025` (cliente cayendo a la mitad) → delta ≈ −83%.
  Si `rate_2026 = 1.5 × rate_2025` (cliente creciendo 50%) → delta ≈ −50%.

  El sesgo afecta a TODOS los clientes uniformemente, no refleja realidad de negocio.

## Verificación lógica con City Mall Paso Canoa

Datos del screenshot reportado:
- `Compras YTD` = $464,082
- `Δ vs 2025` = −80% (aprox)

Si el cálculo es `(464082 − X_2025_full) / X_2025_full = −0.80`:
- `464082 − X = −0.80 × X`
- `464082 = 0.20 × X`
- `X = $2,320,410` (compras totales 2025 según el denominador del cálculo actual)

Validación de que ese `X` sea el año completo 2025:
- $2.32M / 12 meses ≈ **$193K/mes promedio en 2025**
- $464K / 4 meses ≈ **$116K/mes promedio en 2026 YTD**

Si el cliente realmente está corriendo a ~$116K/mes vs ~$193K/mes del año pasado, el delta same-period correcto sería:
- 2025 Ene–Abr (4 meses) ≈ 4 × $193K = ~$772K
- delta apple-to-apple = (464 − 772) / 772 ≈ **−40%**

El cliente sí ha bajado (de $193K a $116K mensual), pero la realidad es −40% no −80%. El −80% mostrado es resultado del bug de ventanas, NO de una caída adicional de negocio.

(Pendiente de validar con Daniel correr `SELECT SUM(subtotal) FROM ventas_raw WHERE cliente ILIKE '%PASO CANOA%' AND empresa = 'vistana' AND anio = 2025 AND mes <= 4` contra Supabase para confirmar el orden de magnitud.)

## Cálculo correcto sugerido

**Período actual** (Compras YTD): mantener como está
- 2026-01-01 al último día con data en el año en curso (típicamente último mes cerrado).

**Período comparación** (Δ vs prev): cambiar a same-period del año anterior
- 2025-01-01 a 2025-04-30 (mismo rango que el actual).
- Implementación SQL: agregar `AND f.mes <= (SELECT MAX(mes) FROM filtered WHERE anio = cy.y)` al CTE `prev_year`, o usar `MAX(mes) por cliente` como tenía la versión original (`20260510000000_ventas_redesign.sql:329-338`):
  ```sql
  WHERE f.anio = cy.y - 1
    AND f.mes <= COALESCE(
      (SELECT MAX(mes) FROM filtered fa WHERE fa.cliente_norm = f.cliente_norm AND fa.anio = cy.y),
      12
    )
  ```

**Por qué este es el correcto**: compara apples-to-apples. Numerador y denominador miden el mismo número de meses calendario, en posiciones equivalentes del año. El delta resultante refleja crecimiento o contracción real del cliente, no un artefacto matemático.

**Nota sobre la regresión**: el filtro de same-period EXISTÍA en la primera versión de la view (migration `20260510000000_ventas_redesign.sql`, CTE `ytd_prev` líneas 325-339) y se mantuvo en `20260510010000_clientes_ytd_materialized.sql`. Se PERDIÓ en `20260510020000_clientes_12m_vw.sql` (rebuild a vista 12m rolling) y se heredó perdido en `20260510030000_clientes_empresa_12m_vw.sql` (split granular cliente-empresa). Es regresión silenciosa de los últimos dos sprints.

## Inconsistencias adicionales detectadas

- **Header de columna dice "Compras YTD" pero subtitle dice "últimos 12 meses"**: el header es la verdad operativa de la columna numérica (`compras_ytd` literalmente filtra `anio = 2026`). El subtitle se refiere a la INCLUSIÓN de filas en la lista (filtro `active_pairs` con cutoff de 12 meses rolling), NO al valor numérico mostrado. Dos cosas distintas.

  Verdad textual:
  - **Filtro de inclusión** (qué clientes aparecen en la tabla): `active_pairs` → fecha ≥ `date_trunc('month', NOW()) - INTERVAL '12 months'`. Es un filtro rolling de últimos 12 meses calendario. Hoy: desde 2025-05-01.
  - **Valor numérico de la columna**: año fiscal 2026 hasta hoy (~4 meses YTD).
  - Resultado: un cliente puede aparecer en la lista por una compra hecha en, por ejemplo, mayo 2025, pero su `Compras YTD` puede ser $0 (si no compró nada en 2026), produciendo `delta_vs_2025 = -100%`. Eso explicaría algunos −100% extremos del screenshot.

- **`empresas_count` y comparativos 2025 cross-empresa**: el modo Todas suma `compras_anio_anterior` cross-empresa con `SUM() OVER (PARTITION BY cliente)`. Si un cliente compraba a múltiples empresas en 2025 pero ya no compra a algunas en 2026, ese 2025 sigue acumulando en el denominador desde empresas donde ya no aparece como activo. Plausible que infla más el sesgo en el modo Todas que en el modo empresa específica.

- **`active_pairs` se refiere al rolling 12-month window, pero el delta compara contra `f.anio = cy.y - 1` (año calendario)**: estos dos no se intersectan limpio. Un cliente con primera compra en diciembre 2025 y nada en 2026 aparece en la lista (rolling activo) con `compras_ytd = 0` y `delta_vs_2025 < 0` (probablemente −100% o NULL si el monto es exacto a 0). Un cliente con compras en abril 2025 y nada después: NO aparece (fuera del rolling de 12m desde 2025-05-01). Esto significa que la composición misma de la lista omite parcialmente los clientes que comprarían en cualquier comparativo year-over-year limpio.

- **`compras_anio_anterior` calculado a nivel `(cliente_norm, empresa)`**: si una empresa tuvo una factura grande en 2025 y otra en 2026 al mismo cliente, ambas filas en la materialized view se sostienen. Pero si en 2025 compró a una empresa que en 2026 no compró, esa fila empresa-2025 NO existe en `active_pairs` (filtra desde 2025-05-01) y NO se cuenta en el denominador. Asimetría adicional.

## Próximos pasos sugeridos

NO implementar. Solo recomendar:

1. **Confirmar con Daniel la intención semántica de la columna**:
   - Opción A: "Compras YTD" 2026 vs "Compras same-period 2025" (4 meses vs 4 meses). Mejor para análisis de crecimiento del año fiscal en curso.
   - Opción B: "Compras últimos 12 meses (rolling)" vs "Compras 12 meses anteriores (rolling)" (12 vs 12). Coherente con el subtitle actual y con el filtro `active_pairs`. Mejor para tracking continuo sin sesgo de cierre de año.
   - Opción C: combinar ambas en columnas separadas — explícita.

2. **Si se elige Opción A** (preserva el header "Compras YTD"):
   - Agregar `AND f.mes <= (SELECT MAX(mes) FROM filtered WHERE anio = cy.y)` al CTE `prev_year` en una migration nueva.
   - Decidir si MAX(mes) es global (todos los clientes) o per-cliente (como tenía la versión original).
   - Cambiar el subtitle del header a algo como `"YTD 2026 vs mismo período 2025"` para alinear el copy.

3. **Si se elige Opción B**:
   - Reemplazar `WHERE f.anio = cy.y` por `WHERE f.fecha >= [today − 12 months]` y `WHERE f.fecha BETWEEN [today − 24 months] AND [today − 12 months]` para los 12 meses previos.
   - Renombrar columna a "Compras 12m" y delta a "Δ vs 12m anterior".
   - Mantener subtitle.

4. **Validar contra Supabase**: correr una sola query manual para verificar la magnitud del bug en City Mall Paso Canoa antes de definir alcance del fix:
   ```sql
   SELECT
     SUM(subtotal) FILTER (WHERE anio = 2026)              AS ytd_2026,
     SUM(subtotal) FILTER (WHERE anio = 2025 AND mes <= 4) AS same_period_2025,
     SUM(subtotal) FILTER (WHERE anio = 2025)              AS full_2025
   FROM ventas_raw
   WHERE empresa = 'vistana'
     AND UPPER(cliente) LIKE '%PASO CANOA%';
   ```

5. **Considerar el cron de refresh de la materialized view** (TODO ya anotado en la migration line 14): si se aplica un fix nuevo, hay que decidir cuándo refrescar para que el cambio sea visible. Cron diario sigue siendo follow-up pendiente.

6. **Auditoría adicional**: revisar si el módulo Resumen tiene el mismo patrón de bug. El KPI `Δ vs prev year` en Resumen usa `mesActual` para slice — está correcto (apples-to-apples). Pero vale verificar que la consistencia entre Resumen y Clientes no sorprenda a Daniel cuando aplique el fix.
