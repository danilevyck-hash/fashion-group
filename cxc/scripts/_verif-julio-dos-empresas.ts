/* ─────────────────────────────────────────────────────────────────────────────
 * ¿SE MOVIÓ UN CENTAVO DE LA PLANILLA? — solo lectura, contra producción.
 *
 * 🔴 EL CANDADO DE CONDUCTA DE ESTE PR. No busca texto en ningún archivo: corre
 * el MOTOR DE VERDAD sobre los DATOS DE VERDAD y mira los dólares.
 *
 * Tres pasadas, y las tres hacen falta:
 *
 *   PASADA 1 — SIN reparto (el estado del día del deploy, con la DDL todavía
 *              sin correr): el motor NUEVO contra el motor VIEJO de
 *              `origin/main`, línea por línea y campo por campo. Tiene que dar
 *              CERO diferencias. Es lo que prueba que la app funciona ANTES de
 *              la migración.
 *
 *   PASADA 2 — CON el reparto de JULIO GARAY (800 Vistana / 200 Fashion Wear):
 *              se exige que NADIE MÁS se mueva un centavo, en las tres empresas
 *              y en las cuatro quincenas, y que las líneas de Julio den los
 *              números de la contadora.
 *
 *   PASADA 3 — VERIFICACIÓN POR MUTACIÓN, en memoria: se rompe el reparto de
 *              seis formas distintas y se exige que el guard lo RECHACE y
 *              vuelva a UNA línea. Un candado que no puede fallar no verifica
 *              nada.
 *
 * ⚠️ NO ESCRIBE NADA. El reparto se LEE de `asistencia_reparto_empresa` (con la
 * DDL corrida, eso prueba la cadena entera: tabla → `leerRepartos` →
 * `validarReparto` → motor) y se coteja contra la regla de la contadora, que
 * vive escrita acá abajo como VARA. Sin la tabla, cae al reparto en memoria y
 * lo dice — así el script sirve antes y después de correr el SQL.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_verif-julio-dos-empresas.ts
 *
 * Variables: EXIGIR=0 para medir con las horas extra PAGADAS (el estado en el
 * que se midieron los números del encargo). Por defecto se usa el estado REAL
 * de producción (la tabla de aprobaciones existe y está vacía → extras en $0).
 * ────────────────────────────────────────────────────────────────────────── */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import * as NUEVO_PLANILLA from "@/lib/asistencia/planilla";
import * as NUEVO_REPORTE from "@/lib/asistencia/reporte";
import { reglasDesdeFila as reglasNuevo } from "@/lib/asistencia/config";
import { leerVacaciones, leerJustificaciones } from "@/lib/asistencia/config-server";
import { leerAprobaciones } from "@/lib/asistencia/aprobaciones-server";
import { estaAprobado, indexarAprobaciones } from "@/lib/asistencia/aprobaciones";
import { agruparPorCodigo, partesDe, validarReparto, type FilaReparto } from "@/lib/asistencia/reparto";
import { leerRepartos } from "@/lib/asistencia/config-server";

// ─────────────────────────────────────────────────────────────────────────────
// EL MOTOR VIEJO se saca de `origin/main` AL CORRER, no se guarda en el repo:
// una copia versionada envejece sola y en dos semanas estaría comparando contra
// algo que ya no es "lo de antes".
// ─────────────────────────────────────────────────────────────────────────────

const DIR_ANTES = path.join(process.cwd(), "src/lib/asistencia-antes");
/** Las puertas de entrada. Sus dependencias RELATIVAS se traen solas. */
const MODULOS = ["config.ts", "reporte.ts", "planilla.ts", "directorio.ts"];

function bajarDeMain(archivo: string): string {
  for (const ruta of [`origin/main:cxc/src/lib/asistencia/${archivo}`, `origin/main:src/lib/asistencia/${archivo}`]) {
    try {
      return execFileSync("git", ["show", ruta], { encoding: "utf8" });
    } catch { /* la otra ruta */ }
  }
  throw new Error(`No pude sacar ${archivo} de origin/main`);
}

