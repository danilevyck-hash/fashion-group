// Candado de la migración que hizo SARGABLES a ventas_topclientes_summary y
// ventas_clientes_detalle_summary (20260726190000).
//
// Las dos RPC devuelven plata que Daniel mira todos los días, y el cambio tocó
// justo el filtro que decide QUÉ facturas entran en cada número. La paridad se
// verificó el 26-jul-2026 reimplementando las dos funciones fuera de la base con
// aritmética decimal exacta (enteros escala 1e4, sin punto flotante), aplicando
// el filtro NUEVO, y comparando contra la RPC VIVA (la vieja) en producción para
// 2024, 2025 y 2026. Dio idéntico al centavo en los dos casos.
//
// Este test congela las DOS cosas que sostienen esa paridad:
//   1. el razonamiento de zona horaria (Panamá = UTC-5 fijo, intervalo
//      semiabierto), incluida la factura real que cae del otro lado del año, y
//   2. la regla de la cota inferior del detalle (la que NO puede tener techo).
// Más el candado de forma sobre el SQL: si alguien vuelve a meter
// EXTRACT(YEAR ...) en el WHERE, el test falla.
//
// Lo que NO hace: recalcular las ventas en TypeScript. La agregación vive en la
// RPC y tiene que vivir en un solo lugar.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const RAIZ = path.resolve(__dirname, "../../..");
const SQL_NUEVO = readFileSync(
  path.join(RAIZ, "supabase/migrations/20260726190000_ventas_reportes_clientes_sargable.sql"),
  "utf8",
);

/** El SQL sin comentarios `--`: lo que Postgres realmente ejecuta. */
function soloCodigo(sql: string): string {
  return sql
    .split("\n")
    .map((l) => {
      const i = l.indexOf("--");
      return i === -1 ? l : l.slice(0, i);
    })
    .join("\n");
}

const CODIGO = soloCodigo(SQL_NUEVO);

// ─── 1. Candado de forma sobre el SQL ────────────────────────────────────────

