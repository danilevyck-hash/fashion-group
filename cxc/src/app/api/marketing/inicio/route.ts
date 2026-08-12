import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { esMultifashion } from "@/lib/marketing/multifashion";
import {
  agregarPorBloques,
  type AdjuntoResumen,
  type PeriodoRow,
  type SelloRow,
} from "@/lib/marketing/resumen-bloques";
import { esTablaAusente } from "@/lib/marketing/periodos-io";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// GET /api/marketing/inicio
//
// TODO lo que dibuja el inicio de Marketing, agrupado por MARCA y acotado por
// PERÍODO. La cuenta vive en el módulo PURO `resumen-bloques.ts`; acá solo se
// lee la base y se arma el JSON.
//
// 🔴 DEGRADA LIMPIO SIN LA DDL, en las dos capas. Si `mk_periodos` /
// `mk_periodo_documentos` no existen, PostgREST responde 42P01 y acá se trata
// como "no hay períodos": el agregador cae al fallback `grupo_legacy`. Y si
// existen pero la migración POR MARCA (20260811180000) todavía no corrió, los
// sellos dicen 'pvh'/'reebok'/'joybees' y el agregador los reconoce igual
// (`clavesDeSello`). En los dos casos la pantalla muestra EXACTAMENTE los
// mismos números. Un error que NO sea "esa tabla no existe" sí se propaga:
// esconderlo dejaría la pantalla mostrando el archivo ya reportado como si
// fuera gasto abierto.

// `esTablaAusente` vive en `lib/marketing/periodos-io.ts` — fuente ÚNICA, la
// misma que usa el lado de escritura. Dos copias del criterio es una que se
// corrige y otra que empieza a tratar "falta la migración" como un error de
// verdad (o al revés, que es peor).

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
        supabaseServer
          .from("mk_facturas")
          .select("id, proyecto_id, total, grupo_legacy, impulsadora_id")
          .is("anulado_en", null),
        supabaseServer.from("mk_factura_marcas").select("factura_id, marca_id, porcentaje"),
        supabaseServer
          .from("mk_proyectos")
          .select("id, tienda, tienda_codigo")
          .is("anulado_en", null),
        supabaseServer.from("mk_marcas").select("id, nombre, codigo, empresa_codigo"),
        supabaseServer
          .from("mk_entregas_muebles")
          .select("id, proyecto_id, total, total_por_marca, total_por_empresa_interna"),
        supabaseServer.from("mk_impulsadoras").select("id, monto_mensual, activa"),
        // Comprobantes y fotos: alimentan los dos AVISOS del bloque. Si esta
        // lectura falla, los avisos salen en cero y la plata se dibuja igual.
        supabaseServer.from("mk_adjuntos").select("tipo, factura_id, proyecto_id"),
        supabaseServer
          .from("mk_periodos")
          .select("id, proveedor_key, nombre, estado, cerrado_en"),
        supabaseServer
          .from("mk_periodo_documentos")
          .select("periodo_id, proveedor_key, tipo, documento_id"),
      ]);

    if (facturasRes.error) throw new Error(`facturas: ${facturasRes.error.message}`);
    if (fmRes.error) throw new Error(`factura_marcas: ${fmRes.error.message}`);
    if (proyRes.error) throw new Error(`proyectos: ${proyRes.error.message}`);
    if (marcasRes.error) throw new Error(`marcas: ${marcasRes.error.message}`);
    if (entregasRes.error) throw new Error(`entregas: ${entregasRes.error.message}`);
    if (perRes.error && !esTablaAusente(perRes.error)) {
      throw new Error(`periodos: ${perRes.error.message}`);
    }
    if (selloRes.error && !esTablaAusente(selloRes.error)) {
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
      periodos: (perRes.error ? [] : (perRes.data ?? [])) as PeriodoRow[],
      sellos: (selloRes.error ? [] : (selloRes.data ?? [])) as SelloRow[],
      adjuntos: (adjRes.error ? [] : (adjRes.data ?? [])) as AdjuntoResumen[],
    });

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
