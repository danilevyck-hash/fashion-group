/**
 * SONDEO SOLO LECTURA de /apiingresomercancia/lista (§5.51 del PDF).
 *
 * Pregunta que contesta: ¿este endpoint devuelve algo hoy, y qué exactamente?
 * Daniel dijo que el ingreso de mercancía se empezó a registrar el 27-jul-2026,
 * así que puede venir vacío. NO se construye nada encima hasta ver el resultado.
 *
 * SESIÓN ÚNICA: secuencial, un login por empresa, /cierresesion al terminar.
 * No escribe en la base. No modifica nada en Switch.
 *
 *   npx tsx scripts/_probe-ingresomercancia.ts <empresa1> [empresa2 ...]
 */
import fs from "node:fs";

function cargarEnv() {
  for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
    if (!l.includes("=") || l.trim().startsWith("#")) continue;
    const i = l.indexOf("=");
    process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
}

const ts = () => new Date().toISOString().replace("T", " ").slice(0, 19) + "Z";

interface Cfg { url: string; user: string; password: string }

async function main() {
  cargarEnv();
  const { resolveSwitchEnvKey } = await import("../src/lib/switch-api/empresas");

  const empresas = process.argv.slice(2);
  if (empresas.length === 0) throw new Error("uso: _probe-ingresomercancia.ts <empresa> [...]");

  const DESDE = process.env.PROBE_DESDE ?? "2020-01-01";
  const HASTA = process.env.PROBE_HASTA ?? "2026-12-31";

  for (const empresaKey of empresas) {
    const up = resolveSwitchEnvKey(empresaKey);
    const cfg: Cfg = {
      url: (process.env[`SWITCH_${up}_API_URL`] ?? "").replace(/\/+$/, ""),
      user: process.env[`SWITCH_${up}_API_USER`] ?? "",
      password: process.env[`SWITCH_${up}_API_PASSWORD`] ?? "",
    };
    if (!cfg.url || !cfg.user || !cfg.password) {
      console.log(`\n─── ${empresaKey}: SIN ENV VARS, se omite ───`);
      continue;
    }

    console.log(`\n─── ${empresaKey} — inicio ${ts()} ───`);
    let token = "";
    try {
      // 1) login
      const authRes = await fetch(`${cfg.url}/autenticacion`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ usuario: cfg.user, password: cfg.password }),
      });
      const authTxt = await authRes.text();
      let authJson: any = null;
      try { authJson = JSON.parse(authTxt); } catch { /* HTML de error */ }
      token = authJson?.data?.token ?? "";
      if (!token) {
        console.log(`  ❌ auth HTTP ${authRes.status} sin token: ${authTxt.slice(0, 160)}`);
        continue;
      }

      // 2) paginar /apiingresomercancia/lista (tope 50 por página), dedup por id
      const vistos = new Map<number, any>();
      let paginacion: any = null;
      let duplicados = 0;
      let paginas = 0;
      for (let page = 1; page <= 200; page++) {
        const qs = new URLSearchParams({
          desde: DESDE, hasta: HASTA,
          porPagina: "50", paginaActual: String(page),
        });
        const r = await fetch(`${cfg.url}/apiingresomercancia/lista?${qs}`, {
          headers: { Accept: "application/json", Authorization: token },
        });
        const txt = await r.text();
        let j: any = null;
        try { j = JSON.parse(txt); } catch { /* noop */ }
        if (page === 1) {
          console.log(`  HTTP ${r.status} · ${txt.length} bytes`);
          if (!j) { console.log(`  ⚠️ NO ES JSON (200 con HTML?): ${txt.slice(0, 200)}`); break; }
          console.log(`  llaves de data: ${JSON.stringify(Object.keys(j?.data ?? {}))}`);
          if (j?.error) console.log(`  error en body: ${JSON.stringify(j.error)}`);
        }
        if (!j) break;
        const d = j?.data ?? {};
        // nombre del array: lo detectamos, no lo asumimos
        const arrKey = Object.keys(d).find((k) => Array.isArray((d as any)[k]));
        const batch: any[] = arrKey ? (d as any)[arrKey] : [];
        if (page === 1) {
          console.log(`  array bajo data.${arrKey ?? "(ninguno)"} · paginacion: ${JSON.stringify(d.paginacion ?? null)}`);
          if (batch[0]) console.log(`  MUESTRA fila[0]: ${JSON.stringify(batch[0])}`);
        }
        paginacion = d.paginacion ?? paginacion;
        paginas = page;
        if (batch.length === 0) break;
        for (const it of batch) {
          const id = Number(it?.id);
          if (vistos.has(id)) duplicados++;
          else vistos.set(id, it);
        }
        const total = Number(d?.paginacion?.total ?? 0);
        if (total > 0 && vistos.size + duplicados >= total) break;
        if (batch.length < 50) break;
      }

      const filas = [...vistos.values()];
      const suma = filas.reduce((s, f) => s + Number(String(f?.total ?? 0).replace(/,/g, "")), 0);
      const fechas = filas.map((f) => String(f?.fecha ?? "")).filter(Boolean).sort();
      const provs = new Set(filas.map((f) => f?.proveedorId));
      const estatuses = new Set(filas.map((f) => String(f?.estatus ?? f?.estado ?? "(sin campo)")));
      console.log(`  ► filas únicas: ${filas.length} (duplicados descartados: ${duplicados}, páginas: ${paginas}, paginacion.total: ${paginacion?.total ?? "?"})`);
      console.log(`  ► suma total: ${suma.toFixed(2)} · proveedores distintos: ${provs.size}`);
      console.log(`  ► rango de fechas: ${fechas[0] ?? "—"} … ${fechas[fechas.length - 1] ?? "—"}`);
      console.log(`  ► estatus presentes: ${JSON.stringify([...estatuses])}`);
      // por proveedor (top 5)
      const porProv = new Map<string, { n: number; monto: number }>();
      for (const f of filas) {
        const k = `${f?.proveedorId} ${f?.proveedor ?? ""}`;
        const cur = porProv.get(k) ?? { n: 0, monto: 0 };
        cur.n++; cur.monto += Number(String(f?.total ?? 0).replace(/,/g, ""));
        porProv.set(k, cur);
      }
      for (const [k, v] of [...porProv.entries()].sort((a, b) => b[1].monto - a[1].monto).slice(0, 8)) {
        console.log(`      ${k.padEnd(46)} ${String(v.n).padStart(3)} docs  ${v.monto.toFixed(2).padStart(14)}`);
      }
    } catch (e) {
      console.log(`  ❌ ${e instanceof Error ? e.message : e}`);
    } finally {
      if (token) {
        try {
          await fetch(`${cfg.url}/cierresesion`, { method: "POST", headers: { Authorization: token } });
          console.log(`  /cierresesion ok — fin ${ts()}`);
        } catch { console.log("  /cierresesion falló (best-effort)"); }
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
