// Verificación read-only: el orden del catálogo ANTES y DESPUÉS del desempate por código.
// Reproduce el .sort() REAL de CatalogoVendedorPage sobre los productos de producción.
import "./_react-global-para-scripts";
import { createClient } from "@supabase/supabase-js";
import { compararCodigos } from "../src/lib/catalogos/orden-codigo";


const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type P = { sku: string; name: string; category: string | null; gender: string | null; price: number | null };

function ordenar(ps: P[], theme: Theme, catOrder: Record<string, number>, conCodigo: boolean) {
  return [...ps].sort((a, b) => {
    const ca = catOrder[a.category || ""] ?? 9, cb = catOrder[b.category || ""] ?? 9;
    if (ca !== cb) return ca - cb;
    const ga = theme!.genero.groupOrder(a.gender), gb = theme!.genero.groupOrder(b.gender);
    if (ga !== gb) return ga - gb;
    return conCodigo ? (a.name.localeCompare(b.name) || compararCodigos(a.sku, b.sku)) : a.name.localeCompare(b.name);
  });
}

function posiciones(ps: P[], pref: string) {
  return ps.map((p, i) => ({ i, sku: p.sku })).filter(x => x.sku.startsWith(pref));
}

type Theme = ReturnType<typeof import("../src/lib/catalogo/marcas-ui").getMarcaTheme>;

(async () => {
  const { getMarcaTheme } = await import("../src/lib/catalogo/marcas-ui");
  for (const [marca, tabla] of [["calvin", "calvin_products"], ["tommy", "tommy_products"]] as const) {
    const theme = getMarcaTheme(marca)!;
    const catOrder = Object.fromEntries(theme.filtros.categoryOptions.map((o: { value: string }, i: number) => [o.value, i]));
    const { data, error } = await db.from(tabla).select("sku,name,category,gender,price,active,oculto_manual").limit(2000);
    if (error) { console.log(marca, "ERROR", error.message); continue; }
    const ps = (data as P[]);
    const antes = ordenar(ps, theme, catOrder, false);
    const despues = ordenar(ps, theme, catOrder, true);
    console.log(`\n════ ${marca.toUpperCase()} — ${ps.length} productos, ${new Set(ps.map(p=>p.name)).size} nombres distintos`);

    if (marca === "calvin") {
      const a = posiciones(antes, "KCMEENA"), d = posiciones(despues, "KCMEENA");
      console.log("  ANTES  :", a.map(x => `#${x.i} ${x.sku}`).join(" · "));
      console.log("  DESPUÉS:", d.map(x => `#${x.i} ${x.sku}`).join(" · "));
      const juntos = (xs: {i:number}[]) => xs.every((x, k) => k === 0 || x.i === xs[k-1].i + 1);
      console.log(`  ¿juntos? antes=${juntos(a) ? "SÍ" : "NO"}  después=${juntos(d) ? "SÍ" : "NO"}`);
      // vecinos de los KCMEENA antes
      console.log("  vecinos ANTES:", a.map(x => `${antes[x.i-1]?.sku ?? "—"} << ${x.sku} >> ${antes[x.i+1]?.sku ?? "—"}`).join("\n                 "));
    }

    // Familias: prefijo de 7 caracteres. ¿Cuántas quedan partidas?
    const partidas = (arr: P[]) => {
      const fam = new Map<string, number[]>();
      arr.forEach((p, i) => { const k = p.sku.slice(0, 7).toUpperCase(); (fam.get(k) ?? fam.set(k, []).get(k)!).push(i); });
      let rotas = 0, total = 0;
      for (const [, idxs] of fam) { if (idxs.length < 2) continue; total++; if (idxs.some((v, k) => k > 0 && v !== idxs[k-1] + 1)) rotas++; }
      return { rotas, total };
    };
    const pa = partidas(antes), pd = partidas(despues);
    console.log(`  familias (prefijo 7) partidas: ANTES ${pa.rotas}/${pa.total} · DESPUÉS ${pd.rotas}/${pd.total}`);

    // ¿cuántos productos cambiaron de posición?
    const posAntes = new Map(antes.map((p, i) => [p.sku, i]));
    const movidos = despues.filter((p, i) => posAntes.get(p.sku) !== i).length;
    console.log(`  productos que cambiaron de lugar: ${movidos} de ${ps.length}`);

    // los bloques (categoría+género) tienen que ser IDÉNTICOS: el desempate no saca a nadie de su sección
    const bloque = (p: P) => `${p.category}|${theme.genero.groupKey(p.gender)}`;
    const seqA = antes.map(bloque).join(">"), seqD = despues.map(bloque).join(">");
    console.log(`  secuencia de secciones idéntica: ${seqA === seqD ? "SÍ ✅" : "NO 🔴"}`);
  }
})();

