/**
 * SONDEO SOLO LECTURA: ¿/apiingresomercancia/info expone el ESTADO de un
 * ingreso (anulado sí/no)?
 *
 * Contexto: el filtro `estatus` de /apiingresomercancia/lista está DOCUMENTADO
 * pero se IGNORA — medido el 27-jul-2026 en american_classic, `Activo`,
 * `Inactivo` y sin filtro devuelven las MISMAS 610 filas y la MISMA suma
 * ($1.099.278,65). Y la fila de la lista no trae ningún campo de estado.
 *
 * O sea: desde la lista NO se puede saber si un ingreso está anulado. Si el
 * detalle tampoco lo dice, entonces la suma NO se puede certificar al centavo
 * por ningún camino. Si sí lo dice, se puede — pero al costo de UNA llamada por
 * documento (610 en una sola empresa), que es justo el antipatrón que el repo ya
 * mató con multifashion_tickets.
 *
 * Toma una MUESTRA (default 12 documentos) para no castigar la API.
 *
 *   npx tsx scripts/_probe-ingresomercancia-info.ts <empresa> [n]
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
  const muestra = Number(process.argv[3] ?? 12);
  if (!empresaKey) throw new Error("uso: _probe-ingresomercancia-info.ts <empresa> [n]");
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
    // 1) una página de la lista para tener ids reales
    const qs = new URLSearchParams({ desde: "2020-01-01", hasta: "2026-12-31", porPagina: "50", paginaActual: "1" });
    const r = await fetch(`${url}/apiingresomercancia/lista?${qs}`, {
      headers: { Accept: "application/json", Authorization: token },
    });
    const lista = (await r.json())?.data?.ingresomercancia ?? [];
    const ids = lista.slice(0, muestra).map((x: { id: number }) => x.id);
    console.log(`muestra de ${ids.length} ingresos: ${ids.join(", ")}\n`);

    const llavesVistas = new Set<string>();
    for (const id of ids) {
      const ri = await fetch(`${url}/apiingresomercancia/info?ingresomercanciaId=${id}`, {
        headers: { Accept: "application/json", Authorization: token },
      });
      const txt = await ri.text();
      let j: unknown = null;
      try { j = JSON.parse(txt); } catch { /* HTML de error */ }
      if (!j) { console.log(`  id ${id}: NO ES JSON (${txt.slice(0, 90)})`); continue; }
      const d = (j as { data?: Record<string, unknown> })?.data ?? {};
      const cab = (d.ingresomercancia ?? d.ingreso ?? d) as Record<string, unknown>;
      const llaves = Object.keys(cab).filter((k) => !Array.isArray(cab[k]));
      llaves.forEach((k) => llavesVistas.add(k));
      const estado = llaves.filter((k) => /estatus|estado|activo|anul/i.test(k));
      console.log(`  id ${String(id).padStart(4)} → campos de estado: ${estado.length ? estado.map((k) => `${k}=${JSON.stringify(cab[k])}`).join(" · ") : "NINGUNO"}`);
    }
    console.log(`\ntodas las llaves escalares vistas en el detalle:\n  ${[...llavesVistas].join(", ")}`);
  } finally {
    await fetch(`${url}/cierresesion`, { method: "POST", headers: { Authorization: token } }).catch(() => {});
    console.log("\n/cierresesion ok");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
