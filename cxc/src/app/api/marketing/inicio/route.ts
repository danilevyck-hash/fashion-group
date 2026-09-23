import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { esMultifashion } from "@/lib/marketing/multifashion";
import { hoyPanama } from "@/lib/fecha-panama";
import {
  agregarPorBloques,
  type AdjuntoResumen,
  type PeriodoRow,
  type SelloRow,
} from "@/lib/marketing/resumen-bloques";
import {
  completarPeriodo,
  conRespaldoSinColumnas,
} from "@/lib/marketing/columnas-opcionales";
import {
  MARKETING_PORTADA_REDISENO,
  type PeriodoMeta,
} from "@/lib/marketing/portada-rediseno";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// GET /api/marketing/inicio
//
// TODO lo que dibuja el inicio de Marketing, agrupado por MARCA y acotado por
// PERÍODO. La cuenta vive en el módulo PURO `resumen-bloques.ts`; acá solo se
// lee la base y se arma el JSON.
//
// Historia (ago-2026): degradaba limpio sin la DDL. Si `mk_periodos` /
// `mk_periodo_documentos` no existían, PostgREST respondía 42P01 y acá se
// trataba como "no hay períodos": el agregador caía al fallback `grupo_legacy`.
// Tolerancia retirada el 3-sep-2026: las tablas existen desde
// 20260811160000_marketing_periodos_por_proveedor.sql. Hoy CUALQUIER error de
// esas dos lecturas se propaga (500) — esconderlo dejaría la pantalla
// mostrando el archivo ya reportado como si fuera gasto abierto, y con la
// tabla puesta, "no existe" es un permiso, un timeout o un cambio de esquema.
//
// La capa que SÍ sigue viva es la de los sellos históricos: dicen
// 'pvh'/'reebok'/'joybees' y el agregador los reconoce igual (`clavesDeSello`).
//
// 🔴 EL REDISEÑO (22-sep-2026) agrega, detrás de `MARKETING_PORTADA_REDISENO`:
// `se_reporta` de facturas y entregas (lo apagado va a `noReportado`, no al
// total), las columnas del cierre de `mk_periodos` (`abierto_en`,
// `nombre_al_cerrar`, `nota_credito`) en `periodosMeta`, y el `hoy` de Panamá
// para que la portada diga cuántos días lleva abierto cada período. Todo por
// `columnas-opcionales`: sin la columna, como antes.

const COLS_FACTURA = "id, proyecto_id, total, grupo_legacy, impulsadora_id";
const COLS_ENTREGA = "id, proyecto_id, total, total_por_marca, total_por_empresa_interna";
const COLS_PERIODO = "id, proveedor_key, nombre, estado, cerrado_en";
const avisarColumna = (m: string) => console.error(`[marketing/inicio] ${m}`);

interface PeriodoLeido extends PeriodoRow {
  abierto_en?: string | null;
  nombre_al_cerrar?: string | null;
  nota_credito?: string | null;
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const [
      facturasRes,
      fmRes,
      proyRes,
      marcasRes,
      entregasRes,
      impRes,
      adjRes,
      perRes,
      selloRes,
    ] = await Promise.all([
        conRespaldoSinColumnas(
          () =>
            supabaseServer
              .from("mk_facturas")
              .select(`${COLS_FACTURA}, se_reporta`)
              .is("anulado_en", null),
          () => supabaseServer.from("mk_facturas").select(COLS_FACTURA).is("anulado_en", null),
          avisarColumna,
        ).then((r) => r.resultado),
        supabaseServer.from("mk_factura_marcas").select("factura_id, marca_id, porcentaje"),
        supabaseServer
          .from("mk_proyectos")
          .select("id, tienda, tienda_codigo")
          .is("anulado_en", null),
        supabaseServer.from("mk_marcas").select("id, nombre, codigo, empresa_codigo"),
        conRespaldoSinColumnas(
          () => supabaseServer.from("mk_entregas_muebles").select(`${COLS_ENTREGA}, se_reporta`),
          () => supabaseServer.from("mk_entregas_muebles").select(COLS_ENTREGA),
          avisarColumna,
        ).then((r) => r.resultado),
        supabaseServer.from("mk_impulsadoras").select("id, monto_mensual, activa"),
        // Comprobantes y fotos: alimentan los dos AVISOS del bloque. Si esta
        // lectura falla, los avisos salen en cero y la plata se dibuja igual.
        supabaseServer.from("mk_adjuntos").select("tipo, factura_id, proyecto_id"),
        conRespaldoSinColumnas(
          () =>
            supabaseServer
              .from("mk_periodos")
              .select(`${COLS_PERIODO}, abierto_en, nombre_al_cerrar, nota_credito`),
          () => supabaseServer.from("mk_periodos").select(`${COLS_PERIODO}, abierto_en`),
          avisarColumna,
        ).then((r) => r.resultado),
        supabaseServer
          .from("mk_periodo_documentos")
          .select("periodo_id, proveedor_key, tipo, documento_id"),
      ]);

