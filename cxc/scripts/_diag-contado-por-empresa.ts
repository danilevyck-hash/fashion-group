// ─────────────────────────────────────────────────────────────────────────────
// SOLO LECTURA. ¿A QUÉ CLIENTE VA UNA VENTA DE MOSTRADOR, EN CADA EMPRESA?
//
// 🩸 POR QUÉ SE PREGUNTA. El checkout tenía escrito a mano `Contado = id 1`, y
// el id 1 NO se llama igual en las cuatro: active_shoes "Contado" ·
// joystep "Contado" · fashion_shoes "VENTAS LOCA" · vistana "VENTAS". Antes de
// derivar la opción del código TCKCTA hay que confirmar que ese cliente es DE
// VERDAD el mostrador de esa empresa y no uno que se llama parecido: mandar una
// venta al cliente equivocado en Switch es peor que el problema que se arregla.
//
// Qué mira, por empresa:
//   1. El cliente con código TCKCTA (el que ya usa el link público).
//   2. Si el id 1 y el TCKCTA son el MISMO (o sea, si el cambio mueve algo).
//   3. Cuántos OTROS clientes podrían confundirse con el mostrador
//      (nombre con contado/mostrador/ventas/caja/público).
//   4. Cuánta facturación real tiene cada candidato en switch_facturas — el
//      mostrador de verdad es el que factura todos los días.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/_diag-contado-por-empresa.ts
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

const EMPRESAS = [
  { marca: "reebok", empresa: "active_shoes" },
  { marca: "joybees", empresa: "joystep" },
  { marca: "tommy", empresa: "fashion_shoes" },
  { marca: "calvin", empresa: "vistana" },
];

const PARECIDOS = /contado|mostrador|ventas|caja|publico|público|caja|counter/i;

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  let bloqueo = false;

  for (const e of EMPRESAS) {
    console.log(`\n${"═".repeat(74)}\n${e.marca.toUpperCase()}  ·  ${e.empresa}\n${"═".repeat(74)}`);

    const { data: todos, error } = await db
      .from("switch_clientes")
      .select("cliente_switch_id, codigo, nombre")
      .eq("empresa_key", e.empresa);
    if (error) { console.log(`  ERROR ${error.message}`); bloqueo = true; continue; }
    const filas = todos ?? [];

    const tck = filas.filter((c) => (c.codigo || "").trim().toUpperCase() === "TCKCTA");
    const id1 = filas.find((c) => c.cliente_switch_id === 1);

    if (tck.length === 0) {
      console.log("  🔴 NO existe cliente con código TCKCTA — PARAR");
      bloqueo = true;
    } else if (tck.length > 1) {
      console.log(`  🔴 HAY ${tck.length} clientes con código TCKCTA — ambiguo, PARAR`);
      bloqueo = true;
    } else {
      console.log(`  TCKCTA → id=${tck[0].cliente_switch_id}  "${tck[0].nombre}"`);
    }
    console.log(`  id 1   → ${id1 ? `"${id1.nombre}" (código ${id1.codigo})` : "no existe"}`);
    const mueve = tck.length === 1 && tck[0].cliente_switch_id !== 1;
    console.log(`  ¿el cambio mueve el destino? ${mueve ? "🔴 SÍ" : "✅ NO (mismo id que antes)"}`);

    // Otros que se le podrían confundir.
    const candidatos = filas.filter(
      (c) => PARECIDOS.test(c.nombre || "") && (c.codigo || "").trim().toUpperCase() !== "TCKCTA",
    );
    console.log(`  otros nombres parecidos a "mostrador": ${candidatos.length}`);
    for (const c of candidatos.slice(0, 12)) {
      console.log(`      id=${String(c.cliente_switch_id).padStart(5)}  ${(c.codigo || "—").padEnd(10)} "${c.nombre}"`);
    }

    // ¿Cuál factura de verdad? El mostrador real vende todos los días.
    const aMirar = [...tck, ...candidatos].slice(0, 14);
    if (aMirar.length) {
      console.log("  facturación real (switch_facturas):");
      for (const c of aMirar) {
        // ⚠️ La columna es `cliente_switch_id`. El primer intento preguntó por
        // `cliente_id` —que no existe— y devolvió 0 en las 4 empresas SIN
        // error visible: un cero que parecía un dato y no era ninguno.
        const { count, error: errF } = await db
          .from("switch_facturas")
          .select("id", { count: "exact", head: true })
          .eq("empresa_key", e.empresa)
          .eq("cliente_switch_id", c.cliente_switch_id);
        if (errF) { console.log(`      id=${c.cliente_switch_id}: ERROR ${errF.message}`); bloqueo = true; continue; }
        const marca = (c.codigo || "").trim().toUpperCase() === "TCKCTA" ? "◄ TCKCTA" : "";
        console.log(`      id=${String(c.cliente_switch_id).padStart(5)}  ${String(count ?? 0).padStart(7)} facturas  "${c.nombre}" ${marca}`);
      }
    }
  }

  console.log(`\n${"═".repeat(74)}`);
  console.log(bloqueo ? "🔴 HAY QUE PARAR: alguna empresa no tiene un mostrador claro." : "🟢 Las 4 empresas tienen un mostrador único e identificable.");
  process.exit(bloqueo ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
