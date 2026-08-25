/* ─────────────────────────────────────────────────────────────────────────────
 * «AUSENCIA» CALCULADA — LA PRUEBA DE QUE NO SE MUEVE UN CENTAVO. Solo lectura.
 *
 * Daniel: pasados 30 minutos tarde, la columna se llama «Ausencia» en vez de
 * «Tardanza». Y eligió, entre dos opciones, que los minutos se descuenten
 * **igual que una tardanza**: *"Los 45 minutos, igual que una tardanza. La
 * columna «Ausencia» es solo para que lo veas."*
 *
 * 🔴 O SEA QUE ESTE PR TIENE QUE DAR DIFERENCIA CERO EN PLATA, y el script
 * FALLA si mueve un centavo. Lo que exige, campo por campo:
 *
 *   (1) `totalBruto`, `netoPagar` y las otras 16 columnas: IDÉNTICAS.
 *   (2) `ausencias + tardanzas`: IDÉNTICA. Lo único que puede cambiar es cómo
 *       se reparte esa suma entre las dos.
 *   (3) Y que ALGO se haya movido de columna — si no, el PR no hizo nada y el
 *       verde no probaría nada.
 *
 * Corre el motor VIEJO —sacado de `origin/main` AL EJECUTAR, no una copia
 * versionada que envejece sola— y el NUEVO sobre los MISMOS datos de producción.
 *
 * ⚠️ NO ESCRIBE NADA.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_verif-ausencia-calculada.ts
 * ────────────────────────────────────────────────────────────────────────── */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import * as NUEVO_PLANILLA from "@/lib/asistencia/planilla";
import * as NUEVO_REPORTE from "@/lib/asistencia/reporte";
import { reglasDesdeFila as reglasNuevo, MINUTOS_TARDE_QUE_SON_AUSENCIA } from "@/lib/asistencia/config";
import { motivoPeriodoParcial } from "@/lib/asistencia/vigencia";
import { textoJustificacion } from "@/lib/asistencia/periodo";
import { hoyPanama } from "@/lib/fecha-panama";

const DIR_ANTES = path.join(process.cwd(), "src/lib/asistencia-antes");
const MODULOS = ["config.ts", "reporte.ts", "planilla.ts", "directorio.ts", "motivos.ts", "vigencia.ts"];

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
const CLAVES = ["2026-07-1", "2026-07-2", "2026-08-1"];

/** Las 18 columnas de dinero que NO pueden moverse ni un centavo. */
const INTOCABLES = [
  "rataHora", "valorMinuto", "salarioQuincenal", "extraDiurno", "extraNocturno",
  "excedente", "domingos", "feriados", "totalBruto", "seguroSocial",
  "seguroEducativo", "isr", "prestamo", "terceros", "mercancia",
  "totalDeducciones", "otrosServicios", "netoPagar",
] as const;

