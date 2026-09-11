/* Solo lectura. Corre el motor de Asistencia (reporte + planilla) sobre la
 * quincena en curso y escribe, por colaborador, los minutos y la plata que
 * salen. Se corre ANTES y DESPUÉS de un cambio y se comparan los dos archivos:
 * 0 diferencias = ninguna persona cambió un minuto.
 *   npx tsx scripts/_medir-almuerzo-por-empresa.ts /tmp/antes.json [2026-09-1]
 */
import { writeFileSync } from "node:fs";
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
import { codigosFueraDeRango } from "@/lib/asistencia/vigencia";
import { prorrateoPorVigencia } from "@/lib/asistencia/prorrateo-ingreso";
import { motivosDeQuienNoMarco } from "@/lib/asistencia/periodo";
import { hoyPanama } from "@/lib/fecha-panama";
import {
  armarPlanilla, jornadaDiariaMin, quincenaDesdeClave, separarSinFicha, type FichaPlanilla,
} from "@/lib/asistencia/planilla";
import { leerManuales } from "@/lib/asistencia/planilla-server";
import { estaAprobado, indexarAprobaciones } from "@/lib/asistencia/aprobaciones";
import { leerAprobaciones } from "@/lib/asistencia/aprobaciones-server";

const PANAMA = "-05:00";
const instante = (dia: string, fin: boolean) =>
  new Date(Date.parse(`${dia}T${fin ? "23:59:59.999" : "00:00:00.000"}${PANAMA}`)).toISOString();

async function main() {
  const salida = process.argv[2];
  if (!salida) throw new Error("falta el archivo de salida");
  const hoy = hoyPanama();
  const clave = process.argv[3] ?? `${hoy.slice(0, 7)}-${Number(hoy.slice(8, 10)) <= 15 ? 1 : 2}`;
  const q = quincenaDesdeClave(clave);
  if (!q) throw new Error(`quincena inválida: ${clave}`);

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
  const personas = armarReporte({
    marcaciones: efectivas.marcaciones, horarios, justificaciones: jRes.filas, vacaciones: vRes.filas,
    feriados: new Map((fRes.data ?? []).map((f) => [String(f.fecha), String(f.nombre)])),
    desde: q.desde, hasta: q.hasta, reglas, nombres, incluirNoHabiles: true, diaEnCurso: hoy,
    correccionesPorDia: efectivas.porDia,
  });
  const horarioDe = new Map(horarios.map((h) => [h.empleado_codigo, h]));
  const personasVigentes = personas.filter((p) => !fuera.has(p.codigo));
  const decidirAMano = new Map<string, string>();
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
  const todas = armarPlanilla({
    personas: personasVigentes, fichas, manuales: manualesLeidos.porCodigo,
    jornadaDiariaMin: (c: string) => jornadaDiariaMin(horarioDe.get(c)),
    reglas, empresa: null, exigirAprobacionExtra: true, diasExtraAprobados,
    factorBase: q.factorBase, decidirAMano, prorrateo, justificados,
  });
  const { lineas } = separarSinFicha(todas);

  const porPersona = personasVigentes
    .map((p) => ({
      codigo: p.codigo,
      empresa: fichas.get(p.codigo)?.empresa ?? null,
      almuerzo: horarioDe.get(p.codigo)?.almuerzo_minutos ?? null,
      minutosTarde: p.resumen.minutosTarde,
      excesoAlmuerzoMin: p.resumen.excesoAlmuerzoMin,
      tiempoNoTrabajadoMin: p.resumen.tiempoNoTrabajadoMin,
      extraMin: p.resumen.extraMin,
      ausencias: p.resumen.ausenciasSinJustificar,
      dinero: lineas.find((l) => l.codigo === p.codigo)?.dinero ?? null,
      decidir: lineas.find((l) => l.codigo === p.codigo)?.decidirAMano ?? null,
      prorrateo: lineas.find((l) => l.codigo === p.codigo)?.prorrateo ?? null,
    }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
  writeFileSync(salida, JSON.stringify({ quincena: clave, hoy, personas: porPersona }, null, 1));
  console.log(`${salida}: ${porPersona.length} colaboradores · quincena ${clave} (${q.desde} → ${q.hasta})`);
}
main().catch((e) => { console.error(e); process.exit(1); });
