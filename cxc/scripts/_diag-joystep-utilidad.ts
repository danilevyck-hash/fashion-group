// Cuánta plata de joystep aparece en Ventas › Utilidad — SOLO LECTURA.
//
// Corre la MISMA agregación que la RPC (por empresa+cliente, SUM plano sobre
// switch_factura_utilidad, las NC ya vienen negativas) para las CINCO de la v1
// y para las SEIS derivadas, y muestra la diferencia.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-joystep-utilidad.ts
import { supabaseServer } from "@/lib/supabase-server";
import { empresasConUtilidad } from "@/lib/switch-api/empresas";
import { leerTodoPaginado } from "@/lib/supabase-paginado";

const ANIO = Number(process.env.ANIO ?? new Date().getFullYear());
const V1 = ["vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear"];

type Fila = {
  id: string; empresa_key: string; cliente: string | null; cliente_switch_id: number | null;
  subtotal_con_descuento: number | string; costo: number | string; utilidad: number | string;
};
const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const money = (v: number) =>
  (v < 0 ? "−" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
  const derivadas = empresasConUtilidad();
  console.log(`Año ${ANIO}`);
  console.log(`v1  (escrita a mano): ${V1.join(" · ")}`);
  console.log(`v2  (derivada)      : ${derivadas.join(" · ")}`);
  console.log(`falta en la v1      : ${derivadas.filter(k => !V1.includes(k)).join(" · ") || "(ninguna)"}\n`);

  const filas = await leerTodoPaginado<Fila>("switch_factura_utilidad", (pedirCount, desde, hasta) =>
    supabaseServer
      .from("switch_factura_utilidad")
      .select("id,empresa_key,cliente,cliente_switch_id,subtotal_con_descuento,costo,utilidad", pedirCount ? { count: "exact" } : {})
      .gte("fecha", `${ANIO}-01-01`)
      .lte("fecha", `${ANIO}-12-31`)
      .in("empresa_key", derivadas)
      .order("id")
      .range(desde, hasta),
  );

  const tot = (keys: string[]) => {
    const f = filas.filter(r => keys.includes(r.empresa_key));
    const clientes = new Set(f.map(r => `${r.empresa_key}|${r.cliente_switch_id ?? "n:" + (r.cliente ?? "").trim().toUpperCase()}`));
    return {
      docs: f.length,
      clientes: clientes.size,
      ventas: f.reduce((s, r) => s + n(r.subtotal_con_descuento), 0),
      costo: f.reduce((s, r) => s + n(r.costo), 0),
      utilidad: f.reduce((s, r) => s + n(r.utilidad), 0),
    };
  };

  const a = tot(V1), b = tot(derivadas), j = tot(["joystep"]);
  const linea = (t: string, x: ReturnType<typeof tot>) =>
    `${t.padEnd(22)} docs ${String(x.docs).padStart(6)} · clientes ${String(x.clientes).padStart(4)} · ventas ${money(x.ventas).padStart(16)} · utilidad ${money(x.utilidad).padStart(15)} · margen ${x.ventas > 0 ? ((x.utilidad / x.ventas) * 100).toFixed(2) + "%" : "—"}`;
  console.log(linea("ANTES (5 empresas)", a));
  console.log(linea("DESPUÉS (6)", b));
  console.log(linea("→ lo que aporta joystep", j));
  console.log("");
  console.log(`Diferencia ventas   : ${money(b.ventas - a.ventas)}`);
  console.log(`Diferencia utilidad : ${money(b.utilidad - a.utilidad)}`);
  console.log(`Clientes nuevos     : ${b.clientes - a.clientes}`);

  // 🔴 Las otras cinco NO se mueven: la lista solo AGREGA.
  const iguales = (["ventas", "utilidad", "docs", "clientes"] as const)
    .every(k => tot(V1)[k] === a[k]);
  console.log(`\nLas otras 5, campo por campo: ${iguales ? "🟢 IDÉNTICAS" : "🔴 SE MOVIERON"}`);
}
main().catch(e => { console.error(e); process.exit(1); });
