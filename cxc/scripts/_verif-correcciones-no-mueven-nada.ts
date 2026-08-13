/* ─────────────────────────────────────────────────────────────────────────────
 * ¿SE MOVIÓ UN CENTAVO POR AGREGAR LAS CORRECCIONES? — solo lectura.
 *
 * Tres preguntas, contra los datos REALES de producción:
 *
 *   PASADA 1 — SIN NINGUNA CORRECCIÓN, ¿la planilla da exactamente lo mismo que
 *              hoy? Se corre el motor VIEJO (el de `origin/main`, sacado al
 *              ejecutar — una copia versionada envejece sola) y el NUEVO sobre
 *              los MISMOS datos, y se comparan línea por línea, campo por campo.
 *              🔴 Acá se espera CERO diferencias. Nada más sirve.
 *
 *   PASADA 2 — EL CANDADO DEL DINERO. Se simula UNA corrección sobre la primera
 *              tardanza real que se encuentre y se exige que (a) cambie el pago
 *              de ESA persona y (b) NO le toque un centavo a NADIE MÁS.
 *
 *   PASADA 3 — DESHACER. Sin la corrección viva, el número vuelve al ORIGINAL,
 *              al centavo, campo por campo.
 *
 * ⚠️ NO ESCRIBE NADA. Lee `asistencia_*` y calcula en memoria; la corrección de
 * la pasada 2 se inventa en RAM y nunca toca la base.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_verif-correcciones-no-mueven-nada.ts
 * ────────────────────────────────────────────────────────────────────────── */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import * as NUEVO_PLANILLA from "@/lib/asistencia/planilla";
import * as NUEVO_REPORTE from "@/lib/asistencia/reporte";
import { reglasDesdeFila as reglasNuevo } from "@/lib/asistencia/config";
import { aplicarCorrecciones, type Correccion } from "@/lib/asistencia/correcciones";

/** El motor VIEJO se saca de `origin/main` AL CORRER. Se borra al terminar. */
const DIR_ANTES = path.join(process.cwd(), "src/lib/asistencia-antes");
const MODULOS = ["config.ts", "reporte.ts", "planilla.ts", "directorio.ts", "participacion.ts"];

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
const borrarMotorViejo = () => fs.rmSync(DIR_ANTES, { recursive: true, force: true });

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

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

interface Contexto {
  q: any;
  marcaciones: any[];
  just: any[];
  feriados: Map<string, string>;
  manuales: Map<string, any>;
}

async function contextoDe(clave: string): Promise<Contexto> {
  const q = NUEVO_PLANILLA.quincenaDesdeClave(clave)!;
  const marcaciones = await todo<any>("asistencia_marcaciones", (x) =>
    x.select("id, empleado_codigo, empleado_nombre, ocurrio_en")
      .gte("ocurrio_en", instante(q.desde, false))
      .lte("ocurrio_en", instante(q.hasta, true))
      .order("ocurrio_en", { ascending: true })
      .order("id", { ascending: true }));
  const { data: just } = await db.from("asistencia_justificaciones")
    .select("empleado_codigo, desde, hasta, motivo").lte("desde", q.hasta).gte("hasta", q.desde);
  const { data: fer } = await db.from("asistencia_feriados")
    .select("fecha, nombre").gte("fecha", q.desde).lte("fecha", q.hasta);
  const manuales = new Map<string, any>();
  const { data: man } = await db.from("asistencia_planilla_manual")
    .select("empleado_codigo, isr, prestamo, terceros, mercancia, otros_servicios")
    .eq("quincena", q.clave);
  for (const m of (man ?? []) as any[]) {
    manuales.set(String(m.empleado_codigo), {
      isr: Number(m.isr ?? 0), prestamo: Number(m.prestamo ?? 0),
      terceros: Number(m.terceros ?? 0), mercancia: Number(m.mercancia ?? 0),
      otrosServicios: Number(m.otros_servicios ?? 0),
    });
  }
  return {
    q,
    marcaciones,
    just: (just ?? []) as any[],
    feriados: new Map((fer ?? []).map((f: any) => [String(f.fecha), String(f.nombre)])),
    manuales,
  };
}

