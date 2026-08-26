/* ─────────────────────────────────────────────────────────────────────────────
 * ¿QUÉ PASA CUANDO SE LE CARGA UNA BASE PROPIA DE SEGUROS? — SOLO LECTURA.
 *
 * 🔴 NO ESCRIBE NI UNA FILA. La base se aplica EN MEMORIA sobre las fichas
 * leídas, así que producción queda intacta: esto mide lo que PASARÍA.
 *
 * 🔑 NINGÚN NÚMERO SALE DE UN `select` CRUDO: se lee por las MISMAS funciones
 * que usa la ruta (`leerPersonas`, `leerVacaciones`, `vigenciasDeFilas`,
 * `codigosFueraDeRango`, `motivosDeQuienNoMarco`, `aplicarCorrecciones`,
 * `separarSinFicha`, `totalizar`).
 *
 * ── LAS DOS PASADAS, Y HACEN FALTA LAS DOS ──────────────────────────────────
 *
 *   A. PRODUCCIÓN TAL CUAL ESTÁ HOY. Se le carga la base a Rodrigo y se
 *      compara contra no cargarla. Es la prueba de que **no se mueve un
 *      centavo de nadie más**.
 *
 *   B. 🩸 EL CASO QUE LA CONTADORA TIENE EN SU EXCEL. Medido el 26-ago-2026,
 *      RODRIGO MIRANDA (código 13, vistana) está marcado como SERVICIO
 *      PROFESIONAL en la ficha, o sea que hoy no produce ningún número. En el
 *      Excel de ella, en cambio, está en la planilla REGULAR de Vistana (hoja
 *      matriz «30 DE JULIO », fila 12: bruto 417,325 por fórmula, seguro social
 *      17,06 y educativo 2,19 escritos A MANO); los de «Servicios
 *      Profesionales» son otros dos, Andrea Pérez y Jorman Hernández. Esa
 *      contradicción es OTRA decisión, de Daniel, y este script no la toca:
 *      la simula en memoria para poder mostrar el antes y el después de su
 *      renglón, que es lo que se pidió medir.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_verif-seguros-base-propia.ts
 * ────────────────────────────────────────────────────────────────────────── */
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { armarReporte, type HorarioPersona, type Justificacion } from "@/lib/asistencia/reporte";
import { aplicarCorrecciones, type MarcacionConId } from "@/lib/asistencia/correcciones";
import { leerCorrecciones } from "@/lib/asistencia/correcciones-server";
import {
  leerReglas, leerPersonas, vigenciasDeFilas, leerVacaciones, leerJustificaciones,
  servicioProfesionalDeFila, pagaSegurosDeFila, noMarcaRelojDeFila, baseSegurosDeFila,
} from "@/lib/asistencia/config-server";
import { codigosFueraDeRango, motivoPeriodoParcial } from "@/lib/asistencia/vigencia";
import { motivosDeQuienNoMarco } from "@/lib/asistencia/periodo";
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
const CLAVES = process.argv.slice(2).length ? process.argv.slice(2) : ["2026-07-2", "2026-08-1"];

/** RODRIGO MIRANDA, y la base que dijo la contadora. */
const RODRIGO = { codigo: "13", empresa: "vistana", base: 175 };

interface Escenario {
  /** ¿Se le aplica la base propia de $175 a Rodrigo? */
  conBase: boolean;
  /** ¿Se lo saca de «servicio profesional» para que produzca número (pasada B)? */
  enPlanilla: boolean;
}

