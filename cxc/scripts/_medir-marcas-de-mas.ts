/* ─────────────────────────────────────────────────────────────────────────────
 * SOLO LECTURA — cuántas marcas tiene cada día-persona y qué tan pegadas están.
 *
 * Nació el 18-sep-2026 para medir el problema que la contadora reportó por
 * WhatsApp el 17-sep: *«el motivo de que no me deja cerrar es porque hay
 * marcaciones de mas y no me deja eliminar»*. Sirve para dos cosas:
 *
 *   · saber cuántos días tienen más de 4 marcas (los que la pantalla y el Excel
 *     no mostraban enteros), y
 *   · calibrar el umbral de «marcas pegadas» de `marcas-del-dia.ts` con las
 *     brechas REALES entre marcas consecutivas, no con un número inventado.
 *
 * 🔴 No escribe nada en ningún lado.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_medir-marcas-de-mas.ts 2026-08-26 2026-09-10
 * ────────────────────────────────────────────────────────────────────────── */

async function main() {
  const { supabaseServer } = await import("@/lib/supabase-server");
  const { leerTodoPaginado } = await import("@/lib/supabase-paginado");
  const desde = process.argv[2] ?? "2026-08-26";
  const hasta = process.argv[3] ?? "2026-09-10";
  const filas = await leerTodoPaginado<{ id: string; empleado_codigo: string; ocurrio_en: string }>(
    "asistencia_marcaciones",
    (pedirCount, from, to) =>
      supabaseServer
        .from("asistencia_marcaciones")
        .select("id, empleado_codigo, ocurrio_en", pedirCount ? { count: "exact" } : {})
        .gte("ocurrio_en", `${desde}T00:00:00-05:00`)
        .lte("ocurrio_en", `${hasta}T23:59:59-05:00`)
        .order("ocurrio_en", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
  );

  const seg = (iso: string) => {
    const d = new Date(Date.parse(iso) - 5 * 3600_000);
    return d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
  };
  const dia = (iso: string) =>
    new Date(Date.parse(iso) - 5 * 3600_000).toISOString().slice(0, 10);

  const porDia = new Map<string, number[]>();
  for (const f of filas) {
    const k = `${String(f.empleado_codigo).trim()}|${dia(f.ocurrio_en)}`;
    const l = porDia.get(k) ?? [];
    l.push(seg(f.ocurrio_en));
    porDia.set(k, l);
  }

  const hist = new Map<number, number>();
  let impares = 0;
  let masDe4 = 0;
  const brechas: number[] = [];
  const ejemplos: string[] = [];
  const p2 = (x: number) => String(x).padStart(2, "0");
  const h = (s: number) => `${p2(Math.floor(s / 3600))}:${p2(Math.floor((s % 3600) / 60))}:${p2(s % 60)}`;

  for (const [k, l] of porDia) {
    l.sort((a, b) => a - b);
    hist.set(l.length, (hist.get(l.length) ?? 0) + 1);
    if (l.length % 2 === 1) impares += 1;
    if (l.length > 4) {
      masDe4 += 1;
      for (let i = 1; i < l.length; i++) brechas.push(l[i] - l[i - 1]);
      ejemplos.push(`${k} → ${l.map(h).join("  ")}`);
    }
  }

  console.log(`ventana ${desde} → ${hasta} · ${filas.length} marcaciones · ${porDia.size} días-persona`);
  console.log(
    "marcas por día:",
    [...hist.entries()].sort((a, b) => a[0] - b[0]).map(([n, c]) => `${n}→${c}`).join(" "),
  );
  console.log(`impares: ${impares} · más de 4: ${masDe4}`);
  brechas.sort((a, b) => a - b);
  console.log("brechas entre marcas consecutivas de los días de +4 (seg), las 30 menores:");
  console.log("  " + brechas.slice(0, 30).join(" "));
  console.log(
    `  ≤30 s: ${brechas.filter((b) => b <= 30).length} · ≤60 s: ${brechas.filter((b) => b <= 60).length}`
    + ` · ≤120 s: ${brechas.filter((b) => b <= 120).length} · ≤300 s: ${brechas.filter((b) => b <= 300).length}`
    + ` · total: ${brechas.length}`,
  );
  // Cuántos de los días de +4 tienen AL MENOS UN par pegado, según el umbral.
  for (const u of [3, 30, 60, 120, 180, 300, 600]) {
    let conPar = 0;
    for (const [, l] of porDia) {
      if (l.length <= 4) continue;
      let hay = false;
      for (let i = 1; i < l.length; i++) if (l[i] - l[i - 1] <= u) hay = true;
      if (hay) conPar += 1;
    }
    console.log(`  con un par a ≤ ${u} s: ${conPar} de ${masDe4} días de más de 4 marcas`);
  }
  // 🔴 «quiero saber todos los que marcaron 5 veces last 30 days» — Daniel,
  // 18-sep-2026. Quién, cuántos días, y con nombre.
  const { data: fichas } = await supabaseServer
    .from("asistencia_personas")
    // ⚠️ La columna es `empleado_codigo`, NO `codigo` (trampa transversal de
    // CLAUDE.md: mirar las columnas reales antes de dar un dato por perdido).
    .select("empleado_codigo, nombre");
  const nombre = new Map(
    ((fichas ?? []) as Array<{ empleado_codigo: string; nombre: string | null }>)
      .map((f) => [String(f.empleado_codigo).trim(), String(f.nombre ?? "").trim()]),
  );
  const porPersona = new Map<string, number>();
  for (const [k, l] of porDia) {
    if (l.length <= 4) continue;
    const cod = k.split("|")[0];
    porPersona.set(cod, (porPersona.get(cod) ?? 0) + 1);
  }
  console.log(`quiénes marcaron 5 o más: ${porPersona.size} colaboradores`);
  for (const [cod, n] of [...porPersona.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cod} ${nombre.get(cod) || "(sin ficha)"} — ${n} ${n === 1 ? "día" : "días"}`);
  }

  console.log("los días de más de 4 marcas:");
  for (const e of ejemplos) console.log("  " + e);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
