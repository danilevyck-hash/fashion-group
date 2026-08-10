/**
 * DIAGNÓSTICO READ-ONLY — candidatos para identificar el FOB de Switch.
 *
 * Daniel confirmó que la FICHA de Switch tiene "Costo FOB" y "Costo CIF"
 * separados, pero en 31KAE22003001 valen lo mismo y no se puede saber cuál
 * manda la API en `costo`. Este script busca artículos donde los costos NO
 * sean triviales, para que Daniel abra UNO en su pantalla y compare.
 *
 * UNA sesión de Switch (vistana): barrido de /apiarticulos/lista + /stock de
 * los ≤6 candidatos. NO ESCRIBE NADA.
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-fob-candidatos.ts
 */
import { createClient } from "@supabase/supabase-js";
import { createSwitchClient, logoutAllSwitchSessions } from "../src/lib/switch-api/client";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const EMPRESA = "vistana";

interface VentaUnit { unit: number; mes: string }

/** Costo unitario de ventas recientes por código (switch_articulo_diario). */
async function costosUnitariosVentas(): Promise<Map<string, VentaUnit>> {
  const out = new Map<string, VentaUnit>();
  for (let p = 0; p < 40; p++) {
    const { data, error } = await db
      .from("switch_articulo_diario")
      .select("codigo, fecha, cantidad_total, costo_total")
      .eq("empresa_key", EMPRESA)
      .eq("tipo", "FA")
      .gte("fecha", "2026-01-01")
      .gt("cantidad_total", 0)
      .order("id", { ascending: true })
      .range(p * 1000, p * 1000 + 999);
    if (error) throw new Error(error.message);
    for (const f of data ?? []) {
      if (!f.codigo || !Number(f.costo_total)) continue;
      const unit = Number(f.costo_total) / Number(f.cantidad_total);
      const mes = String(f.fecha).slice(0, 7);
      const prev = out.get(f.codigo);
      if (!prev || mes >= prev.mes) out.set(f.codigo, { unit, mes });
    }
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

async function main() {
  const ventas = await costosUnitariosVentas();
  console.log(`costos unitarios de ventas 2026 (vistana): ${ventas.size} códigos`);

  const cli = createSwitchClient(EMPRESA);
  try {
    // Barrido del catálogo (corte por página vacía — el endpoint ignora porPagina).
    const catalogo: Array<{ id: number; codigo: string; costo: number; precio: number }> = [];
    for (let pagina = 1; pagina <= 400; pagina++) {
      const data = await cli.getArticulos({ porPagina: 50, paginaActual: pagina });
      const lote = data?.articulos ?? [];
      if (lote.length === 0) break;
      for (const a of lote) {
        if (!a.codigo) continue;
        catalogo.push({ id: a.id, codigo: a.codigo, costo: parseFloat(a.costo ?? "0"), precio: parseFloat(a.precio ?? "0") });
      }
    }
    console.log(`catálogo vistana: ${catalogo.length} renglones`);

    // Candidatos: costo del catálogo ≠ costo unitario de ventas recientes
    // (señal de que el costo se movió — importación nueva a otro precio).
    const candidatos = catalogo
      .map((a) => {
        const v = ventas.get(a.codigo);
        return v && a.costo > 0 ? { ...a, ventaUnit: v.unit, mesVenta: v.mes, delta: Math.abs(a.costo - v.unit) } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x && x.delta > 0.05)
      .sort((a, b) => b.mesVenta.localeCompare(a.mesVenta) || b.delta - a.delta)
      .slice(0, 12);

    console.log(`candidatos con costo movido: ${candidatos.length}`);
    const finales = candidatos.slice(0, 6);
    for (const c of finales) {
      try {
        const st = await cli.getStock(c.id);
        const s = (st as { stock?: Array<Record<string, unknown>> }).stock?.[0] ?? {};
        console.log(
          `${c.codigo} · costo(lista)=${c.costo.toFixed(4)} · costo(stock)=${s.costo} · costopromedio=${s.costopromedio} · ` +
            `precio=${c.precio.toFixed(2)} · costoUnitVentas(${c.mesVenta})=${c.ventaUnit.toFixed(4)} · saldo=${s.saldo}`,
        );
      } catch (e) {
        console.log(`${c.codigo} · stock FALLÓ: ${String(e).slice(0, 80)}`);
      }
    }
  } finally {
    await logoutAllSwitchSessions();
  }
}
main().catch((e) => { console.error("ERROR:", e?.message ?? e); process.exit(1); });
