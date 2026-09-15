/* Solo lectura. Corre el motor de Asistencia (reporte + planilla) sobre un
 * período con el «hasta que se PAGA» y el «hasta que se MIDE» por separado, y
 * escribe por línea de planilla todas las columnas de dinero. No escribe nada
 * en ninguna tabla.
 *
 *   npx tsx scripts/_medir-dia-31.ts <salida.json> --desde=2026-08-16 --hasta=2026-08-31 [--reloj=2026-08-31] [--clave=2026-08-2]
 *   npx tsx scripts/_medir-dia-31.ts --comparar <a.json> <b.json>
 *
 * `--hasta`  = hasta dónde llega el período que se PAGA (manda el factorBase,
 *              el prorrateo de quien entró/salió y quién queda fuera de rango).
 * `--reloj`  = hasta dónde se LEE el reloj (marcaciones, correcciones,
 *              aprobaciones, justificaciones, vacaciones, feriados). Por
 *              defecto, el mismo `--hasta`. Es el `hastaReloj` de la ruta.
 * `--clave`  = la clave de los montos escritos a mano ("2026-08-2").
 *
 * Es el control del cambio del 15-sep-2026 (el día 31 no se paga pero sí se
 * descuenta): ANTES (16→31 pagado, 31 medido) y DESPUÉS (16→30 pagado, 31
 * medido) tienen que dar EXACTAMENTE lo mismo.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { armarReporte, type HorarioPersona } from "@/lib/asistencia/reporte";
import { aplicarCorrecciones, type MarcacionConId } from "@/lib/asistencia/correcciones";
import { leerCorrecciones } from "@/lib/asistencia/correcciones-server";
import {
  leerReglas, leerPersonas, vigenciasDeFilas, servicioProfesionalDeFila, pagaSegurosDeFila,
  baseSegurosDeFila, noMarcaRelojDeFila, cobraHorasExtraDeFila, leerTrabajaAfuera,
  leerJustificaciones, leerVacaciones, leerRepartos,
} from "@/lib/asistencia/config-server";
import { agruparPorCodigo, partesDe } from "@/lib/asistencia/reparto";
import { codigosFueraDeRango } from "@/lib/asistencia/vigencia";
import { prorrateoPorVigencia } from "@/lib/asistencia/prorrateo-ingreso";
import { motivosDeQuienNoMarco } from "@/lib/asistencia/periodo";
import { hoyPanama } from "@/lib/fecha-panama";
import {
  armarPlanilla, jornadaDiariaMin, factorBaseDeRango, separarSinFicha, type FichaPlanilla,
} from "@/lib/asistencia/planilla";
import { leerManuales } from "@/lib/asistencia/planilla-server";
import { estaAprobado, estaRechazado, indexarAprobaciones } from "@/lib/asistencia/aprobaciones";
import { leerAprobaciones } from "@/lib/asistencia/aprobaciones-server";

const PANAMA = "-05:00";
const instante = (dia: string, fin: boolean) =>
  new Date(Date.parse(`${dia}T${fin ? "23:59:59.999" : "00:00:00.000"}${PANAMA}`)).toISOString();

const CAMPOS = [
  "salarioQuincenal", "extraDiurno", "extraNocturno", "excedente", "domingos", "feriados",
  "ausencias", "tardanzas", "salidaTemprana", "totalBruto",
  "seguroSocial", "seguroEducativo", "isr", "prestamo", "terceros", "mercancia",
  "totalDeducciones", "otrosServicios", "netoPagar",
] as const;

interface Fila {
  codigo: string; nombre: string | null; empresa: string | null; linea: string | null;
  diasConMarca: number; ausenciasDias: number; minutosTarde: number; extraMin: number;
  decidir: string | null; prorrateo: string | null; falta: string[];
  dinero: Record<string, number> | null;
}
interface Salida {
  desde: string; hasta: string; reloj: string; clave: string | null;
  factorBase: number; hoy: string; personas: Fila[];
}

function comparar(a: string, b: string) {
  const A = JSON.parse(readFileSync(a, "utf8")) as Salida;
  const B = JSON.parse(readFileSync(b, "utf8")) as Salida;
  console.log(`A = ${A.desde} → ${A.hasta} (reloj ${A.reloj}, factor ${A.factorBase})`);
  console.log(`B = ${B.desde} → ${B.hasta} (reloj ${B.reloj}, factor ${B.factorBase})`);
  const llave = (p: Fila) => `${p.codigo}|${p.linea ?? ""}`;
  const mapa = new Map(A.personas.map((p) => [llave(p), p]));
  let cambios = 0;
  let netoA = 0, netoB = 0;
  for (const p of A.personas) netoA += p.dinero?.netoPagar ?? 0;
  for (const p of B.personas) netoB += p.dinero?.netoPagar ?? 0;
  for (const p of B.personas) {
    const q = mapa.get(llave(p));
    if (!q) { console.log(`+ ${p.codigo} ${p.nombre ?? ""}: aparece en B y no en A`); cambios++; continue; }
    const dif: string[] = [];
    for (const c of CAMPOS) {
      const x = q.dinero?.[c] ?? null, y = p.dinero?.[c] ?? null;
      if (x !== y) dif.push(`${c} ${x} → ${y}`);
    }
    if (q.ausenciasDias !== p.ausenciasDias) dif.push(`ausencias(días) ${q.ausenciasDias} → ${p.ausenciasDias}`);
    if (q.minutosTarde !== p.minutosTarde) dif.push(`min tarde ${q.minutosTarde} → ${p.minutosTarde}`);
    if (q.extraMin !== p.extraMin) dif.push(`extra(min) ${q.extraMin} → ${p.extraMin}`);
    if (q.decidir !== p.decidir) dif.push(`decidir «${q.decidir}» → «${p.decidir}»`);
    if (q.prorrateo !== p.prorrateo) dif.push(`prorrateo «${q.prorrateo}» → «${p.prorrateo}»`);
    if (q.falta.join("|") !== p.falta.join("|")) dif.push(`falta [${q.falta}] → [${p.falta}]`);
    if (dif.length) { console.log(`≠ ${p.codigo} ${p.nombre ?? ""} (${p.linea}): ${dif.join(" · ")}`); cambios++; }
  }
  for (const q of A.personas) if (!B.personas.some((p) => llave(p) === llave(q))) { console.log(`- ${q.codigo} ${q.nombre ?? ""}: estaba en A y no en B`); cambios++; }
  console.log(`\nNeto total  A = ${netoA.toFixed(2)}   B = ${netoB.toFixed(2)}   diferencia = ${(netoB - netoA).toFixed(2)}`);
  console.log(`${cambios} línea(s) con diferencias.`);
}

async function medir() {
  const args = process.argv.slice(2);
  const salida = args.find((a) => !a.startsWith("--") && a.endsWith(".json"));
  if (!salida) throw new Error("falta el archivo de salida");
  const val = (k: string) => {
    const a = args.find((x) => x.startsWith(`--${k}=`));
    return a ? a.slice(k.length + 3) : null;
  };
  const desde = val("desde");
  const hasta = val("hasta");
  if (!desde || !hasta) throw new Error("faltan --desde y --hasta");
  const reloj = val("reloj") ?? hasta;
  const clave = val("clave");
  const hoy = hoyPanama();
  const factorBase = factorBaseDeRango(desde, hasta);

  const marcaciones = await leerTodoPaginado<MarcacionConId>(
    "asistencia_marcaciones (medición día 31)",
    (pedirCount, from, to) =>
      supabaseServer.from("asistencia_marcaciones")
        .select("id, empleado_codigo, empleado_nombre, ocurrio_en", pedirCount ? { count: "exact" } : {})
        .gte("ocurrio_en", instante(desde, false)).lte("ocurrio_en", instante(reloj, true))
        .order("ocurrio_en", { ascending: true }).order("id", { ascending: true }).range(from, to),
  );
  const [{ reglas }, personasDb, afuera, correcciones, manualesLeidos, aprRes, repRes, hRes, jRes, vRes, fRes] =
    await Promise.all([
      leerReglas(), leerPersonas(), leerTrabajaAfuera(), leerCorrecciones(desde, reloj),
      clave ? leerManuales(clave) : Promise.resolve({ porCodigo: new Map(), faltaMigracion: false }),
      leerAprobaciones(desde, reloj), leerRepartos(),
      supabaseServer.from("asistencia_horarios").select("empleado_codigo, entrada, salida, almuerzo_minutos"),
      leerJustificaciones(desde, reloj), leerVacaciones(desde, reloj),
      supabaseServer.from("asistencia_feriados").select("fecha, nombre").gte("fecha", desde).lte("fecha", reloj),
    ]);
  if (hRes.error) throw new Error(hRes.error.message);
  if (fRes.error) throw new Error(fRes.error.message);

  const horarios = (hRes.data ?? []).map((h) => ({
    ...h, entrada: String(h.entrada).slice(0, 5), salida: String(h.salida).slice(0, 5),
  })) as HorarioPersona[];
  const vigencias = vigenciasDeFilas(personasDb.filas);
  const fuera = codigosFueraDeRango(vigencias, desde, hasta);
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
      cobraHorasExtra: cobraHorasExtraDeFila(f), trabajaAfuera: afuera.has(codigo),
      reparto: partesDe(salario, repartoPorCodigo.get(codigo)),
    });
  }
  const nombres = new Map<string, string>();
  for (const [cod, f] of fichas) if (f.nombre) nombres.set(cod, f.nombre);
  const efectivas = aplicarCorrecciones(marcaciones, correcciones.correcciones);
  const personas = armarReporte({
    marcaciones: efectivas.marcaciones, horarios, justificaciones: jRes.filas, vacaciones: vRes.filas,
    feriados: new Map((fRes.data ?? []).map((f) => [String(f.fecha), String(f.nombre)])),
    desde, hasta: reloj, reglas, nombres, incluirNoHabiles: true, diaEnCurso: hoy,
    correccionesPorDia: efectivas.porDia, trabajaAfuera: afuera,
  });
  const horarioDe = new Map(horarios.map((h) => [h.empleado_codigo, h]));
  const personasVigentes = personas.filter((p) => !fuera.has(p.codigo));
  const prorrateo = new Map<string, { factor: number; texto: string }>();
  for (const [codigo, v] of vigencias) {
    if (fuera.has(codigo)) continue;
    const p = prorrateoPorVigencia(v, desde, hasta);
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
    factorBase, decidirAMano: new Map(), prorrateo, justificados,
  });
  const { lineas } = separarSinFicha(todas);
  const reporteDe = new Map(personasVigentes.map((p) => [p.codigo, p]));

  const filas: Fila[] = lineas.map((l) => {
    const p = reporteDe.get(l.codigo);
    const d = l.dinero;
    return {
      codigo: l.codigo, nombre: l.nombre, empresa: fichas.get(l.codigo)?.empresa ?? null,
      linea: l.parte?.empresa ?? fichas.get(l.codigo)?.empresa ?? null,
      diasConMarca: p?.resumen.diasTrabajados ?? 0,
      ausenciasDias: p?.resumen.ausenciasSinJustificar ?? 0,
      minutosTarde: p?.resumen.minutosTarde ?? 0,
      extraMin: p?.resumen.extraMin ?? 0,
      decidir: l.decidirAMano ?? null,
      prorrateo: l.prorrateo?.texto ?? null,
      falta: [...l.faltaConfigurar],
      dinero: d ? Object.fromEntries(CAMPOS.map((c) => [c, d[c]])) : null,
    };
  }).sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }) || String(a.linea).localeCompare(String(b.linea)));

  const out: Salida = { desde, hasta, reloj, clave, factorBase, hoy, personas: filas };
  writeFileSync(salida, JSON.stringify(out, null, 1));
  const neto = filas.reduce((s, f) => s + (f.dinero?.netoPagar ?? 0), 0);
  console.log(`${salida}: ${filas.length} líneas · paga ${desde} → ${hasta} (factor ${factorBase}) · reloj hasta ${reloj} · neto $${neto.toFixed(2)}`);
}

if (process.argv[2] === "--comparar") comparar(process.argv[3], process.argv[4]);
else medir().catch((e) => { console.error(e); process.exit(1); });
