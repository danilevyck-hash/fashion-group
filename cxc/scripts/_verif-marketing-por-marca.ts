// ============================================================================
// SOLO LECTURA — corre el agregador REAL (`resumen-bloques.ts`) contra las filas
// de PRODUCCIÓN y compara ANTES vs DESPUÉS del corte por marca.
//
// "ANTES" son dos cosas, no una:
//   (a) `agregarResumenInicio` — el módulo que dibuja la pantalla de HOY y que
//       este cambio NO tocó. Es la referencia viva.
//   (b) las 6 cifras de control medidas el 11-ago-2026, escritas a mano acá.
//
// "DESPUÉS" también son dos, y tienen que dar IDÉNTICO:
//   (1) con los sellos tal como están hoy en la base (todos con la clave VIEJA
//       por proveedor, porque la migración por marca la corre Daniel a mano).
//   (2) sin ninguna tabla de período (fallback `grupo_legacy`).
//
// ⚠️ NUNCA ESCRIBE. Solo `select`. Y hace POCAS consultas: la base se satura.
//
// Uso:
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/_verif-marketing-por-marca.ts
// ============================================================================
import { createClient } from "@supabase/supabase-js";
import { agregarResumenInicio } from "../src/lib/marketing/resumen-inicio";
import { agregarPorBloques } from "../src/lib/marketing/resumen-bloques";
import { esMultifashion } from "../src/lib/marketing/multifashion";
import { MARCAS_BLOQUE, indiceBloquePorMarcaId } from "../src/lib/marketing/bloques";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const money = (n: number) =>
  "$" +
  Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

async function todo<T>(t: string, sel: string): Promise<T[]> {
  const { data, error } = await sb.from(t).select(sel).range(0, 9999);
  if (error) throw new Error(`${t}: ${error.message}`);
  return (data ?? []) as T[];
}

// --- Las cifras de control, medidas contra producción el 11-ago-2026 --------
const CONTROL = {
  abiertoGrupoPvh: 92825.0, // TH + CK + KL, período abierto
  cerradoMid2026: 62381.57, // "mid 2026", 59 facturas
  cerradoFacturas: 59,
  joybees: 1540.0,
  multifashion: 8061.63,
  totalTitular: 102426.63,
  mobiliario: 71765.0,
  porMarcaAbiertoMasCerrado: {
    TH: 102904.43,
    CK: 52302.14,
    KL: 0,
    RBK: 0,
  } as Record<string, number>,
};

let fallos = 0;
function cmp(etiqueta: string, a: number, b: number) {
  const ok = Math.abs(a - b) < 0.005;
  if (!ok) fallos++;
  console.log(
    `  ${ok ? "✅" : "❌"} ${etiqueta.padEnd(42)} ${money(a).padStart(13)}  esperado ${money(
      b,
    ).padStart(13)}  dif ${money(a - b)}`,
  );
}
function cmpN(etiqueta: string, a: number, b: number) {
  const ok = a === b;
  if (!ok) fallos++;
  console.log(
    `  ${ok ? "✅" : "❌"} ${etiqueta.padEnd(42)} ${String(a).padStart(13)}  esperado ${String(
      b,
    ).padStart(13)}`,
  );
}

