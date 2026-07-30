/**
 * ¿DÓNDE se van los 8 minutos del cron `tommy-catalogo`?
 *
 * El cron mide 395-485 s contra un techo de función de 800 s. Antes de proponer
 * cualquier optimización hay que saber qué fase se los come. Este script mide
 * las CUATRO fases del motor `syncCatalogo` por separado, sin escribir nada:
 *
 *   A. login en Switch (una vez)
 *   B. /apiarticulos/lista paginado de 50 → el universo (656 artículos)
 *   C. /apiarticulos/stock — UNA LLAMADA POR ARTÍCULO. La sospecha principal:
 *      es el mismo patrón que tenía Boston (4.912 llamadas → 54 min).
 *   D. el UPDATE a Supabase por producto
 *
 * De C y D se mide una MUESTRA y se extrapola, en vez de correr las ~490
 * llamadas completas: alcanza para dimensionar y no quema la sesión única de
 * fashion_shoes por 7 minutos.
 *
 * 🔴 SESIÓN ÚNICA DE SWITCH. `fashion_shoes` admite UN login: un segundo mata
 * al primero (code 0006). Antes de correr esto:
 *   - verificar que no haya una fila `running` de fashion_shoes en
 *     switch_sync_log;
 *   - no correrlo cerca de 12:40 / 17:40 UTC (los dos slots de este cron) ni de
 *     los otros de fashion_shoes.
 * Al terminar SIEMPRE cierra sesión (/cierresesion), igual que el route.
 *
 * SOLO LECTURA de Switch. La fase D mide un update de ida y vuelta contra
 * Supabase escribiendo en cada fila EL MISMO VALOR que ya tenía (leído en el
 * momento), así que no cambia un solo dato.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_medir-tommy-catalogo.ts
 */

import { createSwitchClient, logoutAllSwitchSessions } from "../src/lib/switch-api/client";
import { isTommyArticulo } from "../src/lib/switch-api/sync-catalogo-tommy";
import { tommyServer } from "../src/lib/tommy-supabase-server";

const EMPRESA = "fashion_shoes";
const PER_PAGE = 50;
const MUESTRA_STOCK = Number(process.env.MUESTRA_STOCK ?? 40);
const MUESTRA_UPDATE = Number(process.env.MUESTRA_UPDATE ?? 12);

const ms = () => Number(process.hrtime.bigint() / 1_000_000n);

function stats(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return {
    n: s.length,
    p50: q(0.5),
    p95: q(0.95),
    max: s[s.length - 1],
    media: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(1),
  };
}

const fmt = (x: number) => `${(x / 1000).toFixed(1)} s`;

async function main() {
  const client = createSwitchClient(EMPRESA);

  // ── A. login ───────────────────────────────────────────────────────────────
  // El primer call fuerza el login; se mide aparte pidiendo una página mínima.
  const tLogin = ms();
  await client.getArticulos({ porPagina: 1, paginaActual: 1 });
  const login = ms() - tLogin;

  // ── B. /lista paginado ─────────────────────────────────────────────────────
  const paginas: number[] = [];
  const arts = [];
  const tLista = ms();
  for (let p = 1; p <= 80; p++) {
    const t = ms();
    const data = await client.getArticulos({ porPagina: PER_PAGE, paginaActual: p });
    paginas.push(ms() - t);
    const arr = data?.articulos ?? [];
    arts.push(...arr);
    if (arr.length < PER_PAGE) break;
  }
  const lista = ms() - tLista;

  const tommy = arts.filter(isTommyArticulo);
  const num = (s: string | null | undefined) => {
    const n = parseFloat(String(s ?? "").replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  // ── cuántos /stock haría el cron de verdad ────────────────────────────────
  // stockSet = { productos ACTIVOS en la tabla } ∪ { disponible >= 1 }
  const { data: prods, error: prodErr } = await tommyServer
    .from("tommy_products")
    .select("id, sku, active, stock, price");
  if (prodErr) throw new Error(`leer tommy_products: ${prodErr.message}`);
  const activos = new Set((prods ?? []).filter((p) => p.active).map((p) => String(p.sku)));
  const stockSet = tommy.filter((a) => activos.has(String(a.codigo)) || num(a.disponible) >= 1);

  // ── C. /stock, muestra ─────────────────────────────────────────────────────
  const paso = Math.max(1, Math.floor(stockSet.length / MUESTRA_STOCK));
  const muestra = stockSet.filter((_, i) => i % paso === 0).slice(0, MUESTRA_STOCK);
  const stockMs: number[] = [];
  for (const a of muestra) {
    const t = ms();
    await client.getStock(a.id);
    stockMs.push(ms() - t);
  }
  const st = stats(stockMs);

  // ── D. UPDATE a Supabase, muestra (escribe el MISMO valor que ya estaba) ───
  const filas = (prods ?? []).filter((p) => p.active).slice(0, MUESTRA_UPDATE);
  const updMs: number[] = [];
  for (const p of filas) {
    const t = ms();
    const { error } = await tommyServer
      .from("tommy_products")
      .update({ stock: p.stock, price: p.price }) // idénticos a los actuales
      .eq("id", p.id);
    if (error) throw new Error(`update de prueba: ${error.message}`);
    updMs.push(ms() - t);
  }
  const up = stats(updMs);

  // ── Cuentas ────────────────────────────────────────────────────────────────
  const stockTotal = st.media * stockSet.length;
  const updTotal = up.media * (prods ?? []).length;
  const total = login + lista + stockTotal + updTotal;

  console.log(`
┌─ Universo ─────────────────────────────────────────────────────────────────
│ /lista devolvió ............. ${arts.length} artículos (${paginas.length} páginas de ${PER_PAGE})
│ de esos, Tommy (marcaId 3) .. ${tommy.length}
│ productos en tommy_products . ${(prods ?? []).length} (${activos.size} activos)
│ → llamadas /stock del cron .. ${stockSet.length}
└────────────────────────────────────────────────────────────────────────────

┌─ Dónde se va el tiempo ────────────────────────────────────────────────────
│ A. login ..................... ${fmt(login)}
│ B. /lista (${String(paginas.length).padStart(2)} páginas) ......... ${fmt(lista)}   (${(lista / paginas.length).toFixed(0)} ms/página)
│ C. /stock × ${String(stockSet.length).padStart(3)} ............... ${fmt(stockTotal)}   (${st.media} ms/llamada · p50 ${st.p50} · p95 ${st.p95} · máx ${st.max}, n=${st.n})
│ D. update × ${String((prods ?? []).length).padStart(3)} .............. ${fmt(updTotal)}   (${up.media} ms/update · p50 ${up.p50} · p95 ${up.p95}, n=${up.n})
│ ${"─".repeat(74)}
│ TOTAL estimado .............. ${fmt(total)}
│   C es el ${((stockTotal / total) * 100).toFixed(0)}% del total. D es el ${((updTotal / total) * 100).toFixed(0)}%.
└────────────────────────────────────────────────────────────────────────────`);

  console.log(JSON.stringify({
    universo: { lista: arts.length, tommy: tommy.length, productos: (prods ?? []).length, activos: activos.size, stockCalls: stockSet.length },
    fases: { loginMs: login, listaMs: lista, stockMs: st, updateMs: up },
    extrapolado: { stockTotalMs: Math.round(stockTotal), updateTotalMs: Math.round(updTotal), totalMs: Math.round(total) },
  }, null, 2));
}

main()
  .catch((e) => { console.error("FALLÓ:", e?.message ?? e); process.exitCode = 1; })
  .finally(async () => { await logoutAllSwitchSessions(); });
