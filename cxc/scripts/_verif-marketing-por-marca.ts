// ============================================================================
// SOLO LECTURA — corre el agregador REAL (`resumen-bloques.ts`) contra las filas
// de PRODUCCIÓN y compara ANTES vs DESPUÉS del corte por marca.
//
// Las dos referencias:
//   (a) `agregarResumenInicio` — el módulo que dibujaba la pantalla vieja (sin
//       períodos). Sigue siendo la referencia de "cuánto tiene cada marca en
//       total": los sellos mueven plata de cajón, nunca la crean ni la borran.
//   (b) las cifras de control re-medidas el 12-ago-2026 (tras el movimiento de
//       lo ya reportado — ver el comentario de CONTROL), escritas a mano acá.
//
// ⚠️ Desde el 12-ago-2026, "con sellos" y "sin tablas" ya NO dan idéntico por
// marca — y es correcto que no den: los sellos mueven gasto no-legacy al
// cerrado, cosa que el fallback `grupo_legacy` no puede saber. Lo que SÍ tiene
// que dar idéntico en los dos modos es el GLOBAL (ver CUADRE 3).
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

// --- Las cifras de control, re-medidas contra producción el 12-ago-2026 -----
//
// ⚠️ RE-MEDIDAS el 12-ago-2026 POR LA TARDE, tras los movimientos REALES de
// Daniel en Apertura · Nova Lux: entrega #24 NUEVA de $2.470 (TH) + entrega
// #22 EDITADA de $1.040 → $2.600 (CK). Los dos van al período ABIERTO, así
// que el delta (+$4.030) mueve abiertos/titular/mobiliario/global y el
// por-marca abierto+cerrado de TH (+2.470) y CK (+1.560). Los CERRADOS no se
// tocaron: mid 2026 sigue en $140.566,57 y el legacy intacto.
//
// ⚠️ ACTUALIZADAS ANTES por el MOVIMIENTO del 12-ago-2026 (aprobado por Daniel, ver
// `scripts/_mover-reportado-mid2026.ts`): todo el gasto que él YA había
// reportado a las marcas por fuera del sistema se selló al período CERRADO
// "mid 2026" ('pvh') — la factura Kheridinne de TH ($9.000), las 10 entregas
// de TH ($40.565) y las 10 de CK ($28.620). Abierto quedó SOLO lo nuevo: los
// 17 pagos de impulsadora (TH $8.800 · CK $4.800) y la entrega de Nova Lux
// (CK $1.040).
//
// 🔴 JOYBEES NO SE CIERRA — Daniel, textual: "cuando te dije cerrarlo?". Su
// única entrega ($1.540) sigue en su período ABIERTO. (Ese día se le había
// creado un cerrado por error de interpretación; se revirtió el mismo día con
// `_revertir-cierre-joybees.ts` y quedó como estaba.)
//
// 🔑 POR QUÉ EL GLOBAL NO CAMBIÓ NI UN CENTAVO: no se creó ni se borró ningún
// documento — solo cambió el CAJÓN (el sello de período). Por eso
// abiertos+cerrados sigue dando $164.808,20 exacto, el titular de abiertos
// bajó exactamente lo que los cerrados subieron, y el total por marca
// (abierto+cerrado) quedó idéntico marca por marca.
const CONTROL = {
  // TH $11.270 (fact 8.800 + mueble 2.470) + CK $7.400 (fact 4.800 + mueble
  // 2.600) + KL $0, períodos abiertos.
  abiertoGrupoPvh: 18670.0,
  cerradoMid2026: 140566.57, // TH 94.104,43 + CK 46.462,14 — SOLO esos dos chips
  cerradoFacturas: 60, // 59 legacy + Kheridinne (TH $9.000) movida el 12-ago
  legacy: { count: 59, total: 62381.57 }, // el archivo original, INTACTO
  joybees: 1540.0, // ABIERTO — Joybees no se cierra
  multifashion: 8061.63,
  totalTitular: 28271.63, // TH 11.270 + CK 7.400 + J 1.540 + Multifashion 8.061,63
  mobiliario: 75795.0, // 71.765 + entrega #24 ($2.470) + edición #22 (+$1.560)
  globalAbiertosMasCerrados: 168838.2, // 164.808,20 + $4.030 de gasto NUEVO
  porMarcaAbiertoMasCerrado: {
    TH: 105374.43, // 102.904,43 + 2.470 (entrega #24)
    CK: 53862.14, // 52.302,14 + 1.560 (edición de la #22)
    KL: 0,
    RBK: 0,
    J: 1540.0,
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

  console.log("\n═══ CUADRE 1 — las cifras de control del 12-ago-2026 ═══");
  const th = bl(conSellos, "TH")!;
  const ck = bl(conSellos, "CK")!;
  const kl = bl(conSellos, "KL")!;
  const rbk = bl(conSellos, "RBK")!;
  const j = bl(conSellos, "J")!;
  const mf = bl(conSellos, "multifashion")!;

  cmp(
    "abierto TH+CK+KL = 18.670,00",
    th.total + ck.total + kl.total,
    CONTROL.abiertoGrupoPvh,
  );
  const cerradoTotal = conSellos.cerrados.reduce((s, c) => s + c.total, 0);
  cmp("cerrados «mid 2026» = 140.566,57", cerradoTotal, CONTROL.cerradoMid2026);
  cmpN(
    "cerrado: 60 facturas (suma de las marcas)",
    conSellos.cerrados.reduce((s, c) => s + c.facturas.count, 0),
    CONTROL.cerradoFacturas,
  );
  cmp("Joybees ABIERTO = 1.540,00 (no se cierra)", j.total, CONTROL.joybees);
  cmp("Reebok = 0,00", rbk.total, 0);
  cmp("Multifashion = 8.061,63", mf.total, CONTROL.multifashion);
  cmp("TITULAR (abiertos) = 28.271,63", conSellos.resumen.total, CONTROL.totalTitular);
  // El número que el movimiento del 12-ago NO podía mover: la plata solo
  // cambió de cajón, así que abiertos + cerrados da lo mismo que antes.
  cmp(
    "GLOBAL abiertos+cerrados = 168.838,20",
    conSellos.resumen.total + cerradoTotal,
    CONTROL.globalAbiertosMasCerrados,
  );

  const mobiliario = entregas.reduce(
    (s, e) =>
      s + (e.proyecto_id && proyectosVivos.has(String(e.proyecto_id)) ? Number(e.total ?? 0) : 0),
    0,
  );
  cmp("mobiliario = 75.795,00", mobiliario, CONTROL.mobiliario);

  console.log("\n═══ CUADRE 2 — por marca, ABIERTO + CERRADO ═══");
  const cerradoDe = (k: string) =>
    conSellos.cerrados.filter((c) => c.bloqueKey === k).reduce((s, c) => s + c.total, 0);
  for (const [codigo, esperado] of Object.entries(CONTROL.porMarcaAbiertoMasCerrado)) {
    const b = bl(conSellos, codigo)!;
    cmp(`${b.nombre} (abierto+cerrado)`, b.total + cerradoDe(codigo), esperado);
  }

  // hoyPorBloque = lo que la vieja pantalla (sin períodos) atribuye a cada
  // marca: facturas no-legacy + muebles. Lo usan los cuadres 3 y 4.
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

  // ⚠️ CUADRE 3 CAMBIÓ DE SIGNIFICADO el 12-ago-2026. Antes exigía
  // "con sellos == sin tablas": era cierto solo mientras los sellos calcaban
  // a `grupo_legacy`. El movimiento del 12-ago selló A PROPÓSITO documentos
  // no-legacy al cerrado, así que la degradación sin tablas ya NO puede dar
  // lo mismo — sin tablas, todo lo no-legacy se lee como "abierto" (la
  // pantalla vieja) y el único cerrado es el archivo legacy. Eso es lo que
  // se verifica ahora. El GLOBAL sí tiene que dar idéntico en los dos modos:
  // ninguna tabla de períodos crea ni borra plata.
  console.log("\n═══ CUADRE 3 — degradación sin la DDL (semántica post-12-ago) ═══");
  for (const m of MARCAS_BLOQUE) {
    const b = bl(sinTablas, m.key)!;
    cmp(
      `${m.nombreFallback}: sin tablas = pantalla de hoy`,
      b.total,
      hoyPorBloque.get(m.key) ?? 0,
    );
  }
  cmp(
    "cerrado sin tablas = archivo legacy (62.381,57)",
    sinTablas.cerrados.reduce((s, c) => s + c.total, 0),
    CONTROL.legacy.total,
  );
  cmp(
    "GLOBAL: con sellos = sin tablas",
    conSellos.resumen.total + cerradoTotal,
    sinTablas.resumen.total + sinTablas.cerrados.reduce((s, c) => s + c.total, 0),
  );

  console.log("\n═══ CUADRE 4 — contra la pantalla de HOY (agregarResumenInicio) ═══");
  // Por marca ya no se puede exigir "abierto == pantalla de hoy" (los sellos
  // movieron gasto no-legacy al cerrado). La identidad que SÍ tiene que dar:
  // lo de la marca ENTRE abierto y cerrado == pantalla de hoy + su parte del
  // archivo legacy. La parte legacy por marca no la expone `hoy` (es un solo
  // bucket), así que se verifica la suma de todas las marcas.
  const cerradoDeMarca = (k: string) =>
    conSellos.cerrados.filter((c) => c.bloqueKey === k).reduce((s, c) => s + c.total, 0);
  const marcasAbiertoMasCerrado = MARCAS_BLOQUE.reduce(
    (s, m) => s + bl(conSellos, m.key)!.total + cerradoDeMarca(m.key),
    0,
  );
  const hoyMarcasMasLegacy =
    [...hoyPorBloque.values()].reduce((s, v) => s + v, 0) + hoy.legacy.total;
  cmp("Σ marcas (abierto+cerrado) = hoy + legacy", marcasAbiertoMasCerrado, hoyMarcasMasLegacy);
  cmp("Multifashion: nuevo vs hoy", mf.total, hoy.multifashion.total + hoy.multifashion.muebles);
  cmp("archivo legacy intacto = 62.381,57", hoy.legacy.total, CONTROL.legacy.total);
  cmpN("archivo legacy intacto: 59 facturas", hoy.legacy.count, CONTROL.legacy.count);

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
