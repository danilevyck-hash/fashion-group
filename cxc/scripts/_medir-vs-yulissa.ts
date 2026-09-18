/* Solo lectura. Corre el motor de Asistencia (reporte + planilla + préstamos)
 * sobre una quincena, con o sin corte, y escribe por colaborador TODO el
 * desglose de plata. Se compara contra los Excel de la contadora.
 *   npx tsx scripts/_medir-vs-yulissa.ts <salida.json> 2026-09-1 [--corte=2026-09-13]
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
  const { armarPlanilla, jornadaDiariaMin, quincenaDesdeClave, periodoDeQuincena, separarSinFicha, totalizar } = await import("@/lib/asistencia/planilla");
  const { leerManuales } = await import("@/lib/asistencia/planilla-server");
  const { estaAprobado, estaRechazado, indexarAprobaciones } = await import("@/lib/asistencia/aprobaciones");
  const { leerAprobaciones } = await import("@/lib/asistencia/aprobaciones-server");
  const { sugerirPrestamos, aplicarPrestamoEnLinea } = await import("@/lib/asistencia/prestamos-planilla");
  const { leerPrestamosDeQuincena } = await import("@/lib/asistencia/prestamos-planilla-server");
  const { recortarAlNeto } = await import("@/lib/asistencia/neto-no-negativo");
  // 🔴 El día libre de la empresa (17-sep-2026): se cobra con las horas extra,
  // justo antes del recorte al neto, igual que en la ruta.
  const { aplicarDiaLibreEnLinea, deudaDelDiaLibre } = await import("@/lib/asistencia/dia-libre-empresa");
  const { leerSaldosDiaLibre } = await import("@/lib/asistencia/dia-libre-empresa-server");
  type FichaPlanilla = import("@/lib/asistencia/planilla").FichaPlanilla;
  type HorarioPersona = import("@/lib/asistencia/reporte").HorarioPersona;
  type MarcacionConId = import("@/lib/asistencia/correcciones").MarcacionConId;

  const args = process.argv.slice(2);
  const salida = args.find((a) => a.endsWith(".json"));
  if (!salida) throw new Error("falta el archivo de salida");
  const clave = args.find((a) => /^\d{4}-\d{2}-[12]$/.test(a)) ?? "2026-09-1";
  const corte = (args.find((a) => a.startsWith("--corte=")) ?? "").slice("--corte=".length) || null;
  const prender = new Set((args.find((a) => a.startsWith("--prender=")) ?? "--prender=").slice(10).split(",").map(s=>s.trim()).filter(Boolean));
  const spExtra = new Set((args.find((a) => a.startsWith("--sp=")) ?? "--sp=").slice(5).split(",").map(s=>s.trim()).filter(Boolean));
  const qq = quincenaDesdeClave(clave);
  if (!qq) throw new Error(`quincena inválida: ${clave}`);
  const q = periodoDeQuincena(qq);
  const aprobarTodo = args.includes("--aprobar-todo");
  // 🔴 SOLO PARA MEDIR, y NO escribe nada: simula que a estos códigos se les
  // cargó UN día libre de la empresa (8 × su rata) y mide qué le pasa al cuadro.
  // Sin la bandera, se leen las deudas REALES de la base (ninguna hoy).
  const diaLibreSimulado = new Set(
    (args.find((a) => a.startsWith("--dia-libre=")) ?? "--dia-libre=").slice(12)
      .split(",").map((x) => x.trim()).filter(Boolean),
  );
  const sinVigencias = args.includes("--sin-vigencias");
  // 🔴 Los días laborables y el horario de afuera (18-sep-2026). Este es el
  // CONTROL: `--sin-horario-configurable` apaga la regla (lunes a viernes, un
  // horario) y devuelve los números de antes. Y `--simular-migracion` mide
  // cómo quedaría con la migración corrida SIN correrla: resuelve los días por
  // la EMPRESA de la ficha (Multifashion, lunes a sábado) aunque la columna no
  // exista todavía. Solo lectura, como todo lo demás.
  const sinHorarioConfigurable = args.includes("--sin-horario-configurable");
  const simularMigracion = args.includes("--simular-migracion");
  const hastaReloj = corte ?? q.hasta;

  const PANAMA = "-05:00";
  const instante = (dia: string, fin: boolean) =>
    new Date(Date.parse(`${dia}T${fin ? "23:59:59.999" : "00:00:00.000"}${PANAMA}`)).toISOString();

  const marcaciones = await leerTodoPaginado<MarcacionConId>("marcaciones",
    (pedirCount, from, to) =>
      supabaseServer.from("asistencia_marcaciones")
        .select("id, empleado_codigo, empleado_nombre, ocurrio_en, dispositivo", pedirCount ? { count: "exact" } : {})
        .gte("ocurrio_en", instante(q.desde, false)).lte("ocurrio_en", instante(hastaReloj, true))
        .order("ocurrio_en", { ascending: true }).order("id", { ascending: true }).range(from, to));

  const { leerHorarios } = await import("@/lib/asistencia/horarios-server");
  const { resolverDiasLaborables } = await import("@/lib/asistencia/horario-configurable");
  const [{ reglas }, personasDb, enLaBase, correcciones, manualesLeidos, aprRes, repRes, horariosLeidos, jRes, vRes, fRes] =
    await Promise.all([
      leerReglas(), leerPersonas(), leerTrabajaAfuera(), leerCorrecciones(q.desde, hastaReloj),
      q.claveManuales ? leerManuales(q.claveManuales) : Promise.resolve({ porCodigo: new Map(), faltaMigracion: false }),
      leerAprobaciones(q.desde, hastaReloj), leerRepartos(),
      // 🔴 La MISMA lectura que la ruta: días laborables y horario de afuera.
      leerHorarios(),
      leerJustificaciones(q.desde, hastaReloj), leerVacaciones(q.desde, hastaReloj),
      supabaseServer.from("asistencia_feriados").select("fecha, nombre").gte("fecha", q.desde).lte("fecha", hastaReloj),
    ]);
  if (fRes.error) throw new Error(fRes.error.message);

  const afuera = new Set<string>([...enLaBase, ...prender]);
  const horarios: HorarioPersona[] = horariosLeidos.horarios;
  const vigencias = vigenciasDeFilas(personasDb.filas);
  // Los días laborables de cada quien, como los resuelve la ruta. Con
  // `--simular-migracion` se resuelven aunque la columna no exista (los días
  // por la empresa; el horario de afuera no se inventa: nadie marca por el
  // teléfono todavía). Con `--sin-horario-configurable`, vacío = como antes.
  const diasLaborables = sinHorarioConfigurable
    ? undefined
    : resolverDiasLaborables({
        horarios,
        empresaDe: new Map(personasDb.filas.map((f) => [String(f.empleado_codigo), f.empresa ?? null])),
        faltaMigracion: horariosLeidos.faltaMigracion && !simularMigracion,
      });
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
    diasLaborables,
  });
  const horarioDe = new Map(horarios.map((h) => [h.empleado_codigo, h]));
  const personasVigentes = personas.filter((p) => !fuera.has(p.codigo));
  const prorrateo = new Map<string, { factor: number; texto: string }>();
  for (const [codigo, v] of vigencias) {
    if (fuera.has(codigo)) continue;
    const p = prorrateoPorVigencia(v, q.desde, q.hasta, diasLaborables?.get(codigo));
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
  const conPrestamo = lineas.map((l) => aplicarPrestamoEnLinea(l, sug.get(l.codigo) as never));
  // Las deudas REALES (vacío sin la migración corrida) más las simuladas.
  const diaLibreLeido = await leerSaldosDiaLibre();
  const saldosDiaLibre = new Map(diaLibreLeido.saldos);
  for (const cod of diaLibreSimulado) {
    const l = conPrestamo.find((x) => x.codigo === cod);
    const monto = deudaDelDiaLibre(l?.dinero?.rataHora ?? null);
    if (monto === null) continue;
    const previo = saldosDiaLibre.get(cod);
    const debia = (previo?.debia ?? 0) + monto;
    const pagado = previo?.pagado ?? 0;
    saldosDiaLibre.set(cod, { codigo: cod, debia, pagado, queda: debia - pagado });
  }
  const conDiaLibre = conPrestamo.map((l) => aplicarDiaLibreEnLinea(
    l, saldosDiaLibre.get(l.codigo),
    { seguroSocialPct: reglas.seguroSocialPct, seguroEducativoPct: reglas.seguroEducativoPct },
  ));
  const finales = conDiaLibre.map((l) => recortarAlNeto(l));

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
      tardanzaMin: p?.resumen.minutosTarde ?? 0,
      salidaTempranaMin: p?.resumen.salidaTempranaMin ?? 0,
      extraMin: p?.resumen.extraMin ?? 0,
      dinero: l.dinero, manuales: l.manuales,
      diaLibre: (l as { diaLibre?: unknown }).diaLibre ?? null,
    };
  }).sort((a, b) => String(a.linea).localeCompare(String(b.linea)) || a.codigo.localeCompare(b.codigo, "es", { numeric: true }));

  writeFileSync(salida, JSON.stringify({
    quincena: clave, aprobarTodo, sinVigencias, sinHorarioConfigurable, simularMigracion,
    faltaMigracionHorario: horariosLeidos.faltaMigracion,
    diaLibreSimulado: [...diaLibreSimulado], desde: q.desde, hasta: q.hasta, hastaReloj, corte, hoy,
    factorBase: q.factorBase, prendidos: [...prender], spExtra: [...spExtra],
    afueraEnLaBase: [...enLaBase],
    reglas, totales: totalizar(finales), sinFicha: sinFicha.map((s) => s.codigo),
    prestamos, personas: filas,
  }, null, 1));
  console.log(`${salida}: ${filas.length} líneas · ${q.desde} → ${q.hasta} · reloj hasta ${hastaReloj}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
