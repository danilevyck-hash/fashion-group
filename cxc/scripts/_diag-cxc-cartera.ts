/**
 * MEDICIÓN (SOLO LECTURA) — ¿de qué cartera son las filas de las 3 tablas de
 * anotaciones del CXC? `cxc_favorites`, `cxc_client_overrides`, `cxc_contact_log`
 * no tienen columna de empresa/cartera: se atan al cliente por
 * `nombre_normalized`, así que grupo y Boston comparten namespace.
 *
 * Universo de cada cartera = las MISMAS vistas que alimentan las dos pantallas:
 *   grupo  → switch_estadocuenta_aging          (las 6 empresas FG)
 *   boston → switch_estadocuenta_aging_boston
 * Más el histórico completo de switch_estadocuenta por empresa_key, porque el
 * aging solo trae saldo abierto y estas filas son viejas.
 *
 * Uso:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-cxc-cartera.ts
 */
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const PAGE = 1000;

async function leerTodo(tabla: string, cols: string, orden: string) {
  const filas: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(tabla).select(cols).order(orden).range(from, from + PAGE - 1);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    if (!data || data.length === 0) break;
    filas.push(...(data as Record<string, unknown>[]));
    if (data.length < PAGE) break;
  }
  return filas;
}

const norm = (s: string) => s.replace(/[.,]/g, "").replace(/\s+/g, " ").trim().toUpperCase();

async function main() {
  const favs = await leerTodo("cxc_favorites", "id,user_id,nombre_normalized,created_at", "created_at");
  const ovs = await leerTodo("cxc_client_overrides", "id,nombre_normalized,updated_at,resultado_contacto", "updated_at");
  const logs = await leerTodo("cxc_contact_log", "id,nombre_normalized,contacted_at,method", "contacted_at");

  // ── universos ────────────────────────────────────────────────────────────
  const agingG = await leerTodo("switch_estadocuenta_aging", "nombre_normalized", "nombre_normalized");
  const agingB = await leerTodo("switch_estadocuenta_aging_boston", "nombre_normalized", "nombre_normalized");
  const grupo = new Set(agingG.map((r) => norm(String(r.nombre_normalized))));
  const boston = new Set(agingB.map((r) => norm(String(r.nombre_normalized))));

  const sec = await leerTodo("switch_estadocuenta", "empresa_key,cliente_nombre", "id");
  const empresas = new Map<string, number>();
  for (const r of sec) {
    const n = norm(String(r.cliente_nombre ?? ""));
    empresas.set(String(r.empresa_key), (empresas.get(String(r.empresa_key)) ?? 0) + 1);
    if (!n) continue;
    (String(r.empresa_key) === "confecciones_boston" ? boston : grupo).add(n);
  }

  console.log("═══ UNIVERSOS (aging + histórico switch_estadocuenta) ═══");
  console.log(`empresas en switch_estadocuenta: ${[...empresas].map(([k, n]) => `${k}=${n}`).join(" · ")}`);
  console.log(`nombres GRUPO=${grupo.size} · BOSTON=${boston.size} · en las DOS=${[...grupo].filter((n) => boston.has(n)).length}`);

  const tablas = [
    { nombre: "cxc_favorites", filas: favs, fecha: "created_at" },
    { nombre: "cxc_client_overrides", filas: ovs, fecha: "updated_at" },
    { nombre: "cxc_contact_log", filas: logs, fecha: "contacted_at" },
  ];

  for (const t of tablas) {
    const nombres = t.filas.map((f) => norm(String(f.nombre_normalized ?? "")));
    const clasif = (n: string) =>
      grupo.has(n) && boston.has(n) ? "ambas" : grupo.has(n) ? "grupo" : boston.has(n) ? "boston" : "ninguna";
    const filasPor: Record<string, number> = { grupo: 0, boston: 0, ambas: 0, ninguna: 0 };
    const nomPor: Record<string, string[]> = { grupo: [], boston: [], ambas: [], ninguna: [] };
    for (const n of nombres) filasPor[clasif(n)]++;
    for (const n of new Set(nombres)) nomPor[clasif(n)].push(n);
    const fechas = t.filas.map((f) => String(f[t.fecha] ?? "")).filter(Boolean).sort();

    console.log(`\n═══ ${t.nombre} — ${t.filas.length} filas · ${new Set(nombres).size} nombres ═══`);
    console.log(`fechas: ${fechas[0] ?? "—"} → ${fechas[fechas.length - 1] ?? "—"}`);
    console.log(`FILAS  → grupo ${filasPor.grupo} · boston ${filasPor.boston} · AMBAS ${filasPor.ambas} · ninguna ${filasPor.ninguna}`);
    for (const k of ["boston", "ambas", "ninguna"] as const) {
      if (nomPor[k].length) console.log(`   ${k} (${nomPor[k].length}): ${nomPor[k].sort().slice(0, 30).join(" | ")}`);
    }
    if (t.nombre === "cxc_favorites") {
      const porUser = new Map<string, number>();
      for (const f of t.filas) porUser.set(String(f.user_id), (porUser.get(String(f.user_id)) ?? 0) + 1);
      console.log(`   por usuario: ${[...porUser].map(([u, n]) => `${u}=${n}`).join(" · ")}`);
    }
    if (t.nombre === "cxc_contact_log") {
      const porUser = new Map<string, number>();
      for (const f of t.filas) porUser.set(String(f.method), (porUser.get(String(f.contacted_by)) ?? 0) + 1);
      console.log(`   por usuario: ${[...porUser].map(([u, n]) => `${u}=${n}`).join(" · ")}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
