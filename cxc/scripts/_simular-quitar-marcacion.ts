/* ─────────────────────────────────────────────────────────────────────────────
 * SOLO LECTURA — simula QUITAR una marcación y dice qué le pasa al día.
 *
 * 🔴 NO ESCRIBE NADA. Lee las marcaciones de un colaborador en un día, arma la
 * corrección `quita` EN MEMORIA y vuelve a pasar el día por `aplicarCorrecciones`
 * y por la regla del cierre (`marcas-impares.ts`), para poder decir antes de
 * tocar producción: «este día pasa de 5 marcas a 4 y deja de frenar el cierre».
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_simular-quitar-marcacion.ts 21 2026-08-26 14:23:39
 * ────────────────────────────────────────────────────────────────────────── */

async function main() {
  const { supabaseServer } = await import("@/lib/supabase-server");
  const { aplicarCorrecciones, horaPanamaConSegundos } = await import("@/lib/asistencia/correcciones");
  const { marcasMalContadas } = await import("@/lib/asistencia/marcas-impares");
  const { marcasPegadas, cabenEnLasCuatroColumnas, marcasEscondidas } =
    await import("@/lib/asistencia/marcas-del-dia");

  const codigo = process.argv[2] ?? "21";
  const fecha = process.argv[3] ?? "2026-08-26";
  const hora = process.argv[4] ?? "14:23:39";

  const { data, error } = await supabaseServer
    .from("asistencia_marcaciones")
    .select("id, empleado_codigo, ocurrio_en")
    .eq("empleado_codigo", codigo)
    .gte("ocurrio_en", `${fecha}T00:00:00-05:00`)
    .lte("ocurrio_en", `${fecha}T23:59:59-05:00`)
    .order("ocurrio_en", { ascending: true });
  if (error) throw new Error(error.message);

  const marcaciones = (data ?? []) as Array<{ id: string; empleado_codigo: string; ocurrio_en: string }>;
  const antes = marcaciones.map((m) => horaPanamaConSegundos(m.ocurrio_en));
  console.log(`ANTES · colaborador ${codigo} · ${fecha}`);
  console.log(`  marcas (${antes.length}): ${antes.join("  ")}`);
  console.log(`  ¿entran en las 4 columnas?  ${cabenEnLasCuatroColumnas(antes.length) ? "sí" : `NO — se escondían ${marcasEscondidas(antes.length).map((i) => antes[i]).join(", ")}`}`);
  console.log(`  pegadas: ${marcasPegadas(antes).map((p) => `${antes[p.idx]} (${p.segundos} s después)`).join(" · ") || "ninguna"}`);
  console.log(`  ¿frena el cierre?  ${marcasMalContadas(antes.length) ? "SÍ" : "no"}`);

  const objetivo = marcaciones.find((m) => horaPanamaConSegundos(m.ocurrio_en) === hora);
  if (!objetivo) {
    console.log(`\n⚠️ Ese día no tiene ninguna marcación a las ${hora}. No se simula nada.`);
    return;
  }

  // 🔴 EN MEMORIA. Esta fila NO se inserta: es exactamente la que escribiría
  // `POST /api/asistencia/correcciones` con `quita: true`.
  const { marcaciones: efectivas, porDia } = aplicarCorrecciones(marcaciones, [{
    id: "simulada",
    marcacionId: objetivo.id,
    empleadoCodigo: codigo,
    fecha,
    hora: "",
    motivo: "simulación, no se escribió nada",
    creadaPor: "simulación",
    creadaEn: new Date().toISOString(),
    quita: true,
  }]);

  const despues = efectivas.map((m) => horaPanamaConSegundos(String(m.ocurrio_en)));
  console.log(`\nDESPUÉS de quitar ${hora} (SIN escribir nada)`);
  console.log(`  marcas (${despues.length}): ${despues.join("  ")}`);
  console.log(`  ¿entran en las 4 columnas?  ${cabenEnLasCuatroColumnas(despues.length) ? "sí" : "no"}`);
  console.log(`  ¿frena el cierre?  ${marcasMalContadas(despues.length) ? "SÍ" : "no"}`);
  const vistas = porDia.get(`${codigo}|${fecha}`) ?? [];
  console.log(`  lo que diría la pantalla: ${vistas.map((c) => `marcación ${c.quitada ? "quitada" : "corregida"} ${c.hora}`).join(" · ")}`);
  console.log(`\n🔴 La tabla asistencia_marcaciones NO se tocó: sigue teniendo ${marcaciones.length} filas ese día.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
