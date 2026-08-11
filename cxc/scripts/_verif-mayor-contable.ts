/**
 * Prueba de aceptación de la bajada del MAYOR CONTABLE contra Switch.
 *
 * Corre la MISMA función que usa el cron (`fetchMayorAsientos`), no una segunda
 * implementación: si acá pasa y en producción falla, es que probamos otra cosa.
 *
 * Compara byte a byte (SHA-256) contra el archivo que Daniel bajó a mano del
 * panel, y de paso corre el parser y las derivaciones del módulo sobre lo que
 * bajó, para que el número que se reporta salga del mismo camino que la app.
 *
 * ⚠️ El login web usa `changesession="SI"`: **TOMA la sesión y expulsa a quien
 * esté en el panel de esa empresa**. UNA sola empresa a la vez, nunca en
 * paralelo, `cerrarSesionWeb` al terminar, y fuera de las ventanas de cron.
 *
 * Uso:
 *   ENVFILE=<ruta/.env> EMPRESA=vistana DESDE=2026-01-01 HASTA=2026-12-31 \
 *     REFERENCIA=<csv de Daniel> OUT=<carpeta> \
 *     npx tsx scripts/_verif-mayor-contable.ts
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { config as cargarEnv } from "dotenv";
import { loginSwitchWeb, fetchMayorAsientos, cerrarSesionWeb } from "../src/lib/switch-api/web-client";
import { parsearMayorCsv } from "../src/lib/mayor/parser";
import { resumirMes, centAUsd } from "../src/lib/mayor/gastos";

if (process.env.ENVFILE) cargarEnv({ path: process.env.ENVFILE });

const EMPRESA = process.env.EMPRESA ?? "vistana";
const DESDE = process.env.DESDE ?? "2026-01-01";
const HASTA = process.env.HASTA ?? "2026-12-31";
const OUT = process.env.OUT ?? "/tmp/mayor";
const REFERENCIA = process.env.REFERENCIA ?? "";
const MES = process.env.MES ?? "2026-01";

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

async function main() {
  console.log(`Empresa ${EMPRESA} · rango ${DESDE} → ${HASTA}`);
  console.log("Login web… ⚠️ TOMA la sesión de Switch de esta empresa.");
  const s = await loginSwitchWeb(EMPRESA);
  console.log("Login OK.");

  let csv: string;
  try {
    const r = await fetchMayorAsientos(s, DESDE, HASTA);
    csv = r.csv;
    console.log(
      `Bajado por ${r.rutaUsada} · ${r.rondas} ronda(s) · asientos declarados: ${r.asientosDeclarados}`,
    );
  } finally {
    await cerrarSesionWeb(s);
    console.log("Sesión cerrada.");
  }

  mkdirSync(OUT, { recursive: true });
  const ruta = join(OUT, `${EMPRESA}__mayor__${DESDE}__${HASTA}.csv`);
  writeFileSync(ruta, csv, "utf8");
  const lineas = csv.split(/\r?\n/).filter((l) => l.trim()).length;
  console.log(`💾 ${ruta} · ${Buffer.byteLength(csv, "utf8")} bytes · ${lineas} líneas`);
  console.log(`   SHA-256 HTTP : ${sha256(csv)}`);

  // ── ¿Es idéntico al de Daniel? ─────────────────────────────────────────────
  if (REFERENCIA && existsSync(REFERENCIA)) {
    const ref = readFileSync(REFERENCIA, "utf8");
    const hRef = sha256(ref);
    console.log(`   SHA-256 MANO : ${hRef}`);
    if (sha256(csv) === hRef) {
      console.log("   ✅ IDÉNTICOS byte por byte.");
    } else {
      console.log("   🔴 DIFIEREN. Primeras diferencias por línea:");
      const a = csv.split(/\r?\n/);
      const b = ref.split(/\r?\n/);
      console.log(`      líneas HTTP ${a.length} · líneas MANO ${b.length}`);
      let mostradas = 0;
      for (let i = 0; i < Math.max(a.length, b.length) && mostradas < 10; i++) {
        if (a[i] !== b[i]) {
          console.log(`      L${i + 1} HTTP: ${JSON.stringify(a[i] ?? null)}`);
          console.log(`      L${i + 1} MANO: ${JSON.stringify(b[i] ?? null)}`);
          mostradas++;
        }
      }
    }
  } else if (REFERENCIA) {
    console.log(`   ⚠️ no encontré el archivo de referencia: ${REFERENCIA}`);
  }

  // ── El número de control, por el camino de la app ──────────────────────────
  const parsed = parsearMayorCsv(csv);
  console.log(`\nParser: ${parsed.lineas.length} líneas · ${parsed.errores.length} errores`);
  for (const e of parsed.errores.slice(0, 5)) console.log("   ⚠️", e);
  const delMes = parsed.lineas.filter((l) => l.mes === MES);
  const res = resumirMes(MES, delMes, [{ desde: DESDE, hasta: HASTA }]);
  console.log(
    `Gastos ${MES}: operación ${centAUsd(res.totalOperacionCent).toFixed(2)} · ISR ${centAUsd(res.totalIsrCent).toFixed(2)} · TOTAL ${centAUsd(res.totalCent).toFixed(2)} (estado ${res.estado})`,
  );
  for (const c of [...res.cuentas, ...res.isr]) {
    console.log(`   ${c.corta}  ${centAUsd(c.netoCent).toFixed(2)}  ${c.nombre}`);
  }
}

main().catch((e) => {
  console.error("FALLÓ:", e instanceof Error ? e.message : e);
  process.exit(1);
});
