// ============================================================================
// SOLO LECTURA — corre el agregador REAL (`agregarPorBloques`) y el armador de
// secciones REAL (`armarSecciones`) contra las filas de PRODUCCIÓN y verifica
// los TRES NIVELES de Marketing (12-ago-2026):
//
//   1. Los totales de las secciones (nivel 2/3) son EXACTAMENTE los chips del
//      inicio: TH $8.800,00 abierto · $94.104,43 mid 2026; CK $5.840,00 /
//      $46.462,14; Joybees $1.540,00 abierto; Multifashion $8.061,63.
//   2. Dentro de cada sección, Σ(proyectos) + General == total, AL CENTAVO —
//      el detalle sale de la MISMA pasada del agregador, así que una
//      diferencia acá es un bug, no redondeo.
//   3. El General por período (los items que arma la ruta, con la marca REAL
//      de mk_factura_marcas) cuadra con el bucket del agregador.
//   4. Los slugs de las secciones son únicos por marca.
//
// Uso:
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/_verif-marketing-secciones.ts
// ============================================================================
import { createClient } from "@supabase/supabase-js";
import {
  agregarPorBloques,
  crearClasificadorPeriodos,
  periodoLegacyDeFactura,
  claveDeSeccion,
  SECCION_ABIERTO,
} from "../src/lib/marketing/resumen-bloques";
import {
  armarGastoGeneral,
  armarSecciones,
  descripcionDeGastoSuelto,
  type GastoGeneral,
  type GastoGeneralItem,
} from "../src/lib/marketing/lista-por-periodo";
import { esMultifashion } from "../src/lib/marketing/multifashion";
import {
  MARCAS_BLOQUE,
  SIN_BLOQUE,
  indiceBloquePorMarcaId,
} from "../src/lib/marketing/bloques";

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

// Los 4 chequeos a mano que pidió Daniel (re-medidos el 12-ago-2026), más
// Joybees y Multifashion.
const CONTROL: Record<string, { abierto: number; cerrados: Record<string, number> }> = {
  TH: { abierto: 8800.0, cerrados: { "mid 2026": 94104.43 } },
  CK: { abierto: 5840.0, cerrados: { "mid 2026": 46462.14 } },
  KL: { abierto: 0, cerrados: {} },
  RBK: { abierto: 0, cerrados: {} },
  J: { abierto: 1540.0, cerrados: {} },
};
const CONTROL_MF = 8061.63;
const CONTROL_GLOBAL = 164808.2;

let fallos = 0;
function cmp(etiqueta: string, a: number, b: number) {
  const ok = Math.abs(a - b) < 0.005;
  if (!ok) fallos++;
  console.log(
    `  ${ok ? "✅" : "❌"} ${etiqueta.padEnd(52)} ${money(a).padStart(13)}  esperado ${money(b).padStart(13)}`,
  );
}

