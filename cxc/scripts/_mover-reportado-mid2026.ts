// ============================================================================
// MOVIMIENTO 12-ago-2026 (aprobado por Daniel): todo el gasto de Marketing que
// él YA reportó a las marcas por fuera del sistema se sella al período CERRADO
// "mid 2026", dejando ABIERTO solo lo nuevo (Nova Lux + impulsadoras).
//
// Qué mueve, exactamente (medido contra producción antes de escribir):
//   · TH → cerrado "mid 2026" (fila 'pvh'): su ÚNICA factura viva no-legacy
//     no-impulsadora de proyectos NO-Multifashion (Kheridinne, $9.000) + sus
//     10 entregas de mobiliario ($40.565).
//   · CK → el mismo cerrado: 0 facturas (todas las suyas abiertas son pagos de
//     impulsadora) + 10 entregas ($28.620 = todas MENOS la de Nova Lux,
//     $1.040, que es gasto NUEVO y queda abierta).
//   · 🔴 J (JOYBEES) NO SE TOCA. Daniel, textual: "cuando te dije cerrarlo?" —
//     cerrar Joybees fue una deducción del encargo, no una orden. Su única
//     entrega ($1.540, La Frontera Duty Free) SE QUEDA en su período ABIERTO.
//     (La primera corrida del 12-ago sí la había cerrado; se revirtió con
//     `_revertir-cierre-joybees.ts` y este script quedó corregido.)
//   · QUEDAN ABIERTOS: los 17 pagos de impulsadora (TH $8.800 · CK $4.800),
//     la entrega de Nova Lux (CK $1.040) y la entrega de Joybees ($1.540).
//     Daniel, textual: "lo que tengo abierto hoy en dia son los gastos de
//     nova lux e impulsadoras. y anteriormente nunca hice impulsadoras ni
//     nova lux" — gasto NUEVO, nunca reportado, así que NO se sella al
//     cerrado.
//
// CÓMO decide qué es qué: con las MISMAS libs de la app (`esMultifashion`,
// `marcasDeEntrega`/`porcionEntregaParaMarca`, y la simulación corre
// `agregarPorBloques` — el clasificador real). Nada de filtros a mano que se
// desvíen de lo que la pantalla dibuja.
//
// ⚠️ NUNCA toca montos: solo sellos (`mk_periodo_documentos`) y la fila nueva
// del período de J. El TOTAL GLOBAL del módulo (abiertos + cerrados) tiene que
// dar IDÉNTICO antes y después — el script lo verifica y aborta si no.
//
// Uso (dry-run por defecto; guarda plan + respaldo completo y NO escribe):
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/_mover-reportado-mid2026.ts
// Ejecutar de verdad (vuelve a medir todo; aborta ante CUALQUIER diferencia):
//   ... scripts/_mover-reportado-mid2026.ts --ejecutar
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { esMultifashion } from "../src/lib/marketing/multifashion";
import {
  agregarPorBloques,
  type PeriodoRow,
  type SelloRow,
} from "../src/lib/marketing/resumen-bloques";
import {
  marcasDeEntrega,
  porcionEntregaParaMarca,
} from "../src/lib/marketing/resumen-inicio";
import { clavesDeSello } from "../src/lib/marketing/bloques";

const EJECUTAR = process.argv.includes("--ejecutar");
const RESPALDO_DIR =
  process.env.RESPALDO_DIR ?? "/Users/daniellevy/.claude/jobs/5b66fe8c/tmp";

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
const eq = (a: number, b: number) => Math.abs(a - b) < 0.005;

// --- Lo que se ESPERA mover. Si la base no dice EXACTO esto, se aborta. -----
const ESPERADO = {
  TH: { facturas: { n: 1, total: 9000 }, entregas: { n: 10, total: 40565 } },
  CK: { facturas: { n: 0, total: 0 }, entregas: { n: 10, total: 28620 } },
  novaLuxCK: { n: 1, total: 1040 }, // la ÚNICA entrega CK que se queda abierta
  jQuedaAbierta: { n: 1, total: 1540 }, // Joybees NO se cierra (orden de Daniel)
  despues: {
    // Solo lo NUEVO queda abierto: impulsadoras (TH $8.800 · CK $4.800), la
    // entrega de Nova Lux (CK $1.040) y la de Joybees ($1.540, que no se toca).
    abiertos: { TH: 8800, CK: 5840, KL: 0, RBK: 0, J: 1540 },
    // Cerrado viejo $62.381,57 (TH 44.539,43 · CK 17.842,14) + lo que se mueve:
    // TH +9.000 +40.565 → 94.104,43 · CK +28.620 → 46.462,14. SOLO esos dos.
    cerrados: { TH: 94104.43, CK: 46462.14 },
  },
};

