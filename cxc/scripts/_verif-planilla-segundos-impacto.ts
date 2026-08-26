/* ─────────────────────────────────────────────────────────────────────────────
 * ¿CUÁNTO CAMBIA MEDIR AL SEGUNDO? — solo lectura, contra producción.
 *
 * Corre el motor VIEJO (el de `origin/main`, que redondeaba cada marca al minuto
 * más cercano) y el NUEVO (que mide al segundo) sobre LOS MISMOS datos de
 * producción, y muestra la diferencia **persona por persona**: minutos de
 * tardanza, minutos de hora extra, y dólares.
 *
 * 🔴 ACÁ NO SE ESPERA UN CERO: medir mejor cambia números, y ESE es el punto.
 * Lo que el script prueba es otra cosa —y más fuerte—: que **ninguna regla se
 * movió**. Le da al motor NUEVO las marcas REDONDEADAS al minuto (lo que hacía
 * el viejo) y exige que dé EXACTAMENTE lo mismo, campo por campo. Si eso pasa,
 * toda la diferencia viene de la precisión del reloj y de nada más.
 *
 * ⚠️ NO ESCRIBE NADA.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_verif-planilla-segundos-impacto.ts
 * ────────────────────────────────────────────────────────────────────────── */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import * as NUEVO_PLANILLA from "@/lib/asistencia/planilla";
import { leerVacaciones } from "@/lib/asistencia/config-server";
import * as NUEVO_REPORTE from "@/lib/asistencia/reporte";
import { reglasDesdeFila as reglasNuevo } from "@/lib/asistencia/config";

/**
 * El motor VIEJO se saca de `origin/main` AL CORRER, no se guarda en el repo:
 * una copia versionada envejece sola y en dos semanas estaría comparando contra
 * algo que ya no es "lo de antes".
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
const borrarMotorViejo = () => fs.rmSync(DIR_ANTES, { recursive: true, force: true });

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(URL_, KEY, { auth: { persistSession: false } });

const PANAMA = "-05:00";
const instante = (dia: string, fin: boolean) =>
  new Date(Date.parse(`${dia}T${fin ? "23:59:59.999" : "00:00:00.000"}${PANAMA}`)).toISOString();

const QUINCENAS = ["2026-07-1", "2026-07-2", "2026-08-1"];
const EMPRESAS = ["confecciones_boston", "vistana", "fashion_wear"];

/**
 * 🔴 LA PRUEBA DE QUE LAS REGLAS NO CAMBIARON, y no es una tolerancia.
 *
 * Se le da al motor NUEVO las marcas REDONDEADAS al minuto —exactamente lo que
 * hacía el viejo— y se exige que el resultado sea IDÉNTICO al del motor viejo,
 * campo por campo. Si lo es, la única diferencia entre los dos es la precisión
 * del reloj: ni un umbral, ni una fórmula, ni un recargo se movieron.
 *
 * 🩸 Una tolerancia de "30 s por marca" NO servía, y medirlo lo demostró: en un
 * UMBRAL, 29 segundos mueven MINUTOS. Quien marca 8:10:15 pasa de 0 a 10,25 min
 * de tardanza porque la regla dice que, pasada la gracia, el atraso se cuenta
 * DESDE LAS 8:00. El salto es correcto y es de la regla vieja; lo que cambió es
 * de qué lado del umbral cae el segundo. Un tope por marca habría marcado eso
 * como "regla rota" y —peor— habría dejado pasar un error real de 1 minuto.
 */
function redondearAlMinuto(iso: string): string {
  const t = Date.parse(iso);
  const d = new Date(t);
  const seg = d.getUTCSeconds();
  const ms = d.getUTCMilliseconds();
  const base = t - seg * 1000 - ms;
  return new Date(seg >= 30 ? base + 60_000 : base).toISOString();
}

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

const money = (n: number) => `$${n.toFixed(2)}`;
const signo = (n: number) => (n > 0 ? "+" : "");

