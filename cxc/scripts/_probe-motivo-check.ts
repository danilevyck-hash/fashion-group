/* ─────────────────────────────────────────────────────────────────────────────
 * ¿LA BASE ACEPTA EL MOTIVO NUEVO? — probe contra producción.
 *
 * Las migraciones dicen que `asistencia_justificaciones.motivo` es un `text NOT
 * NULL` sin CHECK (`20260805120000_asistencia_reglas.sql`), o sea que no haría
 * falta ninguna DDL. Pero "las migraciones dicen" no es "la base hace": este
 * probe lo COMPRUEBA insertando el valor nuevo de verdad.
 *
 * ⚠️ ESCRIBE UNA FILA Y LA BORRA. Es la única forma de saberlo: PostgREST no
 * expone `information_schema`, así que no hay manera de leer los CHECK.
 *   · El código de empleado es un centinela imposible (`__PROBE_MOTIVO__`) que
 *     no le pertenece a nadie.
 *   · Las fechas son de 1900, fuera de cualquier rango que alguna pantalla pida.
 *   · Se borra por `id` inmediatamente después, y se VERIFICA que se borró.
 *   · Si el borrado fallara, se avisa a los gritos con el id para limpiarlo.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_probe-motivo-check.ts
 * ────────────────────────────────────────────────────────────────────────── */

import { createClient } from "@supabase/supabase-js";
import { MOTIVOS_JUSTIFICACION } from "@/lib/asistencia/motivos";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const CENTINELA = "__PROBE_MOTIVO__";

async function main() {
  const antes = await db.from("asistencia_justificaciones").select("id", { count: "exact", head: false });
  console.log(`Filas en asistencia_justificaciones antes del probe: ${(antes.data ?? []).length}`);

  let fallas = 0;
  // Se prueban TODOS los motivos, no solo el nuevo: si algún día apareciera un
  // CHECK, esto dice exactamente cuáles pasan y cuáles no.
  for (const motivo of MOTIVOS_JUSTIFICACION) {
    const { data, error } = await db.from("asistencia_justificaciones").insert({
      empleado_codigo: CENTINELA,
      desde: "1900-01-01",
      hasta: "1900-01-01",
      motivo,
      nota: "probe automático — se borra solo",
      registrado_por: "_probe-motivo-check",
    }).select("id").single();

    if (error) {
      fallas += 1;
      console.log(`  🔴 «${motivo}» RECHAZADO: ${error.message}`);
      continue;
    }
    console.log(`  🟢 «${motivo}» aceptado`);

    const del = await db.from("asistencia_justificaciones").delete().eq("id", data.id);
    if (del.error) {
      console.log(`  🚨 NO PUDE BORRAR la fila del probe. id=${data.id} — hay que borrarla a mano.`);
      fallas += 1;
    }
  }

  // Verificación final: no puede quedar NI UNA fila del centinela.
  const { data: sobras } = await db.from("asistencia_justificaciones")
    .select("id, motivo").eq("empleado_codigo", CENTINELA);
  if ((sobras ?? []).length > 0) {
    console.log(`\n🚨 QUEDARON ${sobras!.length} filas del probe: ${JSON.stringify(sobras)}`);
    fallas += 1;
  } else {
    console.log(`\n🟢 No quedó ninguna fila del probe.`);
  }

  const despues = await db.from("asistencia_justificaciones").select("id");
  console.log(`Filas después del probe: ${(despues.data ?? []).length}`);
  console.log(
    fallas === 0
      ? `\n✅ La base acepta los ${MOTIVOS_JUSTIFICACION.length} motivos. NO hace falta DDL.`
      : `\n🔴 ${fallas} problema(s). Revisar.`,
  );
  if (fallas > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
