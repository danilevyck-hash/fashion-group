/* ─────────────────────────────────────────────────────────────────────────────
 * ¿QUÉ PASA CUANDO SE APAGA EL INTERRUPTOR DE LOS SEGUROS?  — SOLO LECTURA.
 *
 * 🔴 NO ESCRIBE NI UNA FILA. La lista de la contadora se aplica EN MEMORIA
 * sobre las fichas leídas, así que producción queda intacta: esto mide lo que
 * PASARÍA si Daniel corre el bloque comentado del pie de la migración.
 *
 * 🔑 NINGÚN NÚMERO SALE DE UN `select` CRUDO: se lee por las MISMAS funciones
 * que usa la pantalla (`leerPersonas`, `vigenciasDeFilas`, `codigosFueraDeRango`,
 * `aplicarCorrecciones`, `hoyPanama`/`diaEnCurso`, `separarSinFicha`).
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_verif-planilla-seguros.ts
 * ────────────────────────────────────────────────────────────────────────── */
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { armarReporte, type HorarioPersona, type Justificacion } from "@/lib/asistencia/reporte";
import { aplicarCorrecciones, type MarcacionConId } from "@/lib/asistencia/correcciones";
import { leerCorrecciones } from "@/lib/asistencia/correcciones-server";
import {
  leerReglas, leerPersonas, vigenciasDeFilas,
  servicioProfesionalDeFila, pagaSegurosDeFila,
} from "@/lib/asistencia/config-server";
import { codigosFueraDeRango, motivoPeriodoParcial } from "@/lib/asistencia/vigencia";
import { textoJustificacion } from "@/lib/asistencia/periodo";
import { hoyPanama } from "@/lib/fecha-panama";
import {
  armarPlanilla, jornadaDiariaMin, periodoDeQuincena, quincenaDesdeClave,
  separarSinFicha, totalizar, type FichaPlanilla, type LineaPlanilla,
} from "@/lib/asistencia/planilla";
import { leerManuales } from "@/lib/asistencia/planilla-server";

const PANAMA = "-05:00";
const inst = (d: string, fin: boolean) =>
  new Date(Date.parse(`${d}T${fin ? "23:59:59.999" : "00:00:00.000"}${PANAMA}`)).toISOString();
const EMPRESAS = ["confecciones_boston", "vistana", "fashion_wear"];
const CLAVES = ["2026-07-1", "2026-07-2", "2026-08-1"];

/** Los 9 códigos que en el Excel de la contadora tienen la fórmula del 9,75 %.
 *  Es la MISMA lista que el bloque comentado del pie de la migración. */
const CON_SEGUROS = new Set([
  "boston:8", "boston:22", "boston:18", "boston:38",
  "vistana:11", "vistana:7", "vistana:1", "vistana:13", "vistana:9",
]);
const clave = (empresa: string | null, cod: string) =>
  `${empresa === "confecciones_boston" ? "boston" : empresa}:${cod}`;

/** ¿Se le pone a Rodrigo (13, vistana) la jornada de 40 h que dice Daniel?
 *  También EN MEMORIA: cambiar una jornada en producción es cambiarle la rata
 *  —y con ella toda su hora extra— a una persona de verdad. */
const RODRIGO_40 = process.env.RODRIGO_40 === "1";

