/**
 * DIAGNÓSTICO READ-ONLY — ¿el panel de CXC del grupo está mostrando Boston?
 *
 * Reproduce EXACTAMENTE las tarjetas de tramo del panel de CXC (`/admin`) desde
 * las DOS fuentes posibles, y las compara:
 *
 *   - `switch_estadocuenta_aging_mv`  ← lo que lee HOY /api/cxc/aging
 *   - `switch_estadocuenta_aging`     ← la VIEW, que sí excluye a Boston
 *
 * La agregación es la MISMA que hace `useAdminData.ts` (agrupa por
 * `nombre_normalized`, suma por tramo y descarta los clientes con total 0), para
 * que los números que imprime sean los que Daniel ve en pantalla y no una
 * aproximación.
 *
 * NO ESCRIBE NADA. Son 3 lecturas.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_diag-cxc-boston-mezclado.ts
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
const db = createClient(url, key, { auth: { persistSession: false } });

interface Fila {
  company_key: string;
  nombre_normalized: string;
  d0_30: number; d31_60: number; d61_90: number; d91_120: number;
  d121_180: number; d181_270: number; d271_365: number; mas_365: number;
  total: number;
}

const n = (x: unknown) => Number(x) || 0;

/** Las 6 del grupo — la misma lista que `B2B_COMPANIES` alimenta en la pantalla. */
const GRUPO = new Set(["vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep"]);

/**
 * Réplica EXACTA de la cadena de la pantalla:
 *   useAdminData.ts  → consolida por `nombre_normalized`, una entrada por empresa
 *   admin/page.tsx   → `roleClients`: descarta las empresas que no son del grupo
 *                      (`roleKeys`), recalcula los tramos y tira los clientes que
 *                      quedan sin ninguna empresa.
 *
 * `proyectar` prende/apaga ESE segundo paso, que es lo que hoy tapa el agujero
 * de la MV en el navegador. Sin él se ve el payload crudo del API.
 */
function panel(filas: Fila[], proyectar: boolean) {
  const map = new Map<string, Map<string, Fila[]>>();
  for (const r of filas) {
    const k = r.nombre_normalized;
    if (!k) continue;
    let porEmpresa = map.get(k);
    if (!porEmpresa) { porEmpresa = new Map(); map.set(k, porEmpresa); }
    const lista = porEmpresa.get(r.company_key) ?? [];
    lista.push(r);
    porEmpresa.set(r.company_key, lista);
  }

  const clientes: { total: number; current: number; watch: number; overdue: number }[] = [];
  for (const porEmpresa of map.values()) {
    const empresas = proyectar
      ? [...porEmpresa].filter(([key]) => GRUPO.has(key))
      : [...porEmpresa];
    if (proyectar && empresas.length === 0) continue; // roleClients devuelve null
    const c = { total: 0, current: 0, watch: 0, overdue: 0 };
    for (const [, lista] of empresas) {
      for (const r of lista) {
        c.current += n(r.d0_30) + n(r.d31_60) + n(r.d61_90);
        c.watch += n(r.d91_120);
        c.overdue += n(r.d121_180) + n(r.d181_270) + n(r.d271_365) + n(r.mas_365);
        c.total += n(r.total);
      }
    }
    if (c.total !== 0) clientes.push(c);
  }
  const suma = (f: (c: (typeof clientes)[number]) => number) =>
    Math.round(clientes.reduce((s, c) => s + f(c), 0) * 100) / 100;
  return {
    clientes: clientes.length,
    total: suma((c) => c.total),
    al_dia_0_90: suma((c) => c.current),
    x_vencer_91_120: suma((c) => c.watch),
    vencido_121: suma((c) => c.overdue),
  };
}

const money = (x: number) =>
  x.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

async function leerTodo(tabla: string): Promise<Fila[]> {
  const out: Fila[] = [];
  const PASO = 1000;
  for (let desde = 0; ; desde += PASO) {
    const { data, error } = await db
      .from(tabla)
      .select("company_key,nombre_normalized,d0_30,d31_60,d61_90,d91_120,d121_180,d181_270,d271_365,mas_365,total")
      .order("id")
      .range(desde, desde + PASO - 1);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    out.push(...((data ?? []) as unknown as Fila[]));
    if (!data || data.length < PASO) break;
  }
  return out;
}