/**
 * 🩸 EL CIERRE TRANSITIVO NO ES UN LUJO: `reporte.ts` importa `./motivos`, que
 * a su vez importa otros. Con una lista fija a mano, el día que el motor gane
 * un import nuevo el script muere con `Cannot find module` — y eso se lee como
 * "el verificador está roto", justo cuando hace falta que corra.
 */
function traerMotorViejo() {
  fs.mkdirSync(DIR_ANTES, { recursive: true });
  const pendientes = [...MODULOS];
  const hechos = new Set<string>();
  while (pendientes.length > 0) {
    const f = pendientes.shift()!;
    if (hechos.has(f)) continue;
    hechos.add(f);
    const contenido = bajarDeMain(f);
    fs.writeFileSync(path.join(DIR_ANTES, f), contenido);
    for (const m of contenido.matchAll(/from\s+"\.\/([\w-]+)"/g)) {
      const dep = `${m[1]}.ts`;
      if (!hechos.has(dep)) pendientes.push(dep);
    }
  }
}
const borrarMotorViejo = () => fs.rmSync(DIR_ANTES, { recursive: true, force: true });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const PANAMA = "-05:00";
const instante = (dia: string, fin: boolean) =>
  new Date(Date.parse(`${dia}T${fin ? "23:59:59.999" : "00:00:00.000"}${PANAMA}`)).toISOString();

const QUINCENAS = ["2026-07-1", "2026-07-2", "2026-08-1", "2026-08-2"];
const EMPRESAS = ["confecciones_boston", "vistana", "fashion_wear"];
const JULIO = "11";

/** El reparto de JULIO GARAY, con las palabras de la contadora. */
const REPARTO_JULIO: FilaReparto[] = [
  { empleado_codigo: JULIO, empresa: "vistana", salario_mensual: "800.00", paga_seguros: true, paga_horas_extra: false, orden: 0 },
  { empleado_codigo: JULIO, empresa: "fashion_wear", salario_mensual: "200.00", paga_seguros: false, paga_horas_extra: true, orden: 1 },
];

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

const d2 = (n: number) => n.toFixed(2);

interface DatosQuincena {
  q: NUEVO_PLANILLA.Quincena;
  marcaciones: any[];
  just: any[];
  vacs: any[];
  feriados: Map<string, string>;
  manuales: Map<string, any>;
  exigir: boolean;
  dias: Set<string>;
}

