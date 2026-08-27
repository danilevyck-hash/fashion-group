/* ─────────────────────────────────────────────────────────────────────────────
 * ¿MOVER LOS $15 DE MARTHA DE «PRÉSTAMO» A «MERCANCÍA» LE CAMBIA EL PAGO?
 *
 * SOLO LECTURA. No escribe una fila.
 *
 * 🔴 NO SE RAZONA: SE EJECUTA. El argumento «las dos columnas están en la misma
 * suma, así que el neto no se mueve» es correcto y no alcanza — este repo ya
 * pagó dos veces el precio de dar por buena una cuenta que nadie corrió. Acá se
 * llama a `calcularDinero`, la MISMA función que paga, con los montos manuales
 * de ANTES y los de DESPUÉS, y se comparan LOS 20 CAMPOS de dinero uno por uno.
 *
 * Se corre sobre TODA la quincena, no solo sobre Martha: lo que hay que probar
 * es que a las OTRAS 11 personas tampoco les cambia nada.
 *
 * Uso:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_verif-martha-mercancia-no-mueve-nada.ts
 * ─────────────────────────────────────────────────────────────────────────── */
import { createClient } from "@supabase/supabase-js";
import { REGLAS_DEFAULT } from "../src/lib/asistencia/config";
import {
  calcularDinero,
  normalizarManuales,
  type DineroLinea,
  type HorasPersona,
  type ManualesLinea,
} from "../src/lib/asistencia/planilla";

/** El código de MARTHA ASUCENA CHAVARRIA Z. y el monto que se mueve. */
const CODIGO_MARTHA = "43";
const MONTO = 15;
const QUINCENA = "2026-08-1";

/** Horas de ejemplo: da igual cuáles sean, se usan IGUALES en los dos lados. */
const HORAS: HorasPersona = {
  extraDiurnoMin: 120,
  extraNocturnoMin: 30,
  excedenteMin: 60,
  domingoMin: 0,
  feriadoMin: 0,
  ausenciaMin: 240,
  ausenciaJustificadaDias: 0,
  ausenciaDias: 0,
  ausenciaPorTardanzaMin: 0,
  vacacionesYaPagadasMin: 0,
  vacacionesYaPagadasDias: 0,
  tardanzaMin: 25,
  tardanzaGraveMin: 0,
  tardanzaGraveDias: 0,
  sabadoMin: 0,
  extraNoAprobadaMin: 0,
  diasTrabajados: 11,
} as unknown as HorasPersona;

function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  const db = createClient(url, key, { auth: { persistSession: false } });

  return db
    .from("asistencia_planilla_manual")
    .select("empleado_codigo, isr, prestamo, terceros, mercancia, otros_servicios")
    .eq("quincena", QUINCENA)
    .then(({ data, error }) => {
      if (error) throw new Error(error.message);
      const filas = data ?? [];
      if (filas.length === 0) throw new Error("la quincena no tiene montos manuales: no hay nada que verificar");

      let distintos = 0;
      let esperados = 0;
      let campos = 0;
      let marthaVista = false;

      for (const f of filas) {
        const cod = String(f.empleado_codigo);
        const antes: ManualesLinea = normalizarManuales({
          isr: Number(f.isr ?? 0),
          prestamo: Number(f.prestamo ?? 0),
          terceros: Number(f.terceros ?? 0),
          mercancia: Number(f.mercancia ?? 0),
          otrosServicios: Number(f.otros_servicios ?? 0),
        });

        // 🔴 SOLO a Martha se le mueven los $15; a las demás, el «después» es
        // idéntico al «antes». Es lo que prueba que el cambio está acotado.
        const despues: ManualesLinea =
          cod === CODIGO_MARTHA
            ? { ...antes, prestamo: antes.prestamo - MONTO, mercancia: antes.mercancia + MONTO }
            : antes;

        if (cod === CODIGO_MARTHA) {
          marthaVista = true;
          if (antes.prestamo !== MONTO) {
            throw new Error(
              `Martha (${CODIGO_MARTHA}) tiene prestamo=${antes.prestamo}, se esperaba ${MONTO}. NO se corre nada.`,
            );
          }
          console.log(`  Martha ${CODIGO_MARTHA}: prestamo ${antes.prestamo} → ${despues.prestamo} · mercancia ${antes.mercancia} → ${despues.mercancia}`);
        }

        const a = calcularDinero(400, 48, HORAS, antes, REGLAS_DEFAULT);
        const d = calcularDinero(400, 48, HORAS, despues, REGLAS_DEFAULT);
        if (!a || !d) throw new Error(`no se pudo calcular el pago de ${cod}`);

        for (const k of Object.keys(a) as (keyof DineroLinea)[]) {
          campos += 1;
          if (a[k] === d[k]) continue;

          // 🔑 LAS DOS COLUMNAS QUE SE MUEVEN A PROPÓSITO, y SOLO en la fila de
          // Martha. Cualquier otro campo que cambie —o el mismo campo en otra
          // persona— es exactamente lo que este script existe para cazar.
          const esElMovimientoPedido =
            cod === CODIGO_MARTHA && (k === "prestamo" || k === "mercancia");
          if (esElMovimientoPedido) {
            esperados += 1;
            console.log(`  ✅ (a propósito) ${cod} · ${String(k)}: ${a[k]} → ${d[k]}`);
            continue;
          }

          distintos += 1;
          console.log(`  🔴 ${cod} · ${String(k)}: ${a[k]} → ${d[k]}`);
        }

        // 🔴 Y LO QUE DE VERDAD DECIDE UN PAGO, dicho aparte y por su nombre:
        // el total de deducciones y el neto no se pueden mover ni un centavo.
        for (const k of ["totalDeducciones", "netoPagar", "totalBruto"] as const) {
          if (a[k] !== d[k]) {
            distintos += 1;
            console.log(`  🔴🔴 ${cod} · ${k} SE MOVIÓ: ${a[k]} → ${d[k]}`);
          }
        }
      }

      if (!marthaVista) throw new Error(`el código ${CODIGO_MARTHA} no está en la quincena ${QUINCENA}`);
      if (esperados !== 2) {
        throw new Error(
          `se esperaban EXACTAMENTE 2 cambios a propósito (prestamo y mercancia de Martha) y hubo ${esperados}`,
        );
      }

      console.log(`\n  ${filas.length} personas · ${campos} campos de dinero comparados`);
      console.log(`  ${esperados} cambios a propósito (las dos casillas de Martha) · ${distintos} cambios NO pedidos`);
      if (distintos === 0) {
        console.log("  🟢 EL PAGO NO SE MUEVE: ni el neto, ni el total de deducciones, ni un centavo, en NINGUNA de las 12.");
      } else {
        console.log("  🔴 ALGO MÁS SE MOVIÓ. No se corre el UPDATE.");
        process.exitCode = 1;
      }
    });
}

void main();
