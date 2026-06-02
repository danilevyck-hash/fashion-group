# Extracción para Brand It — Módulo de Ventas (referencia desde fashiongr)

> Documento de **referencia read-only**. Generado leyendo el repo `fashiongr/cxc` sin modificar nada.
> Objetivo: usar el módulo de Ventas (vista de una sola empresa, "Multifashion") como molde
> para construir el módulo de Ventas en Brand It, y replicar el modelo de costo histórico
> filtrando solo **Confecciones Boston**.

**Stack que aplica:** Next.js 14 App Router · Supabase (Postgres) · RPCs SQL (`supabase.rpc(...)`) ·
componentes cliente con `fetch(..., { cache: "no-store" })`.

**Idea central de la arquitectura (importante para Brand It):**
- La **página es server component** y hace el primer fetch (Overview) en el servidor.
- Cada sub-tab pesado es **client component** que hace su propio `fetch` a un endpoint dedicado.
- **Toda la lógica de negocio vive en RPCs de Postgres** (funciones SQL). Los endpoints Next.js
  son cáscaras delgadas: validan rol + params y llaman `supabaseServer.rpc(...)`. Esto es lo que
  hace el módulo fácil de portar: el "cerebro" está en SQL, no en TypeScript.

---

## Índice

1. [Ventas Multifashion (vista de una empresa con 4 sub-tabs)](#1-ventas-multifashion)
2. [formatDelta (helper de formato de deltas)](#2-formatdelta)
3. [Costo histórico (modelo de datos + filtro Boston)](#3-costo-histórico)

---

# 1. Ventas Multifashion

Vista de **una sola empresa** (American Classic, llamada "Multifashion" en la UI) con 4 sub-tabs:
**Overview · Detalle mensual · Vendedoras · Clientes**.

> Nota de naming: la empresa se llama `american_classic` como `empresa_key` canónica, su id corto
> en el módulo Ventas es `multi`, y en la env de Switch su namespace es `MULTIFASHION`. En las
> queries SQL siempre se filtra por `empresa = 'american_classic'`.

## 1.1 Mapa de archivos

### Páginas / shell (server → client)

| Archivo | Tipo | Rol |
|---|---|---|
| `src/app/ventas/page.tsx` | Server component | Entry point. Hace fetch server-side de resumen/clientes/multifashion/años en paralelo y los pasa al shell. |
| `src/app/ventas/VentasShell.tsx` | Client component | Tabs de nivel 1 (Resumen · Clientes · **Multifashion**). Maneja el selector de año global y refetchea al cambiar año. |
| `src/components/ventas/MultifashionView.tsx` | Client component | Tabs de nivel 2 (los 4 sub-tabs). El sub-tab **Overview vive inline acá** (`OverviewSubtab`). |

### Componentes de cada sub-tab

| Sub-tab | Componente | Cómo trae data |
|---|---|---|
| **Overview** | `OverviewSubtab` (inline en `src/components/ventas/MultifashionView.tsx`) | Recibe `data` por prop (server-fetched en `page.tsx`). No hace fetch propio. |
| **Detalle mensual** | `src/components/ventas/DetalleMensualSubtab.tsx` | `fetch` client-side al cambiar el mes. |
| **Vendedoras** | `src/components/ventas/VendedorasSubtab.tsx` | `fetch` client-side al cambiar periodo/mes/trimestre. |
| **Clientes** | `src/components/ventas/ClientesMultifashionSubtab.tsx` | `fetch` client-side (2 endpoints en `Promise.all`) al cambiar el rango. |

### Rutas de API (cáscaras delgadas → RPC)

| Sub-tab | Ruta exacta | RPC Postgres que llama |
|---|---|---|
| Overview | `src/app/api/multifashion/overview/route.ts` | `multifashion_mensual_v3(p_year, p_mes)` (vía `fetchMultifashion`) |
| Detalle mensual | `src/app/api/multifashion/detalle-mensual/route.ts` | `multifashion_detalle_mensual_v1(p_year, p_mes)` |
| Vendedoras | `src/app/api/multifashion/vendedoras/route.ts` | `multifashion_vendedoras_v3(p_year, p_periodo, p_mes, p_trimestre)` |
| Clientes (wholesale) | `src/app/api/multifashion/clientes-wholesale/route.ts` | `multifashion_wholesale_clientes(p_fecha_inicio, p_fecha_fin)` |
| Clientes (retail recurrentes) | `src/app/api/multifashion/retail-recurrentes/route.ts` | `multifashion_retail_recurrentes(p_fecha_inicio, p_fecha_fin, p_limit)` |

Todas las rutas exigen rol con: `requireRole(req, ["admin", "director", "contabilidad"])`.

### Capa de queries server-side

`src/lib/ventas/queries.ts` — fetchers usados por el server component. El relevante para Multifashion:

```typescript
/**
 * Multifashion tab — single retail store snapshot.
 * Llama al RPC multifashion_mensual que retorna jsonb con todo el shape listo.
 */
export async function fetchMultifashion({
  year,
  mes,
}: {
  year: number;
  mes: number;
}): Promise<Multifashion> {
  const { data, error } = await supabaseServer.rpc("multifashion_mensual_v3", {
    p_year: year,
    p_mes: mes,
  });
  if (error) throw new Error(`multifashion_mensual_v3: ${error.message}`);

  // v3 devuelve el shape exacto Multifashion con bloques retail/wholesale/total.
  return data as Multifashion;
}
```

> ⚠️ Invariante documentada en `queries.ts` (relevante si Brand It mezcla fuentes): American Classic
> vive a propósito en DOS tablas (`switch_facturas` vía vista unificada, y `multifashion_tickets`
> legacy). **Nunca sumar ambas fuentes** o hay doble conteo. El tab Multifashion usa su propia
> RPC (`multifashion_mensual_v3`) que lee de `ventas_raw`, separada del Resumen del grupo.

---

## 1.2 Estructura de los tabs (page → shell → view)

### `src/app/ventas/page.tsx` (server component)

```typescript
import { fetchVentasResumen, fetchClientes, fetchMultifashion, fetchAvailableYears } from "@/lib/ventas/queries";
import { VentasShell } from "./VentasShell";

export const dynamic = "force-dynamic";

export default async function VentasPage() {
  const now = new Date();
  const year = now.getFullYear();
  const mes = now.getMonth() + 1;

  const [resumen, clientes, multi, availableYears] = await Promise.all([
    fetchVentasResumen({ year }).catch(err => { console.error("[ventas] resumen error", err); return null; }),
    fetchClientes({ year }).catch(err => { console.error("[ventas] clientes error", err); return null; }),
    fetchMultifashion({ year, mes }).catch(err => { console.error("[ventas] multifashion error", err); return null; }),
    fetchAvailableYears().catch(err => { console.error("[ventas] años error", err); return [year]; }),
  ]);

  return (
    <VentasShell year={year} availableYears={availableYears}
      resumen={resumen} clientes={clientes} multi={multi} />
  );
}
```

### `src/components/ventas/MultifashionView.tsx` — los 4 sub-tabs

```tsx
export function MultifashionView({ data, selectedYear, isClosedYear }: MultifashionViewProps) {
  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList /* … */>
        <TabsTrigger value="overview"    /* … */><TrendingUp /> Overview</TabsTrigger>
        <TabsTrigger value="mes"         /* … */><CalendarRange /> Detalle mensual</TabsTrigger>
        <TabsTrigger value="vendedoras"  /* … */><Users /> Vendedoras</TabsTrigger>
        <TabsTrigger value="clientes"    /* … */><UserCircle /> Clientes</TabsTrigger>
      </TabsList>

      <TabsContent value="overview"><OverviewSubtab data={data} selectedYear={selectedYear} isClosedYear={isClosedYear} /></TabsContent>
      <TabsContent value="mes"><DetalleMensualSubtab year={selectedYear} /></TabsContent>
      <TabsContent value="vendedoras"><VendedorasSubtab data={data} selectedYear={selectedYear} isClosedYear={isClosedYear} /></TabsContent>
      <TabsContent value="clientes"><ClientesMultifashionSubtab selectedYear={selectedYear} /></TabsContent>
    </Tabs>
  );
}
```

### Fetches client-side de cada sub-tab (las URLs exactas que pega cada uno)

**Detalle mensual** (`DetalleMensualSubtab.tsx`):
```typescript
fetch(`/api/multifashion/detalle-mensual?year=${year}&mes=${selectedMes}`, { cache: "no-store", signal: ctrl.signal })
```

**Vendedoras** (`VendedorasSubtab.tsx`):
```typescript
const params = new URLSearchParams({ year: String(year), periodo });
if (periodo === "mes") params.set("mes", String(mes));
if (periodo === "trimestre") params.set("trimestre", String(trimestre));
fetch(`/api/multifashion/vendedoras?${params.toString()}`, { cache: "no-store", signal: ctrl.signal })
```

**Clientes** (`ClientesMultifashionSubtab.tsx`) — dos endpoints en paralelo:
```typescript
Promise.all([
  fetch(`/api/multifashion/clientes-wholesale?${qs}`,  { cache: "no-store", signal: ctrl.signal }),
  fetch(`/api/multifashion/retail-recurrentes?${qs}`, { cache: "no-store", signal: ctrl.signal }),
])
// qs = fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD (resuelto desde los pills de periodo)
```

---

## 1.3 Endpoints (cáscaras) — código exacto

Patrón común: `requireRole` → parsear/validar params → `supabaseServer.rpc(...)` → `NextResponse.json`.

### Overview — `src/app/api/multifashion/overview/route.ts`
```typescript
export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "director", "contabilidad"]);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const yearParam = sp.get("year");
  const mesParam = sp.get("mes");
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
  const now = new Date();
  const isCurrent = year === now.getFullYear();
  const mesFallback = isCurrent ? now.getMonth() + 1 : 12;
  const mes = mesParam ? parseInt(mesParam, 10) : mesFallback;

  try {
    const multi = await fetchMultifashion({ year, mes });
    return NextResponse.json(multi);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error inesperado";
    console.error("[multifashion/overview] fetch failed", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

### Detalle mensual — `src/app/api/multifashion/detalle-mensual/route.ts`
```typescript
export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "director", "contabilidad"]);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const yearParam = sp.get("year");
  const mesParam = sp.get("mes");
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
  const now = new Date();
  const isCurrent = year === now.getFullYear();
  const mesFallback = isCurrent ? now.getMonth() + 1 : 12;
  const mes = mesParam ? parseInt(mesParam, 10) : mesFallback;

  const { data, error } = await supabaseServer.rpc("multifashion_detalle_mensual_v1", {
    p_year: year,
    p_mes: mes,
  });
  if (error) {
    console.error("[multifashion/detalle-mensual] rpc error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
```

### Vendedoras — `src/app/api/multifashion/vendedoras/route.ts`
```typescript
export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "director", "contabilidad"]);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const year = parseIntParam(sp.get("year")) ?? new Date().getFullYear();
  const periodoRaw = (sp.get("periodo") ?? "mes") as Periodo;
  if (periodoRaw !== "mes" && periodoRaw !== "trimestre" && periodoRaw !== "ytd") {
    return NextResponse.json({ error: "periodo inválido (mes|trimestre|ytd)" }, { status: 400 });
  }

  const mes = parseIntParam(sp.get("mes"));
  const trimestre = parseIntParam(sp.get("trimestre"));

  if (periodoRaw === "mes" && (mes == null || mes < 1 || mes > 12)) {
    return NextResponse.json({ error: "mes requerido (1..12) cuando periodo=mes" }, { status: 400 });
  }
  if (periodoRaw === "trimestre" && (trimestre == null || trimestre < 1 || trimestre > 4)) {
    return NextResponse.json({ error: "trimestre requerido (1..4) cuando periodo=trimestre" }, { status: 400 });
  }

  const { data, error } = await supabaseServer.rpc("multifashion_vendedoras_v3", {
    p_year: year,
    p_periodo: periodoRaw,
    p_mes: periodoRaw === "mes" ? mes : null,
    p_trimestre: periodoRaw === "trimestre" ? trimestre : null,
  });
  if (error) {
    console.error("[multifashion/vendedoras] rpc error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data as VendedorasPeriodo);
}
```

### Clientes wholesale — `src/app/api/multifashion/clientes-wholesale/route.ts`
```typescript
export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "director", "contabilidad"]);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const ene1 = `${new Date().getFullYear()}-01-01`;
  const fecha_inicio = sp.get("fecha_inicio") ?? ene1;
  const fecha_fin = sp.get("fecha_fin") ?? today;

  if (!ISO_DATE.test(fecha_inicio) || !ISO_DATE.test(fecha_fin)) {
    return NextResponse.json({ error: "fecha_inicio / fecha_fin deben ser YYYY-MM-DD" }, { status: 400 });
  }
  if (fecha_inicio > fecha_fin) {
    return NextResponse.json({ error: "fecha_inicio > fecha_fin" }, { status: 400 });
  }

  const { data, error } = await supabaseServer.rpc("multifashion_wholesale_clientes", {
    p_fecha_inicio: fecha_inicio,
    p_fecha_fin: fecha_fin,
  });
  if (error) {
    console.error("[multifashion/clientes-wholesale] rpc error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
```

### Retail recurrentes — `src/app/api/multifashion/retail-recurrentes/route.ts`
```typescript
export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "director", "contabilidad"]);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const ene1 = `${new Date().getFullYear()}-01-01`;
  const fecha_inicio = sp.get("fecha_inicio") ?? ene1;
  const fecha_fin = sp.get("fecha_fin") ?? today;
  const limitParam = sp.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : 50;

  if (!ISO_DATE.test(fecha_inicio) || !ISO_DATE.test(fecha_fin)) {
    return NextResponse.json({ error: "fecha_inicio / fecha_fin deben ser YYYY-MM-DD" }, { status: 400 });
  }
  if (fecha_inicio > fecha_fin) {
    return NextResponse.json({ error: "fecha_inicio > fecha_fin" }, { status: 400 });
  }
  if (!Number.isFinite(limit) || limit < 1 || limit > 500) {
    return NextResponse.json({ error: "limit inválido (1..500)" }, { status: 400 });
  }

  const { data, error } = await supabaseServer.rpc("multifashion_retail_recurrentes", {
    p_fecha_inicio: fecha_inicio,
    p_fecha_fin: fecha_fin,
    p_limit: limit,
  });
  if (error) {
    console.error("[multifashion/retail-recurrentes] rpc error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
```

---

## 1.4 RPCs SQL de Supabase (el "cerebro" — esto es lo más valioso de portar)

Todas leen de la tabla `ventas_raw` filtrando `empresa = 'american_classic'`. Devuelven `jsonb`
con el shape listo para la UI. Migración manual (Supabase Dashboard → SQL Editor).

> Para Brand It: cambiar `'american_classic'` por la empresa de Brand It (o parametrizarla con un
> arg `p_empresa text`), y cambiar `ventas_raw` por la tabla equivalente. El resto de la lógica
> (same-period day-by-day, YoY/MoM, márgenes, recurrencia) es reusable tal cual.

> El sufijo `_v2/_v3` es un "escape hatch" deliberado: cuando PostgREST/Vercel servían una versión
> stale de la función, renombraban a `_vN+1`. No es versionado semántico; es para forzar reload.

### Overview → `multifashion_mensual_v3(p_year int, p_mes int) RETURNS jsonb`
Archivo: `supabase/migrations/20260512100100_multifashion_mensual_v3_retail_wholesale.sql`

Lógica: separa **retail** (`is_wholesale = false`) de **wholesale** (`is_wholesale = true`).
- Retail YTD: `SUM(subtotal)`, tickets = `COUNT(DISTINCT n_sistema)`, costo, utilidad, ticket promedio, margen.
- Retail prev YTD (same-period) para `margenPrev`.
- Wholesale YTD + top cliente + total clientes.
- `total` = retail + wholesale.
- `expectedTodayPct` = proyección vs meta anual (calendario, sobre TOTAL).
- `retail.meses[12]`: detalle mensual con **same-period day-by-day** (el mes en curso se recorta al
  mismo offset de días en el año anterior para comparar manzanas con manzanas).

```sql
DROP FUNCTION IF EXISTS multifashion_mensual_v2(int, int);

CREATE OR REPLACE FUNCTION multifashion_mensual_v3(p_year int, p_mes int)
RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  -- Header (app_settings)
  v_meta_anual numeric;
  v_growth_pct numeric;
  v_tienda     text;
  v_ubicacion  text;
  v_manager    text;
  -- Retail YTD
  v_retail_ventas        numeric;
  v_retail_tickets       bigint;
  v_retail_costo         numeric;
  v_retail_utilidad      numeric;
  v_retail_ticket_prom   numeric;
  v_retail_margen        numeric;
  v_retail_ventas_prev   numeric;
  v_retail_utilidad_prev numeric;
  v_retail_margen_prev   numeric;
  -- Wholesale YTD
  v_wholesale_ventas        numeric;
  v_wholesale_tickets       bigint;
  v_wholesale_top_cliente   text;
  v_wholesale_total_clientes int;
  -- Total YTD
  v_total_ventas  numeric;
  v_total_tickets bigint;
  -- expectedTodayPct
  v_ventas_2025_ytd    numeric;
  v_expected_today_pct numeric;
  -- Series mensuales
  v_retail_meses    jsonb;
  v_wholesale_meses jsonb;
BEGIN
  v_meta_anual := COALESCE((get_app_setting('multifashion_meta_anual_2026'))::numeric, 800000);
  v_growth_pct := COALESCE((get_app_setting('multifashion_growth_target_pct'))::numeric, 5);
  v_tienda     := COALESCE(get_app_setting('multifashion_tienda')    #>> '{}', 'American Classics');
  v_ubicacion  := COALESCE(get_app_setting('multifashion_ubicacion') #>> '{}', 'Chiriquí');
  v_manager    := COALESCE(get_app_setting('multifashion_manager')   #>> '{}', '');

  -- ── Retail YTD (is_wholesale = false) ────────────────────────────────────
  SELECT
    COALESCE(SUM(subtotal), 0),
    COUNT(DISTINCT n_sistema),
    COALESCE(SUM(costo), 0),
    COALESCE(SUM(utilidad), 0)
  INTO v_retail_ventas, v_retail_tickets, v_retail_costo, v_retail_utilidad
  FROM ventas_raw
  WHERE empresa = 'american_classic'
    AND is_wholesale = false
    AND anio = p_year
    AND mes <= p_mes;
  v_retail_ticket_prom := CASE WHEN v_retail_tickets > 0 THEN v_retail_ventas / v_retail_tickets ELSE 0 END;
  v_retail_margen      := CASE WHEN v_retail_ventas  > 0 THEN v_retail_utilidad / v_retail_ventas ELSE 0 END;

  -- ── Retail prev YTD (same period, month-level) para margenPrev ───────────
  SELECT
    COALESCE(SUM(subtotal), 0),
    COALESCE(SUM(utilidad), 0)
  INTO v_retail_ventas_prev, v_retail_utilidad_prev
  FROM ventas_raw
  WHERE empresa = 'american_classic'
    AND is_wholesale = false
    AND anio = p_year - 1
    AND mes <= p_mes;
  v_retail_margen_prev := CASE WHEN v_retail_ventas_prev > 0 THEN v_retail_utilidad_prev / v_retail_ventas_prev ELSE 0 END;

  -- ── Wholesale YTD (is_wholesale = true) ──────────────────────────────────
  SELECT
    COALESCE(SUM(subtotal), 0),
    COUNT(DISTINCT n_sistema)
  INTO v_wholesale_ventas, v_wholesale_tickets
  FROM ventas_raw
  WHERE empresa = 'american_classic'
    AND is_wholesale = true
    AND anio = p_year
    AND mes <= p_mes;

  -- Top cliente wholesale del año + distinct clientes count
  WITH cli AS (
    SELECT cliente, SUM(subtotal) AS s
    FROM ventas_raw
    WHERE empresa = 'american_classic'
      AND is_wholesale = true
      AND anio = p_year
      AND mes <= p_mes
      AND cliente IS NOT NULL
      AND TRIM(cliente) <> ''
    GROUP BY cliente
  )
  SELECT cliente, (SELECT COUNT(*) FROM cli)
  INTO v_wholesale_top_cliente, v_wholesale_total_clientes
  FROM cli
  ORDER BY s DESC
  LIMIT 1;

  -- ── Total YTD (retail + wholesale) ───────────────────────────────────────
  v_total_ventas  := v_retail_ventas  + v_wholesale_ventas;
  v_total_tickets := v_retail_tickets + v_wholesale_tickets;

  -- ── expectedTodayPct (contra TOTAL, calendario — meta histórica incluye todo) ─
  SELECT COALESCE(SUM(subtotal), 0) INTO v_ventas_2025_ytd
  FROM ventas_raw
  WHERE empresa = 'american_classic' AND anio = p_year - 1 AND mes <= p_mes;
  v_expected_today_pct := CASE
    WHEN v_meta_anual > 0
      THEN LEAST(1, (v_ventas_2025_ytd * (1 + v_growth_pct / 100.0)) / v_meta_anual)
    ELSE 0
  END;

  -- ── Retail meses[12] con same-period day-by-day (igual que v2 + is_wholesale=false) ─
  WITH mes_meta AS (
    SELECT
      m.mes,
      make_date(p_year, m.mes, 1) AS inicio,
      (make_date(p_year, m.mes, 1) + INTERVAL '1 month' - INTERVAL '1 day')::date AS fin_full,
      make_date(p_year - 1, m.mes, 1) AS prev_inicio,
      (make_date(p_year - 1, m.mes, 1) + INTERVAL '1 month' - INTERVAL '1 day')::date AS prev_fin_full
    FROM generate_series(1, 12) AS m(mes)
  ),
  mes_corte AS (
    SELECT
      mm.*,
      (CURRENT_DATE BETWEEN mm.inicio AND mm.fin_full) AS es_parcial,
      CASE
        WHEN (CURRENT_DATE BETWEEN mm.inicio AND mm.fin_full)
          THEN (SELECT MAX(fecha) FROM ventas_raw
                WHERE empresa = 'american_classic'
                  AND is_wholesale = false
                  AND fecha BETWEEN mm.inicio AND mm.fin_full)
        ELSE mm.fin_full
      END AS fecha_corte
    FROM mes_meta mm
  ),
  mes_resuelto AS (
    SELECT
      mc.*,
      CASE
        WHEN mc.es_parcial AND mc.fecha_corte IS NOT NULL
          THEN LEAST(mc.prev_inicio + (mc.fecha_corte - mc.inicio), mc.prev_fin_full)
        WHEN NOT mc.es_parcial
          THEN mc.prev_fin_full
        ELSE NULL
      END AS dia_corte_anio_anterior
    FROM mes_corte mc
  ),
  mes_agg AS (
    SELECT
      mr.mes,
      mr.es_parcial,
      mr.fecha_corte,
      mr.dia_corte_anio_anterior,
      COALESCE((
        SELECT SUM(subtotal) FROM ventas_raw
        WHERE empresa = 'american_classic'
          AND is_wholesale = false
          AND mr.fecha_corte IS NOT NULL
          AND fecha BETWEEN mr.inicio AND mr.fecha_corte
      ), 0)::numeric AS ventas,
      COALESCE((
        SELECT COUNT(DISTINCT n_sistema) FROM ventas_raw
        WHERE empresa = 'american_classic'
          AND is_wholesale = false
          AND mr.fecha_corte IS NOT NULL
          AND fecha BETWEEN mr.inicio AND mr.fecha_corte
      ), 0)::int AS tickets,
      COALESCE((
        SELECT SUM(subtotal) FROM ventas_raw
        WHERE empresa = 'american_classic'
          AND is_wholesale = false
          AND mr.dia_corte_anio_anterior IS NOT NULL
          AND fecha BETWEEN mr.prev_inicio AND mr.dia_corte_anio_anterior
      ), 0)::numeric AS ventas_prev
    FROM mes_resuelto mr
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'mes',        CASE a.mes WHEN 1 THEN 'Ene' WHEN 2 THEN 'Feb' WHEN 3 THEN 'Mar'
                                WHEN 4 THEN 'Abr' WHEN 5 THEN 'May' WHEN 6 THEN 'Jun'
                                WHEN 7 THEN 'Jul' WHEN 8 THEN 'Ago' WHEN 9 THEN 'Sep'
                                WHEN 10 THEN 'Oct' WHEN 11 THEN 'Nov' ELSE 'Dic' END,
      'ventas',     a.ventas,
      'tickets',    a.tickets,
      'ticketProm', CASE WHEN a.tickets > 0 THEN a.ventas / a.tickets ELSE 0 END,
      'vs2025',     CASE
                      WHEN a.tickets = 0 AND a.ventas = 0 THEN NULL
                      WHEN a.ventas_prev > 0 THEN (a.ventas - a.ventas_prev) / a.ventas_prev
                      ELSE NULL
                    END,
      'es_periodo_parcial',      a.es_parcial,
      'fecha_corte',             CASE WHEN a.es_parcial AND a.fecha_corte IS NOT NULL
                                      THEN to_char(a.fecha_corte, 'YYYY-MM-DD')
                                      ELSE NULL END,
      'dia_corte_anio_anterior', CASE WHEN a.es_parcial AND a.dia_corte_anio_anterior IS NOT NULL
                                      THEN to_char(a.dia_corte_anio_anterior, 'YYYY-MM-DD')
                                      ELSE NULL END
    )
    ORDER BY a.mes
  )
  INTO v_retail_meses
  FROM mes_agg a;

  -- ── Wholesale meses[12] (simple sum + count, sin vs2025) ─────────────────
  WITH ws AS (
    SELECT mes,
      SUM(subtotal)::numeric AS ventas,
      COUNT(DISTINCT n_sistema)::int AS tickets
    FROM ventas_raw
    WHERE empresa = 'american_classic'
      AND is_wholesale = true
      AND anio = p_year
    GROUP BY mes
  ),
  m AS (SELECT generate_series(1, 12) AS mes)
  SELECT jsonb_agg(
    jsonb_build_object(
      'mes', CASE m.mes WHEN 1 THEN 'Ene' WHEN 2 THEN 'Feb' WHEN 3 THEN 'Mar'
              WHEN 4 THEN 'Abr' WHEN 5 THEN 'May' WHEN 6 THEN 'Jun'
              WHEN 7 THEN 'Jul' WHEN 8 THEN 'Ago' WHEN 9 THEN 'Sep'
              WHEN 10 THEN 'Oct' WHEN 11 THEN 'Nov' ELSE 'Dic' END,
      'ventas',  COALESCE(ws.ventas, 0),
      'tickets', COALESCE(ws.tickets, 0)
    ) ORDER BY m.mes
  )
  INTO v_wholesale_meses
  FROM m LEFT JOIN ws ON ws.mes = m.mes;

  RETURN jsonb_build_object(
    'tienda',            v_tienda,
    'ubicacion',         v_ubicacion,
    'manager',           v_manager,
    'metaAnual',         v_meta_anual,
    'expectedTodayPct',  v_expected_today_pct,
    'retail', jsonb_build_object(
      'ytdVentas',  v_retail_ventas,
      'ytdTickets', v_retail_tickets,
      'ticketProm', v_retail_ticket_prom,
      'margen',     v_retail_margen,
      'margenPrev', v_retail_margen_prev,
      'meses',      COALESCE(v_retail_meses, '[]'::jsonb)
    ),
    'wholesale', jsonb_build_object(
      'ytdVentas',      v_wholesale_ventas,
      'ytdTickets',     v_wholesale_tickets,
      'topClienteName', v_wholesale_top_cliente,
      'totalClientes',  COALESCE(v_wholesale_total_clientes, 0),
      'meses',          COALESCE(v_wholesale_meses, '[]'::jsonb)
    ),
    'total', jsonb_build_object(
      'ytdVentas',  v_total_ventas,
      'ytdTickets', v_total_tickets
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION multifashion_mensual_v3(int, int) TO service_role;
NOTIFY pgrst, 'reload schema';
```

### Detalle mensual → `multifashion_detalle_mensual_v1(p_year int, p_mes int) RETURNS jsonb`
Archivo: `supabase/migrations/20260518000000_multifashion_detalle_mensual_v1.sql`

Lógica: detalle de cualquier mes (histórico o en curso). `dia_actual = MAX(día con SUM(subtotal) > 0)`.
Calcula totales del mes, comparativos **MoM** (mes anterior same-period) y **YoY** (mismo mes año
anterior, cap al mismo día de corte), array día-por-día con overlay del mes anterior, mejor/peor día,
y heatmap por día de semana. `proyeccion_cierre` solo si es el mes en curso.

```sql
DROP FUNCTION IF EXISTS multifashion_detalle_mensual_v1(int, int);

CREATE OR REPLACE FUNCTION multifashion_detalle_mensual_v1(p_year int, p_mes int)
RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_mes_inicio       date;
  v_mes_fin_full     date;
  v_mes_fin_real     date;
  v_dias_en_mes      int;
  v_dia_actual       int;
  v_is_mes_actual    boolean;
  v_prev_mes_inicio  date;
  v_prev_mes_fin     date;
  v_yoy_mes_inicio   date;
  v_yoy_mes_fin      date;
  v_ventas_cur       numeric;
  v_utilidad_cur     numeric;
  v_tickets_cur      bigint;
  v_ticket_prom      numeric;
  v_margen           numeric;
  v_proyeccion       numeric;
  v_mom_ventas       numeric;
  v_mom_utilidad     numeric;
  v_mom_tickets      bigint;
  v_mom_tiene_data   boolean;
  v_yoy_ventas       numeric;
  v_yoy_utilidad     numeric;
  v_yoy_tickets      bigint;
  v_yoy_tiene_data   boolean;
  v_dias    jsonb;
  v_mejor   jsonb;
  v_peor    jsonb;
  v_heatmap jsonb;
  v_mes_labels CONSTANT text[] := ARRAY[
    'Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
  ];
  v_dow_labels CONSTANT text[] := ARRAY['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
BEGIN
  IF p_mes < 1 OR p_mes > 12 THEN
    RAISE EXCEPTION 'p_mes inválido: % (esperado 1..12)', p_mes;
  END IF;
  IF p_year < 2000 OR p_year > 2100 THEN
    RAISE EXCEPTION 'p_year inválido: %', p_year;
  END IF;

  v_mes_inicio    := make_date(p_year, p_mes, 1);
  v_mes_fin_full  := (v_mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;
  v_dias_en_mes   := EXTRACT(DAY FROM v_mes_fin_full)::int;
  v_is_mes_actual := (
    p_year = EXTRACT(YEAR FROM CURRENT_DATE)::int
    AND p_mes = EXTRACT(MONTH FROM CURRENT_DATE)::int
  );

  -- dia_actual = MAX(día con SUM(subtotal) > 0). Mes parcial → último día con
  -- ventas netas reales. Mes cerrado → 30/31. Mes futuro / sin data → 0.
  SELECT COALESCE(MAX(d), 0) INTO v_dia_actual
  FROM (
    SELECT EXTRACT(DAY FROM fecha)::int AS d
    FROM ventas_raw
    WHERE empresa = 'american_classic'
      AND is_wholesale = false
      AND fecha BETWEEN v_mes_inicio AND v_mes_fin_full
    GROUP BY EXTRACT(DAY FROM fecha)::int
    HAVING SUM(subtotal) > 0
  ) sub;

  IF v_dia_actual = 0 THEN
    v_mes_fin_real := v_mes_inicio;
  ELSE
    v_mes_fin_real := (v_mes_inicio + (v_dia_actual - 1) * INTERVAL '1 day')::date;
  END IF;

  v_prev_mes_inicio := (v_mes_inicio - INTERVAL '1 month')::date;
  v_yoy_mes_inicio  := (v_mes_inicio - INTERVAL '1 year')::date;
  IF v_dia_actual > 0 THEN
    v_prev_mes_fin := LEAST(
      (v_prev_mes_inicio + (v_dia_actual - 1) * INTERVAL '1 day')::date,
      (v_prev_mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date
    );
    v_yoy_mes_fin := LEAST(
      (v_yoy_mes_inicio + (v_dia_actual - 1) * INTERVAL '1 day')::date,
      (v_yoy_mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date
    );
  ELSE
    v_prev_mes_fin := (v_prev_mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;
    v_yoy_mes_fin  := (v_yoy_mes_inicio  + INTERVAL '1 month' - INTERVAL '1 day')::date;
  END IF;

  -- Totales mes corriente (retail)
  SELECT
    COALESCE(SUM(subtotal), 0),
    COALESCE(SUM(subtotal - COALESCE(costo, 0)), 0),
    COUNT(DISTINCT n_sistema)
  INTO v_ventas_cur, v_utilidad_cur, v_tickets_cur
  FROM ventas_raw
  WHERE empresa = 'american_classic'
    AND is_wholesale = false
    AND fecha BETWEEN v_mes_inicio AND v_mes_fin_real;

  v_ticket_prom := CASE WHEN v_tickets_cur > 0 THEN v_ventas_cur / v_tickets_cur ELSE 0 END;
  v_margen      := CASE WHEN v_ventas_cur > 0 THEN v_utilidad_cur / v_ventas_cur ELSE 0 END;
  v_proyeccion  := CASE WHEN v_is_mes_actual AND v_dia_actual > 0
                        THEN (v_ventas_cur / v_dia_actual) * v_dias_en_mes ELSE NULL END;

  -- Totales mes anterior (same-period)
  SELECT
    COALESCE(SUM(subtotal), 0),
    COALESCE(SUM(subtotal - COALESCE(costo, 0)), 0),
    COUNT(DISTINCT n_sistema)
  INTO v_mom_ventas, v_mom_utilidad, v_mom_tickets
  FROM ventas_raw
  WHERE empresa = 'american_classic'
    AND is_wholesale = false
    AND fecha BETWEEN v_prev_mes_inicio AND v_prev_mes_fin;
  v_mom_tiene_data := (v_mom_tickets > 0);

  -- Totales YoY (mismo mes año anterior, mismo día de corte)
  SELECT
    COALESCE(SUM(subtotal), 0),
    COALESCE(SUM(subtotal - COALESCE(costo, 0)), 0),
    COUNT(DISTINCT n_sistema)
  INTO v_yoy_ventas, v_yoy_utilidad, v_yoy_tickets
  FROM ventas_raw
  WHERE empresa = 'american_classic'
    AND is_wholesale = false
    AND fecha BETWEEN v_yoy_mes_inicio AND v_yoy_mes_fin;
  v_yoy_tiene_data := (v_yoy_tickets > 0);

  -- Array día por día (1..dias_en_mes) con overlay del mes anterior
  WITH dias AS (SELECT generate_series(1, v_dias_en_mes) AS d),
  cur AS (
    SELECT
      EXTRACT(DAY FROM fecha)::int AS d,
      SUM(subtotal)::numeric                      AS ventas,
      SUM(subtotal - COALESCE(costo, 0))::numeric AS utilidad,
      COUNT(DISTINCT n_sistema)::int              AS tickets
    FROM ventas_raw
    WHERE empresa = 'american_classic' AND is_wholesale = false
      AND fecha BETWEEN v_mes_inicio AND v_mes_fin_full
    GROUP BY EXTRACT(DAY FROM fecha)::int
  ),
  prev AS (
    SELECT EXTRACT(DAY FROM fecha)::int AS d, SUM(subtotal)::numeric AS ventas_prev
    FROM ventas_raw
    WHERE empresa = 'american_classic' AND is_wholesale = false
      AND fecha BETWEEN v_prev_mes_inicio
                    AND (v_prev_mes_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date
    GROUP BY EXTRACT(DAY FROM fecha)::int
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'dia', d.d,
      'ventas', COALESCE(cur.ventas, 0),
      'utilidad', COALESCE(cur.utilidad, 0),
      'n_tickets', COALESCE(cur.tickets, 0),
      'ventas_mes_anterior', COALESCE(prev.ventas_prev, 0)
    ) ORDER BY d.d
  )
  INTO v_dias
  FROM dias d LEFT JOIN cur ON cur.d = d.d LEFT JOIN prev ON prev.d = d.d;

  -- Mejor / peor día (entre días con ventas netas > 0)
  WITH d AS (
    SELECT fecha, SUM(subtotal) AS ventas
    FROM ventas_raw
    WHERE empresa = 'american_classic' AND is_wholesale = false
      AND fecha BETWEEN v_mes_inicio AND v_mes_fin_real
    GROUP BY fecha HAVING SUM(subtotal) > 0
  )
  SELECT
    (SELECT jsonb_build_object('fecha', to_char(fecha, 'YYYY-MM-DD'), 'ventas', ventas)
       FROM d ORDER BY ventas DESC LIMIT 1),
    (SELECT jsonb_build_object('fecha', to_char(fecha, 'YYYY-MM-DD'), 'ventas', ventas)
       FROM d ORDER BY ventas ASC  LIMIT 1)
  INTO v_mejor, v_peor;

  -- Heatmap día de semana (0=Dom..6=Sáb), promedio sobre días con SUM > 0
  WITH dows AS (
    SELECT EXTRACT(DOW FROM fecha)::int AS dow, SUM(subtotal) AS ventas
    FROM ventas_raw
    WHERE empresa = 'american_classic' AND is_wholesale = false
      AND fecha BETWEEN v_mes_inicio AND v_mes_fin_real
    GROUP BY fecha, EXTRACT(DOW FROM fecha)::int HAVING SUM(subtotal) > 0
  ),
  agg AS (SELECT dow, AVG(ventas)::numeric AS ventas_promedio, COUNT(*)::int AS count_dias FROM dows GROUP BY dow),
  all_dows AS (SELECT generate_series(0, 6) AS dow)
  SELECT jsonb_agg(
    jsonb_build_object(
      'dow', ad.dow,
      'dow_label', v_dow_labels[ad.dow + 1],
      'ventas_promedio', COALESCE(agg.ventas_promedio, 0),
      'count_dias', COALESCE(agg.count_dias, 0)
    ) ORDER BY ad.dow
  )
  INTO v_heatmap
  FROM all_dows ad LEFT JOIN agg ON agg.dow = ad.dow;

  RETURN jsonb_build_object(
    'year', p_year, 'mes', p_mes, 'mes_label', v_mes_labels[p_mes],
    'is_mes_actual', v_is_mes_actual, 'dia_actual', v_dia_actual, 'dias_en_mes', v_dias_en_mes,
    'dias', COALESCE(v_dias, '[]'::jsonb),
    'totales', jsonb_build_object(
      'ventas', v_ventas_cur, 'utilidad', v_utilidad_cur, 'n_tickets', v_tickets_cur,
      'ticket_promedio', v_ticket_prom, 'margen', v_margen, 'proyeccion_cierre', v_proyeccion
    ),
    'mes_anterior', jsonb_build_object('ventas', v_mom_ventas, 'utilidad', v_mom_utilidad, 'n_tickets', v_mom_tickets, 'tiene_data', v_mom_tiene_data),
    'yoy', jsonb_build_object('ventas', v_yoy_ventas, 'utilidad', v_yoy_utilidad, 'n_tickets', v_yoy_tickets, 'tiene_data', v_yoy_tiene_data),
    'mejor_dia', v_mejor, 'peor_dia', v_peor,
    'heatmap_dia_semana', COALESCE(v_heatmap, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION multifashion_detalle_mensual_v1(int, int) TO service_role;
NOTIFY pgrst, 'reload schema';
```

### Vendedoras → `multifashion_vendedoras_v3(p_year int, p_periodo text, p_mes int, p_trimestre int) RETURNS jsonb`
Archivo: `supabase/migrations/20260511170000_multifashion_vendedoras_v3.sql`

Lógica: ranking de vendedoras por `mes | trimestre | ytd`. Compara contra período inmediatamente
anterior (MoM/QoQ; para YTD contra año anterior). Normaliza el nombre del vendedor con regex,
excluye `'DEFAULT'`. Comisión = `ventas * 0.005`. Same-period day-by-day cuando el período está
parcialmente en curso.

```sql
DROP FUNCTION IF EXISTS multifashion_vendedoras_v2(int, text, int, int);

CREATE OR REPLACE FUNCTION multifashion_vendedoras_v3(
  p_year      int,
  p_periodo   text,
  p_mes       int DEFAULT NULL,
  p_trimestre int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_managers       jsonb;
  v_actual_inicio   date;
  v_actual_fin_full date;
  v_prev_inicio     date;
  v_prev_fin_full   date;
  v_actual_fin      date;
  v_prev_fin        date;
  v_dia_offset      int;
  v_es_parcial      boolean;
  v_top_vendedor    text;
  v_vendedoras      jsonb;
  v_ventas_total       numeric;
  v_tickets_total      bigint;
  v_ventas_total_prev  numeric;
  v_tickets_total_prev bigint;
  v_prev_year   int;
  v_prev_month  int;
  v_prev_trim   int;
BEGIN
  v_managers := COALESCE(get_app_setting('multifashion_managers'), '[]'::jsonb);

  -- Resolver rango calendario actual + período inmediatamente anterior
  IF p_periodo = 'mes' THEN
    IF p_mes IS NULL OR p_mes < 1 OR p_mes > 12 THEN
      RAISE EXCEPTION 'p_mes requerido (1..12) cuando periodo=mes';
    END IF;
    v_actual_inicio   := make_date(p_year, p_mes, 1);
    v_actual_fin_full := (v_actual_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;
    IF p_mes > 1 THEN v_prev_year := p_year; v_prev_month := p_mes - 1;
    ELSE v_prev_year := p_year - 1; v_prev_month := 12; END IF;
    v_prev_inicio   := make_date(v_prev_year, v_prev_month, 1);
    v_prev_fin_full := (v_prev_inicio + INTERVAL '1 month' - INTERVAL '1 day')::date;
  ELSIF p_periodo = 'trimestre' THEN
    IF p_trimestre IS NULL OR p_trimestre < 1 OR p_trimestre > 4 THEN
      RAISE EXCEPTION 'p_trimestre requerido (1..4) cuando periodo=trimestre';
    END IF;
    v_actual_inicio   := make_date(p_year, (p_trimestre - 1) * 3 + 1, 1);
    v_actual_fin_full := (v_actual_inicio + INTERVAL '3 months' - INTERVAL '1 day')::date;
    IF p_trimestre > 1 THEN v_prev_year := p_year; v_prev_trim := p_trimestre - 1;
    ELSE v_prev_year := p_year - 1; v_prev_trim := 4; END IF;
    v_prev_inicio   := make_date(v_prev_year, (v_prev_trim - 1) * 3 + 1, 1);
    v_prev_fin_full := (v_prev_inicio + INTERVAL '3 months' - INTERVAL '1 day')::date;
  ELSIF p_periodo = 'ytd' THEN
    v_actual_inicio   := make_date(p_year,     1, 1);
    v_actual_fin_full := make_date(p_year,     12, 31);
    v_prev_inicio     := make_date(p_year - 1, 1, 1);
    v_prev_fin_full   := make_date(p_year - 1, 12, 31);
  ELSE
    RAISE EXCEPTION 'p_periodo inválido: % (esperado mes|trimestre|ytd)', p_periodo;
  END IF;

  -- fecha_corte
  SELECT MAX(fecha) INTO v_actual_fin
  FROM ventas_raw
  WHERE empresa = 'american_classic' AND fecha BETWEEN v_actual_inicio AND v_actual_fin_full;

  v_es_parcial := (CURRENT_DATE BETWEEN v_actual_inicio AND v_actual_fin_full);

  IF v_actual_fin IS NULL THEN
    RETURN jsonb_build_object(
      'vendedoras', '[]'::jsonb, 'total_vendedoras_periodo', 0,
      'ventas_total', 0, 'tickets_total', 0, 'ventas_total_prev', 0, 'tickets_total_prev', 0,
      'fecha_corte', NULL, 'es_periodo_parcial', v_es_parcial,
      'dia_corte_periodo_anterior', NULL, 'dia_corte_anio_anterior', NULL
    );
  END IF;

  IF v_es_parcial THEN
    v_dia_offset := v_actual_fin - v_actual_inicio;
    v_prev_fin   := LEAST(v_prev_inicio + v_dia_offset, v_prev_fin_full);
  ELSE
    v_actual_fin := v_actual_fin_full;
    v_prev_fin   := v_prev_fin_full;
  END IF;

  -- TOP vendedor
  SELECT REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g') INTO v_top_vendedor
  FROM ventas_raw
  WHERE empresa = 'american_classic'
    AND fecha BETWEEN v_actual_inicio AND v_actual_fin
    AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
  GROUP BY REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g')
  ORDER BY SUM(subtotal) DESC LIMIT 1;

  -- Ranking + delta MoM/QoQ/YoY-YTD
  WITH actual AS (
    SELECT REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g') AS vendedor,
      SUM(subtotal) AS ventas, COUNT(DISTINCT n_sistema) AS tickets
    FROM ventas_raw
    WHERE empresa = 'american_classic'
      AND fecha BETWEEN v_actual_inicio AND v_actual_fin
      AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
    GROUP BY REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g')
  ),
  prev AS (
    SELECT REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g') AS vendedor,
      SUM(subtotal) AS ventas, COUNT(DISTINCT n_sistema) AS tickets
    FROM ventas_raw
    WHERE empresa = 'american_classic'
      AND fecha BETWEEN v_prev_inicio AND v_prev_fin
      AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT'
    GROUP BY REGEXP_REPLACE(TRIM(vendedor), '\s+', ' ', 'g')
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'nombre', a.vendedor, 'tickets', a.tickets, 'ventas', a.ventas,
      'ticket_promedio', CASE WHEN a.tickets > 0 THEN a.ventas / a.tickets ELSE 0 END,
      'comision', a.ventas * 0.005,
      'manager', v_managers ? a.vendedor,
      'top', (a.vendedor = v_top_vendedor),
      'delta_ventas_pct',  CASE WHEN COALESCE(p.ventas, 0) > 0 THEN (a.ventas - p.ventas) / p.ventas ELSE NULL END,
      'delta_tickets_pct', CASE WHEN COALESCE(p.tickets, 0) > 0 THEN (a.tickets - p.tickets)::numeric / p.tickets ELSE NULL END
    )
    ORDER BY a.ventas DESC
  )
  INTO v_vendedoras
  FROM actual a LEFT JOIN prev p ON p.vendedor = a.vendedor;

  -- Totales actuales
  SELECT COALESCE(SUM(subtotal), 0), COUNT(DISTINCT n_sistema)
  INTO v_ventas_total, v_tickets_total
  FROM ventas_raw
  WHERE empresa = 'american_classic'
    AND fecha BETWEEN v_actual_inicio AND v_actual_fin
    AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT';

  -- Totales prev
  SELECT COALESCE(SUM(subtotal), 0), COUNT(DISTINCT n_sistema)
  INTO v_ventas_total_prev, v_tickets_total_prev
  FROM ventas_raw
  WHERE empresa = 'american_classic'
    AND fecha BETWEEN v_prev_inicio AND v_prev_fin
    AND vendedor IS NOT NULL AND TRIM(vendedor) <> '' AND UPPER(TRIM(vendedor)) <> 'DEFAULT';

  RETURN jsonb_build_object(
    'vendedoras', COALESCE(v_vendedoras, '[]'::jsonb),
    'total_vendedoras_periodo', jsonb_array_length(COALESCE(v_vendedoras, '[]'::jsonb)),
    'ventas_total', v_ventas_total, 'tickets_total', v_tickets_total,
    'ventas_total_prev', v_ventas_total_prev, 'tickets_total_prev', v_tickets_total_prev,
    'fecha_corte', to_char(v_actual_fin, 'YYYY-MM-DD'),
    'es_periodo_parcial', v_es_parcial,
    'dia_corte_periodo_anterior', to_char(v_prev_fin, 'YYYY-MM-DD'),
    'dia_corte_anio_anterior', to_char(v_prev_fin, 'YYYY-MM-DD')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION multifashion_vendedoras_v3(int, text, int, int) TO service_role;
NOTIFY pgrst, 'reload schema';
```

### Clientes wholesale → `multifashion_wholesale_clientes(p_fecha_inicio date, p_fecha_fin date) RETURNS jsonb`
Archivo: `supabase/migrations/20260517000100_multifashion_wholesale_clientes_range.sql`

Lógica: clientes wholesale (`is_wholesale = true`) en el rango de fechas. Por cliente: total, tickets,
ticket promedio, última compra, y un array de meses (sparkline) — un bucket por mes calendario del rango.

```sql
DROP FUNCTION IF EXISTS multifashion_wholesale_clientes(int);

CREATE OR REPLACE FUNCTION multifashion_wholesale_clientes(
  p_fecha_inicio date,
  p_fecha_fin    date
)
RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_clientes       jsonb;
  v_total_clientes int;
  v_total_ventas   numeric;
  v_total_tickets  bigint;
  v_mes_labels CONSTANT text[] := ARRAY['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
BEGIN
  WITH base AS (
    SELECT cliente, subtotal, fecha, n_sistema,
      EXTRACT(YEAR FROM fecha)::int AS f_anio,
      EXTRACT(MONTH FROM fecha)::int AS f_mes
    FROM ventas_raw
    WHERE empresa = 'american_classic'
      AND is_wholesale = true
      AND fecha BETWEEN p_fecha_inicio AND p_fecha_fin
      AND cliente IS NOT NULL AND TRIM(cliente) <> ''
  ),
  cli AS (
    SELECT cliente, SUM(subtotal)::numeric AS total_ytd,
      COUNT(DISTINCT n_sistema)::int AS tickets_ytd, MAX(fecha) AS ultima_compra
    FROM base GROUP BY cliente
  ),
  meses_lookup AS (
    SELECT EXTRACT(YEAR FROM gs)::int AS mes_anio, EXTRACT(MONTH FROM gs)::int AS mes_idx
    FROM generate_series(date_trunc('month', p_fecha_inicio), date_trunc('month', p_fecha_fin), INTERVAL '1 month') AS gs
  ),
  meses_por_cli AS (
    SELECT cliente, f_anio AS mes_anio, f_mes AS mes_idx,
      SUM(subtotal)::numeric AS ventas, COUNT(DISTINCT n_sistema)::int AS tickets
    FROM base GROUP BY cliente, f_anio, f_mes
  ),
  cli_meses AS (
    SELECT c.cliente,
      jsonb_agg(
        jsonb_build_object(
          'mes_anio', ml.mes_anio, 'mes_idx', ml.mes_idx, 'mes_label', v_mes_labels[ml.mes_idx],
          'ventas', COALESCE(mp.ventas, 0), 'tickets', COALESCE(mp.tickets, 0)
        ) ORDER BY ml.mes_anio, ml.mes_idx
      ) AS meses
    FROM cli c CROSS JOIN meses_lookup ml
    LEFT JOIN meses_por_cli mp ON mp.cliente = c.cliente AND mp.mes_anio = ml.mes_anio AND mp.mes_idx = ml.mes_idx
    GROUP BY c.cliente
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'nombre', c.cliente, 'total_ytd', c.total_ytd, 'tickets_ytd', c.tickets_ytd,
      'ticket_prom', CASE WHEN c.tickets_ytd > 0 THEN c.total_ytd / c.tickets_ytd ELSE 0 END,
      'ultima_compra', to_char(c.ultima_compra, 'YYYY-MM-DD'), 'meses', cm.meses
    ) ORDER BY c.total_ytd DESC
  )
  INTO v_clientes
  FROM cli c LEFT JOIN cli_meses cm ON cm.cliente = c.cliente;

  SELECT
    jsonb_array_length(COALESCE(v_clientes, '[]'::jsonb))::int,
    COALESCE((SELECT SUM((elem->>'total_ytd')::numeric) FROM jsonb_array_elements(COALESCE(v_clientes, '[]'::jsonb)) elem), 0)::numeric,
    COALESCE((SELECT SUM((elem->>'tickets_ytd')::int)::bigint FROM jsonb_array_elements(COALESCE(v_clientes, '[]'::jsonb)) elem), 0)::bigint
  INTO v_total_clientes, v_total_ventas, v_total_tickets;

  RETURN jsonb_build_object(
    'fecha_inicio', to_char(p_fecha_inicio, 'YYYY-MM-DD'),
    'fecha_fin', to_char(p_fecha_fin, 'YYYY-MM-DD'),
    'total_clientes', v_total_clientes, 'total_ventas', v_total_ventas, 'total_tickets', v_total_tickets,
    'clientes', COALESCE(v_clientes, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION multifashion_wholesale_clientes(date, date) TO service_role;
NOTIFY pgrst, 'reload schema';
```

### Clientes retail recurrentes → `multifashion_retail_recurrentes(p_fecha_inicio date, p_fecha_fin date, p_limit int) RETURNS jsonb`
Archivo: `supabase/migrations/20260517000200_multifashion_retail_recurrentes_range.sql`

Lógica: clientes retail (`is_wholesale = false`) con **≥ 2 tickets distintos** y `SUM(subtotal) > 0`
en el rango (clientes recurrentes). Excluye `CONTADO`/`CONSUMIDOR FINAL`. Mismo shape de sparkline mensual.

```sql
DROP FUNCTION IF EXISTS multifashion_retail_recurrentes(int, int);

CREATE OR REPLACE FUNCTION multifashion_retail_recurrentes(
  p_fecha_inicio date,
  p_fecha_fin    date,
  p_limit        int DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_clientes       jsonb;
  v_total_clientes int;
  v_total_ventas   numeric;
  v_total_tickets  bigint;
  v_mes_labels CONSTANT text[] := ARRAY['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
BEGIN
  WITH base AS (
    SELECT cliente, subtotal, fecha, n_sistema,
      EXTRACT(YEAR FROM fecha)::int AS f_anio, EXTRACT(MONTH FROM fecha)::int AS f_mes
    FROM ventas_raw
    WHERE empresa = 'american_classic'
      AND is_wholesale = false
      AND fecha BETWEEN p_fecha_inicio AND p_fecha_fin
      AND cliente IS NOT NULL
      AND TRIM(UPPER(cliente)) NOT IN ('CONTADO', 'CONSUMIDOR FINAL', '')
  ),
  cli AS (
    SELECT cliente, SUM(subtotal)::numeric AS total_ytd,
      COUNT(DISTINCT n_sistema)::int AS tickets_ytd, MAX(fecha) AS ultima_compra
    FROM base GROUP BY cliente
    HAVING COUNT(DISTINCT n_sistema) >= 2 AND SUM(subtotal) > 0
    ORDER BY SUM(subtotal) DESC LIMIT p_limit
  ),
  meses_lookup AS (
    SELECT EXTRACT(YEAR FROM gs)::int AS mes_anio, EXTRACT(MONTH FROM gs)::int AS mes_idx
    FROM generate_series(date_trunc('month', p_fecha_inicio), date_trunc('month', p_fecha_fin), INTERVAL '1 month') AS gs
  ),
  meses_por_cli AS (
    SELECT b.cliente, b.f_anio AS mes_anio, b.f_mes AS mes_idx,
      SUM(b.subtotal)::numeric AS ventas, COUNT(DISTINCT b.n_sistema)::int AS tickets
    FROM base b JOIN cli ON cli.cliente = b.cliente
    GROUP BY b.cliente, b.f_anio, b.f_mes
  ),
  cli_meses AS (
    SELECT c.cliente,
      jsonb_agg(
        jsonb_build_object(
          'mes_anio', ml.mes_anio, 'mes_idx', ml.mes_idx, 'mes_label', v_mes_labels[ml.mes_idx],
          'ventas', COALESCE(mp.ventas, 0), 'tickets', COALESCE(mp.tickets, 0)
        ) ORDER BY ml.mes_anio, ml.mes_idx
      ) AS meses
    FROM cli c CROSS JOIN meses_lookup ml
    LEFT JOIN meses_por_cli mp ON mp.cliente = c.cliente AND mp.mes_anio = ml.mes_anio AND mp.mes_idx = ml.mes_idx
    GROUP BY c.cliente
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'nombre', c.cliente, 'total_ytd', c.total_ytd, 'tickets_ytd', c.tickets_ytd,
      'ticket_prom', CASE WHEN c.tickets_ytd > 0 THEN c.total_ytd / c.tickets_ytd ELSE 0 END,
      'ultima_compra', to_char(c.ultima_compra, 'YYYY-MM-DD'), 'meses', cm.meses
    ) ORDER BY c.total_ytd DESC
  )
  INTO v_clientes
  FROM cli c LEFT JOIN cli_meses cm ON cm.cliente = c.cliente;

  SELECT
    jsonb_array_length(COALESCE(v_clientes, '[]'::jsonb))::int,
    COALESCE((SELECT SUM((elem->>'total_ytd')::numeric) FROM jsonb_array_elements(COALESCE(v_clientes, '[]'::jsonb)) elem), 0)::numeric,
    COALESCE((SELECT SUM((elem->>'tickets_ytd')::int)::bigint FROM jsonb_array_elements(COALESCE(v_clientes, '[]'::jsonb)) elem), 0)::bigint
  INTO v_total_clientes, v_total_ventas, v_total_tickets;

  RETURN jsonb_build_object(
    'fecha_inicio', to_char(p_fecha_inicio, 'YYYY-MM-DD'),
    'fecha_fin', to_char(p_fecha_fin, 'YYYY-MM-DD'),
    'limit', p_limit,
    'total_clientes', v_total_clientes, 'total_ventas', v_total_ventas, 'total_tickets', v_total_tickets,
    'clientes', COALESCE(v_clientes, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION multifashion_retail_recurrentes(date, date, int) TO service_role;
NOTIFY pgrst, 'reload schema';
```

## 1.5 Tabla base: `ventas_raw`

Todas las RPCs de Multifashion leen de esta tabla. **Granularidad: una fila por documento (factura/ticket)** —
`n_sistema` es el id del documento; tickets distintos = `COUNT(DISTINCT n_sistema)`.

Archivo: `supabase/migrations/ventas_v2.sql`

```sql
CREATE TABLE IF NOT EXISTS ventas_raw (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa text NOT NULL,        -- 'american_classic', 'confecciones_boston', ...
  fecha date NOT NULL,
  mes integer NOT NULL,
  anio integer NOT NULL,
  quarter integer NOT NULL,
  tipo text NOT NULL,
  n_sistema text,               -- id del documento (ticket). DISTINCT = # tickets
  n_fiscal text,
  vendedor text,
  cliente text,
  costo numeric(15,2),          -- costo del documento
  descuento numeric(15,2),
  subtotal numeric(15,2),       -- venta neta post-descuento PRE-impuesto (base de todo)
  itbms numeric(15,2),
  total numeric(15,2),          -- subtotal + itbms
  utilidad numeric(15,2),       -- subtotal - costo
  pct_utilidad numeric(10,4),
  uploaded_by uuid,
  uploaded_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ventas_raw_empresa_anio       ON ventas_raw(empresa, anio);
CREATE INDEX IF NOT EXISTS idx_ventas_raw_anio_mes           ON ventas_raw(anio, mes);
CREATE INDEX IF NOT EXISTS idx_ventas_raw_empresa_anio_mes   ON ventas_raw(empresa, anio, mes);

ALTER TABLE ventas_raw ADD CONSTRAINT ventas_raw_unique_factura UNIQUE (n_sistema, empresa);
```

> Columna adicional `is_wholesale boolean` agregada en migración posterior
> (`20260512100000_ventas_raw_is_wholesale.sql`). Separa retail de mayoreo. Las RPCs la usan
> intensivamente. Para Brand It: si no hay distinción retail/wholesale, se puede tratar todo como
> retail (`is_wholesale = false`) o quitar el filtro.

---

# 2. formatDelta

**Archivo:** `src/lib/ventas/formatDelta.ts` (contenido completo, verbatim)

```typescript
// Formato unificado para deltas en celdas de tablas del módulo Ventas.
// Devuelve la tripleta { arrow, displayValue, tone } para que cada consumidor
// mapee tone → clase Tailwind según su contexto (light/dark bg).
//
// Soporta dos modos:
//   - 'pct' (default): delta como ratio decimal (0.12 = +12%). Thresholds
//     ±5% para color. Zona neutral muestra el % sin flecha.
//   - 'pts': delta en puntos porcentuales (margen actual − margen previo,
//     ambos como ratio). Thresholds ±0.5 pts para color. Zona neutral
//     muestra "≈0 pts" stone sin flecha (matchea polish de Detalle Mensual).
//
// La zona neutral devuelve null en arrow para evitar el em dash confuso
// que se mezcla con signo menos en montos negativos.

export type DeltaTone = "emerald" | "orange" | "stone";

export interface DeltaFormat {
  arrow: "▲" | "▼" | null;
  /** "+12%" / "-5%" / "+2.1 pts" / "≈0 pts" / "—" cuando no hay comparativo */
  displayValue: string;
  tone: DeltaTone;
}

const NO_COMPARATIVE: DeltaFormat = {
  arrow: null,
  displayValue: "—",
  tone: "stone",
};

export type DeltaMode = "pct" | "pts";

/**
 * Calcula y formatea delta a partir de current/previous values.
 * Si previous es null/undefined/0/negativo → returns "sin comparativo" form.
 * El modo 'pts' acá no aplica — para puntos porcentuales usar formatDeltaPts
 * con los márgenes ya calculados, o formatDeltaRatio con mode='pts'.
 */
export function formatDelta(
  current: number | null | undefined,
  previous: number | null | undefined
): DeltaFormat {
  if (previous == null || previous <= 0) return NO_COMPARATIVE;
  const delta = ((current ?? 0) - previous) / previous;
  return formatDeltaRatio(delta);
}

/**
 * Variante para callers que ya tienen el delta precomputado.
 *
 * @param delta En modo 'pct': ratio (0.12 = +12%). En modo 'pts': diferencia
 *              de ratios (0.021 = +2.1 pts).
 * @param mode  'pct' (default) o 'pts'.
 */
export function formatDeltaRatio(
  delta: number | null | undefined,
  mode: DeltaMode = "pct",
): DeltaFormat {
  if (delta == null) return NO_COMPARATIVE;

  if (mode === "pts") {
    const pts = delta * 100;
    const absPts = Math.abs(pts);
    // < 0.5 pts es ruido — mismo guard que Detalle Mensual ("≈0%")
    if (absPts < 0.5) {
      return { arrow: null, displayValue: "≈0 pts", tone: "stone" };
    }
    const ptsStr = (pts >= 0 ? "+" : "−") + absPts.toFixed(1) + " pts";
    if (pts > 0) return { arrow: "▲", displayValue: ptsStr, tone: "emerald" };
    return { arrow: "▼", displayValue: ptsStr, tone: "orange" };
  }

  // mode === 'pct'
  const pctStr = (delta >= 0 ? "+" : "") + (delta * 100).toFixed(0) + "%";
  if (delta > 0.05) {
    return { arrow: "▲", displayValue: pctStr, tone: "emerald" };
  }
  if (delta < -0.05) {
    return { arrow: "▼", displayValue: pctStr, tone: "orange" };
  }
  return { arrow: null, displayValue: pctStr, tone: "stone" };
}
```

**Quién lo usa** (para entender el patrón de consumo en la UI):
- `src/components/ventas/ClienteHoverCard.tsx` — `formatDelta`, `DeltaTone`
- `src/components/ventas/OtrosClientesDialog.tsx` — `formatDeltaRatio`, `DeltaTone`
- `src/components/ventas/ResumenView.tsx` — `formatDeltaRatio`
- `src/components/ventas/VendedorasSubtab.tsx` — `formatDelta`, `formatDeltaRatio`, `DeltaTone`
- `src/components/ventas/ClientesView.tsx` — `formatDeltaRatio`, `DeltaTone`

> Patrón: la función devuelve `{ arrow, displayValue, tone }`. Cada componente mapea `tone`
> (`"emerald" | "orange" | "stone"`) a su propia clase Tailwind según el fondo. Esto desacopla
> el cálculo del color real. Portarlo a Brand It es copiar el archivo tal cual.

---

# 3. Costo histórico

> **Esta es la sección que se copiará a Brand It.** Resume dónde vive el costo/utilidad histórico,
> con qué granularidad, y cómo se filtra solo **Confecciones Boston**.

## 3.1 Hallazgo clave: el costo vive en DOS fuentes según la fecha

El sistema tiene un **boundary temporal** porque la API de Switch solo expone costo del **mes en curso**
(forward-only). El histórico cerrado no es recuperable de la API y vino de CSVs subidos a mano.

| Período | Tabla fuente | Granularidad | Origen |
|---|---|---|---|
| **< 2026-05-01** | `ventas_raw` (columna `costo`) | **Por documento (factura)** | CSV histórico subido manual |
| **≥ 2026-05-01** | `switch_costo_diario` | **Por empresa × día** | Sync diario desde API Switch (`/apireporte/totalventas?tipo=03`) |

Ambas se unifican a **empresa × mes** vía la vista `switch_costo_unificado_vw`.

> ⚠️ Para Brand It: el dato histórico de costo de Boston casi seguro vive en `ventas_raw`
> (granularidad por documento), porque `switch_costo_diario` solo arranca en mayo 2026 forward.
> Si Brand It solo necesita histórico, **la fuente es `ventas_raw` filtrando por Boston** (ver 3.5).

## 3.2 Tabla forward: `switch_costo_diario` (empresa × día)

Archivo: `supabase/migrations/20260529000200_switch_costo_diario.sql`

```sql
CREATE TABLE IF NOT EXISTS switch_costo_diario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_key text NOT NULL,
  fecha date NOT NULL,
  venta_total numeric(14,2) NOT NULL DEFAULT 0,
  costo_total numeric(14,2) NOT NULL DEFAULT 0,
  utilidad_total numeric(14,2) NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_key, fecha)            -- una fila por empresa por día
);

CREATE INDEX IF NOT EXISTS idx_scd_empresa_fecha ON switch_costo_diario (empresa_key, fecha);
ALTER TABLE switch_costo_diario ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_all ON switch_costo_diario FOR ALL TO service_role USING (true) WITH CHECK (true);
```

> Granularidad **empresa × día** (NO per-factura — la API no da costo per-documento en este endpoint).
> Incluye Boston (`confecciones_boston`) porque Boston tiene `facturas: true` (ver 3.5). Es el único
> endpoint con costo completo (incluye B2B a crédito).

Código de sync (escribe una fila por día del mes en curso) — `src/lib/switch-api/sync-empresa.ts`,
función `syncCostoDiario()`:

```typescript
const rows: Array<{
  empresa_key: string; fecha: string;
  venta_total: number; costo_total: number; utilidad_total: number;
  synced_at: string; updated_at: string;
}> = [];

for (const v of Object.values(totales) as SwitchTotalVentasDia[]) {
  const fecha = parseFechaDMY(v.fecha);
  if (!fecha) { skipped++; /* …skipDetails… */ continue; }
  rows.push({
    empresa_key: empresaKey,
    fecha,
    venta_total: parseAmount(v.total) ?? 0,
    costo_total: parseAmount(v.costo) ?? 0,
    utilidad_total: parseAmount(v.utilidad) ?? 0,
    synced_at: nowIso,
    updated_at: nowIso,
  });
}

if (rows.length > 0) {
  const { error } = await supabaseServer
    .from("switch_costo_diario")
    .upsert(rows, { onConflict: "empresa_key,fecha", ignoreDuplicates: false });
  if (error) throw new Error(`UPSERT costo_diario falló: ${error.message}`);
}
```

Forma del dato crudo de la API (`src/lib/switch-api/types.ts`):

```typescript
/**
 * /apireporte/totalventas?tipo=03 → data.totales es un objeto keyed por día
 * ("1".."31") con totales del mes EN CURSO. Único endpoint con costo completo
 * (incluye B2B). fecha es "DD-MM-YYYY". Montos string con coma de miles.
 */
export interface SwitchTotalVentasDia {
  total: string | number;
  costo: string | number;
  utilidad: string | number;
  etiqueta: number | string;
  fecha: string; // DD-MM-YYYY
}

export interface SwitchTotalVentasData {
  totales: Record<string, SwitchTotalVentasDia>;
  totalventa: string | number;
  totalcosto: string | number;
  totalutilidad: string | number;
  [key: string]: unknown;
}
```

## 3.3 Histórico: `ventas_raw` (por documento)

La columna `costo numeric(15,2)` de `ventas_raw` es el costo **por documento** (ver schema en 1.5).
`utilidad = subtotal - costo`. Granularidad la más fina disponible. Cubre el período `< 2026-05-01`.

## 3.4 Vista unificada empresa × mes: `switch_costo_unificado_vw`

Archivo: `supabase/migrations/20260529000300_switch_costo_unificado_vw.sql`

Une las dos fuentes en una sola vista mensual. **Acá está la normalización de la empresa_key de Boston**
(`boston`/`confecciones_boston` → `confecciones_boston`):

```sql
CREATE OR REPLACE VIEW switch_costo_unificado_vw AS
  SELECT
    empresa_key,
    date_trunc('month', fecha)::date AS mes,
    SUM(costo_total)::numeric AS costo_total
  FROM switch_costo_diario
  WHERE fecha >= DATE '2026-05-01'
  GROUP BY 1, 2
UNION ALL
  SELECT
    CASE
      WHEN empresa IN ('vistana', 'vistana_international') THEN 'vistana'
      WHEN empresa IN ('boston', 'confecciones_boston') THEN 'confecciones_boston'
      ELSE empresa
    END AS empresa_key,
    make_date(anio, mes, 1) AS mes,
    SUM(costo)::numeric AS costo_total
  FROM ventas_raw
  WHERE make_date(anio, mes, 1) < DATE '2026-05-01'
  GROUP BY 1, 2;

GRANT SELECT ON switch_costo_unificado_vw TO service_role;
```

Y cómo el dashboard combina ventas + costo → utilidad (utilidad se calcula en query time, no se almacena):

Archivo: `supabase/migrations/20260529000400_ventas_dashboard_summary_fase21.sql`

```sql
CREATE OR REPLACE FUNCTION ventas_dashboard_summary(p_anio int)
RETURNS TABLE (
  empresa text, mes int,
  total_subtotal numeric, total_costo numeric, total_utilidad numeric,
  total_facturado numeric, filas bigint
)
LANGUAGE sql STABLE AS $$
  SELECT
    v.empresa_key AS empresa,
    EXTRACT(MONTH FROM v.mes)::int AS mes,
    v.ventas_netas::numeric AS total_subtotal,
    COALESCE(c.costo_total, 0)::numeric AS total_costo,
    (v.ventas_netas - COALESCE(c.costo_total, 0))::numeric AS total_utilidad,  -- utilidad = ventas - costo (query time)
    v.ventas_netas::numeric AS total_facturado,
    0::bigint AS filas
  FROM switch_ventas_unificado_vw v
  LEFT JOIN switch_costo_unificado_vw c
    ON c.empresa_key = v.empresa_key AND c.mes = v.mes
  WHERE EXTRACT(YEAR FROM v.mes)::int = p_anio
  ORDER BY v.empresa_key, EXTRACT(MONTH FROM v.mes)::int
$$;

GRANT EXECUTE ON FUNCTION ventas_dashboard_summary(int) TO service_role;
```

## 3.5 Filtrar SOLO Confecciones Boston

**empresa_key canónica:** `confecciones_boston`. Aliases conocidos en data cruda: `boston`,
`confecciones_boston` (la vista unificada los normaliza con el `CASE`).

Identificadores de Boston (de `src/lib/empresa-mapping.ts` y `src/lib/switch-api/empresas.ts`):

| Contexto | Valor |
|---|---|
| `empresa_key` canónica | `confecciones_boston` |
| Nombre display | `Confecciones Boston` |
| Id corto módulo Ventas (`VentasEmpresaId`) | `boston` |
| Namespace env Switch | `CONFECCIONES_BOSTON` (→ `SWITCH_CONFECCIONES_BOSTON_API_*`) |
| Aliases en `ventas_raw.empresa` | `boston`, `confecciones_boston` |

Capacidades de sync de Boston (`src/lib/switch-api/empresas.ts`):

```typescript
export const EMPRESA_SYNC_CAPABILITIES: Record<EmpresaKey, EmpresaSyncCapability> = {
  // …
  // Boston: solo ventas. CXC por otro lado (Brand It).
  confecciones_boston: { facturas: true, cxc: false },
};
```

> **Punto clave para Brand It:** Boston tiene **datos de ventas/costo** (`facturas: true` → escribe en
> `switch_costo_diario` forward, y tiene histórico en `ventas_raw`), pero su **CXC se maneja aparte**
> (`cxc: false`) — justamente por Brand It. O sea: el costo/utilidad de Boston SÍ existe y es portable;
> lo que NO está centralizado en fashiongr es su cuenta por cobrar.

### Queries de ejemplo (solo Boston)

```sql
-- Costo diario forward (>= mayo 2026)
SELECT * FROM switch_costo_diario
WHERE empresa_key = 'confecciones_boston'
ORDER BY fecha;

-- Costo histórico por documento (< mayo 2026)
SELECT empresa, fecha, n_sistema, subtotal, costo, utilidad
FROM ventas_raw
WHERE empresa IN ('boston', 'confecciones_boston')
ORDER BY fecha;

-- Costo unificado mensual (ambas fuentes, normalizado)
SELECT empresa_key, mes, costo_total
FROM switch_costo_unificado_vw
WHERE empresa_key = 'confecciones_boston'
ORDER BY mes;

-- Ventas + costo + utilidad por mes de un año (Boston)
SELECT * FROM ventas_dashboard_summary(2026)
WHERE empresa = 'confecciones_boston'
ORDER BY mes;
```

## 3.6 Resumen del modelo de costo (tabla)

| Aspecto | Detalle |
|---|---|
| Tabla forward | `switch_costo_diario` (≥ 2026-05-01) |
| Tabla histórica | `ventas_raw.costo` (< 2026-05-01) |
| Granularidad forward | empresa × día |
| Granularidad histórica | por documento (factura) |
| Agregación mensual | `switch_costo_unificado_vw` (UNION de ambas, normaliza empresa_key) |
| Cálculo de utilidad | `ventas - costo`, en query time (no almacenado en el dashboard) |
| empresa_key Boston | `confecciones_boston` (aliases: `boston`) |
| Boston tiene costo/ventas | **Sí** (`facturas: true`) |
| Boston CXC en fashiongr | **No** (`cxc: false` — lo maneja Brand It) |
| Fuente API del costo | `/apireporte/totalventas?tipo=03` (solo mes en curso, forward-only) |
| Sync function | `syncCostoDiario()` en `src/lib/switch-api/sync-empresa.ts` |
| Cron | diario ~06:00 UTC |

---

*Fin del documento. Read-only — generado leyendo fashiongr sin commits.*