async function cuadro(claveQ: string, esc: Escenario) {
  const q = periodoDeQuincena(quincenaDesdeClave(claveQ)!);
  const marc = await leerTodoPaginado<MarcacionConId>("m", (c, f, t) =>
    supabaseServer.from("asistencia_marcaciones")
      .select("id, empleado_codigo, empleado_nombre, ocurrio_en", c ? { count: "exact" } : {})
      .gte("ocurrio_en", inst(q.desde, false)).lte("ocurrio_en", inst(q.hasta, true))
      .order("ocurrio_en", { ascending: true }).order("id", { ascending: true }).range(f, t));

  const [{ reglas }, pdb, corr, man, hR, jR, fR, vR] = await Promise.all([
    leerReglas(), leerPersonas(), leerCorrecciones(q.desde, q.hasta), leerManuales(q.claveManuales!),
    supabaseServer.from("asistencia_horarios").select("empleado_codigo, entrada, salida, almuerzo_minutos"),
    leerJustificaciones(q.desde, q.hasta),
    supabaseServer.from("asistencia_feriados").select("fecha, nombre").gte("fecha", q.desde).lte("fecha", q.hasta),
    leerVacaciones(q.desde, q.hasta),
  ]);
  const horarios = (hR.data ?? []).map((h: Record<string, unknown>) => ({
    ...h, entrada: String(h.entrada).slice(0, 5), salida: String(h.salida).slice(0, 5),
  })) as HorarioPersona[];
  const vig = vigenciasDeFilas(pdb.filas);
  const fuera = codigosFueraDeRango(vig, q.desde, q.hasta);

  const fichas = new Map<string, FichaPlanilla>();
  for (const f of pdb.filas) {
    const c = String(f.empleado_codigo);
    if (fuera.has(c)) continue;
    const empresa = f.empresa ?? null;
    const esRodrigo = c === RODRIGO.codigo && empresa === RODRIGO.empresa;
    fichas.set(c, {
      codigo: c, nombre: f.nombre ?? null,
      salarioMensual: f.salario_mensual === null ? null : Number(f.salario_mensual),
      jornadaSemanal: f.jornada_semanal ?? null,
      empresa,
      // 🔑 EN MEMORIA, y SOLO en la pasada B: producción sigue diciendo lo que
      // dice. Sacar a alguien de «servicio profesional» es una decisión de
      // Daniel, no de un script de medición.
      servicioProfesional:
        esRodrigo && esc.enPlanilla ? false : servicioProfesionalDeFila(f),
      pagaSeguros: pagaSegurosDeFila(f),
      // 🔑 EN MEMORIA, Y EN LOS DOS SENTIDOS. Para Rodrigo el escenario MANDA:
      // con `conBase` se le pone la base, y SIN `conBase` se le fuerza a `null`
      // aunque la fila ya la tenga guardada.
      //
      // 🩸 Ese `null` forzado no es un detalle: desde que la base está cargada
      // en producción (26-ago-2026), leerla de la fila haría que el "antes" y
      // el "después" fueran el MISMO cuadro y el script informara alegremente
      // que no se movió nada. Un instrumento que compara algo contra sí mismo
      // siempre da verde, y es la peor forma de fallar.
      baseSeguros: esRodrigo
        ? (esc.conBase ? RODRIGO.base : null)
        : baseSegurosDeFila(f),
      noMarcaReloj: noMarcaRelojDeFila(f),
    });
  }
  const nombres = new Map<string, string>();
  for (const [c, f] of fichas) if (f.nombre) nombres.set(c, f.nombre);
  const ef = aplicarCorrecciones(marc, corr.correcciones);
  const personas = armarReporte({
    marcaciones: ef.marcaciones, horarios,
    justificaciones: jR.filas as Justificacion[],
    vacaciones: vR.filas,
    feriados: new Map((fR.data ?? []).map((f: Record<string, unknown>) => [String(f.fecha), String(f.nombre)])),
    desde: q.desde, hasta: q.hasta, reglas, nombres, incluirNoHabiles: true,
    diaEnCurso: hoyPanama(), correccionesPorDia: ef.porDia,
  });
  const vigentes = personas.filter((p) => !fuera.has(p.codigo));
  const decidir = new Map<string, string>();
  for (const [c, v] of vig) {
    if (fuera.has(c)) continue;
    const mo = motivoPeriodoParcial(v, q.desde, q.hasta);
    if (mo) decidir.set(c, mo);
  }
  const just = motivosDeQuienNoMarco({ justificaciones: jR.filas, vacaciones: vR.filas });
  const hd = new Map(horarios.map((h) => [h.empleado_codigo, h]));

  const out = new Map<string, { lineas: LineaPlanilla[]; t: ReturnType<typeof totalizar> }>();
  for (const empresa of EMPRESAS) {
    const todas = armarPlanilla({
      personas: vigentes, fichas, manuales: man.porCodigo,
      jornadaDiariaMin: (c) => jornadaDiariaMin(hd.get(c) as HorarioPersona),
      reglas, empresa, factorBase: q.factorBase, decidirAMano: decidir, justificados: just,
    });
    const { lineas } = separarSinFicha(todas);
    out.set(empresa, { lineas, t: totalizar(lineas) });
  }
  return out;
}

const d2 = (n: number) => n.toFixed(2).padStart(10);

