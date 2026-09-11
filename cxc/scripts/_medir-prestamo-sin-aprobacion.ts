/* ─────────────────────────────────────────────────────────────────────────────
 * QUÉ CAMBIA DE NETO CUANDO EL DESCUENTO DE PRÉSTAMO DEJA DE ESPERAR APROBACIÓN.
 *
 * SOLO LECTURA. No escribe una fila.
 *
 * Daniel, 11-sep-2026: *«quita lo de aprobación a préstamos, no es necesario»*.
 * Antes: la cuota entraba a la casilla «Préstamo» cuando alguien la aprobaba.
 * Después: entra sola (`min(cuota, saldo)`, o lo ya descontado), salvo que la
 * casilla ya tenga un monto escrito a mano.
 *
 * Este script corre los MISMOS módulos que la planilla (`leerPrestamosDeQuincena`
 * + `montoDeFicha` / `montoTercerosDeFicha` + `leerManuales`) y dice, por
 * persona: lo que HOY dice la casilla, lo que dirá DESPUÉS y cuánto cambia el
 * neto. Y aparte, quién debe y NO está en el cuadro (salió o no cobra aquí).
 *
 * Uso:
 *   npx tsx scripts/_medir-prestamo-sin-aprobacion.ts [2026-09-1]
 * ─────────────────────────────────────────────────────────────────────────── */
import { supabaseServer } from "@/lib/supabase-server";
import { leerPersonas, vigenciasDeFilas } from "@/lib/asistencia/config-server";
import { codigosFueraDeRango } from "@/lib/asistencia/vigencia";
import { leerIgnorados } from "@/lib/asistencia/codigos-ignorados-server";
import { quincenaDesdeClave } from "@/lib/asistencia/planilla";
import { leerManuales } from "@/lib/asistencia/planilla-server";
import { leerPrestamosDeQuincena } from "@/lib/asistencia/prestamos-planilla-server";
import { montoDeFicha, montoTercerosDeFicha } from "@/lib/asistencia/prestamos-planilla";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";

const $ = (n: number) => `$${n.toFixed(2)}`;

async function main() {
  const clave = process.argv[2] ?? "2026-09-1";
  const q = quincenaDesdeClave(clave);
  if (!q) throw new Error(`quincena inválida: ${clave}`);
  const { desde, hasta } = q;

  const [personas, manuales, pres, ignorados] = await Promise.all([
    leerPersonas(),
    leerManuales(clave),
    leerPrestamosDeQuincena(desde, hasta),
    leerIgnorados(),
  ]);
  const fuera = codigosFueraDeRango(vigenciasDeFilas(personas.filas), desde, hasta);
  for (const c of ignorados.codigos) fuera.add(c);

  const persona = new Map(personas.filas.map((p) => [String(p.empleado_codigo), p]));

  // Lo que hoy está aprobado, para poder decir qué parte de esto ya se descontaba.
  const { data: aprobadas } = await supabaseServer
    .from("asistencia_prestamo_aprobado")
    .select("empleado_codigo, aprobado, monto_visto")
    .eq("quincena", clave);
  const aprobado = new Set((aprobadas ?? []).filter((a) => a.aprobado === true).map((a) => String(a.empleado_codigo)));

  console.log(`\nQUINCENA ${clave}  (${desde} → ${hasta})`);
  console.log(`  fichas de préstamo: ${pres.fichas.length} · en el cuadro: ${personas.filas.length - fuera.size} · aprobaciones vivas: ${aprobado.size}\n`);

  type Fila = {
    empresa: string; nombre: string; codigo: string;
    hoyP: number; despuesP: number; hoyT: number; despuesT: number; origen: string; cuota: number; saldo: number;
  };
  const filas: Fila[] = [];
  const salieron: { nombre: string; codigo: string; saldo: number; empresa: string }[] = [];

  for (const f of pres.fichas) {
    const cod = (f.codigo ?? "").trim();
    if (!cod) continue;
    const p = persona.get(cod);
    const nombre = String(p?.nombre ?? f.nombre);
    const empresa = p?.empresa ? (EMPRESA_KEY_TO_NAME[p.empresa] ?? p.empresa) : "(sin empresa)";
    if (fuera.has(cod)) {
      if (f.saldo > 0.004) salieron.push({ nombre, codigo: cod, saldo: f.saldo, empresa });
      continue;
    }
    if (!p) continue;
    const m = manuales.porCodigo.get(cod);
    const hoyP = m?.prestamo ?? 0;
    const hoyT = m?.terceros ?? 0;
    const sP = montoDeFicha(f);
    const sT = montoTercerosDeFicha(f);
    const despuesP = hoyP > 0 ? hoyP : sP.monto;
    const despuesT = hoyT > 0 ? hoyT : sT.monto;
    if (hoyP === 0 && hoyT === 0 && sP.monto === 0 && sT.monto === 0) continue;
    filas.push({ empresa, nombre, codigo: cod, hoyP, despuesP, hoyT, despuesT, origen: sP.origen, cuota: f.cuota, saldo: f.saldoPrestamo });
  }

  filas.sort((a, b) => a.empresa.localeCompare(b.empresa, "es") || a.nombre.localeCompare(b.nombre, "es"));
  let totalHoy = 0, totalDespues = 0;
  let empresaActual = "";
  for (const r of filas) {
    if (r.empresa !== empresaActual) { empresaActual = r.empresa; console.log(`── ${empresaActual}`); }
    const hoy = r.hoyP + r.hoyT, despues = r.despuesP + r.despuesT;
    totalHoy += hoy; totalDespues += despues;
    const nota = [
      r.origen === "descontado" ? "ya descontado en Préstamos" : "",
      r.cuota > r.saldo && r.saldo > 0 ? `cuota ${$(r.cuota)} > saldo ${$(r.saldo)}: se descuenta el saldo` : "",
      aprobado.has(r.codigo) ? "estaba aprobado" : "",
      r.hoyP > 0 && r.hoyP !== r.despuesP ? "casilla a mano" : "",
    ].filter(Boolean).join(" · ");
    console.log(
      `  ${r.nombre.padEnd(30)} hoy ${$(hoy).padStart(9)}  → después ${$(despues).padStart(9)}  neto ${(hoy - despues === 0 ? "=" : `−${$(despues - hoy)}`).padStart(9)}`
      + (nota ? `   (${nota})` : ""),
    );
  }
  console.log(`\n  TOTAL descontado hoy ${$(totalHoy)} → después ${$(totalDespues)} · el neto del cuadro baja ${$(totalDespues - totalHoy)} en ${filas.filter((r) => r.hoyP + r.hoyT !== r.despuesP + r.despuesT).length} personas\n`);

  if (salieron.length) {
    console.log("── Deben y NO están en el cuadro (salieron o no cobran aquí): no se les descuenta");
    for (const s of salieron) console.log(`  ${s.nombre.padEnd(30)} ${s.empresa.padEnd(22)} debe ${$(s.saldo)}`);
    console.log();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
