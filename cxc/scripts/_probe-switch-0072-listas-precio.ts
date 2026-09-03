/**
 * SONDEO SOLO LECTURA (3-sep-2026): parámetro 0072 + listas de precios por cliente.
 * Un login por empresa, cierre en finally. GETs solamente.
 *   npx tsx scripts/_probe-switch-0072-listas-precio.ts <empresa> <sku> <clienteId,clienteId,...>
 */
import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  if (!l.includes("=") || l.trim().startsWith("#")) continue;
  const i = l.indexOf("=");
  process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"|"$/g, "");
}
async function main() {
  const { resolveSwitchEnvKey } = await import("../src/lib/switch-api/empresas");
  const [empresa, sku, clientesCsv] = process.argv.slice(2);
  const up = resolveSwitchEnvKey(empresa);
  const url = (process.env[`SWITCH_${up}_API_URL`] ?? "").replace(/\/+$/, "");
  const user = process.env[`SWITCH_${up}_API_USER`] ?? process.env[`SWITCH_${up}_WEB_USER`] ?? "";
  const password = process.env[`SWITCH_${up}_API_PASSWORD`] ?? process.env[`SWITCH_${up}_WEB_PASSWORD`] ?? "";
  console.log(`\n=== ${empresa} · ${url} · usuario=${user} (${process.env[`SWITCH_${up}_API_USER`] ? "API_USER" : "WEB_USER como respaldo"})`);
  const call = async (endpoint: string, method: "GET"|"POST", token?: string, body?: unknown) => {
    const headers: Record<string,string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers["Authorization"] = token;
    const res = await fetch(`${url}${endpoint}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let parsed: any = null; try { parsed = JSON.parse(text); } catch {}
    return { status: res.status, parsed, text };
  };
  const auth = await call("/autenticacion", "POST", undefined, { usuario: user, password });
  const token = auth.parsed?.data?.token;
  if (!token) { console.log("AUTH FALLÓ:", auth.status, auth.text.slice(0, 300)); return; }
  const d = auth.parsed.data; console.log("auth ok:", JSON.stringify({ usuarioId: d.usuarioId, vendedorId: d.vendedorId, sucursalId: d.sucursalId, expires_in: d.expires_in }));
  try {
    for (const codigo of ["0072", "0098", "0120"]) {
      const r = await call(`/parametro?codigo=${codigo}`, "GET", token);
      console.log(`parametro ${codigo}: HTTP ${r.status} → ${r.text.slice(0, 300).replace(/\s+/g, " ")}`);
    }
    const lista = await call(`/apiarticulos/lista?porPagina=50&paginaActual=1&filtro=${encodeURIComponent(sku)}`, "GET", token);
    const art = (lista.parsed?.data?.articulos || []).find((a: any) => a.codigo === sku);
    if (!art) { console.log("SKU no hallado:", lista.text.slice(0, 200)); return; }
    console.log(`SKU ${sku} sin clienteId: id=${art.id} precio=${art.precio} listaprecioId=${art.listaprecioId} · llaves=${Object.keys(art).join(",")}`);
    const precios = await call(`/apiarticulos/precios?articuloId=${art.id}`, "GET", token);
    console.log(`/apiarticulos/precios: HTTP ${precios.status} → ${precios.text.slice(0, 600).replace(/\s+/g, " ")}`);
    for (const cid of clientesCsv.split(",")) {
      const r = await call(`/apiarticulos/lista?porPagina=50&paginaActual=1&filtro=${encodeURIComponent(sku)}&clienteId=${cid}`, "GET", token);
      const a = (r.parsed?.data?.articulos || []).find((x: any) => x.codigo === sku);
      console.log(`  clienteId=${cid}: precio=${a?.precio} listaprecioId=${a?.listaprecioId} (HTTP ${r.status})`);
      const info = await call(`/apiarticulos/info?codigoBarra=${encodeURIComponent(art.codigoBarra)}&clienteId=${cid}`, "GET", token);
      const ia = info.parsed?.data?.articulo;
      console.log(`     /info clienteId=${cid}: precio=${ia?.precio} listaprecioId=${ia?.listaprecioId}`);
    }
  } finally {
    const out = await call("/cierresesion", "POST", token, {});
    console.log("cierresesion:", out.status, out.text.slice(0, 120).replace(/\s+/g, " "));
  }
}
main().catch((e) => { console.error("ERROR", e); process.exit(1); });
