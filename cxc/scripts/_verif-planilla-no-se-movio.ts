/* ─────────────────────────────────────────────────────────────────────────────
 * ¿SE MOVIÓ UN CENTAVO DE LA PLANILLA? — solo lectura, contra producción.
 *
 * Corre el motor VIEJO (el de `origin/main`, copiado tal cual en
 * `src/lib/asistencia-antes/`) y el motor NUEVO sobre LOS MISMOS DATOS de
 * producción, y compara línea por línea, campo por campo.
 *
 * 🔴 Es la única prueba que vale para los dos cambios de este PR:
 *   · el almuerzo fijo en 30 no puede mover una jornada, una tardanza ni una
 *     hora extra (las 33 personas con horario ya tenían 30, pero eso hay que
 *     DEMOSTRARLO contra el cálculo, no razonarlo);
 *   · marcar a alguien como servicio profesional no puede tocar a NADIE MÁS.
 *
 * ⚠️ NO ESCRIBE NADA. Lee `asistencia_*` y calcula en memoria.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_verif-planilla-no-se-movio.ts
 * ────────────────────────────────────────────────────────────────────────── */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import * as NUEVO_PLANILLA from "@/lib/asistencia/planilla";
import * as NUEVO_REPORTE from "@/lib/asistencia/reporte";
import { reglasDesdeFila as reglasNuevo } from "@/lib/asistencia/config";

/**
 * El motor VIEJO se saca de `origin/main` AL CORRER, no se guarda en el repo:
 * una copia versionada envejece sola y en dos semanas estaría comparando contra
 * algo que ya no es "lo de antes". Vive en `src/` porque los módulos importan
 * `@/lib/empresa-mapping` y ese alias solo resuelve ahí; se borra al terminar.
 */
const DIR_ANTES = path.join(process.cwd(), "src/lib/asistencia-antes");
const MODULOS = ["config.ts", "reporte.ts", "planilla.ts", "directorio.ts"];

function traerMotorViejo() {
  fs.mkdirSync(DIR_ANTES, { recursive: true });
  for (const f of MODULOS) {
    let contenido = "";
    for (const ruta of [`origin/main:cxc/src/lib/asistencia/${f}`, `origin/main:src/lib/asistencia/${f}`]) {
      try {
        contenido = execFileSync("git", ["show", ruta], { encoding: "utf8" });
        break;
      } catch { /* la otra ruta */ }
    }
    if (!contenido) throw new Error(`No pude sacar ${f} de origin/main`);
    fs.writeFileSync(path.join(DIR_ANTES, f), contenido);
  }
}
function borrarMotorViejo() {
  fs.rmSync(DIR_ANTES, { recursive: true, force: true });
}

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(URL_, KEY, { auth: { persistSession: false } });

const PANAMA = "-05:00";
const instante = (dia: string, fin: boolean) =>
  new Date(Date.parse(`${dia}T${fin ? "23:59:59.999" : "00:00:00.000"}${PANAMA}`)).toISOString();

/** Las quincenas con datos cargados. Julio y agosto de 2026. */
const QUINCENAS = ["2026-07-1", "2026-07-2", "2026-08-1", "2026-08-2"];
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