    if (facturasRes.error) throw new Error(`facturas: ${facturasRes.error.message}`);
    if (fmRes.error) throw new Error(`factura_marcas: ${fmRes.error.message}`);
    if (proyRes.error) throw new Error(`proyectos: ${proyRes.error.message}`);
    if (marcasRes.error) throw new Error(`marcas: ${marcasRes.error.message}`);
    if (entregasRes.error) throw new Error(`entregas: ${entregasRes.error.message}`);
    if (perRes.error) throw new Error(`periodos: ${perRes.error.message}`);
    if (selloRes.error) {
      throw new Error(`periodo_documentos: ${selloRes.error.message}`);
    }
    // Las impulsadoras son solo el subtítulo de una tarjeta: si fallan, la
    // pantalla se dibuja igual (degrada a "—") en vez de quedarse en blanco.

    const proyectos = (proyRes.data ?? []) as Array<{
      id: string;
      tienda: string | null;
      tienda_codigo: string | null;
    }>;
    const proyectosMultifashion = new Set(
      proyectos.filter((p) => esMultifashion(p)).map((p) => String(p.id)),
    );

    const resumen = agregarPorBloques({
      facturas: (facturasRes.data ?? []) as never,
      facturaMarcas: (fmRes.data ?? []) as never,
      entregas: (entregasRes.data ?? []) as never,
      marcas: (marcasRes.data ?? []) as never,
      proyectos,
      proyectosMultifashion,
      periodos: (perRes.data ?? []) as PeriodoRow[],
      sellos: (selloRes.data ?? []) as SelloRow[],
      adjuntos: (adjRes.error ? [] : (adjRes.data ?? [])) as AdjuntoResumen[],
      excluirNoReportado: MARKETING_PORTADA_REDISENO,
    });

    // Las columnas del cierre, por id de período, completadas con su valor
    // de hoy si no vinieron (`completarPeriodo`). La portada lee de acá el
    // nombre que Daniel le puso, la nota de crédito y desde cuándo está abierto.
    const periodosMeta: Record<string, PeriodoMeta> = {};
    for (const p of (perRes.data ?? []) as PeriodoLeido[]) {
      const c = completarPeriodo(p as unknown as Record<string, unknown>);
      periodosMeta[String(p.id)] = {
        abiertoEn: p.abierto_en ?? null,
        nombreAlCerrar: c.nombre_al_cerrar,
        notaCredito: c.nota_credito,
        // La casa del período: 'pvh' en el cierre viejo que comparten Tommy y
        // Calvin, el código de marca en los que abrieron después.
        proveedorKey: p.proveedor_key ?? null,
      };
    }

    const entregas = (entregasRes.data ?? []) as Array<{
      proyecto_id: string | null;
      total: number | null;
    }>;
    const vivos = new Set(proyectos.map((p) => String(p.id)));
    const mobiliario = entregas.reduce(
      (acc, e) => {
        if (!e.proyecto_id || !vivos.has(String(e.proyecto_id))) return acc;
        acc.entregas += 1;
        acc.total += Number(e.total ?? 0);
        return acc;
      },
      { entregas: 0, total: 0 },
    );

    const impulsadoras = (impRes.error ? [] : (impRes.data ?? [])) as Array<{
      monto_mensual: number | null;
      activa: boolean | null;
    }>;
    const activas = impulsadoras.filter((i) => i.activa !== false);

    const marcasCatalogo = (marcasRes.data ?? []) as Array<{ id: string; nombre: string; codigo: string }>;

    const res = NextResponse.json({
      ...resumen,
      periodosMeta,
      hoy: hoyPanama(),
      marcas: marcasCatalogo.map((m) => ({ id: m.id, nombre: m.nombre, codigo: m.codigo })),
      mobiliario: { entregas: mobiliario.entregas, total: Number(mobiliario.total.toFixed(2)) },
      impulsadoras: {
        count: impRes.error ? null : activas.length,
        montoMensual: impRes.error
          ? null
          : Number(activas.reduce((s, i) => s + Number(i.monto_mensual ?? 0), 0).toFixed(2)),
      },
    });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("GET /api/marketing/inicio:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
