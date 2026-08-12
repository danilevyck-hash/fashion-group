// ============================================================================
// SOLO LECTURA — verifica el sello huérfano de mk_periodo_documentos antes de
// borrarlo (aprobado por Daniel, 12-ago-2026).
//
//   - La entrega de prueba fb4e8342-e993-4932-b9e3-ba40c90da72c fue BORRADA
//     hoy; su sello (tipo entrega, proveedor_key KL) quedó apuntando a nada.
//   - Este script confirma: (1) la entrega NO existe, (2) el sello SÍ existe,
//     y lo imprime completo para el respaldo JSON.
//
// Uso:
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/_verif-sello-huerfano-kl.ts
// ============================================================================
import { createClient } from "@supabase/supabase-js";

const DOCUMENTO_ID = "fb4e8342-e993-4932-b9e3-ba40c90da72c";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

async function main() {
  const { data: entrega, error: eErr } = await sb
    .from("mk_entregas_muebles")
    .select("id, total, notas, created_at")
    .eq("id", DOCUMENTO_ID)
    .maybeSingle();
  if (eErr) throw new Error(`mk_entregas_muebles: ${eErr.message}`);

  const { data: sellos, error: sErr } = await sb
    .from("mk_periodo_documentos")
    .select("*")
    .eq("tipo", "entrega")
    .eq("documento_id", DOCUMENTO_ID);
  if (sErr) throw new Error(`mk_periodo_documentos: ${sErr.message}`);

  console.log("entrega existe:", entrega ? "SÍ (⛔ NO BORRAR EL SELLO)" : "NO (borrada, como se esperaba)");
  console.log("sellos encontrados:", (sellos ?? []).length);
  console.log(JSON.stringify(sellos ?? [], null, 2));

  const ok = !entrega && (sellos ?? []).length > 0;
  console.log(ok ? "🟢 CONDICIONES CUMPLIDAS para borrar" : "🔴 NO borrar — condiciones no cumplidas");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
