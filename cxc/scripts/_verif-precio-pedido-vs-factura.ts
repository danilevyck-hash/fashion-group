// SOLO LECTURA. Cruza el precio que mandamos en cada pedido a Switch contra
// el precio facturado en switch_factura_lineas (mismo cliente, mismo SKU,
// fecha >= envío).
import { supabaseServer as sb } from "../src/lib/supabase-server";
const MARCAS = [
  { m: "reebok", empresa: "active_shoes" },
  { m: "joybees", empresa: "joystep" },
  { m: "tommy", empresa: "fashion_shoes" },
  { m: "calvin", empresa: "vistana" },
];
async function main() {
  let totalLineas = 0, conFactura = 0, difieren = 0, plata = 0;
  const detalle: string[] = [];
  for (const { m, empresa } of MARCAS) {
    const { data: envs } = await sb.from(`${m}_switch_envios`).select("*").neq("estado", "error");
    for (const e of envs || []) {
      const { data: items } = await sb.from(`${m}_order_items`).select("sku,name,quantity,unit_price").eq("order_id", e.order_id);
      const { data: ord } = await sb.from(`${m}_orders`).select("order_number,client_name,status,created_at").eq("id", e.order_id).single();
      const clienteId = e.payload?.clienteId;
      const skus = (items || []).map((i: any) => i.sku).filter(Boolean);
      const desde = new Date(new Date(e.created_at).getTime() - 24 * 3600 * 1000).toISOString();
      const { data: lineas } = await sb
        .from("switch_factura_lineas")
        .select("switch_factura_id,secuencial,fecha,codigo,cantidad,precio,descuento_pct,subtotal_con_descuento,cliente_nombre,tipo_comprobante")
        .eq("empresa_key", empresa)
        .eq("cliente_switch_id", clienteId)
        .eq("tipo_comprobante", "Factura")
        .in("codigo", skus.length ? skus : ["__none__"])
        .gte("fecha", desde)
        .order("fecha", { ascending: true });
      const facts = new Set((lineas || []).map((l: any) => l.secuencial));
      let dif = 0;
      for (const it of items || []) {
        totalLineas++;
        const ls = (lineas || []).filter((l: any) => l.codigo === it.sku);
        if (!ls.length) continue;
        conFactura++;
        for (const l of ls) {
          const pf = Number(l.precio), pp = Number(it.unit_price);
          if (Math.abs(pf - pp) >= 0.01) {
            dif++; difieren++;
            plata += (pf - pp) * Number(l.cantidad);
            detalle.push(`  ${m} ${ord?.order_number} → pedido Switch ${e.numero_interno} (${e.documento}) · factura ${l.secuencial} ${String(l.fecha).slice(0,10)} · SKU ${it.sku}: mandamos $${pp.toFixed(2)} · facturado $${pf.toFixed(2)} × ${l.cantidad} (desc ${l.descuento_pct}%)`);
          }
        }
      }
      console.log(`${m.padEnd(8)} ${String(ord?.order_number).padEnd(10)} ${e.numero_interno} ${e.documento} cli=${clienteId} ${String(e.created_at).slice(0,10)} · líneas=${items?.length} · facturas halladas=${facts.size ? [...facts].join(",") : "—"} · precio≠: ${dif}`);
    }
  }
  console.log(`\nTOTAL líneas de pedido: ${totalLineas} · con factura hallada (mismo cliente+SKU): ${conFactura} · difieren: ${difieren} · plata (facturado − enviado): $${plata.toFixed(2)}`);
  console.log(detalle.join("\n"));
}
main();
