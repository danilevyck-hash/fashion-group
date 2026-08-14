// ─────────────────────────────────────────────────────────────────────────────
// PRUEBA de que meter joystep en la matriz de Comisiones NO mueve un centavo de
// las otras 5 empresas.
//
// Corre la MISMA aritmética que hace `ComisionesConsolidadoView` (el pivot por
// vendedor + el descuento restado de LA CELDA de su empresa) sobre los datos
// REALES de producción, dos veces: con la lista de ANTES (5 empresas) y con la
// de AHORA (6). Compara CELDA POR CELDA.
//
// Solo lectura: no escribe una sola fila.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const ANTES = ["vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear"];
const AHORA = [...ANTES, "joystep"];
const PERIODOS = [[2026, 7], [2026, 6], [2026, 5]];

const round2 = (n) => Math.round(n * 100) / 100;
const DEFAULT_VENDEDOR = "DEFAULT";
const OCULTOS = new Set(["AGUAS"]); // VENDEDORES_OCULTOS de la vista
const oculto = (v) => OCULTOS.has(String(v).trim().toUpperCase());

// Réplica del endpoint /api/ventas/comisiones/consolidado.
async function traer(empresas, year, mes) {
  const porEmpresa = await Promise.all(
    empresas.map(async (empresa) => {
      const { data, error } = await sb.rpc("comision_b2b_v5", {
        p_empresa_key: empresa,
        p_year: year,
        p_mes: mes,
      });
      if (error) throw new Error(`${empresa}: ${error.message}`);
      return { empresa_key: empresa, vendedores: data?.vendedores ?? [] };
    }),
  );
  // Réplica EXACTA de leerDescuentosEfectivos(empresas, year, mes):
  // 2 consultas, el `activo` efectivo = excepción del mes si existe.
  const mesISO = `${year}-${String(mes).padStart(2, "0")}-01`;
  let descuentos = [];
  try {
    const { data: fijos, error } = await sb
      .from("comision_descuentos_fijos")
      .select("id, empresa_key, concepto, monto, vendedor_nombre")
      .in("empresa_key", empresas)
      .eq("activo", true)
      .order("concepto", { ascending: true });
    if (error) throw new Error(error.message);
    const ids = (fijos ?? []).map((f) => String(f.id));
    const exc = new Map();
    if (ids.length) {
      const { data: ex, error: e2 } = await sb
        .from("comision_descuento_excepciones")
        .select("descuento_id, activo")
        .in("descuento_id", ids)
        .eq("mes", mesISO);
      if (e2) throw new Error(e2.message);
      for (const x of ex ?? []) exc.set(String(x.descuento_id), Boolean(x.activo));
    }
    descuentos = (fijos ?? []).map((f) => ({
      empresa_key: String(f.empresa_key ?? ""),
      monto: Number(f.monto),
      activo: exc.has(String(f.id)) ? exc.get(String(f.id)) : true,
      vendedor: String(f.vendedor_nombre ?? ""),
    }));
  } catch {
    descuentos = []; // falla ABIERTO, igual que la ruta
  }
  return porEmpresa.map((r) => {
    // totalPorVendedor(descuentos, empresa_key)
    const porVendedor = {};
    for (const d of descuentos) {
      if (!d.activo || !d.vendedor) continue;
      if (d.empresa_key !== r.empresa_key) continue;
      porVendedor[d.vendedor] = round2((porVendedor[d.vendedor] ?? 0) + d.monto);
    }
    return { ...r, porVendedor };
  });
}

