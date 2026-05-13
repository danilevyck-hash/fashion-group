// Auditoría: filas de cxc_rows con fecha o fecha_vencimiento NULL.
// Reporta totales, top clientes afectados, distribución por empresa,
// y cuántas tienen n_fiscal decodificable (YYYYMMDD embebido).
//
// Uso: node scripts/audit-cxc-fechas-null.mjs

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(resolve(process.cwd(), ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

// Decodifica YYYYMMDD embebido en n_fiscal (ejemplo: "FE0120202605050000028720..." → 2026-05-05).
// Patrón: busca subcadena de 8 dígitos donde year ∈ [2020..2030], month ∈ [01..12], day ∈ [01..31].
function decodeFechaFromNFiscal(nFiscal) {
  if (!nFiscal) return null;
  const s = String(nFiscal);
  const re = /(20[2-3]\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/g;
  const matches = [];
  let m;
  while ((m = re.exec(s)) !== null) {
    matches.push({ y: m[1], mo: m[2], d: m[3], idx: m.index });
  }
  if (matches.length === 0) return null;
  // Heurística: tomar el primero (el formato Switch encodea fecha temprano en la cadena).
  const pick = matches[0];
  return `${pick.y}-${pick.mo}-${pick.d}`;
}

async function countAll() {
  const { count, error } = await sb
    .from("cxc_rows")
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

async function countNullField(field) {
  const { count, error } = await sb
    .from("cxc_rows")
    .select("id", { count: "exact", head: true })
    .is(field, null);
  if (error) throw error;
  return count ?? 0;
}

async function fetchAffected() {
  // Paginación porque puede haber muchas filas. Limit 1000 por page.
  const PAGE = 1000;
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from("cxc_rows")
      .select("id, company_key, cliente_codigo, n_sistema, n_fiscal, saldo, dias_vencidos, fecha, fecha_vencimiento")
      .or("fecha.is.null,fecha_vencimiento.is.null")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function fetchClientesNombres(codigos) {
  if (codigos.length === 0) return new Map();
  const out = new Map();
  // Buscar en chunks para no exceder query length.
  const CHUNK = 100;
  for (let i = 0; i < codigos.length; i += CHUNK) {
    const slice = codigos.slice(i, i + CHUNK);
    const { data, error } = await sb
      .from("clientes_master")
      .select("codigo, nombre")
      .in("codigo", slice);
    if (error) throw error;
    for (const c of data ?? []) out.set(c.codigo, c.nombre);
  }
  return out;
}

async function main() {
  console.log("=".repeat(70));
  console.log("AUDITORIA — cxc_rows con fecha o fecha_vencimiento NULL");
  console.log("=".repeat(70));

  const total = await countAll();
  const nullFecha = await countNullField("fecha");
  const nullVence = await countNullField("fecha_vencimiento");

  console.log(`Total filas cxc_rows: ${total.toLocaleString()}`);
  console.log(`Con fecha = NULL:             ${nullFecha.toLocaleString()} (${((nullFecha / total) * 100).toFixed(2)}%)`);
  console.log(`Con fecha_vencimiento = NULL: ${nullVence.toLocaleString()} (${((nullVence / total) * 100).toFixed(2)}%)`);

  const affected = await fetchAffected();
  console.log(`Filas con al menos un campo NULL: ${affected.length.toLocaleString()}`);
  console.log("");

  if (affected.length === 0) {
    console.log("Sin filas afectadas. Nada que reparar.");
    return;
  }

  // Top clientes por saldo absoluto sumado.
  const porCliente = new Map();
  for (const r of affected) {
    const k = r.cliente_codigo ?? "(sin codigo)";
    const prev = porCliente.get(k) ?? { saldo: 0, filas: 0, empresas: new Set() };
    prev.saldo += Math.abs(Number(r.saldo) || 0);
    prev.filas += 1;
    prev.empresas.add(r.company_key);
    porCliente.set(k, prev);
  }

  const codigos = [...porCliente.keys()].filter((c) => c !== "(sin codigo)");
  const nombres = await fetchClientesNombres(codigos);

  const topClientes = [...porCliente.entries()]
    .sort((a, b) => b[1].saldo - a[1].saldo)
    .slice(0, 30);

  console.log("TOP 30 CLIENTES AFECTADOS (ordenados por saldo absoluto desc)");
  console.log("-".repeat(70));
  console.log("codigo       | filas | saldo abs       | empresas       | nombre");
  console.log("-".repeat(70));
  for (const [codigo, v] of topClientes) {
    const empresas = [...v.empresas].join(",");
    const nombre = nombres.get(codigo) ?? "(no en clientes_master)";
    console.log(
      `${codigo.padEnd(12)} | ${String(v.filas).padStart(5)} | $${v.saldo.toFixed(2).padStart(14)} | ${empresas.padEnd(14)} | ${nombre}`,
    );
  }
  console.log("");

  // Distribución por empresa.
  const porEmpresa = new Map();
  for (const r of affected) {
    const k = r.company_key ?? "(sin empresa)";
    porEmpresa.set(k, (porEmpresa.get(k) ?? 0) + 1);
  }
  console.log("DISTRIBUCION POR EMPRESA");
  console.log("-".repeat(40));
  for (const [emp, n] of [...porEmpresa.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${emp.padEnd(20)} ${n.toLocaleString()}`);
  }
  console.log("");

  // Cuántas tienen n_fiscal con fecha decodificable.
  let decodables = 0;
  let noDecodables = 0;
  const ejemplosDec = [];
  const ejemplosNo = [];
  for (const r of affected) {
    const decoded = decodeFechaFromNFiscal(r.n_fiscal);
    if (decoded) {
      decodables++;
      if (ejemplosDec.length < 5) ejemplosDec.push({ id: r.id, n_fiscal: r.n_fiscal, decoded });
    } else {
      noDecodables++;
      if (ejemplosNo.length < 5) ejemplosNo.push({ id: r.id, n_fiscal: r.n_fiscal });
    }
  }
  console.log("FECHA RECUPERABLE DESDE n_fiscal");
  console.log("-".repeat(40));
  console.log(`Decodificables:    ${decodables.toLocaleString()} (${((decodables / affected.length) * 100).toFixed(1)}%)`);
  console.log(`No decodificables: ${noDecodables.toLocaleString()} (${((noDecodables / affected.length) * 100).toFixed(1)}%)`);
  console.log("");
  console.log("Ejemplos decodificables:");
  for (const e of ejemplosDec) console.log(`  n_fiscal="${e.n_fiscal}"  →  ${e.decoded}`);
  console.log("Ejemplos NO decodificables:");
  for (const e of ejemplosNo) console.log(`  n_fiscal="${e.n_fiscal ?? "(null/vacio)"}"`);
  console.log("");
  console.log("=".repeat(70));
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
