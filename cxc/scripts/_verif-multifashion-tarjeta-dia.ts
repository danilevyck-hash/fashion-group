// ¿La tarjeta del día de Multifashion da los MISMOS números que la base?
// SOLO LEE.  npx tsx scripts/_verif-multifashion-tarjeta-dia.ts [fecha …]
//
// Sin fechas: los 3 días anteriores a hoy (Panamá) y hoy. Por cada día, la
// tarjeta (`leerTarjetaDelDia`) contra caminos INDEPENDIENTES:
//   · venta y tickets del día: el Resumen del mes (RPC del detalle) para días
//     cerrados, y `switch_facturas` firmado (signoVenta) para todos;
//   · venta del equivalente (−364 d): la función del Telegram (`sumRetail`) y
//     la del Resumen (`ventanasResumen().fechaComparable`) para la fecha;
//   · margen: `switch_articulo_diario` sumado aquí a mano;
//   · horas: la suma de las 24 horas = la venta del día.
// Sale con código 1 si un centavo no cuadra.
import fs from "fs";

for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  if (!l.includes("=") || l.trim().startsWith("#")) continue;
  const i = l.indexOf("=");
  process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const c2 = (n: number) => Math.round(n * 100) / 100;
let fallas = 0;
const igual = (que: string, a: number | null, b: number | null) => {
  const ok = a == null || b == null ? a === b : Math.abs(c2(a) - c2(b)) < 0.005;
  if (!ok) fallas++;
  console.log(`  ${ok ? "✓" : "✗"} ${que}: ${a} · ${b}`);
};

async function main() {
  const { supabaseServer: sb } = await import("../src/lib/supabase-server");
  const { hoyPanama } = await import("../src/lib/fecha-panama");
  const { leerTarjetaDelDia } = await import("../src/lib/multifashion/tarjeta-dia-server");
  const { sumRetail } = await import("../src/lib/multifashion/retail-dia");
  const { ventanasResumen } = await import("../src/lib/acs-resumen-diario");
  const { rpcRetail } = await import("../src/lib/multifashion/rpc-retail");
  const { signoVenta } = await import("../src/lib/ventas/tipos-comprobante");
  const { cambioDelDia, horasDeMayorVenta, ticketPromedio } = await import("../src/lib/multifashion/tarjeta-dia");

  const hoy = hoyPanama();
  const menos = (f: string, n: number) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
  const fechas = process.argv.slice(2).length ? process.argv.slice(2) : [menos(hoy, 3), menos(hoy, 2), menos(hoy, 1), hoy];

  for (const fecha of fechas) {
    const t = await leerTarjetaDelDia(fecha, hoy);
    console.log(`\n${fecha}${t.esHoy ? " (hoy)" : ""} vs ${t.equivalente}`);

    // Venta y tickets desde switch_facturas, firmados, sin mayoreo, día de Panamá.
    const sf = async (f: string) => {
      const { data, error } = await sb.from("switch_facturas")
        .select("tipo_comprobante, subtotal_descuento, is_wholesale")
        .eq("empresa_key", "american_classic")
        .gte("fecha", `${f}T00:00:00-05:00`).lt("fecha", `${menos(f, -1)}T00:00:00-05:00`).limit(5000);
      if (error) throw error;
      const r = (data ?? []).filter((x) => !x.is_wholesale);
      return { v: r.reduce((s, x) => s + signoVenta(x.tipo_comprobante) * Number(x.subtotal_descuento ?? 0), 0), n: r.length };
    };
    const [a, b] = await Promise.all([sf(fecha), sf(t.equivalente)]);
    igual("venta (switch_facturas)", t.venta, a.v);
    igual("tickets (switch_facturas)", t.tickets, a.n);
    igual("venta año pasado (switch_facturas)", t.ventaPrevia, b.v);
    igual("tickets año pasado (switch_facturas)", t.ticketsPrevios, b.n);
    igual("venta año pasado (Telegram sumRetail)", t.ventaPrevia, await sumRetail(t.equivalente, t.equivalente));
    if (t.equivalente !== ventanasResumen(fecha).fechaComparable) { fallas++; console.log("  ✗ equivalente ≠ Telegram"); }
    igual("suma de las horas", t.horas.reduce((s, x) => s + x, 0), t.venta);

    if (!t.esHoy) {
      const [y, m, d] = fecha.split("-").map(Number);
      const det = await rpcRetail("detalleMensual", { p_year: y, p_mes: m });
      const fila = ((det.data as { dias?: { dia: number; ventas: number; n_tickets: number }[] })?.dias ?? []).find((x) => x.dia === d);
      igual("venta (Resumen del mes)", t.venta, fila ? Number(fila.ventas) : null);
      igual("tickets (Resumen del mes)", t.tickets, fila ? Number(fila.n_tickets) : null);
      const { data: art } = await sb.from("switch_articulo_diario").select("tipo, venta_total, costo_total")
        .eq("empresa_key", "american_classic").eq("fecha", fecha).neq("tipo", "ND").limit(5000);
      let v = 0, c = 0;
      for (const r of art ?? []) { const s = r.tipo === "NC" ? -1 : 1; v += s * Number(r.venta_total ?? 0); c += s * Number(r.costo_total ?? 0); }
      igual("margen ×10000 (switch_articulo_diario)", t.margen == null ? null : Math.round(t.margen * 10000), v > 0 ? Math.round(((v - c) / v) * 10000) : null);
    } else if (t.margen !== null && !t.margenEstimado) { fallas++; console.log("  ✗ hoy trae margen real"); }

    const h = horasDeMayorVenta(t.horas);
    const cambio = cambioDelDia(t);
    const prom = ticketPromedio(t.venta, t.tickets);
    console.log(`  tarjeta: $${c2(t.venta)} ${cambio?.texto ?? ""} · año pasado $${c2(t.ventaPrevia)} · margen ${t.margen == null ? (t.esHoy ? "mañana" : "—") : (t.margen * 100).toFixed(1) + "%"} · ${t.tickets} tickets (${t.ticketsPrevios}) · promedio $${prom?.toFixed(2)} · horas ${h?.rotulo} $${h?.monto}`);
  }
  console.log(fallas ? `\n✗ ${fallas} no cuadran` : "\n✓ todo cuadra al centavo");
  process.exit(fallas ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
