/**
 * CARGA HISTÓRICA del detalle de línea (24-ago-2026).
 *
 * Baja el `detalle[]` de cada factura y nota de crédito de las 6 empresas de
 * Fashion Group y lo guarda en `switch_factura_lineas`. Es lo que destraba
 * poder preguntar **qué producto le vendo a cada cliente**, que hoy no tiene
 * respuesta en ninguna tabla.
 *
 * ── CÓMO SE CORRE ──────────────────────────────────────────────────────────
 *
 *   # ver qué falta, SIN tocar Switch ni escribir nada
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_backfill-factura-lineas.ts
 *
 *   # correr una empresa
 *   ... scripts/_backfill-factura-lineas.ts --correr --empresa=active_shoes
 *
 *   # probar con pocos documentos primero
 *   ... scripts/_backfill-factura-lineas.ts --correr --empresa=joystep --limite=20
 *
 *   # todas, una detrás de otra (tarda ~1.5 h)
 *   ... scripts/_backfill-factura-lineas.ts --correr --todas
 *
 * ── 🔴 CUÁNDO NO CORRERLO ──────────────────────────────────────────────────
 *
 * Switch admite UN SOLO login por empresa (code 0006): si esto corre mientras
 * corre un cron de la MISMA empresa, se tumban el token entre sí y los dos
 * fallan. Las ventanas ocupadas están en `vercel.json`; las horas más limpias
 * para las 6 B2B son entre las 02:00 y las 04:00 UTC.
 *
 * También expulsa a Daniel del panel de Switch si él está adentro con el mismo
 * usuario — el script avisa antes de empezar.
 *
 * ── ES REANUDABLE, y por eso no hace falta que salga bien de una vez ───────
 *
 * Solo mira los documentos con `lineas_synced_at IS NULL`. Si se corta a la
 * mitad (Ctrl-C, red, sesión perdida), volver a correrlo sigue donde quedó. Un
 * documento cuyo detalle falló NO se marca, así que la corrida siguiente lo
 * reintenta.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import {
  sincronizarLineasEmpresa,
  empresasConDetalleDeLinea,
} from "@/lib/switch-api/sync-factura-lineas";
import { logoutAllSwitchSessions } from "@/lib/switch-api/client";
import type { EmpresaKey } from "@/lib/empresa-mapping";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const args = process.argv.slice(2);
const CORRER = args.includes("--correr");
const TODAS = args.includes("--todas");
const empresaArg = args.find((a) => a.startsWith("--empresa="))?.split("=")[1];
const limiteArg = args.find((a) => a.startsWith("--limite="))?.split("=")[1];
const LIMITE = limiteArg ? Number(limiteArg) : null;

function n(v: number): string {
  return v.toLocaleString("es-PA");
}

/** ¿Ya corrió la migración? Se pregunta MIDIENDO, no suponiendo: PostgREST
 *  contesta con un error cuando la columna no existe. Sin este chequeo el
 *  script revienta con un mensaje vacío y nadie sabe qué falta. */
async function migracionCorrida(): Promise<boolean> {
  const { error } = await sb
    .from("switch_facturas")
    .select("lineas_synced_at")
    .limit(1);
  return !error;
}

async function pendientesDe(empresa: EmpresaKey) {
  const cuenta = async (tipo: string, soloPendientes: boolean) => {
    let q = sb
      .from("switch_facturas")
      .select("id", { count: "exact", head: true })
      .eq("empresa_key", empresa)
      .eq("tipo_comprobante", tipo);
    if (soloPendientes) q = q.is("lineas_synced_at", null);
    const { count, error } = await q;
    if (error) throw new Error(`${empresa}/${tipo}: ${error.message}`);
    return count ?? 0;
  };
  const [fa, ncs, faP, ncP] = await Promise.all([
    cuenta("Factura", false),
    cuenta("Nota de Crédito", false),
    cuenta("Factura", true),
    cuenta("Nota de Crédito", true),
  ]);
  return { total: fa + ncs, pendientes: faP + ncP, fa, nc: ncs };
}

