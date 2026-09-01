/**
 * MEDICIÓN READ-ONLY CONTRA PRODUCCIÓN — el cambio de la regla de hora extra
 * (1-sep-2026): umbral 15 → 10 minutos, y la tardanza deja de restarse.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_medir-extra-bruta.ts
 *
 * No escribe NADA: solo `select`. Corre el MISMO motor dos veces —una con el
 * umbral viejo, otra con el nuevo— y reconstruye la fórmula vieja
 * (`bruto − tardeMin`) a partir de la corrida de 15, para poder comparar el
 * antes y el después sin tener que revivir el código viejo.
 */

import { createClient } from "@supabase/supabase-js";
import { armarReporte, type Marcacion } from "../src/lib/asistencia/reporte";
import { REGLAS_DEFAULT } from "../src/lib/asistencia/config";

const DESDE = process.env.DESDE ?? "2026-08-01";
const HASTA = process.env.HASTA ?? "2026-08-15";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
const db = createClient(url, key, { auth: { persistSession: false } });

const PANAMA = "-05:00";
const iDesde = new Date(Date.parse(`${DESDE}T00:00:00.000${PANAMA}`)).toISOString();
const iHasta = new Date(Date.parse(`${HASTA}T23:59:59.999${PANAMA}`)).toISOString();

async function paginado<T>(
  q: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error) throw new Error(String((error as { message?: string }).message ?? error));
    const filas = (data ?? []) as T[];
    out.push(...filas);
    if (filas.length < 1000) break;
  }
  return out;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

