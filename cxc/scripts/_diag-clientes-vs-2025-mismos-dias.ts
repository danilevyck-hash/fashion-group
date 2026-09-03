// ─────────────────────────────────────────────────────────────────────────────
// SOLO LECTURA. ¿CUÁNTAS VECES MINTIÓ LA COLUMNA «vs 2025» DE VENTAS › CLIENTES?
//
// 🩸 POR QUÉ SE MIDE. `clientes_empresa_12m_vw` cortaba el año anterior por MES
// (`mes <= max_mes`): el 2-sep-2026 comparaba 1-ene → 2-sep de 2026 contra
// 1-ene → 30-SEP de 2025 — ocho meses y dos días contra nueve. La regla de la
// casa (Multifashion, `rangoComparativo`) es «un mes empezado se compara contra
// los MISMOS DÍAS del año pasado». Antes de aplicar la migración
// `20260909120000_clientes_vs_anio_anterior_mismos_dias.sql` se mide contra
// producción cuántas filas cambian de número, cuántas cambian de SIGNO y cuáles
// son las cinco que más se mueven.
//
// Qué hace:
//   1. Lee `clientes_agregado_12m_vw` tal como está publicada (ventana vieja).
//   2. Reconstruye las dos ventanas desde `switch_facturas` + `switch_clientes`
//      + `clientes_master` con la MISMA lógica de la vista (puente por código,
//      mostrador TCKCTA aparte, pares activos en 12 meses).
//   3. Comprueba que la reconstrucción con la ventana VIEJA reproduce al centavo
//      el `compras_anio_anterior` publicado — si no, la réplica está mal y los
//      números de abajo no valen.
//   4. Con la ventana NUEVA (mismos días, corte en el día de Panamá) cuenta las
//      filas que cambian de delta, las que cambian de signo, y lista el top 5.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/_diag-clientes-vs-2025-mismos-dias.ts
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { hoyPanama, fechaPanamaDe } from "../src/lib/fecha-panama";
import { corteVsAnioAnterior } from "../src/lib/ventas/clientes-corte-comparativo";

const GRUPO = ["vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep"];
const SUMAN = new Set(["Factura", "Tiquete", "Transacción", "Nota de Débito"]);
const GENERICOS = new Set(["CONTADO", "VENTAS", "VENTAS LOCALES", "(Sin nombre)"]);

type Fac = {
  id: number; empresa_key: string; cliente_switch_id: number | null; cliente_nombre: string | null;
  fecha: string; tipo_comprobante: string | null; subtotal_descuento: number | string | null;
};

const norm = (s: string | null) => {
  const n = (s ?? "").toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
  return n || "(Sin nombre)";
};
const cents = (n: number) => Math.round(n * 100);
const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (d: number | null) => (d == null ? "—" : `${d >= 0 ? "+" : ""}${(d * 100).toFixed(1)}%`);
const signo = (d: number | null) => (d == null ? "sin dato" : d > 0 ? "sube" : d < 0 ? "baja" : "igual");

