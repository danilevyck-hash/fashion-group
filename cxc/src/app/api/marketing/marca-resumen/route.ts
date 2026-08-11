import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { esMultifashion } from "@/lib/marketing/multifashion";
import {
  agregarResumenInicio,
  type EntregaResumen,
  type FacturaMarcaResumen,
  type FacturaResumen,
  type MarcaResumen,
} from "@/lib/marketing/resumen-inicio";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// GET /api/marketing/marca-resumen
// Todo lo que dibuja el inicio de Marketing. La cuenta vive en el módulo PURO
// `lib/marketing/resumen-inicio.ts` — acá solo se lee la base y se arma el JSON.
//
//   - legacy            → archivo "Gastos Tommy y Calvin" (facturas legacy).
//   - multifashion      → bucket independiente (ver lib/marketing/multifashion).
//   - porMarca          → facturas NO-legacy repartidas por porcentaje.
//   - mueblesPorMarca   → entregas de muebles por marca (APARTE de porMarca).
//   - proyectosPorMarca → proyectos vivos de cada marca (facturas ∪ entregas).
//   - mobiliario        → total del módulo, para la tarjeta de Mobiliario.
//   - impulsadoras      → catálogo, para la tarjeta de Impulsadoras.
//
// 🩸 Los muebles NO se suman a `porMarca`: hasta el 11-ago-2026 no se contaban
// en NINGUNA tarjeta ($71.765 invisibles) y fundirlos en el mismo `$` habría
// triplicado el número que Daniel ya conoce sin decirle por qué. Van en su
// propia línea. Ver el encabezado de resumen-inicio.ts.
//
// Solo facturas y proyectos no anulados.

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const [facturasRes, fmRes, proyRes, marcasRes, entregasRes, impRes] =
      await Promise.all([
        supabaseServer
          .from("mk_facturas")
          .select("id, proyecto_id, total, grupo_legacy, impulsadora_id")
          .is("anulado_en", null),
        supabaseServer
          .from("mk_factura_marcas")
          .select("factura_id, marca_id, porcentaje"),
        supabaseServer
          .from("mk_proyectos")
          .select("id, tienda, tienda_codigo")
          .is("anulado_en", null),
        supabaseServer.from("mk_marcas").select("id, empresa_codigo"),
        supabaseServer
          .from("mk_entregas_muebles")
          .select("proyecto_id, total, total_por_marca, total_por_empresa_interna"),
        supabaseServer.from("mk_impulsadoras").select("id, monto_mensual, activa"),
      ]);

    if (facturasRes.error) throw new Error(`facturas: ${facturasRes.error.message}`);
    if (fmRes.error) throw new Error(`factura_marcas: ${fmRes.error.message}`);
    if (proyRes.error) throw new Error(`proyectos: ${proyRes.error.message}`);
    if (marcasRes.error) throw new Error(`marcas: ${marcasRes.error.message}`);
    if (entregasRes.error) throw new Error(`entregas: ${entregasRes.error.message}`);
    // Las impulsadoras son solo el subtítulo de una tarjeta: si fallan, la
    // pantalla se dibuja igual (degrada a "—") en vez de quedarse en blanco.

    const proyectos = (proyRes.data ?? []) as Array<{
      id: string;
      tienda: string | null;
      tienda_codigo: string | null;
    }>;
    const proyectosVivos = new Set(proyectos.map((p) => String(p.id)));
    const proyectosMultifashion = new Set(
      proyectos.filter((p) => esMultifashion(p)).map((p) => String(p.id)),
    );

    const resumen = agregarResumenInicio({
      facturas: (facturasRes.data ?? []) as FacturaResumen[],
      facturaMarcas: (fmRes.data ?? []) as FacturaMarcaResumen[],
      entregas: (entregasRes.data ?? []) as EntregaResumen[],
      marcas: (marcasRes.data ?? []) as MarcaResumen[],
      proyectosVivos,
      proyectosMultifashion,
    });

    const impulsadoras = (impRes.error ? [] : (impRes.data ?? [])) as Array<{
      monto_mensual: number | null;
      activa: boolean | null;
    }>;
    const activas = impulsadoras.filter((i) => i.activa !== false);

    const res = NextResponse.json({
      ...resumen,
      impulsadoras: {
        // `null` = no se pudo leer el catálogo → la tarjeta muestra "—" en vez
        // de un "0 impulsadoras" que sería mentira.
        count: impRes.error ? null : activas.length,
        montoMensual: impRes.error
          ? null
          : Number(
              activas.reduce((s, i) => s + Number(i.monto_mensual ?? 0), 0).toFixed(2),
            ),
      },
    });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("GET /api/marketing/marca-resumen:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
