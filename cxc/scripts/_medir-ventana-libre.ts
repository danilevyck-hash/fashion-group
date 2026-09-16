/* Solo lectura. Corre el motor de Asistencia (reporte + planilla + préstamos)
 * sobre una quincena, con o sin corte, y escribe por colaborador TODO el
 * desglose de plata. Se compara contra los Excel de la contadora.
 *   npx tsx scripts/_medir-ventana-libre.ts <salida.json> --desde=... --hasta=... [--corte=2026-09-13]
 * No escribe nada en ningún lado.
 */
import { writeFileSync } from "node:fs";

async function main() {
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
  const { armarPlanilla, jornadaDiariaMin, periodoDesdeRango, separarSinFicha, totalizar } = await import("@/lib/asistencia/planilla");
  const { leerManuales } = await import("@/lib/asistencia/planilla-server");
  const { estaAprobado, estaRechazado, indexarAprobaciones } = await import("@/lib/asistencia/aprobaciones");
  const { leerAprobaciones } = await import("@/lib/asistencia/aprobaciones-server");
  const { sugerirPrestamos, aplicarPrestamoEnLinea } = await import("@/lib/asistencia/prestamos-planilla");
  const { leerPrestamosDeQuincena } = await import("@/lib/asistencia/prestamos-planilla-server");
  const { recortarAlNeto } = await import("@/lib/asistencia/neto-no-negativo");
  type FichaPlanilla = import("@/lib/asistencia/planilla").FichaPlanilla;
  type HorarioPersona = import("@/lib/asistencia/reporte").HorarioPersona;
  type MarcacionConId = import("@/lib/asistencia/correcciones").MarcacionConId;

  const args = process.argv.slice(2);
  const salida = args.find((a) => a.endsWith(".json"));
  if (!salida) throw new Error("falta el archivo de salida");
  const desdeArg = (args.find((a) => a.startsWith("--desde=")) ?? "").slice("--desde=".length);
  const hastaArg = (args.find((a) => a.startsWith("--hasta=")) ?? "").slice("--hasta=".length);
  if (!desdeArg || !hastaArg) throw new Error("uso: <salida.json> --desde=AAAA-MM-DD --hasta=AAAA-MM-DD");
  const clave = `${desdeArg}..${hastaArg}`;
  // 🩸 15-sep-2026: acá decía `const corte = null` y la bandera `--corte=` de la
  // cabecera se ignoraba en silencio. La corrida salía SIEMPRE leyendo el reloj
  // hasta el fin del rango. No se notó porque cuando se corrió la primera vez el
  // reloj no tenía datos después del 11 de septiembre; al volver la PC de la
  // oficina, la misma orden pasó a dar otro número.
  const corteArg = (args.find((a) => a.startsWith("--corte=")) ?? "").slice("--corte=".length);
  const corte = corteArg || null;
  const prender = new Set((args.find((a) => a.startsWith("--prender=")) ?? "--prender=").slice(10).split(",").map(s=>s.trim()).filter(Boolean));
  const spExtra = new Set((args.find((a) => a.startsWith("--sp=")) ?? "--sp=").slice(5).split(",").map(s=>s.trim()).filter(Boolean));
  const q = periodoDesdeRango(desdeArg, hastaArg);
  if (!q) throw new Error(`rango inválido: ${desdeArg} → ${hastaArg}`);
  const aprobarTodo = args.includes("--aprobar-todo");
  const sinVigencias = args.includes("--sin-vigencias");
  const hastaReloj = corte ?? q.hasta;

  const PANAMA = "-05:00";
  const instante = (dia: string, fin: boolean) =>
    new Date(Date.parse(`${dia}T${fin ? "23:59:59.999" : "00:00:00.000"}${PANAMA}`)).toISOString();

  const marcaciones = await leerTodoPaginado<MarcacionConId>("marcaciones",
    (pedirCount, from, to) =>
      supabaseServer.from("asistencia_marcaciones")
        .select("id, empleado_codigo, empleado_nombre, ocurrio_en", pedirCount ? { count: "exact" } : {})
        .gte("ocurrio_en", instante(q.desde, false)).lte("ocurrio_en", instante(hastaReloj, true))
        .order("ocurrio_en", { ascending: true }).order("id", { ascending: true }).range(from, to));

  const [{ reglas }, personasDb, enLaBase, correcciones, manualesLeidos, aprRes, repRes, hRes, jRes, vRes, fRes] =
    await Promise.all([
      leerReglas(), leerPersonas(), leerTrabajaAfuera(), leerCorrecciones(q.desde, hastaReloj),
      q.claveManuales ? leerManuales(q.claveManuales) : Promise.resolve({ porCodigo: new Map(), faltaMigracion: false }),
      leerAprobaciones(q.desde, hastaReloj), leerRepartos(),
      supabaseServer.from("asistencia_horarios").select("empleado_codigo, entrada, salida, almuerzo_minutos"),
      leerJustificaciones(q.desde, hastaReloj), leerVacaciones(q.desde, hastaReloj),
      supabaseServer.from("asistencia_feriados").select("fecha, nombre").gte("fecha", q.desde).lte("fecha", hastaReloj),
    ]);
  if (hRes.error) throw new Error(hRes.error.message);
  if (fRes.error) throw new Error(fRes.error.message);

  const afuera = new Set<string>([...enLaBase, ...prender]);
  const horarios = (hRes.data ?? []).map((h) => ({
    ...h, entrada: String(h.entrada).slice(0, 5), salida: String(h.salida).slice(0, 5),
  })) as HorarioPersona[];
  const vigencias = vigenciasDeFilas(personasDb.filas);
  const fuera = codigosFueraDeRango(vigencias, q.desde, q.hasta);
  const repartoPorCodigo = agruparPorCodigo(repRes.filas);
  const fichas = new Map<string, FichaPlanilla>();
  const crudo = new Map<string, Record<string, unknown>>();
  for (const f of personasDb.filas) {
    const codigo = String(f.empleado_codigo);
    crudo.set(codigo, f as unknown as Record<string, unknown>);
    if (fuera.has(codigo)) continue;
    const salario = f.salario_mensual === null ? null : Number(f.salario_mensual);
    fichas.set(codigo, {
      codigo, nombre: f.nombre ?? null, salarioMensual: salario,
      jornadaSemanal: f.jornada_semanal ?? null, empresa: f.empresa ?? null,
      servicioProfesional: servicioProfesionalDeFila(f) || spExtra.has(codigo),
      pagaSeguros: pagaSegurosDeFila(f), baseSeguros: baseSegurosDeFila(f),
      noMarcaReloj: noMarcaRelojDeFila(f), cobraHorasExtra: cobraHorasExtraDeFila(f),
      trabajaAfuera: afuera.has(codigo),
      reparto: partesDe(salario, repartoPorCodigo.get(codigo)),
    });
  }
  const nombres = new Map<string, string>();
  for (const [cod, f] of fichas) if (f.nombre) nombres.set(cod, f.nombre);
  const efectivas = aplicarCorrecciones(marcaciones, correcciones.correcciones);
  const hoy = hoyPanama();
  const personas = armarReporte({
    marcaciones: efectivas.marcaciones, horarios, justificaciones: jRes.filas, vacaciones: vRes.filas,
    feriados: new Map((fRes.data ?? []).map((f) => [String(f.fecha), String(f.nombre)])),
    desde: q.desde, hasta: hastaReloj, reglas, nombres, incluirNoHabiles: true, diaEnCurso: hoy,
    correccionesPorDia: efectivas.porDia, trabajaAfuera: afuera,
    // 🔴 El día anterior al ingreso (o posterior a la salida) no es ausencia
    // (15-sep-2026). `--sin-vigencias` es el CONTROL: apaga la regla y devuelve
    // exactamente los números de antes del arreglo, para medir el antes/después
    // con el MISMO instrumento.
    vigencias: sinVigencias ? undefined : vigencias,
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
  const diasExtraNo = new Set<string>();
  for (const [k, a] of aprobaciones) { if (estaAprobado(a)) diasExtraAprobados.add(k); if (estaRechazado(a)) diasExtraNo.add(k); }
  if (aprobarTodo) {
    diasExtraNo.clear();
    for (const p of personasVigentes) for (const d of p.dias) diasExtraAprobados.add(`${p.codigo}|${d.fecha}`);
  }
  const todas = armarPlanilla({
    personas: personasVigentes, fichas, manuales: manualesLeidos.porCodigo,
    jornadaDiariaMin: (c: string) => jornadaDiariaMin(horarioDe.get(c)),
    reglas, empresa: null, exigirAprobacionExtra: true, diasExtraAprobados, diasExtraNo,
    factorBase: q.factorBase, decidirAMano: new Map(), prorrateo, justificados,
  });
  const { lineas, sinFicha } = separarSinFicha(todas);
  const presRes = q.claveManuales ? await leerPrestamosDeQuincena(q.desde, q.hasta) : { fichas: [] };
  const enCuadro = lineas.map((l) => ({
    codigo: l.codigo, etiqueta: l.etiqueta, empresa: l.empresa, empresaEtiqueta: l.empresaEtiqueta,
    enCasilla: l.manuales.prestamo ?? 0, enCasillaTerceros: l.manuales.terceros ?? 0,
    enCasillaDano: l.manuales.mercancia ?? 0,
  }));
  const prestamos = sugerirPrestamos({ fichas: presRes.fichas as never, personas: enCuadro as never });
  const sug = new Map(prestamos.map((s: { codigo: string }) => [s.codigo, s]));
  const finales = lineas.map((l) => recortarAlNeto(aplicarPrestamoEnLinea(l, sug.get(l.codigo) as never)));

  const reporteDe = new Map(personasVigentes.map((p) => [p.codigo, p]));
  const filas = finales.map((l) => {
    const p = reporteDe.get(l.codigo);
    const f = crudo.get(l.codigo) ?? {};
    return {
      codigo: l.codigo, nombre: l.nombre, etiqueta: l.etiqueta,
      empresa: l.empresa, linea: l.parte?.empresa ?? l.empresa,
      salarioMensual: l.salarioMensual, jornadaSemanal: l.jornadaSemanal,
      servicioProfesional: fichas.get(l.codigo)?.servicioProfesional ?? false,
      pagaSeguros: l.pagaSeguros, noMarcaReloj: l.noMarcaReloj, trabajaAfuera: l.trabajaAfuera,
      cobraHorasExtra: l.cobraHorasExtra !== false,
      fueraDePlanilla: l.fueraDePlanilla, faltaConfigurar: [...l.faltaConfigurar],
      decidir: l.decidirAMano ?? null,
      fechaIngreso: f.fecha_ingreso ?? null, fechaSalida: f.fecha_salida ?? null,
      prorrateo: prorrateo.get(l.codigo)?.texto ?? null,
      diasConMarca: p?.resumen.diasTrabajados ?? 0,
      ausenciasDias: p?.resumen.ausenciasSinJustificar ?? 0,
      tardanzaMin: p?.resumen.tardanzaMin ?? 0,
      salidaTempranaMin: p?.resumen.salidaTempranaMin ?? 0,
      extraMin: p?.resumen.extraMin ?? 0,
      dinero: l.dinero, manuales: l.manuales,
    };
  }).sort((a, b) => String(a.linea).localeCompare(String(b.linea)) || a.codigo.localeCompare(b.codigo, "es", { numeric: true }));

  writeFileSync(salida, JSON.stringify({
    quincena: clave, aprobarTodo, sinVigencias, desde: q.desde, hasta: q.hasta, hastaReloj, corte, hoy,
    factorBase: q.factorBase, prendidos: [...prender], spExtra: [...spExtra],
    afueraEnLaBase: [...enLaBase],
    reglas, totales: totalizar(finales), sinFicha: sinFicha.map((s) => s.codigo),
    prestamos, personas: filas,
  }, null, 1));
  console.log(`${salida}: ${filas.length} líneas · ${q.desde} → ${q.hasta} · reloj hasta ${hastaReloj}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
