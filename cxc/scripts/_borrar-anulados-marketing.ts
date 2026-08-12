/**
 * Borra los PROYECTOS ANULADOS de Marketing — y NADA MÁS.
 *
 *   npx tsx scripts/_borrar-anulados-marketing.ts             → dry-run (mide + respalda, no borra)
 *   npx tsx scripts/_borrar-anulados-marketing.ts --confirm    → borra
 *
 * APROBADO POR DANIEL el 11-ago-2026, textual: "eliminalo de verdad, no son
 * proyectos de verdad" — referido a los PROYECTOS anulados.
 *
 * QUÉ BORRA: filas de `mk_proyectos` con `anulado_en IS NOT NULL` que estén
 * COMPLETAMENTE VACÍAS (0 facturas, 0 entregas, 0 adjuntos, 0 cobranzas, $0).
 *
 * QUÉ NO BORRA, NUNCA:
 *   · Facturas anuladas dentro de proyectos VIVOS. Una factura anulada es el
 *     registro de una corrección; borrarla no se deshace. Se miden y se dejan.
 *   · Ningún proyecto anulado que tenga algo colgando. Si aparece uno con
 *     facturas/entregas/adjuntos/cobranzas o con monto, el script ABORTA
 *     ENTERO sin borrar nada y lo reporta para que decida Daniel.
 *   · Ninguna tabla. Cero DDL.
 *
 * RED DE SEGURIDAD, porque una fila borrada NO VUELVE:
 *   1. RESPALDO OBLIGATORIO antes de tocar nada: las FILAS ENTERAS (no un
 *      resumen) van a JSON, se releen del disco y se valida que parsea y que
 *      trae los mismos ids. Si el respaldo falla, no se borra.
 *   2. Se borra por ID EXACTO, de una lista cerrada. Cero patrones, cero
 *      filtros abiertos, cero `neq`.
 *   3. ANTES/DESPUÉS: los totales del módulo (facturas vigentes, entregas,
 *      proyectos vivos) se miden dos veces y tienen que dar IDÉNTICOS.
 *   4. Después se cazan huérfanos en las 5 tablas hijas.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const CONFIRMAR = process.argv.includes("--confirm");
const RESPALDO =
  process.env.RESPALDO ??
  "/Users/daniellevy/.claude/jobs/5b66fe8c/tmp/anulados-respaldo-2026-08-11.json";

for (const line of fs.readFileSync(path.resolve(__dirname, "../.env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type Row = Record<string, unknown>;

/** Trae TODAS las filas de una tabla, paginando. `null` si la tabla no existe. */
async function todas(tabla: string, select = "*"): Promise<Row[] | null> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(tabla).select(select).range(from, from + 999);
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) return null;
      throw new Error(`leer ${tabla}: ${error.message}`);
    }
    const page = (data ?? []) as unknown as Row[];
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}

