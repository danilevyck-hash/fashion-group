/* Solo lectura. Corre el motor de Asistencia (reporte + planilla) sobre una
 * quincena y escribe, por colaborador, las ausencias y la plata que salen —
 * con la casilla «Trabaja afuera» tal como está en la base, o PRENDIDA EN
 * MEMORIA para los códigos que se le pidan. No escribe nada en ningún lado.
 *
 *   npx tsx -r dotenv/config scripts/_medir-trabaja-afuera.ts <salida.json> [2026-09-1] [--prender=2,3,13]
 *   npx tsx scripts/_medir-trabaja-afuera.ts --comparar <a.json> <b.json>
 *
 * Con `--comparar` imprime, por persona, qué cambió entre dos corridas (0 líneas
 * = nadie cambió un centavo). Es el control principal del cambio del
 * 14-sep-2026: sin la casilla prendida, ANTES y DESPUÉS tienen que dar igual.
 */
import { readFileSync, writeFileSync } from "node:fs";

interface Fila {
  codigo: string; nombre: string | null; empresa: string | null;
  /** La empresa de ESTA línea: con el sueldo repartido hay dos líneas por código. */
  linea: string | null; casilla: boolean;
  diasConMarca: number; ausencias: number; diasAfuera: number;
  ausenciasDinero: number | null; neto: number | null; decidir: string | null; faltaConfigurar: string[];
}
interface Salida { quincena: string; hoy: string; prendidos: string[]; personas: Fila[] }

function comparar(a: string, b: string) {
  const A = JSON.parse(readFileSync(a, "utf8")) as Salida;
  const B = JSON.parse(readFileSync(b, "utf8")) as Salida;
  // 🔑 La llave es código + empresa de la línea: Julio Garay (11) reparte su
  // sueldo entre dos empresas y sale en DOS líneas; por código solo, la
  // comparación mezcla una con la otra y acusa un cambio que no existe.
  const llave = (p: Fila) => `${p.codigo}|${p.linea ?? ""}`;
  const porCodigo = new Map(A.personas.map((p) => [llave(p), p]));
  let cambios = 0;
  for (const p of B.personas) {
    const q = porCodigo.get(llave(p));
    if (!q) { console.log(`+ ${p.codigo} ${p.nombre ?? ""}: nuevo`); cambios++; continue; }
    const dif: string[] = [];
    if (q.ausencias !== p.ausencias) dif.push(`ausencias ${q.ausencias} → ${p.ausencias}`);
    if (q.diasAfuera !== p.diasAfuera) dif.push(`días afuera ${q.diasAfuera} → ${p.diasAfuera}`);
    if (q.ausenciasDinero !== p.ausenciasDinero) dif.push(`ausencias$ ${q.ausenciasDinero} → ${p.ausenciasDinero}`);
    if (q.neto !== p.neto) {
      const d = (p.neto ?? 0) - (q.neto ?? 0);
      dif.push(`neto ${q.neto} → ${p.neto} (${d >= 0 ? "+" : ""}${d.toFixed(2)})`);
    }
    if (q.decidir !== p.decidir) dif.push(`decidir «${q.decidir}» → «${p.decidir}»`);
    if (q.faltaConfigurar.join("|") !== p.faltaConfigurar.join("|")) dif.push(`falta [${q.faltaConfigurar}] → [${p.faltaConfigurar}]`);
    if (dif.length) { console.log(`≠ ${p.codigo} ${p.nombre ?? ""} (${p.empresa}): ${dif.join(" · ")}`); cambios++; }
  }
  for (const q of A.personas) if (!B.personas.some((p) => llave(p) === llave(q))) { console.log(`- ${q.codigo}: desapareció`); cambios++; }
  console.log(`${cambios} persona(s) con diferencias entre ${a} y ${b}`);
}

