/**
 * SOLO LECTURA. Mide el ANTES/DESPUÉS de arreglar los truncados silenciosos de
 * PostgREST (`db-max-rows` = 1000, corta sin avisar).
 *
 *   npx tsx scripts/_diag-truncados-antes-despues.ts
 *
 * Por cada lectura arreglada reproduce la consulta VIEJA tal cual estaba y la
 * NUEVA (paginada), y traduce la diferencia al número que Daniel ve en pantalla.
 * No escribe absolutamente nada.
 */
import fs from "node:fs";

function cargarEnv() {
  for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
    if (!l.includes("=") || l.trim().startsWith("#")) continue;
    const i = l.indexOf("=");
    process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const toNum = (v: unknown) => {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

async function main() {
  cargarEnv();
  const { supabaseServer } = await import("../src/lib/supabase-server");
  const { leerTodoPaginado } = await import("../src/lib/supabase-paginado");

  const sep = (t: string) => console.log(`\n${"═".repeat(78)}\n${t}\n${"═".repeat(78)}`);

  // ─── 1. switch_estadocuenta → frescura de CXC + badge cxcStale ──────────────
  sep("1 · Frescura de CXC y badge de atraso  (switch_estadocuenta)");
  {
    const { count: total } = await supabaseServer
      .from("switch_estadocuenta").select("id", { count: "exact", head: true });

    // VIEJA: un solo select ordenado por synced_at desc, sin tope.
    const { data: vieja } = await supabaseServer
      .from("switch_estadocuenta").select("empresa_key, synced_at")
      .order("synced_at", { ascending: false });
    const filasViejas = (vieja ?? []) as { empresa_key: string; synced_at: string }[];

    // NUEVA: paginada, máximo por empresa calculado en memoria.
    const filasNuevas = await leerTodoPaginado<{ empresa_key: string; synced_at: string }>(
      "switch_estadocuenta",
      (c, d, h) => supabaseServer.from("switch_estadocuenta")
        .select("empresa_key, synced_at", c ? { count: "exact" } : {})
        .order("id", { ascending: true }).range(d, h),
    );

    const maxPorEmpresa = (filas: { empresa_key: string; synced_at: string }[]) => {
      const m = new Map<string, string>();
      for (const r of filas) {
        const p = m.get(r.empresa_key);
        if (!p || r.synced_at > p) m.set(r.empresa_key, r.synced_at);
      }
      return m;
    };
    const antes = maxPorEmpresa(filasViejas);
    const despues = maxPorEmpresa(filasNuevas);

    console.log(`filas en la tabla: ${total}`);
    console.log(`lectura VIEJA trajo ${filasViejas.length}${filasViejas.length < (total ?? 0) ? `  🔴 TRUNCADA (faltaban ${(total ?? 0) - filasViejas.length})` : "  ✅"}`);
    console.log(`lectura NUEVA trajo ${filasNuevas.length}  ✅ verificada contra el COUNT`);
    console.log(`\nEmpresas con frescura visible:  ANTES ${antes.size}  →  DESPUÉS ${despues.size}`);
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const stale = (m: Map<string, string>) => [...m.values()].filter((s) => s < sevenDaysAgo).length;
    console.log(`Badge "CXC atrasado" (cxcStale):  ANTES ${stale(antes)}  →  DESPUÉS ${stale(despues)}`);
    console.log("\nÚltima sincronización por empresa:");
    for (const e of new Set([...antes.keys(), ...despues.keys()])) {
      const a = antes.get(e);
      const b = despues.get(e);
      console.log(`   ${e.padEnd(22)} ANTES ${a ? a.slice(0, 16) : "— (invisible)"}   DESPUÉS ${b ? b.slice(0, 16) : "—"}${a !== b ? "   ← CAMBIA" : ""}`);
    }
  }

  // ─── 2. clientes_*_12m_vw → lista de /ventas y fila "Otros clientes" ────────
  sep('2 · /ventas — lista de clientes y fila "Otros clientes"');
  {
    const empresas = ["vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep", "confecciones_boston"];
    type Fila = { cliente_id: string | null; cliente_nombre: string | null; compras_ytd: unknown; compras_anio_anterior: unknown };

    const resumen = async (etiqueta: string, vista: string, empresaKey?: string) => {
      const { count: total } = await supabaseServer.from(vista)
        .select("cliente_nombre", { count: "exact", head: true })
        .then((r) => r, () => ({ count: null }) as never);

      let q = supabaseServer.from(vista).select("cliente_id,cliente_nombre,compras_ytd,compras_anio_anterior")
        .order("ultima_compra", { ascending: false, nullsFirst: false }).limit(5000);
      if (empresaKey) q = supabaseServer.from(vista).select("cliente_id,cliente_nombre,compras_ytd,compras_anio_anterior")
        .eq("empresa", empresaKey).order("ultima_compra", { ascending: false, nullsFirst: false }).limit(5000);
      const { data: vieja } = await q;
      const fv = (vieja ?? []) as Fila[];

      const fn = await leerTodoPaginado<Fila>(etiqueta, (c, d, h) => {
        const base = supabaseServer.from(vista)
          .select("cliente_id,cliente_nombre,compras_ytd,compras_anio_anterior", c ? { count: "exact" } : {});
        return (empresaKey ? base.eq("empresa", empresaKey) : base)
          .order("ultima_compra", { ascending: false, nullsFirst: false })
          .order("cliente_nombre", { ascending: true })
          .order("cliente_id", { ascending: true })
          .range(d, h);
      });

      const sum = (f: Fila[]) => f.reduce((s, r) => s + toNum(r.compras_ytd), 0);
      const orph = (f: Fila[]) => f.filter((r) => r.cliente_id == null);
      const trunc = fv.length < fn.length;
      console.log(`\n── ${etiqueta}  (${total ?? "?"} filas reales)`);
      console.log(`   filas leídas:            ANTES ${String(fv.length).padStart(5)}  →  DESPUÉS ${String(fn.length).padStart(5)}${trunc ? "  🔴 se truncaba" : "  ✅ ya venía completa"}`);
      if (!trunc) return;
      console.log(`   TOTAL compras 12m:       ANTES ${money(sum(fv)).padStart(16)}  →  DESPUÉS ${money(sum(fn)).padStart(16)}   ← plata en pantalla`);
      console.log(`   fila "Otros clientes":   ANTES (${orph(fv).length}) ${money(sum(orph(fv)))}  →  DESPUÉS (${orph(fn).length}) ${money(sum(orph(fn)))}`);
    };

    await resumen("clientes_agregado_12m_vw (Todas)", "clientes_agregado_12m_vw");
    for (const e of empresas) await resumen(`clientes_empresa_12m_vw (${e})`, "clientes_empresa_12m_vw", e);
  }

  // ─── 3. switch_clientes → selector del checkout de catálogos ────────────────
  sep("3 · Selector de clientes del checkout de catálogos  (switch_clientes)");
  {
    for (const [marca, empresa] of [["reebok", "active_shoes"], ["joybees", "joystep"], ["tommy", "fashion_shoes"]]) {
      const { count } = await supabaseServer.from("switch_clientes")
        .select("cliente_switch_id", { count: "exact", head: true }).eq("empresa_key", empresa);
      const { data: vieja } = await supabaseServer.from("switch_clientes")
        .select("cliente_switch_id, codigo, nombre").eq("empresa_key", empresa)
        .order("nombre", { ascending: true });
      const fv = (vieja ?? []) as { nombre: string }[];
      const fn = await leerTodoPaginado<{ nombre: string }>(`switch_clientes ${empresa}`,
        (c, d, h) => supabaseServer.from("switch_clientes")
          .select("cliente_switch_id, codigo, nombre", c ? { count: "exact" } : {})
          .eq("empresa_key", empresa).order("nombre", { ascending: true })
          .order("cliente_switch_id", { ascending: true }).range(d, h));
      const trunc = fv.length < fn.length;
      console.log(`   ${marca.padEnd(8)} (${empresa.padEnd(14)}) clientes en el selector: ANTES ${String(fv.length).padStart(5)}  →  DESPUÉS ${String(fn.length).padStart(5)}  (${count} reales)${trunc ? `  🔴 faltaban ${fn.length - fv.length}` : "  ✅"}`);
      if (trunc) console.log(`            primero que faltaba: "${fn[fv.length]?.nombre}"   último: "${fn[fn.length - 1]?.nombre}"`);
    }
  }

  // ─── 4. products / inventory → catálogo público ────────────────────────────
  sep("4 · Catálogo público — productos y tallas  (products / inventory)");
  {
    const { count: cProd } = await supabaseServer.from("products").select("id", { count: "exact", head: true });
    const { count: cProdAct } = await supabaseServer.from("products").select("id", { count: "exact", head: true }).eq("active", true);
    const { count: cInv } = await supabaseServer.from("inventory").select("id", { count: "exact", head: true });

    const { data: invVieja } = await supabaseServer.from("inventory").select("product_id,size,quantity").order("size");
    const fv = (invVieja ?? []) as { product_id: number; quantity: number | null }[];
    const fn = await leerTodoPaginado<{ product_id: number; quantity: number | null }>("inventory",
      (c, d, h) => supabaseServer.from("inventory")
        .select("product_id,size,quantity", c ? { count: "exact" } : {})
        .order("size").order("id", { ascending: true }).range(d, h));

    const conStock = (f: typeof fv) => new Set(f.filter((i) => (i.quantity ?? 0) > 0).map((i) => i.product_id));
    console.log(`products: ${cProd} filas (${cProdAct} activos)   inventory: ${cInv} filas`);
    console.log(`inventory leído:            ANTES ${String(fv.length).padStart(5)}  →  DESPUÉS ${String(fn.length).padStart(5)}${fv.length < fn.length ? `  🔴 faltaban ${fn.length - fv.length}` : "  ✅"}`);
    console.log(`productos CON stock visible: ANTES ${String(conStock(fv).size).padStart(5)}  →  DESPUÉS ${String(conStock(fn).size).padStart(5)}   ← los de la diferencia salían "Agotado" sin estarlo`);
    const stockTotal = (f: typeof fv) => f.reduce((s, i) => s + (i.quantity ?? 0), 0);
    console.log(`stock total (stats):         ANTES ${String(stockTotal(fv)).padStart(7)}  →  DESPUÉS ${String(stockTotal(fn)).padStart(7)}`);

    const { data: ordVieja } = await supabaseServer.from("reebok_orders")
      .select("id,total").order("created_at", { ascending: false }).limit(5000);
    const ov = (ordVieja ?? []) as { total: unknown }[];
    const on = await leerTodoPaginado<{ total: unknown }>("reebok_orders",
      (c, d, h) => supabaseServer.from("reebok_orders").select("id,total", c ? { count: "exact" } : {})
        .order("created_at", { ascending: false }).order("id", { ascending: true }).range(d, h));
    console.log(`pedidos Reebok (stats):      ANTES ${String(ov.length).padStart(5)}  →  DESPUÉS ${String(on.length).padStart(5)}${ov.length < on.length ? "  🔴" : "  ✅"}`);
    if (ov.length < on.length) {
      console.log(`   monto total de pedidos:   ANTES ${money(ov.reduce((s, o) => s + toNum(o.total), 0))}  →  DESPUÉS ${money(on.reduce((s, o) => s + toNum(o.total), 0))}`);
    }
  }

  console.log("\n(todo lo anterior es SOLO LECTURA — no se escribió ninguna fila)");
}

main().catch((e) => { console.error("FALLO:", e); process.exit(1); });
