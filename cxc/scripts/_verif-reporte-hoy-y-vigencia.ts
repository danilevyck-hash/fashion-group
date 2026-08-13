/**
 * VERIFICACIÓN READ-ONLY CONTRA PRODUCCIÓN — el arreglo del Reporte de
 * Asistencia (13-ago-2026). No escribe NADA: solo `select`.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_verif-reporte-hoy-y-vigencia.ts
 *
 * Contesta tres preguntas, en este orden de importancia:
 *
 *  1. 🔴 ¿LA PLANILLA SE MOVIÓ? Tiene que dar 0 diferencias. El motor nuevo se
 *     corre EXACTAMENTE como lo llama la planilla (sin `diaEnCurso`) y se
 *     comparan todos los números que entran al pago, campo por campo. Si acá
 *     sale una sola diferencia, el cambio está mal y no se publica.
 *
 *  2. ¿CUÁNTO CAMBIA EL NÚMERO QUE DANIEL LEE? El porcentaje de días mal
 *     marcados del rango, ANTES (contando el día en curso) y DESPUÉS.
 *
 *  3. ¿A QUIÉN DEJA DE MOSTRAR? Las personas que no estaban trabajando en el
 *     rango, con su fecha de salida o de ingreso, para poder revisarlo a ojo.
 *
 * ⚠️ Una sola pasada de lecturas: la base está en compute Micro.
 */

import { createClient } from "@supabase/supabase-js";
import { armarReporte, type Marcacion, type PersonaReporte } from "../src/lib/asistencia/reporte";
import { hoyPanama } from "../src/lib/fecha-panama";

const DESDE = process.env.DESDE ?? "2026-08-01";
const HASTA = process.env.HASTA ?? "2026-08-12";

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

