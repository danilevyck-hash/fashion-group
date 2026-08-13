/**
 * Diagnóstico READ-ONLY: el gasto de Vista General según el MAYOR (lo de hoy)
 * contra EGRESOS VARIOS (lo que pidió Daniel).
 *
 * No escribe nada. Corre los MISMOS módulos que usa la app —`leerMayorMes` y
 * `leerEgresosMes`— así que lo que imprime es lo que la pantalla va a mostrar.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_diag-gasto-mayor-vs-egresos.ts
 */

import { leerMayorMes } from "@/lib/mayor/leer";
import { gastoMostrable, centAUsd } from "@/lib/mayor/gastos";
import { leerEgresosMes } from "@/lib/egresos/leer";
import { ALL_EMPRESA_KEYS, EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";

const MESES = process.env.MESES?.split(",") ?? [
  "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08",
];

const usd = (c: number) => (c / 100).toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
  console.log("empresa                mes      | MAYOR                      | EGRESOS VARIOS");
  console.log("".padEnd(100, "-"));

  // Último mes con movimientos por empresa (sale de la misma lectura).
  const ultimos = new Map<string, string | null>();
  const automatica = new Map<string, boolean>();

  for (const mes of MESES) {
    const [mayor, egr] = await Promise.all([
      leerMayorMes(mes).catch((e) => { console.error("mayor", mes, e.message); return null; }),
      leerEgresosMes(mes).catch((e) => { console.error("egresos", mes, e.message); return null; }),
    ]);
    for (const key of ALL_EMPRESA_KEYS) {
      const m = mayor?.empresas.find((x) => x.empresaKey === key);
      const e = egr?.empresas.find((x) => x.empresaKey === key);
      if (e) {
        ultimos.set(key, e.ultimoMesConMovimientos);
        automatica.set(key, e.descargaAutomatica);
      }
      const gm = m ? gastoMostrable(m.resumen) : null;
      const mayorTxt = !m
        ? "no instalado"
        : gm!.usable
          ? `$${usd(gm!.totalCent ?? 0)}`.padStart(14) + "  (cerrado)"
          : `— ${gm!.motivo}`;
      const egrTxt = !e
        ? "no instalado"
        : e.resumen.estado === "con_movimientos"
          ? `$${usd(e.resumen.totalGastoCent)}`.padStart(14) +
            `  gasto de $${usd(e.resumen.totalSalidaCent)} que salió · ${e.resumen.renglones} renglones`
          : `— ${e.resumen.estado}`;
      // Solo imprimir cuando alguna de las dos tiene algo que decir distinto de vacío
      const interesante = (m && gm!.usable) || (e && e.resumen.estado === "con_movimientos");
      if (interesante) {
        console.log(`${key.padEnd(22)}${mes}  | ${mayorTxt.padEnd(26)} | ${egrTxt}`);
      }
    }
  }

  console.log("\n── Hasta qué mes llega cada fuente ──");
  const mayorUlt = new Map<string, string | null>();
  const ult = await leerMayorMes(MESES[MESES.length - 1]).catch(() => null);
  for (const m of ult?.empresas ?? []) mayorUlt.set(m.empresaKey, m.ultimoMesCerrado);
  for (const key of ALL_EMPRESA_KEYS) {
    console.log(
      `${(EMPRESA_KEY_TO_NAME[key] ?? key).padEnd(24)} mayor: ${String(mayorUlt.get(key) ?? "—").padEnd(10)}` +
      ` egresos: ${String(ultimos.get(key) ?? "—").padEnd(10)} automatica: ${automatica.get(key)}`,
    );
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
