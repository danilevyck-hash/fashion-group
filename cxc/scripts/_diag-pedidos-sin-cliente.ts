// ─────────────────────────────────────────────────────────────────────────────
// SOLO LECTURA. Mide, contra producción, el agujero del cliente en los pedidos
// de catálogo: cuántos salieron (o pueden salir) a Switch sin un cliente que
// alguien haya elegido a propósito.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/_diag-pedidos-sin-cliente.ts
//
// No escribe nada. Una consulta por tabla — la base va en compute Micro.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const MARCAS = [
  { marca: "reebok", tabla: "reebok_orders", empresa: "active_shoes" },
  { marca: "joybees", tabla: "joybees_orders", empresa: "joystep" },
  { marca: "tommy", tabla: "tommy_orders", empresa: "fashion_shoes" },
  { marca: "calvin", tabla: "calvin_orders", empresa: "vistana" },
];

interface Fila {
  order_number: string;
  client_name: string | null;
  status: string;
  total: number | null;
  cliente_switch_id: number | null;
  origen_original?: string | null;
  origen_short_id?: string | null;
  deleted?: boolean | null;
}

async function main() {
  console.log("═══ 1. CLIENTE DE CONTADO (código TCKCTA) POR EMPRESA ═══\n");
  for (const m of MARCAS) {
    const { data, error } = await db
      .from("switch_clientes")
      .select("cliente_switch_id, codigo, nombre")
      .eq("empresa_key", m.empresa)
      .eq("codigo", "TCKCTA")
      .maybeSingle();
    if (error) console.log(`  ${m.marca.padEnd(8)} ${m.empresa.padEnd(14)} ERROR ${error.message}`);
    else if (!data) console.log(`  ${m.marca.padEnd(8)} ${m.empresa.padEnd(14)} 🔴 NO EXISTE TCKCTA`);
    else console.log(`  ${m.marca.padEnd(8)} ${m.empresa.padEnd(14)} id=${data.cliente_switch_id} · "${data.nombre}"`);
  }

  console.log("\n═══ 2. PEDIDOS VIVOS SIN CLIENTE ELEGIDO ═══\n");
  let vivos = 0;
  let sinCliente = 0;
  let sinClienteConfirmados = 0;
  let montoConfirmado = 0;
  const grandes: { pedido: string; total: number; cliente: string; estado: string; origen: string }[] = [];
  const nulos: { pedido: string; cliente: string; estado: string; origen: string }[] = [];
  const links: { pedido: string; cliente: string; estado: string; clienteId: number | null }[] = [];

  for (const m of MARCAS) {
    let filas: Fila[] = [];
    for (const cols of [
      "order_number, client_name, status, total, cliente_switch_id, origen_original, origen_short_id, deleted",
      "order_number, client_name, status, total, cliente_switch_id, deleted",
    ]) {
      const { data, error } = await db.from(m.tabla).select(cols).limit(2000);
      if (!error) { filas = (data ?? []) as unknown as Fila[]; break; }
      if (cols.includes("origen_original")) continue;
      console.log(`  ${m.marca}: ERROR ${error.message}`);
    }
    // "Sin cliente real" = nadie eligió (null) O quedó en el cliente de
    // mostrador/contado de la empresa (id 1 = TCKCTA en las 4). El default
    // silencioso del checkout producía las dos formas.
    const activos = filas.filter((f) => f.deleted !== true);
    vivos += activos.length;
    const huerfanos = activos.filter((f) => f.cliente_switch_id == null || f.cliente_switch_id === 1);
    sinCliente += huerfanos.length;
    console.log(`  ${m.marca.padEnd(8)} vivos=${String(activos.length).padStart(3)}  sin cliente=${String(huerfanos.length).padStart(3)}`);
    for (const f of activos) {
      if (f.origen_original === "link" || f.origen_short_id) {
        links.push({ pedido: f.order_number, cliente: f.client_name || "—", estado: f.status, clienteId: f.cliente_switch_id });
      }
      if (f.cliente_switch_id == null) {
        nulos.push({
          pedido: f.order_number, cliente: f.client_name || "—", estado: f.status,
          origen: f.origen_original === "link" || f.origen_short_id ? "link público" : "interno",
        });
      }
    }
    for (const f of huerfanos) {
      const esLink = f.origen_original === "link" || !!f.origen_short_id;
      const origen = esLink ? "link público" : "interno";
      if (f.status === "confirmado") { sinClienteConfirmados++; montoConfirmado += Number(f.total || 0); }
      if (Number(f.total || 0) >= 1000) {
        grandes.push({ pedido: f.order_number, total: Number(f.total || 0), cliente: f.client_name || "—", estado: f.status, origen });
      }
    }
  }

  console.log(`\n  TOTAL vivos=${vivos} · sin cliente=${sinCliente} (${((sinCliente / (vivos || 1)) * 100).toFixed(0)}%)`);
  console.log(`  De esos, CONFIRMADOS (fueron a Switch): ${sinClienteConfirmados} · $${montoConfirmado.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

  console.log("\n═══ 3. LOS DE $1.000 O MÁS ═══\n");
  grandes.sort((a, b) => b.total - a.total);
  for (const g of grandes) {
    console.log(`  ${g.pedido.padEnd(10)} $${g.total.toFixed(2).padStart(10)}  ${g.estado.padEnd(11)} ${g.origen.padEnd(13)} "${g.cliente}"`);
  }

  console.log("\n═══ 4. NADIE ELIGIÓ NUNCA (cliente_switch_id = NULL) ═══\n");
  for (const f of nulos) {
    console.log(`  ${f.pedido.padEnd(10)} ${f.estado.padEnd(11)} ${f.origen.padEnd(13)} client_name="${f.cliente}"`);
  }

  console.log("\n═══ 5. PEDIDOS DEL LINK PÚBLICO (el texto libre es legítimo) ═══\n");
  if (links.length === 0) console.log("  (ninguno vivo hoy)");
  for (const f of links) {
    console.log(`  ${f.pedido.padEnd(10)} ${f.estado.padEnd(11)} cliente_switch_id=${String(f.clienteId).padEnd(5)} client_name="${f.cliente}"`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
