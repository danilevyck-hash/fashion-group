// SOLO LECTURA. Arma la LISTA EXPLÍCITA de ccte_id a borrar de la cartera de
// Boston: las filas que ya no pertenecen a la generación viva de la identidad.
//
// 🔴 Nunca por LIKE ni por rango: cada id se nombra, y cada uno se verifica en
// saldo 0 ANTES de entrar a la lista. Si aparece uno con saldo, el script se
// niega a escribir el SQL.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const EMP = "confecciones_boston";

/** La MISMA fórmula que `ccteIdSintetico`. Una fila es de la generación viva si
 *  su ccte_id es el que su propio (secuencial, fecha) produce hoy. */
function idVivo(secuencial: string | null, fecha: string | null): number | null {
  if (!secuencial || !fecha) return null;
  const m = /^(\d{1,4})-(\d{1,12})$/.exec(secuencial.trim());
  if (!m) return null;
  const serie = parseInt(m[1], 10), corr = parseInt(m[2], 10);
  const anio = parseInt(fecha.slice(0, 4), 10);
  if (serie < 1 || serie > 200 || corr >= 100_000) return null;
  const off = anio - 2000;
  if (off < 0 || off >= 100) return null;
  return serie * 10_000_000 + off * 100_000 + corr;
}

(async () => {
  const filas: Array<{ ccte_id: number; secuencial: string | null; fecha_creacion: string | null; saldo: number | null; synced_at: string | null }> = [];
  for (let d = 0; d < 200_000; d += 1000) {
    const { data, error } = await sb
      .from("switch_estadocuenta")
      .select("ccte_id,secuencial,fecha_creacion,saldo,synced_at")
      .eq("empresa_key", EMP)
      .order("ccte_id")
      .range(d, d + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    filas.push(...(data as typeof filas));
    if (data.length < 1000) break;
  }

  const nativas = filas.filter((f) => f.ccte_id < 10_000_000);
  const sinteticas = filas.filter((f) => f.ccte_id >= 10_000_000);
  const viejas = sinteticas.filter((f) => idVivo(f.secuencial, f.fecha_creacion) !== f.ccte_id);
  const vivas = sinteticas.filter((f) => idVivo(f.secuencial, f.fecha_creacion) === f.ccte_id);

  console.log(`filas Boston: ${filas.length}`);
  console.log(`  generación VIVA (se quedan): ${vivas.length}`);
  console.log(`  zombis nativas (sync viejo del API, 28-30 jul): ${nativas.length}`);
  console.log(`  zombis de la identidad vieja (solo el número): ${viejas.length}`);

  const aBorrar = [...nativas, ...viejas];
  const conSaldo = aBorrar.filter((f) => Number(f.saldo ?? 0) !== 0);
  if (conSaldo.length > 0) {
    console.error(`🔴 ${conSaldo.length} fila(s) a borrar tienen saldo != 0. NO se escribe el SQL.`);
    console.error(JSON.stringify(conSaldo.slice(0, 10), null, 1));
    process.exit(1);
  }
  console.log(`  ✅ las ${aBorrar.length} a borrar están TODAS en saldo $0,00`);

  const lista = (ids: number[]) => {
    const out: string[] = [];
    for (let i = 0; i < ids.length; i += 12) out.push("    " + ids.slice(i, i + 12).join(", "));
    return out.join(",\n");
  };
  const dupsQueDocumenta = new Map<string, Set<string>>();
  for (const f of vivas) {
    const s = dupsQueDocumenta.get(f.secuencial ?? "") ?? new Set<string>();
    s.add(f.fecha_creacion ?? "");
    dupsQueDocumenta.set(f.secuencial ?? "", s);
  }

  const sql = `-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: BARRER LAS FILAS MUERTAS DE LA CARTERA DE BOSTON
--
-- No cambia ni un centavo: las ${aBorrar.length} filas que borra estan TODAS en saldo
-- \$0,00 y la vista switch_estadocuenta_aging_boston ya las excluye
-- (WHERE COALESCE(s.saldo, 0) <> 0). Lo que se gana es que cualquier conteo
-- sobre switch_estadocuenta vuelva a decir la verdad: hoy la cartera de Boston
-- son ${filas.length} filas para ${vivas.length} documentos vivos.
--
-- Son DOS generaciones muertas, las dos verificadas en saldo 0 antes de armar
-- esta lista (scripts/_generar-sql-limpieza-boston.ts, solo lectura):
--
--   1. ${String(nativas.length).padStart(4)} filas del sync VIEJO por API (ccte_id nativo de Switch,
--        sincronizadas el 28-30 de julio de 2026). Duplican documentos que la
--        via del reporte web ya volvio a traer.
--   2. ${String(viejas.length).padStart(4)} filas de la identidad VIEJA (ccte_id = serie x 10^7 +
--        correlativo, sin el ano). Quedaron huerfanas cuando la identidad paso a
--        llevar el ano adentro; el reconcile ya les puso saldo 0 en la misma
--        corrida que escribio las nuevas, asi que la cartera nunca quedo ni en
--        cero ni a medias.
--
-- 🔴 LISTA EXPLICITA, NUNCA UN LIKE NI UN RANGO. Cada ccte_id se nombra. Y por
-- si acaso, el DELETE lleva ademas \`COALESCE(saldo, 0) = 0\`: si alguna de estas
-- filas tuviera plata cuando esto corra, NO se borra.
--
-- Se envuelve en una transaccion para que sea todo o nada.
--
-- La app funciona igual antes y despues: estas filas no las lee nadie.
-- Aplicar manual en Supabase Dashboard -> SQL Editor.
-- Evitar las ventanas de cron: 23:50-00:20 y 05:50-06:10 UTC.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Antes: cuantas filas hay y cuanta plata (la plata NO puede moverse) ──────
--   SELECT COUNT(*) AS filas,
--          ROUND(SUM(total)::numeric, 2) AS cartera
--   FROM switch_estadocuenta_aging_boston;
--   Esperado hoy: ${vivas.filter((f) => Number(f.saldo ?? 0) !== 0).length} documentos con saldo, cartera \$198,296.55 en 386 clientes.

-- ── 1. Las ${nativas.length} del sync viejo por API (ccte_id nativo) ─────────────────────
DELETE FROM switch_estadocuenta
WHERE empresa_key = 'confecciones_boston'
  AND COALESCE(saldo, 0) = 0
  AND ccte_id IN (
${lista(nativas.map((f) => f.ccte_id))}
  );

-- ── 2. Las ${viejas.length} de la identidad vieja (sin el ano en el ccte_id) ──────────
DELETE FROM switch_estadocuenta
WHERE empresa_key = 'confecciones_boston'
  AND COALESCE(saldo, 0) = 0
  AND ccte_id IN (
${lista(viejas.map((f) => f.ccte_id))}
  );

COMMIT;

-- ── Verificacion (correr despues) ───────────────────────────────────────────
--   -- 1. La plata NO se movio (tiene que dar exactamente lo mismo que arriba):
--   SELECT COUNT(*) AS clientes,
--          ROUND(SUM(total)::numeric, 2)      AS cartera,
--          ROUND(SUM(d0_90)::numeric, 2)      AS d0_90,
--          ROUND(SUM(d91_120)::numeric, 2)    AS d91_120,
--          ROUND(SUM(d121_plus)::numeric, 2)  AS d121_plus
--   FROM switch_estadocuenta_aging_boston;
--   Esperado: 386 | 198296.55 | 60730.75 | 16002.61 | 121563.19
--
--   -- 2. No quedan generaciones muertas: todo ccte_id de Boston lleva el ano
--   --    de su propia fecha adentro.
--   SELECT COUNT(*) FROM switch_estadocuenta
--   WHERE empresa_key = 'confecciones_boston'
--     AND (ccte_id % 10000000) / 100000 <> (EXTRACT(YEAR FROM fecha_creacion)::int - 2000);
--   Esperado: 0
`;

  const ruta = "supabase/migrations/20260826150000_boston_barrer_filas_muertas.sql";
  fs.writeFileSync(ruta, sql);
  console.log(`\nSQL → ${ruta} (${(sql.length / 1024).toFixed(1)} KB)`);
})().catch((e) => { console.error(e); process.exit(1); });
