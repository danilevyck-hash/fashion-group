/**
 * SONDEO SOLO LECTURA: ¿el filtro `estatus` de /apiingresomercancia/lista cambia
 * algo? Es la pregunta que decide si el número puede ser exacto al centavo.
 *
 * La respuesta de la lista NO trae campo `estatus` (verificado el 27-jul-2026),
 * así que no hay forma de saber desde la fila si un ingreso está anulado. Lo
 * único que se puede hacer es comparar el conteo/suma SIN filtro contra
 * `estatus=Activo` y contra `estatus=Inactivo`.
 *
 *   - Si "Activo" == "sin filtro" y "Inactivo" == 0 → no hay anulados hoy, pero
 *     el default podría incluirlos mañana → hay que filtrar igual.
 *   - Si "Activo" < "sin filtro" → el default INCLUYE anulados. Filtrar es
 *     OBLIGATORIO.
 *   - Si el filtro se ignora (los tres dan lo mismo) → NO se puede excluir un
 *     anulado y la columna no puede prometer exactitud.
 *
 * SESIÓN ÚNICA: un login, /cierresesion al terminar.
 *
 *   npx tsx scripts/_probe-ingresomercancia-estatus.ts <empresa>
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
  if (!empresaKey) throw new Error("uso: _probe-ingresomercancia-estatus.ts <empresa>");
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
    for (const estatus of [null, "Activo", "Inactivo"] as (string | null)[]) {
      const vistos = new Map<number, number>();
      let totalReportado = 0;
      for (let page = 1; page <= 200; page++) {
        const qs = new URLSearchParams({
          desde: "2020-01-01", hasta: "2026-12-31",
          porPagina: "50", paginaActual: String(page),
        });
        if (estatus) qs.set("estatus", estatus);
        const r = await fetch(`${url}/apiingresomercancia/lista?${qs}`, {
          headers: { Accept: "application/json", Authorization: token },
        });
        const j = await r.json().catch(() => null);
        const d = j?.data ?? {};
        const batch: { id: number; total: unknown }[] = Array.isArray(d.ingresomercancia) ? d.ingresomercancia : [];
        if (page === 1) totalReportado = Number(d?.paginacion?.total ?? 0);
        if (batch.length === 0) break;
        for (const it of batch) vistos.set(Number(it.id), Number(String(it.total ?? 0).replace(/,/g, "")));
        if (batch.length < 50) break;
        if (totalReportado > 0 && vistos.size >= totalReportado) break;
      }
      const suma = [...vistos.values()].reduce((a, b) => a + b, 0);
      console.log(`estatus=${String(estatus).padEnd(9)} → ${String(vistos.size).padStart(5)} docs únicos · total reportado ${String(totalReportado).padStart(5)} · suma ${suma.toFixed(2)}`);
    }
  } finally {
    await fetch(`${url}/cierresesion`, { method: "POST", headers: { Authorization: token } }).catch(() => {});
    console.log("/cierresesion ok");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
