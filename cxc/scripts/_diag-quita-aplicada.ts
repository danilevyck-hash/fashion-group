/* SOLO LECTURA — ¿la columna `quita` de asistencia_correcciones ya existe en
 * producción? (migración 20261128120000). No escribe nada. */
async function main() {
  const { supabaseServer } = await import("@/lib/supabase-server");
  const { data, error } = await supabaseServer
    .from("asistencia_correcciones")
    .select("id, marcacion_id, fecha, hora, quita, motivo, creada_por, anulada_en")
    .order("creada_en", { ascending: false })
    .limit(20);
  if (error) {
    console.log("ERROR:", error.code, error.message);
    return;
  }
  const filas = (data ?? []) as Array<Record<string, unknown>>;
  console.log(`columna quita: EXISTE · ${filas.length} correcciones recientes`);
  for (const f of filas) {
    console.log(
      `  ${String(f.fecha)} · marcacion=${f.marcacion_id ? "sí" : "NO"} · hora=${f.hora ?? "NULL"}`
      + ` · quita=${f.quita} · anulada=${f.anulada_en ? "sí" : "no"} · "${f.motivo}" · ${f.creada_por}`,
    );
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