async function leerTodo<T>(pagina: (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await pagina(desde, desde + 999);
    if (error) throw new Error(error.message);
    const filas = (data ?? []) as T[];
    out.push(...filas);
    if (filas.length < 1000) return out;
  }
}

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const ahora = new Date();
  const hoy = hoyPanama(ahora);
  const anio = Number(hoy.slice(0, 4));
  const cutoff12m = `${anio - 1}-${hoy.slice(5, 7)}-01`; // date_trunc('month', hoy) - 12 meses

  // 1. Lo publicado.
  const publicado = await leerTodo<{ cliente_id: string | null; cliente_nombre: string; cliente_codigo: string; compras_ytd: string; compras_anio_anterior: string; delta_vs_2025: string | null }>(
    (d, h) => db.from("clientes_agregado_12m_vw").select("cliente_id, cliente_nombre, cliente_codigo, compras_ytd, compras_anio_anterior, delta_vs_2025").order("cliente_nombre").order("cliente_codigo").range(d, h),
  );
  console.log(`clientes_agregado_12m_vw: ${publicado.length} filas publicadas`);

  // 2. Las fuentes.
  const facturas = await leerTodo<Fac>((d, h) =>
    db.from("switch_facturas")
      .select("id, empresa_key, cliente_switch_id, cliente_nombre, fecha, tipo_comprobante, subtotal_descuento")
      .in("empresa_key", GRUPO).gte("fecha", `${anio - 1}-01-01T00:00:00Z`).not("cliente_nombre", "is", null)
      .order("id").range(d, h));
  const clientes = await leerTodo<{ empresa_key: string; cliente_switch_id: number; codigo: string | null }>((d, h) =>
    db.from("switch_clientes").select("empresa_key, cliente_switch_id, codigo").in("empresa_key", GRUPO).order("id").range(d, h));
  const master = await leerTodo<{ id: string; codigo: string; nombre: string }>((d, h) =>
    db.from("clientes_master").select("id, codigo, nombre").eq("deleted", false).order("id").range(d, h));
  console.log(`switch_facturas (6 empresas, desde ${anio - 1}): ${facturas.length} · switch_clientes: ${clientes.length} · clientes_master: ${master.length}`);

  const codigoDe = new Map(clientes.map((c) => [`${c.empresa_key}|${c.cliente_switch_id}`, c.codigo]));
  const masterPorCodigo = new Map(master.map((m) => [m.codigo, m]));

  // 3. Réplica de la vista: (cliente_key, empresa) → sumas.
  type Par = { key: string; empresa: string; codigo: string | null; norm: string; ytd: number; prevVieja: number; prevNueva: number; ultima: string };
  const pares = new Map<string, Par>();
  let maxMes = 0;
  let ultimaCargada: string | null = null;
  for (const f of facturas) {
    const fecha = fechaPanamaDe(f.fecha);
    if (fecha.slice(0, 4) !== String(anio)) continue;
    maxMes = Math.max(maxMes, Number(fecha.slice(5, 7)));
    if (!ultimaCargada || fecha > ultimaCargada) ultimaCargada = fecha;
  }
  const finMesViejo = `${anio - 1}-${String(maxMes).padStart(2, "0")}-31`; // mes <= max_mes ⇒ hasta fin de ese mes
  const { corte, cortePrev } = corteVsAnioAnterior(ultimaCargada, ahora); // la regla nueva, la misma del SQL
  console.log(`hoy (Panamá) = ${hoy} · última venta cargada = ${ultimaCargada} · corte = ${corte} · año anterior hasta ${cortePrev} · pares activos desde ${cutoff12m}`);

  for (const f of facturas) {
    const codigo = codigoDe.get(`${f.empresa_key}|${f.cliente_switch_id}`) ?? null;
    const n = norm(f.cliente_nombre);
    const pasa = codigo === "TCKCTA" || !GENERICOS.has(n);
    if (!pasa) continue;
    const key = codigo ?? `~${n}`;
    const fecha = fechaPanamaDe(f.fecha);
    const monto = Number(f.subtotal_descuento ?? 0);
    const firmado = SUMAN.has(f.tipo_comprobante ?? "") ? monto : f.tipo_comprobante === "Nota de Crédito" ? -monto : 0;
    const id = `${key}|${f.empresa_key}`;
    const p = pares.get(id) ?? { key, empresa: f.empresa_key, codigo, norm: n, ytd: 0, prevVieja: 0, prevNueva: 0, ultima: "" };
    if (fecha > p.ultima) p.ultima = fecha;
    if (fecha.slice(0, 4) === String(anio)) p.ytd += cents(firmado);
    if (fecha.slice(0, 4) === String(anio - 1)) {
      if (fecha <= finMesViejo) p.prevVieja += cents(firmado);
      if (fecha <= cortePrev) p.prevNueva += cents(firmado);
    }
    pares.set(id, p);
  }

  // Modo «Todas»: se agrupa como la vista agregada, por (cliente_id, nombre) de clientes_master.
  type Cli = { codigo: string; nombre: string; ytd: number; prevVieja: number; prevNueva: number };
  const porCliente = new Map<string, Cli>();
  for (const p of pares.values()) {
    if (p.ultima < cutoff12m) continue; // active_pairs
    const m = p.codigo ? masterPorCodigo.get(p.codigo) : undefined;
    const nombre = m?.nombre ?? p.norm;
    const gk = m ? `${m.id}|${nombre}` : `~|${nombre}`;
    const c = porCliente.get(gk) ?? { codigo: m?.codigo ?? p.codigo ?? "—", nombre, ytd: 0, prevVieja: 0, prevNueva: 0 };
    c.ytd += p.ytd; c.prevVieja += p.prevVieja; c.prevNueva += p.prevNueva;
    porCliente.set(gk, c);
  }

  // 4. La réplica con la ventana VIEJA tiene que reproducir lo publicado.
  const pubPorNombre = new Map(publicado.map((r) => [`${r.cliente_codigo}|${r.cliente_nombre}`, r]));
  let cuadran = 0, noCuadran = 0;
  for (const c of porCliente.values()) {
    const r = pubPorNombre.get(`${c.codigo}|${c.nombre}`);
    if (!r) { noCuadran++; continue; }
    if (cents(Number(r.compras_anio_anterior)) === c.prevVieja) cuadran++;
    else { noCuadran++; console.log(`  ✗ no cuadra ${c.codigo} ${c.nombre}: publicado ${r.compras_anio_anterior} vs réplica ${fmt(c.prevVieja / 100)}`); }
  }
  console.log(`\nRéplica de la ventana VIEJA (hasta ${finMesViejo}): ${cuadran} cuadran al centavo · ${noCuadran} no`);
  if (noCuadran > 0) console.log("  ⚠️ Con diferencias, los conteos de abajo son orientativos.");

  // 5. Efecto de la ventana NUEVA.
  const delta = (ytd: number, prev: number) => (prev > 0 ? (ytd - prev) / prev : null);
  const filas = [...porCliente.values()].filter((c) => c.codigo !== "TCKCTA");
  let cambian = 0, cambianSigno = 0;
  const cambios: Array<Cli & { dV: number | null; dN: number | null; dif: number }> = [];
  for (const c of filas) {
    const dV = delta(c.ytd, c.prevVieja), dN = delta(c.ytd, c.prevNueva);
    if (c.prevVieja === c.prevNueva) continue;
    cambian++;
    if (signo(dV) !== signo(dN)) cambianSigno++;
    cambios.push({ ...c, dV, dN, dif: Math.abs((dN ?? 0) - (dV ?? 0)) });
  }
  console.log(`\nClientes del ranking: ${filas.length} · con «vs ${anio - 1}»: ${filas.filter((c) => c.prevVieja > 0 || c.prevNueva > 0).length}`);
  console.log(`Cambian de número: ${cambian} · cambian de SIGNO (sube↔baja / aparece o desaparece): ${cambianSigno}`);

  const conSigno = cambios.filter((c) => signo(c.dV) !== signo(c.dN));
  if (conSigno.length) {
    console.log("\nCambian de signo:");
    for (const c of conSigno.sort((a, b) => b.ytd - a.ytd)) {
      console.log(`  ${c.codigo.padEnd(8)} ${c.nombre.slice(0, 34).padEnd(34)} ${anio}: ${fmt(c.ytd / 100).padStart(13)} · antes ${pct(c.dV).padStart(8)} (${signo(c.dV)}) → ahora ${pct(c.dN).padStart(8)} (${signo(c.dN)})`);
    }
  }
  console.log("\nTop 5 por cambio de delta (con número en las DOS ventanas — las que pasan a «—» ya están arriba):");
  for (const c of cambios.filter((c) => c.dV != null && c.dN != null).sort((a, b) => b.dif - a.dif).slice(0, 5)) {
    console.log(`  ${c.codigo.padEnd(8)} ${c.nombre.slice(0, 34).padEnd(34)} ${anio}: ${fmt(c.ytd / 100).padStart(13)} · ${anio - 1} hasta ${finMesViejo.slice(5)}: ${fmt(c.prevVieja / 100).padStart(13)} → hasta ${cortePrev.slice(5)}: ${fmt(c.prevNueva / 100).padStart(13)} · ${pct(c.dV)} → ${pct(c.dN)}`);
  }

  const d108 = filas.find((c) => c.codigo === "D-108");
  if (d108) console.log(`\nD-108 ${d108.nombre}: ${fmt(d108.ytd / 100)} · vieja ${fmt(d108.prevVieja / 100)} (${pct(delta(d108.ytd, d108.prevVieja))}) · nueva ${fmt(d108.prevNueva / 100)} (${pct(delta(d108.ytd, d108.prevNueva))})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
