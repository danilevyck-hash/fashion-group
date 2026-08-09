/**
 * READ-ONLY. ¿Cuántas líneas de guía se pueden atar a un cliente D-XXX?
 *
 * 🔴 NO ESCRIBE NADA. Solo SELECT. El backfill vive en una migración SQL que
 *    corre Daniel a mano — nunca en un script.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-guias-atar-cliente.ts
 */
import { supabaseServer } from "../src/lib/supabase-server";
import { leerTodoPaginado } from "../src/lib/supabase-paginado";
import { esCodigoDeCliente } from "../src/lib/clientes/mundos";

/** Normalizador canónico — idéntico a clientes_master.nombre_normalized. */
const N2 = (s: string | null | undefined): string =>
  (s ?? "").trim().toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();

async function main() {
  const master = await leerTodoPaginado<{
    codigo: string | null;
    nombre: string | null;
    nombre_normalized: string;
    deleted: boolean;
  }>("clientes_master", (c, from, to) =>
    supabaseServer
      .from("clientes_master")
      .select("codigo, nombre, nombre_normalized, deleted", c ? { count: "exact" } : {})
      .order("id", { ascending: true })
      .range(from, to)
  );

  // Solo D-XXX y vivos. `codigo IS NOT NULL` (lo que hizo el backfill de junio)
  // deja entrar códigos numéricos pelados de Boston/Multifashion.
  //
  // 🩸 Y un nombre que apunta a DOS códigos D-XXX vivos NO es inequívoco: hay
  // que sacarlo del mapa, no quedarse con el último que pasó. Medido: "CITY
  // MODA CHORRERA" es D-26 y D-30 al mismo tiempo. Un `Map.set` a secas elige
  // uno en silencio — que es exactamente lo que no se puede hacer.
  const codigosPorNombre = new Map<string, Set<string>>();
  for (const m of master) {
    if (m.deleted || !esCodigoDeCliente(m.codigo)) continue;
    const cod = (m.codigo ?? "").trim();
    if (!codigosPorNombre.has(m.nombre_normalized)) codigosPorNombre.set(m.nombre_normalized, new Set());
    codigosPorNombre.get(m.nombre_normalized)!.add(cod);
  }
  const codigoPorNombre = new Map<string, string>();
  const ambiguos = new Map<string, string[]>();
  for (const [nombre, cods] of codigosPorNombre) {
    if (cods.size === 1) codigoPorNombre.set(nombre, [...cods][0]);
    else ambiguos.set(nombre, [...cods]);
  }
  const nombrePorCodigo = new Map<string, string>();
  for (const m of master) {
    if (m.deleted || !m.codigo) continue;
    nombrePorCodigo.set(m.codigo.trim(), m.nombre ?? m.nombre_normalized);
  }

  const items = await leerTodoPaginado<{
    id: string;
    guia_id: string;
    cliente: string | null;
    cliente_codigo: string | null;
    deleted: boolean | null;
  }>("guia_items", (c, from, to) =>
    supabaseServer
      .from("guia_items")
      .select("id, guia_id, cliente, cliente_codigo, deleted", c ? { count: "exact" } : {})
      .order("id", { ascending: true })
      .range(from, to)
  );

  const guias = await leerTodoPaginado<{ id: string; numero: number; estado: string | null; deleted: boolean }>(
    "guia_transporte",
    (c, from, to) =>
      supabaseServer
        .from("guia_transporte")
        .select("id, numero, estado, deleted", c ? { count: "exact" } : {})
        .order("id", { ascending: true })
        .range(from, to)
  );
  const vivas = new Map(guias.filter((g) => !g.deleted).map((g) => [g.id, g]));
  const itemsVivos = items.filter((i) => !i.deleted && vivas.has(i.guia_id));

  const conNombre = itemsVivos.filter((i) => N2(i.cliente));
  const conCodigo = itemsVivos.filter((i) => (i.cliente_codigo ?? "").trim());
  const codigoNoDelGrupo = conCodigo.filter((i) => !esCodigoDeCliente(i.cliente_codigo));
  const sinCodigo = itemsVivos.filter((i) => !(i.cliente_codigo ?? "").trim() && N2(i.cliente));
  const pareables = sinCodigo.filter((i) => codigoPorNombre.has(N2(i.cliente)));
  const noPareables = sinCodigo.filter((i) => !codigoPorNombre.has(N2(i.cliente)));
  const porAmbiguo = sinCodigo.filter((i) => ambiguos.has(N2(i.cliente)));

  const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(0)}%` : "—");

  console.log("=== LÍNEAS DE GUÍA (guia_items de guías vivas) ===");
  console.log(`total                     : ${itemsVivos.length}`);
  console.log(`con NOMBRE de cliente     : ${conNombre.length}  (${pct(conNombre.length, itemsVivos.length)})`);
  console.log(`con CÓDIGO                : ${conCodigo.length}  (${pct(conCodigo.length, itemsVivos.length)})`);
  console.log(`sin código, con nombre    : ${sinCodigo.length}`);
  console.log(`  · parean SOLAS (nombre normalizado idéntico a un D-XXX): ${pareables.length}`);
  console.log(`  · NO parean                                            : ${noPareables.length}`);
  console.log(`     de esas, NO por falta de cliente sino porque el nombre es AMBIGUO`);
  console.log(`     (2+ códigos D-XXX vivos con el mismo nombre)         : ${porAmbiguo.length}`);
  console.log(`\n=== NOMBRES AMBIGUOS en clientes_master (D-XXX vivos duplicados) ===`);
  for (const [n, cods] of ambiguos) console.log(`   "${n}" → ${cods.join(", ")}`);
  console.log(`\n   filas de guía sin código cuyo nombre cae en un ambiguo: ${porAmbiguo.length}`);
  for (const i of porAmbiguo) console.log(`      GT-${String(vivas.get(i.guia_id)?.numero ?? "?").padStart(3, "0")} "${i.cliente}"`);

  console.log(`\n=== GUÍAS ===`);
  const conAlgo = new Set(conCodigo.map((i) => i.guia_id));
  console.log(`vivas                      : ${vivas.size}`);
  console.log(`con al menos una línea atada: ${conAlgo.size}`);
  console.log(`sin ninguna línea atada     : ${vivas.size - conAlgo.size}`);
  const porEstado = new Map<string, number>();
  for (const g of vivas.values()) porEstado.set(g.estado ?? "—", (porEstado.get(g.estado ?? "—") ?? 0) + 1);
  console.log(`por estado                  : ${[...porEstado].map(([e, n]) => `${e}=${n}`).join(", ")}`);

  console.log(`\n=== 🔴 CÓDIGOS GUARDADOS QUE NO SON D-XXX DEL GRUPO ===`);
  console.log(`líneas: ${codigoNoDelGrupo.length}`);
  for (const i of codigoNoDelGrupo) {
    const g = vivas.get(i.guia_id);
    console.log(
      `   ⚠ GT-${String(g?.numero ?? "?").padStart(3, "0")} [${g?.estado}] cliente_codigo="${i.cliente_codigo}" cliente="${i.cliente}"` +
        ` → en clientes_master ese código es "${nombrePorCodigo.get((i.cliente_codigo ?? "").trim()) ?? "(no existe)"}"`
    );
  }

  console.log(`\n=== LAS QUE PAREAN SOLAS (se atarían) — por código ===`);
  const resumen = new Map<string, number>();
  for (const i of pareables) {
    const k = codigoPorNombre.get(N2(i.cliente))!;
    resumen.set(k, (resumen.get(k) ?? 0) + 1);
  }
  for (const [k, n] of [...resumen].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${k} ×${n}  "${nombrePorCodigo.get(k) ?? ""}"`);
  }

  console.log(`\n=== LAS QUE NO PAREAN — textos distintos, top 30 ===`);
  const cnt = new Map<string, number>();
  for (const i of noPareables) cnt.set((i.cliente ?? "").trim(), (cnt.get((i.cliente ?? "").trim()) ?? 0) + 1);
  console.log(`textos distintos: ${cnt.size}`);
  for (const [t, n] of [...cnt].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
    console.log(`   ×${String(n).padStart(3)}  "${t}"`);
  }

  // Cuánto costaría hacerlo OBLIGATORIO: cuántas líneas se crearían hoy sin poder
  // elegir de la lista (nombre que no existe en el directorio del grupo).
  console.log(`\n=== ¿Cuánto costaría hacerlo OBLIGATORIO? ===`);
  const universo = new Set(codigoPorNombre.keys());
  const nombresNoEnDirectorio = new Set(noPareables.map((i) => N2(i.cliente)));
  console.log(`clientes D-XXX vivos en el directorio : ${universo.size}`);
  console.log(`destinos escritos que NO existen ahí  : ${nombresNoEnDirectorio.size}`);
  console.log(`líneas que hoy NO se podrían crear    : ${noPareables.length} de ${itemsVivos.length} (${pct(noPareables.length, itemsVivos.length)})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
