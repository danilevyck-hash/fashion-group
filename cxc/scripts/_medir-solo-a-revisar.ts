/* ─────────────────────────────────────────────────────────────────────────────
 * SOLO LECTURA — «Encontrar rápido los días a revisar» (18-sep-2026).
 *
 * Contesta tres cosas contra producción, con el motor REAL:
 *
 *   1. Cuántos días-persona hay con marca, cuántos a revisar y en cuántos
 *      colaboradores — los números del encargo (426 · 82 · 34 en 1–15 sep).
 *   2. Cómo quedan los totales del pie del Reporte CON el botón «Solo a
 *      revisar» apagado y prendido. 🔴 El total sigue al filtro: son dos
 *      números distintos a propósito, y este script los imprime los dos.
 *   3. 🔴 QUE NINGÚN NÚMERO DE PLATA CAMBIÓ: el neto de la planilla de la misma
 *      quincena, persona por persona. El filtro es de PANTALLA y no toca el
 *      motor, así que este total tiene que ser idéntico antes y después.
 *
 * 🔴 No escribe nada en ningún lado.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_medir-solo-a-revisar.ts 2026-09-1
 * ────────────────────────────────────────────────────────────────────────── */

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { armarReporte, extraQueCuenta, type HorarioPersona } from "@/lib/asistencia/reporte";
import { aplicarCorrecciones, type MarcacionConId } from "@/lib/asistencia/correcciones";
import { leerCorrecciones } from "@/lib/asistencia/correcciones-server";
import {
  leerReglas, leerPersonas, vigenciasDeFilas, servicioProfesionalDeFila, pagaSegurosDeFila,
  baseSegurosDeFila, noMarcaRelojDeFila, leerJustificaciones, leerVacaciones, leerRepartos,
} from "@/lib/asistencia/config-server";
import { agruparPorCodigo, partesDe } from "@/lib/asistencia/reparto";
import { codigosFueraDeRango, motivoPeriodoParcial } from "@/lib/asistencia/vigencia";
import { motivosDeQuienNoMarco } from "@/lib/asistencia/periodo";
import { hoyPanama } from "@/lib/fecha-panama";
import {
  armarPlanilla, jornadaDiariaMin, quincenaDesdeClave, separarSinFicha, type FichaPlanilla,
} from "@/lib/asistencia/planilla";
import { leerManuales } from "@/lib/asistencia/planilla-server";
import { estaAprobado, indexarAprobaciones } from "@/lib/asistencia/aprobaciones";
import { leerAprobaciones } from "@/lib/asistencia/aprobaciones-server";
import { soloConDiasARevisar, diasARevisarDe } from "@/lib/asistencia/solo-a-revisar";

const PANAMA = "-05:00";
const instante = (dia: string, fin: boolean) =>
  new Date(Date.parse(`${dia}T${fin ? "23:59:59.999" : "00:00:00.000"}${PANAMA}`)).toISOString();

