/**
 * SONDEO SOLO LECTURA: volcar los documentos más grandes de
 * /apiingresomercancia/lista TAL CUAL vienen (JSON crudo, sin parsear).
 *
 * Motivo: el sondeo del 27-jul-2026 dio para active_shoes una suma de
 * $1.002.275.326,42 — mil millones de dólares, contra un saldo de CxP de
 * $233.870,60 en toda la empresa. Antes de sacar cualquier conclusión hay que
 * ver si el número absurdo viene de Switch o si lo produjo el parseo de acá.
 *
 *   npx tsx scripts/_probe-ingresomercancia-topdocs.ts <empresa> [n]
 */
import fs from "node:fs";

for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  if (!l.includes("=") || l.trim().startsWith("#")) continue;
  const i = l.indexOf("=");
  process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}

async function main() {
  const { resolveSwitchEnvKey } = await import("../src/lib/switch-api/empresas");
  const empresaKey = process.argv[2];
  const top = Number(process.argv[3] ?? 10);
  const up = resolveSwitchEnvKey(empresaKey);
  const url = (process.env[`SWITCH_${up}_API_URL`] ?? "").replace(/\/+$/, "");
  const user = process.env[`SWITCH_${up}_API_USER`] ?? "";
  const password = process.env[`SWITCH_${up}_API_PASSWORD`] ?? "";

  const authRes = await fetch(`${url}/autenticacion`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ usuario: user, password }),
  });
  const token = (await authRes.json())?.data?.token ?? "";
  if (!token) throw new Error("sin token");

  try {
    const todas: Record<string, unknown>[] = [];
    for (let page = 1; page <= 60; page++) {
      const qs = new URLSearchParams({ desde: "2020-01-01", hasta: "2026-12-31", porPagina: "50", paginaActual: String(page) });
      const r = await fetch(`${url}/apiingresomercancia/lista?${qs}`, {
        headers: { Accept: "application/json", Authorization: token },
      });
      const j = await r.json().catch(() => null);
      const batch = j?.data?.ingresomercancia ?? [];
      if (batch.length === 0) break;
      todas.push(...batch);
      if (batch.length < 50) break;
    }
    const num = (x: unknown) => Number(String(x ?? 0).replace(/,/g, ""));
    todas.sort((a, b) => num(b.total) - num(a.total));
    console.log(`${todas.length} documentos. Los ${top} más grandes, JSON CRUDO:\n`);
    for (const d of todas.slice(0, top)) console.log("  " + JSON.stringify(d));

    const suma = todas.reduce((s, d) => s + num(d.total), 0);
    const sinElTope = todas.slice(top).reduce((s, d) => s + num(d.total), 0);
    console.log(`\nsuma TOTAL: ${suma.toFixed(2)}`);
    console.log(`suma sin los ${top} más grandes: ${sinElTope.toFixed(2)}`);
    // ¿cuadra total con subTotal+impuesto en cada fila?
    const desc = todas.filter((d) => Math.abs(num(d.subTotal) + num(d.impuesto) - num(d.total)) > 0.005);
    console.log(`filas donde subTotal+impuesto != total: ${desc.length}`);
    if (desc[0]) console.log("  ej: " + JSON.stringify(desc[0]));
  } finally {
    await fetch(`${url}/cierresesion`, { method: "POST", headers: { Authorization: token } }).catch(() => {});
    console.log("\n/cierresesion ok");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
