// ============================================================================
// REVERSA 12-ago-2026 — Joybees NO se cierra. Daniel, textual: "cuando te dije
// cerrarlo?". El movimiento de esa noche (`_mover-reportado-mid2026.ts`) había
// creado un período CERRADO propio para J ("mid 2026") y sellado ahí su única
// entrega ($1.540, La Frontera Duty Free). Eso fue una deducción del encargo,
// no una orden — se deshace acá, dejando a J EXACTAMENTE como estaba:
//
//   · el sello de la entrega vuelve al período ABIERTO de J ("Período 2026",
//     1eaecba0-036d-4746-9722-766629c6f65c — el id está en el respaldo
//     mover-respaldo-periodos-y-sellos-2026-08-12.json).
//   · el período cerrado de J se BORRA (quedó sin ningún sello adentro; se
//     verifica antes de borrar).
//
// Lo de TH y CK NO se toca: eso sí estaba aprobado y queda.
//
// Uso (dry-run por defecto):
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/_revertir-cierre-joybees.ts [--ejecutar]
// ============================================================================
import { createClient } from "@supabase/supabase-js";

const EJECUTAR = process.argv.includes("--ejecutar");

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const ENTREGA_J = "5fbdcd92-a3c7-4cbb-a02a-04189b97976f"; // La Frontera Duty Free, $1.540

async function main() {
  console.log(`═══ REVERSA: Joybees NO se cierra · ${EJECUTAR ? "🔴 EJECUTAR" : "dry-run"} ═══\n`);

  const { data: periodos, error: e1 } = await sb
    .from("mk_periodos")
    .select("id, proveedor_key, nombre, estado, cerrado_en")
    .eq("proveedor_key", "J");
  if (e1) throw new Error(e1.message);

  const abierto = (periodos ?? []).find((p) => p.estado === "abierto");
  const cerrado = (periodos ?? []).find((p) => p.estado === "cerrado");
  console.log(`Períodos de J: ${(periodos ?? []).map((p) => `${p.estado}·"${p.nombre}"·${p.id}`).join(" · ") || "ninguno"}`);
  if (!abierto) throw new Error("J no tiene período abierto — PARAR");
  if (!cerrado) {
    console.log("🟢 No hay período cerrado de J — la reversa ya está hecha (o nunca se ejecutó). Nada que hacer.");
    return;
  }

  const { data: sellos, error: e2 } = await sb
    .from("mk_periodo_documentos")
    .select("periodo_id, proveedor_key, tipo, documento_id")
    .eq("proveedor_key", "J");
  if (e2) throw new Error(e2.message);
  console.log(`Sellos de J: ${(sellos ?? []).map((s) => `${s.tipo} ${s.documento_id} → ${s.periodo_id}`).join(" · ") || "ninguno"}`);

  const selloEntrega = (sellos ?? []).find(
    (s) => s.tipo === "entrega" && String(s.documento_id) === ENTREGA_J,
  );
  if (!selloEntrega) throw new Error(`No encuentro el sello de la entrega ${ENTREGA_J} — PARAR`);

  const plan: string[] = [];
  if (String(selloEntrega.periodo_id) === String(cerrado.id)) {
    plan.push(`UPDATE sello entrega ${ENTREGA_J} (J): ${cerrado.id} → ${abierto.id} (el abierto "Período 2026")`);
  } else if (String(selloEntrega.periodo_id) === String(abierto.id)) {
    console.log("  (el sello ya apunta al abierto — no se toca)");
  } else {
    throw new Error(`El sello apunta a un período inesperado (${selloEntrega.periodo_id}) — PARAR`);
  }

  // El cerrado se borra SOLO si no le queda ningún sello (de ninguna marca).
  const { data: sellosDelCerrado, error: e3 } = await sb
    .from("mk_periodo_documentos")
    .select("documento_id")
    .eq("periodo_id", cerrado.id);
  if (e3) throw new Error(e3.message);
  const quedan = (sellosDelCerrado ?? []).length - (String(selloEntrega.periodo_id) === String(cerrado.id) ? 1 : 0);
  if (quedan > 0) throw new Error(`El cerrado de J tiene ${quedan} sello(s) ajenos — PARAR`);
  plan.push(`DELETE mk_periodos ${cerrado.id} (cerrado "${cerrado.nombre}" de J, sin sellos)`);

  console.log("\nPLAN:");
  for (const p of plan) console.log(`  · ${p}`);

  if (!EJECUTAR) {
    console.log("\nDry-run: no se escribió nada. Ejecutar con --ejecutar.");
    return;
  }

  console.log("\n═══ ESCRIBIENDO ═══");
  if (String(selloEntrega.periodo_id) === String(cerrado.id)) {
    const { data, error } = await sb
      .from("mk_periodo_documentos")
      .update({ periodo_id: abierto.id })
      .eq("tipo", "entrega")
      .eq("documento_id", ENTREGA_J)
      .eq("proveedor_key", "J")
      .select("periodo_id");
    if (error) throw new Error(`update sello: ${error.message}`);
    if ((data ?? []).length !== 1) throw new Error(`update sello tocó ${(data ?? []).length} filas`);
    console.log("  ✏️  sello de la entrega devuelto al abierto de J");
  }
  {
    const { error } = await sb.from("mk_periodos").delete().eq("id", cerrado.id).eq("proveedor_key", "J").eq("estado", "cerrado");
    if (error) throw new Error(`delete período: ${error.message}`);
    console.log(`  🗑️  período cerrado de J eliminado (${cerrado.id})`);
  }

  // Verificación: J quedó EXACTAMENTE como en el respaldo.
  const { data: pf } = await sb.from("mk_periodos").select("id, estado, nombre").eq("proveedor_key", "J");
  const { data: sf } = await sb.from("mk_periodo_documentos").select("periodo_id, tipo, documento_id").eq("proveedor_key", "J");
  const okP = (pf ?? []).length === 1 && pf![0].estado === "abierto" && String(pf![0].id) === String(abierto.id);
  const okS = (sf ?? []).length === 1 && String(sf![0].periodo_id) === String(abierto.id) && String(sf![0].documento_id) === ENTREGA_J;
  console.log(`\n${okP && okS ? "🟢 J quedó exactamente como estaba: 1 período abierto, 1 sello a ese abierto." : "🔴 J NO quedó como el respaldo — revisar a mano"}`);
  process.exit(okP && okS ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