const m2 = (n: number) => n.toFixed(2);

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
  const horarios = horariosRaw.map((h) => ({ ...h, entrada: String(h.entrada).slice(0, 5), salida: String(h.salida).slice(0, 5) }));
  const horarioDe = new Map(horarios.map((h) => [h.empleado_codigo, h]));

  console.log(`Hoy en PANAMÁ: ${HOY} · umbral: más de ${MINUTOS_TARDE_QUE_SON_AUSENCIA} minutos tarde\n`);

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
      for (const mm of (data ?? []) as any[]) {
        manuales.set(String(mm.empleado_codigo), {
          isr: Number(mm.isr ?? 0), prestamo: Number(mm.prestamo ?? 0),
          terceros: Number(mm.terceros ?? 0), mercancia: Number(mm.mercancia ?? 0),
          otrosServicios: Number(mm.otros_servicios ?? 0),
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
      if ((v.fechaSalida && v.fechaSalida < q.desde) || (v.fechaIngreso && v.fechaIngreso > q.hasta)) fuera.add(cod);
    }
    const fichas = new Map<string, any>();
    for (const p of personasDb) {
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

    // 🔑 Los DOS motores reciben EXACTAMENTE las mismas opciones, incluidas las
    // de los PR anteriores: si no, el "antes" sería otra cosa que `origin/main`
    // corriendo hoy, y las diferencias medidas serían de otro cambio.
    const decidirAMano = new Map<string, string>();
    for (const [cod, v] of vigencias) {
      if (fuera.has(cod)) continue;
      const mo = motivoPeriodoParcial(v, q.desde, q.hasta);
      if (mo) decidirAMano.set(cod, mo);
    }
    const justificados = new Map<string, string>();
    for (const j of (just ?? []) as any[]) {
      const cod = String(j.empleado_codigo);
      const t = textoJustificacion(String(j.motivo), String(j.desde), String(j.hasta));
      justificados.set(cod, justificados.has(cod) ? `${justificados.get(cod)} · ${t}` : t);
    }

    const personas = R.armarReporte({
      marcaciones, horarios, justificaciones: (just ?? []) as any, feriados,
      desde: q.desde, hasta: q.hasta, reglas, nombres, incluirNoHabiles: true,
      diaEnCurso: HOY,
    }).filter((p: any) => !fuera.has(p.codigo));

    const porEmpresa = new Map<string, any>();
    for (const empresa of EMPRESAS) {
      const todas = P.armarPlanilla({
        personas, fichas, manuales,
        jornadaDiariaMin: (c: string) => P.jornadaDiariaMin(horarioDe.get(c) as any),
        reglas, empresa, factorBase: 1, decidirAMano, justificados,
      });
      const { lineas } = P.separarSinFicha(todas);
      porEmpresa.set(empresa, { lineas, totales: P.totalizar(lineas) });
    }
    return porEmpresa;
  }

  const problemas: string[] = [];
  let camposComparados = 0;
  let movidos = 0;
  let plataMovida = 0;

  for (const clave of CLAVES) {
    const a = await correr(clave, false);
    const b = await correr(clave, true);
    console.log(`${"═".repeat(92)}\nQUINCENA ${clave}`);
    for (const empresa of EMPRESAS) {
      const la = a.get(empresa)!, lb = b.get(empresa)!;
      const mapa = new Map(lb.lineas.map((l: any) => [l.codigo, l]));

      // ── (1) LOS TOTALES DE LA EMPRESA ────────────────────────────────────
      const ta = la.totales, tb = lb.totales;
      for (const c of INTOCABLES) {
        camposComparados += 1;
        if (Math.abs((ta as any)[c] - (tb as any)[c]) > 0.0001) {
          problemas.push(`${clave}/${empresa}: el TOTAL de ${c} se movió ${m2((ta as any)[c])} → ${m2((tb as any)[c])}`);
        }
      }
      const sumaA = ta.ausencias + ta.tardanzas;
      const sumaB = tb.ausencias + tb.tardanzas;
      camposComparados += 1;
      if (Math.abs(sumaA - sumaB) > 0.0001) {
        problemas.push(`${clave}/${empresa}: ausencias+tardanzas se movió ${m2(sumaA)} → ${m2(sumaB)}`);
      }
      console.log(`\n  ${empresa}  NETO ${m2(ta.netoPagar)} → ${m2(tb.netoPagar)}`
        + `   ausencias ${m2(ta.ausencias)}→${m2(tb.ausencias)} · tardanzas ${m2(ta.tardanzas)}→${m2(tb.tardanzas)}`
        + `   (suma ${m2(sumaA)} = ${m2(sumaB)})`);

      // ── (2) PERSONA POR PERSONA ──────────────────────────────────────────
      for (const x of la.lineas as any[]) {
        const y: any = mapa.get(x.codigo);
        if (!y) { problemas.push(`${clave}/${empresa}: ${x.etiqueta} desapareció del cuadro`); continue; }
        if (!!x.dinero !== !!y.dinero) {
          problemas.push(`${clave}/${empresa}: ${x.etiqueta} cambió de estado (dinero ${!!x.dinero} → ${!!y.dinero})`);
          continue;
        }
        if (!x.dinero) continue;
        for (const c of INTOCABLES) {
          camposComparados += 1;
          if (Math.abs(x.dinero[c] - y.dinero[c]) > 0.0001) {
            problemas.push(`${clave}/${empresa}/${x.etiqueta}: ${c} se movió ${m2(x.dinero[c])} → ${m2(y.dinero[c])}`);
          }
        }
        camposComparados += 1;
        const sa = x.dinero.ausencias + x.dinero.tardanzas;
        const sb = y.dinero.ausencias + y.dinero.tardanzas;
        if (Math.abs(sa - sb) > 0.0001) {
          problemas.push(`${clave}/${empresa}/${x.etiqueta}: ausencias+tardanzas se movió ${m2(sa)} → ${m2(sb)}`);
        }
        const cambio = Math.abs(x.dinero.ausencias - y.dinero.ausencias);
        if (cambio > 0.0001) {
          movidos += 1;
          plataMovida += cambio;
          console.log(`     ${x.codigo.padStart(3)} ${x.etiqueta.slice(0, 28).padEnd(28)}`
            + ` ausencia ${m2(x.dinero.ausencias).padStart(8)} → ${m2(y.dinero.ausencias).padStart(8)}`
            + ` · tardanza ${m2(x.dinero.tardanzas).padStart(7)} → ${m2(y.dinero.tardanzas).padStart(7)}`
            + `   (${y.horas.tardanzaGraveDias} día(s) de más de ${MINUTOS_TARDE_QUE_SON_AUSENCIA} min, ${y.horas.tardanzaGraveMin.toFixed(2)} min)`
            + `   NETO ${m2(x.dinero.netoPagar)} = ${m2(y.dinero.netoPagar)}`);
        }
      }
    }
  }

  console.log(`\n${"═".repeat(92)}`);
  console.log(`Campos de dinero comparados: ${camposComparados}`);
  console.log(`Personas con plata movida de columna: ${movidos} · total movido: $${m2(plataMovida)}`);

  // 🩸 SI NADA SE MOVIÓ, EL VERDE NO PRUEBA NADA. Un script que pasa porque el
  // cambio no hizo efecto es peor que no tenerlo.
  if (movidos === 0) problemas.push("NADIE cambió de columna: o el umbral no se aplicó, o el script no midió nada");

  if (problemas.length) {
    console.error(`\n🔴 ${problemas.length} problema(s):\n🔴 ` + problemas.join("\n🔴 "));
    process.exitCode = 1;
  } else {
    console.error(`\n🟢 ${camposComparados} campos de dinero comparados, 0 diferencias.`
      + ` El bruto, el neto y las 18 columnas intocables son IDÉNTICOS a origin/main,`
      + ` y ausencias+tardanzas da lo mismo en las 3 quincenas × 3 empresas.`);
  }
}

traerMotorViejo();
main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(borrarMotorViejo);
