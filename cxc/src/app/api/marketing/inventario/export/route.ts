import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import {
  listAllEntregas,
  listEntregasByProyecto,
  listProductos,
} from "@/lib/marketing/inventario";
import { getMarcas } from "@/lib/marketing/queries";
import {
  exportarExcelGlobal,
  exportarExcelTienda,
} from "@/lib/marketing/inventario-excel";
import type { MkProyecto } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapProyecto(row: Record<string, unknown>): MkProyecto {
  return {
    id: String(row.id),
    nombre: (row.nombre as string | null) ?? null,
    tienda: String(row.tienda ?? ""),
    fecha_inicio: String(row.fecha_inicio ?? ""),
    fecha_cierre: (row.fecha_cierre as string | null) ?? null,
    estado: String(row.estado ?? "abierto") as MkProyecto["estado"],
    fecha_enviado: (row.fecha_enviado as string | null) ?? null,
    fecha_cobrado: (row.fecha_cobrado as string | null) ?? null,
    notas: (row.notas as string | null) ?? null,
    anulado_en: (row.anulado_en as string | null) ?? null,
    anulado_motivo: (row.anulado_motivo as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function fileSafe(s: string): string {
  return (s || "inventario").replace(/[^a-zA-Z0-9-_ ]+/g, "_").trim();
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const proyectoId = searchParams.get("proyecto_id");

  try {
    const [productos, marcas] = await Promise.all([listProductos(), getMarcas()]);

    if (proyectoId) {
      if (!uuidRegex.test(proyectoId)) {
        return NextResponse.json({ error: "ID inválido" }, { status: 400 });
      }
      const { data: proyRow, error: proyErr } = await supabaseServer
        .from("mk_proyectos")
        .select("*")
        .eq("id", proyectoId)
        .maybeSingle();
      if (proyErr) {
        return NextResponse.json({ error: proyErr.message }, { status: 500 });
      }
      if (!proyRow) {
        return NextResponse.json(
          { error: "Proyecto no encontrado" },
          { status: 404 },
        );
      }
      const proyecto = mapProyecto(proyRow as Record<string, unknown>);
      const entregas = await listEntregasByProyecto(proyectoId);
      if (entregas.length === 0) {
        return NextResponse.json(
          { error: "El proyecto no tiene entregas" },
          { status: 404 },
        );
      }
      // Si hay varias entregas en el proyecto, exportar la primera (caso normal:
      // 1 entrega por proyecto). Daniel puede pedir export global para detalle.
      const buffer = exportarExcelTienda({
        proyecto,
        entrega: entregas[0],
        productos,
        marcas,
      });
      const fname = `entrega-${fileSafe(proyecto.tienda || proyecto.nombre || proyectoId)}.xlsx`;
      return new NextResponse(Buffer.from(buffer), {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${fname}"`,
        },
      });
    }

    // Export global
    const entregas = await listAllEntregas();
    const proyectoIds = Array.from(new Set(entregas.map((e) => e.proyecto_id)));
    let proyectos: MkProyecto[] = [];
    if (proyectoIds.length > 0) {
      const { data, error } = await supabaseServer
        .from("mk_proyectos")
        .select("*")
        .in("id", proyectoIds);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      proyectos = (data ?? []).map((r) =>
        mapProyecto(r as Record<string, unknown>),
      );
    }
    const buffer = exportarExcelGlobal({
      productos,
      entregas,
      proyectos,
      marcas,
    });
    const today = new Date().toISOString().slice(0, 10);
    const fname = `inventario-muebles-${today}.xlsx`;
    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fname}"`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    console.error("inventario/export GET:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
