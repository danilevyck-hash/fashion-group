/* ─────────────────────────────────────────────────────────────────────────────
 * LOS TRES ARREGLOS, MEDIDOS CONTRA PRODUCCIÓN — solo lectura.
 *
 * Corre la lógica de la ruta VIEJA (la de `origin/main`, sacada al ejecutar y no
 * una copia versionada que envejece sola) y la NUEVA sobre LOS MISMOS datos de
 * producción, y muestra el antes/después **al centavo, persona por persona**.
 *
 * 🔴 Y EXIGE LAS DOS COSAS QUE NO PUEDEN FALLAR:
 *
 *   (1) UNA QUINCENA CERRADA NO SE MUEVE NI UN CENTAVO. Las de julio ya se
 *       pagaron: si un solo campo cambia, el arreglo tocó algo que no debía.
 *   (2) YEISHKA NO COBRA $300. Es el error que había que hacer imposible — el
 *       "arreglo obvio" (dejar de contarle las ausencias de días en que no
 *       trabajaba acá) le paga la quincena completa, que es peor que el bug.
 *
 * ⚠️ NO ESCRIBE NADA.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_verif-planilla-dias-que-no-pasaron.ts [YYYY-MM-DD hoy]
 * ────────────────────────────────────────────────────────────────────────── */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import * as NUEVO_PLANILLA from "@/lib/asistencia/planilla";
import * as NUEVO_REPORTE from "@/lib/asistencia/reporte";
import { reglasDesdeFila as reglasNuevo } from "@/lib/asistencia/config";
import { motivoPeriodoParcial } from "@/lib/asistencia/vigencia";
import { avisoPeriodoAbierto, textoCodigosSinFicha, textoJustificacion } from "@/lib/asistencia/periodo";
import { hoyPanama } from "@/lib/fecha-panama";

const DIR_ANTES = path.join(process.cwd(), "src/lib/asistencia-antes");
const MODULOS = ["config.ts", "reporte.ts", "planilla.ts", "directorio.ts", "motivos.ts", "vigencia.ts"];

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

const HOY = process.argv[2] ?? hoyPanama();
const EMPRESAS = ["confecciones_boston", "vistana", "fashion_wear"];
/** La quincena en curso (la que la contadora va a correr) y dos ya cerradas. */
const EN_CURSO = "2026-08-1";
const CERRADAS = ["2026-07-1", "2026-07-2"];

