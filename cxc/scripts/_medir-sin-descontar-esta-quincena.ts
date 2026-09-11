/* ─────────────────────────────────────────────────────────────────────────────
 * QUÉ CAMBIA DE NETO CUANDO EL 0 DE LA CASILLA PASA A SIGNIFICAR «NO DESCONTAR».
 *
 * SOLO LECTURA. No escribe una fila.
 *
 * Daniel (11-sep-2026): *«sí»* a poder saltarse una quincena. Migración
 * 20261115120000: `prestamo` y `terceros` pasan a NULL permitido (NULL = vacía,
 * va la cuota; 0 = no descontar; monto = ese monto) y el backfill manda todo
 * 0 a NULL.
 *
 * Este script lee la tabla CRUDA (sirve antes y después de la migración) y
 * corre los MISMOS módulos que la planilla (`leerPrestamosDeQuincena` +
 * `montoDeFicha` / `montoTercerosDeFicha` + `estadoCasilla`). Por persona del
 * cuadro dice: lo que hay en la casilla, lo que la regla VIEJA descontaba
 * (0 = vacío → la cuota) y lo que la regla NUEVA descuenta (NULL → la cuota;
 * 0 → nada; monto → ese monto), y cuánto cambia el neto. Y aparte cuenta los
 * 0 y NULL de toda la tabla, quincena por quincena.
 *
 * Uso:
 *   npx tsx scripts/_medir-sin-descontar-esta-quincena.ts [2026-09-1]
 * ─────────────────────────────────────────────────────────────────────────── */
import { supabaseServer } from "@/lib/supabase-server";
import { leerPersonas, vigenciasDeFilas } from "@/lib/asistencia/config-server";
import { codigosFueraDeRango } from "@/lib/asistencia/vigencia";
import { leerIgnorados } from "@/lib/asistencia/codigos-ignorados-server";
import { quincenaDesdeClave } from "@/lib/asistencia/planilla";
import { leerPrestamosDeQuincena } from "@/lib/asistencia/prestamos-planilla-server";
import { montoDeFicha, montoTercerosDeFicha } from "@/lib/asistencia/prestamos-planilla";
import { estadoCasilla } from "@/lib/asistencia/casilla-sin-descontar";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";

const $ = (n: number) => `$${n.toFixed(2)}`;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** La regla VIEJA: 0 = vacío → la cuota. */
const viejo = (escrito: number | null, sugerido: number) => (escrito !== null && escrito > 0 ? escrito : sugerido);
/** La regla NUEVA: NULL → la cuota · 0 → nada · monto → ese monto. */
const nuevo = (escrito: number | null, sugerido: number) => {
  const e = estadoCasilla(escrito);
  return e === "escrita" ? (escrito as number) : e === "sin-descontar" ? 0 : sugerido;
};

