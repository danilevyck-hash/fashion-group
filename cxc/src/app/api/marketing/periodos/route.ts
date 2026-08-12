import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { esTablaAusente } from "@/lib/marketing/periodos-io";
import {
  agregar,
  cargarDatosPeriodos,
  esReportePeriodo,
} from "@/lib/marketing/periodos-reporte";
import { PROVEEDORES } from "@/lib/marketing/proveedores";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// GET /api/marketing/periodos
//
// Los períodos de todos los proveedores, abiertos y cerrados, con su total.
//
// 🔑 De dónde sale cada total:
//   · período ABIERTO  → del agregador (`agregarPorProveedor`), o sea lo mismo
//     que muestra el inicio. Es plata que todavía se está juntando.
//   · período CERRADO  → del REPORTE GUARDADO. No se recalcula: el número que
//     figura acá tiene que ser el mismo que dice el papel que el proveedor ya
//     tiene en la mano.
//
// 🔴 Sin la migración corrida no hay períodos. La pantalla lo tiene que poder
// decir con todas las letras en vez de mostrar una lista vacía sin explicación.

interface PeriodoConReporte {
  id: string;
  proveedor_key: string;
  nombre: string;
  estado: string;
  abierto_en: string | null;
  cerrado_en: string | null;
  cerrado_por: string | null;
  reporte: unknown;
}

const CERO = { count: 0, total: 0 };

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const perRes = await supabaseServer
      .from("mk_periodos")
      .select(
        "id, proveedor_key, nombre, estado, abierto_en, cerrado_en, cerrado_por, reporte",
      )
      .order("abierto_en", { ascending: false });

    if (perRes.error) {
      if (esTablaAusente(perRes.error)) {
        const res = NextResponse.json({
          hayPeriodos: false,
          mensaje:
            "Todavía no se activaron los períodos. Falta correr la actualización en la base de datos.",
          periodos: [],
        });
        res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
        return res;
      }
      throw new Error(perRes.error.message);
    }

    const filas = (perRes.data ?? []) as PeriodoConReporte[];

    // Solo se agrega si hay algún período abierto que mostrar: para una lista
    // de puros cerrados, leer todas las facturas del módulo sería trabajo al
    // pedo (sus totales ya están guardados).
    const hayAbiertos = filas.some((p) => p.estado === "abierto");
    const bloques = hayAbiertos
      ? agregar(await cargarDatosPeriodos()).bloques
      : [];

    const periodos = filas.map((p) => {
      const nombreProv =
        PROVEEDORES.find((x) => x.key === p.proveedor_key)?.nombre ??
        p.proveedor_key;

      if (p.estado === "abierto") {
        const b = bloques.find((x) => x.key === p.proveedor_key);
        return {
          id: String(p.id),
          proveedorKey: String(p.proveedor_key),
          proveedorNombre: nombreProv,
          nombre: String(p.nombre),
          estado: "abierto" as const,
          abiertoEn: p.abierto_en ?? null,
          cerradoEn: null,
          cerradoPor: null,
          tieneReporte: false,
          totales: {
            facturas: b?.facturas ?? CERO,
            muebles: b?.muebles ?? CERO,
            total: b?.total ?? 0,
            proyectos: b?.proyectos ?? 0,
          },
        };
      }

      const rep = esReportePeriodo(p.reporte) ? p.reporte : null;
      return {
        id: String(p.id),
        proveedorKey: String(p.proveedor_key),
        proveedorNombre: nombreProv,
        nombre: String(p.nombre),
        estado: "cerrado" as const,
        abiertoEn: p.abierto_en ?? null,
        cerradoEn: p.cerrado_en ?? null,
        cerradoPor: p.cerrado_por ?? null,
        tieneReporte: rep !== null,
        totales: rep
          ? rep.totales
          : { facturas: CERO, muebles: CERO, total: 0, proyectos: 0 },
      };
    });

    const res = NextResponse.json({ hayPeriodos: true, periodos });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("GET /api/marketing/periodos:", msg);
    return NextResponse.json(
      { error: "No se pudieron cargar los períodos. Intenta de nuevo." },
      { status: 500 },
    );
  }
}
