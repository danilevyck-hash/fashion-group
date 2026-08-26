/* ─────────────────────────────────────────────────────────────────────────────
 * «TRABAJO FUERA DE LA OFICINA» — ¿SE MOVIÓ UN CENTAVO? Solo lectura, contra
 * producción.
 *
 * Contesta las TRES preguntas de este cambio, con los números a la vista:
 *
 *   PASADA 1 — el CÓDIGO no mueve nada.
 *     Motor VIEJO (`origin/main`, sacado AL CORRER) contra motor NUEVO, sobre
 *     LOS MISMOS datos de producción. Tiene que dar 0 diferencias: el motivo
 *     nuevo todavía no existe en ninguna fila, así que agregarlo no puede
 *     cambiar una quincena.
 *
 *   PASADA 2 — la JUSTIFICACIÓN de Rodrigo no toca a nadie más.
 *     Motor NUEVO sin la justificación contra motor NUEVO CON la justificación
 *     de RODRIGO MIRANDA (13) del 1 al 13 de agosto, INYECTADA EN MEMORIA.
 *     Solo Rodrigo puede cambiar, y solo hacia "no se le descuenta".
 *
 *   PASADA 3 — cero horas extra.
 *     Sin marcaciones no hay horas que medir: ni se le inventan 8, ni se le
 *     quitan. Se imprimen los minutos de extras/domingos/feriados.
 *
 * ⚠️ NO ESCRIBE NADA. La justificación de Rodrigo NO se carga acá — la carga
 * una persona desde la pantalla. Acá se calcula en memoria.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_verif-motivo-trabajo-fuera.ts
 * ────────────────────────────────────────────────────────────────────────── */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import * as NUEVO_PLANILLA from "@/lib/asistencia/planilla";
import { leerVacaciones } from "@/lib/asistencia/config-server";
import * as NUEVO_REPORTE from "@/lib/asistencia/reporte";
import { reglasDesdeFila as reglasNuevo } from "@/lib/asistencia/config";
import { MOTIVO_TRABAJO_FUERA } from "@/lib/asistencia/motivos";

/** El motor VIEJO se saca de `origin/main` AL CORRER: una copia versionada
 *  envejece sola y en dos semanas compararía contra algo que ya no es "antes". */
const DIR_ANTES = path.join(process.cwd(), "src/lib/asistencia-antes");
const MODULOS = ["config.ts", "reporte.ts", "planilla.ts", "directorio.ts", "motivos.ts", "correcciones.ts"];

function traerMotorViejo() {
  fs.mkdirSync(DIR_ANTES, { recursive: true });
  for (const f of MODULOS) {
    let contenido = "";
    for (const ruta of [`origin/main:cxc/src/lib/asistencia/${f}`, `origin/main:src/lib/asistencia/${f}`]) {
      try { contenido = execFileSync("git", ["show", ruta], { encoding: "utf8" }); break; } catch { /* la otra */ }
    }
    if (!contenido) throw new Error(`No pude sacar ${f} de origin/main`);
    fs.writeFileSync(path.join(DIR_ANTES, f), contenido);
  }
}
const borrarMotorViejo = () => fs.rmSync(DIR_ANTES, { recursive: true, force: true });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const PANAMA = "-05:00";
const instante = (dia: string, fin: boolean) =>
  new Date(Date.parse(`${dia}T${fin ? "23:59:59.999" : "00:00:00.000"}${PANAMA}`)).toISOString();

/** El caso real: Rodrigo no marca desde el 31 de julio porque está trabajando afuera. */
const RODRIGO = "13";
const JUSTI_RODRIGO = { empleado_codigo: RODRIGO, desde: "2026-08-01", hasta: "2026-08-13", motivo: MOTIVO_TRABAJO_FUERA };

/** Las quincenas con datos cargados. La 1ª de agosto es la de Rodrigo. */
const QUINCENAS = ["2026-07-1", "2026-07-2", "2026-08-1"];
const EMPRESAS = ["confecciones_boston", "vistana", "fashion_wear"];