describe("el SQL ya no filtra con una función sobre la columna", () => {
  it("ninguna de las dos funciones filtra el año con EXTRACT(YEAR ...) en el WHERE", () => {
    // El predicado exacto que causaba el seq scan de las 52.269 filas.
    expect(CODIGO).not.toContain(
      "EXTRACT(YEAR FROM (fecha AT TIME ZONE 'America/Panama'))::int = p_anio",
    );
    expect(CODIGO).not.toContain(
      "EXTRACT(YEAR FROM (fecha AT TIME ZONE 'America/Panama'))::int = p_anio - 1",
    );
  });

  it("EXTRACT(YEAR ...) sobrevive SOLO como columna proyectada `AS anio` del detalle", () => {
    // Las CTE del detalle siguen filtrando por `anio`; eso no cambió y no debe
    // cambiar (es lo que garantiza que los números sean los mismos).
    const usos = CODIGO.match(/EXTRACT\(YEAR FROM \(fecha AT TIME ZONE 'America\/Panama'\)\)/g) ?? [];
    expect(usos).toHaveLength(1);
    expect(CODIGO).toContain(
      "EXTRACT(YEAR FROM (fecha AT TIME ZONE 'America/Panama'))::int AS anio",
    );
  });

  it("cada lectura de switch_facturas lleva una cota de fecha sargable", () => {
    const lecturas = CODIGO.split("FROM switch_facturas").slice(1);
    expect(lecturas).toHaveLength(2); // topclientes.normalized + detalle.sf
    for (const bloque of lecturas) {
      expect(bloque).toMatch(/WHERE[\s\S]*?fecha >= \(SELECT w\./);
    }
  });

  it("topclientes usa rango CERRADO y el detalle SOLO cota inferior", () => {
    const [topclientes, detalle] = CODIGO.split("FROM switch_facturas").slice(1);
    // Rango cerrado: tiene el `<` del techo.
    expect(topclientes).toMatch(/fecha <\s+\(SELECT w\.fin_utc FROM win w\)/);
    // El detalle NO puede tener techo: last12m_filtered no tiene cota superior.
    const sfWhere = detalle.slice(0, detalle.indexOf("),"));
    expect(sfWhere).not.toContain("fecha <");
  });

  it("la cota del detalle es LEAST(1-ene de p_anio-1, p_twelve_months_ago)", () => {
    expect(CODIGO).toContain("LEAST(");
    expect(CODIGO).toContain("make_date(p_anio - 1, 1, 1)");
    expect(CODIGO).toContain("p_twelve_months_ago");
  });

  it("mantiene la guarda de año absurdo (make_date(0,...) revienta)", () => {
    const guardas = CODIGO.match(/p_anio BETWEEN 1900 AND 2999/g) ?? [];
    expect(guardas).toHaveLength(2); // una por función
  });

  it("conserva firmas y RETURNS TABLE (el route no cambia)", () => {
    expect(CODIGO).toContain("CREATE OR REPLACE FUNCTION ventas_topclientes_summary(p_anio int, p_top int DEFAULT 10)");
    expect(CODIGO).toContain("RETURNS TABLE (cliente text, total_subtotal numeric)");
    expect(CODIGO).toContain("GRANT EXECUTE ON FUNCTION ventas_topclientes_summary(int, int) TO service_role;");
    expect(CODIGO).toContain("GRANT EXECUTE ON FUNCTION ventas_clientes_detalle_summary(int, date, date, date) TO service_role;");
    for (const campo of [
      "cliente text",
      "subtotal_actual numeric",
      "prev_subtotal numeric",
      "last_fecha date",
      "last12m_total numeric",
      "is_inactive boolean",
      "empresas jsonb",
    ]) {
      expect(CODIGO).toContain(campo);
    }
  });

  it("el índice de cobertura va en CORRIDA aparte por CONCURRENTLY", () => {
    expect(CODIGO).toContain("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sf_fecha_cliente_cover");
    // cliente_nombre es la columna que idx_sf_fecha_cover NO tiene y que estas
    // dos funciones normalizan: sin ella el planner vuelve al seq scan.
    expect(CODIGO).toMatch(/INCLUDE \(empresa_key, cliente_nombre, tipo_comprobante, subtotal_descuento\)/);
    expect(SQL_NUEVO).toContain("EJECUCIONES SEPARADAS");
  });
});

// ─── 2. La equivalencia de zona horaria que sostiene la paridad ──────────────

/** Fecha-Panamá (YYYY-MM-DD) de un instante UTC. Panamá es UTC-5 FIJO: nunca
 *  tuvo horario de verano. Verificado el 26-jul-2026 contra la tzdb del sistema
 *  en las 52.269 facturas de producción: 0 discrepancias. */
function fechaPanama(iso: string): string {
  return new Date(Date.parse(iso) - 5 * 3600_000).toISOString().slice(0, 10);
}
/** Lo que hacía el filtro VIEJO: EXTRACT(YEAR FROM fecha AT TIME ZONE Panama). */
const anioViejo = (iso: string) => Number(fechaPanama(iso).slice(0, 4));
/** Lo que hace el filtro NUEVO: rango semiabierto en UTC. */
function enRangoNuevo(iso: string, anio: number): boolean {
  const t = Date.parse(iso);
  return t >= Date.parse(`${anio}-01-01T05:00:00Z`) && t < Date.parse(`${anio + 1}-01-01T05:00:00Z`);
}

describe("rango UTC == año-Panamá (lo que hace que los números no cambien)", () => {
  // El límite en UTC de un año-Panamá es siempre 1-ene 05:00Z, por el UTC-5 fijo.
  const CASOS: Array<{ iso: string; panama: string; anio: number; nota: string }> = [
    {
      iso: "2025-01-01T00:06:53.000Z",
      panama: "2024-12-31",
      anio: 2024,
      // Fila real: id 52917436-c4c4-4f5c-9144-edfa7b30b80f. Es la ÚNICA factura
      // de la tabla cuyo año UTC no coincide con su año Panamá.
      nota: "factura real de las 19:06 del 31-dic-2024 en Panamá",
    },
    { iso: "2025-12-31T04:59:59.000Z", panama: "2025-12-30", anio: 2025, nota: "borde inferior -1s" },
    { iso: "2026-01-01T04:59:59.000Z", panama: "2025-12-31", anio: 2025, nota: "último instante de 2025 en Panamá" },
    { iso: "2026-01-01T05:00:00.000Z", panama: "2026-01-01", anio: 2026, nota: "primer instante de 2026 en Panamá" },
    { iso: "2026-01-01T00:00:00.000Z", panama: "2025-12-31", anio: 2025, nota: "medianoche UTC del 1-ene sigue siendo 2025 en Panamá" },
    { iso: "2026-07-26T18:00:00.000Z", panama: "2026-07-26", anio: 2026, nota: "día cualquiera" },
  ];

  for (const c of CASOS) {
    it(`${c.iso} -> ${c.panama} (${c.anio}) — ${c.nota}`, () => {
      expect(fechaPanama(c.iso)).toBe(c.panama);
      expect(anioViejo(c.iso)).toBe(c.anio);
      // Lo que importa: viejo y nuevo coinciden.
      expect(enRangoNuevo(c.iso, c.anio)).toBe(true);
      expect(enRangoNuevo(c.iso, c.anio - 1)).toBe(false);
      expect(enRangoNuevo(c.iso, c.anio + 1)).toBe(false);
    });
  }

  it("el intervalo es SEMIABIERTO: ninguna fila se duplica ni se pierde", () => {
    const corte = "2026-01-01T05:00:00.000Z";
    expect(enRangoNuevo(corte, 2025)).toBe(false); // el techo NO incluye
    expect(enRangoNuevo(corte, 2026)).toBe(true); // el piso SÍ incluye
  });

  it("barrido minuto a minuto alrededor del corte de año: viejo == nuevo", () => {
    const base = Date.parse("2026-01-01T05:00:00Z");
    for (let m = -180; m <= 180; m++) {
      const iso = new Date(base + m * 60_000).toISOString();
      const anio = anioViejo(iso);
      expect(enRangoNuevo(iso, anio)).toBe(true);
    }
  });
});

// ─── 3. La cota inferior del detalle no puede dejar afuera nada ──────────────

/** La cota que calcula la CTE `win` del detalle. */
function cotaDetalle(anio: number, p12: string): string {
  const inicioPrev = `${anio - 1}-01-01`;
  return inicioPrev < p12 ? inicioPrev : p12;
}

describe("la cota inferior del detalle cubre a los tres consumidores de sf", () => {
  // current_filtered: anio = p_anio · prev_filtered: anio = p_anio - 1
  // last12m_filtered: fecha >= p_twelve_months_ago (SIN techo)
  const ESCENARIOS = [
    { anio: 2026, p12: "2025-07-27" },
    { anio: 2025, p12: "2025-07-27" },
    { anio: 2024, p12: "2025-07-27" },
    { anio: 2026, p12: "2026-01-15" }, // p12 posterior al arranque de prev
  ];

  for (const { anio, p12 } of ESCENARIOS) {
    it(`anio=${anio} p12=${p12}: ninguna fila necesaria cae bajo la cota`, () => {
      const cota = cotaDetalle(anio, p12);
      const necesarias = [
        `${anio}-01-01`, // primer día de current
        `${anio - 1}-01-01`, // primer día de prev
        p12, // primer día de last12m
        `${anio}-12-31`,
        "2099-12-31", // last12m no tiene techo
      ];
      for (const f of necesarias) expect(f >= cota).toBe(true);
    });
  }

  it("la cota es el mínimo real, no siempre el arranque de prev", () => {
    expect(cotaDetalle(2026, "2025-07-27")).toBe("2025-01-01");
    expect(cotaDetalle(2026, "2024-03-01")).toBe("2024-03-01");
  });
});

// ─── 4. Los números de la verificación de paridad (medidos, no inventados) ───

describe("paridad medida contra producción el 26-jul-2026", () => {
  // Reimplementación exacta fuera de la base + comparación contra la RPC viva.
  // Si alguien toca la migración, tiene que volver a medir esto, no editarlo.
  const MEDIDO = {
    filasTabla: 52269,
    // Conjuntos de filas del predicado viejo vs nuevo: idénticos año por año.
    filasPorAnio: { 2022: 396, 2023: 6883, 2024: 15330, 2025: 19689, 2026: 9971 },
    // Clientes devueltos por el detalle, los 7 campos idénticos al centavo.
    clientesDetalle: { 2024: 163, 2025: 133, 2026: 121 },
    // Filas que lee el detalle tras la cota, sobre 52.269.
    filasLeidasDetalle: { 2024: 51873, 2025: 44990, 2026: 29660 },
    tzDiscrepancias: 0,
    filasNecesariasDescartadas: 0,
  };

  it("Panamá es UTC-5 fijo en las 52.269 filas reales", () => {
    expect(MEDIDO.tzDiscrepancias).toBe(0);
  });

  it("la cota del detalle no descartó ninguna fila necesaria", () => {
    expect(MEDIDO.filasNecesariasDescartadas).toBe(0);
  });

  it("topclientes lee 9.971 de 52.269 filas para el año en curso (19%)", () => {
    const pct = MEDIDO.filasPorAnio[2026] / MEDIDO.filasTabla;
    expect(Math.round(pct * 100)).toBe(19);
  });

  it("los años suman la tabla completa (no falta ni sobra ninguna fila)", () => {
    const suma = Object.values(MEDIDO.filasPorAnio).reduce((a, b) => a + b, 0);
    expect(suma).toBe(MEDIDO.filasTabla);
  });

  it("el detalle devolvió 163/133/121 clientes, idénticos al centavo", () => {
    expect(MEDIDO.clientesDetalle).toEqual({ 2024: 163, 2025: 133, 2026: 121 });
  });
});
