// ¿La búsqueda por cliente de Comisiones da el MISMO número que el detalle del
// vendedor (RPC `comision_b2b_detalle`)? SOLO LEE: consultas y RPC STABLE.
//
//   npx tsx scripts/_verif-comisiones-buscar-cliente.ts [cliente] [año] [mes]
//
// Por cada (empresa, vendedor) del cliente: la búsqueda contra la RPC recortada
// a los documentos de ese cliente (ventas por secuencial, cobros por nombre),
// redondeada como la RPC. Sale con código 1 si un solo centavo no cuadra, o si
// no comparó nada (cero comparaciones no es un aprobado).
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { buscarClienteEnComisiones } from "../src/lib/comisiones/buscar-cliente-server";
import { EMPRESAS_COMISIONAN } from "../src/lib/comisiones/empresas";

for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  if (!l.includes("=") || l.trim().startsWith("#")) continue;
  const i = l.indexOf("=");
  process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const [cliente = "City Mall David", y = "2026", m = "10"] = process.argv.slice(2);
const year = Number(y);
const mes = Number(m);
const fin = new Date(Date.UTC(year, mes, 0)).toISOString().slice(0, 10);
const inicio = `${year}-${String(mes).padStart(2, "0")}-01`;
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const c2 = (n: number) => Math.round(n * 100) / 100;

async function main() {
  const clientes = await buscarClienteEnComisiones(sb, { q: cliente, inicio, fin, empresas: EMPRESAS_COMISIONAN });
  const c = clientes.find((x) => x.nombre.trim().toUpperCase() === cliente.trim().toUpperCase()) ?? clientes[0];
  if (!c) throw new Error(`No encontré «${cliente}»`);
  console.log(`${c.nombre} · ${c.codigo} · ${inicio} a ${fin}`);
  let comparadas = 0;
  let malas = 0;
  for (const v of c.por_vendedor) {
    const { data, error } = await sb.rpc("comision_b2b_detalle", { p_empresa_key: v.empresa, p_year: year, p_mes: mes, p_vendedor: v.vendedor });
    if (error) throw error;
    const secs = new Set(c.facturas.filter((f) => f.empresa === v.empresa).map((f) => f.comprobante));
    // Por secuencial O por nombre: así también se ve una factura del cliente que la búsqueda no hubiera traído.
    const nombre = c.nombre.trim().toUpperCase();
    const ventas = (data.ventas as { secuencial: string; cliente: string; subtotal: number }[]).filter(
      (d) => secs.has(d.secuencial) || String(d.cliente ?? "").trim().toUpperCase() === nombre,
    );
    const cobros = (data.cobros as { cliente: string; monto: number }[]).filter(
      (d) => String(d.cliente ?? "").trim().toUpperCase() === c.nombre.trim().toUpperCase(),
    );
    const vb = ventas.reduce((s, d) => s + Number(d.subtotal), 0);
    const cb = cobros.reduce((s, d) => s + Number(d.monto), 0);
    const rpc = c2(c2(vb * Number(data.tasa_venta)) + c2(cb * Number(data.tasa_cobro)));
    const ok = rpc === v.comision && c2(vb) === v.ventas_base && c2(cb) === v.cobros_base;
    comparadas++;
    if (!ok) malas++;
    console.log(`${ok ? "OK " : "MAL"} ${v.empresa.padEnd(13)} ${v.vendedor.padEnd(20)} búsqueda $${v.comision.toFixed(2)} · RPC $${rpc.toFixed(2)}  (ventas ${c2(vb)} / ${v.ventas_base} · cobros ${c2(cb)} / ${v.cobros_base})`);
  }
  console.log(`Comisión pagable del cliente: $${c.comision_pagable.toFixed(2)} · ${comparadas} comparaciones, ${malas} con diferencia`);
  if (!comparadas || malas) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