async function cuadro(claveQ: string, aplicarLista: boolean) {
  const q = periodoDeQuincena(quincenaDesdeClave(claveQ)!);
  const marc = await leerTodoPaginado<MarcacionConId>("m", (c, f, t) =>
    supabaseServer.from("asistencia_marcaciones")
      .select("id, empleado_codigo, empleado_nombre, ocurrio_en", c ? { count: "exact" } : {})
      .gte("ocurrio_en", inst(q.desde, false)).lte("ocurrio_en", inst(q.hasta, true))
      .order("ocurrio_en", { ascending: true }).order("id", { ascending: true }).range(f, t));

  const [{ reglas }, pdb, corr, man, hR, jR, fR] = await Promise.all([
    leerReglas(), leerPersonas(), leerCorrecciones(q.desde, q.hasta), leerManuales(q.claveManuales!),
    supabaseServer.from("asistencia_horarios").select("empleado_codigo, entrada, salida, almuerzo_minutos"),
    supabaseServer.from("asistencia_justificaciones").select("empleado_codigo, desde, hasta, motivo").lte("desde", q.hasta).gte("hasta", q.desde),
    supabaseServer.from("asistencia_feriados").select("fecha, nombre").gte("fecha", q.desde).lte("fecha", q.hasta),
  ]);
  const horarios = (hR.data ?? []).map((h: any) => ({ ...h, entrada: String(h.entrada).slice(0, 5), salida: String(h.salida).slice(0, 5) })) as HorarioPersona[];
  const vig = vigenciasDeFilas(pdb.filas);
  const fuera = codigosFueraDeRango(vig, q.desde, q.hasta);

  const fichas = new Map<string, FichaPlanilla>();
  for (const f of pdb.filas as any[]) {
    const c = String(f.empleado_codigo);
    if (fuera.has(c)) continue;
    const empresa = f.empresa ?? null;
    fichas.set(c, {
      codigo: c, nombre: f.nombre ?? null,
      salarioMensual: f.salario_mensual === null ? null : Number(f.salario_mensual),
      jornadaSemanal:
        aplicarLista && RODRIGO_40 && c === "13" && empresa === "vistana"
          ? 40
          : (f.jornada_semanal ?? null),
      empresa,
      servicioProfesional: servicioProfesionalDeFila(f),
      // 🔑 EN MEMORIA. Sin `aplicarLista` sale lo que dice la base de verdad
      // (hoy: todos pagan, porque la columna ni existe todavía).
      pagaSeguros: aplicarLista ? CON_SEGUROS.has(clave(empresa, c)) : pagaSegurosDeFila(f),
    });
  }
  const nombres = new Map<string, string>();
  for (const [c, f] of fichas) if (f.nombre) nombres.set(c, f.nombre);
  const ef = aplicarCorrecciones(marc, corr.correcciones);
  const personas = armarReporte({
    marcaciones: ef.marcaciones, horarios,
    justificaciones: (jR.data ?? []) as Justificacion[],
    feriados: new Map((fR.data ?? []).map((f: any) => [String(f.fecha), String(f.nombre)])),
    desde: q.desde, hasta: q.hasta, reglas, nombres, incluirNoHabiles: true,
    diaEnCurso: hoyPanama(), correccionesPorDia: ef.porDia,
  });
  const vigentes = personas.filter((p) => !fuera.has(p.codigo));
  const decidir = new Map<string, string>();
  for (const [c, v] of vig) { if (fuera.has(c)) continue; const mo = motivoPeriodoParcial(v, q.desde, q.hasta); if (mo) decidir.set(c, mo); }
  const just = new Map<string, string>();
  for (const j of (jR.data ?? []) as any[]) {
    const c = String(j.empleado_codigo);
    const t = textoJustificacion(String(j.motivo), String(j.desde), String(j.hasta));
    just.set(c, just.get(c) ? `${just.get(c)} · ${t}` : t);
  }
  const hd = new Map(horarios.map((h) => [h.empleado_codigo, h]));

  const out = new Map<string, { lineas: LineaPlanilla[]; neto: number; segSoc: number; segEdu: number }>();
  for (const empresa of EMPRESAS) {
    const todas = armarPlanilla({
      personas: vigentes, fichas, manuales: man.porCodigo,
      jornadaDiariaMin: (c) => jornadaDiariaMin(hd.get(c) as any),
      reglas, empresa, factorBase: q.factorBase, decidirAMano: decidir, justificados: just,
    });
    const { lineas } = separarSinFicha(todas);
    const t = totalizar(lineas);
    out.set(empresa, { lineas, neto: t.netoPagar, segSoc: t.seguroSocial, segEdu: t.seguroEducativo });
  }
  return out;
}

const d2 = (n: number) => n.toFixed(2).padStart(10);

async function main() {
  console.log("SOLO LECTURA — la lista de la contadora se aplica EN MEMORIA.\n");
  let totalAntes = 0, totalDespues = 0;
  for (const cl of CLAVES) {
    const antes = await cuadro(cl, false);
    const despues = await cuadro(cl, true);
    console.log(`${"═".repeat(96)}\nQUINCENA ${cl}`);
    for (const empresa of EMPRESAS) {
      const a = antes.get(empresa)!, b = despues.get(empresa)!;
      totalAntes += a.neto; totalDespues += b.neto;
      console.log(`\n  ${empresa}   NETO ${d2(a.neto)} → ${d2(b.neto)}   (${(b.neto - a.neto >= 0 ? "+" : "")}${(b.neto - a.neto).toFixed(2)})`
        + `   segSoc ${a.segSoc.toFixed(2)}→${b.segSoc.toFixed(2)} · segEdu ${a.segEdu.toFixed(2)}→${b.segEdu.toFixed(2)}`);
      const bm = new Map(b.lineas.map((l) => [l.codigo, l]));
      for (const la of a.lineas) {
        const lb = bm.get(la.codigo);
        if (!la.dinero || !lb?.dinero) {
          // Una línea sin dinero de los dos lados no se movió; si cambió de
          // estado hay que verlo, así que se denuncia.
          if (!!la.dinero !== !!lb?.dinero) console.log(`     🔴 ${la.etiqueta} cambió de estado (dinero ${!!la.dinero} → ${!!lb?.dinero})`);
          continue;
        }
        const d = lb.dinero.netoPagar - la.dinero.netoPagar;
        if (Math.abs(d) < 0.005) continue;
        console.log(`     ${la.codigo.padStart(3)} ${la.etiqueta.slice(0, 28).padEnd(28)}`
          + ` neto ${d2(la.dinero.netoPagar)} → ${d2(lb.dinero.netoPagar)}  (+${d.toFixed(2)})`
          + `   segSoc ${la.dinero.seguroSocial.toFixed(2)}→${lb.dinero.seguroSocial.toFixed(2)}`
          + ` · segEdu ${la.dinero.seguroEducativo.toFixed(2)}→${lb.dinero.seguroEducativo.toFixed(2)}`
          + `   bruto ${la.dinero.totalBruto.toFixed(2)}→${lb.dinero.totalBruto.toFixed(2)}`
          + (Math.abs(lb.dinero.totalBruto - la.dinero.totalBruto) > 0.005 ? "  🔴 EL BRUTO SE MOVIÓ" : "")
          + (Math.abs(lb.dinero.rataHora - la.dinero.rataHora) > 0.0005
            ? `  rata ${la.dinero.rataHora}→${lb.dinero.rataHora}` : ""));
      }
    }
  }
  console.log(`\n${"═".repeat(96)}\nTOTAL 3 QUINCENAS × 3 EMPRESAS: ${totalAntes.toFixed(2)} → ${totalDespues.toFixed(2)} `
    + `(${(totalDespues - totalAntes >= 0 ? "+" : "")}${(totalDespues - totalAntes).toFixed(2)})`);
}
void main().catch((e) => { console.error(e); process.exitCode = 1; });
