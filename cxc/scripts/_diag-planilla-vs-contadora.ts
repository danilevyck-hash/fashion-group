/* Auditoría SOLO LECTURA: corre la MISMA lógica del route GET
 * /api/asistencia/planilla (sin auth) para la quincena pedida y vuelca todo.
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-planilla-vs-contadora.ts 2026-07-2
 *
 * ── 🩸 POR QUÉ ESTE ARCHIVO AHORA ESTÁ EN EL REPO (25-ago-2026) ─────────────
 *
 * Vivía SUELTO en la máquina de Daniel, sin versionar. Es el instrumento con el
 * que se coteja el cuadro contra la contadora —o sea, con el que se decide si
 * un pago está bien—, y por estar afuera del repo no tenía candado, nadie lo
 * actualizaba cuando la fuente cambiaba y ningún test podía enterarse.
 *
 * Y se cobró: el día que las VACACIONES se mudaron a su propia tabla, la ruta
 * aprendió a leerlas y esta copia no. Medido en producción, quincenas 2026-07-2
 * y 2026-08-1: ELOYN MENDOZA salía acá como «no marcó ni un día en esta
 * quincena» —el cajón de «falta un dato»— mientras la PANTALLA decía, bien,
 * «Vacaciones del 16 jul 2026 al 13 ago 2026». El instrumento mentía y la
 * pantalla no, que es la peor combinación: es el instrumento el que se mira
 * para saber si hay algo que arreglar.
 *
 * 🔴 LA REGLA QUE LO EVITA, y está cuidada por
 * `src/__tests__/lib/asistencia-vacaciones-decidir.test.ts`: este archivo NO
 * puede volver a armar a mano el mapa de «por qué no marcó». Lo pide por la
 * fuente única (`motivosDeQuienNoMarco`) y lee las vacaciones por la de
 * siempre (`leerVacaciones`), igual que la ruta.
 *
 * ⛔ SOLO LECTURA: no escribe una fila. Es una auditoría, no una corrida.
 */
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { armarReporte, type HorarioPersona, type Justificacion } from "@/lib/asistencia/reporte";
import { aplicarCorrecciones, contarCorrecciones, type MarcacionConId } from "@/lib/asistencia/correcciones";
import { leerCorrecciones } from "@/lib/asistencia/correcciones-server";
import { leerReglas, leerPersonas, vigenciasDeFilas, servicioProfesionalDeFila, pagaSegurosDeFila, noMarcaRelojDeFila, leerJustificaciones, leerVacaciones } from "@/lib/asistencia/config-server";
import { codigosFueraDeRango, motivoPeriodoParcial } from "@/lib/asistencia/vigencia";
import { motivosDeQuienNoMarco } from "@/lib/asistencia/periodo";
import { hoyPanama } from "@/lib/fecha-panama";
import {
  armarPlanilla, jornadaDiariaMin, periodoDeQuincena, quincenaDesdeClave,
  separarSinFicha, totalizar, type FichaPlanilla,
} from "@/lib/asistencia/planilla";
import { leerManuales } from "@/lib/asistencia/planilla-server";

const PANAMA = "-05:00";
const instante = (d: string, fin: boolean) =>
  new Date(Date.parse(`${d}T${fin ? "23:59:59.999" : "00:00:00.000"}${PANAMA}`)).toISOString();
const CLAVE = process.argv[2] ?? "2026-07-2";
const EMPRESAS = ["confecciones_boston", "vistana", "fashion_wear"];
const m = (n: number | null | undefined) => (n == null ? "     -" : n.toFixed(2).padStart(9));

