/** Curva de concurrencia de /apiarticulos/stock (fase dominante del catálogo
 *  Tommy). Lotes DISJUNTOS + control de deriva. SOLO LECTURA. */
import { createSwitchClient, logoutAllSwitchSessions } from "../src/lib/switch-api/client";
import { isTommyArticulo } from "../src/lib/switch-api/sync-catalogo-tommy";
import { barrerPaginasArticulos } from "../src/lib/switch-api/sync-catalogo";
const ms = () => Number(process.hrtime.bigint() / 1_000_000n);
async function main() {
  const c = createSwitchClient("fashion_shoes");
  const arts = (await barrerPaginasArticulos(
    async (p) => (await c.getArticulos({ porPagina: 50, paginaActual: p }))?.articulos ?? [],
    { empresaKey: "fashion_shoes" },
  )).filter(isTommyArticulo);
  const set = arts.filter((a) => parseFloat(String(a.disponible ?? "0")) >= 1);
  console.log(`\n${arts.length} artículos Tommy · ${set.length} con disponible>=1 (el set real de /stock ronda 478)\n`);
  // N = llamadas por nivel. 20 alcanza para ver la forma de la curva; para
  // DECIDIR un número se corre con N=40.
  const N = Number(process.env.N ?? 20);
  const niveles = (process.env.NIVELES ?? "4,6,8,12").split(",").map(Number);
  // 🩸 REPETIR EL PROBE TAL CUAL MIDE LA CACHÉ, no la concurrencia: la segunda
  // corrida vuelve a pedir EXACTAMENTE los mismos artículos, ya calientes. Para
  // que una segunda vuelta siga siendo fría se cambia de CARRIL con FASE: el
  // pool sale de otra clase de resto, o sea de artículos que nadie tocó.
  const FASE = Number(process.env.FASE ?? 0);
  const paso = Math.max(1, Math.floor(arts.length / (N * (niveles.length + 2))));
  const pool = arts.filter((_, i) => i % paso === FASE % paso);
  const lote = (i: number) => pool.slice(i * N, (i + 1) * N);
  async function correr(conc: number, l: typeof arts) {
    let err = 0, vac = 0; const cola = [...l]; const t = ms();
    await Promise.all(Array.from({ length: conc }, async () => {
      for (;;) { const a = cola.shift(); if (!a) return;
        try { const r = await c.getStock(a.id); if ((r?.stock?.length ?? 0) === 0) vac++; } catch { err++; } }
    }));
    return { ms: ms() - t, err, vac, n: l.length };
  }
  const base = await correr(1, lote(0));
  const b = base.ms / base.n;
  console.log(`   serial ×1 .... ${b.toFixed(0)} ms/llamada   errores=${base.err} vacías=${base.vac}`);
  for (let i = 0; i < niveles.length; i++) {
    const r = await correr(niveles[i], lote(i + 1));
    const e = r.ms / r.n;
    console.log(`   paralelo ×${String(niveles[i]).padStart(2)} .. ${e.toFixed(0)} ms/llamada  → ${(b / e).toFixed(1)}×  errores=${r.err} vacías=${r.vac}   [478 llamadas ≈ ${(e * 478 / 1000).toFixed(0)} s]`);
  }
  const ctrl = await correr(1, lote(niveles.length + 1));
  console.log(`   serial (control final) ... ${(ctrl.ms / ctrl.n).toFixed(0)} ms → deriva ${(((ctrl.ms / ctrl.n) / b - 1) * 100).toFixed(0)}%`);
  console.log(`   [478 llamadas en serie ≈ ${(b * 478 / 1000).toFixed(0)} s]\n`);
}
main().catch((e) => { console.error("FALLÓ:", e?.message ?? e); process.exitCode = 1; })
  .finally(async () => { await logoutAllSwitchSessions(); });