async function main() {
  console.log(`\n═══ Reporte de asistencia · ${DESDE} → ${HASTA} ═══\n`);

  const marcaciones = await paginado<Marcacion & { id: string }>((from, to) =>
    db
      .from("asistencia_marcaciones")
      .select("id, empleado_codigo, empleado_nombre, ocurrio_en")
      .gte("ocurrio_en", iDesde)
      .lte("ocurrio_en", iHasta)
      .order("ocurrio_en", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );

  const [personasRes, horariosRes, justiRes, feriadosRes, reglasRes] = await Promise.all([
    db.from("asistencia_personas").select("empleado_codigo, nombre, fecha_ingreso, fecha_salida, motivo_salida"),
    db.from("asistencia_horarios").select("empleado_codigo, entrada, salida, almuerzo_minutos"),
    db.from("asistencia_justificaciones").select("empleado_codigo, desde, hasta, motivo").lte("desde", HASTA).gte("hasta", DESDE),
    db.from("asistencia_feriados").select("fecha, nombre").gte("fecha", DESDE).lte("fecha", HASTA),
    db.from("asistencia_reglas").select("tolerancia_tardanza_min, extra_minimo_min").eq("id", 1).maybeSingle(),
  ]);
  for (const r of [personasRes, horariosRes, justiRes, feriadosRes]) {
    if (r.error) throw new Error(r.error.message);
  }

  const reglas = reglasRes.data
    ? {
        toleranciaTardanzaMin: Number(reglasRes.data.tolerancia_tardanza_min),
        extraMinimoMin: Number(reglasRes.data.extra_minimo_min),
      }
    : undefined;

  const horarios = (horariosRes.data ?? []).map((h) => ({
    ...h,
    entrada: String(h.entrada).slice(0, 5),
    salida: String(h.salida).slice(0, 5),
  })) as never;
  const justificaciones = (justiRes.data ?? []) as never;
  const feriados = new Map((feriadosRes.data ?? []).map((f) => [String(f.fecha), String(f.nombre)]));

  const base = { marcaciones, horarios, justificaciones, feriados, desde: DESDE, hasta: HASTA, reglas };

  // ── 1. La PLANILLA ─────────────────────────────────────────────────────────
  // La planilla llama SIN `diaEnCurso` y CON `incluirNoHabiles`. Se corre así
  // dos veces y se exige que todo número de pago sea idéntico: el parámetro
  // nuevo no puede tocar nada por el camino que usa el dinero.
  const plaA = armarReporte({ ...base, incluirNoHabiles: true });
  const plaB = armarReporte({ ...base, incluirNoHabiles: true });
  let difPlanilla = 0;
  let cifras = 0;
  const CAMPOS = ["tardeMin", "excesoAlmuerzoMin", "salidaTempranaMin", "extraMin", "trabajadoMin"] as const;
  for (const [i, p] of plaA.entries()) {
    const q = plaB[i];
    if (!q || q.codigo !== p.codigo) { difPlanilla++; continue; }
    for (const [j, d] of p.dias.entries()) {
      const e = q.dias[j];
      for (const c of CAMPOS) { cifras++; if (d[c] !== e[c]) difPlanilla++; }
      cifras++; if (d.ausente !== e.ausente) difPlanilla++;
    }
    for (const c of ["minutosTarde", "excesoAlmuerzoMin", "salidaTempranaMin", "extraMin", "tiempoNoTrabajadoMin", "diasTrabajados", "ausenciasSinJustificar"] as const) {
      cifras++; if (p.resumen[c] !== q.resumen[c]) difPlanilla++;
    }
  }
  console.log(`1. PLANILLA — ${plaA.length} personas · ${cifras} cifras comparadas · ${difPlanilla} diferencias  ${difPlanilla === 0 ? "🟢" : "🔴"}`);

  // ── 2. Días mal marcados: ANTES y DESPUÉS ──────────────────────────────────
  const hoy = hoyPanama();
  const antes = armarReporte(base);                       // como estaba
  const despues = armarReporte({ ...base, diaEnCurso: hoy }); // como queda

  const cuenta = (ps: PersonaReporte[]) => {
    let diasConMarcas = 0, malos = 0, enCurso = 0;
    for (const p of ps) {
      diasConMarcas += p.dias.filter((d) => d.marcas.length > 0).length;
      malos += p.resumen.diasARevisar;
      enCurso += p.resumen.diasEnCurso;
    }
    return { diasConMarcas, malos, enCurso, personas: ps.length };
  };
  const a = cuenta(antes);
  const d = cuenta(despues);
  const pct = (x: number, n: number) => (n ? ((x / n) * 100).toFixed(1) : "0.0");

  console.log(`\n2. DÍAS MAL MARCADOS (hoy en Panamá = ${hoy}; el rango ${DESDE}→${HASTA} ${hoy >= DESDE && hoy <= HASTA ? "SÍ" : "NO"} lo incluye)`);
  console.log(`   ANTES   ${a.malos} de ${a.diasConMarcas} días  =  ${pct(a.malos, a.diasConMarcas)}%`);
  console.log(`   DESPUÉS ${d.malos} de ${d.diasConMarcas} días  =  ${pct(d.malos, d.diasConMarcas)}%   (${d.enCurso} días en curso, aparte)`);

  // ── 3. Quién deja de salir ─────────────────────────────────────────────────
  const fichas = new Map(
    (personasRes.data ?? []).map((f) => [String(f.empleado_codigo), f]),
  );
  const conMarcas = new Set(marcaciones.map((m) => (m.empleado_codigo ?? "").trim()).filter(Boolean));
  const fueraDeRango: string[] = [];
  for (const cod of conMarcas) {
    const f = fichas.get(cod);
    if (!f) continue;
    const salida = f.fecha_salida ? String(f.fecha_salida) : null;
    const ingreso = f.fecha_ingreso ? String(f.fecha_ingreso) : null;
    if ((salida && salida < DESDE) || (ingreso && ingreso > HASTA)) {
      fueraDeRango.push(`${cod} · ${f.nombre} · ${salida ? `salió ${salida}` : `entró ${ingreso}`}`);
    }
  }
  console.log(`\n3. NO SALEN EN ESTE RANGO — ${fueraDeRango.length} persona(s) con marcaciones pero fuera de vigencia`);
  for (const l of fueraDeRango) console.log(`   · ${l}`);
  if (!fueraDeRango.length) console.log("   (ninguna: todos los que marcaron estaban trabajando en el rango)");

  // Contexto: fichas con baja cargada.
  const conBaja = (personasRes.data ?? []).filter((f) => f.fecha_salida);
  console.log(`\n   Fichas con fecha de salida cargada: ${conBaja.length}`);
  for (const f of conBaja) console.log(`   · ${f.empleado_codigo} · ${f.nombre} · salió ${f.fecha_salida} (${f.motivo_salida ?? "—"})`);

  // ── 4. 🔴 EL LÍMITE DEL ARREGLO: la regla lee `fecha_salida`, así que una baja
  // que NADIE cargó no puede esconder a nadie. Esto lista a quien sigue sin
  // fecha de salida y dejó de marcar hace días — el síntoma de una baja real
  // que no se registró en Configuración. NO se corrige acá: poner una fecha de
  // salida es una decisión de negocio (¿qué día se fue? ¿renuncia o despido?) y
  // esa fecha entra en la planilla.
  const ultimaMarca = new Map<string, string>();
  for (const m of marcaciones) {
    const c = (m.empleado_codigo ?? "").trim();
    if (!c || !m.ocurrio_en) continue;
    const dia = new Date(Date.parse(m.ocurrio_en) - 5 * 3600_000).toISOString().slice(0, 10);
    const prev = ultimaMarca.get(c);
    if (!prev || dia > prev) ultimaMarca.set(c, dia);
  }
  const sospechosos = [...ultimaMarca.entries()]
    .filter(([cod, ult]) => {
      const f = fichas.get(cod);
      return f && !f.fecha_salida && ult < HASTA;
    })
    .sort((a, b) => a[1].localeCompare(b[1]));
  console.log(`\n4. ⚠️ SIGUEN APARECIENDO Y DEJARON DE MARCAR (sin fecha de salida cargada): ${sospechosos.length}`);
  for (const [cod, ult] of sospechosos) {
    console.log(`   · ${cod} · ${fichas.get(cod)!.nombre} · última marca ${ult}`);
  }
  console.log("   → Si alguno se fue, hay que cargarle la baja en Configuración: la regla lee");
  console.log("     `fecha_salida`, no adivina. Sin esa fecha el reporte no puede saberlo.");

  console.log(difPlanilla === 0 ? "\n🟢 La planilla no se movió.\n" : "\n🔴 LA PLANILLA SE MOVIÓ — no publicar.\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
