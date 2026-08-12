// SOLO LECTURA — corre el módulo REAL `resumen-proveedores.ts` contra las filas
// de producción y lo compara, centavo a centavo, contra `agregarResumenInicio`
// (lo que la pantalla muestra HOY). Si algo se mueve, este script lo dice.
//
// Uso: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-marketing-proveedores.ts
import { createClient } from "@supabase/supabase-js";
import { agregarResumenInicio } from "../src/lib/marketing/resumen-inicio";
import { agregarPorProveedor } from "../src/lib/marketing/resumen-proveedores";
import { esMultifashion } from "../src/lib/marketing/multifashion";
import { PROVEEDORES, indiceProveedorPorMarcaId } from "../src/lib/marketing/proveedores";

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

async function main() {
  const facturas = await todo<any>(
    "mk_facturas",
    "id, proyecto_id, total, grupo_legacy, impulsadora_id, anulado_en",
  );
  const vivas = facturas.filter((f) => !f.anulado_en);
  const facturaMarcas = await todo<any>("mk_factura_marcas", "factura_id, marca_id, porcentaje");
  const proyectosTodos = await todo<any>(
    "mk_proyectos",
    "id, tienda, tienda_codigo, anulado_en",
  );
  const proyectos = proyectosTodos.filter((p) => !p.anulado_en);
  const marcas = await todo<any>("mk_marcas", "id, nombre, codigo, empresa_codigo");
  const entregas = await todo<any>(
    "mk_entregas_muebles",
    "id, proyecto_id, total, total_por_marca, total_por_empresa_interna",
  );

  const proyectosVivos = new Set(proyectos.map((p) => String(p.id)));
  const proyectosMultifashion = new Set(
    proyectos.filter((p) => esMultifashion(p)).map((p) => String(p.id)),
  );

  // --- HOY (lo que la pantalla muestra) ---
  const hoy = agregarResumenInicio({
    facturas: vivas,
    facturaMarcas,
    entregas,
    marcas,
    proyectosVivos,
    proyectosMultifashion,
  });

  // --- NUEVO, sin la DDL corrida (fallback legacy) ---
  const nuevo = agregarPorProveedor({
    facturas: vivas,
    facturaMarcas,
    entregas,
    marcas,
    proyectos,
    proyectosMultifashion,
  });

  const nombre = new Map(marcas.map((m) => [String(m.id), m.nombre]));
  const idx = indiceProveedorPorMarcaId(marcas);

  console.log("═══ HOY — tarjetas de marca (agregarResumenInicio) ═══");
  let hoyFactPorProv = new Map<string, number>();
  let hoyMuePorProv = new Map<string, number>();
  for (const [mid, b] of Object.entries(hoy.porMarca)) {
    const k = idx.get(mid)!;
    hoyFactPorProv.set(k, (hoyFactPorProv.get(k) ?? 0) + b.total);
    console.log(`  facturas ${String(nombre.get(mid)).padEnd(18)} ${money(b.total).padStart(13)} (${b.count})  → ${k}`);
  }
  for (const [mid, b] of Object.entries(hoy.mueblesPorMarca)) {
    const k = idx.get(mid)!;
    hoyMuePorProv.set(k, (hoyMuePorProv.get(k) ?? 0) + b.total);
    console.log(`  muebles  ${String(nombre.get(mid)).padEnd(18)} ${money(b.total).padStart(13)} (${b.count})  → ${k}`);
  }
  console.log(`  legacy      ${money(hoy.legacy.total)} (${hoy.legacy.count})`);
  console.log(`  multifashion ${money(hoy.multifashion.total)} (${hoy.multifashion.count}) + muebles ${money(hoy.multifashion.muebles)}`);

  console.log("\n═══ NUEVO — bloques por proveedor ═══");
  for (const b of nuevo.bloques) {
    console.log(
      `  ${b.nombre.padEnd(24)} facturas ${money(b.facturas.total).padStart(13)} (${String(b.facturas.count).padStart(2)}) · muebles ${money(b.muebles.total).padStart(13)} (${String(b.muebles.count).padStart(2)}) · TOTAL ${money(b.total).padStart(13)} · ${b.proyectos} proyectos`,
    );
    if (b.marcas.length) console.log(`      marcas: ${b.marcas.join(" · ")}`);
  }
  console.log("\n  Períodos cerrados:");
  for (const c of nuevo.cerrados) {
    console.log(`    ${c.proveedorNombre} · ${c.nombre} · ${money(c.total)} (facturas ${c.facturas.count}, muebles ${c.muebles.count})`);
  }
  console.log(`\n  RESUMEN: ${money(nuevo.resumen.total)} · ${nuevo.resumen.proyectos} proyectos · ${nuevo.resumen.clientes} clientes`);

  // ------------------------------------------------------------- COMPARACIÓN
  console.log("\n═══ CUADRE — nuevo vs hoy, por proveedor ═══");
  let fallos = 0;
  const cmp = (etiqueta: string, a: number, b: number) => {
    const dif = Math.abs(a - b);
    const ok = dif < 0.005;
    if (!ok) fallos++;
    console.log(`  ${ok ? "✅" : "❌"} ${etiqueta.padEnd(34)} nuevo ${money(a).padStart(13)}  hoy ${money(b).padStart(13)}  dif ${money(a - b)}`);
  };
  for (const p of PROVEEDORES) {
    const b = nuevo.bloques.find((x) => x.key === p.key)!;
    cmp(`${p.nombre} · facturas`, b.facturas.total, hoyFactPorProv.get(p.key) ?? 0);
    cmp(`${p.nombre} · muebles`, b.muebles.total, hoyMuePorProv.get(p.key) ?? 0);
  }
  const mf = nuevo.bloques.find((x) => x.key === "multifashion")!;
  cmp("Multifashion · facturas", mf.facturas.total, hoy.multifashion.total);
  cmp("Multifashion · muebles", mf.muebles.total, hoy.multifashion.muebles);
  const legacy = nuevo.cerrados.reduce((s, c) => s + c.total, 0);
  cmp("Período cerrado (= legacy)", legacy, hoy.legacy.total);

  console.log("\n═══ CUADRE — contra el MOCKUP aprobado ═══");
  const pvh = nuevo.bloques.find((x) => x.key === "pvh")!;
  const joy = nuevo.bloques.find((x) => x.key === "joybees")!;
  const rbk = nuevo.bloques.find((x) => x.key === "reebok")!;
  cmp("PVH facturas = 22.600,00", pvh.facturas.total, 22600);
  cmp("PVH mobiliario = 70.225,00", pvh.muebles.total, 70225);
  cmp("PVH total = 92.825,00", pvh.total, 92825);
  cmp("Reebok total = 0,00", rbk.total, 0);
  cmp("Joybees total = 1.540,00", joy.total, 1540);
  cmp("Multifashion = 8.061,63", mf.total, 8061.63);
  cmp("RESUMEN = 102.426,63", nuevo.resumen.total, 102426.63);
  cmp("Cerrado PVH = 62.381,57", legacy, 62381.57);
  const sumaPorMarca = Object.values(nuevo.porMarca).reduce((s, v) => s + v, 0);
  cmp("Σ porMarca = resumen", sumaPorMarca, nuevo.resumen.total);
  const sumaPorCliente = nuevo.porCliente.reduce((s, f) => s + f.total, 0);
  cmp("Σ porCliente = resumen", sumaPorCliente, nuevo.resumen.total);
  if (nuevo.resumen.proyectos !== 22) { fallos++; console.log(`  ❌ proyectos ${nuevo.resumen.proyectos} ≠ 22`); }
  else console.log("  ✅ 22 proyectos");
  console.log(`  ℹ️  clientes distintos: ${nuevo.resumen.clientes}`);

  console.log("\n═══ POR CLIENTE (primeras 15) ═══");
  for (const f of nuevo.porCliente.slice(0, 15)) {
    const cols = nuevo.bloques.map((b) => `${b.nombre.slice(0, 4)} ${money(f.porBloque[b.key] ?? 0)}`).join("  ");
    console.log(`  ${f.cliente.padEnd(26)} ${cols}  = ${money(f.total)}`);
  }

  console.log(`\n${fallos === 0 ? "🟢 TODO CUADRA — 0 diferencias" : `🔴 ${fallos} DIFERENCIAS`}`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