/** Compara dos cuadros línea por línea y devuelve cuántas se movieron. */
function comparar(
  antes: Awaited<ReturnType<typeof cuadro>>,
  despues: Awaited<ReturnType<typeof cuadro>>,
): number {
  let movidas = 0;
  for (const empresa of EMPRESAS) {
    const a = antes.get(empresa)!, b = despues.get(empresa)!;
    const cambioTotal =
      Math.abs(b.t.netoPagar - a.t.netoPagar) > 0.005
      || Math.abs(b.t.seguroSocial - a.t.seguroSocial) > 0.005
      || Math.abs(b.t.seguroEducativo - a.t.seguroEducativo) > 0.005
      || Math.abs(b.t.totalBruto - a.t.totalBruto) > 0.005;
    console.log(
      `  ${empresa.padEnd(20)} bruto ${d2(a.t.totalBruto)} → ${d2(b.t.totalBruto)}`
      + ` · segSoc ${d2(a.t.seguroSocial)} → ${d2(b.t.seguroSocial)}`
      + ` · segEdu ${d2(a.t.seguroEducativo)} → ${d2(b.t.seguroEducativo)}`
      + ` · NETO ${d2(a.t.netoPagar)} → ${d2(b.t.netoPagar)}`
      + (cambioTotal ? "   ← se movió" : ""),
    );
    const bm = new Map(b.lineas.map((l) => [l.codigo, l]));
    for (const la of a.lineas) {
      const lb = bm.get(la.codigo);
      if (!la.dinero || !lb?.dinero) {
        if (!!la.dinero !== !!lb?.dinero) {
          movidas += 1;
          console.log(`     🔵 ${la.codigo.padStart(3)} ${la.etiqueta}: dinero ${!!la.dinero} → ${!!lb?.dinero}`
            + (lb?.dinero ? `  neto ${lb.dinero.netoPagar.toFixed(2)}` : ""));
        }
        continue;
      }
      const dif = lb.dinero.netoPagar - la.dinero.netoPagar;
      const difBruto = lb.dinero.totalBruto - la.dinero.totalBruto;
      if (Math.abs(dif) < 0.005 && Math.abs(difBruto) < 0.005) continue;
      movidas += 1;
      console.log(
        `     ${la.codigo.padStart(3)} ${la.etiqueta.slice(0, 26).padEnd(26)}`
        + ` segSoc ${la.dinero.seguroSocial.toFixed(2)} → ${lb.dinero.seguroSocial.toFixed(2)}`
        + ` · segEdu ${la.dinero.seguroEducativo.toFixed(2)} → ${lb.dinero.seguroEducativo.toFixed(2)}`
        + ` · bruto ${la.dinero.totalBruto.toFixed(2)} → ${lb.dinero.totalBruto.toFixed(2)}`
        + (Math.abs(difBruto) > 0.005 ? " 🔴 EL BRUTO SE MOVIÓ" : "")
        + ` · NETO ${la.dinero.netoPagar.toFixed(2)} → ${lb.dinero.netoPagar.toFixed(2)}`
        + ` (${dif >= 0 ? "+" : ""}${dif.toFixed(2)})`
        + (lb.dinero.baseSeguros !== null ? `  [base ${lb.dinero.baseSeguros.toFixed(2)}]` : ""),
      );
    }
  }
  return movidas;
}

async function main() {
  console.log("⛔ SOLO LECTURA — la base se aplica EN MEMORIA. Producción no se toca.\n");

  for (const cl of CLAVES) {
    console.log("═".repeat(120));
    console.log(`QUINCENA ${cl}`);

    console.log("\n── PASADA A · producción TAL CUAL ESTÁ HOY (Rodrigo sigue en «servicio profesional») ──");
    console.log("   Lo que hay que probar: cargarle la base a Rodrigo NO mueve a NADIE.");
    const a0 = await cuadro(cl, { conBase: false, enPlanilla: false });
    const a1 = await cuadro(cl, { conBase: true, enPlanilla: false });
    const movidasA = comparar(a0, a1);
    console.log(`   ${movidasA === 0 ? "🟢" : "🔴"} líneas que cambiaron: ${movidasA}`);

    console.log("\n── PASADA B · el caso de la contadora (Rodrigo EN la planilla regular) ──");
    console.log("   Lo que hay que probar: su seguro social cae a 17,06 y el educativo a 2,19,");
    console.log("   su neto sube 25,18, y NADIE MÁS se mueve.");
    const b0 = await cuadro(cl, { conBase: false, enPlanilla: true });
    const b1 = await cuadro(cl, { conBase: true, enPlanilla: true });
    const movidasB = comparar(b0, b1);
    console.log(`   líneas que cambiaron: ${movidasB} ${movidasB === 1 ? "🟢 (solo Rodrigo)" : "🔴"}`);

    // El renglón de Rodrigo, entero, en los dos escenarios.
    const antesR = b0.get("vistana")!.lineas.find((l) => l.codigo === RODRIGO.codigo);
    const despR = b1.get("vistana")!.lineas.find((l) => l.codigo === RODRIGO.codigo);
    if (antesR?.dinero && despR?.dinero) {
      const A = antesR.dinero, B = despR.dinero;
      console.log(`\n   RODRIGO MIRANDA (13, vistana) — el renglón:`);
      console.log(`     bruto        ${d2(A.totalBruto)} → ${d2(B.totalBruto)}`);
      console.log(`     seg. social  ${d2(A.seguroSocial)} → ${d2(B.seguroSocial)}`);
      console.log(`     seg. educ.   ${d2(A.seguroEducativo)} → ${d2(B.seguroEducativo)}`);
      console.log(`     deducciones  ${d2(A.totalDeducciones)} → ${d2(B.totalDeducciones)}`);
      console.log(`     NETO         ${d2(A.netoPagar)} → ${d2(B.netoPagar)}`
        + `   (+${(B.netoPagar - A.netoPagar).toFixed(2)})`);
      console.log(`     sello        ${despR.dinero.baseSeguros === null ? "—" : `seguros sobre ${despR.dinero.baseSeguros.toFixed(2)}`}`);
    } else {
      console.log(`\n   ⚠️ Rodrigo no produce número en ${cl} ni sacándolo de servicio profesional:`);
      console.log(`      ${despR ? `falta=[${despR.faltaConfigurar.join("; ")}] decidir=${despR.decidirAMano ?? "-"}` : "no aparece en el cuadro"}`);
    }
    console.log("");
  }
}
void main().catch((e) => { console.error(e); process.exitCode = 1; });