async function main() {
  const VIEJO_PLANILLA = await import("@/lib/asistencia-antes/planilla");
  const VIEJO_REPORTE = await import("@/lib/asistencia-antes/reporte");
  const { reglasDesdeFila: reglasViejo } = await import("@/lib/asistencia-antes/config");

  const { data: filaReglas } = await db.from("asistencia_reglas").select("*").eq("id", 1).maybeSingle();
  const rViejo = reglasViejo(filaReglas as any);
  const rNuevo = reglasNuevo(filaReglas as any);

  const personas = await todo<any>("asistencia_personas", (q) =>
    q.select("empleado_codigo, nombre, salario_mensual, jornada_semanal, empresa, fecha_ingreso, fecha_salida, servicio_profesional"));
  const horariosRaw = await todo<any>("asistencia_horarios", (q) =>
    q.select("empleado_codigo, entrada, salida, almuerzo_minutos"));
  const horarios = horariosRaw.map((h) => ({
    ...h, entrada: String(h.entrada).slice(0, 5), salida: String(h.salida).slice(0, 5),
  }));
  const horarioDe = new Map(horarios.map((h) => [h.empleado_codigo, h]));

  // ¿Hay correcciones guardadas en producción? Si la tabla no existe todavía,
  // la respuesta es "ninguna" y eso es exactamente lo que se quiere medir.
  let correccionesEnProduccion = 0;
  let tablaExiste = true;
  {
    // ⚠️ Un select DE VERDAD, no `head: true`: con `head` PostgREST puede
    // contestar sin cuerpo y el error de «esta tabla no existe» se pierde — la
    // primera versión de este script decía «EXISTE» sobre una tabla que no
    // estaba creada, que es la peor forma posible de que una verificación
    // mienta.
    const { data, error } = await db
      .from("asistencia_correcciones")
      .select("id")
      .is("anulada_en", null);
    if (error) tablaExiste = false;
    else correccionesEnProduccion = (data ?? []).length;
  }

  console.log("═".repeat(78));
  console.log("CORRECCIONES DE MARCACIÓN — ¿se movió un centavo? (solo lectura)");
  console.log("═".repeat(78));
  console.log(`Tabla asistencia_correcciones : ${tablaExiste ? "EXISTE" : "todavía no (DDL sin correr)"}`);
  console.log(`Correcciones vivas en producción: ${tablaExiste ? correccionesEnProduccion : 0}`);
  console.log(`Personas con ficha: ${personas.length} · horarios: ${horarios.length}`);

  function armar(motorRep: any, motorPla: any, reglas: any, ctx: Contexto, empresa: string,
                 marcaciones: any[], correccionesPorDia?: Map<string, any[]>) {
    const fuera = new Set<string>();
    for (const p of personas) {
      const s = p.fecha_salida ? String(p.fecha_salida) : null;
      const i = p.fecha_ingreso ? String(p.fecha_ingreso) : null;
      if ((s && s < ctx.q.desde) || (i && i > ctx.q.hasta)) fuera.add(String(p.empleado_codigo));
    }
    const fichas = new Map<string, any>();
    for (const p of personas) {
      const cod = String(p.empleado_codigo);
      if (fuera.has(cod)) continue;
      fichas.set(cod, {
        codigo: cod,
        nombre: p.nombre ?? null,
        salarioMensual: p.salario_mensual === null ? null : Number(p.salario_mensual),
        jornadaSemanal: p.jornada_semanal ?? null,
        empresa: p.empresa ?? null,
        servicioProfesional: p.servicio_profesional === true,
      });
    }
    const nombres = new Map<string, string>();
    for (const [cod, f] of fichas) if (f.nombre) nombres.set(cod, f.nombre);

    const pers = motorRep.armarReporte({
      marcaciones, horarios, justificaciones: ctx.just, feriados: ctx.feriados,
      desde: ctx.q.desde, hasta: ctx.q.hasta, reglas, nombres, incluirNoHabiles: true,
      ...(correccionesPorDia ? { correccionesPorDia } : {}),
    }).filter((p: any) => !fuera.has(p.codigo));

    return motorPla.armarPlanilla({
      personas: pers, fichas, manuales: ctx.manuales,
      jornadaDiariaMin: (c: string) => motorPla.jornadaDiariaMin(horarioDe.get(c) as any),
      reglas, empresa, factorBase: ctx.q.factorBase ?? 1,
    });
  }

  /** Compara dos juegos de líneas campo por campo. Devuelve los códigos que se movieron. */
  function comparar(a: any[], b: any[], etiqueta: string, silencioso = false) {
    const porCodigo = new Map(b.map((l: any) => [l.codigo, l]));
    const movidos = new Set<string>();
    let cifras = 0;
    let dif = 0;
    for (const x of a) {
      const y = porCodigo.get(x.codigo);
      if (!y) { console.log(`  🔴 ${etiqueta} ${x.codigo}: la línea desapareció`); dif++; movidos.add(x.codigo); continue; }
      for (const k of Object.keys(x.horas)) {
        cifras++;
        if (x.horas[k] !== y.horas[k]) {
          if (!silencioso) console.log(`  🔴 ${etiqueta} ${x.etiqueta}: horas.${k} ${x.horas[k]} → ${y.horas[k]}`);
          dif++; movidos.add(x.codigo);
        }
      }
      if (!!x.dinero !== !!y.dinero) {
        console.log(`  🔴 ${etiqueta} ${x.etiqueta}: uno calculó dinero y el otro no`); dif++; movidos.add(x.codigo);
      } else if (x.dinero && y.dinero) {
        for (const k of Object.keys(x.dinero)) {
          cifras++;
          if (x.dinero[k] !== y.dinero[k]) {
            if (!silencioso) console.log(`  🔴 ${etiqueta} ${x.etiqueta}: dinero.${k} ${x.dinero[k]} → ${y.dinero[k]}`);
            dif++; movidos.add(x.codigo);
          }
        }
      }
    }
    return { dif, cifras, movidos };
  }

  // ── PASADA 1 ───────────────────────────────────────────────────────────────
  console.log("\n" + "─".repeat(78));
  console.log("PASADA 1 — SIN NINGUNA CORRECCIÓN: ¿da lo mismo que origin/main?");
  console.log("─".repeat(78));
  let dif1 = 0, cif1 = 0, lin1 = 0;
  const contextos = new Map<string, Contexto>();
  for (const clave of QUINCENAS) {
    const ctx = await contextoDe(clave);
    contextos.set(clave, ctx);
    for (const empresa of EMPRESAS) {
      const lv = armar(VIEJO_REPORTE, VIEJO_PLANILLA, rViejo, ctx, empresa, ctx.marcaciones);
      // El motor NUEVO recibe la lista pasada por `aplicarCorrecciones` con CERO
      // correcciones — que es literalmente el camino de la ruta en producción.
      const efectivas = aplicarCorrecciones(ctx.marcaciones, []);
      const ln = armar(NUEVO_REPORTE, NUEVO_PLANILLA, rNuevo, ctx, empresa,
                       efectivas.marcaciones, efectivas.porDia as any);
      const r = comparar(lv, ln, `${clave} ${empresa}`);
      dif1 += r.dif; cif1 += r.cifras; lin1 += lv.length;
      const tv = VIEJO_PLANILLA.totalizar(lv);
      const tn = NUEVO_PLANILLA.totalizar(ln);
      if (tv.netoPagar !== tn.netoPagar) { console.log(`  🔴 TOTAL ${clave} ${empresa}: ${tv.netoPagar} → ${tn.netoPagar}`); dif1++; }
      cif1++;
      console.log(`  ${clave} · ${empresa}: ${lv.length} líneas · neto $${tv.netoPagar.toFixed(2)} → $${tn.netoPagar.toFixed(2)}`);
    }
  }
  console.log(`\n${dif1 === 0 ? "🟢" : "🔴"} ${lin1} líneas · ${cif1} cifras comparadas · ${dif1} diferencias`);

  // ── PASADA 2 y 3 ───────────────────────────────────────────────────────────
  console.log("\n" + "─".repeat(78));
  console.log("PASADA 2 — UNA corrección: ¿cambia SU pago y SOLO el suyo?");
  console.log("─".repeat(78));

  // Se busca una tardanza REAL en los datos de producción: la primera persona
  // de una empresa con minutos tarde > 0 y con dinero calculado.
  let probado = false;
  for (const clave of QUINCENAS) {
    if (probado) break;
    const ctx = contextos.get(clave)!;
    for (const empresa of EMPRESAS) {
      if (probado) break;
      const base = armar(NUEVO_REPORTE, NUEVO_PLANILLA, rNuevo, ctx, empresa, ctx.marcaciones);
      const victima = base.find((l: any) => l.dinero && l.horas.tardanzaMin > 0);
      if (!victima) continue;

      // ¿Cuál es su PRIMERA marcación tarde? Se corrige a las 8:00 en punto.
      const suyas = ctx.marcaciones
        .filter((m) => String(m.empleado_codigo).trim() === victima.codigo)
        .sort((a, b) => a.ocurrio_en.localeCompare(b.ocurrio_en));
      const primera = suyas.find((m) => {
        const seg = NUEVO_REPORTE.segundosDelDia(m.ocurrio_en);
        return seg > 8 * 3600 + 10 * 60; // pasada la tolerancia
      });
      if (!primera) continue;

      const fecha = NUEVO_REPORTE.diaPanama(primera.ocurrio_en);
      const correccion: Correccion = {
        id: "simulada",
        marcacionId: String(primera.id),
        empleadoCodigo: victima.codigo,
        fecha,
        hora: "08:00:00",
        motivo: "PRUEBA — no se guarda en la base",
        creadaPor: "verificación",
        creadaEn: new Date().toISOString(),
      };

      const efect = aplicarCorrecciones(ctx.marcaciones, [correccion]);
      const conCorreccion = armar(NUEVO_REPORTE, NUEVO_PLANILLA, rNuevo, ctx, empresa,
                                  efect.marcaciones, efect.porDia as any);

      const r = comparar(base, conCorreccion, `${clave} ${empresa}`, true);
      const otros = [...r.movidos].filter((c) => c !== victima.codigo);

      const antes = base.find((l: any) => l.codigo === victima.codigo)!;
      const desp = conCorreccion.find((l: any) => l.codigo === victima.codigo)!;

      console.log(`  Persona     : ${antes.etiqueta} (${clave} · ${empresa})`);
      console.log(`  Marcación   : ${fecha} ${NUEVO_REPORTE.horaPanama(primera.ocurrio_en)} → corregida a 08:00`);
      console.log(`  Tardanza    : ${antes.horas.tardanzaMin.toFixed(2)} min → ${desp.horas.tardanzaMin.toFixed(2)} min`);
      console.log(`  Neto        : $${antes.dinero.netoPagar.toFixed(2)} → $${desp.dinero.netoPagar.toFixed(2)}`);
      console.log(`  ${desp.dinero.netoPagar !== antes.dinero.netoPagar ? "🟢" : "🔴"} el pago de ESA persona ${desp.dinero.netoPagar !== antes.dinero.netoPagar ? "SÍ cambió" : "NO cambió (la corrección no llegó al pago)"}`);
      console.log(`  ${otros.length === 0 ? "🟢" : "🔴"} personas ajenas movidas: ${otros.length}${otros.length ? ` → ${otros.join(", ")}` : ""}`);

      // ── PASADA 3 — deshacer ────────────────────────────────────────────────
      console.log("\n" + "─".repeat(78));
      console.log("PASADA 3 — DESHACER: ¿vuelve el número original, al centavo?");
      console.log("─".repeat(78));
      const deshecho = armar(NUEVO_REPORTE, NUEVO_PLANILLA, rNuevo, ctx, empresa,
                             aplicarCorrecciones(ctx.marcaciones, []).marcaciones);
      const r3 = comparar(base, deshecho, `${clave} ${empresa} (deshecho)`);
      console.log(`  ${r3.dif === 0 ? "🟢" : "🔴"} ${r3.cifras} cifras comparadas · ${r3.dif} diferencias`);
      const dp = deshecho.find((l: any) => l.codigo === victima.codigo)!;
      console.log(`  Neto de ${antes.etiqueta}: $${antes.dinero.netoPagar.toFixed(2)} → $${dp.dinero.netoPagar.toFixed(2)}`);
      probado = true;
    }
  }
  if (!probado) console.log("  ⚠️ No se encontró ninguna tardanza real con dinero calculado para probar.");
  console.log("═".repeat(78));
}

traerMotorViejo();
main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(borrarMotorViejo);