async function todo<T>(t: string, sel: string): Promise<T[]> {
  const { data, error } = await sb.from(t).select(sel).range(0, 9999);
  if (error) throw new Error(`${t}: ${error.message}`);
  const filas = (data ?? []) as T[];
  if (filas.length >= 10000) throw new Error(`${t}: posible truncado (${filas.length})`);
  return filas;
}

interface Accion {
  op: "update" | "insert" | "ya-esta";
  tipo: "factura" | "entrega";
  documento_id: string;
  marca: string; // código de marca del candidato
  /** proveedor_key de la fila de sello que se toca/crea. */
  proveedor_key: string;
  desde: string; // nombre del período de origen, o "(SIN SELLO)"
  hacia: "cerrado-pvh";
  monto: number;
  detalle: string; // cliente / descripción para leer el plan
}

async function main() {
  console.log(`═══ MOVER GASTO YA REPORTADO → "mid 2026" · ${EJECUTAR ? "🔴 EJECUTAR" : "dry-run"} ═══\n`);

  const [facturasTodas, facturaMarcas, proyectosTodos, marcas, entregas, adjuntos, periodos, sellos] =
    await Promise.all([
      todo<any>("mk_facturas", "id, proyecto_id, total, grupo_legacy, impulsadora_id, anulado_en"),
      todo<any>("mk_factura_marcas", "factura_id, marca_id, porcentaje"),
      todo<any>("mk_proyectos", "id, tienda, tienda_codigo, anulado_en"),
      todo<any>("mk_marcas", "id, nombre, codigo, empresa_codigo"),
      todo<any>("mk_entregas_muebles", "id, proyecto_id, total, total_por_marca, total_por_empresa_interna"),
      todo<any>("mk_adjuntos", "tipo, factura_id, proyecto_id"),
      todo<any>("mk_periodos", "id, proveedor_key, nombre, estado, cerrado_en, cerrado_por, abierto_en"),
      todo<any>("mk_periodo_documentos", "periodo_id, proveedor_key, tipo, documento_id"),
    ]);

  // --- Respaldo COMPLETO antes de cualquier otra cosa ---
  mkdirSync(RESPALDO_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const respaldoPath = join(RESPALDO_DIR, `mover-respaldo-periodos-y-sellos-${stamp}.json`);
  writeFileSync(respaldoPath, JSON.stringify({ tomado_en: new Date().toISOString(), mk_periodos: periodos, mk_periodo_documentos: sellos }, null, 2));
  console.log(`💾 Respaldo de mk_periodos (${periodos.length}) + mk_periodo_documentos (${sellos.length}) → ${respaldoPath}\n`);

  const facturas = facturasTodas.filter((f) => !f.anulado_en);
  const proyectos = proyectosTodos.filter((p) => !p.anulado_en);
  const proyById = new Map(proyectos.map((p) => [String(p.id), p]));
  const proyectosMultifashion = new Set(
    proyectos.filter((p) => esMultifashion(p)).map((p) => String(p.id)),
  );
  const esMf = (pid: string | null | undefined) =>
    !!pid && proyectosMultifashion.has(String(pid));

  const codigoDeMarca = new Map(
    marcas.map((m) => [String(m.id), String(m.codigo ?? "").trim().toUpperCase()]),
  );
  const empresaDeMarca = new Map(marcas.map((m) => [String(m.id), m.empresa_codigo ?? null]));

  // --- Períodos: el cerrado 'pvh' y los abiertos ---
  const cerradosPvh = periodos.filter((p) => p.estado === "cerrado" && p.proveedor_key === "pvh");
  if (cerradosPvh.length !== 1) {
    throw new Error(`Esperaba UN cerrado 'pvh' y hay ${cerradosPvh.length} — PARAR`);
  }
  const cerradoPvh = cerradosPvh[0];
  const otrosCerrados = periodos.filter((p) => p.estado === "cerrado" && p.proveedor_key !== "pvh");
  const abiertos = periodos.filter((p) => p.estado === "abierto");
  console.log(`Cerrado destino: "${cerradoPvh.nombre}" (${cerradoPvh.id}) · cerrado_en ${cerradoPvh.cerrado_en} · cerrado_por ${cerradoPvh.cerrado_por ?? "—"}`);
  console.log(`Abiertos: ${abiertos.map((p) => `${p.proveedor_key}="${p.nombre}"`).join(" · ")}`);
  if (otrosCerrados.length > 0) {
    // El ÚNICO cerrado del sistema es el 'pvh'. Joybees NO se cierra.
    throw new Error(`Hay cerrados inesperados: ${otrosCerrados.map((p) => p.proveedor_key).join(",")} — PARAR`);
  }
  console.log("");

  const periodoById = new Map(periodos.map((p) => [String(p.id), p]));
  const selloPorLlave = new Map<string, any>();
  for (const s of sellos) {
    selloPorLlave.set(`${s.tipo}::${String(s.documento_id)}::${String(s.proveedor_key)}`, s);
  }

  // --- Nova Lux: la excepción que se queda abierta ---
  const proyectosNovaLux = proyectos.filter((p) => /nova\s*lux/i.test(String(p.tienda ?? "")));
  console.log(`Nova Lux → ${proyectosNovaLux.length} proyecto(s): ${proyectosNovaLux.map((p) => `"${p.tienda}" (${p.id})`).join(", ") || "NINGUNO ⚠️"}`);
  const esNovaLux = (pid: string | null | undefined) =>
    !!pid && proyectosNovaLux.some((p) => String(p.id) === String(pid));

  // --- Candidatos: FACTURAS (TH/CK, vivas, no-legacy, no-impulsadora, no-MF) --
  const rowsByFactura = new Map<string, any[]>();
  for (const r of facturaMarcas) {
    const fid = String(r.factura_id);
    const arr = rowsByFactura.get(fid) ?? [];
    arr.push(r);
    rowsByFactura.set(fid, arr);
  }

  type Cand = { tipo: "factura" | "entrega"; docId: string; marca: string; monto: number; detalle: string };
  const candidatos: Cand[] = [];
  const num = (x: unknown) => (Number.isFinite(Number(x ?? 0)) ? Number(x ?? 0) : 0);

  for (const f of facturas) {
    if (f.impulsadora_id) continue; // impulsadoras SE QUEDAN abiertas
    if (f.grupo_legacy) continue; // las 59 legacy ya están selladas al cerrado
    if (esMf(f.proyecto_id)) continue; // Multifashion no se sella JAMÁS
    const rows = rowsByFactura.get(String(f.id)) ?? [];
    if (rows.length === 0) continue;
    const sumPct = rows.reduce((s: number, x: any) => s + num(x.porcentaje), 0) || 1;
    const porMarcaDoc = new Map<string, number>();
    for (const r of rows) {
      const cod = codigoDeMarca.get(String(r.marca_id)) ?? "";
      if (cod !== "TH" && cod !== "CK") {
        if (cod === "KL" || cod === "RBK" || cod === "J") {
          throw new Error(`Factura ${f.id} tiene marca ${cod} — fuera del plan, PARAR`);
        }
        continue;
      }
      porMarcaDoc.set(cod, (porMarcaDoc.get(cod) ?? 0) + num(f.total) * (num(r.porcentaje) / sumPct));
    }
    for (const [cod, monto] of porMarcaDoc) {
      const p = f.proyecto_id ? proyById.get(String(f.proyecto_id)) : null;
      if (esNovaLux(f.proyecto_id)) {
        throw new Error(`Factura ${f.id} (${cod}, ${money(monto)}) es de NOVA LUX — el plan no esperaba facturas de Nova Lux, PARAR`);
      }
      candidatos.push({
        tipo: "factura", docId: String(f.id), marca: cod, monto,
        detalle: p ? String(p.tienda ?? "") : "(sin proyecto)",
      });
    }
  }

  // --- Candidatos: ENTREGAS (proyecto vivo, no-MF) ---------------------------
  // Quedan AFUERA (y abiertas): la de Nova Lux (CK, gasto nuevo) y la de
  // Joybees — Daniel: "cuando te dije cerrarlo?". J no se toca.
  const novaLuxExcluidas: Cand[] = [];
  const jQuedanAbiertas: Cand[] = [];
  for (const e of entregas) {
    const pid = e.proyecto_id ? String(e.proyecto_id) : null;
    if (!pid || !proyById.has(pid)) continue; // igual que la pantalla
    if (esMf(pid)) continue;
    for (const mid of marcasDeEntrega(e)) {
      const cod = codigoDeMarca.get(String(mid)) ?? "";
      const monto = porcionEntregaParaMarca(e, mid, empresaDeMarca.get(String(mid)));
      if (monto <= 0) continue;
      if (cod === "KL" || cod === "RBK") {
        throw new Error(`Entrega ${e.id} tiene marca ${cod} — fuera del plan, PARAR`);
      }
      if (cod !== "TH" && cod !== "CK" && cod !== "J") continue;
      const cand: Cand = {
        tipo: "entrega", docId: String(e.id), marca: cod, monto,
        detalle: String(proyById.get(pid)?.tienda ?? ""),
      };
      if (cod === "J") {
        jQuedanAbiertas.push(cand); // Joybees NO se cierra
        continue;
      }
      if (cod === "CK" && esNovaLux(pid)) {
        novaLuxExcluidas.push(cand); // gasto NUEVO: se queda abierta
        continue;
      }
      candidatos.push(cand);
    }
  }

  // --- Cuadre del plan contra lo esperado (número por número) ----------------
  const grupo = (tipo: string, marca: string) => candidatos.filter((c) => c.tipo === tipo && c.marca === marca);
  const suma = (cs: Cand[]) => cs.reduce((s, c) => s + c.monto, 0);
  let fallos = 0;
  const check = (nombre: string, cs: Cand[], esp: { n: number; total: number }) => {
    const ok = cs.length === esp.n && eq(suma(cs), esp.total);
    if (!ok) fallos++;
    console.log(`  ${ok ? "✅" : "❌"} ${nombre.padEnd(24)} ${String(cs.length).padStart(2)} docs · ${money(suma(cs)).padStart(12)}   esperado ${esp.n} · ${money(esp.total)}`);
  };
  console.log("\n═══ PLAN vs ESPERADO ═══");
  check("TH facturas", grupo("factura", "TH"), ESPERADO.TH.facturas);
  check("TH entregas", grupo("entrega", "TH"), ESPERADO.TH.entregas);
  check("CK facturas", grupo("factura", "CK"), ESPERADO.CK.facturas);
  check("CK entregas", grupo("entrega", "CK"), ESPERADO.CK.entregas);
  const checkQueda = (nombre: string, cs: Cand[], esp: { n: number; total: number }) => {
    const ok = cs.length === esp.n && eq(suma(cs), esp.total);
    if (!ok) fallos++;
    console.log(`  ${ok ? "✅" : "❌"} ${nombre.padEnd(24)} ${String(cs.length).padStart(2)} docs · ${money(suma(cs)).padStart(12)}   esperado ${esp.n} · ${money(esp.total)}`);
  };
  checkQueda("Nova Lux (QUEDA abierta)", novaLuxExcluidas, ESPERADO.novaLuxCK);
  checkQueda("Joybees (NO se toca)", jQuedanAbiertas, ESPERADO.jQuedaAbierta);

  // --- Cada candidato → acción concreta sobre mk_periodo_documentos ----------
  const acciones: Accion[] = [];
  for (const c of candidatos) {
    const hacia = "cerrado-pvh" as const;
    const targetId = String(cerradoPvh.id);
    let resuelto = false;
    for (const clave of clavesDeSello(c.marca)) {
      const s = selloPorLlave.get(`${c.tipo}::${c.docId}::${clave}`);
      if (!s) continue;
      const per = periodoById.get(String(s.periodo_id));
      const nombrePer = per ? `${per.proveedor_key}·"${per.nombre}"·${per.estado}` : `(período ${s.periodo_id} DESCONOCIDO)`;
      if (String(s.periodo_id) === targetId) {
        acciones.push({ op: "ya-esta", tipo: c.tipo, documento_id: c.docId, marca: c.marca, proveedor_key: clave, desde: nombrePer, hacia, monto: c.monto, detalle: c.detalle });
      } else if (per && per.estado === "cerrado") {
        throw new Error(`${c.tipo} ${c.docId} (${c.marca}) ya está sellada a OTRO cerrado (${nombrePer}) — PARAR`);
      } else {
        acciones.push({ op: "update", tipo: c.tipo, documento_id: c.docId, marca: c.marca, proveedor_key: clave, desde: nombrePer, hacia, monto: c.monto, detalle: c.detalle });
      }
      resuelto = true;
      break;
    }
    if (!resuelto) {
      acciones.push({ op: "insert", tipo: c.tipo, documento_id: c.docId, marca: c.marca, proveedor_key: c.marca, desde: "(SIN SELLO)", hacia, monto: c.monto, detalle: c.detalle });
    }
  }

  console.log("\n═══ ACCIONES (documento por documento) ═══");
  for (const a of acciones) {
    console.log(`  ${a.op.toUpperCase().padEnd(8)} ${a.tipo.padEnd(8)} ${a.marca.padEnd(3)} ${money(a.monto).padStart(11)}  ${a.desde.padEnd(28)} → ${a.hacia}  · ${a.detalle}  [${a.documento_id}]`);
  }
  const nUpd = acciones.filter((a) => a.op === "update").length;
  const nIns = acciones.filter((a) => a.op === "insert").length;
  const nYa = acciones.filter((a) => a.op === "ya-esta").length;
  console.log(`  → ${nUpd} updates · ${nIns} inserts · ${nYa} ya estaban`);

  // --- SIMULACIÓN con el clasificador REAL (agregarPorBloques) ---------------
  const base = {
    facturas, facturaMarcas, entregas, marcas, proyectos, proyectosMultifashion, adjuntos,
  };
  const antes = agregarPorBloques({ ...base, periodos: periodos as PeriodoRow[], sellos: sellos as SelloRow[] });

  const periodosSim: PeriodoRow[] = periodos as PeriodoRow[];
  const sellosSim: SelloRow[] = sellos.map((s: any) => ({ ...s }));
  const idxSim = new Map(sellosSim.map((s) => [`${s.tipo}::${String(s.documento_id)}::${String(s.proveedor_key)}`, s]));
  for (const a of acciones) {
    const target = String(cerradoPvh.id);
    if (a.op === "update") {
      const s = idxSim.get(`${a.tipo}::${a.documento_id}::${a.proveedor_key}`);
      if (!s) throw new Error(`simulación: no encuentro el sello a actualizar de ${a.documento_id}`);
      s.periodo_id = target;
    } else if (a.op === "insert") {
      const nuevo: SelloRow = { periodo_id: target, proveedor_key: a.proveedor_key, tipo: a.tipo, documento_id: a.documento_id };
      sellosSim.push(nuevo);
      idxSim.set(`${a.tipo}::${a.documento_id}::${a.proveedor_key}`, nuevo);
    }
  }
  const despues = agregarPorBloques({ ...base, periodos: periodosSim, sellos: sellosSim });

  const cmp = (etq: string, real: number, esp: number) => {
    const ok = eq(real, esp);
    if (!ok) fallos++;
    console.log(`  ${ok ? "✅" : "❌"} ${etq.padEnd(38)} ${money(real).padStart(13)}  esperado ${money(esp).padStart(13)}  dif ${money(real - esp)}`);
  };
  const bl = (r: typeof despues, k: string) => r.bloques.find((b) => b.key === k)!;
  const cerradoDe = (r: typeof despues, k: string) =>
    r.cerrados.filter((c) => c.bloqueKey === k).reduce((s, c) => s + c.total, 0);

  console.log("\n═══ SIMULACIÓN — bloques ABIERTOS después ═══");
  for (const [k, esp] of Object.entries(ESPERADO.despues.abiertos)) cmp(`abierto ${k}`, bl(despues, k).total, esp);
  console.log("═══ SIMULACIÓN — chips CERRADOS después ═══");
  for (const [k, esp] of Object.entries(ESPERADO.despues.cerrados)) cmp(`cerrado ${k} · mid 2026`, cerradoDe(despues, k), esp);

  const globalDe = (r: typeof despues) =>
    r.bloques.reduce((s, b) => s + b.total, 0) + r.cerrados.reduce((s, c) => s + c.total, 0);
  console.log("═══ EL TOTAL GLOBAL NO SE MUEVE NI UN CENTAVO ═══");
  cmp("global (abiertos+cerrados) después", globalDe(despues), globalDe(antes));
  console.log(`  (antes: titular abiertos ${money(antes.resumen.total)} · cerrados ${money(antes.cerrados.reduce((s, c) => s + c.total, 0))})`);
  console.log(`  (después: titular abiertos ${money(despues.resumen.total)} · cerrados ${money(despues.cerrados.reduce((s, c) => s + c.total, 0))})`);
  // Y por marca: lo que la marca tiene ENTRE abierto y cerrado no cambia.
  for (const k of ["TH", "CK", "KL", "RBK", "J", "multifashion"]) {
    cmp(`  ${k}: abierto+cerrado sin cambio`, bl(despues, k).total + cerradoDe(despues, k), bl(antes, k).total + cerradoDe(antes, k));
  }

  // --- Guardar el plan ---
  const planPath = join(RESPALDO_DIR, `mover-plan-${stamp}.json`);
  writeFileSync(planPath, JSON.stringify({
    generado_en: new Date().toISOString(),
    ejecutar: EJECUTAR,
    cerrado_pvh: cerradoPvh,
    nova_lux_excluidas: novaLuxExcluidas,
    j_quedan_abiertas: jQuedanAbiertas,
    acciones,
    esperado: ESPERADO,
    simulacion: {
      abiertos_despues: despues.bloques.map((b) => ({ key: b.key, total: b.total })),
      cerrados_despues: despues.cerrados.map((c) => ({ bloque: c.bloqueKey, nombre: c.nombre, total: c.total })),
    },
  }, null, 2));
  console.log(`\n📝 Plan guardado → ${planPath}`);

  if (fallos > 0) {
    console.log(`\n🔴 ${fallos} DIFERENCIAS contra lo esperado — NO se escribe nada. PARAR y avisar a Daniel.`);
    process.exit(1);
  }
  console.log("\n🟢 El plan cuadra número por número con lo aprobado.");

  if (!EJECUTAR) {
    console.log("Dry-run: no se escribió nada. Ejecutar con --ejecutar.");
    return;
  }

  // ========================================================================
  // ESCRITURA — SOLO sellos hacia el cerrado 'pvh'. No se crea ningún
  // período: Joybees no se cierra y el cerrado de TH/CK ya existe.
  // ========================================================================
  console.log("\n═══ ESCRIBIENDO ═══");
  for (const a of acciones) {
    const target = String(cerradoPvh.id);
    if (a.op === "ya-esta") continue;
    if (a.op === "update") {
      const { data, error } = await sb
        .from("mk_periodo_documentos")
        .update({ periodo_id: target })
        .eq("tipo", a.tipo)
        .eq("documento_id", a.documento_id)
        .eq("proveedor_key", a.proveedor_key)
        .select("periodo_id");
      if (error) throw new Error(`update ${a.tipo} ${a.documento_id}: ${error.message}`);
      if ((data ?? []).length !== 1) throw new Error(`update ${a.tipo} ${a.documento_id}: tocó ${(data ?? []).length} filas (esperaba 1)`);
      console.log(`  ✏️  ${a.tipo} ${a.documento_id} (${a.proveedor_key}) → ${a.hacia}`);
    } else {
      const { error } = await sb.from("mk_periodo_documentos").insert({
        periodo_id: target,
        proveedor_key: a.proveedor_key,
        tipo: a.tipo,
        documento_id: a.documento_id,
      });
      if (error) throw new Error(`insert ${a.tipo} ${a.documento_id}: ${error.message}`);
      console.log(`  ➕ sello ${a.tipo} ${a.documento_id} (${a.proveedor_key}) → ${a.hacia}`);
    }
  }

  // --- Verificación FINAL contra la base, con el clasificador real -----------
  console.log("\n═══ VERIFICACIÓN FINAL (releyendo producción) ═══");
  const [periodosF, sellosF] = await Promise.all([
    todo<any>("mk_periodos", "id, proveedor_key, nombre, estado, cerrado_en"),
    todo<any>("mk_periodo_documentos", "periodo_id, proveedor_key, tipo, documento_id"),
  ]);
  const final = agregarPorBloques({ ...base, periodos: periodosF, sellos: sellosF });
  fallos = 0;
  for (const [k, esp] of Object.entries(ESPERADO.despues.abiertos)) cmp(`abierto ${k}`, bl(final, k).total, esp);
  for (const [k, esp] of Object.entries(ESPERADO.despues.cerrados)) cmp(`cerrado ${k} · mid 2026`, cerradoDe(final, k), esp);
  cmp("global (abiertos+cerrados)", globalDe(final), globalDe(antes));
  console.log(fallos === 0 ? "\n🟢 EJECUTADO Y VERIFICADO — todo cuadra." : `\n🔴 ${fallos} DIFERENCIAS tras ejecutar — revisar respaldo ${respaldoPath}`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