async function main() {
  const VIEJO_PLANILLA = await import("@/lib/asistencia-antes/planilla");
  const VIEJO_REPORTE = await import("@/lib/asistencia-antes/reporte");
  const { reglasDesdeFila: reglasViejo } = await import("@/lib/asistencia-antes/config");

  const { data: filaReglas } = await db.from("asistencia_reglas").select("*").eq("id", 1).maybeSingle();
  const rViejo = reglasViejo(filaReglas as Record<string, unknown> | null);
  const rNuevo = reglasNuevo(filaReglas as Record<string, unknown> | null);

  const personas = await todo<any>("asistencia_personas", (q) =>
    q.select("empleado_codigo, nombre, salario_mensual, jornada_semanal, empresa, fecha_ingreso, fecha_salida, servicio_profesional, paga_seguros, no_marca_reloj, seguros_base_quincena"));
  const horariosRaw = await todo<any>("asistencia_horarios", (q) =>
    q.select("empleado_codigo, entrada, salida, almuerzo_minutos"));
  const horarios = horariosRaw.map((h) => ({
    ...h, entrada: String(h.entrada).slice(0, 5), salida: String(h.salida).slice(0, 5),
  }));
  const horarioDe = new Map(horarios.map((h) => [h.empleado_codigo, h]));

  console.log(`Fichas: ${personas.length} · horarios: ${horarios.length}`);
  const fJulio = personas.find((p) => String(p.empleado_codigo) === JULIO);
  console.log(
    `JULIO en producción: salario=${fJulio?.salario_mensual} jornada=${fJulio?.jornada_semanal} `
    + `empresa=${fJulio?.empresa} servicioProfesional=${fJulio?.servicio_profesional} pagaSeguros=${fJulio?.paga_seguros}`,
  );

  // ── LOS DATOS DE CADA QUINCENA, UNA SOLA VEZ ────────────────────────────────
  const datos: DatosQuincena[] = [];
  for (const clave of QUINCENAS) {
    const q = NUEVO_PLANILLA.quincenaDesdeClave(clave)!;
    const marcaciones = await todo<any>("asistencia_marcaciones", (x) =>
      x.select("empleado_codigo, empleado_nombre, ocurrio_en")
        .gte("ocurrio_en", instante(q.desde, false)).lte("ocurrio_en", instante(q.hasta, true))
        .order("ocurrio_en", { ascending: true }).order("id", { ascending: true }));
    const { filas: just } = await leerJustificaciones(q.desde, q.hasta);
    const { filas: vacs } = await leerVacaciones(q.desde, q.hasta);
    const apr = await leerAprobaciones(q.desde, q.hasta);
    const { data: fer } = await db.from("asistencia_feriados")
      .select("fecha, nombre").gte("fecha", q.desde).lte("fecha", q.hasta);
    const feriados = new Map((fer ?? []).map((f: any) => [String(f.fecha), String(f.nombre)]));

    const manuales = new Map<string, any>();
    const { data: man } = await db.from("asistencia_planilla_manual")
      .select("empleado_codigo, isr, prestamo, terceros, mercancia, otros_servicios").eq("quincena", q.clave);
    for (const m of (man ?? []) as any[]) {
      manuales.set(String(m.empleado_codigo), {
        isr: Number(m.isr ?? 0), prestamo: Number(m.prestamo ?? 0), terceros: Number(m.terceros ?? 0),
        mercancia: Number(m.mercancia ?? 0), otrosServicios: Number(m.otros_servicios ?? 0),
      });
    }

    const aprobaciones = indexarAprobaciones(apr.filas);
    const dias = new Set<string>();
    for (const [k, a] of aprobaciones) if (estaAprobado(a)) dias.add(k);
    const exigir = process.env.EXIGIR === "0" ? false : !apr.faltaTabla;

    datos.push({ q, marcaciones, just, vacs, feriados, manuales, exigir, dias });
  }
  console.log(`Aprobación de horas extra exigida: ${datos[0].exigir}\n`);

  const fuerasDe = (q: NUEVO_PLANILLA.Quincena) => {
    const fuera = new Set<string>();
    for (const p of personas) {
      const s = p.fecha_salida ? String(p.fecha_salida) : null;
      const i = p.fecha_ingreso ? String(p.fecha_ingreso) : null;
      if ((s && s < q.desde) || (i && i > q.hasta)) fuera.add(String(p.empleado_codigo));
    }
    return fuera;
  };

  const fichaBase = (p: any) => ({
    codigo: String(p.empleado_codigo),
    nombre: p.nombre ?? null,
    salarioMensual: p.salario_mensual === null ? null : Number(p.salario_mensual),
    jornadaSemanal: p.jornada_semanal ?? null,
    empresa: p.empresa ?? null,
    servicioProfesional: p.servicio_profesional === true,
    pagaSeguros: p.paga_seguros !== false,
    baseSeguros: p.seguros_base_quincena == null ? null : Number(p.seguros_base_quincena),
    noMarcaReloj: p.no_marca_reloj === true,
  });

  let dif1 = 0, lineas1 = 0, cifras1 = 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // PASADA 1 — SIN REPARTO: el motor nuevo TIENE que dar lo mismo que main
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("══ PASADA 1 — sin reparto (el día del deploy, la DDL sin correr) ══");
  for (const d of datos) {
    const { q } = d;
    for (const empresa of EMPRESAS) {
      const fuera = fuerasDe(q);
      const fichasViejo = new Map<string, any>();
      const fichasNuevo = new Map<string, any>();
      for (const p of personas) {
        const cod = String(p.empleado_codigo);
        if (fuera.has(cod)) continue;
        fichasViejo.set(cod, fichaBase(p));
        // 🔑 Sin la tabla corrida NADIE tiene reparto: la lista va vacía, que es
        // exactamente el estado del día del deploy.
        fichasNuevo.set(cod, { ...fichaBase(p), reparto: [] });
      }
      const nombres = new Map<string, string>();
      for (const [cod, f] of fichasViejo) if (f.nombre) nombres.set(cod, f.nombre);

      const args = {
        marcaciones: d.marcaciones, horarios, justificaciones: d.just, vacaciones: d.vacs,
        feriados: d.feriados, desde: q.desde, hasta: q.hasta, nombres, incluirNoHabiles: true,
      };
      const pViejo = VIEJO_REPORTE.armarReporte({ ...args, reglas: rViejo } as any).filter((p) => !fuera.has(p.codigo));
      const pNuevo = NUEVO_REPORTE.armarReporte({ ...args, reglas: rNuevo } as any).filter((p) => !fuera.has(p.codigo));

      const lv = VIEJO_PLANILLA.armarPlanilla({
        personas: pViejo, fichas: fichasViejo, manuales: d.manuales, reglas: rViejo, empresa,
        jornadaDiariaMin: (c: string) => VIEJO_PLANILLA.jornadaDiariaMin(horarioDe.get(c) as any),
        exigirAprobacionExtra: d.exigir, diasExtraAprobados: d.dias,
      } as any);
      const ln = NUEVO_PLANILLA.armarPlanilla({
        personas: pNuevo, fichas: fichasNuevo, manuales: d.manuales, reglas: rNuevo, empresa,
        jornadaDiariaMin: (c: string) => NUEVO_PLANILLA.jornadaDiariaMin(horarioDe.get(c)),
        exigirAprobacionExtra: d.exigir, diasExtraAprobados: d.dias,
      });

      if (lv.length !== ln.length) {
        console.log(`  🔴 ${q.clave} ${empresa}: ${lv.length} líneas → ${ln.length}`);
        dif1 += 1;
      }
      const porCodigo = new Map(ln.map((l) => [l.codigo, l]));
      for (const a of lv) {
        const b = porCodigo.get(a.codigo);
        lineas1 += 1;
        if (!b) { console.log(`  🔴 ${q.clave} ${empresa} ${a.codigo}: la línea desapareció`); dif1 += 1; continue; }
        for (const k of Object.keys(a.horas) as Array<keyof typeof a.horas>) {
          if (a.horas[k] !== b.horas[k]) {
            console.log(`  🔴 ${q.clave} ${empresa} ${a.etiqueta}: horas.${String(k)} ${a.horas[k]} → ${b.horas[k]}`);
            dif1 += 1;
          }
        }
        if (!!a.dinero !== !!b.dinero) {
          console.log(`  🔴 ${q.clave} ${empresa} ${a.etiqueta}: uno calculó dinero y el otro no`);
          dif1 += 1;
        } else if (a.dinero && b.dinero) {
          for (const k of Object.keys(a.dinero) as Array<keyof typeof a.dinero>) {
            cifras1 += 1;
            if (a.dinero[k] !== b.dinero[k]) {
              console.log(`  🔴 ${q.clave} ${empresa} ${a.etiqueta}: dinero.${String(k)} ${a.dinero[k]} → ${b.dinero[k]}`);
              dif1 += 1;
            }
          }
        }
        if (a.faltaConfigurar.join("|") !== b.faltaConfigurar.join("|")) {
          console.log(`  🔴 ${q.clave} ${empresa} ${a.etiqueta}: falta «${a.faltaConfigurar}» → «${b.faltaConfigurar}»`);
          dif1 += 1;
        }
      }
      const tv = VIEJO_PLANILLA.totalizar(lv);
      const tn = NUEVO_PLANILLA.totalizar(ln);
      for (const k of Object.keys(tv) as Array<keyof typeof tv>) {
        cifras1 += 1;
        if ((tv as any)[k] !== (tn as any)[k]) {
          console.log(`  🔴 ${q.clave} ${empresa} TOTAL.${String(k)} ${(tv as any)[k]} → ${(tn as any)[k]}`);
          dif1 += 1;
        }
      }
      console.log(`  ${q.clave} · ${empresa.padEnd(20)} ${String(lv.length).padStart(3)} líneas · neto $${d2(tv.netoPagar)} → $${d2(tn.netoPagar)}`);
    }
  }
  console.log(`\n${dif1 === 0 ? "🟢" : "🔴"} ${lineas1} líneas · ${cifras1} cifras · ${dif1} diferencias\n`);

  // ═══════════════════════════════════════════════════════════════════════════
  // PASADA 2 — CON el reparto de Julio: nadie más se mueve
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("══ PASADA 2 — con el reparto de JULIO (800 Vistana / 200 Fashion Wear) ══");

  // 🔴 EL REPARTO SE LEE DE LA BASE DE VERDAD, no de la constante de arriba.
  // Con la DDL corrida, esto prueba la CADENA ENTERA —tabla → `leerRepartos` →
  // `validarReparto` → motor— y no solo la aritmética. La constante queda como
  // vara: si la tabla dijera otra cosa, el script lo canta y para.
  const rep = await leerRepartos();
  const deLaBase = agruparPorCodigo(rep.filas).get(JULIO) ?? [];
  console.log(`  Tabla de repartos: ${rep.faltaTabla ? "TODAVÍA NO EXISTE" : `${rep.filas.length} filas`} · Julio: ${deLaBase.length}`);
  const filasJulio: FilaReparto[] = deLaBase.length > 0 ? deLaBase : REPARTO_JULIO;
  if (deLaBase.length > 0) {
    const esperado = JSON.stringify(REPARTO_JULIO.map((f) => [f.empresa, Number(f.salario_mensual), f.paga_seguros, f.paga_horas_extra]));
    const real = JSON.stringify(
      [...deLaBase]
        .sort((a, b) => (Number(a.orden ?? 0) - Number(b.orden ?? 0)))
        .map((f) => [f.empresa, Number(f.salario_mensual), f.paga_seguros !== false, f.paga_horas_extra === true]),
    );
    if (real !== esperado) {
      throw new Error(`La tabla NO dice lo que la contadora dijo.\n  esperado ${esperado}\n  real     ${real}`);
    }
    console.log("  🟢 la tabla dice EXACTAMENTE la regla de la contadora");
  } else {
    console.log("  ⚠️ la DDL todavía no corrió: se mide con el reparto EN MEMORIA");
  }

  const partesJulio = partesDe(1000, filasJulio);
  if (partesJulio.length !== 2) throw new Error("El reparto de Julio no validó — el resto de la pasada no probaría nada");

  let difOtros = 0, cifrasOtros = 0;
  const detalleJulio: string[] = [];

  for (const d of datos) {
    const { q } = d;
    for (const empresa of EMPRESAS) {
      const fuera = fuerasDe(q);
      const fichasSin = new Map<string, any>();
      const fichasCon = new Map<string, any>();
      for (const p of personas) {
        const cod = String(p.empleado_codigo);
        if (fuera.has(cod)) continue;
        fichasSin.set(cod, { ...fichaBase(p), reparto: [] });
        fichasCon.set(cod, { ...fichaBase(p), reparto: cod === JULIO ? partesJulio : [] });
      }
      const nombres = new Map<string, string>();
      for (const [cod, f] of fichasSin) if (f.nombre) nombres.set(cod, f.nombre);

      const pers = NUEVO_REPORTE.armarReporte({
        marcaciones: d.marcaciones, horarios, justificaciones: d.just, vacaciones: d.vacs,
        feriados: d.feriados, desde: q.desde, hasta: q.hasta, reglas: rNuevo, nombres, incluirNoHabiles: true,
      } as any).filter((p) => !fuera.has(p.codigo));

      const comun = {
        personas: pers, manuales: d.manuales, reglas: rNuevo, empresa,
        jornadaDiariaMin: (c: string) => NUEVO_PLANILLA.jornadaDiariaMin(horarioDe.get(c)),
        exigirAprobacionExtra: d.exigir, diasExtraAprobados: d.dias,
      };
      const sin = NUEVO_PLANILLA.armarPlanilla({ ...comun, fichas: fichasSin });
      const con = NUEVO_PLANILLA.armarPlanilla({ ...comun, fichas: fichasCon });

      const conPorCodigo = new Map<string, NUEVO_PLANILLA.LineaPlanilla[]>();
      for (const l of con) {
        const lista = conPorCodigo.get(l.codigo);
        if (lista) lista.push(l); else conPorCodigo.set(l.codigo, [l]);
      }

      for (const a of sin) {
        if (a.codigo === JULIO) continue;
        const lista = conPorCodigo.get(a.codigo) ?? [];
        if (lista.length !== 1) {
          console.log(`  🔴 ${q.clave} ${empresa} ${a.etiqueta}: ${lista.length} líneas al repartir a Julio`);
          difOtros += 1;
          continue;
        }
        const b = lista[0];
        for (const k of Object.keys(a.horas) as Array<keyof typeof a.horas>) {
          cifrasOtros += 1;
          if (a.horas[k] !== b.horas[k]) {
            console.log(`  🔴 ${q.clave} ${empresa} ${a.etiqueta}: horas.${String(k)} se movió`);
            difOtros += 1;
          }
        }
        if (JSON.stringify(a.dinero) !== JSON.stringify(b.dinero)) {
          console.log(`  🔴 ${q.clave} ${empresa} ${a.etiqueta}: el DINERO se movió y NO es Julio`);
          difOtros += 1;
        } else if (a.dinero) {
          cifrasOtros += Object.keys(a.dinero).length;
        }
      }

      // El detalle de Julio, para leerlo
      const antes = sin.find((l) => l.codigo === JULIO);
      const despues = conPorCodigo.get(JULIO) ?? [];
      if (antes || despues.length > 0) {
        const dAntes = antes?.dinero;
        for (const l of despues) {
          const x = l.dinero;
          detalleJulio.push(
            `  ${q.clave} · ${empresa.padEnd(14)} parte=${l.parte?.empresa ?? "—"} `
            + `quinc=$${d2(x?.salarioQuincenal ?? 0)} rata=$${d2(x?.rataHora ?? 0)} `
            + `extras=$${d2((x?.extraDiurno ?? 0) + (x?.extraNocturno ?? 0) + (x?.excedente ?? 0))} `
            + `dom=$${d2(x?.domingos ?? 0)} aus=$${d2(x?.ausencias ?? 0)} tard=$${d2(x?.tardanzas ?? 0)} `
            + `BRUTO=$${d2(x?.totalBruto ?? 0)} seg=$${d2((x?.seguroSocial ?? 0) + (x?.seguroEducativo ?? 0))} `
            + `ded=$${d2(x?.totalDeducciones ?? 0)} NETO=$${d2(x?.netoPagar ?? 0)}`,
          );
        }
        if (empresa === "vistana" && dAntes) {
          detalleJulio.push(`  ${q.clave} · ANTES (una sola línea, vistana)  BRUTO=$${d2(dAntes.totalBruto)} seg=$${d2(dAntes.seguroSocial + dAntes.seguroEducativo)} NETO=$${d2(dAntes.netoPagar)}`);
        }
      }
    }
  }

  console.log(`\n${difOtros === 0 ? "🟢" : "🔴"} ${cifrasOtros} cifras de OTRAS personas · ${difOtros} movidas\n`);
  console.log("── JULIO, línea por línea ──");
  for (const l of detalleJulio) console.log(l);

  // ── LA SUMA POR QUINCENA: antes contra después ─────────────────────────────
  console.log("\n── El NETO de Julio, por quincena ──");
  let difSuma = 0;
  for (const d of datos) {
    const { q } = d;
    const fuera = fuerasDe(q);
    const fichasSin = new Map<string, any>();
    const fichasCon = new Map<string, any>();
    for (const p of personas) {
      const cod = String(p.empleado_codigo);
      if (fuera.has(cod)) continue;
      fichasSin.set(cod, { ...fichaBase(p), reparto: [] });
      fichasCon.set(cod, { ...fichaBase(p), reparto: cod === JULIO ? partesJulio : [] });
    }
    const nombres = new Map<string, string>();
    for (const [cod, f] of fichasSin) if (f.nombre) nombres.set(cod, f.nombre);
    const pers = NUEVO_REPORTE.armarReporte({
      marcaciones: d.marcaciones, horarios, justificaciones: d.just, vacaciones: d.vacs,
      feriados: d.feriados, desde: q.desde, hasta: q.hasta, reglas: rNuevo, nombres, incluirNoHabiles: true,
    } as any).filter((p) => !fuera.has(p.codigo));
    const comun = {
      personas: pers, manuales: d.manuales, reglas: rNuevo,
      jornadaDiariaMin: (c: string) => NUEVO_PLANILLA.jornadaDiariaMin(horarioDe.get(c)),
      exigirAprobacionExtra: d.exigir, diasExtraAprobados: d.dias,
    };

    let netoAntes = 0, netoDespues = 0, brutoAntes = 0, brutoDespues = 0, segAntes = 0, segDespues = 0;
    for (const empresa of EMPRESAS) {
      const sin = NUEVO_PLANILLA.armarPlanilla({ ...comun, fichas: fichasSin, empresa });
      const con = NUEVO_PLANILLA.armarPlanilla({ ...comun, fichas: fichasCon, empresa });
      for (const l of sin) if (l.codigo === JULIO && l.dinero) {
        netoAntes += l.dinero.netoPagar; brutoAntes += l.dinero.totalBruto;
        segAntes += l.dinero.seguroSocial + l.dinero.seguroEducativo;
      }
      for (const l of con) if (l.codigo === JULIO && l.dinero) {
        netoDespues += l.dinero.netoPagar; brutoDespues += l.dinero.totalBruto;
        segDespues += l.dinero.seguroSocial + l.dinero.seguroEducativo;
      }
    }
    const dif = Math.round((brutoDespues - brutoAntes) * 100) / 100;
    if (Math.abs(dif) > 0.005) {
      console.log(`  🔴 ${q.clave}: el BRUTO TOTAL se movió $${d2(dif)} — el reparto no puede crear ni destruir plata bruta`);
      difSuma += 1;
    }
    console.log(
      `  ${q.clave}  bruto $${d2(brutoAntes)} → $${d2(brutoDespues)}  ·  seguros $${d2(segAntes)} → $${d2(segDespues)}`
      + `  ·  NETO $${d2(netoAntes)} → $${d2(netoDespues)}  (${netoDespues >= netoAntes ? "+" : ""}$${d2(netoDespues - netoAntes)})`,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PASADA 3 — MUTACIÓN: un reparto roto tiene que RECHAZARSE
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n══ PASADA 3 — verificación por mutación del guard (en memoria) ══");
  const mutaciones: Array<{ nombre: string; filas: FilaReparto[]; salario: number }> = [
    { nombre: "las partes NO suman el salario (800 + 100)", salario: 1000, filas: [
      { ...REPARTO_JULIO[0] }, { ...REPARTO_JULIO[1], salario_mensual: "100.00" }] },
    { nombre: "NINGUNA parte paga las horas extra", salario: 1000, filas: [
      { ...REPARTO_JULIO[0] }, { ...REPARTO_JULIO[1], paga_horas_extra: false }] },
    { nombre: "LAS DOS pagan las horas extra", salario: 1000, filas: [
      { ...REPARTO_JULIO[0], paga_horas_extra: true }, { ...REPARTO_JULIO[1] }] },
    { nombre: "la MISMA empresa dos veces", salario: 1000, filas: [
      { ...REPARTO_JULIO[0] }, { ...REPARTO_JULIO[1], empresa: "vistana" }] },
    { nombre: "una sola parte", salario: 1000, filas: [{ ...REPARTO_JULIO[0], salario_mensual: "1000.00" }] },
    { nombre: "una empresa que no es del reloj", salario: 1000, filas: [
      { ...REPARTO_JULIO[0] }, { ...REPARTO_JULIO[1], empresa: "joystep" }] },
    { nombre: "un monto en cero", salario: 1000, filas: [
      { ...REPARTO_JULIO[0], salario_mensual: "1000.00" }, { ...REPARTO_JULIO[1], salario_mensual: "0" }] },
  ];

  const dq = datos[1]; // 2026-07-2
  let cazadas = 0;
  for (const m of mutaciones) {
    const r = validarReparto(m.salario, m.filas);
    const partes = partesDe(m.salario, m.filas);
    if (r.ok || partes.length !== 0) {
      console.log(`  ⛔ SOBREVIVIÓ — ${m.nombre}`);
      continue;
    }
    // Y además: con el reparto rechazado, la planilla vuelve a UNA sola línea
    const fuera = fuerasDe(dq.q);
    const fichas = new Map<string, any>();
    for (const p of personas) {
      const cod = String(p.empleado_codigo);
      if (fuera.has(cod)) continue;
      fichas.set(cod, { ...fichaBase(p), reparto: cod === JULIO ? partes : [] });
    }
    const nombres = new Map<string, string>();
    for (const [cod, f] of fichas) if (f.nombre) nombres.set(cod, f.nombre);
    const pers = NUEVO_REPORTE.armarReporte({
      marcaciones: dq.marcaciones, horarios, justificaciones: dq.just, vacaciones: dq.vacs,
      feriados: dq.feriados, desde: dq.q.desde, hasta: dq.q.hasta, reglas: rNuevo, nombres, incluirNoHabiles: true,
    } as any).filter((p) => !fuera.has(p.codigo));
    let lineasJulio = 0;
    for (const empresa of EMPRESAS) {
      const ls = NUEVO_PLANILLA.armarPlanilla({
        personas: pers, fichas, manuales: dq.manuales, reglas: rNuevo, empresa,
        jornadaDiariaMin: (c: string) => NUEVO_PLANILLA.jornadaDiariaMin(horarioDe.get(c)),
        exigirAprobacionExtra: dq.exigir, diasExtraAprobados: dq.dias,
      });
      lineasJulio += ls.filter((l) => l.codigo === JULIO).length;
    }
    if (lineasJulio !== 1) {
      console.log(`  ⛔ SOBREVIVIÓ — ${m.nombre}: ${lineasJulio} líneas de Julio (se esperaba 1)`);
      continue;
    }
    cazadas += 1;
    console.log(`  ✅ rechazado — ${m.nombre}\n     motivo: «${r.error}»`);
  }
  console.log(`\n${cazadas === mutaciones.length ? "🟢" : "🔴"} ${cazadas} de ${mutaciones.length} mutaciones cazadas`);

  const ok = dif1 === 0 && difOtros === 0 && difSuma === 0 && cazadas === mutaciones.length;
  console.log(`\n${ok ? "🟢 TODO VERDE" : "🔴 HAY HALLAZGOS"}`);
  // ⚠️ `exitCode`, NUNCA `process.exit()`: eso mataría el proceso antes del
  // `finally` que borra la copia del motor viejo, y quedaría suelta en `src/`.
  process.exitCode = ok ? 0 : 1;
}

traerMotorViejo();
void main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(borrarMotorViejo);