async function main() {
  const clave = process.argv[2] ?? "2026-09-1";
  const q = quincenaDesdeClave(clave);
  if (!q) throw new Error(`quincena inválida: ${clave}`);
  const { desde, hasta } = q;

  // ── 1. La tabla entera, cruda ─────────────────────────────────────────────
  const { data: todas, error } = await supabaseServer
    .from("asistencia_planilla_manual")
    .select("quincena, empleado_codigo, prestamo, terceros")
    .order("quincena").order("empleado_codigo");
  if (error) throw new Error(error.message);
  const filas = (todas ?? []) as { quincena: string; empleado_codigo: string; prestamo: unknown; terceros: unknown }[];
  console.log(`\nTABLA asistencia_planilla_manual · ${filas.length} filas`);
  const porQ = new Map<string, { n: number; p0: number; pNull: number; pMonto: number; t0: number; tNull: number; tMonto: number }>();
  for (const f of filas) {
    const r = porQ.get(f.quincena) ?? { n: 0, p0: 0, pNull: 0, pMonto: 0, t0: 0, tNull: 0, tMonto: 0 };
    r.n++;
    const p = num(f.prestamo), t = num(f.terceros);
    if (p === null) r.pNull++; else if (p === 0) r.p0++; else r.pMonto++;
    if (t === null) r.tNull++; else if (t === 0) r.t0++; else r.tMonto++;
    porQ.set(f.quincena, r);
  }
  for (const [k, r] of porQ) {
    console.log(`  ${k}  filas ${r.n} · préstamo: ${r.p0} en 0 · ${r.pNull} NULL · ${r.pMonto} con monto · terceros: ${r.t0} en 0 · ${r.tNull} NULL · ${r.tMonto} con monto`);
  }

  // ── 2. La quincena pedida, persona por persona ────────────────────────────
  const [personas, pres, ignorados] = await Promise.all([
    leerPersonas(), leerPrestamosDeQuincena(desde, hasta), leerIgnorados(),
  ]);
  const fuera = codigosFueraDeRango(vigenciasDeFilas(personas.filas), desde, hasta);
  for (const c of ignorados.codigos) fuera.add(c);
  const persona = new Map(personas.filas.map((p) => [String(p.empleado_codigo), p]));
  const manual = new Map(filas.filter((f) => f.quincena === clave).map((f) => [String(f.empleado_codigo), f]));

  console.log(`\nQUINCENA ${clave}  (${desde} → ${hasta}) · fichas de préstamo: ${pres.fichas.length} · en el cuadro: ${personas.filas.length - fuera.size}\n`);

  type Fila = { empresa: string; nombre: string; codigo: string; escritoP: number | null; escritoT: number | null; sugP: number; sugT: number; antes: number; despues: number };
  const out: Fila[] = [];
  const vistos = new Set<string>();
  for (const f of pres.fichas) {
    const cod = (f.codigo ?? "").trim();
    if (!cod || fuera.has(cod) || vistos.has(cod)) continue;
    const p = persona.get(cod);
    if (!p) continue;
    vistos.add(cod);
    const m = manual.get(cod);
    const escritoP = num(m?.prestamo ?? null), escritoT = num(m?.terceros ?? null);
    const sugP = montoDeFicha(f).monto, sugT = montoTercerosDeFicha(f).monto;
    const antes = viejo(escritoP, sugP) + viejo(escritoT, sugT);
    const despues = nuevo(escritoP, sugP) + nuevo(escritoT, sugT);
    if (antes === 0 && despues === 0 && escritoP === null && escritoT === null) continue;
    out.push({
      empresa: p.empresa ? (EMPRESA_KEY_TO_NAME[p.empresa] ?? p.empresa) : "(sin empresa)",
      nombre: String(p.nombre ?? f.nombre), codigo: cod, escritoP, escritoT, sugP, sugT, antes, despues,
    });
  }
  out.sort((a, b) => a.empresa.localeCompare(b.empresa, "es") || a.nombre.localeCompare(b.nombre, "es"));
  const casilla = (v: number | null) => (v === null ? "vacía" : v === 0 ? "0 (no descontar)" : $(v));
  let emp = "", cambian = 0;
  for (const r of out) {
    if (r.empresa !== emp) { emp = r.empresa; console.log(`── ${emp}`); }
    const d = r.despues - r.antes;
    if (d !== 0) cambian++;
    console.log(
      `  ${r.nombre.padEnd(30)} casilla ${casilla(r.escritoP).padEnd(16)} cuota ${$(r.sugP).padStart(8)}`
      + (r.sugT > 0 || r.escritoT !== null ? `  terceros ${casilla(r.escritoT)} / ${$(r.sugT)}` : "")
      + `  → antes ${$(r.antes).padStart(8)}  después ${$(r.despues).padStart(8)}  neto ${d === 0 ? "=" : (d > 0 ? "−" : "+") + $(Math.abs(d))}`,
    );
  }
  const totalAntes = out.reduce((a, r) => a + r.antes, 0), totalDespues = out.reduce((a, r) => a + r.despues, 0);
  console.log(`\n  ${out.length} personas con préstamo en el cuadro · descontado antes ${$(totalAntes)} → después ${$(totalDespues)} · cambian de neto: ${cambian}`);
  const ceros = out.filter((r) => r.escritoP === 0 || r.escritoT === 0);
  console.log(`  casillas con 0 escrito en esta quincena: ${ceros.length}${ceros.length ? " — " + ceros.map((r) => r.nombre).join(", ") : ""}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
