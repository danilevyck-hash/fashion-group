/* Solo lectura. Cuántas personas tienen horas extra SIN APROBAR hoy en la
 * quincena en curso —y cuántos minutos y cuánto vale— con el motor REAL y los
 * mismos datos que lee `/api/asistencia/planilla`. Es el número que aparece en
 * el aviso ámbar desde el 3-sep-2026 (antes el aviso leía las horas ya
 * filtradas y nunca salía).
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_medir-aviso-extras-sin-aprobar.ts [2026-09-1]
 */

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { armarReporte, type HorarioPersona } from "@/lib/asistencia/reporte";
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
import {
  estaAprobado, extrasNoAprobadas, indexarAprobaciones, textoExtraNoAprobada, horasBonitas,
} from "@/lib/asistencia/aprobaciones";
import { leerAprobaciones } from "@/lib/asistencia/aprobaciones-server";
import { frenosParaCerrar } from "@/lib/asistencia/planilla-guardada";

const PANAMA = "-05:00";
const instante = (dia: string, fin: boolean) =>
  new Date(Date.parse(`${dia}T${fin ? "23:59:59.999" : "00:00:00.000"}${PANAMA}`)).toISOString();

async function main() {
  const hoy = hoyPanama();
  const clave = process.argv[2] ?? `${hoy.slice(0, 7)}-${Number(hoy.slice(8, 10)) <= 15 ? 1 : 2}`;
  const q = quincenaDesdeClave(clave);
  if (!q) throw new Error(`quincena inválida: ${clave}`);
  console.log(`hoy (Panamá) = ${hoy} · quincena ${clave} (${q.desde} → ${q.hasta})`);

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
  // 3-sep-2026: quién es servicio profesional hoy (no cuenta horas extra).
  const sp = [...fichas.values()].filter((f) => f.servicioProfesional === true);
  console.log(`servicio profesional: ${sp.length} → ${sp.map((f) => `${f.codigo} ${f.nombre ?? "(sin nombre)"} [${f.empresa ?? "?"}]`).join(" · ") || "(nadie)"}`);

  const efectivas = aplicarCorrecciones(marcaciones, correcciones.correcciones);
  const personas = armarReporte({
    marcaciones: efectivas.marcaciones, horarios, justificaciones: jRes.filas, vacaciones: vRes.filas,
    feriados: new Map((fRes.data ?? []).map((f) => [String(f.fecha), String(f.nombre)])),
    desde: q.desde, hasta: q.hasta, reglas, nombres, incluirNoHabiles: true, diaEnCurso: hoy,
    correccionesPorDia: efectivas.porDia,
  });
  const horarioDe = new Map(horarios.map((h) => [h.empleado_codigo, h]));
  const personasVigentes = personas.filter((p) => !fuera.has(p.codigo));
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
    personas: personasVigentes, fichas, manuales: manualesLeidos.porCodigo,
    jornadaDiariaMin: (c: string) => jornadaDiariaMin(horarioDe.get(c)),
    reglas, empresa: null, exigirAprobacionExtra: true, diasExtraAprobados,
    factorBase: q.factorBase, decidirAMano, justificados,
  });
  const { lineas } = separarSinFicha(todas);

  console.log(`líneas=${lineas.length} · días aprobados=${diasExtraAprobados.size} · aprobaciones en tabla=${aprobaciones.size}`);

  // Lo que el aviso decía ANTES (leyendo `extraMedido`, o sea lo PAGADO):
  const viejo = lineas.filter((l) => l.extraMedido !== null && l.extraMedido.minutos > 0 && !l.extraAprobada);
  console.log(`\nANTES (aviso leyendo extraMedido): ${viejo.length} personas`);
  for (const l of viejo) console.log(`  ${l.etiqueta.padEnd(28)} ${horasBonitas(l.extraMedido!.minutos)} (son los PAGADOS)`);

  const ahora = extrasNoAprobadas(lineas);
  const minutos = ahora.reduce((s, e) => s + e.minutos, 0);
  const monto = ahora.reduce((s, e) => s + (e.monto ?? 0), 0);
  console.log(`\nAHORA (aviso leyendo extraNoAprobada): ${ahora.length} personas · ${minutos.toFixed(2)} min = ${horasBonitas(minutos)} · $${monto.toFixed(2)}`);
  const porEmpresa = new Map<string, { n: number; min: number; monto: number }>();
  for (const l of lineas) {
    if (!l.extraNoAprobada) continue;
    const k = l.empresa ?? "(sin empresa)";
    const acc = porEmpresa.get(k) ?? { n: 0, min: 0, monto: 0 };
    acc.n += 1; acc.min += l.extraNoAprobada.minutos; acc.monto += l.extraNoAprobada.monto ?? 0;
    porEmpresa.set(k, acc);
    console.log(
      `  ${k.padEnd(20)} ${l.etiqueta.padEnd(28)} sin aprobar ${horasBonitas(l.extraNoAprobada.minutos).padStart(8)}`
      + ` (D ${l.extraNoAprobada.diurnoMin.toFixed(1)} · N ${l.extraNoAprobada.nocturnoMin.toFixed(1)})`
      + ` $${(l.extraNoAprobada.monto ?? 0).toFixed(2).padStart(7)}`
      + ` · pagado ${l.extraMedido ? horasBonitas(l.extraMedido.minutos) : "—"}`,
    );
  }
  console.log("\npor empresa:");
  for (const [k, v] of porEmpresa) console.log(`  ${k.padEnd(20)} ${v.n} personas · ${horasBonitas(v.min)} · $${v.monto.toFixed(2)}`);

  console.log(`\naviso: ${textoExtraNoAprobada(ahora) ?? "(ninguno)"}`);
  const frenos = frenosParaCerrar(lineas, []);
  console.log(`freno horas-extra: ${frenos.some((f) => f.tipo === "horas-extra") ? "SÍ frena" : "no frena"}`);
}

void main().catch((e) => { console.error(e); process.exitCode = 1; });
