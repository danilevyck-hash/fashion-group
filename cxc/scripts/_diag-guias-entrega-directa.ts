// Diagnóstico SOLO LECTURA contra producción — Guías / entrega directa + dirección.
//
// Uso:
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-guias-entrega-directa.ts
//
// No escribe NADA. Contesta tres preguntas:
//   1. ¿Cuántas guías creadas como "entrega directa" quedaron grabadas como
//      "transportista externo"? ¿Y las placas en "0"?
//   2. ¿Qué tan seguido un cliente repite la MISMA dirección?
//   3. ¿Qué columnas tiene `guia_items` (para poder ordenar "la última")?

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
const db = createClient(url, key, { auth: { persistSession: false } });

type GuiaRow = {
  id: string;
  numero: number;
  fecha: string;
  modo_entrega: string | null;
  transportista_id: string | null;
  tipo_despacho: string | null;
  placa: string | null;
  numero_guia_transp: string | null;
  estado: string;
  deleted: boolean | null;
};

type ItemRow = {
  id: string;
  guia_id: string;
  cliente: string | null;
  cliente_codigo: string | null;
  direccion: string | null;
  deleted: boolean | null;
  created_at?: string | null;
};

async function main() {
  // ── 1. Guías ──────────────────────────────────────────────────────────────
  const { data: guias, error: eG } = await db
    .from("guia_transporte")
    .select(
      "id, numero, fecha, modo_entrega, transportista_id, tipo_despacho, placa, numero_guia_transp, estado, deleted"
    )
    .order("numero", { ascending: true });
  if (eG) throw eG;
  const vivas = (guias as GuiaRow[]).filter((g) => !g.deleted);

  console.log(`\n═══ GUÍAS ═══  total ${guias?.length} · vivas ${vivas.length}`);

  const porModo = new Map<string, number>();
  for (const g of vivas) porModo.set(g.modo_entrega ?? "(null)", (porModo.get(g.modo_entrega ?? "(null)") ?? 0) + 1);
  console.log("modo_entrega:", Object.fromEntries(porModo));

  const porTipo = new Map<string, number>();
  for (const g of vivas) porTipo.set(g.tipo_despacho ?? "(null)", (porTipo.get(g.tipo_despacho ?? "(null)") ?? 0) + 1);
  console.log("tipo_despacho:", Object.fromEntries(porTipo));

  const directas = vivas.filter((g) => g.modo_entrega === "entrega_directa");
  const directasComoExterno = directas.filter((g) => g.tipo_despacho === "externo");
  const directasComoDirecto = directas.filter((g) => g.tipo_despacho === "directo");
  const directasSinTipo = directas.filter((g) => !g.tipo_despacho);
  console.log(
    `\n🔴 creadas ENTREGA DIRECTA: ${directas.length}` +
      ` → grabadas externo ${directasComoExterno.length}` +
      ` · directo ${directasComoDirecto.length}` +
      ` · sin tipo ${directasSinTipo.length}`
  );

  const placaCero = vivas.filter((g) => String(g.placa ?? "").trim() === "0");
  console.log(
    `\nplaca "0": ${placaCero.length} →`,
    placaCero.map((g) => `GT-${String(g.numero).padStart(3, "0")} (${g.fecha?.slice(0, 10)}, modo=${g.modo_entrega}, tipo=${g.tipo_despacho}, nTransp="${g.numero_guia_transp}")`)
  );

  // ── 2. Ítems / direcciones ────────────────────────────────────────────────
  // Descubrir columnas reales de guia_items con una fila.
  const { data: muestra, error: eM } = await db.from("guia_items").select("*").limit(1);
  if (eM) throw eM;
  console.log("\n═══ guia_items · columnas ═══\n", Object.keys((muestra as Record<string, unknown>[])[0] ?? {}).join(", "));

  const { data: items, error: eI } = await db
    .from("guia_items")
    .select("id, guia_id, cliente, cliente_codigo, direccion, deleted")
    .order("id", { ascending: true });
  if (eI) throw eI;
  const itemsVivos = (items as ItemRow[]).filter((i) => !i.deleted);
  console.log(`\n═══ ENVÍOS ═══ total ${items?.length} · vivos ${itemsVivos.length}`);

  const conCodigo = itemsVivos.filter((i) => (i.cliente_codigo ?? "").trim());
  console.log(`con cliente_codigo: ${conCodigo.length}`);

  const dirs = new Set(itemsVivos.map((i) => (i.direccion ?? "").trim()).filter(Boolean));
  console.log(`direcciones DISTINTAS (texto crudo): ${dirs.size}`);

  const cntDir = new Map<string, number>();
  for (const i of itemsVivos) {
    const d = (i.direccion ?? "").trim();
    if (d) cntDir.set(d, (cntDir.get(d) ?? 0) + 1);
  }
  console.log(
    "top direcciones:",
    [...cntDir.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  );

  // Fecha de la guía por id, para ordenar "la última" cronológicamente.
  const fechaDeGuia = new Map<string, string>();
  const numeroDeGuia = new Map<string, number>();
  for (const g of guias as GuiaRow[]) {
    fechaDeGuia.set(g.id, g.fecha ?? "");
    numeroDeGuia.set(g.id, g.numero);
  }

  // Por código de cliente: ¿cuántas direcciones distintas? ¿acierta la última?
  const porCliente = new Map<string, ItemRow[]>();
  for (const i of conCodigo) {
    const c = (i.cliente_codigo as string).trim();
    if (!porCliente.has(c)) porCliente.set(c, []);
    (porCliente.get(c) as ItemRow[]).push(i);
  }

  let unaSola = 0;
  let aciertos = 0;
  let evaluados = 0;
  for (const [, lista] of porCliente) {
    const ordenada = [...lista].sort((a, b) => {
      const fa = fechaDeGuia.get(a.guia_id) ?? "";
      const fb = fechaDeGuia.get(b.guia_id) ?? "";
      if (fa !== fb) return fa < fb ? -1 : 1;
      return (numeroDeGuia.get(a.guia_id) ?? 0) - (numeroDeGuia.get(b.guia_id) ?? 0);
    });
    const distintas = new Set(ordenada.map((i) => (i.direccion ?? "").trim().toUpperCase()).filter(Boolean));
    if (distintas.size <= 1) unaSola++;
    // Simula: para cada envío, ¿la dirección coincide con la ÚLTIMA anterior?
    for (let k = 1; k < ordenada.length; k++) {
      const anterior = (ordenada[k - 1].direccion ?? "").trim().toUpperCase();
      const actual = (ordenada[k].direccion ?? "").trim().toUpperCase();
      if (!anterior || !actual) continue;
      evaluados++;
      if (anterior === actual) aciertos++;
    }
  }
  console.log(
    `\nclientes atados: ${porCliente.size} · con UNA SOLA dirección en toda su historia: ${unaSola}`
  );
  console.log(
    `"la anterior acierta": ${aciertos}/${evaluados} = ${evaluados ? ((aciertos / evaluados) * 100).toFixed(1) : "—"}%`
  );

  // Lo mismo pero por NOMBRE normalizado (para líneas sin código)
  const norm = (s: string) => s.toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
  const porNombre = new Map<string, ItemRow[]>();
  for (const i of itemsVivos) {
    const n = norm(i.cliente ?? "");
    if (!n) continue;
    if (!porNombre.has(n)) porNombre.set(n, []);
    (porNombre.get(n) as ItemRow[]).push(i);
  }
  let aciertosN = 0;
  let evaluadosN = 0;
  for (const [, lista] of porNombre) {
    const ordenada = [...lista].sort((a, b) => {
      const fa = fechaDeGuia.get(a.guia_id) ?? "";
      const fb = fechaDeGuia.get(b.guia_id) ?? "";
      if (fa !== fb) return fa < fb ? -1 : 1;
      return (numeroDeGuia.get(a.guia_id) ?? 0) - (numeroDeGuia.get(b.guia_id) ?? 0);
    });
    for (let k = 1; k < ordenada.length; k++) {
      const anterior = (ordenada[k - 1].direccion ?? "").trim().toUpperCase();
      const actual = (ordenada[k].direccion ?? "").trim().toUpperCase();
      if (!anterior || !actual) continue;
      evaluadosN++;
      if (anterior === actual) aciertosN++;
    }
  }
  console.log(
    `por NOMBRE normalizado: ${porNombre.size} nombres · "la anterior acierta": ${aciertosN}/${evaluadosN} = ${evaluadosN ? ((aciertosN / evaluadosN) * 100).toFixed(1) : "—"}%`
  );

  // Y la EMPRESA, para confirmar que NO se debe autocompletar
  const { data: items2 } = await db
    .from("guia_items")
    .select("guia_id, cliente_codigo, empresa, deleted")
    .order("id", { ascending: true });
  const it2 = (items2 as Array<{ guia_id: string; cliente_codigo: string | null; empresa: string | null; deleted: boolean | null }>).filter((i) => !i.deleted);
  const porClienteEmp = new Map<string, string[]>();
  for (const i of it2) {
    const c = (i.cliente_codigo ?? "").trim();
    if (!c) continue;
    if (!porClienteEmp.has(c)) porClienteEmp.set(c, []);
    (porClienteEmp.get(c) as string[]).push(norm(i.empresa ?? ""));
  }
  let aE = 0;
  let eE = 0;
  for (const [, lista] of porClienteEmp) {
    for (let k = 1; k < lista.length; k++) {
      if (!lista[k - 1] || !lista[k]) continue;
      eE++;
      if (lista[k - 1] === lista[k]) aE++;
    }
  }
  console.log(`EMPRESA "la anterior acierta": ${aE}/${eE} = ${eE ? ((aE / eE) * 100).toFixed(1) : "—"}%  ← por eso NO se autocompleta`);
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