const money = (n: number) => `$${n.toFixed(2)}`;

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

  const personasDb = await todo<any>("asistencia_personas", (x) =>
    x.select("empleado_codigo, nombre, salario_mensual, jornada_semanal, empresa, fecha_ingreso, fecha_salida, motivo_salida, servicio_profesional"));
  const horariosRaw = await todo<any>("asistencia_horarios", (x) =>
    x.select("empleado_codigo, entrada, salida, almuerzo_minutos"));
  const horarios = horariosRaw.map((h) => ({
    ...h, entrada: String(h.entrada).slice(0, 5), salida: String(h.salida).slice(0, 5),
  }));
  const horarioDe = new Map(horarios.map((h) => [h.empleado_codigo, h]));

  console.log(`Hoy en PANAMÁ: ${HOY}\n`);

  /** Todo lo que hace la ruta, con el motor que se le pase. */
  async function correr(clave: string, nuevo: boolean) {
    const P: any = nuevo ? NUEVO_PLANILLA : VIEJO_PLANILLA;
    const R: any = nuevo ? NUEVO_REPORTE : VIEJO_REPORTE;
    const reglas = nuevo ? rNuevo : rViejo;
    const q = P.quincenaDesdeClave(clave)!;

    const marcaciones = await todo<any>("asistencia_marcaciones", (x) =>
      x.select("id, empleado_codigo, empleado_nombre, ocurrio_en")
        .gte("ocurrio_en", instante(q.desde, false))
        .lte("ocurrio_en", instante(q.hasta, true))
        .order("ocurrio_en", { ascending: true }).order("id", { ascending: true }));
    const { data: just } = await db.from("asistencia_justificaciones")
      .select("empleado_codigo, desde, hasta, motivo").lte("desde", q.hasta).gte("hasta", q.desde);
    const { data: fer } = await db.from("asistencia_feriados")
      .select("fecha, nombre").gte("fecha", q.desde).lte("fecha", q.hasta);
    const feriados = new Map((fer ?? []).map((f: any) => [String(f.fecha), String(f.nombre)]));
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

    const vigencias = new Map<string, any>();
    for (const p of personasDb) {
      vigencias.set(String(p.empleado_codigo), {
        fechaIngreso: p.fecha_ingreso ? String(p.fecha_ingreso) : null,
        fechaSalida: p.fecha_salida ? String(p.fecha_salida) : null,
        motivoSalida: p.motivo_salida ?? null,
      });
    }
    const fuera = new Set<string>();
    for (const [cod, v] of vigencias) {
      if ((v.fechaSalida && v.fechaSalida < q.desde) || (v.fechaIngreso && v.fechaIngreso > q.hasta)) {
        fuera.add(cod);
      }
    }
    const fichas = new Map<string, any>();
    for (const p of personasDb) {
      const cod = String(p.empleado_codigo);
      if (fuera.has(cod)) continue;
      fichas.set(cod, {
        codigo: cod, nombre: p.nombre ?? null,
        salarioMensual: p.salario_mensual === null ? null : Number(p.salario_mensual),
        jornadaSemanal: p.jornada_semanal ?? null,
        empresa: p.empresa ?? null,
        servicioProfesional: p.servicio_profesional === true,
      });
    }
    const nombres = new Map<string, string>();
    for (const [cod, f] of fichas) if (f.nombre) nombres.set(cod, f.nombre);

    const personas = R.armarReporte({
      marcaciones, horarios, justificaciones: (just ?? []) as any, feriados,
      desde: q.desde, hasta: q.hasta, reglas, nombres, incluirNoHabiles: true,
      // 🔴 EL ARREGLO 1. La ruta vieja NO lo pasaba.
      ...(nuevo ? { diaEnCurso: HOY } : {}),
    }).filter((p: any) => !fuera.has(p.codigo));

    // 🔴 EL ARREGLO 2. Solo existe en la ruta nueva.
    const decidirAMano = new Map<string, string>();
    const justificados = new Map<string, string>();
    if (nuevo) {
      for (const [cod, v] of vigencias) {
        if (fuera.has(cod)) continue;
        const m = motivoPeriodoParcial(v, q.desde, q.hasta);
        if (m) decidirAMano.set(cod, m);
      }
      for (const j of (just ?? []) as any[]) {
        const cod = String(j.empleado_codigo);
        const t = textoJustificacion(String(j.motivo), String(j.desde), String(j.hasta));
        justificados.set(cod, justificados.has(cod) ? `${justificados.get(cod)} · ${t}` : t);
      }
    }

    const porEmpresa = new Map<string, any>();
    for (const empresa of EMPRESAS) {
      const todas = P.armarPlanilla({
        personas, fichas, manuales,
        jornadaDiariaMin: (c: string) => P.jornadaDiariaMin(horarioDe.get(c) as any),
        reglas, empresa,
        ...(nuevo ? { decidirAMano, justificados } : {}),
      });
      // 🔴 EL ARREGLO 3.
      const { lineas, sinFicha } = nuevo
        ? P.separarSinFicha(todas)
        : { lineas: todas, sinFicha: [] as any[] };
      porEmpresa.set(empresa, { lineas, sinFicha, totales: P.totalizar(lineas) });
    }
    return { q, porEmpresa, marcaciones, decidirAMano, justificados };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // (1) LAS QUINCENAS YA CERRADAS NO SE MUEVEN
  // ───────────────────────────────────────────────────────────────────────────
  console.log("── 🔴 LAS QUINCENAS CERRADAS NO SE MUEVEN ──");
  let camposDistintos = 0;
  let camposComparados = 0;
  for (const clave of CERRADAS) {
    const a = await correr(clave, false);
    const b = await correr(clave, true);
    for (const empresa of EMPRESAS) {
      const la = a.porEmpresa.get(empresa)!;
      const lb = b.porEmpresa.get(empresa)!;
      const mapa = new Map(lb.lineas.map((l: any) => [l.codigo, l]));
      const movidos = new Set((lb.sinFicha as any[]).map((l) => l.codigo));
      for (const x of la.lineas) {
        const y: any = mapa.get(x.codigo);
        if (!y) {
          // 🔑 Salir del cuadro SOLO es legítimo para el código sin ficha, que
          // ahora se muestra una vez arriba en vez de tres veces adentro. Ese
          // código nunca produjo un dólar, así que no mueve ninguna plata.
          const legitimo = movidos.has(x.codigo) && !x.dinero;
          if (!legitimo) {
            camposDistintos += 1;
            console.log(`  🔴 ${clave} ${empresa} ${x.codigo} desapareció del cuadro SIN ser un código sin ficha`);
          }
          continue;
        }
        for (const k of Object.keys(x.dinero ?? {})) {
          camposComparados += 1;
          if ((y.dinero?.[k] ?? null) !== (x.dinero as any)[k]) {
            camposDistintos += 1;
            console.log(`  🔴 ${clave} ${empresa} ${x.etiqueta} ${k}: ${(x.dinero as any)[k]} → ${y.dinero?.[k]}`);
          }
        }
        if (!x.dinero && y.dinero) {
          camposDistintos += 1;
          console.log(`  🔴 ${clave} ${empresa} ${x.etiqueta} pasó de SIN pago a CON pago`);
        }
      }
      for (const k of ["netoPagar", "totalBruto", "ausencias", "tardanzas"] as const) {
        camposComparados += 1;
        if (la.totales[k] !== lb.totales[k]) {
          camposDistintos += 1;
          console.log(`  🔴 ${clave} ${empresa} TOTAL ${k}: ${la.totales[k]} → ${lb.totales[k]}`);
        }
      }
      console.log(
        `  ${clave} ${empresa.padEnd(20)} neto ${money(la.totales.netoPagar).padStart(11)} → ${money(lb.totales.netoPagar).padStart(11)}`,
      );
    }
  }
  console.log(
    camposDistintos === 0
      ? `  🟢 ${camposComparados} cifras comparadas, 0 diferencias.\n`
      : `  🔴 ${camposDistintos} diferencias.\n`,
  );

  // ───────────────────────────────────────────────────────────────────────────
  // (2) LA QUINCENA EN CURSO — el antes/después que importa
  // ───────────────────────────────────────────────────────────────────────────
  const a = await correr(EN_CURSO, false);
  const b = await correr(EN_CURSO, true);
  console.log(`── LA QUINCENA EN CURSO: ${a.q.etiqueta} ──`);
  const aviso = avisoPeriodoAbierto(b.q.desde, b.q.hasta, HOY, true);
  console.log(`  aviso: «${aviso?.texto ?? "(ninguno: el período ya cerró)"}»`);

  let ausA = 0; let ausB = 0; let netoA = 0; let netoB = 0;
  const filas: Array<{ etiqueta: string; empresa: string; dAus: number; netoA: number; netoB: number; nota: string }> = [];
  for (const empresa of EMPRESAS) {
    const la = a.porEmpresa.get(empresa)!;
    const lb = b.porEmpresa.get(empresa)!;
    ausA += la.totales.ausencias; ausB += lb.totales.ausencias;
    netoA += la.totales.netoPagar; netoB += lb.totales.netoPagar;
    console.log(
      `  ${empresa.padEnd(20)} ausencias ${money(la.totales.ausencias).padStart(10)} → ${money(lb.totales.ausencias).padStart(10)}`
      + `   neto ${money(la.totales.netoPagar).padStart(11)} → ${money(lb.totales.netoPagar).padStart(11)}`
      + `   personas ${la.totales.personas} → ${lb.totales.personas}`
      + `   decidir ${lb.totales.decidirAMano}   falta ${la.totales.sinConfigurar} → ${lb.totales.sinConfigurar}`,
    );
    const mapa = new Map(lb.lineas.map((l: any) => [l.codigo, l]));
    for (const x of la.lineas) {
      const y: any = mapa.get(x.codigo);
      const nA = x.dinero?.netoPagar ?? 0;
      const nB = y?.dinero?.netoPagar ?? 0;
      const dAus = (y?.dinero?.ausencias ?? 0) - (x.dinero?.ausencias ?? 0);
      const nota = !y
        ? "salió del cuadro (sin ficha, ahora arriba una sola vez)"
        : y.decidirAMano
          ? `DECIDILO VOS — ${y.decidirAMano}` + (y.quincenalReferencia !== null ? ` · quincena completa ${money(y.quincenalReferencia)}` : "")
          : "";
      if (dAus === 0 && nA === nB && !nota) continue;
      filas.push({ etiqueta: `${x.etiqueta} (${x.codigo})`, empresa, dAus, netoA: nA, netoB: nB, nota });
    }
  }
  console.log(`\n  TOTAL ausencias  ${money(ausA)} → ${money(ausB)}   (falsas: ${money(ausA - ausB)})`);
  console.log(`  TOTAL neto       ${money(netoA)} → ${money(netoB)}\n`);

  console.log("── PERSONA POR PERSONA (las que cambian) ──");
  for (const f of filas.sort((x, y) => (y.netoB - y.netoA) - (x.netoB - x.netoA))) {
    console.log(
      `  ${f.etiqueta.slice(0, 34).padEnd(35)} ${f.empresa.padEnd(20)} `
      + `neto ${money(f.netoA).padStart(9)} → ${money(f.netoB).padStart(9)}  ${f.nota}`,
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // (3) LOS CUATRO CASOS QUE DANIEL PIDIÓ VER
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n── LOS CUATRO CASOS ──");
  const buscar = (codigo: string) => {
    for (const empresa of EMPRESAS) {
      const la = a.porEmpresa.get(empresa)!;
      const lb = b.porEmpresa.get(empresa)!;
      const x = la.lineas.find((l: any) => l.codigo === codigo);
      const y = lb.lineas.find((l: any) => l.codigo === codigo);
      if (x || y) return { empresa, x, y };
    }
    return null;
  };
  let yeishkaOk = true;
  for (const codigo of ["54", "53", "13", "29"]) {
    const r = buscar(codigo);
    if (!r) { console.log(`  ${codigo}: no aparece en ninguna empresa`); continue; }
    const { x, y } = r as any;
    const antes = x?.dinero
      ? `neto ${money(x.dinero.netoPagar)} (ausencias ${money(x.dinero.ausencias)})`
      : `sin pago — ${x?.faltaConfigurar?.join(" · ") ?? "?"}`;
    const despues = y?.dinero
      ? `neto ${money(y.dinero.netoPagar)}`
      : y?.decidirAMano
        ? `DECIDILO VOS — ${y.decidirAMano}` + (y.quincenalReferencia !== null ? ` · quincena completa ${money(y.quincenalReferencia)}` : "")
        : `sin pago — ${y?.faltaConfigurar?.join(" · ") ?? "?"}`;
    console.log(`  ${(y?.etiqueta ?? x?.etiqueta ?? codigo).padEnd(32)} ANTES ${antes.padEnd(46)} AHORA ${despues}`);
    if (codigo === "54" && y?.dinero) yeishkaOk = false;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // (4) EL CÓDIGO SIN FICHA
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n── EL CÓDIGO SIN FICHA ──");
  let vecesAntes = 0;
  for (const empresa of EMPRESAS) {
    const la = a.porEmpresa.get(empresa)!;
    const n = la.lineas.filter((l: any) => l.faltaConfigurar.includes("sin ficha en Configuración")).length;
    vecesAntes += n;
    console.log(`  ANTES ${empresa.padEnd(20)} ${n} línea(s) sin ficha dentro del cuadro`);
  }
  const marcasPorCodigo = new Map<string, number>();
  for (const m of b.marcaciones) {
    const c = String(m.empleado_codigo ?? "").trim();
    if (c) marcasPorCodigo.set(c, (marcasPorCodigo.get(c) ?? 0) + 1);
  }
  const sinFicha = (b.porEmpresa.get(EMPRESAS[0])!.sinFicha as any[]).map((l) => ({
    codigo: l.codigo, marcaciones: marcasPorCodigo.get(l.codigo) ?? 0,
  }));
  let vecesDespues = 0;
  for (const empresa of EMPRESAS) {
    vecesDespues += (b.porEmpresa.get(empresa)!.lineas as any[])
      .filter((l) => l.faltaConfigurar.includes("sin ficha en Configuración")).length;
  }
  console.log(`  AHORA dentro de los cuadros: ${vecesDespues} línea(s)`);
  console.log(`  AHORA arriba, una sola vez: «${textoCodigosSinFicha(sinFicha) ?? "(ninguno)"}»`);

  const ok = camposDistintos === 0 && yeishkaOk && vecesDespues === 0;
  console.log(
    ok
      ? `\n🟢 Las quincenas cerradas no se movieron · Yeishka NO cobra la quincena completa · `
        + `el código sin ficha pasó de ${vecesAntes} apariciones a 1 aviso.`
      : "\n🔴 Algo no cumple. Mirá arriba.",
  );
  process.exitCode = ok ? 0 : 1;
}

traerMotorViejo();
void main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(borrarMotorViejo);