async function main() {
  const VIEJO_PLANILLA = await import("@/lib/asistencia-antes/planilla");
  const VIEJO_REPORTE = await import("@/lib/asistencia-antes/reporte");
  const { reglasDesdeFila: reglasViejo } = await import("@/lib/asistencia-antes/config");

  const { data: filaReglas } = await db.from("asistencia_reglas").select("*").eq("id", 1).maybeSingle();
  const rViejo = reglasViejo(filaReglas as Record<string, unknown> | null);
  const rNuevo = reglasNuevo(filaReglas as Record<string, unknown> | null);

  const personas = await todo<any>("asistencia_personas", (q) =>
    q.select("empleado_codigo, nombre, salario_mensual, jornada_semanal, empresa, fecha_ingreso, fecha_salida, motivo_salida"));
  const horariosRaw = await todo<any>("asistencia_horarios", (q) =>
    q.select("empleado_codigo, entrada, salida, almuerzo_minutos"));
  const horarios = horariosRaw.map((h) => ({
    ...h,
    entrada: String(h.entrada).slice(0, 5),
    salida: String(h.salida).slice(0, 5),
  }));

  // ── ¿El dato trae segundos? Si no, todo esto sería un no-op ────────────────
  const muestra = await todo<any>("asistencia_marcaciones", (q) =>
    q.select("ocurrio_en").order("ocurrio_en", { ascending: false }).limit(200));
  const conSegundos = muestra.filter((m) => new Date(m.ocurrio_en).getUTCSeconds() !== 0).length;
  console.log(`Marcaciones con segundos ≠ 00: ${conSegundos} de ${muestra.length} (últimas 200)\n`);

  let filasCambiadas = 0;
  let diasFueraDeTolerancia = 0;
  const porPersona = new Map<string, {
    etiqueta: string; empresa: string;
    tardanza: number; extra: number; trabajado: number; neto: number; dias: number;
  }>();
  let netoViejoTotal = 0;
  let netoNuevoTotal = 0;

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
    // 🔴 Las VACACIONES. Este script lee PRODUCCIÓN y arma la planilla: sin
    // ellas, un día de vacaciones vuelve a contarse como ausencia. Por la fuente
    // única de lectura, nunca con un `select` copiado.
    const { filas: vacs } = await leerVacaciones(q.desde, q.hasta);
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
          codigo: cod,
          nombre: p.nombre ?? null,
          salarioMensual: p.salario_mensual === null ? null : Number(p.salario_mensual),
          jornadaSemanal: p.jornada_semanal ?? null,
          empresa: p.empresa ?? null,
        });
      }
      const nombres = new Map<string, string>();
      for (const [cod, f] of fichas) if (f.nombre) nombres.set(cod, f.nombre);

      const args = {
        marcaciones, horarios, justificaciones: (just ?? []) as any, vacaciones: vacs, feriados,
        desde: q.desde, hasta: q.hasta, nombres, incluirNoHabiles: true,
      };
      const pViejo = VIEJO_REPORTE.armarReporte({ ...args, reglas: rViejo } as any)
        .filter((p) => !fuera.has(p.codigo));
      const pNuevo = NUEVO_REPORTE.armarReporte({ ...args, reglas: rNuevo } as any)
        .filter((p) => !fuera.has(p.codigo));

      // ── 🔴 EL CHEQUEO QUE IMPORTA: el motor NUEVO con las marcas redondeadas
      //    tiene que dar EXACTAMENTE lo mismo que el viejo con las marcas crudas.
      const pControl = NUEVO_REPORTE.armarReporte({
        ...args,
        marcaciones: marcaciones.map((m) => ({ ...m, ocurrio_en: redondearAlMinuto(m.ocurrio_en) })),
        reglas: rNuevo,
      } as any).filter((p) => !fuera.has(p.codigo));

      const diasControl = new Map<string, any>();
      for (const p of pControl) for (const d of p.dias) diasControl.set(`${p.codigo}|${d.fecha}`, d);
      for (const p of pViejo) {
        for (const d of p.dias) {
          const c = diasControl.get(`${p.codigo}|${d.fecha}`);
          if (!c) continue;
          for (const campo of ["tardeMin", "extraMin", "trabajadoMin", "excesoAlmuerzoMin", "salidaTempranaMin"] as const) {
            // Se comparan a la milésima de minuto (0,06 s): con las marcas ya
            // redondeadas los dos motores hacen la MISMA aritmética entera, y
            // lo único que puede diferir es el último bit de la división /60.
            if (Math.abs((c[campo] ?? 0) - (d[campo] ?? 0)) > 1e-9) {
              diasFueraDeTolerancia += 1;
              console.log(
                `  🔴 REGLA DISTINTA · ${clave} ${empresa} ${p.codigo} ${d.fecha} ${campo}: `
                + `viejo ${d[campo]} → nuevo-con-marcas-redondeadas ${c[campo]}`,
              );
            }
          }
        }
      }

      const horarioDe = new Map(horarios.map((h) => [h.empleado_codigo, h]));
      const lv = VIEJO_PLANILLA.armarPlanilla({
        personas: pViejo, fichas, manuales,
        jornadaDiariaMin: (c: string) => VIEJO_PLANILLA.jornadaDiariaMin(horarioDe.get(c) as any),
        reglas: rViejo, empresa,
      } as any);
      const ln = NUEVO_PLANILLA.armarPlanilla({
        personas: pNuevo, fichas, manuales,
        jornadaDiariaMin: (c: string) => NUEVO_PLANILLA.jornadaDiariaMin(horarioDe.get(c) as any),
        reglas: rNuevo, empresa,
      } as any);
      const porCodigo = new Map(ln.map((l) => [l.codigo, l]));

      netoViejoTotal += VIEJO_PLANILLA.totalizar(lv).netoPagar;
      netoNuevoTotal += NUEVO_PLANILLA.totalizar(ln).netoPagar;

      for (const a of lv) {
        const b = porCodigo.get(a.codigo);
        if (!b) continue;
        const dTardanza = b.horas.tardanzaMin - a.horas.tardanzaMin;
        const dExtra = (b.horas.extraDiurnoMin + b.horas.extraNocturnoMin + b.horas.excedenteMin)
          - (a.horas.extraDiurnoMin + a.horas.extraNocturnoMin + a.horas.excedenteMin);
        const dTrabajado = b.horas.diasTrabajados - a.horas.diasTrabajados;
        const dNeto = (b.dinero?.netoPagar ?? 0) - (a.dinero?.netoPagar ?? 0);
        if (dTardanza === 0 && dExtra === 0 && dNeto === 0) continue;
        filasCambiadas += 1;
        const k = `${a.codigo}|${empresa}`;
        const acc = porPersona.get(k) ?? {
          etiqueta: a.etiqueta, empresa, tardanza: 0, extra: 0, trabajado: 0, neto: 0, dias: 0,
        };
        acc.tardanza += dTardanza;
        acc.extra += dExtra;
        acc.trabajado += dTrabajado;
        acc.neto += dNeto;
        acc.dias += b.horas.diasTrabajados;
        porPersona.set(k, acc);
      }
    }
  }

  console.log("── IMPACTO POR PERSONA (3 quincenas: jul 1ª, jul 2ª, ago 1ª) ──");
  console.log("persona                         empresa            Δ tardanza   Δ extra    Δ pago");
  const filas = [...porPersona.values()].sort((a, b) => Math.abs(b.neto) - Math.abs(a.neto));
  for (const f of filas) {
    console.log(
      `${f.etiqueta.slice(0, 30).padEnd(31)} ${f.empresa.padEnd(19)} `
      + `${(signo(f.tardanza) + f.tardanza.toFixed(2)).padStart(9)} min `
      + `${(signo(f.extra) + f.extra.toFixed(2)).padStart(8)} min `
      + `${(signo(f.neto) + money(f.neto)).padStart(9)}`,
    );
  }

  const netoDelta = netoNuevoTotal - netoViejoTotal;
  console.log(
    `\nTOTAL de las 3 quincenas × 3 empresas: ${money(netoViejoTotal)} → ${money(netoNuevoTotal)} `
    + `(${signo(netoDelta)}${money(netoDelta)})`,
  );
  console.log(`${filas.length} personas cambian · ${filasCambiadas} líneas de quincena tocadas`);
  console.log(
    diasFueraDeTolerancia === 0
      ? "\n🟢 LAS REGLAS NO CAMBIARON: el motor nuevo con las marcas redondeadas al minuto\n"
        + "   da EXACTAMENTE lo mismo que el viejo, campo por campo. Lo único que cambió\n"
        + "   es que el reloj ya no se redondea."
      : `\n🔴 ${diasFueraDeTolerancia} campos difieren con las marcas YA redondeadas — eso NO es precisión: es una regla que se movió.`,
  );
  // ⚠️ `exitCode`, NUNCA `process.exit()`: mataría el proceso antes del
  // `finally` que borra la copia del motor viejo.
  process.exitCode = diasFueraDeTolerancia === 0 ? 0 : 1;
}

traerMotorViejo();
void main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(borrarMotorViejo);