async function main() {
  console.log(`\n═══ Hora extra: regla vieja vs nueva · ${DESDE} → ${HASTA} ═══\n`);

  const marcaciones = await paginado<Marcacion & { id: string }>((from, to) =>
    db.from("asistencia_marcaciones")
      .select("id, empleado_codigo, empleado_nombre, ocurrio_en")
      .gte("ocurrio_en", iDesde).lte("ocurrio_en", iHasta)
      .order("ocurrio_en", { ascending: true }).order("id", { ascending: true })
      .range(from, to),
  );

  const [personasRes, horariosRes, justiRes, feriadosRes, reglasRes, vacRes] = await Promise.all([
    db.from("asistencia_personas").select("*"),
    db.from("asistencia_horarios").select("empleado_codigo, entrada, salida, almuerzo_minutos"),
    db.from("asistencia_justificaciones").select("empleado_codigo, desde, hasta, motivo, hora_desde, hora_hasta").lte("desde", HASTA).gte("hasta", DESDE),
    db.from("asistencia_feriados").select("fecha, nombre").gte("fecha", DESDE).lte("fecha", HASTA),
    db.from("asistencia_reglas").select("*").eq("id", 1).maybeSingle(),
    db.from("asistencia_vacaciones").select("*").lte("desde", HASTA).gte("hasta", DESDE),
  ]);
  for (const r of [personasRes, horariosRes, justiRes, feriadosRes]) {
    if (r.error) throw new Error(r.error.message);
  }

  console.log("── La fila de `asistencia_reglas` EN PRODUCCIÓN ──");
  console.log("   extra_minimo_min       =", reglasRes.data?.extra_minimo_min ?? "(sin fila)");
  console.log("   tolerancia_tardanza_min=", reglasRes.data?.tolerancia_tardanza_min ?? "(sin fila)");
  console.log("   default del código     =", REGLAS_DEFAULT.extraMinimoMin, "\n");

  const horarios = (horariosRes.data ?? []).map((h) => ({
    ...h, entrada: String(h.entrada).slice(0, 5), salida: String(h.salida).slice(0, 5),
  })) as never;
  const justificaciones = (justiRes.data ?? []) as never;
  const feriados = new Map((feriadosRes.data ?? []).map((f) => [String(f.fecha), String(f.nombre)]));
  const vacaciones = (vacRes.error ? [] : (vacRes.data ?? [])) as never;

  const base = {
    marcaciones, horarios, justificaciones, feriados, vacaciones,
    desde: DESDE, hasta: HASTA, incluirNoHabiles: process.env.NO_HABILES === "1",
  };
  // La tolerancia se deja EXACTAMENTE como está en producción: lo único que se
  // mueve es el umbral de la extra.
  const tol = Number(reglasRes.data?.tolerancia_tardanza_min ?? REGLAS_DEFAULT.toleranciaTardanzaMin);

  const con15 = armarReporte({ ...base, reglas: { toleranciaTardanzaMin: tol, extraMinimoMin: 15 } });
  const con10 = armarReporte({ ...base, reglas: { toleranciaTardanzaMin: tol, extraMinimoMin: 10 } });

  const ficha = new Map(
    (personasRes.data ?? []).map((p) => [String(p.empleado_codigo), p as Record<string, unknown>]),
  );

  let diasPersona = 0, viejoTot = 0, nuevoTot = 0, plataVieja = 0, plataNueva = 0;
  const porPersona: Array<{ cod: string; nombre: string; dias: number; viejo: number; nuevo: number }> = [];

  const SOLO_VIGENTES = process.env.TODOS !== "1";
  let saltados = 0;
  for (const [i, p] of con10.entries()) {
    const q = con15[i];
    if (!q || q.codigo !== p.codigo) throw new Error("las dos corridas no alinean: " + p.codigo);
    const fx = ficha.get(p.codigo);
    if (SOLO_VIGENTES) {
      const ing = fx?.fecha_ingreso ? String(fx.fecha_ingreso) : null;
      const sal = fx?.fecha_salida ? String(fx.fecha_salida) : null;
      const fuera =
        !fx || fx.activo === false || fx.servicio_profesional === true || fx.no_marca_reloj === true
        || (ing !== null && ing > HASTA) || (sal !== null && sal < DESDE);
      if (fuera) { saltados++; continue; }
    }
    let viejo = 0, nuevo = 0, dias = 0, diasCambiados = 0;
    for (const [j, d] of p.dias.entries()) {
      const e = q.dias[j];
      if (d.marcas.length === 0) continue;
      if (process.env.SOLO_HABILES === "1" && !d.habil) continue;
      dias++;
      // La fórmula VIEJA, reconstruida: mismo bruto que la corrida de 15, menos
      // el atraso del día, nunca negativa.
      const v = e.extraMin > 0 ? Math.max(0, e.extraMin - e.tardeMin) : 0;
      viejo += v; nuevo += d.extraMin;
      if (Math.abs(v - d.extraMin) > 1e-9) diasCambiados++;
    }
    diasPersona += dias; viejoTot += viejo; nuevoTot += nuevo;

    const f = ficha.get(p.codigo);
    const salario = Number(f?.salario_mensual ?? 0);
    const jornada = Number(f?.jornada_semanal ?? 40);
    const divisor = jornada === 48 ? REGLAS_DEFAULT.divisor48 : REGLAS_DEFAULT.divisor40;
    const rata = salario > 0 ? r2(salario / divisor) : 0;
    plataVieja += r2((viejo / 60) * 1.25 * rata);
    plataNueva += r2((nuevo / 60) * 1.25 * rata);

    if (diasCambiados > 0) {
      porPersona.push({
        cod: p.codigo, nombre: String(f?.nombre ?? p.nombre ?? p.codigo),
        dias: diasCambiados, viejo, nuevo,
      });
    }
  }

  console.log("── TOTALES ──");
  console.log(`   días-persona con marcas : ${diasPersona}`);
  console.log(`   minutos de extra        : ${r2(viejoTot)} → ${r2(nuevoTot)}  (+${r2(nuevoTot - viejoTot)} min = +${r2((nuevoTot - viejoTot) / 60)} h)`);
  console.log(`   plata a 1.25            : $${r2(plataVieja).toFixed(2)} → $${r2(plataNueva).toFixed(2)}  (+$${r2(plataNueva - plataVieja).toFixed(2)})`);
  console.log(`   personas afectadas      : ${porPersona.length}`);
  console.log(`   personas en la corrida  : ${con10.length} (saltadas ${saltados})\n`);

  console.log("── QUIÉNES SUBEN (ordenado por cuánto) ──");
  porPersona.sort((a, b) => (b.nuevo - b.viejo) - (a.nuevo - a.viejo));
  for (const x of porPersona) {
    console.log(`   ${x.nombre.padEnd(28)} ${String(x.dias).padStart(2)} días  ${r2(x.viejo).toFixed(1).padStart(7)} → ${r2(x.nuevo).toFixed(1).padStart(7)}  (+${r2(x.nuevo - x.viejo).toFixed(1)})`);
  }
  console.log("");
}

main().catch((e) => { console.error(e); process.exit(1); });