async function main() {
  const VIEJO_PLANILLA = await import("@/lib/asistencia-antes/planilla");
  const VIEJO_REPORTE = await import("@/lib/asistencia-antes/reporte");
  const { reglasDesdeFila: reglasViejo } = await import("@/lib/asistencia-antes/config");

  const { data: filaReglas } = await db.from("asistencia_reglas").select("*").eq("id", 1).maybeSingle();
  const rViejo = reglasViejo(filaReglas as Record<string, unknown> | null);
  const rNuevo = reglasNuevo(filaReglas as Record<string, unknown> | null);
  console.log("Reglas leídas de producción:");
  console.log(`  almuerzo_default_min en la base = ${(filaReglas as any)?.almuerzo_default_min}`);
  console.log(`  motor VIEJO usaba almuerzoDefaultMin = ${(rViejo as any).almuerzoDefaultMin}`);
  console.log(`  motor NUEVO usa ALMUERZO_FIJO_MIN    = ${NUEVO_REPORTE.ALMUERZO_DEFAULT_MIN}`);

  const personas = await todo<any>("asistencia_personas", (q) =>
    q.select("empleado_codigo, nombre, salario_mensual, jornada_semanal, empresa, fecha_ingreso, fecha_salida, motivo_salida"));
  const horariosRaw = await todo<any>("asistencia_horarios", (q) =>
    q.select("empleado_codigo, entrada, salida, almuerzo_minutos"));
  const horarios = horariosRaw.map((h) => ({
    ...h,
    entrada: String(h.entrada).slice(0, 5),
    salida: String(h.salida).slice(0, 5),
  }));
  const almuerzos = [...new Set(horarios.map((h) => h.almuerzo_minutos))];
  console.log(`\nHorarios guardados: ${horarios.length} · valores de almuerzo distintos: ${JSON.stringify(almuerzos)}`);

  let diferencias = 0;
  let lineasComparadas = 0;
  let dineroComparado = 0;

  for (const clave of QUINCENAS) {
    const q = NUEVO_PLANILLA.quincenaDesdeClave(clave)!;
    const marcaciones = await todo<any>("asistencia_marcaciones", (x) =>
      x.select("empleado_codigo, empleado_nombre, ocurrio_en")
        .gte("ocurrio_en", instante(q.desde, false))
        .lte("ocurrio_en", instante(q.hasta, true))
        .order("ocurrio_en", { ascending: true })
        .order("id", { ascending: true }));
    const { data: just } = await db.from("asistencia_justificaciones")
      .select("empleado_codigo, desde, hasta, motivo").lte("desde", q.hasta).gte("hasta", q.desde);
    const { data: fer } = await db.from("asistencia_feriados")
      .select("fecha, nombre").gte("fecha", q.desde).lte("fecha", q.hasta);
    const feriados = new Map((fer ?? []).map((f: any) => [String(f.fecha), String(f.nombre)]));
    // 🔑 Los montos escritos a mano ENTRAN a la comparación. Sin ellos los dos
    // motores igual darían lo mismo (comparten el dato), pero los números no
    // cuadrarían contra lo que la pantalla muestra en producción — y entonces
    // no se podría distinguir "el cálculo no cambió" de "medí otra cosa".
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
      // Quién entra: la MISMA regla de vigencia de la ruta, escrita una vez y
      // usada por los dos motores (no cambió en este PR).
      const fuera = new Set<string>();
      for (const p of personas) {
        const s = p.fecha_salida ? String(p.fecha_salida) : null;
        const i = p.fecha_ingreso ? String(p.fecha_ingreso) : null;
        if ((s && s < q.desde) || (i && i > q.hasta)) fuera.add(String(p.empleado_codigo));
      }

      const fichaBase = (p: any) => ({
        codigo: String(p.empleado_codigo),
        nombre: p.nombre ?? null,
        salarioMensual: p.salario_mensual === null ? null : Number(p.salario_mensual),
        jornadaSemanal: p.jornada_semanal ?? null,
        empresa: p.empresa ?? null,
      });
      const fichasViejo = new Map<string, any>();
      const fichasNuevo = new Map<string, any>();
      for (const p of personas) {
        const cod = String(p.empleado_codigo);
        if (fuera.has(cod)) continue;
        fichasViejo.set(cod, fichaBase(p));
        // 🔑 En el motor nuevo NADIE está marcado todavía: la columna no existe
        // en producción. Es exactamente el estado del día del deploy.
        fichasNuevo.set(cod, { ...fichaBase(p), servicioProfesional: false });
      }
      const nombres = new Map<string, string>();
      for (const [cod, f] of fichasViejo) if (f.nombre) nombres.set(cod, f.nombre);

      const argsReporte = {
        marcaciones, horarios, justificaciones: (just ?? []) as any, feriados,
        desde: q.desde, hasta: q.hasta, nombres, incluirNoHabiles: true,
      };
      const pViejo = VIEJO_REPORTE.armarReporte({ ...argsReporte, reglas: rViejo } as any)
        .filter((p) => !fuera.has(p.codigo));
      const pNuevo = NUEVO_REPORTE.armarReporte({ ...argsReporte, reglas: rNuevo } as any)
        .filter((p) => !fuera.has(p.codigo));

      const horarioDe = new Map(horarios.map((h) => [h.empleado_codigo, h]));
      const jornadaViejo = (c: string) => VIEJO_PLANILLA.jornadaDiariaMin(horarioDe.get(c) as any);
      const jornadaNuevo = (c: string) => NUEVO_PLANILLA.jornadaDiariaMin(horarioDe.get(c) as any);

      const lv = VIEJO_PLANILLA.armarPlanilla({
        personas: pViejo, fichas: fichasViejo, manuales, jornadaDiariaMin: jornadaViejo,
        reglas: rViejo, empresa,
      } as any);
      const ln = NUEVO_PLANILLA.armarPlanilla({
        personas: pNuevo, fichas: fichasNuevo, manuales, jornadaDiariaMin: jornadaNuevo,
        reglas: rNuevo, empresa,
      } as any);

      const tv = VIEJO_PLANILLA.totalizar(lv);
      const tn = NUEVO_PLANILLA.totalizar(ln);

      const porCodigo = new Map(ln.map((l) => [l.codigo, l]));
      for (const a of lv) {
        const b = porCodigo.get(a.codigo);
        lineasComparadas += 1;
        if (!b) {
          console.log(`  🔴 ${clave} ${empresa} ${a.codigo}: la línea desapareció`);
          diferencias += 1;
          continue;
        }
        // Horas (los minutos que después se multiplican)
        for (const k of Object.keys(a.horas) as Array<keyof typeof a.horas>) {
          if (a.horas[k] !== b.horas[k]) {
            console.log(`  🔴 ${clave} ${empresa} ${a.etiqueta}: horas.${String(k)} ${a.horas[k]} → ${b.horas[k]}`);
            diferencias += 1;
          }
        }
        // Dinero
        if (!!a.dinero !== !!b.dinero) {
          console.log(`  🔴 ${clave} ${empresa} ${a.etiqueta}: uno calculó dinero y el otro no`);
          diferencias += 1;
        } else if (a.dinero && b.dinero) {
          for (const k of Object.keys(a.dinero) as Array<keyof typeof a.dinero>) {
            dineroComparado += 1;
            if (a.dinero[k] !== b.dinero[k]) {
              console.log(`  🔴 ${clave} ${empresa} ${a.etiqueta}: dinero.${String(k)} ${a.dinero[k]} → ${b.dinero[k]}`);
              diferencias += 1;
            }
          }
        }
        if (a.faltaConfigurar.join("|") !== b.faltaConfigurar.join("|")) {
          console.log(`  🔴 ${clave} ${empresa} ${a.etiqueta}: falta «${a.faltaConfigurar}» → «${b.faltaConfigurar}»`);
          diferencias += 1;
        }
      }
      for (const k of Object.keys(tv) as Array<keyof typeof tv>) {
        if (k === "fueraDePlanilla") continue; // campo nuevo, no existía antes
        dineroComparado += 1;
        if ((tv as any)[k] !== (tn as any)[k]) {
          console.log(`  🔴 ${clave} ${empresa} TOTAL.${String(k)} ${(tv as any)[k]} → ${(tn as any)[k]}`);
          diferencias += 1;
        }
      }
      console.log(
        `  ${clave} · ${empresa}: ${lv.length} líneas · neto $${tv.netoPagar.toFixed(2)} → $${tn.netoPagar.toFixed(2)}`,
      );
    }
  }

  console.log(
    `\n${diferencias === 0 ? "🟢" : "🔴"} ${lineasComparadas} líneas comparadas · `
    + `${dineroComparado} cifras de dinero · ${diferencias} diferencias`,
  );

  // ───────────────────────────────────────────────────────────────────────────
  // PASADA 2 — ¿Y SI SE MARCA A YULISSA?
  //
  // Lo mismo, pero con el código 26 marcado como servicio profesional en el
  // motor nuevo. Lo que hay que demostrar es que NO SE TOCA A NADIE MÁS: el
  // cambio de una ficha no puede mover un centavo de las otras 35.
  // ───────────────────────────────────────────────────────────────────────────
  const CODIGO_YULISSA = "26";
  let difOtros = 0;
  let cambiosYulissa: string[] = [];

  for (const clave of QUINCENAS) {
    const q = NUEVO_PLANILLA.quincenaDesdeClave(clave)!;
    const marcaciones = await todo<any>("asistencia_marcaciones", (x) =>
      x.select("empleado_codigo, empleado_nombre, ocurrio_en")
        .gte("ocurrio_en", instante(q.desde, false))
        .lte("ocurrio_en", instante(q.hasta, true))
        .order("ocurrio_en", { ascending: true })
        .order("id", { ascending: true }));
    const { data: just } = await db.from("asistencia_justificaciones")
      .select("empleado_codigo, desde, hasta, motivo").lte("desde", q.hasta).gte("hasta", q.desde);
    const { data: fer } = await db.from("asistencia_feriados")
      .select("fecha, nombre").gte("fecha", q.desde).lte("fecha", q.hasta);
    const feriados = new Map((fer ?? []).map((f: any) => [String(f.fecha), String(f.nombre)]));

    for (const empresa of EMPRESAS) {
      const fuera = new Set<string>();
      for (const p of personas) {
        const s = p.fecha_salida ? String(p.fecha_salida) : null;
        const i = p.fecha_ingreso ? String(p.fecha_ingreso) : null;
        if ((s && s < q.desde) || (i && i > q.hasta)) fuera.add(String(p.empleado_codigo));
      }
      const fichasViejo = new Map<string, any>();
      const fichasMarcada = new Map<string, any>();
      for (const p of personas) {
        const cod = String(p.empleado_codigo);
        if (fuera.has(cod)) continue;
        const f = {
          codigo: cod,
          nombre: p.nombre ?? null,
          salarioMensual: p.salario_mensual === null ? null : Number(p.salario_mensual),
          jornadaSemanal: p.jornada_semanal ?? null,
          empresa: p.empresa ?? null,
        };
        fichasViejo.set(cod, f);
        fichasMarcada.set(cod, { ...f, servicioProfesional: cod === CODIGO_YULISSA });
      }
      const nombres = new Map<string, string>();
      for (const [cod, f] of fichasViejo) if (f.nombre) nombres.set(cod, f.nombre);
      const argsReporte = {
        marcaciones, horarios, justificaciones: (just ?? []) as any, feriados,
        desde: q.desde, hasta: q.hasta, nombres, incluirNoHabiles: true,
      };
      const pViejo = VIEJO_REPORTE.armarReporte({ ...argsReporte, reglas: rViejo } as any)
        .filter((p) => !fuera.has(p.codigo));
      const pNuevo = NUEVO_REPORTE.armarReporte({ ...argsReporte, reglas: rNuevo } as any)
        .filter((p) => !fuera.has(p.codigo));
      const horarioDe = new Map(horarios.map((h) => [h.empleado_codigo, h]));

      const lv = VIEJO_PLANILLA.armarPlanilla({
        personas: pViejo, fichas: fichasViejo, manuales,
        jornadaDiariaMin: (c: string) => VIEJO_PLANILLA.jornadaDiariaMin(horarioDe.get(c) as any),
        reglas: rViejo, empresa,
      } as any);
      const lm = NUEVO_PLANILLA.armarPlanilla({
        personas: pNuevo, fichas: fichasMarcada, manuales,
        jornadaDiariaMin: (c: string) => NUEVO_PLANILLA.jornadaDiariaMin(horarioDe.get(c) as any),
        reglas: rNuevo, empresa,
      } as any);
      const porCodigo = new Map(lm.map((l) => [l.codigo, l]));

      for (const a of lv) {
        const b = porCodigo.get(a.codigo);
        if (!b) { console.log(`  🔴 ${clave} ${empresa} ${a.codigo}: desapareció`); difOtros += 1; continue; }
        const igualHoras = (Object.keys(a.horas) as Array<keyof typeof a.horas>)
          .every((k) => a.horas[k] === b.horas[k]);
        const igualDinero = JSON.stringify(a.dinero) === JSON.stringify(b.dinero);
        const igualFalta = a.faltaConfigurar.join("|") === b.faltaConfigurar.join("|");
        if (igualHoras && igualDinero && igualFalta && !b.fueraDePlanilla) continue;
        if (a.codigo === CODIGO_YULISSA) {
          cambiosYulissa.push(
            `${clave} ${empresa}: dinero ${a.dinero ? "sí" : "no"} → ${b.dinero ? "sí" : "no"} · `
            + `falta «${a.faltaConfigurar.join(" · ")}» → «${b.faltaConfigurar.join(" · ") || "nada"}» · `
            + `fueraDePlanilla=${b.fueraDePlanilla} · horas iguales=${igualHoras}`,
          );
        } else {
          console.log(`  🔴 ${clave} ${empresa} ${a.etiqueta}: cambió y NO es Yulissa`);
          difOtros += 1;
        }
      }
      const tv = VIEJO_PLANILLA.totalizar(lv);
      const tm = NUEVO_PLANILLA.totalizar(lm);
      if (tv.netoPagar !== tm.netoPagar || tv.totalBruto !== tm.totalBruto) {
        console.log(`  🔴 ${clave} ${empresa}: el TOTAL cambió al marcar a Yulissa`);
        difOtros += 1;
      }
    }
  }

  console.log("\n── Con el código 26 (YULISSA) marcado como servicio profesional ──");
  for (const c of cambiosYulissa) console.log(`  · ${c}`);
  console.log(
    `${difOtros === 0 ? "🟢" : "🔴"} ${difOtros} cambios en OTRAS personas · `
    + "los totales de las 3 empresas quedan idénticos",
  );

  // ⚠️ `exitCode`, NUNCA `process.exit()`: eso mataría el proceso antes del
  // `finally` que borra la copia del motor viejo, y quedaría suelta en `src/`.
  process.exitCode = diferencias === 0 && difOtros === 0 ? 0 : 1;
}

traerMotorViejo();
void main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(borrarMotorViejo);
