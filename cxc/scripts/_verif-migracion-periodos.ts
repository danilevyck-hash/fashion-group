// SOLO LECTURA — la prueba de que la migración de períodos NO mueve un centavo.
//
// Simula en TypeScript EXACTAMENTE el backfill del PASO 4 de
// `20260811160000_marketing_periodos_por_proveedor.sql`, corre el agregador
// REAL con esos sellos, y lo compara contra la corrida SIN períodos (el
// fallback `grupo_legacy`, o sea lo que la pantalla muestra hoy).
//
// Si los dos caminos dan lo mismo, la migración es segura de correr.
//
// Uso: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-migracion-periodos.ts
import { createClient } from "@supabase/supabase-js";
import { agregarPorProveedor, type PeriodoRow, type SelloRow } from "../src/lib/marketing/resumen-proveedores";
import { esMultifashion } from "../src/lib/marketing/multifashion";
import { proveedorDeCodigo, SIN_PROVEEDOR } from "../src/lib/marketing/proveedores";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
const money = (n: number) =>
  "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function todo<T>(t: string, sel: string): Promise<T[]> {
  const { data, error } = await sb.from(t).select(sel).range(0, 4999);
  if (error) throw new Error(`${t}: ${error.message}`);
  return (data ?? []) as T[];
}

// Los ids de los períodos que la migración siembra (acá son sintéticos: lo que
// importa es la PARTICIÓN, no el uuid).
const PER: PeriodoRow[] = [
  { id: "pvh-cerrado", proveedor_key: "pvh", nombre: "Gastos Tommy y Calvin", estado: "cerrado", cerrado_en: "2026-08-11T00:00:00Z" },
  { id: "pvh-abierto", proveedor_key: "pvh", nombre: "Período 2026", estado: "abierto" },
  { id: "reebok-abierto", proveedor_key: "reebok", nombre: "Período 2026", estado: "abierto" },
  { id: "joybees-abierto", proveedor_key: "joybees", nombre: "Período 2026", estado: "abierto" },
];
const abiertoDe: Record<string, string> = {
  pvh: "pvh-abierto",
  reebok: "reebok-abierto",
  joybees: "joybees-abierto",
};