async function main() {
  const hoy = hoyPanama();
  const clave = process.argv[2] ?? `${hoy.slice(0, 7)}-${Number(hoy.slice(8, 10)) <= 15 ? 1 : 2}`;
  const q = quincenaDesdeClave(clave);
  if (!q) throw new Error(`quincena inválida: ${clave}`);
  console.log(`hoy (Panamá) = ${hoy} · quincena ${clave} (${q.desde} → ${q.hasta})\n`);

  const marcaciones = await leerTodoPaginado<MarcacionConId>(
    "asistencia_marcaciones (medición)",
    (pedirCount, from, to) =>
      supabaseServer.from("asistencia_marcaciones")
        .select("id, empleado_codigo, empleado_nombre, ocurrio_en", pedirCount ? { count: "exact" } : {})
        .gte("ocurrio_en", instante(q.desde, false)).lte("ocurrio_en", instante(q.hasta, true))
        .order("ocurrio_en", { ascending: true }).order("id", { ascending: true }).range(from, to),
  );
  const [{ reglas }, personasDb, correcciones, manualesLeidos, aprRes, repRes, hRes, jRes, vRes, fRes] =
    await Promise.all([
      leerReglas(), leerPersonas(), leerCorrecciones(q.desde, q.hasta),
      q.claveManuales ? leerManuales(q.claveManuales) : Promise.resolve({ porCodigo: new Map(), faltaMigracion: false }),
      leerAprobaciones(q.desde, q.hasta), leerRepartos(),
      supabaseServer.from("asistencia_horarios").select("empleado_codigo, entrada, salida, almuerzo_minutos"),
      leerJustificaciones(q.desde, q.hasta), leerVacaciones(q.desde, q.hasta),
      supabaseServer.from("asistencia_feriados").select("fecha, nombre").gte("fecha", q.desde).lte("fecha", q.hasta),
    ]);
  if (hRes.error) throw new Error(hRes.error.message);
  if (fRes.error) throw new Error(fRes.error.message);

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
      reparto: partesDe(salario, repartoPorCodigo.get(codigo)),
    });
  }
  const nombres = new Map<string, string>();
  for (const [cod, f] of fichas) if (f.nombre) nombres.set(cod, f.nombre);

  const efectivas = aplicarCorrecciones(marcaciones, correcciones.correcciones);
  const todasLasPersonas = armarReporte({
    marcaciones: efectivas.marcaciones, horarios, justificaciones: jRes.filas, vacaciones: vRes.filas,
    feriados: new Map((fRes.data ?? []).map((f) => [String(f.fecha), String(f.nombre)])),
    desde: q.desde, hasta: q.hasta, reglas, nombres, incluirNoHabiles: true, diaEnCurso: hoy,
    correccionesPorDia: efectivas.porDia,
  });
  const personas = todasLasPersonas.filter((p) => !fuera.has(p.codigo));

  // ── 1. EL PROBLEMA, MEDIDO ────────────────────────────────────────────────
  const diasConMarca = personas.reduce((a, p) => a + p.dias.filter((d) => d.marcas.length > 0).length, 0);
  const diasARevisar = personas.reduce((a, p) => a + p.resumen.diasARevisar, 0);
  const conAlgo = soloConDiasARevisar(personas, true);
  console.log("1. EL PROBLEMA");
  console.log(`   ${personas.length} colaboradores en el reporte`);
  console.log(`   ${diasConMarca} días-persona con marca`);
  console.log(`   ${diasARevisar} días a revisar, en ${conAlgo.length} colaboradores`);
  // 🔑 POR QUÉ NO DA LO MISMO QUE EL ENCARGO (82). El encargo se midió ANTES de
  // que la marca repetida se olvidara sola (18-sep-2026, `marca-repetida.ts`):
  // `revisar` se cuenta DESPUÉS de olvidarla, así que un día de 5 marcas con
  // una repetida dejó de estar a revisar. Acá se imprimen los dos números.
  const conLaReglaVieja = personas.reduce(
    (a, p) => a + p.dias.filter((d) => d.marcas.length > 0 && !d.enCurso
      && (d.marcas.length + d.repetidas.length) !== 4).length, 0,
  );
  console.log(`   (con la regla de ANTES del olvido de la repetida serían ${conLaReglaVieja})\n`);

  // 🔴 La cuenta de la columna y la del filtro tienen que ser LA MISMA.
  const porDias = personas.filter((p) => diasARevisarDe(p.dias, true).length > 0);
  const iguales = porDias.length === conAlgo.length
    && porDias.every((p) => conAlgo.some((c) => c.codigo === p.codigo));
  const sumaDias = conAlgo.reduce((a, p) => a + diasARevisarDe(p.dias, true).length, 0);
  console.log("   COMPROBACIÓN — la columna y el filtro cuentan lo mismo:");
  console.log(`   por resumen.diasARevisar: ${conAlgo.length} personas · por día.revisar: ${porDias.length} · ¿mismas? ${iguales ? "SÍ" : "NO ⛔"}`);
  console.log(`   suma de los días abiertos por el enlace: ${sumaDias} (tiene que ser ${diasARevisar})${sumaDias === diasARevisar ? "" : "  ⛔"}\n`);

  // ── 2. EL PIE, ANTES Y DESPUÉS DEL FILTRO ─────────────────────────────────
  const pie = (lista: typeof personas) => lista.reduce((a, p) => ({
    aus: a.aus + p.resumen.ausenciasSinJustificar,
    tarde: a.tarde + p.resumen.minutosTarde,
    noTrab: a.noTrab + p.resumen.tiempoNoTrabajadoMin,
    extra: a.extra + extraQueCuenta(p),
    rev: a.rev + p.resumen.diasARevisar,
  }), { aus: 0, tarde: 0, noTrab: 0, extra: 0, rev: 0 });
  const p0 = pie(personas);
  const p1 = pie(conAlgo);
  console.log("2. EL PIE DEL REPORTE — 🔴 el total sigue al filtro");
  console.log(`   apagado  (${personas.length} colab.): ausencias ${p0.aus} · tarde ${p0.tarde.toFixed(2)} · no trabajado ${p0.noTrab.toFixed(2)} · extras ${p0.extra.toFixed(2)} · a revisar ${p0.rev}`);
  console.log(`   prendido (${conAlgo.length} colab.): ausencias ${p1.aus} · tarde ${p1.tarde.toFixed(2)} · no trabajado ${p1.noTrab.toFixed(2)} · extras ${p1.extra.toFixed(2)} · a revisar ${p1.rev}`);
  console.log(`   «a revisar» es el MISMO en los dos (${p0.rev === p1.rev ? "sí" : "NO ⛔"}): quien no tiene nada aportaba 0.\n`);

  // ── 3. 🔴 LA PLATA NO SE MOVIÓ ────────────────────────────────────────────
  const horarioDe = new Map(horarios.map((h) => [h.empleado_codigo, h]));
  const decidirAMano = new Map<string, string>();
  for (const [codigo, v] of vigencias) {
    if (fuera.has(codigo)) continue;
    const motivo = motivoPeriodoParcial(v, q.desde, q.hasta);
    if (motivo) decidirAMano.set(codigo, motivo);
  }
  const justificados = motivosDeQuienNoMarco({ justificaciones: jRes.filas, vacaciones: vRes.filas });
  const aprobaciones = indexarAprobaciones(aprRes.filas);
  const diasExtraAprobados = new Set<string>();
  for (const [k, a] of aprobaciones) if (estaAprobado(a)) diasExtraAprobados.add(k);
  const todas = armarPlanilla({
    personas, fichas, manuales: manualesLeidos.porCodigo,
    jornadaDiariaMin: (c: string) => jornadaDiariaMin(horarioDe.get(c)),
    reglas, empresa: null, exigirAprobacionExtra: true, diasExtraAprobados,
    factorBase: q.factorBase, decidirAMano, justificados,
  });
  const { lineas } = separarSinFicha(todas);
  const neto = lineas.reduce((a, l) => a + (l.dinero?.netoPagar ?? 0), 0);
  console.log("3. LA PLATA — tiene que ser idéntica antes y después del cambio");
  console.log(`   ${lineas.length} líneas de planilla · NETO TOTAL = ${neto.toFixed(2)}`);
  const sinTocar = lineas
    .map((l) => `${l.codigo}=${(l.dinero?.netoPagar ?? 0).toFixed(2)}`)
    .sort()
    .join(" ");
  console.log(`   huella persona por persona:\n   ${sinTocar}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