async function main() {
  const mv = await leerTodo("switch_estadocuenta_aging_mv");
  const vista = await leerTodo("switch_estadocuenta_aging");

  const mvBoston = mv.filter((r) => r.company_key === "confecciones_boston");
  const vistaBoston = vista.filter((r) => r.company_key === "confecciones_boston");

  console.log("═══ FILAS ═══");
  console.log(`MV    switch_estadocuenta_aging_mv : ${mv.length} filas · ${mvBoston.length} de Boston`);
  console.log(`VIEW  switch_estadocuenta_aging    : ${vista.length} filas · ${vistaBoston.length} de Boston`);

  const filas: [string, "total" | "al_dia_0_90" | "x_vencer_91_120" | "vencido_121"][] = [
    ["Total pendiente", "total"],
    ["Al día (0-90 d)", "al_dia_0_90"],
    ["Por vencer (91-120 d)", "x_vencer_91_120"],
    ["Vencido (121 d+)", "vencido_121"],
  ];

  function tabla(titulo: string, a: ReturnType<typeof panel>, d: ReturnType<typeof panel>) {
    console.log(`\n═══ ${titulo} ═══`);
    console.log("Tramo                  |   ANTES (MV de hoy)    | DESPUÉS (MV arreglada) | Diferencia");
    for (const [label, campo] of filas) {
      console.log(
        `${label.padEnd(22)} | ${money(a[campo]).padStart(22)} | ${money(d[campo]).padStart(22)} | ${money(a[campo] - d[campo])}`,
      );
    }
    console.log(
      `${"Clientes en la lista".padEnd(22)} | ${String(a.clientes).padStart(22)} | ${String(d.clientes).padStart(22)} | ${a.clientes - d.clientes}`,
    );
  }

  // (1) Lo que devuelve el API — el payload crudo de /api/cxc/aging.
  tabla("PAYLOAD DE /api/cxc/aging (sin la proyección de la pantalla)", panel(mv, false), panel(vista, false));

  // (2) Lo que Daniel VE — con `roleClients` de admin/page.tsx aplicado encima.
  tabla("LO QUE SE VE EN PANTALLA (roleClients de admin/page.tsx)", panel(mv, true), panel(vista, true));

  // LO PEOR que la proyección de React está tapando: un cliente que existe en
  // Boston Y en el grupo se consolida en UNA fila (la consolidación es por
  // `nombre_normalized`), así que sin `roleClients` su tarjeta mostraría la suma
  // de las dos deudas — exactamente lo que Daniel prohibió ("si debe $10.000 al
  // grupo y $4.000 a Boston, en ningún lado puede salir $14.000").
  const nombresGrupo = new Set(vista.map((r) => r.nombre_normalized).filter(Boolean));
  const fusionados = new Map<string, { grupo: number; boston: number }>();
  for (const r of mvBoston) {
    if (!nombresGrupo.has(r.nombre_normalized)) continue;
    const f = fusionados.get(r.nombre_normalized) ?? { grupo: 0, boston: 0 };
    f.boston += n(r.total);
    fusionados.set(r.nombre_normalized, f);
  }
  for (const r of vista) {
    const f = fusionados.get(r.nombre_normalized);
    if (f) f.grupo += n(r.total);
  }
  console.log(`\n═══ CLIENTES QUE SE VERÍAN SUMADOS SIN LA PROYECCIÓN DE REACT ═══`);
  if (fusionados.size === 0) {
    console.log("ninguno");
  } else {
    for (const [nombre, f] of [...fusionados].sort((a, b) => b[1].boston - a[1].boston)) {
      console.log(
        `${nombre.padEnd(34)} grupo ${money(f.grupo).padStart(14)} + boston ${money(f.boston).padStart(12)} = ${money(f.grupo + f.boston).padStart(14)} ❌`,
      );
    }
  }

  // La pestaña de Boston, que NO puede cambiar.
  const { data: bost, error: eb } = await db
    .from("switch_estadocuenta_aging_boston")
    .select("total,d0_90,d91_120,d121_plus");
  if (eb) {
    console.log(`\n⚠️  switch_estadocuenta_aging_boston: ${eb.message}`);
  } else {
    const f = (bost ?? []) as { total: number; d0_90: number; d91_120: number; d121_plus: number }[];
    const s = (k: keyof (typeof f)[number]) => Math.round(f.reduce((a, r) => a + n(r[k]), 0) * 100) / 100;
    console.log("\n═══ PESTAÑA DE BOSTON (no puede cambiar) ═══");
    console.log(`filas ${f.length} · total ${money(s("total"))} · 0-90 ${money(s("d0_90"))} · 91-120 ${money(s("d91_120"))} · 121+ ${money(s("d121_plus"))}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
