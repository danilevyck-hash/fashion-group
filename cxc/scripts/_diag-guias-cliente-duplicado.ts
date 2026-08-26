/**
 * READ-ONLY — ¿cuántas líneas de guía tienen el texto escrito DISTINTO del
 * nombre del cliente ATADO (el que dibuja el chip verde)?
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-guias-cliente-duplicado.ts
 *
 * 🩸 POR QUÉ EXISTE. El acordeón de `/guias` dibujaba el nombre DOS veces —el
 * texto escrito a mano y el chip del cliente atado— y la hipótesis razonable
 * era que los dos sirvieran para avisar de un desacuerdo. Este script lo mide
 * ANTES de podar: si hubiera líneas atadas a OTRO cliente, mostrar los dos
 * tendría sentido.
 *
 * Medido el 26-ago-2026 contra producción: **423 líneas atadas · 197 coinciden
 * · 226 difieren, y ninguna de las 226 es otro cliente** — son variantes del
 * mismo nombre (163), el alias de display de D-108 (27), tipeos y espacios
 * (31), y 5 de un código que Switch reusó (D-200, ver abajo).
 *
 * ⚠️ El nombre del cliente atado se calcula con `nombreParaMostrar`, la MISMA
 * función que alimenta el chip: comparar contra `clientes_master.nombre` crudo
 * marcaría como "distintas" las 27 líneas del alias de D-108.
 *
 * Dos lecturas paginadas y un COUNT. Nada más.
 */
import { supabaseServer } from "../src/lib/supabase-server";
import { leerTodoPaginado } from "../src/lib/supabase-paginado";
import { nombreParaMostrar } from "../src/lib/clientes/nombre-display";

/** Sin acentos, sin mayúsculas, sin puntuación ni espacios de más. */
const N = (s: string | null | undefined): string =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Además sin la coletilla jurídica. Es lo que separa "el mismo nombre escrito
 * distinto" de "otro cliente": `Super Centro La Competencia` contra
 * `Super Centro La Competencia S.A.` es lo primero.
 *
 * ⚠️ NO se tocan los DÍGITOS: `Outlet Duty Free N2` y `N3` son tiendas
 * DISTINTAS, y una normalización que se los coma las vuelve el mismo nombre.
 */
const SIN_SA = (s: string) => N(s).replace(/\bS\s?A\b/g, "").replace(/\s+/g, " ").trim();

interface Item {
  id: string;
  guia_id: string;
  cliente: string | null;
  cliente_codigo: string | null;
}

async function main() {
  const items = await leerTodoPaginado<Item>(
    "guia_items atados",
    (pedirCount, from, to) =>
      supabaseServer
        .from("guia_items")
        .select("id, guia_id, cliente, cliente_codigo", pedirCount ? { count: "exact" } : {})
        .not("cliente_codigo", "is", null)
        .order("id", { ascending: true })
        .range(from, to),
  );

  const master = await leerTodoPaginado<{ codigo: string | null; nombre: string | null }>(
    "clientes_master",
    (pedirCount, from, to) =>
      supabaseServer
        .from("clientes_master")
        .select("codigo, nombre", pedirCount ? { count: "exact" } : {})
        .order("codigo", { ascending: true })
        .range(from, to),
  );

  const nombrePorCodigo = new Map<string, string>();
  for (const c of master) {
    const cod = (c.codigo ?? "").trim().toUpperCase();
    if (!cod) continue;
    const n = nombreParaMostrar(cod, c.nombre);
    if (n) nombrePorCodigo.set(cod, n);
  }

  let iguales = 0;
  let variantes = 0;
  let sinNombre = 0;
  const guiasDistintas = new Set<string>();
  /** Los que ni siquiera son una variante del mismo nombre. */
  const ajenos: string[] = [];

  for (const it of items) {
    const cod = (it.cliente_codigo ?? "").trim().toUpperCase();
    const oficial = nombrePorCodigo.get(cod);
    if (!oficial) {
      sinNombre++;
      continue;
    }
    if (N(it.cliente) === N(oficial)) {
      iguales++;
      continue;
    }
    guiasDistintas.add(it.guia_id);
    const a = SIN_SA(it.cliente ?? "");
    const b = SIN_SA(oficial);
    if (a === b || a.includes(b) || b.includes(a)) variantes++;
    else ajenos.push(`escrito: "${it.cliente}"  |  atado: "${oficial}" (${cod})`);
  }

  const distintos = variantes + ajenos.length;

  console.log(`Líneas de guía CON cliente atado: ${items.length}`);
  console.log(`  coinciden (texto == nombre atado): ${iguales}`);
  console.log(`  DISTINTOS:                        ${distintos}  (en ${guiasDistintas.size} guías)`);
  console.log(`  código sin nombre en el maestro:  ${sinNombre}`);
  console.log(`\n  de los DISTINTOS, variantes del mismo nombre (uno contiene al otro,`);
  console.log(`  o solo cambia el "S.A." / los espacios): ${variantes}`);
  console.log(`  ni siquiera una variante:                ${ajenos.length}`);

  const pares = new Map<string, number>();
  for (const a of ajenos) pares.set(a, (pares.get(a) ?? 0) + 1);
  console.log("\nPares que no son una variante, con su frecuencia:");
  for (const [k, v] of [...pares.entries()].sort((x, y) => y[1] - x[1])) {
    console.log(`  ${String(v).padStart(3)}x  ${k}`);
  }

  const { count } = await supabaseServer.from("guia_items").select("id", { count: "exact", head: true });
  console.log(`\nTotal de líneas de guía en la base: ${count}`);
  console.log(
    "\n⚠️ Al 26-ago-2026 los únicos pares que NO son el mismo cliente son las 5 de\n" +
      "   D-200 («City Mall» escrito, «El Machetazo-Calidonia» atado): GT-124, GT-136\n" +
      "   y GT-183. Es un código que el sync de Switch reusó; se corrige tocando el\n" +
      "   chip en /guias (van a D-25 y D-24), NO escondiendo el desacuerdo.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