async function main() {
  const q = periodoDeQuincena(quincenaDesdeClave(CLAVE)!);
  console.log(`PERÍODO ${q.desde} → ${q.hasta}  (clave manuales ${q.claveManuales})  factorBase ${q.factorBase}`);

  const marcaciones = await leerTodoPaginado<MarcacionConId>("marc", (c, from, to) =>
    supabaseServer.from("asistencia_marcaciones")
      .select("id, empleado_codigo, empleado_nombre, ocurrio_en", c ? { count: "exact" } : {})
      .gte("ocurrio_en", instante(q.desde, false)).lte("ocurrio_en", instante(q.hasta, true))
      .order("ocurrio_en", { ascending: true }).order("id", { ascending: true }).range(from, to));

  const [{ reglas }, personasDb, correcciones, manualesLeidos, hRes, jRes, vRes, fRes] = await Promise.all([
    leerReglas(), leerPersonas(), leerCorrecciones(q.desde, q.hasta),
    leerManuales(q.claveManuales!),
    supabaseServer.from("asistencia_horarios").select("empleado_codigo, entrada, salida, almuerzo_minutos"),
    leerJustificaciones(q.desde, q.hasta),
    // 🔴 Por la MISMA puerta que la ruta. Sin esto el instrumento cuenta los
    // días de vacaciones como ausencia y manda a «falta un dato» a quien está
    // de vacaciones.
    leerVacaciones(q.desde, q.hasta),
    supabaseServer.from("asistencia_feriados").select("fecha, nombre").gte("fecha", q.desde).lte("fecha", q.hasta),
  ]);
  const horarios = (hRes.data ?? []).map((h: any) => ({ ...h, entrada: String(h.entrada).slice(0,5), salida: String(h.salida).slice(0,5) })) as HorarioPersona[];
  console.log(`marcaciones ${marcaciones.length} · fichas ${personasDb.filas.length} · horarios ${horarios.length} · feriados ${(fRes.data??[]).length} · correcciones ${contarCorrecciones(correcciones.correcciones as any) ?? "?"}`);
  console.log(`REGLAS: ${JSON.stringify(reglas)}`);
  console.log(`FERIADOS: ${JSON.stringify(fRes.data)}`);
  console.log(`JUSTIFICACIONES que tocan el período: ${jRes.filas.length} (faltaColsHoras=${jRes.faltaColumnasHoras})`);
  for (const j of jRes.filas as any[]) console.log(`   cod ${j.empleado_codigo}  ${j.motivo}  ${j.desde} → ${j.hasta}`);
  console.log(`VACACIONES que tocan el período: ${vRes.filas.length} (faltaTabla=${vRes.faltaTabla})`);
  for (const v of vRes.filas) console.log(`   cod ${v.empleado_codigo}  ${v.desde} → ${v.hasta}  yaPagadas=${v.ya_pagadas}`);
  console.log(`MANUALES guardados en ${q.claveManuales}: ${manualesLeidos.porCodigo.size}`);
  for (const [c, v] of manualesLeidos.porCodigo) console.log(`   cod ${c}  ${JSON.stringify(v)}`);

  const vigencias = vigenciasDeFilas(personasDb.filas);
  const fuera = codigosFueraDeRango(vigencias, q.desde, q.hasta);
  const fichas = new Map<string, FichaPlanilla>();
  for (const f of personasDb.filas) {
    const codigo = String(f.empleado_codigo);
    if (fuera.has(codigo)) continue;
    fichas.set(codigo, {
      codigo, nombre: (f as any).nombre ?? null,
      salarioMensual: (f as any).salario_mensual === null ? null : Number((f as any).salario_mensual),
      jornadaSemanal: (f as any).jornada_semanal ?? null, empresa: (f as any).empresa ?? null,
      servicioProfesional: servicioProfesionalDeFila(f),
      pagaSeguros: pagaSegurosDeFila(f),
      noMarcaReloj: noMarcaRelojDeFila(f),
    });
  }
  const nombres = new Map<string, string>();
  for (const [c, f] of fichas) if (f.nombre) nombres.set(c, f.nombre);
  const efectivas = aplicarCorrecciones(marcaciones, correcciones.correcciones);
  const hoy = hoyPanama();
  const personas = armarReporte({
    marcaciones: efectivas.marcaciones, horarios,
    justificaciones: jRes.filas as Justificacion[],
    // 🔴 Y AL MOTOR TAMBIÉN: un día de vacaciones no calcula nada del reloj, y
    // sin esta línea el instrumento le contaría horas y tardanza a alguien que
    // estaba de vacaciones.
    vacaciones: vRes.filas,
    feriados: new Map((fRes.data ?? []).map((f: any) => [String(f.fecha), String(f.nombre)])),
    desde: q.desde, hasta: q.hasta, reglas, nombres, incluirNoHabiles: true,
    diaEnCurso: hoy, correccionesPorDia: efectivas.porDia,
  });
  const horarioDe = new Map(horarios.map((h) => [h.empleado_codigo, h]));
  const personasVigentes = personas.filter((p) => !fuera.has(p.codigo));
  const decidirAMano = new Map<string, string>();
  for (const [codigo, v] of vigencias) {
    if (fuera.has(codigo)) continue;
    const mo = motivoPeriodoParcial(v, q.desde, q.hasta);
    if (mo) decidirAMano.set(codigo, mo);
  }
  // 🔴 POR LA FUENTE ÚNICA. Armarlo a mano acá es EXACTAMENTE el bug que este
  // archivo tuvo: la ruta y esta copia decidían por separado por qué alguien no
  // marcó, y el día que las vacaciones cambiaron de tabla solo una se enteró.
  const justificados = motivosDeQuienNoMarco({
    justificaciones: jRes.filas,
    vacaciones: vRes.filas,
  });

  for (const empresa of EMPRESAS) {
    const todas = armarPlanilla({
      personas: personasVigentes, fichas, manuales: manualesLeidos.porCodigo,
      jornadaDiariaMin: (c) => jornadaDiariaMin(horarioDe.get(c) as any),
      reglas, empresa, factorBase: q.factorBase, decidirAMano, justificados,
    });
    const { lineas, sinFicha } = separarSinFicha(todas);
    const t = totalizar(lineas);
    console.log(`\n${"=".repeat(140)}\nEMPRESA: ${empresa}   (${lineas.length} líneas, sin ficha aparte: ${sinFicha.map(s=>s.codigo).join(",")})`);
    console.log(["PERSONA".padEnd(26),"COD".padEnd(4),"QNAL","EX1.25","AUSEN","TARDA","EX1.50","EXCED","DOMIN","FERIA","BRUTO","SEGSOC","SEGEDU","ISR","PREST","TERC","MERC","TOTDED","OTROSV","NETO"].map((x,i)=>i<2?x:x.padStart(9)).join(" "));
    for (const l of lineas.sort((a,b)=>a.etiqueta.localeCompare(b.etiqueta))) {
      const d = l.dinero;
      if (!d) { console.log(`${l.etiqueta.slice(0,26).padEnd(26)} ${l.codigo.padEnd(4)} SIN DINERO -> falta=[${l.faltaConfigurar.join("; ")}] fuera=${l.fueraDePlanilla} decidir=${l.decidirAMano ?? "-"} qnalRef=${l.quincenalReferencia}`); continue; }
      console.log([l.etiqueta.slice(0,26).padEnd(26), l.codigo.padEnd(4), m(d.salarioQuincenal), m(d.extraDiurno), m(d.ausencias), m(d.tardanzas), m(d.extraNocturno), m(d.excedente), m(d.domingos), m(d.feriados), m(d.totalBruto), m(d.seguroSocial), m(d.seguroEducativo), m(d.isr), m(d.prestamo), m(d.terceros), m(d.mercancia), m(d.totalDeducciones), m(d.otrosServicios), m(d.netoPagar)].join(" "));
      console.log(`${"".padEnd(31)} horas: rata ${d.rataHora} · jornadaDia ${l.horas.jornadaDiariaMin}min · ausenciaMin ${l.horas.ausenciaMin} (${l.horas.ausenciaDias}d) · tardanzaMin ${l.horas.tardanzaMin} · ex1.25 ${l.horas.extraDiurnoMin} · ex1.50 ${l.horas.extraNocturnoMin} · exced ${l.horas.excedenteMin} · dom ${l.horas.domingoMin} · sab ${l.horas.sabadoMin} · fer ${l.horas.feriadoMin} · ausJustDias ${l.horas.ausenciaJustificadaDias} · salario ${l.salarioMensual}/${l.jornadaSemanal}h`);
    }
    console.log(`TOTALES: bruto ${t.totalBruto.toFixed(2)} · ausencias ${t.ausencias.toFixed(2)} · tardanzas ${t.tardanzas.toFixed(2)} · segsoc ${t.seguroSocial.toFixed(2)} · segedu ${t.seguroEducativo.toFixed(2)} · deducciones ${t.totalDeducciones.toFixed(2)} · NETO ${t.netoPagar.toFixed(2)} · conDinero ${t.conDinero} · sinConfigurar ${(t as any).sinConfigurar} · ${JSON.stringify(t)}`);
  }
}
void main().catch((e) => { console.error(e); process.exitCode = 1; });
