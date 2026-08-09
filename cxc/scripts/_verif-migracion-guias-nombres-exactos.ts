/**
 * READ-ONLY. Simula la migración `20260810120000_guias_atar_nombres_exactos.sql`
 * contra producción y verifica las DOS cosas que la hacen segura.
 *
 * 🔴 NO ESCRIBE NADA. Ni un UPDATE. El backfill lo corre Daniel a mano en el
 *    SQL Editor; esto solo mide si los números siguen dando antes de que lo haga.
 *
 * ⚠️ Las reglas NO se escriben acá a mano: se LEEN del archivo .sql, así que
 *    esto mide la migración que va a correr y no una segunda lista.
 *
 * Lo que verifica, además de los conteos:
 *   1. que cada regla siga siendo una PAREJA SEGURA contra el nombre real
 *      (mismos dígitos, mismas letras salvo la coletilla jurídica), y
 *   2. 🔴 que para el texto escrito haya **UN SOLO** cliente D-XXX vivo que
 *      cumpla eso — mirando nombre Y razón social. Dos candidatos y la regla
 *      dejaría de ser inequívoca (`clientes_master.nombre_normalized` NO es
 *      único: "City Moda Chorrera" es D-26 y D-30 a la vez).
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-migracion-guias-nombres-exactos.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { supabaseServer } from "../src/lib/supabase-server";
import { leerTodoPaginado } from "../src/lib/supabase-paginado";
import {
  leerReglasNombresExactos,
  normalizarComoSql,
  MIGRACION_NOMBRES_EXACTOS,
} from "../src/lib/guias/reglas-nombres-exactos";
import { digitosDe, esParejaSegura } from "../src/lib/clientes/nombre-normalizado";

const ESPERADO = { vivas: 441, atadasAntes: 320, aAtar: 35, sinAtarDespues: 86 };

interface Item { id: string; guia_id: string; cliente: string | null; cliente_codigo: string | null; deleted: boolean | null }
interface Guia { id: string; deleted: boolean | null }
interface Cli { codigo: string | null; nombre: string | null; razon_social: string | null }

let fallas = 0;
const chequear = (ok: boolean, msg: string) => {
  console.log(`${ok ? "✅" : "❌"} ${msg}`);
  if (!ok) fallas++;
};

async function main() {
  const sql = readFileSync(join(process.cwd(), MIGRACION_NOMBRES_EXACTOS), "utf8");
  const reglas = leerReglasNombresExactos(sql);
  console.log(`reglas leídas del SQL: ${reglas.length}\n`);

  const items = await leerTodoPaginado<Item>("guia_items", (c, from, to) =>
    supabaseServer.from("guia_items")
      .select("id, guia_id, cliente, cliente_codigo, deleted", c ? { count: "exact" } : {})
      .order("id", { ascending: true }).range(from, to));
  const guias = await leerTodoPaginado<Guia>("guia_transporte", (c, from, to) =>
    supabaseServer.from("guia_transporte")
      .select("id, deleted", c ? { count: "exact" } : {})
      .order("id", { ascending: true }).range(from, to));
  const clientes = await leerTodoPaginado<Cli>("clientes_master", (c, from, to) =>
    supabaseServer.from("clientes_master")
      .select("codigo, nombre, razon_social", c ? { count: "exact" } : {})
      .eq("deleted", false).order("id", { ascending: true }).range(from, to));

  const vivasGuia = new Set(guias.filter(g => g.deleted !== true).map(g => g.id));
  const vivas = items.filter(i => i.deleted !== true && vivasGuia.has(i.guia_id));
  const sinAtar = vivas.filter(i => !i.cliente_codigo);
  const dxxx = clientes.filter(c => /^D-\d+$/i.test((c.codigo ?? "").trim()));
  const porCodigo = new Map(dxxx.map(c => [(c.codigo ?? "").trim().toUpperCase(), c]));

  chequear(vivas.length === ESPERADO.vivas, `líneas vivas ${vivas.length} (esperado ${ESPERADO.vivas})`);
  chequear(vivas.length - sinAtar.length === ESPERADO.atadasAntes,
    `atadas antes ${vivas.length - sinAtar.length} (esperado ${ESPERADO.atadasAntes})`);

  console.log("\n── regla por regla ─────────────────────────────────────");
  let total = 0;
  for (const r of reglas) {
    const n = sinAtar.filter(i => normalizarComoSql(i.cliente) === r.cliente).length;
    total += n;
    const destino = porCodigo.get(r.codigo.toUpperCase());
    const seguraNombre = destino ? esParejaSegura(r.cliente, destino.nombre) : false;
    const seguraRazon = destino ? esParejaSegura(r.cliente, destino.razon_social) : false;
    // 🔴 Uno y solo un cliente vivo puede cumplir la regla.
    const candidatos = dxxx.filter(
      c => esParejaSegura(r.cliente, c.nombre) || esParejaSegura(r.cliente, c.razon_social),
    );
    const unico = candidatos.length === 1 && (candidatos[0].codigo ?? "").trim().toUpperCase() === r.codigo.toUpperCase();
    const digitosOk = destino
      ? digitosDe(r.cliente) === digitosDe(destino.nombre) || digitosDe(r.cliente) === digitosDe(destino.razon_social)
      : false;

    console.log(
      `${r.codigo.padEnd(7)} ${r.cliente.padEnd(30)} ${String(n).padStart(3)} líneas  ` +
      `${destino ? "vivo" : "NO EXISTE"}  ` +
      `${seguraNombre || seguraRazon ? "exacto" : "NO-EXACTO"}  ` +
      `${unico ? "único" : `AMBIGUO(${candidatos.map(c => c.codigo).join(",")})`}  ` +
      `${digitosOk ? "dígitos=" : "DÍGITOS≠"}`,
    );
    if (!destino) fallas++;
    if (!(seguraNombre || seguraRazon)) fallas++;
    if (!unico) fallas++;
    if (!digitosOk) fallas++;
  }

  console.log("");
  chequear(total === ESPERADO.aAtar, `total a atar ${total} (esperado ${ESPERADO.aAtar})`);
  chequear(sinAtar.length - total === ESPERADO.sinAtarDespues,
    `quedan sin atar ${sinAtar.length - total} (esperado ${ESPERADO.sinAtarDespues})`);
  chequear(
    reglas.every(r => !sinAtar.some(i => normalizarComoSql(i.cliente) === r.cliente && i.cliente_codigo)),
    "ninguna regla pisa una línea ya atada",
  );

  console.log(
    fallas === 0
      ? "\n🟢 TODO CUADRA — la migración se puede correr."
      : `\n🔴 ${fallas} problema(s). NO la corras hasta entender por qué.`,
  );
  process.exit(fallas === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