async function main() {
  const [
    facturasTodas,
    facturaMarcas,
    proyectosTodos,
    marcas,
    entregas,
    adjuntos,
    periodos,
    sellos,
  ] = await Promise.all([
    todo<any>(
      "mk_facturas",
      "id, proyecto_id, total, grupo_legacy, impulsadora_id, anulado_en",
    ),
    todo<any>("mk_factura_marcas", "factura_id, marca_id, porcentaje"),
    todo<any>("mk_proyectos", "id, tienda, tienda_codigo, anulado_en"),
    todo<any>("mk_marcas", "id, nombre, codigo, empresa_codigo"),
    todo<any>(
      "mk_entregas_muebles",
      "id, proyecto_id, total, total_por_marca, total_por_empresa_interna",
    ),
    todo<any>("mk_adjuntos", "tipo, factura_id, proyecto_id"),
    todo<any>("mk_periodos", "id, proveedor_key, nombre, estado, cerrado_en"),
    todo<any>(
      "mk_periodo_documentos",
      "periodo_id, proveedor_key, tipo, documento_id",
    ),
  ]);

  const facturas = facturasTodas.filter((f) => !f.anulado_en);
  const proyectos = proyectosTodos.filter((p) => !p.anulado_en);
  const proyectosVivos = new Set(proyectos.map((p) => String(p.id)));
  const proyectosMultifashion = new Set(
    proyectos.filter((p) => esMultifashion(p)).map((p) => String(p.id)),
  );

  const base = {
    facturas,
    facturaMarcas,
    entregas,
    marcas,
    proyectos,
    proyectosMultifashion,
    adjuntos,
  };

  // --- ANTES (a): el módulo que dibuja la pantalla de hoy -------------------
  const hoy = agregarResumenInicio({
    facturas,
    facturaMarcas,
    entregas,
    marcas,
    proyectosVivos,
    proyectosMultifashion,
  });

  // --- DESPUÉS (1): con los sellos REALES de hoy (clave vieja) --------------
  const conSellos = agregarPorBloques({ ...base, periodos, sellos });
  // --- DESPUÉS (2): sin ninguna tabla de período (fallback legacy) ----------
  const sinTablas = agregarPorBloques(base);

  const bl = (r: typeof conSellos, k: string) => r.bloques.find((b) => b.key === k);

  console.log("═══ BLOQUES POR MARCA (con los sellos de hoy) ═══");
  for (const b of conSellos.bloques) {
    console.log(
      `  ${b.nombre.padEnd(20)} facturas ${money(b.facturas.total).padStart(12)} (${String(
        b.facturas.count,
      ).padStart(2)}) · muebles ${money(b.muebles.total).padStart(12)} (${String(
        b.muebles.count,
      ).padStart(2)}) · TOTAL ${money(b.total).padStart(12)} · ${b.proyectos} proy` +
        `  [período: ${b.periodoAbierto ? b.periodoAbierto.nombre : "—"}]`,
    );
  }

  console.log("\n═══ PERÍODOS CERRADOS (partidos por marca) ═══");
  for (const c of conSellos.cerrados) {
    console.log(
      `  ${c.bloqueNombre.padEnd(20)} · ${String(c.nombre).padEnd(16)} · ${money(
        c.total,
      ).padStart(12)}  (facturas ${c.facturas.count}, muebles ${c.muebles.count})`,
    );
  }

  console.log("\n═══ CUADRE 1 — las 6 cifras de control del 11-ago-2026 ═══");
  const th = bl(conSellos, "TH")!;
  const ck = bl(conSellos, "CK")!;
  const kl = bl(conSellos, "KL")!;
  const rbk = bl(conSellos, "RBK")!;
  const j = bl(conSellos, "J")!;
  const mf = bl(conSellos, "multifashion")!;

  cmp(
    "abierto TH+CK+KL = 92.825,00",
    th.total + ck.total + kl.total,
    CONTROL.abiertoGrupoPvh,
  );
  const cerradoTotal = conSellos.cerrados.reduce((s, c) => s + c.total, 0);
  cmp("cerrado «mid 2026» = 62.381,57", cerradoTotal, CONTROL.cerradoMid2026);
  cmpN(
    "cerrado: 59 facturas (suma de las marcas)",
    conSellos.cerrados.reduce((s, c) => s + c.facturas.count, 0),
    CONTROL.cerradoFacturas,
  );
  cmp("Joybees = 1.540,00", j.total, CONTROL.joybees);
  cmp("Reebok = 0,00", rbk.total, 0);
  cmp("Multifashion = 8.061,63", mf.total, CONTROL.multifashion);
  cmp("TITULAR = 102.426,63", conSellos.resumen.total, CONTROL.totalTitular);

  const mobiliario = entregas.reduce(
    (s, e) =>
      s + (e.proyecto_id && proyectosVivos.has(String(e.proyecto_id)) ? Number(e.total ?? 0) : 0),
    0,
  );
  cmp("mobiliario = 71.765,00", mobiliario, CONTROL.mobiliario);

  console.log("\n═══ CUADRE 2 — por marca, ABIERTO + CERRADO ═══");
  const cerradoDe = (k: string) =>
    conSellos.cerrados.filter((c) => c.bloqueKey === k).reduce((s, c) => s + c.total, 0);
  for (const [codigo, esperado] of Object.entries(CONTROL.porMarcaAbiertoMasCerrado)) {
    const b = bl(conSellos, codigo)!;
    cmp(`${b.nombre} (abierto+cerrado)`, b.total + cerradoDe(codigo), esperado);
  }

  console.log("\n═══ CUADRE 3 — DESPUÉS = DESPUÉS sin la DDL (degradación) ═══");
  for (const m of MARCAS_BLOQUE) {
    const a = bl(conSellos, m.key)!;
    const b = bl(sinTablas, m.key)!;
    cmp(`${m.nombreFallback}: con sellos vs sin tablas`, a.total, b.total);
  }
  cmp(
    "titular: con sellos vs sin tablas",
    conSellos.resumen.total,
    sinTablas.resumen.total,
  );
  cmp(
    "cerrado: con sellos vs sin tablas",
    cerradoTotal,
    sinTablas.cerrados.reduce((s, c) => s + c.total, 0),
  );

  console.log("\n═══ CUADRE 4 — contra la pantalla de HOY (agregarResumenInicio) ═══");
  const idx = indiceBloquePorMarcaId(marcas);
  const hoyPorBloque = new Map<string, number>();
  for (const [mid, b] of Object.entries(hoy.porMarca)) {
    const k = idx.get(mid)!;
    hoyPorBloque.set(k, (hoyPorBloque.get(k) ?? 0) + b.total);
  }
  for (const [mid, b] of Object.entries(hoy.mueblesPorMarca)) {
    const k = idx.get(mid)!;
    hoyPorBloque.set(k, (hoyPorBloque.get(k) ?? 0) + b.total);
  }
  for (const m of MARCAS_BLOQUE) {
    cmp(
      `${m.nombreFallback}: nuevo vs pantalla de hoy`,
      bl(conSellos, m.key)!.total,
      hoyPorBloque.get(m.key) ?? 0,
    );
  }
  cmp("Multifashion: nuevo vs hoy", mf.total, hoy.multifashion.total + hoy.multifashion.muebles);
  cmp("cerrado: nuevo vs «legacy» de hoy", cerradoTotal, hoy.legacy.total);

  console.log("\n═══ CUADRE 5 — las dos desagregaciones suman el titular ═══");
  cmp(
    "Σ por cliente",
    conSellos.porCliente.reduce((s, f) => s + f.total, 0),
    conSellos.resumen.total,
  );
  cmp(
    "Σ por marca",
    Object.values(conSellos.porMarca).reduce((s, v) => s + v, 0),
    conSellos.resumen.total,
  );

  console.log("\n═══ AVISOS — sin comprobante / sin foto (período abierto) ═══");
  for (const b of conSellos.bloques) {
    console.log(
      `  ${b.nombre.padEnd(20)} facturas abiertas ${String(b.facturas.count).padStart(
        3,
      )} · sin comprobante ${String(b.sinComprobante).padStart(3)} · sin foto ${String(
        b.sinFoto,
      ).padStart(3)}`,
    );
  }

  console.log(
    `\n${fallos === 0 ? "🟢 TODO CUADRA — 0 diferencias" : `🔴 ${fallos} DIFERENCIAS`}`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
