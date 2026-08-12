// ─────────────────────────────────────────────────────────────────────────────
// Diagnóstico READ-ONLY del catálogo Calvin Klein en vistana (marcaId 8).
// UNA sesión de Switch, secuencial, /cierresesion al final. Cronometrado:
// es la verificación de que el barrido entra holgado en los 800 s del cron.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-calvin-vistana.ts
// ─────────────────────────────────────────────────────────────────────────────

import { createSwitchClient, logoutAllSwitchSessions, type SwitchArticulo } from "../src/lib/switch-api/client";

const PER_PAGE = 50;
const MAX_PAGES = 400;

function num(s: string | null | undefined): number {
  const n = parseFloat(String(s ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  const t0 = Date.now();
  const client = createSwitchClient("vistana");
  const all: SwitchArticulo[] = [];
  let paginas = 0;
  for (let pagina = 1; pagina <= MAX_PAGES; pagina++) {
    const data = await client.getArticulos({ porPagina: PER_PAGE, paginaActual: pagina });
    const arr = data?.articulos ?? [];
    all.push(...arr);
    paginas = pagina;
    if (arr.length < PER_PAGE) break;
  }
  const ms = Date.now() - t0;
  console.log(`Barrido vistana: ${all.length} artículos en ${paginas} páginas — ${(ms / 1000).toFixed(1)} s`);

  // Por marcaId (conteo global, para contexto)
  const porMarca = new Map<number, number>();
  for (const a of all) porMarca.set(a.marcaId as number, (porMarca.get(a.marcaId as number) ?? 0) + 1);
  console.log("\nArtículos por marcaId:");
  [...porMarca.entries()].sort((a, b) => b[1] - a[1]).forEach(([id, n]) => console.log(`  marcaId ${id}: ${n}`));

  const ck = all.filter((a) => a.marcaId === 8);
  const conExistencia = ck.filter((a) => num(a.disponible) > 0);
  console.log(`\nmarcaId 8: ${ck.length} artículos, ${conExistencia.length} con disponible > 0`);

  // Vocabulario de descripciones (categorías)
  const desc = new Map<string, { total: number; conStock: number }>();
  for (const a of ck) {
    const d = (a.descripcion ?? "").trim();
    const e = desc.get(d) ?? { total: 0, conStock: 0 };
    e.total++;
    if (num(a.disponible) > 0) e.conStock++;
    desc.set(d, e);
  }
  console.log(`\nDescripciones distintas (${desc.size}):`);
  [...desc.entries()].sort((a, b) => b[1].total - a[1].total).forEach(([d, e]) =>
    console.log(`  ${JSON.stringify(d)} — ${e.total} (${e.conStock} con stock)`),
  );

  // Precios (dispersión, sobre los con stock — lo que vería el catálogo)
  const precios = conExistencia.map((a) => num(a.precio)).sort((a, b) => a - b);
  if (precios.length) {
    const q = (p: number) => precios[Math.min(precios.length - 1, Math.floor(p * precios.length))];
    console.log(`\nPrecios (con stock): min ${precios[0]} · p25 ${q(0.25)} · p50 ${q(0.5)} · p75 ${q(0.75)} · max ${precios[precios.length - 1]}`);
    const dist = new Map<number, number>();
    for (const p of precios) dist.set(p, (dist.get(p) ?? 0) + 1);
    console.log("  distribución:", [...dist.entries()].sort((a, b) => a[0] - b[0]).map(([p, n]) => `$${p}×${n}`).join(" "));
  }

  // Códigos: formato (guiones, largos)
  const conGuion = ck.filter((a) => (a.codigo ?? "").includes("-"));
  console.log(`\nCódigos con guión: ${conGuion.length} de ${ck.length}`);
  console.log("  ejemplos:", ck.slice(0, 8).map((a) => a.codigo).join(", "));
  if (conGuion.length) console.log("  con guión:", conGuion.slice(0, 8).map((a) => a.codigo).join(", "));

  // cantidadPorCaja (¿hay dato de bulto?)
  const cajaNo0 = ck.filter((a) => num((a as { cantidadPorCaja?: string }).cantidadPorCaja) > 0);
  console.log(`\ncantidadPorCaja > 0: ${cajaNo0.length} de ${ck.length}`);
  if (cajaNo0.length) console.log("  valores:", [...new Set(cajaNo0.map((a) => (a as { cantidadPorCaja?: string }).cantidadPorCaja))].slice(0, 10).join(", "));

  console.log(`\nTotal: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => logoutAllSwitchSessions());