// Réplica del pivot de ComisionesConsolidadoView.
function pivotar(resp) {
  const byName = new Map();
  let def = null;
  const blank = (vendedor) => ({ vendedor, porEmpresa: {}, total: 0 });
  for (const r of resp) {
    for (const v of r.vendedores) {
      if (oculto(v.vendedor)) continue;
      const target =
        v.vendedor === DEFAULT_VENDEDOR
          ? (def ??= blank("Sin asignar"))
          : (byName.get(v.vendedor) ?? blank(v.vendedor));
      if (v.vendedor !== DEFAULT_VENDEDOR) byName.set(v.vendedor, target);
      target.porEmpresa[r.empresa_key] =
        (target.porEmpresa[r.empresa_key] ?? 0) + (v.comision_total ?? 0);
      target.total += v.comision_total ?? 0;
    }
    for (const [nombre, monto] of Object.entries(r.porVendedor ?? {})) {
      if (!monto || oculto(nombre) || nombre === DEFAULT_VENDEDOR) continue;
      const target = byName.get(nombre);
      if (!target) continue;
      target.porEmpresa[r.empresa_key] = round2((target.porEmpresa[r.empresa_key] ?? 0) - monto);
      target.total = round2(target.total - monto);
    }
  }
  return { filas: [...byName.values()], sinAsignar: def };
}

let celdas = 0;
let distintas = 0;
const detalle = [];

for (const [y, m] of PERIODOS) {
  const per = `${y}-${String(m).padStart(2, "0")}`;
  const [antes, ahora] = await Promise.all([
    traer(ANTES, y, m).then(pivotar),
    traer(AHORA, y, m).then(pivotar),
  ]);

  const nombres = new Set([
    ...antes.filas.map((f) => f.vendedor),
    ...ahora.filas.map((f) => f.vendedor),
  ]);

  for (const nombre of nombres) {
    const a = antes.filas.find((f) => f.vendedor === nombre);
    const b = ahora.filas.find((f) => f.vendedor === nombre);
    if (!a || !b) {
      distintas++;
      detalle.push(`${per} ${nombre}: aparece en solo una de las dos corridas`);
      continue;
    }
    // Las CELDAS de las 5 empresas de siempre, una por una.
    for (const e of ANTES) {
      celdas++;
      const va = a.porEmpresa[e] ?? 0;
      const vb = b.porEmpresa[e] ?? 0;
      if (round2(va) !== round2(vb)) {
        distintas++;
        detalle.push(`${per} ${nombre} · ${e}: ${va.toFixed(2)} → ${vb.toFixed(2)}`);
      }
    }
    // El TOTAL de la fila: solo puede moverse si esa persona tiene joystep.
    celdas++;
    const aporteJoystep = b.porEmpresa.joystep ?? 0;
    if (round2(a.total + aporteJoystep) !== round2(b.total)) {
      distintas++;
      detalle.push(
        `${per} ${nombre} · TOTAL: ${a.total.toFixed(2)} + joystep ${aporteJoystep.toFixed(2)} ≠ ${b.total.toFixed(2)}`,
      );
    }
  }

  // "Sin asignar" (la fila DEFAULT) va aparte: ES la que debe subir.
  const sa = antes.sinAsignar?.total ?? 0;
  const sb2 = ahora.sinAsignar?.total ?? 0;
  const js = ahora.sinAsignar?.porEmpresa?.joystep ?? 0;
  celdas++;
  if (round2(sa + js) !== round2(sb2)) {
    distintas++;
    detalle.push(`${per} Sin asignar: ${sa.toFixed(2)} + joystep ${js.toFixed(2)} ≠ ${sb2.toFixed(2)}`);
  }

  const totAntes = antes.filas.reduce((x, f) => x + f.total, 0) + sa;
  const totAhora = ahora.filas.reduce((x, f) => x + f.total, 0) + sb2;
  console.log(
    `${per} · grupo ${totAntes.toFixed(2)} → ${totAhora.toFixed(2)}` +
      ` (+${(totAhora - totAntes).toFixed(2)}) · joystep aporta ${js.toFixed(2)}` +
      ` · Sin asignar ${sa.toFixed(2)} → ${sb2.toFixed(2)}`,
  );
}

console.log(`\n${celdas} celdas comparadas · ${distintas} distintas`);
if (distintas) {
  console.log(detalle.join("\n"));
  console.log("\n🔴 ALGO SE MOVIÓ");
  process.exit(1);
}
console.log("🟢 las otras 5 empresas no se movieron un centavo");
process.exit(0);