async function estado() {
  console.log("\n  empresa              documentos   pendientes   ya bajados");
  console.log("  " + "─".repeat(60));
  let tp = 0;
  let tt = 0;
  for (const e of empresasConDetalleDeLinea()) {
    const p = await pendientesDe(e);
    tp += p.pendientes;
    tt += p.total;
    const listo = p.total - p.pendientes;
    console.log(
      `  ${e.padEnd(20)} ${n(p.total).padStart(10)} ${n(p.pendientes).padStart(12)} ${n(listo).padStart(12)}`,
    );
  }
  console.log("  " + "─".repeat(60));
  console.log(`  ${"TOTAL".padEnd(20)} ${n(tt).padStart(10)} ${n(tp).padStart(12)} ${n(tt - tp).padStart(12)}`);

  const { count: lineas } = await sb
    .from("switch_factura_lineas")
    .select("id", { count: "exact", head: true });
  console.log(`\n  líneas guardadas hasta ahora: ${n(lineas ?? 0)}`);
  if (tp > 0) {
    // ~3 documentos en paralelo, ~250 ms cada uno → ~12 documentos/segundo en
    // el mejor caso; medido contra producción da más cerca de 2,5/s.
    const min = Math.round(tp / 2.5 / 60);
    console.log(`  quedan ${n(tp)} documentos por bajar — estimado ~${min} min`);
  }
}

async function main() {
  console.log("═".repeat(64));
  console.log("  DETALLE DE LÍNEA — carga histórica");
  console.log("═".repeat(64));

  if (!(await migracionCorrida())) {
    console.log(
      "\n  ⚠️  Todavía no corrió la migración.\n\n" +
        "      A la tabla `switch_facturas` le falta la columna `lineas_synced_at`,\n" +
        "      que es la marca de «a este documento ya le bajé el detalle».\n\n" +
        "      Corré esto en el editor SQL de Supabase:\n" +
        "        supabase/migrations/20260824140000_switch_factura_lineas.sql\n\n" +
        "      Para copiarlo al portapapeles:\n" +
        "        cat supabase/migrations/20260824140000_switch_factura_lineas.sql | pbcopy\n",
    );
    return;
  }

  await estado();

  if (!CORRER) {
    console.log(
      "\n  Esto fue solo el estado: NO se tocó Switch ni se escribió nada.\n" +
        "  Para bajar de verdad, agregá --correr y --empresa=<key> (o --todas).\n",
    );
    return;
  }

  const empresas: EmpresaKey[] = TODAS
    ? empresasConDetalleDeLinea()
    : empresaArg
      ? [empresaArg as EmpresaKey]
      : [];

  if (empresas.length === 0) {
    console.log("\n  ⚠️  Falta --empresa=<key> o --todas. No se hizo nada.\n");
    return;
  }
  const validas = empresasConDetalleDeLinea();
  for (const e of empresas) {
    if (!validas.includes(e)) {
      console.log(`\n  ⚠️  "${e}" no está en la lista de empresas con detalle de línea.`);
      console.log(`      Son: ${validas.join(", ")}\n`);
      return;
    }
  }

  console.log(
    "\n  ⚠️  Switch admite UN login por empresa. Si estás adentro del panel con\n" +
      "      el mismo usuario, esto te va a sacar. Y si corre un cron de la misma\n" +
      "      empresa al mismo tiempo, los dos fallan.\n",
  );

  try {
    for (const empresa of empresas) {
      const t0 = Date.now();
      console.log(`\n  ── ${empresa} ${"─".repeat(Math.max(0, 40 - empresa.length))}`);
      const r = await sincronizarLineasEmpresa(empresa, {
        limite: LIMITE,
        triggeredBy: "backfill",
      });
      const seg = Math.round((Date.now() - t0) / 1000);
      if (!r.ok) {
        console.log(`  🔴 falló: ${r.error}`);
        console.log(`     (lo bajado hasta acá quedó guardado — se puede reanudar)`);
        continue;
      }
      console.log(
        `  ✅ ${n(r.documentosBajados)} documentos · ${n(r.lineasEscritas)} líneas · ${seg}s`,
      );
      if (r.documentosFallados > 0) {
        console.log(
          `     ⚠️  ${n(r.documentosFallados)} documentos no los entregó Switch — ` +
            `quedaron SIN marcar, la próxima corrida los reintenta`,
        );
      }
      if (r.documentosSinLineas > 0) {
        console.log(`     ${n(r.documentosSinLineas)} documentos vinieron sin líneas`);
      }
    }
  } finally {
    await logoutAllSwitchSessions();
  }

  console.log("\n" + "═".repeat(64));
  console.log("  ESTADO DESPUÉS");
  await estado();
  console.log("");
}

main();
