/**
 * Genera comprobantes de entrega de mobiliario REALES (datos de producción) para
 * mirarlos con los ojos. Solo lectura.
 *   npx tsx scripts/_verif-comprobante-entrega.ts
 */
import fs from "fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  if (!l.includes("=") || l.trim().startsWith("#")) continue;
  const i = l.indexOf("=");
  process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const OUT = "/Users/daniellevy/.claude/jobs/5b66fe8c/tmp";

async function main() {
  const { supabaseServer } = await import("../src/lib/supabase-server");
  const { cargarComprobantes } = await import("../src/lib/marketing/entrega-comprobante");
  const { buildComprobanteEntregaPdf, nombreArchivoComprobante, numeroComprobante } =
    await import("../src/lib/marketing/pdf-entrega-mueble");

  const { data } = await supabaseServer
    .from("mk_entregas_muebles")
    .select("id, total, created_at")
    .not("proyecto_id", "is", null)
    .order("created_at", { ascending: false });
  const todas = (data ?? []) as Array<{ id: string; total: number; created_at: string }>;
  // Con items (la mayoría) + la de Joybees + la más cara.
  const conItems = await supabaseServer
    .from("mk_entrega_items")
    .select("entrega_id")
    .in("entrega_id", todas.map((e) => e.id));
  const setItems = new Set((conItems.data ?? []).map((r) => String((r as { entrega_id: string }).entrega_id)));
  const caras = [...todas].sort((a, b) => Number(b.total) - Number(a.total));
  const elegidas = Array.from(
    new Set([
      caras[0]?.id,
      todas.find((e) => setItems.has(e.id))?.id,
      todas.find((e) => !setItems.has(e.id))?.id,
    ].filter(Boolean) as string[]),
  );

  const map = await cargarComprobantes(elegidas);
  console.log(`entregas totales: ${todas.length} · con items: ${setItems.size} · sin items: ${todas.length - setItems.size}`);
  for (const id of elegidas) {
    const d = map.get(id);
    if (!d) { console.log("SIN DATOS", id); continue; }
    const pdf = buildComprobanteEntregaPdf(d);
    const file = `${OUT}/${nombreArchivoComprobante(d).replace(/[/\\:*?"<>|]/g, "-")}.pdf`;
    fs.writeFileSync(file, pdf);
    // ¿Trae la imagen del logo? Contamos XObjects de imagen en el PDF crudo.
    const raw = pdf.toString("latin1");
    const imgs = (raw.match(/\/Subtype\s*\/Image/g) || []).length;
    console.log(
      `\n${numeroComprobante(id)} → ${file}\n  bytes=${pdf.length}  imagenesXObject=${imgs}` +
      `\n  cliente=${d.cliente} (${d.clienteCodigo ?? "sin codigo"})  tienda=${d.tienda}  proyecto=${d.proyecto}` +
      `\n  fecha=${d.fecha.slice(0,10)}  total=${d.total}  items=${d.items.length}  marcas=${d.porMarca.map(m=>m.marca+" $"+m.monto).join(", ")}` +
      `\n  detalle=${JSON.stringify(d.items)}` +
      `\n  Σ items = ${d.items.reduce((s,i)=>s+i.cantidad*i.precioUnitario,0).toFixed(2)}  (total entrega ${d.total})`,
    );
    if (imgs < 1) console.log("  ⚠️  EL LOGO NO SE DIBUJÓ");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