async function medir() {
  const { supabaseServer } = await import("@/lib/supabase-server");
  const { leerTodoPaginado } = await import("@/lib/supabase-paginado");
  const { armarReporte } = await import("@/lib/asistencia/reporte");
  const { aplicarCorrecciones } = await import("@/lib/asistencia/correcciones");
  const { leerCorrecciones } = await import("@/lib/asistencia/correcciones-server");
  const {
    leerReglas, leerPersonas, vigenciasDeFilas, servicioProfesionalDeFila, pagaSegurosDeFila,
    baseSegurosDeFila, noMarcaRelojDeFila, cobraHorasExtraDeFila, leerTrabajaAfuera,
    leerJustificaciones, leerVacaciones, leerRepartos,
  } = await import("@/lib/asistencia/config-server");
  const { agruparPorCodigo, partesDe } = await import("@/lib/asistencia/reparto");
  const { codigosFueraDeRango } = await import("@/lib/asistencia/vigencia");
  const { prorrateoPorVigencia } = await import("@/lib/asistencia/prorrateo-ingreso");
  const { motivosDeQuienNoMarco } = await import("@/lib/asistencia/periodo");
  const { hoyPanama } = await import("@/lib/fecha-panama");
  const { armarPlanilla, jornadaDiariaMin, quincenaDesdeClave, separarSinFicha } = await import("@/lib/asistencia/planilla");
  const { leerManuales } = await import("@/lib/asistencia/planilla-server");
  const { estaAprobado, estaRechazado, indexarAprobaciones } = await import("@/lib/asistencia/aprobaciones");
  const { leerAprobaciones } = await import("@/lib/asistencia/aprobaciones-server");
  type FichaPlanilla = import("@/lib/asistencia/planilla").FichaPlanilla;
  type HorarioPersona = import("@/lib/asistencia/reporte").HorarioPersona;
  type MarcacionConId = import("@/lib/asistencia/correcciones").MarcacionConId;

  const args = process.argv.slice(2);
  const salida = args.find((a) => !a.startsWith("--") && a.endsWith(".json"));
  if (!salida) throw new Error("falta el archivo de salida");
  const prender = new Set(
    (args.find((a) => a.startsWith("--prender=")) ?? "--prender=").slice("--prender=".length)
      .split(",").map((s) => s.trim()).filter(Boolean),
  );
  const hoy = hoyPanama();
  const clave = args.find((a) => /^\d{4}-\d{2}-[12]$/.test(a)) ?? `${hoy.slice(0, 7)}-${Number(hoy.slice(8, 10)) <= 15 ? 1 : 2}`;
  const q = quincenaDesdeClave(clave);
  if (!q) throw new Error(`quincena inválida: ${clave}`);

  const PANAMA = "-05:00";
  const instante = (dia: string, fin: boolean) =>
    new Date(Date.parse(`${dia}T${fin ? "23:59:59.999" : "00:00:00.000"}${PANAMA}`)).toISOString();

  const marcaciones = await leerTodoPaginado<MarcacionConId>(
    "asistencia_marcaciones (medición)",
    (pedirCount, from, to) =>
      supabaseServer.from("asistencia_marcaciones")
        .select("id, empleado_codigo, empleado_nombre, ocurrio_en", pedirCount ? { count: "exact" } : {})
        .gte("ocurrio_en", instante(q.desde, false)).lte("ocurrio_en", instante(q.hasta, true))
        .order("ocurrio_en", { ascending: true }).order("id", { ascending: true }).range(from, to),
  );
  const [{ reglas }, personasDb, enLaBase, correcciones, manualesLeidos, aprRes, repRes, hRes, jRes, vRes, fRes] =
    await Promise.all([
      leerReglas(), leerPersonas(), leerTrabajaAfuera(), leerCorrecciones(q.desde, q.hasta),
      q.claveManuales ? leerManuales(q.claveManuales) : Promise.resolve({ porCodigo: new Map(), faltaMigracion: false }),
      leerAprobaciones(q.desde, q.hasta), leerRepartos(),
      supabaseServer.from("asistencia_horarios").select("empleado_codigo, entrada, salida, almuerzo_minutos"),
      leerJustificaciones(q.desde, q.hasta), leerVacaciones(q.desde, q.hasta),
      supabaseServer.from("asistencia_feriados").select("fecha, nombre").gte("fecha", q.desde).lte("fecha", q.hasta),
    ]);
  if (hRes.error) throw new Error(hRes.error.message);
  if (fRes.error) throw new Error(fRes.error.message);

  // La casilla: lo que dice la base (vacío mientras la migración no corra) MÁS
  // lo que se pidió prender en memoria. Nada se escribe.
  const afuera = new Set<string>([...enLaBase, ...prender]);

  const horarios = (hRes.data ?? []).map((h) => ({
    ...h, entrada: String(h.entrada).slice(0, 5), salida: String(h.salida).slice(0, 5),
  })) as HorarioPersona[];
  const vigencias = vigenciasDeFilas(personasDb.filas);
  const fuera = codigosFueraDeRango(vigencias, q.desde, q.hasta);
  const repartoPorCodigo = agruparPorCodigo(repRes.filas);
  const fichas = new Map<string, FichaPlanilla>();
  for (const f of personasDb.filas) {
    const codigo = String(f.empleado_codigo);
    if (fuera.has(codigo)) continue;
    const salario = f.salario_mensual === null ? null : Number(f.salario_mensual);
    fichas.set(codigo, {
      codigo, nombre: f.nombre ?? null, salarioMensual: salario,
      jornadaSemanal: f.jornada_semanal ?? null, empresa: f.empresa ?? null,
      servicioProfesional: servicioProfesionalDeFila(f), pagaSeguros: pagaSegurosDeFila(f),
      baseSeguros: baseSegurosDeFila(f), noMarcaReloj: noMarcaRelojDeFila(f),
      cobraHorasExtra: cobraHorasExtraDeFila(f),
      trabajaAfuera: afuera.has(codigo),
      reparto: partesDe(salario, repartoPorCodigo.get(codigo)),
    });
  }
  const nombres = new Map<string, string>();
  for (const [cod, f] of fichas) if (f.nombre) nombres.set(cod, f.nombre);
  const efectivas = aplicarCorrecciones(marcaciones, correcciones.correcciones);
  const personas = armarReporte({
    marcaciones: efectivas.marcaciones, horarios, justificaciones: jRes.filas, vacaciones: vRes.filas,
    feriados: new Map((fRes.data ?? []).map((f) => [String(f.fecha), String(f.nombre)])),
    desde: q.desde, hasta: q.hasta, reglas, nombres, incluirNoHabiles: true, diaEnCurso: hoy,
    correccionesPorDia: efectivas.porDia,
    trabajaAfuera: afuera,
  });
  const horarioDe = new Map(horarios.map((h) => [h.empleado_codigo, h]));
  const personasVigentes = personas.filter((p) => !fuera.has(p.codigo));
  const prorrateo = new Map<string, { factor: number; texto: string }>();
  for (const [codigo, v] of vigencias) {
    if (fuera.has(codigo)) continue;
    const p = prorrateoPorVigencia(v, q.desde, q.hasta);
    if (p) prorrateo.set(codigo, { factor: p.factor, texto: p.texto });
  }
  const justificados = motivosDeQuienNoMarco({ justificaciones: jRes.filas, vacaciones: vRes.filas });
  const aprobaciones = indexarAprobaciones(aprRes.filas);
  const diasExtraAprobados = new Set<string>();
  for (const [k, a] of aprobaciones) if (estaAprobado(a)) diasExtraAprobados.add(k);
  const diasExtraNo = new Set<string>();
  for (const [k, a] of aprobaciones) if (estaRechazado(a)) diasExtraNo.add(k);
  const todas = armarPlanilla({
    personas: personasVigentes, fichas, manuales: manualesLeidos.porCodigo,
    jornadaDiariaMin: (c: string) => jornadaDiariaMin(horarioDe.get(c)),
    reglas, empresa: null, exigirAprobacionExtra: true, diasExtraAprobados, diasExtraNo,
    factorBase: q.factorBase, decidirAMano: new Map(), prorrateo, justificados,
  });
  const { lineas } = separarSinFicha(todas);
  const reporteDe = new Map(personasVigentes.map((p) => [p.codigo, p]));

  // Una fila por LÍNEA de planilla (así entra también quien no marcó ni un día).
  const filas: Fila[] = lineas.map((l) => {
    const p = reporteDe.get(l.codigo);
    return {
      codigo: l.codigo, nombre: l.nombre, empresa: fichas.get(l.codigo)?.empresa ?? null,
      linea: l.parte?.empresa ?? fichas.get(l.codigo)?.empresa ?? null,
      casilla: afuera.has(l.codigo),
      diasConMarca: p?.resumen.diasTrabajados ?? 0,
      ausencias: p?.resumen.ausenciasSinJustificar ?? 0,
      diasAfuera: p?.resumen.diasTrabajandoFuera ?? 0,
      ausenciasDinero: l.dinero?.ausencias ?? null,
      neto: l.dinero?.netoPagar ?? null,
      decidir: l.decidirAMano ?? null,
      faltaConfigurar: [...l.faltaConfigurar],
    };
  }).sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }) || String(a.linea).localeCompare(String(b.linea)));
  const out: Salida = { quincena: clave, hoy, prendidos: [...prender], personas: filas };
  writeFileSync(salida, JSON.stringify(out, null, 1));
  console.log(`${salida}: ${filas.length} líneas · quincena ${clave} (${q.desde} → ${q.hasta}) · prendidos en memoria: ${[...prender].join(", ") || "nadie"} · en la base: ${[...enLaBase].join(", ") || "nadie"}`);
}

if (process.argv[2] === "--comparar") comparar(process.argv[3], process.argv[4]);
else medir().catch((e) => { console.error(e); process.exit(1); });