async function todo<T>(tabla: string, arma: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await arma(db.from(tabla)).range(from, from + 999);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

/** ⚠️ `centavos()` de planilla.ts devuelve DÓLARES redondeados al centavo, NO
 *  centavos enteros. Dividir por 100 acá mostraría todo 100 veces más chico. */
const fmt = (d: number) => `$${(d ?? 0).toFixed(2)}`;

async function main() {
  const VIEJO_PLANILLA = await import("@/lib/asistencia-antes/planilla");
  const VIEJO_REPORTE = await import("@/lib/asistencia-antes/reporte");
  const { reglasDesdeFila: reglasViejo } = await import("@/lib/asistencia-antes/config");

  const { data: filaReglas } = await db.from("asistencia_reglas").select("*").eq("id", 1).maybeSingle();
  const rViejo = reglasViejo(filaReglas as Record<string, unknown> | null);
  const rNuevo = reglasNuevo(filaReglas as Record<string, unknown> | null);

  const personas = await todo<any>("asistencia_personas", (q) =>
    q.select("empleado_codigo, nombre, salario_mensual, jornada_semanal, empresa, fecha_ingreso, fecha_salida, servicio_profesional"));
  const horariosRaw = await todo<any>("asistencia_horarios", (q) =>
    q.select("empleado_codigo, entrada, salida, almuerzo_minutos"));
  const horarios = horariosRaw.map((h) => ({
    ...h, entrada: String(h.entrada).slice(0, 5), salida: String(h.salida).slice(0, 5),
  }));

  const ficha13 = personas.find((p) => String(p.empleado_codigo) === RODRIGO);
  console.log("RODRIGO MIRANDA (13) en producción:");
  console.log(`  nombre=${ficha13?.nombre}  empresa=${ficha13?.empresa}  salario=${ficha13?.salario_mensual}`);
  console.log(`  motivo que se va a usar: «${MOTIVO_TRABAJO_FUERA}»`);
  console.log(`  justificación SIMULADA (no se escribe): ${JUSTI_RODRIGO.desde} → ${JUSTI_RODRIGO.hasta}\n`);

  let dif1 = 0, dif2 = 0, cifras = 0, lineas = 0;
  let ajenosMovidos = 0;
  let paridad = 0, paridadRota = 0, distincionOk = 0, distincionRota = 0;

  for (const clave of QUINCENAS) {
    const q = NUEVO_PLANILLA.quincenaDesdeClave(clave)!;
    const marcaciones = await todo<any>("asistencia_marcaciones", (x) =>
      x.select("empleado_codigo, empleado_nombre, ocurrio_en")
        .gte("ocurrio_en", instante(q.desde, false))
        .lte("ocurrio_en", instante(q.hasta, true))
        .order("ocurrio_en", { ascending: true }).order("id", { ascending: true }));
    const { data: justProd } = await db.from("asistencia_justificaciones")
      .select("empleado_codigo, desde, hasta, motivo").lte("desde", q.hasta).gte("hasta", q.desde);
    // 🔴 Las VACACIONES. Este script lee PRODUCCIÓN y arma la planilla: sin
    // ellas, un día de vacaciones vuelve a contarse como ausencia. Por la fuente
    // única de lectura, nunca con un `select` copiado.
    const { filas: vacs } = await leerVacaciones(q.desde, q.hasta);
    const { data: fer } = await db.from("asistencia_feriados")
      .select("fecha, nombre").gte("fecha", q.desde).lte("fecha", q.hasta);
    const feriados = new Map((fer ?? []).map((f: any) => [String(f.fecha), String(f.nombre)]));

    const justSin = (justProd ?? []) as any[];
    // La justificación de Rodrigo, SOLO si esta quincena la toca.
    const tocaRodrigo = JUSTI_RODRIGO.desde <= q.hasta && JUSTI_RODRIGO.hasta >= q.desde;
    const justCon = tocaRodrigo ? [...justSin, JUSTI_RODRIGO] : justSin;

    const manuales = new Map<string, any>();
    {
      const { data } = await db.from("asistencia_planilla_manual")
        .select("empleado_codigo, isr, prestamo, terceros, mercancia, otros_servicios")
        .eq("quincena", q.clave);
      for (const m of (data ?? []) as any[]) {
        manuales.set(String(m.empleado_codigo), {
          isr: Number(m.isr ?? 0), prestamo: Number(m.prestamo ?? 0),
          terceros: Number(m.terceros ?? 0), mercancia: Number(m.mercancia ?? 0),
          otrosServicios: Number(m.otros_servicios ?? 0),
        });
      }
    }

    for (const empresa of EMPRESAS) {
      const fuera = new Set<string>();
      for (const p of personas) {
        const s = p.fecha_salida ? String(p.fecha_salida) : null;
        const i = p.fecha_ingreso ? String(p.fecha_ingreso) : null;
        if ((s && s < q.desde) || (i && i > q.hasta)) fuera.add(String(p.empleado_codigo));
      }
      const fichas = new Map<string, any>();
      for (const p of personas) {
        const cod = String(p.empleado_codigo);
        if (fuera.has(cod)) continue;
        fichas.set(cod, {
          codigo: cod, nombre: p.nombre ?? null,
          salarioMensual: p.salario_mensual === null ? null : Number(p.salario_mensual),
          jornadaSemanal: p.jornada_semanal ?? null, empresa: p.empresa ?? null,
          servicioProfesional: p.servicio_profesional === true,
        });
      }
      const nombres = new Map<string, string>();
      for (const [cod, f] of fichas) if (f.nombre) nombres.set(cod, f.nombre);
      const horarioDe = new Map(horarios.map((h) => [h.empleado_codigo, h]));
      const jornada = (c: string) => NUEVO_PLANILLA.jornadaDiariaMin(horarioDe.get(c) as any);

      const base = { marcaciones, horarios, feriados, desde: q.desde, hasta: q.hasta, nombres, incluirNoHabiles: true };
      const armar = (M: any, justis: any[], reglas: any) =>
        M.armarReporte({ ...base, justificaciones: justis, vacaciones: vacs, reglas } as any).filter((p: any) => !fuera.has(p.codigo));

      const planillaDe = (P: any, personasRep: any[]) =>
        P.armarPlanilla({ personas: personasRep, fichas, manuales, jornadaDiariaMin: jornada, reglas: rNuevo, empresa } as any);

      // ── PASADA 1: motor viejo vs motor nuevo, MISMOS datos ──────────────
      const lViejo = VIEJO_PLANILLA.armarPlanilla({
        personas: armar(VIEJO_REPORTE, justSin, rViejo), fichas, manuales,
        jornadaDiariaMin: (c: string) => VIEJO_PLANILLA.jornadaDiariaMin(horarioDe.get(c) as any),
        reglas: rViejo, empresa,
      } as any);
      const lNuevoSin = planillaDe(NUEVO_PLANILLA, armar(NUEVO_REPORTE, justSin, rNuevo));

      const porCod = new Map(lNuevoSin.map((l: any) => [l.codigo, l]));
      for (const a of lViejo as any[]) {
        const b: any = porCod.get(a.codigo);
        lineas += 1;
        if (!b) { console.log(`  🔴 P1 ${clave} ${empresa} ${a.codigo}: la línea desapareció`); dif1 += 1; continue; }
        for (const k of Object.keys(a.horas)) {
          if (a.horas[k] !== b.horas[k]) { console.log(`  🔴 P1 ${clave} ${empresa} ${a.etiqueta}: horas.${k} ${a.horas[k]} → ${b.horas[k]}`); dif1 += 1; }
        }
        if (a.dinero && b.dinero) {
          for (const k of Object.keys(a.dinero)) {
            cifras += 1;
            if (a.dinero[k] !== b.dinero[k]) { console.log(`  🔴 P1 ${clave} ${empresa} ${a.etiqueta}: dinero.${k} ${a.dinero[k]} → ${b.dinero[k]}`); dif1 += 1; }
          }
        }
      }

      // ── PASADA 2: sin la justificación vs CON la justificación ──────────
      const repCon = armar(NUEVO_REPORTE, justCon, rNuevo);
      const lNuevoCon = planillaDe(NUEVO_PLANILLA, repCon);
      const porCodCon = new Map(lNuevoCon.map((l: any) => [l.codigo, l]));

      for (const a of lNuevoSin as any[]) {
        const b: any = porCodCon.get(a.codigo);
        if (!b) { console.log(`  🔴 P2 ${clave} ${empresa} ${a.codigo}: desapareció al justificar`); dif2 += 1; continue; }
        const campos = [
          ...Object.keys(a.horas).map((k) => ["horas." + k, a.horas[k], b.horas[k]] as const),
          ...(a.dinero && b.dinero ? Object.keys(a.dinero).map((k) => ["dinero." + k, a.dinero[k], b.dinero[k]] as const) : []),
        ];
        const movidos = campos.filter(([, x, y]) => x !== y);
        if (!movidos.length) continue;
        if (a.codigo !== RODRIGO) {
          ajenosMovidos += 1; dif2 += 1;
          console.log(`  🔴 P2 ${clave} ${empresa} ${a.etiqueta} (AJENO): ${movidos.map(([k, x, y]) => `${k} ${x}→${y}`).join(", ")}`);
        } else {
          console.log(`  ✅ P2 ${clave} ${empresa} ${a.etiqueta} — cambia, que es lo que se espera:`);
          for (const [k, x, y] of movidos) console.log(`       ${k}: ${x} → ${y}`);
        }
      }

      // ── EL ESPEJO: ELOYN (29), fashion_wear, «Vacaciones» 16-jul→13-ago ─
      // Cubre la MISMA quincena entera que la de Rodrigo y ya está cargada en
      // producción. Si su línea tiene la MISMA forma, el motivo nuevo se
      // comporta igual que una justificación de hoy.
      if (clave === "2026-08-1" && empresa === "fashion_wear") {
        const eloyn: any = lNuevoSin.find((l: any) => l.codigo === "29");
        if (eloyn) {
          console.log(`\n  ── ESPEJO · ${clave} · ELOYN MENDOZA (29) «Vacaciones» 16-jul→13-ago ──`);
          console.log(`     dinero=${eloyn.dinero ? "sí" : "NO"} · falta=[${eloyn.faltaConfigurar.join(" · ")}]`);
          console.log(`     ausencias (min)=${eloyn.horas.ausenciaMin} · extraDiurnoMin=${eloyn.horas.extraDiurnoMin}`);
        }
      }

      // ── PASADA 4: EL MOTIVO NUEVO PAGA IGUAL QUE UNO DE HOY ────────────
      // 🔴 La prueba directa de "no se descuenta": a CADA persona del cuadro se
      // le inyecta la MISMA justificación de un día, una vez con «Vacaciones» y
      // otra con el motivo nuevo, y el dinero tiene que salir IDÉNTICO. Si el
      // motivo nuevo tocara el pago aunque fuera en un centavo, esto lo caza.
      for (const linea of lNuevoSin as any[]) {
        if (!linea.dinero) continue; // sin número que comparar
        const rep0: any = armar(NUEVO_REPORTE, justSin, rNuevo).find((p: any) => p.codigo === linea.codigo);
        const diaHabil = rep0?.dias.find((d: any) => d.habil && !d.feriado && !d.justificado);
        if (!diaHabil) continue;
        const uno = (motivo: string) => [
          ...justSin,
          { empleado_codigo: linea.codigo, desde: diaHabil.fecha, hasta: diaHabil.fecha, motivo },
        ];
        const conVac = planillaDe(NUEVO_PLANILLA, armar(NUEVO_REPORTE, uno("Vacaciones"), rNuevo))
          .find((l: any) => l.codigo === linea.codigo);
        const conFuera = planillaDe(NUEVO_PLANILLA, armar(NUEVO_REPORTE, uno(MOTIVO_TRABAJO_FUERA), rNuevo))
          .find((l: any) => l.codigo === linea.codigo);
        paridad += 1;
        const campos = [
          ...Object.keys(conVac.horas).map((k) => ["horas." + k, conVac.horas[k], conFuera.horas[k]] as const),
          ...(conVac.dinero && conFuera.dinero
            ? Object.keys(conVac.dinero).map((k) => ["dinero." + k, conVac.dinero[k], conFuera.dinero[k]] as const)
            : []),
        ];
        for (const [k, x, y] of campos) {
          if (x !== y) {
            paridadRota += 1;
            console.log(`  🔴 P4 ${clave} ${empresa} ${linea.etiqueta}: «Vacaciones» y «${MOTIVO_TRABAJO_FUERA}» pagan distinto en ${k}: ${x} → ${y}`);
          }
        }
        // Y la contracara: el REPORTE sí los distingue.
        const rV: any = armar(NUEVO_REPORTE, uno("Vacaciones"), rNuevo).find((p: any) => p.codigo === linea.codigo);
        const rF: any = armar(NUEVO_REPORTE, uno(MOTIVO_TRABAJO_FUERA), rNuevo).find((p: any) => p.codigo === linea.codigo);
        if (rV && rF && diaHabil.marcas.length === 0) {
          if (!(rV.resumen.ausenciasJustificadas === 1 && rV.resumen.diasTrabajandoFuera === 0
             && rF.resumen.ausenciasJustificadas === 0 && rF.resumen.diasTrabajandoFuera === 1)) {
            distincionRota += 1;
            console.log(`  🔴 P4 ${clave} ${empresa} ${linea.etiqueta}: el reporte NO los distingue ` +
              `(vac: ${rV.resumen.ausenciasJustificadas}/${rV.resumen.diasTrabajandoFuera} · ` +
              `fuera: ${rF.resumen.ausenciasJustificadas}/${rF.resumen.diasTrabajandoFuera})`);
          } else {
            distincionOk += 1;
            // 🔴 EL CASO QUE DANIEL PIDIÓ VER: un día que HOY se descuenta como
            // ausencia, cubierto con el motivo nuevo. Los dos números.
            console.log(`  ✅ P4 «descontado → no descontado» · ${clave} ${empresa} ${linea.etiqueta} · día ${diaHabil.fecha}`);
            console.log(`       ausencias (min): ${linea.horas.ausenciaMin} → ${conFuera.horas.ausenciaMin}`);
            console.log(`       ausencias ($):   ${fmt(linea.dinero.ausencias)} → ${fmt(conFuera.dinero.ausencias)}`);
            console.log(`       NETO A PAGAR:    ${fmt(linea.dinero.netoPagar)} → ${fmt(conFuera.dinero.netoPagar)}`);
            console.log(`       extras ($):      ${fmt(linea.dinero.extraDiurno)} → ${fmt(conFuera.dinero.extraDiurno)}  (sin marcas no hay horas que medir)`);
            console.log(`       y con «Vacaciones» el neto es ${fmt(conVac.dinero.netoPagar)} — el MISMO`);
          }
        }
      }

      // ── PASADA 3: el detalle de Rodrigo, con la justificación puesta ────
      if (tocaRodrigo && empresa === (ficha13?.empresa ?? "vistana")) {
        const sin: any = porCod.get(RODRIGO);
        const con: any = porCodCon.get(RODRIGO);
        const rep: any = repCon.find((p: any) => p.codigo === RODRIGO);
        if (sin && con) {
          console.log(`\n  ── ${clave} · ${empresa} · RODRIGO MIRANDA, los dos números ──`);
          console.log(`     línea SIN justificación: dinero=${sin.dinero ? "sí" : "NO"} · falta=[${sin.faltaConfigurar.join(" · ")}]`);
          console.log(`     línea CON justificación: dinero=${con.dinero ? "sí" : "NO"} · falta=[${con.faltaConfigurar.join(" · ")}]`);
          console.log(`     ausencias (min):  ${sin.horas.ausenciaMin}  →  ${con.horas.ausenciaMin}`);
          console.log(`     ausencias ($):    ${fmt(sin.dinero?.ausencias ?? 0)}  →  ${fmt(con.dinero?.ausencias ?? 0)}`);
          console.log(`     tardanzas ($):    ${fmt(sin.dinero?.tardanzas ?? 0)}  →  ${fmt(con.dinero?.tardanzas ?? 0)}`);
          console.log(`     TOTAL BRUTO:      ${fmt(sin.dinero?.totalBruto ?? 0)}  →  ${fmt(con.dinero?.totalBruto ?? 0)}`);
          console.log(`     NETO A PAGAR:     ${fmt(sin.dinero?.neto ?? 0)}  →  ${fmt(con.dinero?.neto ?? 0)}`);
          console.log(`     quincenal base:   ${fmt(sin.dinero?.quincenal ?? 0)}  →  ${fmt(con.dinero?.quincenal ?? 0)}`);
          console.log(`\n     CERO HORAS EXTRA — sin marcas no hay horas que medir:`);
          console.log(`       extraDiurnoMin   ${sin.horas.extraDiurnoMin} → ${con.horas.extraDiurnoMin}`);
          console.log(`       extraNocturnoMin ${sin.horas.extraNocturnoMin} → ${con.horas.extraNocturnoMin}`);
          console.log(`       domingoMin       ${sin.horas.domingoMin} → ${con.horas.domingoMin}`);
          console.log(`       feriadoMin       ${sin.horas.feriadoMin} → ${con.horas.feriadoMin}`);
          console.log(`       extras ($)       ${fmt(sin.dinero?.extras ?? 0)} → ${fmt(con.dinero?.extras ?? 0)}`);
          if (rep) {
            console.log(`\n     Cómo lo cuenta el REPORTE:`);
            console.log(`       ausencias sin justificar: ${rep.resumen.ausenciasSinJustificar}`);
            console.log(`       ausencias justificadas:   ${rep.resumen.ausenciasJustificadas}   ← NO se le suman los días de trabajo fuera`);
            console.log(`       días trabajando fuera:    ${rep.resumen.diasTrabajandoFuera}`);
            const dia = rep.dias.find((d: any) => d.justificado);
            if (dia) console.log(`       un día cualquiera (${dia.fecha}): justificado=«${dia.justificado}» ausente=${dia.ausente} extraMin=${dia.extraMin}`);
          }
          console.log("");
        }
      }
    }
  }

  console.log(`\n${"─".repeat(70)}`);
  console.log(`PASADA 1 (el código no mueve nada): ${lineas} líneas · ${cifras} cifras de dinero · ${dif1} diferencias ${dif1 === 0 ? "🟢" : "🔴"}`);
  console.log(`PASADA 2 (nadie más se mueve): personas ajenas movidas = ${ajenosMovidos} ${ajenosMovidos === 0 ? "🟢" : "🔴"}`);
  console.log(`PASADA 4 (paga igual que «Vacaciones»): ${paridad} personas comparadas · ${paridadRota} diferencias ${paridadRota === 0 ? "🟢" : "🔴"}`);
  console.log(`PASADA 4 (el reporte SÍ los distingue): ${distincionOk} ok · ${distincionRota} fallas ${distincionRota === 0 && distincionOk > 0 ? "🟢" : "🔴"}`);
  if (dif1 !== 0 || ajenosMovidos !== 0 || paridadRota !== 0 || distincionRota !== 0 || distincionOk === 0) process.exitCode = 1;
}

traerMotorViejo();
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(borrarMotorViejo);
