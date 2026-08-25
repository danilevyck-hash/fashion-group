// ─────────────────────────────────────────────────────────────────────────────
// LA LISTA DE NOMBRES A CORREGIR EN SWITCH.
//
// En Switch el MISMO producto está escrito de dos formas, y un código vive bajo
// las dos. La fila de Ventas › Productos suma sólo UNA grafía; la lista de
// clientes del desplegable trae las líneas de todos los códigos, así que suma
// más. La pantalla lo AVISA en ámbar — pero la solución de fondo es corregir el
// nombre en el ERP, y cuando eso pase el aviso desaparece solo.
//
// Esto imprime cada par de grafías, un código que comparten y CUÁNTA PLATA hay
// debajo, de mayor a menor. Es trabajo de Daniel en Switch, no del sistema.
//
// Solo lectura.
//   node scripts/_diag-grafias-a-corregir-en-switch.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env = {};
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function pag(t, b) {
  const o = []; let e = null;
  for (let p = 0; p < 300; p++) {
    const { data, error, count } = await b(p === 0, p * 1000, p * 1000 + 999);
    if (error) throw new Error(t + ": " + error.message);
    if (p === 0) e = count;
    o.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
    if (e != null && o.length >= e) break;
  }
  return o;
}
const money = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const EMPRESAS = ["fashion_wear", "vistana", "fashion_shoes", "active_shoes", "active_wear", "joystep"];
// Ventana ancha: los nombres hay que corregirlos una sola vez, no por período.
const DESDE = "2025-01-01", HASTA = "2026-08-24";

const todo = [];
for (const EMP of EMPRESAS) {
  const ad = await pag("ad", (c, d, h) => sb.from("switch_articulo_diario")
    .select("descripcion, codigo, tipo, venta_total", c ? { count: "exact" } : {})
    .eq("empresa_key", EMP).gte("fecha", DESDE).lte("fecha", HASTA).order("id").range(d, h));

  const grafiasDeCodigo = new Map();   // codigo -> Set(descripcion)
  const ventaDeGrafia = new Map();     // descripcion -> venta neta
  for (const r of ad) {
    const dsc = r.descripcion ?? "(sin descripcion)";
    const v = (r.tipo === "NC" ? -1 : 1) * Number(r.venta_total ?? 0);
    ventaDeGrafia.set(dsc, (ventaDeGrafia.get(dsc) ?? 0) + v);
    if (!r.codigo) continue;
    if (!grafiasDeCodigo.has(r.codigo)) grafiasDeCodigo.set(r.codigo, new Set());
    grafiasDeCodigo.get(r.codigo).add(dsc);
  }

  // Agrupar los códigos por el PAR de grafías que comparten.
  const pares = new Map();
  for (const [cod, set] of grafiasDeCodigo) {
    if (set.size < 2) continue;
    const clave = [...set].sort().join(" ||| ");
    const e = pares.get(clave) ?? { grafias: [...set].sort(), codigos: [] };
    e.codigos.push(cod);
    pares.set(clave, e);
  }
  for (const e of pares.values()) {
    const plata = e.grafias.reduce((s, g) => s + (ventaDeGrafia.get(g) ?? 0), 0);
    todo.push({ empresa: EMP, ...e, plata });
  }
}

todo.sort((a, b) => b.plata - a.plata);
console.log(`\nNOMBRES A CORREGIR EN SWITCH · ${DESDE} → ${HASTA}\n${"=".repeat(78)}`);
if (todo.length === 0) console.log("  (ninguno — no hay grafías duplicadas)");
let total = 0;
for (const t of todo) {
  total += t.plata;
  console.log(`\n${money(t.plata)}   ${t.empresa}   ·   ${t.codigos.length} código(s) compartido(s)`);
  for (const g of t.grafias) console.log(`     · "${g}"`);
  console.log(`     ej. código: ${t.codigos.slice(0, 3).join(", ")}${t.codigos.length > 3 ? ` (+${t.codigos.length - 3})` : ""}`);
}
console.log(`\n${"=".repeat(78)}\n${todo.length} pares de nombres · ${money(total)} de venta debajo`);
