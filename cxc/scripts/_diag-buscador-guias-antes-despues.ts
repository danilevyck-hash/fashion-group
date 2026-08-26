/**
 * READ-ONLY — ¿cuántas guías encontraba el buscador VIEJO y cuántas el NUEVO?
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-buscador-guias-antes-despues.ts
 *
 * 🩸 El filtro de `/guias` corre EN MEMORIA sobre lo que devuelve `/api/guias`.
 * Acá se leen los mismos datos y se aplican los DOS predicados sobre el MISMO
 * conjunto, que es la única forma de comparar sin dos builds:
 *
 *   · VIEJO — número, GT-###, transportista, N° del transportista por línea,
 *     facturas y `guia_items.cliente` (el texto tecleado). Comparación literal
 *     en minúsculas, tal como estaba en `GuiasList` hasta el 26-ago-2026.
 *   · NUEVO — `coincideGuiaConBusqueda`: los mismos campos MÁS el nombre del
 *     cliente ATADO y su código `D-XXX`, todo sobre la forma normalizada.
 *
 * Dos lecturas paginadas. No escribe nada.
 */
import { supabaseServer } from "../src/lib/supabase-server";
import { leerTodoPaginado } from "../src/lib/supabase-paginado";
import { nombreParaMostrar } from "../src/lib/clientes/nombre-display";
import { numerosTranspDeLaGuia } from "../src/lib/guias/modo-despacho";
import { coincideGuiaConBusqueda } from "../src/lib/guias/buscar-guia";

interface Item { cliente: string | null; cliente_codigo: string | null; facturas: string | null; numero_guia_transp: string | null }
interface Fila { id: string; numero: number; deleted: boolean; numero_guia_transp: string | null; guia_items: Item[] | null }

/** El filtro EXACTO que tenía la lista hasta el 26-ago-2026. */
function coincideViejo(g: Fila & { transportista?: string | null }, consulta: string): boolean {
  if (!consulta) return true;
  const q = consulta.toLowerCase();
  return (
    String(g.numero).includes(q) ||
    `gt-${String(g.numero).padStart(3, "0")}`.includes(q) ||
    (g.transportista || "").toLowerCase().includes(q) ||
    numerosTranspDeLaGuia(g).some((n) => n.toLowerCase().includes(q)) ||
    (g.guia_items || []).some(
      (item) =>
        (item.facturas || "").toLowerCase().includes(q) ||
        (item.cliente || "").toLowerCase().includes(q),
    )
  );
}

const CONSULTAS = [
  "Sporting Shoes N4",
  "Sporting Shoes N 4",
  "D-142",
  "D-25",
  "City Mall Paso Canoa",
  "zapateria que no existe",
];

async function main() {
  const guias = await leerTodoPaginado<Fila>(
    "guia_transporte",
    (pedirCount, from, to) =>
      supabaseServer
        .from("guia_transporte")
        .select(
          "id, numero, deleted, numero_guia_transp, guia_items(cliente, cliente_codigo, facturas, numero_guia_transp)",
          pedirCount ? { count: "exact" } : {},
        )
        .eq("deleted", false)
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
  const nombres = new Map<string, string>();
  for (const c of master) {
    const cod = (c.codigo ?? "").trim().toUpperCase();
    const n = nombreParaMostrar(cod, c.nombre);
    if (cod && n) nombres.set(cod, n);
  }

  console.log(`Guías vivas: ${guias.length}\n`);
  console.log("consulta                       VIEJO   NUEVO   gana");
  for (const q of CONSULTAS) {
    const viejo = guias.filter((g) => coincideViejo(g, q));
    const nuevo = guias.filter((g) => coincideGuiaConBusqueda(g, q, nombres));
    const soloNuevo = nuevo.filter((g) => !viejo.some((v) => v.id === g.id));
    const perdidas = viejo.filter((g) => !nuevo.some((n) => n.id === g.id));
    console.log(
      `${q.padEnd(30)} ${String(viejo.length).padStart(5)}   ${String(nuevo.length).padStart(5)}   +${soloNuevo.length}` +
        (perdidas.length ? `   🔴 PIERDE ${perdidas.length}` : ""),
    );
    if (soloNuevo.length && soloNuevo.length <= 25) {
      console.log(`      nuevas: ${soloNuevo.map((g) => `GT-${g.numero}`).join(", ")}`);
    }
  }
  console.log(
    "\n🔴 La columna «gana» son las guías que ANTES no se podían encontrar tecleando\n" +
      "   lo que la pantalla muestra. «PIERDE» tiene que ser SIEMPRE 0: el texto que\n" +
      "   escribió bodega sigue encontrando igual que siempre.",
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
