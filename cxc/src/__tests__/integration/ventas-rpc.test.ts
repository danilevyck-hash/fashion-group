/**
 * 🟢-19 — Tests de integración sobre las vistas/RPC de Ventas (fuente Switch).
 *
 * Validan el SQL REAL (no que la tabla renderice): dominio de empresa, signos por
 * tipo de comprobante, bucketing por mes, no-doble-conteo del solape, y aritmética
 * de utilidad. Blinda lo que arreglamos en la auditoría del sync contra regresiones.
 *
 * NO corren en `npm test` por defecto: pegan contra la DB de producción (read-only).
 * Para correrlos:
 *   RUN_DB_TESTS=1 npx vitest run src/__tests__/integration/ventas-rpc.test.ts
 *
 * Requiere NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY en .env.local.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

// empresa-mapping importa supabase-server en el top-level (construye el cliente
// con env vars). En el test runner esas env no existen, así que lo mockeamos para
// que el import no reviente. Los tests usan su PROPIO createClient (abajo).
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: vi.fn() } }));

import { ALL_EMPRESA_KEYS } from "@/lib/empresa-mapping";

const RUN = !!process.env.RUN_DB_TESTS;

function loadEnv(): Record<string, string> {
  try {
    const env: Record<string, string> = {};
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return env;
  } catch {
    return {};
  }
}

describe.skipIf(!RUN)("ventas RPC/vistas — integración (🟢-19)", () => {
  let sb: SupabaseClient;
  const ALLOWED = new Set<string>(ALL_EMPRESA_KEYS as readonly string[]);

  beforeAll(() => {
    const env = loadEnv();
    const url = env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Faltan credenciales Supabase para los tests de integración");
    sb = createClient(url, key, { auth: { persistSession: false } });
  });

  it("DOMINIO: switch_ventas_unificado_vw no emite empresa_key fuera del catálogo", async () => {
    const { data, error } = await sb.from("switch_ventas_unificado_vw").select("empresa_key");
    expect(error).toBeNull();
    const distintas = new Set((data ?? []).map((r) => r.empresa_key));
    for (const k of distintas) {
      expect(k, `empresa_key inesperada en la vista: ${k}`).not.toBeNull();
      expect(ALLOWED.has(k as string), `empresa_key fuera del catálogo: ${k}`).toBe(true);
    }
  });

  it("NO DOBLE-CONTEO: una sola fila por (empresa_key, mes) en la vista unificada", async () => {
    const { data, error } = await sb.from("switch_ventas_unificado_vw").select("empresa_key, mes");
    expect(error).toBeNull();
    const seen = new Set<string>();
    const dups: string[] = [];
    for (const r of data ?? []) {
      const k = `${r.empresa_key}|${r.mes}`;
      if (seen.has(k)) dups.push(k);
      seen.add(k);
    }
    expect(dups, `pares duplicados (solape mal resuelto): ${dups.join(", ")}`).toHaveLength(0);
  });

  it("BUCKETING: ventas_dashboard_summary devuelve mes ∈ 1..12 y un par único por (empresa,mes)", async () => {
    const { data, error } = await sb.rpc("ventas_dashboard_summary", { p_anio: 2025 });
    expect(error).toBeNull();
    const rows = (data ?? []) as Array<{ empresa: string; mes: number; total_subtotal: number; total_costo: number; total_utilidad: number }>;
    expect(rows.length).toBeGreaterThan(0);
    const seen = new Set<string>();
    for (const r of rows) {
      expect(r.mes).toBeGreaterThanOrEqual(1);
      expect(r.mes).toBeLessThanOrEqual(12);
      const k = `${r.empresa}|${r.mes}`;
      expect(seen.has(k), `bucket duplicado ${k}`).toBe(false);
      seen.add(k);
    }
  });

  it("ARITMÉTICA: total_utilidad = total_subtotal − total_costo (por fila)", async () => {
    const { data, error } = await sb.rpc("ventas_dashboard_summary", { p_anio: 2025 });
    expect(error).toBeNull();
    const rows = (data ?? []) as Array<{ total_subtotal: number; total_costo: number; total_utilidad: number }>;
    for (const r of rows) {
      const esperado = Number(r.total_subtotal) - Number(r.total_costo);
      expect(Math.abs(Number(r.total_utilidad) - esperado)).toBeLessThan(0.01);
    }
  });

  it("SIGNOS POR TIPO: ventas_netas = Σ(F+T+Tr+ND) − Σ(NC) reconstruido desde switch_facturas", async () => {
    // Mes cerrado en la era Switch (no cambia): Fashion Wear, noviembre 2025.
    const EMP = "fashion_wear";
    const desde = "2025-11-01";
    const hasta = "2025-12-01";

    // 1) Reconstrucción desde la tabla cruda (la fuente de verdad del signo).
    const filas: Array<{ tipo_comprobante: string; subtotal_descuento: number }> = [];
    const PAGE = 1000;
    for (let off = 0; ; off += PAGE) {
      const { data, error } = await sb
        .from("switch_facturas")
        .select("tipo_comprobante, subtotal_descuento")
        .eq("empresa_key", EMP)
        .gte("fecha", desde)
        .lt("fecha", hasta)
        .range(off, off + PAGE - 1);
      expect(error).toBeNull();
      if (!data || data.length === 0) break;
      filas.push(...(data as typeof filas));
      if (data.length < PAGE) break;
    }
    expect(filas.length, "no hay facturas FW nov-2025 — ¿sync corrió?").toBeGreaterThan(0);

    const POS = new Set(["Factura", "Tiquete", "Transacción", "Nota de Débito"]);
    let netoReconstruido = 0;
    for (const f of filas) {
      const v = Number(f.subtotal_descuento ?? 0);
      if (POS.has(f.tipo_comprobante)) netoReconstruido += v;
      else if (f.tipo_comprobante === "Nota de Crédito") netoReconstruido -= v;
    }

    // 2) Lo que reporta la vista para ese empresa-mes.
    const { data: vw, error: vwErr } = await sb
      .from("switch_ventas_unificado_vw")
      .select("ventas_netas")
      .eq("empresa_key", EMP)
      .eq("mes", desde);
    expect(vwErr).toBeNull();
    expect(vw && vw.length, "la vista no tiene fila FW nov-2025").toBe(1);

    const netoVista = Number(vw![0].ventas_netas);
    // Tolerancia 1 centavo: la vista usa numeric; la reconstrucción usa float JS.
    expect(Math.abs(netoVista - netoReconstruido)).toBeLessThan(0.01);
    // Sanidad: el neto debe ser positivo y material (no un 0 por bug de signo).
    expect(netoVista).toBeGreaterThan(0);
  });
});