async function main() {
  const [facturasTodas, facturaMarcas, proyectosTodos, marcas, entregas, periodos, sellos] =
    await Promise.all([
      todo<any>(
        "mk_facturas",
        "id, proyecto_id, total, grupo_legacy, impulsadora_id, concepto, proveedor, numero_factura, fecha_factura, created_at, anulado_en",
      ),
      todo<any>("mk_factura_marcas", "factura_id, marca_id, porcentaje"),
      todo<any>("mk_proyectos", "id, tienda, tienda_codigo, created_at, anulado_en"),
      todo<any>("mk_marcas", "id, nombre, codigo, empresa_codigo"),
      todo<any>(
        "mk_entregas_muebles",
        "id, proyecto_id, total, total_por_marca, total_por_empresa_interna",
      ),
      todo<any>("mk_periodos", "id, proveedor_key, nombre, estado, cerrado_en"),
      todo<any>("mk_periodo_documentos", "periodo_id, proveedor_key, tipo, documento_id"),
    ]);

  const facturas = facturasTodas.filter((f) => !f.anulado_en);
  const proyectos = proyectosTodos.filter((p) => !p.anulado_en);
  const proyectosMultifashion = new Set(
    proyectos.filter((p) => esMultifashion(p)).map((p) => String(p.id)),
  );

  // EL MISMO agregador, con LOS MISMOS insumos que /api/marketing/inicio y
  // que /api/marketing/proyectos-lista.
  const resumen = agregarPorBloques({
    facturas,
    facturaMarcas,
    entregas,
    marcas,
    proyectos,
    proyectosMultifashion,
    periodos,
    sellos,
  });

  // El General por período, como lo arma la RUTA (marca real, clasificador).
  const clasificador = crearClasificadorPeriodos(periodos, sellos);
  const bloquePorMarca = indiceBloquePorMarcaId(marcas);
  const sueltas = facturas.filter((f) => !f.proyecto_id);
  const fmBySuelta = new Map<string, Array<{ mid: string; pct: number }>>();
  const sueltaIds = new Set(sueltas.map((s) => String(s.id)));
  for (const r of facturaMarcas) {
    const fid = String(r.factura_id);
    if (!sueltaIds.has(fid)) continue;
    const arr = fmBySuelta.get(fid) ?? [];
    arr.push({ mid: String(r.marca_id), pct: Number(r.porcentaje ?? 0) });
    fmBySuelta.set(fid, arr);
  }
  const generalesDe = (bloque: string): Map<string, GastoGeneral> => {
    const porSeccion = new Map<string, GastoGeneralItem[]>();
    for (const f of sueltas) {
      const fid = String(f.id);
      const rows = fmBySuelta.get(fid) ?? [];
      const sumPct = rows.reduce((s, r) => s + r.pct, 0) || 1;
      const pctBloque = rows
        .filter((r) => (bloquePorMarca.get(r.mid) ?? SIN_BLOQUE) === bloque)
        .reduce((s, r) => s + r.pct, 0);
      if (pctBloque <= 0) continue;
      const cer = clasificador.cerradoPara(
        "factura",
        fid,
        bloque,
        periodoLegacyDeFactura({ grupo_legacy: f.grupo_legacy } as never, false),
      );
      const clave = claveDeSeccion(cer);
      const esImpulsadora = !!f.impulsadora_id;
      const arr = porSeccion.get(clave) ?? [];
      arr.push({
        id: fid,
        fecha: f.fecha_factura ?? f.created_at ?? null,
        descripcion: descripcionDeGastoSuelto({ ...f, esImpulsadora }),
        monto: Number((Number(f.total ?? 0) * (pctBloque / sumPct)).toFixed(2)),
        esImpulsadora,
      });
      porSeccion.set(clave, arr);
    }
    const out = new Map<string, GastoGeneral>();
    for (const [clave, items] of porSeccion) out.set(clave, armarGastoGeneral(items));
    return out;
  };

  console.log("═══ SECCIONES POR MARCA (el nivel 2/3, con datos de producción) ═══");
  for (const m of MARCAS_BLOQUE) {
    const generales = generalesDe(m.key);
    const secciones = armarSecciones({
      bloqueKey: m.key,
      bloque: resumen.bloques.find((b) => b.key === m.key) ?? null,
      cerrados: resumen.cerrados,
      detalle: resumen.detalle,
      generales,
      conPeriodos: resumen.conPeriodos,
      ordenProyectos: proyectos.map((p) => String(p.id)),
    });

    console.log(`\n— ${m.nombreFallback} (${m.key})`);
    const slugs = new Set<string>();
    for (const s of secciones) {
      console.log(
        `  ${s.estado.toUpperCase().padEnd(8)} ${s.nombre.padEnd(18)} slug=${s.slug.padEnd(22)} total ${money(s.total).padStart(12)} · ${s.proyectos.length} proyectos${s.general ? ` · General ${money(s.general.total)} (${s.general.count})` : ""}`,
      );
      for (const p of s.proyectos) {
        const proy = proyectos.find((x) => String(x.id) === p.id);
        console.log(
          `      ${(proy?.tienda ?? p.id).slice(0, 34).padEnd(36)} ${money(p.monto).padStart(12)}  (${p.facturas} fact · ${p.entregas} entr)`,
        );
      }
      // CUADRE 1: Σ proyectos + General == total de la sección (del agregador).
      const sumaProyectos = s.proyectos.reduce((a, p) => a + p.monto, 0);
      const general = s.general?.total ?? 0;
      cmp(
        `Σ proyectos + General = total (${m.key} · ${s.nombre})`,
        Number((sumaProyectos + general).toFixed(2)),
        s.total,
      );
      // CUADRE 2: el General de la ruta == el bucket del detalle del agregador.
      const bucket = resumen.detalle
        .filter((d) => d.bloqueKey === m.key && d.seccion === s.key && d.proyectoId === null)
        .reduce((a, d) => a + d.monto, 0);
      if (s.general || bucket > 0) {
        cmp(
          `General (ruta) = General (agregador) (${m.key} · ${s.nombre})`,
          general,
          Number(bucket.toFixed(2)),
        );
      }
      if (slugs.has(s.slug)) {
        fallos++;
        console.log(`  ❌ slug repetido: ${s.slug}`);
      }
      slugs.add(s.slug);
    }

    // CUADRE 3: los chips que pidió Daniel, a mano.
    const control = CONTROL[m.key];
    if (control) {
      const abierta = secciones.find((s) => s.estado === "abierto");
      cmp(`chip ABIERTO de ${m.key}`, abierta?.total ?? 0, control.abierto);
      for (const [nombre, esperado] of Object.entries(control.cerrados)) {
        const sec = secciones.find((s) => s.estado === "cerrado" && s.nombre === nombre);
        cmp(`chip CERRADO ${m.key} · ${nombre}`, sec?.total ?? 0, esperado);
      }
    }
  }

  console.log("\n═══ MULTIFASHION Y GLOBAL ═══");
  const mf = resumen.bloques.find((b) => b.key === "multifashion");
  cmp("Multifashion (detalle del bucket)", mf?.total ?? 0, CONTROL_MF);
  const sumaMf = resumen.detalle
    .filter((d) => d.bloqueKey === "multifashion")
    .reduce((a, d) => a + d.monto, 0);
  cmp("Σ detalle Multifashion = su total", Number(sumaMf.toFixed(2)), mf?.total ?? 0);
  const global =
    resumen.resumen.total + resumen.cerrados.reduce((s, c) => s + c.total, 0);
  cmp("GLOBAL abiertos+cerrados", global, CONTROL_GLOBAL);

  console.log(
    `\n${fallos === 0 ? "🟢 TODO CUADRA — 0 diferencias" : `🔴 ${fallos} DIFERENCIAS`}`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
