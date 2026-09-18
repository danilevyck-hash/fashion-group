/* ─────────────────────────────────────────────────────────────────────────────
 * SOLO LECTURA — qué cambia si la marca repetida (≤ X segundos de la última
 * que cuenta) se olvida sola. Nació el 18-sep-2026 para el encargo «la marca
 * repetida se olvida sola» (`lib/asistencia/marca-repetida.ts`).
 *
 * Corre el motor DOS veces sobre el mismo rango: con las marcas efectivas tal
 * cual («antes») y con las repetidas quitadas ANTES de entrar al motor
 * («después», con la misma regla que el motor aplica adentro). Mientras el
 * motor no tenía la regla, «antes» era lo que se veía en pantalla; desde que la
 * tiene, las dos corridas tienen que dar lo MISMO — y eso es una comprobación
 * de que la regla del motor y la del módulo son una sola.
 *
 * Imprime:
 *   · la tabla por umbral (1 · 2 · 30 · 60 · 300 s): marcas olvidadas, días de
 *     más de 4 que quedan en 4, los que siguen con más de 4, almuerzos que
 *     cambian;
 *   · para el umbral elegido, día por día: quién, qué marcó, cuánto exceso de
 *     almuerzo antes y después, y a cuánto equivale al valor del minuto de esa
 *     persona (rata ÷ 60) — que es lo que la contadora VE en el Excel del
 *     Reporte, NO lo que la planilla descuenta (el exceso de almuerzo no entra
 *     al dinero de la planilla);
 *   · si se movió ALGO MÁS que el exceso de almuerzo (tardanza, salida
 *     temprana, extra, trabajado, ausencia): eso sería un error;
 *   · cuántos días dejan de estar «a revisar»;
 *   · cuánto cae en quincenas con una planilla CERRADA en el sistema.
 *
 * 🔴 No escribe nada en ningún lado.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_medir-marca-repetida.ts [desde=2026-06-01] [hasta=ayer] [umbral=60]
 * ────────────────────────────────────────────────────────────────────────── */