async function main() {
  const facturasTodas = await todo<any>(
    "mk_facturas",
    "id, proyecto_id, total, grupo_legacy, impulsadora_id, anulado_en",
  );
  const facturaMarcas = await todo<any>("mk_factura_marcas", "factura_id, marca_id, porcentaje");
  const proyectosTodos = await todo<any>("mk_proyectos", "id, tienda, tienda_codigo, anulado_en");
  const marcas = await todo<any>("mk_marcas", "id, nombre, codigo, empresa_codigo");
  const entregas = await todo<any>(
    "mk_entregas_muebles",
    "id, proyecto_id, total, total_por_marca, total_por_empresa_interna",
  );

  const proyectos = proyectosTodos.filter((p) => !p.anulado_en);
  const facturas = facturasTodas.filter((f) => !f.anulado_en);
  const proyById = new Map(proyectosTodos.map((p) => [String(p.id), p]));
  const proyectosMultifashion = new Set(
    proyectos.filter((p) => esMultifashion(p)).map((p) => String(p.id)),
  );
  const codigoDeMarca = new Map(marcas.map((m) => [String(m.id), String(m.codigo ?? "")]));
  const marcasDeFactura = new Map<string, string[]>();
  for (const fm of facturaMarcas) {
    const arr = marcasDeFactura.get(String(fm.factura_id)) ?? [];
    arr.push(String(fm.marca_id));
    marcasDeFactura.set(String(fm.factura_id), arr);
  }

  // ------------------------------------------------------- SIMULAR EL PASO 4
  const sellos: SelloRow[] = [];
  const push = (periodo_id: string, proveedor_key: string, tipo: "factura" | "entrega", documento_id: string) => {
    if (sellos.some((s) => s.tipo === tipo && s.documento_id === documento_id && s.proveedor_key === proveedor_key)) return;
    sellos.push({ periodo_id, proveedor_key, tipo, documento_id });
  };

  // 4a — facturas legacy no-multifashion (TH/CK/KL) → cerrado de PVH
  let n4a = 0;
  for (const f of facturasTodas) {
    if (!f.grupo_legacy) continue;
    const p = f.proyecto_id ? proyById.get(String(f.proyecto_id)) : null;
    if (!p || esMultifashion(p)) continue;
    for (const mid of marcasDeFactura.get(String(f.id)) ?? []) {
      if (proveedorDeCodigo(codigoDeMarca.get(mid)) !== "pvh") continue;
      push("pvh-cerrado", "pvh", "factura", String(f.id));
      n4a++;
    }
  }

  // 4b — el resto de las facturas con marca → el abierto de su proveedor
  let n4b = 0;
  for (const f of facturasTodas) {
    for (const mid of marcasDeFactura.get(String(f.id)) ?? []) {
      const prov = proveedorDeCodigo(codigoDeMarca.get(mid));
      if (prov === SIN_PROVEEDOR || prov === "multifashion") continue;
      if (sellos.some((s) => s.tipo === "factura" && s.documento_id === String(f.id) && s.proveedor_key === prov)) continue;
      push(abiertoDe[prov], prov, "factura", String(f.id));
      n4b++;
    }
  }

  // 4c — entregas de proyectos vivos no-multifashion → el abierto de su proveedor
  let n4c = 0;
  for (const e of entregas) {
    const p = e.proyecto_id ? proyById.get(String(e.proyecto_id)) : null;
    if (!p || p.anulado_en || esMultifashion(p)) continue;
    for (const [mid, monto] of Object.entries(e.total_por_marca ?? {})) {
      if (Number(monto) <= 0) continue;
      const prov = proveedorDeCodigo(codigoDeMarca.get(String(mid)));
      if (prov === SIN_PROVEEDOR || prov === "multifashion") continue;
      push(abiertoDe[prov], prov, "entrega", String(e.id));
      n4c++;
    }
  }

  console.log("═══ SELLOS que va a escribir la migración ═══");
  console.log(`  4a facturas legacy → PVH cerrado : ${n4a}`);
  console.log(`  4b facturas        → abierto     : ${n4b}`);
  console.log(`  4c entregas        → abierto     : ${n4c}`);
  console.log(`  TOTAL filas en mk_periodo_documentos: ${sellos.length}`);

  // -------------------------------------------------------------- COMPARAR
  const comun = {
    facturas,
    facturaMarcas,
    entregas,
    marcas,
    proyectos,
    proyectosMultifashion,
  };
  const antes = agregarPorProveedor(comun); // sin la DDL → fallback grupo_legacy
  const despues = agregarPorProveedor({ ...comun, periodos: PER, sellos });

  let fallos = 0;
  const cmp = (etiqueta: string, a: number, b: number) => {
    const ok = Math.abs(a - b) < 0.005;
    if (!ok) fallos++;
    console.log(`  ${ok ? "✅" : "❌"} ${etiqueta.padEnd(38)} antes ${money(a).padStart(13)}  después ${money(b).padStart(13)}`);
  };

  console.log("\n═══ ANTES (sin migración) vs DESPUÉS (con migración) ═══");
  for (const b of antes.bloques) {
    const d = despues.bloques.find((x) => x.key === b.key);
    if (!d) { fallos++; console.log(`  ❌ el bloque ${b.key} DESAPARECIÓ`); continue; }
    cmp(`${b.nombre} · facturas`, b.facturas.total, d.facturas.total);
    cmp(`${b.nombre} · muebles`, b.muebles.total, d.muebles.total);
    cmp(`${b.nombre} · total`, b.total, d.total);
    if (b.proyectos !== d.proyectos) { fallos++; console.log(`  ❌ ${b.nombre} proyectos ${b.proyectos} → ${d.proyectos}`); }
    else console.log(`  ✅ ${b.nombre} · proyectos`.padEnd(46) + `${b.proyectos}`);
  }
  cmp("TITULAR", antes.resumen.total, despues.resumen.total);
  cmp("Σ períodos cerrados", antes.cerrados.reduce((s, c) => s + c.total, 0), despues.cerrados.reduce((s, c) => s + c.total, 0));
  cmp("Σ por cliente", antes.porCliente.reduce((s, f) => s + f.total, 0), despues.porCliente.reduce((s, f) => s + f.total, 0));
  cmp("Σ por marca", Object.values(antes.porMarca).reduce((s, v) => s + v, 0), Object.values(despues.porMarca).reduce((s, v) => s + v, 0));

  console.log("\n  Período cerrado después de la migración:");
  for (const c of despues.cerrados) {
    console.log(`    ${c.proveedorNombre} · ${c.nombre} · ${money(c.total)} · ${c.facturas.count} facturas`);
  }

  // Invariante: un solo período abierto por proveedor
  const abiertos = PER.filter((p) => p.estado === "abierto");
  const porProv = new Map<string, number>();
  for (const p of abiertos) porProv.set(p.proveedor_key, (porProv.get(p.proveedor_key) ?? 0) + 1);
  for (const [k, n] of porProv) {
    if (n !== 1) { fallos++; console.log(`  ❌ ${k} tiene ${n} períodos abiertos`); }
  }
  console.log(`  ✅ un solo período abierto por proveedor (${[...porProv.keys()].join(", ")})`);

  console.log(`\n${fallos === 0 ? "🟢 LA MIGRACIÓN NO MUEVE UN CENTAVO" : `🔴 ${fallos} DIFERENCIAS — NO CORRER`}`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