const n2 = (v: unknown) => Number(v ?? 0);
const money = (v: number) =>
  `$${v.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const suma = (rows: Row[], col: string) =>
  Math.round(rows.reduce((s, r) => s + n2(r[col]), 0) * 100) / 100;

/** La foto que NO se puede mover: totales del módulo. */
async function foto() {
  const proyectos = (await todas("mk_proyectos", "id, anulado_en")) ?? [];
  const facturas = (await todas("mk_facturas", "id, proyecto_id, total, anulado_en")) ?? [];
  const entregas = (await todas("mk_entregas_muebles", "id, proyecto_id, total")) ?? [];
  const vigentes = facturas.filter((f) => f.anulado_en == null);
  return {
    proyectosVivos: proyectos.filter((p) => p.anulado_en == null).length,
    proyectosAnulados: proyectos.filter((p) => p.anulado_en != null).length,
    facturasVigentes: vigentes.length,
    totalFacturasVigentes: suma(vigentes, "total"),
    facturasAnuladas: facturas.filter((f) => f.anulado_en != null).length,
    totalFacturasAnuladas: suma(
      facturas.filter((f) => f.anulado_en != null),
      "total",
    ),
    entregas: entregas.length,
    totalEntregas: suma(entregas, "total"),
  };
}

function imprimirFoto(titulo: string, f: Awaited<ReturnType<typeof foto>>) {
  console.log(`── ${titulo} ──`);
  console.log(`   proyectos vivos:            ${f.proyectosVivos}`);
  console.log(`   proyectos anulados:         ${f.proyectosAnulados}`);
  console.log(
    `   facturas vigentes:          ${f.facturasVigentes}  ·  ${money(f.totalFacturasVigentes)}`,
  );
  console.log(
    `   facturas ANULADAS:          ${f.facturasAnuladas}  ·  ${money(f.totalFacturasAnuladas)}   (NO se tocan)`,
  );
  console.log(`   entregas de muebles:        ${f.entregas}  ·  ${money(f.totalEntregas)}`);
}

async function main() {
  console.log(
    `\n═══ Proyectos anulados de Marketing · ${CONFIRMAR ? "BORRADO REAL" : "DRY-RUN (no borra nada)"} ═══\n`,
  );

  // ── 1. MEDIR ───────────────────────────────────────────────────────────────
  const antes = await foto();
  imprimirFoto("ANTES", antes);

  const proyectos = (await todas("mk_proyectos"))!;
  const anulados = proyectos.filter((p) => p.anulado_en != null);
  const idsAnulados = new Set(anulados.map((p) => String(p.id)));

  // Algunas tablas del módulo son de migraciones que Daniel corre A MANO y
  // pueden no existir todavía en producción. `null` = tabla ausente; se reporta
  // y se trata como vacía (no puede haber filas huérfanas de algo que no existe).
  const ausentes: string[] = [];
  const leer = async (t: string) => {
    const r = await todas(t);
    if (r === null) ausentes.push(t);
    return r ?? [];
  };
  const facturas = await leer("mk_facturas");
  const entregas = await leer("mk_entregas_muebles");
  const adjuntos = await leer("mk_adjuntos");
  const proyMarcas = await leer("mk_proyecto_marcas");
  const cobranzas = await leer("mk_cobranzas");
  const entregaItems = await leer("mk_entrega_items");
  const facturaMarcas = await leer("mk_factura_marcas");
  const periodoDocs = await leer("mk_periodo_documentos");
  if (ausentes.length > 0) console.log(`\n⚠️  tablas que no existen en producción: ${ausentes.join(", ")}`);

  const hijasDe = (pid: string) => {
    const fs_ = facturas.filter((f) => String(f.proyecto_id) === pid);
    const en_ = entregas.filter((e) => String(e.proyecto_id) === pid);
    const idsF = new Set(fs_.map((f) => String(f.id)));
    const idsE = new Set(en_.map((e) => String(e.id)));
    return {
      facturas: fs_,
      entregas: en_,
      adjuntos: adjuntos.filter(
        (a) => String(a.proyecto_id) === pid || idsF.has(String(a.factura_id)),
      ),
      proyectoMarcas: proyMarcas.filter((m) => String(m.proyecto_id) === pid),
      cobranzas: cobranzas.filter((c) => String(c.proyecto_id) === pid),
      entregaItems: entregaItems.filter((i) => idsE.has(String(i.entrega_id))),
      facturaMarcas: facturaMarcas.filter((m) => idsF.has(String(m.factura_id))),
      periodoDocs: periodoDocs.filter(
        (d) => idsF.has(String(d.documento_id)) || idsE.has(String(d.documento_id)),
      ),
    };
  };

  console.log(`\n── LOS ${anulados.length} PROYECTOS ANULADOS ──`);
  const bloqueos: string[] = [];
  const detalle: Row[] = [];
  for (const p of anulados) {
    const pid = String(p.id);
    const h = hijasDe(pid);
    const montoF = suma(h.facturas, "total");
    const montoE = suma(h.entregas, "total");
    const montoC = suma(h.cobranzas, "monto");
    console.log(`\n   ${pid}`);
    console.log(`   tienda: ${p.tienda ?? "—"}  ·  nombre: ${p.nombre ?? "—"}`);
    console.log(
      `   creado ${String(p.created_at).slice(0, 10)}  ·  anulado ${String(p.anulado_en).slice(0, 10)}  ·  motivo: ${p.anulado_motivo ?? "—"}`,
    );
    console.log(
      `   facturas ${h.facturas.length} (${money(montoF)}) · entregas ${h.entregas.length} (${money(montoE)}) · adjuntos ${h.adjuntos.length} · cobranzas ${h.cobranzas.length} (${money(montoC)}) · mk_proyecto_marcas ${h.proyectoMarcas.length} · mk_entrega_items ${h.entregaItems.length} · mk_factura_marcas ${h.facturaMarcas.length} · mk_periodo_documentos ${h.periodoDocs.length}`,
    );

    // ── 3. SEMÁFORO: ¿esto es basura de verdad? ─────────────────────────────
    const razones: string[] = [];
    if (h.facturas.length > 0) razones.push(`tiene ${h.facturas.length} factura(s)`);
    if (h.entregas.length > 0) razones.push(`tiene ${h.entregas.length} entrega(s)`);
    if (h.adjuntos.length > 0) razones.push(`tiene ${h.adjuntos.length} adjunto(s)`);
    if (h.cobranzas.length > 0) razones.push(`tiene ${h.cobranzas.length} cobranza(s)`);
    if (h.entregaItems.length > 0) razones.push(`tiene ${h.entregaItems.length} item(s) de entrega`);
    if (h.periodoDocs.length > 0) razones.push(`está sellado en ${h.periodoDocs.length} período(s)`);
    if (montoF + montoE + montoC > 0) razones.push(`mueve ${money(montoF + montoE + montoC)}`);
    const diasDesdeAnulado = Math.floor(
      (Date.now() - new Date(String(p.anulado_en)).getTime()) / 86400000,
    );
    if (diasDesdeAnulado < 3) razones.push(`se anuló hace ${diasDesdeAnulado} día(s)`);

    if (razones.length > 0) {
      console.log(`   🚨 NO ES BASURA: ${razones.join(" · ")}`);
      bloqueos.push(`${pid} (${p.tienda}): ${razones.join(" · ")}`);
    } else {
      console.log(`   ✅ vacío — anulado hace ${diasDesdeAnulado} días`);
    }
    detalle.push({ proyecto: p, hijas: h, montos: { montoF, montoE, montoC }, razones });
  }

  // Facturas ANULADAS dentro de proyectos VIVOS — se miden y se DEJAN.
  const anuladasEnVivos = facturas.filter(
    (f) => f.anulado_en != null && f.proyecto_id != null && !idsAnulados.has(String(f.proyecto_id)),
  );
  console.log(
    `\n── FACTURAS ANULADAS EN PROYECTOS VIVOS (NO SE TOCAN) ──\n   ${anuladasEnVivos.length} facturas · ${money(suma(anuladasEnVivos, "total"))}`,
  );

  // ── STORAGE ───────────────────────────────────────────────────────────────
  // Este script NO TOCA STORAGE: un DELETE en la DB no borra archivos. Se mide
  // igual porque el bucket 'marketing' guarda por carpeta `<proyecto_id>/`, y
  // la carpeta de un proyecto FUSIONADO puede seguir alojando los archivos de
  // las filas que se mudaron al proyecto VIVO. Borrar esa carpeta "porque el
  // proyecto ya no existe" rompería adjuntos vivos. Queda escrito acá.
  console.log(`\n── STORAGE (bucket 'marketing') — NO SE TOCA ──`);
  const adjDeAnulados = anulados.flatMap((p) => hijasDe(String(p.id)).adjuntos);
  console.log(`   mk_adjuntos colgando de un proyecto anulado: ${adjDeAnulados.length}`);
  for (const a of adjDeAnulados) console.log(`   ${a.tipo}  ${a.url}`);
  const urlsVivas = new Set(adjuntos.map((a) => String(a.url)));
  for (const id of idsAnulados) {
    const { data: files, error } = await db.storage.from("marketing").list(id, { limit: 1000 });
    if (error) {
      console.log(`   ⚠️  no se pudo listar ${id}/: ${error.message}`);
      continue;
    }
    const enUso = (files ?? []).filter((o) => urlsVivas.has(`${id}/${o.name}`));
    const duenos = new Set(
      adjuntos
        .filter((a) => String(a.url).startsWith(`${id}/`))
        .map((a) => {
          const f = a.factura_id ? facturas.find((x) => String(x.id) === String(a.factura_id)) : null;
          const pid = f ? String(f.proyecto_id) : String(a.proyecto_id ?? "");
          const p = proyectos.find((x) => String(x.id) === pid);
          return p ? `${p.tienda} (${idsAnulados.has(pid) ? "ANULADO" : "VIVO"})` : "?";
        }),
    );
    console.log(
      `   carpeta ${id}/ → ${(files ?? []).length} archivos · ${enUso.length} referenciados por mk_adjuntos VIVOS`,
    );
    if (enUso.length > 0) {
      console.log(
        `   ⚠️  ESA CARPETA NO SE PUEDE BORRAR NUNCA: sus archivos son de → ${[...duenos].join(", ")}`,
      );
    }
  }

  if (anulados.length === 0) {
    console.log("\nNo hay proyectos anulados. Nada que hacer.");
    return;
  }

  // ── 2. RESPALDO (siempre, aun en dry-run) ─────────────────────────────────
  const respaldo = {
    generado_en: new Date().toISOString(),
    script: "scripts/_borrar-anulados-marketing.ts",
    aprobacion: 'Daniel, 11-ago-2026: "eliminalo de verdad, no son proyectos de verdad"',
    foto_antes: antes,
    proyectos_anulados: detalle,
    facturas_anuladas_en_proyectos_vivos_NO_BORRADAS: anuladasEnVivos,
  };
  fs.mkdirSync(path.dirname(RESPALDO), { recursive: true });
  fs.writeFileSync(RESPALDO, JSON.stringify(respaldo, null, 2), "utf8");

  // Releer del disco: si no parsea o no trae los mismos ids, NO se borra.
  const relectura = JSON.parse(fs.readFileSync(RESPALDO, "utf8")) as typeof respaldo;
  const idsRespaldados = new Set(
    relectura.proyectos_anulados.map((d) => String((d.proyecto as Row).id)),
  );
  const faltan = [...idsAnulados].filter((id) => !idsRespaldados.has(id));
  console.log(`\n── RESPALDO ──`);
  console.log(`   ${RESPALDO}`);
  console.log(
    `   ${fs.statSync(RESPALDO).size.toLocaleString("es-PA")} bytes · relectura JSON OK · ${idsRespaldados.size}/${idsAnulados.size} proyectos`,
  );
  if (faltan.length > 0) {
    console.log(`   🚨 ABORTADO: faltan en el respaldo: ${faltan.join(", ")}`);
    return;
  }
  console.log(`   ✅ respaldo verificado`);

  if (bloqueos.length > 0) {
    console.log(`\n🚨 ABORTADO — ${bloqueos.length} proyecto(s) anulado(s) NO parecen basura:`);
    for (const b of bloqueos) console.log(`   ${b}`);
    console.log(`   No se borró NADA. Decidí vos y volvé a correr.`);
    return;
  }

  const aBorrar = anulados.map((p) => String(p.id));
  console.log(`\n── LISTA A BORRAR (${aBorrar.length} filas de mk_proyectos, por id exacto) ──`);
  for (const p of anulados) console.log(`   ${p.id}  ${p.tienda} / ${p.nombre ?? "—"}`);

  if (!CONFIRMAR) {
    console.log("\n(dry-run: no se borró nada. Agregá --confirm para ejecutar.)");
    return;
  }

  // ── 4. BORRAR por id exacto ───────────────────────────────────────────────
  console.log(`\nBorrando ${aBorrar.length} proyectos…`);
  for (const id of aBorrar) {
    const { error } = await db.from("mk_proyectos").delete().eq("id", id);
    if (error) {
      console.log(`   🚨 ${id}: ${error.message}`);
      return;
    }
    console.log(`   borrado ${id}`);
  }

  // ── 5. VERIFICAR ──────────────────────────────────────────────────────────
  const despues = await foto();
  console.log("");
  imprimirFoto("DESPUÉS", despues);

  const proyDespues = (await todas("mk_proyectos", "id"))!;
  const vivosIds = new Set(proyDespues.map((p) => String(p.id)));
  const quedaron = aBorrar.filter((id) => vivosIds.has(id));

  const huerfanas = async (tabla: string, col: string, padres: Set<string>) => {
    const rows = await todas(tabla, `id, ${col}`);
    if (rows === null) return { tabla, n: -1 };
    return {
      tabla,
      n: rows.filter((r) => r[col] != null && !padres.has(String(r[col]))).length,
    };
  };
  const facturasDespues = (await todas("mk_facturas", "id"))!;
  const idsF = new Set(facturasDespues.map((f) => String(f.id)));
  const entregasDespues = (await todas("mk_entregas_muebles", "id"))!;
  const idsE = new Set(entregasDespues.map((e) => String(e.id)));

  const checks = [
    await huerfanas("mk_facturas", "proyecto_id", vivosIds),
    await huerfanas("mk_entregas_muebles", "proyecto_id", vivosIds),
    await huerfanas("mk_adjuntos", "proyecto_id", vivosIds),
    await huerfanas("mk_adjuntos", "factura_id", idsF),
    await huerfanas("mk_proyecto_marcas", "proyecto_id", vivosIds),
    await huerfanas("mk_cobranzas", "proyecto_id", vivosIds),
    await huerfanas("mk_factura_marcas", "factura_id", idsF),
    await huerfanas("mk_entrega_items", "entrega_id", idsE),
  ];

  console.log(`\n── VERIFICACIÓN ──`);
  console.log(
    `   ${quedaron.length === 0 ? "✅" : "🚨"} de la lista, quedaron sin borrar: ${quedaron.length}`,
  );
  console.log(
    `   ${despues.proyectosAnulados === 0 ? "✅" : "🚨"} proyectos anulados: ${antes.proyectosAnulados} → ${despues.proyectosAnulados}`,
  );
  for (const c of checks) {
    if (c.n < 0) console.log(`   —  ${c.tabla}: la tabla no existe`);
    else console.log(`   ${c.n === 0 ? "✅" : "🚨"} huérfanos en ${c.tabla}: ${c.n}`);
  }
  const iguales = [
    ["proyectos vivos", antes.proyectosVivos, despues.proyectosVivos],
    ["facturas vigentes", antes.facturasVigentes, despues.facturasVigentes],
    ["SUM(total) facturas vigentes", antes.totalFacturasVigentes, despues.totalFacturasVigentes],
    ["facturas anuladas", antes.facturasAnuladas, despues.facturasAnuladas],
    ["SUM(total) facturas anuladas", antes.totalFacturasAnuladas, despues.totalFacturasAnuladas],
    ["entregas", antes.entregas, despues.entregas],
    ["SUM(total) entregas", antes.totalEntregas, despues.totalEntregas],
  ] as const;
  for (const [etiq, a, d] of iguales) {
    console.log(`   ${a === d ? "✅" : "🚨"} ${etiq}: ${a} → ${d}`);
  }
  const movido = iguales.filter(([, a, d]) => a !== d);
  console.log(
    movido.length === 0
      ? `\n✅ No se movió un centavo.`
      : `\n🚨 SE MOVIÓ ALGO: ${movido.map(([e]) => e).join(", ")}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