async function main() {
  const { supabaseServer } = await import("@/lib/supabase-server");
  const { leerTodoPaginado } = await import("@/lib/supabase-paginado");
  const { armarReporte, diaPanama, segundosDelDia, esHabil } = await import("@/lib/asistencia/reporte");
  const { aplicarCorrecciones } = await import("@/lib/asistencia/correcciones");
  const { leerCorrecciones } = await import("@/lib/asistencia/correcciones-server");
  const {
    leerReglas, leerPersonas, vigenciasDeFilas, leerTrabajaAfuera, leerJustificaciones, leerVacaciones,
  } = await import("@/lib/asistencia/config-server");
  const { rataPorHora } = await import("@/lib/asistencia/config");
  const { hoyPanama } = await import("@/lib/fecha-panama");
  const { olvidarRepetidas, SEGUNDOS_MARCA_REPETIDA } = await import("@/lib/asistencia/marca-repetida");
  type MarcacionConId = import("@/lib/asistencia/correcciones").MarcacionConId;
  type HorarioPersona = import("@/lib/asistencia/reporte").HorarioPersona;
  type PersonaReporte = import("@/lib/asistencia/reporte").PersonaReporte;

  const hoy = hoyPanama();
  const ayer = new Date(Date.parse(`${hoy}T12:00:00Z`) - 86400_000).toISOString().slice(0, 10);
  const desde = process.argv[2] ?? "2026-06-01";
  const hasta = process.argv[3] ?? ayer;
  const umbral = Number(process.argv[4] ?? SEGUNDOS_MARCA_REPETIDA);
  // `--sin-correcciones` mide sobre las marcas CRUDAS del reloj, sin las
  // quitadas ni las agregadas a mano: es como se midió el encargo del 18-sep.
  // El motor NUNCA trabaja así; es solo para reproducir esa cuenta.
  const sinCorrecciones = process.argv.includes("--sin-correcciones");

  const PANAMA = "-05:00";
  const instante = (dia: string, fin: boolean) =>
    new Date(Date.parse(`${dia}T${fin ? "23:59:59.999" : "00:00:00.000"}${PANAMA}`)).toISOString();

  const marcaciones = await leerTodoPaginado<MarcacionConId>("marcaciones",
    (pedirCount, from, to) =>
      supabaseServer.from("asistencia_marcaciones")
        .select("id, empleado_codigo, empleado_nombre, ocurrio_en", pedirCount ? { count: "exact" } : {})
        .gte("ocurrio_en", instante(desde, false)).lte("ocurrio_en", instante(hasta, true))
        .order("ocurrio_en", { ascending: true }).order("id", { ascending: true }).range(from, to));

  const [{ reglas }, personasDb, afuera, correcciones, hRes, jRes, vRes, fRes, gRes] = await Promise.all([
    leerReglas(), leerPersonas(), leerTrabajaAfuera(), leerCorrecciones(desde, hasta),
    supabaseServer.from("asistencia_horarios").select("empleado_codigo, entrada, salida, almuerzo_minutos"),
    leerJustificaciones(desde, hasta), leerVacaciones(desde, hasta),
    supabaseServer.from("asistencia_feriados").select("fecha, nombre").gte("fecha", desde).lte("fecha", hasta),
    supabaseServer.from("asistencia_planilla_guardada").select("empresa, desde, hasta, estado, corte"),
  ]);
  if (hRes.error) throw new Error(hRes.error.message);
  if (fRes.error) throw new Error(fRes.error.message);
  if (gRes.error) throw new Error(gRes.error.message);

  const horarios = (hRes.data ?? []).map((h) => ({
    ...h, entrada: String(h.entrada).slice(0, 5), salida: String(h.salida).slice(0, 5),
  })) as HorarioPersona[];
  const vigencias = vigenciasDeFilas(personasDb.filas);
  const nombres = new Map<string, string>();
  const ficha = new Map<string, { salario: number | null; jornada: number | null; empresa: string | null }>();
  for (const f of personasDb.filas) {
    const cod = String(f.empleado_codigo);
    if (f.nombre) nombres.set(cod, String(f.nombre));
    ficha.set(cod, {
      salario: f.salario_mensual === null ? null : Number(f.salario_mensual),
      jornada: f.jornada_semanal === null || f.jornada_semanal === undefined ? null : Number(f.jornada_semanal),
      empresa: f.empresa ?? null,
    });
  }
  const efectivas = aplicarCorrecciones(marcaciones, sinCorrecciones ? [] : correcciones.correcciones);
  if (sinCorrecciones) console.log("⚠️ --sin-correcciones: marcas crudas del reloj, sin quitadas ni agregadas a mano");

  // ── Las marcas por persona-día, ya con las correcciones encima ─────────────
  const porDia = new Map<string, MarcacionConId[]>();
  for (const m of efectivas.marcaciones) {
    const cod = (m.empleado_codigo ?? "").trim();
    if (!cod || !m.ocurrio_en) continue;
    const k = `${cod}|${diaPanama(m.ocurrio_en)}`;
    const l = porDia.get(k) ?? [];
    l.push(m);
    porDia.set(k, l);
  }
  for (const l of porDia.values()) l.sort((a, b) => segundosDelDia(a.ocurrio_en) - segundosDelDia(b.ocurrio_en));

  /** Las marcaciones que quedarían con el umbral dado (la misma regla del motor). */
  function conRepetidasOlvidadas(u: number): { lista: MarcacionConId[]; olvidadas: number; diasA4: number; siguenMasDe4: number } {
    const lista: MarcacionConId[] = [];
    let olvidadas = 0; let diasA4 = 0; let siguenMasDe4 = 0;
    for (const l of porDia.values()) {
      const segs = l.map((m) => segundosDelDia(m.ocurrio_en));
      const r = olvidarRepetidas(segs, u);
      olvidadas += r.olvidadas.length;
      if (l.length > 4 && r.buenas.length === 4) diasA4 += 1;
      if (r.buenas.length > 4) siguenMasDe4 += 1;
      // `buenas` sale en el MISMO orden que `segs`: se recorre con un puntero.
      // Así una repetida del MISMO segundo que la buena saca UNA, no las dos.
      let bi = 0;
      for (let i = 0; i < l.length; i++) {
        if (bi < r.buenas.length && r.buenas[bi] === segs[i]) { lista.push(l[i]); bi += 1; }
      }
    }
    return { lista, olvidadas, diasA4, siguenMasDe4 };
  }

  const feriados = new Map((fRes.data ?? []).map((f) => [String(f.fecha), String(f.nombre)]));
  const correr = (lista: readonly MarcacionConId[]) => armarReporte({
    marcaciones: lista, horarios, justificaciones: jRes.filas, vacaciones: vRes.filas, feriados,
    desde, hasta, reglas, nombres, incluirNoHabiles: true, diaEnCurso: hoy,
    correccionesPorDia: efectivas.porDia, trabajaAfuera: afuera, vigencias,
  });

  const indexar = (ps: PersonaReporte[]) => {
    const idx = new Map<string, PersonaReporte["dias"][number]>();
    for (const p of ps) for (const d of p.dias) idx.set(`${p.codigo}|${d.fecha}`, d);
    return idx;
  };

  const antes = indexar(correr(efectivas.marcaciones));
  console.log(`rango ${desde} → ${hasta} · ${marcaciones.length} marcaciones · ${porDia.size} días-persona con marca`);
  const hist = new Map<number, number>();
  for (const l of porDia.values()) hist.set(l.length, (hist.get(l.length) ?? 0) + 1);
  console.log("marcas por día:", [...hist.entries()].sort((a, b) => a[0] - b[0]).map(([n, c]) => `${n}→${c}`).join(" "));
  console.log(`con exactamente 4: ${hist.get(4) ?? 0} · con más de 4: ${[...hist.entries()].filter(([n]) => n > 4).reduce((a, [, c]) => a + c, 0)} · impares: ${[...hist.entries()].filter(([n]) => n % 2 === 1).reduce((a, [, c]) => a + c, 0)}`);

  console.log("\numbral | marcas olvidadas | días +4 que quedan en 4 | siguen con +4 | almuerzos que cambian");
  for (const u of [1, 2, 30, 60, 300]) {
    const r = conRepetidasOlvidadas(u);
    const despues = indexar(correr(r.lista));
    let almuerzos = 0;
    for (const [k, a] of antes) {
      const d = despues.get(k);
      if (d && Math.abs(d.excesoAlmuerzoMin - a.excesoAlmuerzoMin) > 1e-9) almuerzos += 1;
    }
    console.log(`${String(u).padStart(6)} s | ${String(r.olvidadas).padStart(16)} | ${String(r.diasA4).padStart(23)} | ${String(r.siguenMasDe4).padStart(13)} | ${almuerzos}`);
  }

  // ── El umbral elegido, día por día ─────────────────────────────────────────
  const elegido = conRepetidasOlvidadas(umbral);
  const despues = indexar(correr(elegido.lista));
  const quincenaDe = (f: string) => `${f.slice(0, 7)}-${Number(f.slice(8, 10)) <= 15 ? 1 : 2}`;
  const cerradas = new Map<string, string>(); // `${empresa}|${quincena}` → estado
  for (const g of gRes.data ?? []) {
    const q = quincenaDe(String(g.desde));
    cerradas.set(`${g.empresa}|${q}`, String(g.estado));
  }

  let totalUsd = 0; let totalMin = 0; let dias = 0; let conJusti = 0; let usdCerradas = 0;
  let revisarAntes = 0; let revisarDespues = 0; let otraCosa = 0;
  const porQuincena = new Map<string, { usd: number; dias: number }>();
  console.log(`\n== umbral ${umbral} s: los días cuyo exceso de almuerzo cambia ==`);
  for (const [k, a] of [...antes.entries()].sort((x, y) => x[0].split("|")[1].localeCompare(y[0].split("|")[1]))) {
    const d = despues.get(k);
    if (!d) continue;
    if (a.revisar) revisarAntes += 1;
    if (d.revisar) revisarDespues += 1;
    const [cod, fecha] = k.split("|");
    const dAlm = a.excesoAlmuerzoMin - d.excesoAlmuerzoMin;
    const otras = [
      ["tarde", a.tardeMin, d.tardeMin], ["salidaTemprana", a.salidaTempranaMin, d.salidaTempranaMin],
      ["extra", a.extraMin, d.extraMin], ["trabajado", a.trabajadoMin, d.trabajadoMin],
    ].filter(([, x, y]) => Math.abs(Number(x) - Number(y)) > 1e-9).map(([n, x, y]) => `${n} ${x}→${y}`);
    if (a.ausente !== d.ausente) otras.push(`ausente ${a.ausente}→${d.ausente}`);
    if (a.entrada !== d.entrada) otras.push(`entrada ${a.entrada}→${d.entrada}`);
    if (a.salida !== d.salida) otras.push(`salida ${a.salida}→${d.salida}`);
    if (otras.length && !(otras.length === 1 && otras[0].startsWith("trabajado"))) {
      otraCosa += 1;
      console.log(`  ⛔ SE MUEVE OTRA COSA — ${cod} ${nombres.get(cod) ?? ""} ${fecha}: ${otras.join(" · ")}`);
    }
    if (Math.abs(dAlm) < 1e-9) continue;
    dias += 1;
    const f = ficha.get(cod);
    const rata = f ? rataPorHora(f.salario, f.jornada ?? NaN, reglas) : null;
    const usd = rata === null ? null : Math.round((dAlm / 60) * rata * 100) / 100;
    if (usd !== null) totalUsd += usd;
    totalMin += dAlm;
    const q = quincenaDe(fecha);
    const pq = porQuincena.get(q) ?? { usd: 0, dias: 0 };
    pq.usd += usd ?? 0; pq.dias += 1; porQuincena.set(q, pq);
    const estado = cerradas.get(`${f?.empresa}|${q}`) ?? "sin planilla guardada";
    if (estado === "cerrada" && usd !== null) usdCerradas += usd;
    const justi = a.justificado || a.permiso ? ` ⚠️ justificación: ${a.justificado ?? a.permiso}` : "";
    if (justi) conJusti += 1;
    const habil = esHabil(fecha) && !feriados.has(fecha);
    console.log(
      `  ${fecha} ${cod.padEnd(4)} ${(nombres.get(cod) ?? "(sin ficha)").padEnd(34)} ${a.marcas.join(" ")}`
      + ` → exceso ${a.excesoAlmuerzoMin.toFixed(2)} → ${d.excesoAlmuerzoMin.toFixed(2)} min (Δ ${dAlm.toFixed(2)})`
      + ` = ${usd === null ? "$? (sin rata)" : `$${usd.toFixed(2)}`} · ${q} · planilla ${f?.empresa ?? "?"}: ${estado}`
      + `${habil ? "" : " · ⚠️ NO HÁBIL/feriado"}${otras.length ? ` · ${otras.join(" · ")}` : ""}${justi}`,
    );
  }
  console.log(`\n${dias} días · ${totalMin.toFixed(2)} min · $${totalUsd.toFixed(2)} al valor del minuto de cada uno · ${conJusti} con justificación encima`);
  console.log(`de eso, en quincenas con planilla CERRADA en el sistema: $${usdCerradas.toFixed(2)}`);
  for (const [q, v] of [...porQuincena.entries()].sort()) console.log(`  ${q}: ${v.dias} días · $${v.usd.toFixed(2)}`);
  console.log(`días «a revisar» (terminados, sin 4 marcas): antes ${revisarAntes} → después ${revisarDespues}`);
  console.log(`días donde se mueve OTRA cosa que el almuerzo/trabajado: ${otraCosa}`);
  console.log(`marcas olvidadas con ${umbral} s: ${elegido.olvidadas} · días de +4 que quedan en 4: ${elegido.diasA4} · siguen con +4: ${elegido.siguenMasDe4}`);
  const iguales = [...antes.entries()].every(([k, a]) => {
    const d = despues.get(k);
    return d && d.marcas.join() === a.marcas.join() && Math.abs(d.excesoAlmuerzoMin - a.excesoAlmuerzoMin) < 1e-9;
  });
  console.log(iguales
    ? "✅ el motor YA aplica la regla: las dos corridas son idénticas"
    : "ℹ️ el motor todavía no aplica la regla (o el umbral pedido no es el suyo): «antes» ≠ «después»");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
