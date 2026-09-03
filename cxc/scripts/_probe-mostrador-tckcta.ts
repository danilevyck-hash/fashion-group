// ─────────────────────────────────────────────────────────────────────────────
// SOLO LECTURA. ¿CUÁNTO ES EL MOSTRADOR DEL GRUPO, Y POR QUÉ LA PANTALLA DECÍA
// UNA EMPRESA DE SEIS? (2-sep-2026)
//
// Lo que mide, contra producción:
//   1. Quién es `TCKCTA` en cada una de las 6 (id y nombre en `switch_clientes`).
//   2. Qué otros clientes tienen un nombre genérico — y si alguno NO es TCKCTA.
//   3. El mostrador 2026 por empresa, con la MISMA aritmética que el ranking
//      (`subtotal_descuento` firmado por tipo de comprobante).
//   4. Cuánto sacaba de la vista el filtro por NOMBRE, nombre por nombre.
//
// Lo que salió (y quedó asentado en `20260908120000_mostrador_por_codigo.sql`):
//   · `TCKCTA` es el id 1 en las seis, con TRES nombres distintos y ninguno
//     igual a "VENTAS LOCAL".
//   · Mostrador 2026 = $54.478,59 con `subtotal_descuento` (la columna del
//     ranking) y $55.555,49 con `subtotal` (bruto). La pantalla decía $25.835,65.
//   · Las facturas con nombre 'VENTAS LOCALES' NO son el mostrador: su
//     `cliente_switch_id` (61/60/122/55) ya no existe en `switch_clientes`.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/_probe-mostrador-tckcta.ts
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";

const B2B = ["vistana","fashion_wear","fashion_shoes","active_shoes","active_wear","joystep"];
const norm = (s: string) =>
  s.toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
const SIGNO: Record<string, number> = {
  "Factura": 1, "Tiquete": 1, "Transacción": 1, "Nota de Débito": 1, "Nota de Crédito": -1,
};

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  // 1. TCKCTA por empresa
  const tck: Record<string, { id: number; nombre: string }> = {};
  const genericos: { empresa: string; id: number; codigo: string; nombre: string }[] = [];
  for (const e of B2B) {
    const { data, error } = await db.from("switch_clientes")
      .select("cliente_switch_id, codigo, nombre").eq("empresa_key", e);
    if (error) throw error;
    for (const c of data ?? []) {
      const cod = (c.codigo || "").trim().toUpperCase();
      if (cod === "TCKCTA") tck[e] = { id: c.cliente_switch_id, nombre: c.nombre };
      if (["CONTADO","VENTAS","VENTAS LOCALES","VENTAS LOCA"].includes(norm(c.nombre || "")))
        genericos.push({ empresa: e, id: c.cliente_switch_id, codigo: cod, nombre: c.nombre });
    }
  }
  console.log("── TCKCTA por empresa (switch_clientes) ──");
  for (const e of B2B) console.log(`  ${e.padEnd(15)} id=${String(tck[e]?.id ?? "—").padEnd(6)} "${tck[e]?.nombre ?? "NO EXISTE"}"`);

  console.log("\n── Clientes con NOMBRE genérico (CONTADO/VENTAS/VENTAS LOCA*) ──");
  for (const g of genericos)
    console.log(`  ${g.empresa.padEnd(15)} id=${String(g.id).padEnd(6)} codigo=${g.codigo.padEnd(10)} "${g.nombre}"  ${g.codigo === "TCKCTA" ? "" : "🔴 NO ES TCKCTA"}`);

  // 2. Facturas 2026 del grupo, paginado
  console.log("\n── switch_facturas 2026 (paginado) ──");
  const porEmpresaTck: Record<string, number> = {};
  const porNombreGenerico: Record<string, number> = {};   // nombre_norm -> monto (todo el grupo)
  const genericoNoTck: Record<string, number> = {};       // "empresa|nombre" cuyo id NO es el TCKCTA
  const tipos = new Set<string>();
  let filas = 0;
  for (const e of B2B) {
    let desde = 0;
    for (;;) {
      const { data, error } = await db.from("switch_facturas")
        .select("empresa_key, cliente_switch_id, cliente_nombre, tipo_comprobante, subtotal_descuento, fecha")
        .eq("empresa_key", e)
        .gte("fecha", "2026-01-01").lt("fecha", "2027-01-01")
        .order("fecha", { ascending: true }).order("id", { ascending: true })
        .range(desde, desde + 999);
      if (error) throw error;
      const lote = data ?? [];
      for (const f of lote) {
        filas++;
        tipos.add(f.tipo_comprobante);
        const signo = SIGNO[f.tipo_comprobante] ?? 0;
        const monto = signo * Number(f.subtotal_descuento ?? 0);
        if (tck[e] && f.cliente_switch_id === tck[e].id) porEmpresaTck[e] = (porEmpresaTck[e] ?? 0) + monto;
        const n = norm(f.cliente_nombre ?? "");
        if (["CONTADO","VENTAS","VENTAS LOCALES","VENTAS LOCA"].includes(n)) {
          porNombreGenerico[n] = (porNombreGenerico[n] ?? 0) + monto;
          if (!tck[e] || f.cliente_switch_id !== tck[e].id)
            genericoNoTck[`${e}|${n}|id${f.cliente_switch_id}`] = (genericoNoTck[`${e}|${n}|id${f.cliente_switch_id}`] ?? 0) + monto;
        }
      }
      if (lote.length < 1000) break;
      desde += 1000;
    }
  }
  console.log(`  filas leídas: ${filas} · tipos: ${[...tipos].join(", ")}`);

  console.log("\n── MOSTRADOR 2026 por empresa (por CÓDIGO TCKCTA) ──");
  let total = 0;
  for (const e of B2B) {
    const v = porEmpresaTck[e] ?? 0; total += v;
    console.log(`  ${e.padEnd(15)} ${v.toFixed(2).padStart(14)}`);
  }
  console.log(`  ${"TOTAL".padEnd(15)} ${total.toFixed(2).padStart(14)}`);

  console.log("\n── Por NOMBRE normalizado (lo que el filtro SQL saca hoy) ──");
  for (const [n, v] of Object.entries(porNombreGenerico)) console.log(`  ${n.padEnd(18)} ${v.toFixed(2).padStart(14)}`);

  console.log("\n── Facturas con nombre genérico cuyo id NO es el TCKCTA de esa empresa ──");
  const sueltos = Object.entries(genericoNoTck);
  if (sueltos.length === 0) console.log("  (ninguna) ✅ nombre genérico ⇔ TCKCTA");
  else for (const [k, v] of sueltos) console.log(`  🔴 ${k.padEnd(45)} ${v.toFixed(2).padStart(14)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
