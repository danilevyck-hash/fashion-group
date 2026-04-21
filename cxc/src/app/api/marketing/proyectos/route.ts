import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { createProyecto } from "@/lib/marketing/mutations";
import { resumenFacturasVigentesBatch } from "@/lib/marketing/queries";
import type {
  CreateProyectoInput,
  EstadoProyecto,
  MarcaConPorcentaje,
  MkProyecto,
} from "@/lib/marketing/types";

export const dynamic = "force-dynamic";

interface ProyectoListItem extends MkProyecto {
  marcas: MarcaConPorcentaje[];
  total_facturado: number;
  conteo_facturas: number;
  conteo_fotos: number;
}

// GET /api/marketing/proyectos?estado=abierto&marca_id=xxx
export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const estadoParam = searchParams.get("estado");
    const marcaIdParam = searchParams.get("marca_id");

    let pq = supabaseServer
      .from("mk_proyectos")
      .select("*")
      .is("anulado_en", null)
      .order("fecha_inicio", { ascending: false });

    if (
      estadoParam &&
      ["abierto", "por_cobrar", "enviado", "cobrado"].includes(estadoParam)
    ) {
      pq = pq.eq("estado", estadoParam as EstadoProyecto);
    }

    const { data: proyectosData, error: proyectosError } = await pq;
    if (proyectosError) throw new Error(proyectosError.message);

    const proyectos = (proyectosData ?? []) as MkProyecto[];
    if (proyectos.length === 0) return NextResponse.json([]);

    const ids = proyectos.map((p) => p.id);

    // Marcas de cada proyecto
    const { data: pmData, error: pmError } = await supabaseServer
      .from("mk_proyecto_marcas")
      .select("*, marca:mk_marcas(*)")
      .in("proyecto_id", ids);
    if (pmError) throw new Error(pmError.message);

    const marcasByProyecto = new Map<string, MarcaConPorcentaje[]>();
    for (const row of pmData ?? []) {
      const r = row as Record<string, unknown>;
      const marcaRow = r.marca as Record<string, unknown> | null;
      if (!marcaRow) continue;
      const item: MarcaConPorcentaje = {
        marca: {
          id: String(marcaRow.id),
          nombre: String(marcaRow.nombre ?? ""),
          codigo: String(marcaRow.codigo ?? ""),
          empresa_codigo: String(
            marcaRow.empresa_codigo ?? "",
          ) as MarcaConPorcentaje["marca"]["empresa_codigo"],
          activo: Boolean(marcaRow.activo ?? true),
          created_at: String(marcaRow.created_at ?? ""),
        },
        porcentaje: Number(r.porcentaje ?? 0),
      };
      const pid = String(r.proyecto_id);
      const arr = marcasByProyecto.get(pid) ?? [];
      arr.push(item);
      marcasByProyecto.set(pid, arr);
    }

    // Totales de facturas por proyecto (fuente única compartida con detalle)
    const totalByProyecto = await resumenFacturasVigentesBatch(ids);

    // Conteo de fotos de proyecto
    const { data: fotosData, error: fotosError } = await supabaseServer
      .from("mk_adjuntos")
      .select("proyecto_id")
      .in("proyecto_id", ids)
      .eq("tipo", "foto_proyecto");
    if (fotosError) throw new Error(fotosError.message);

    const fotosByProyecto = new Map<string, number>();
    for (const row of fotosData ?? []) {
      const r = row as Record<string, unknown>;
      const pid = String(r.proyecto_id);
      fotosByProyecto.set(pid, (fotosByProyecto.get(pid) ?? 0) + 1);
    }

    let resultado: ProyectoListItem[] = proyectos.map((p) => {
      const marcas = marcasByProyecto.get(p.id) ?? [];
      const tot =
        totalByProyecto.get(p.id) ?? { total: 0, subtotal: 0, conteo: 0 };
      const fotos = fotosByProyecto.get(p.id) ?? 0;
      return {
        ...p,
        marcas,
        total_facturado: Number(tot.total.toFixed(2)),
        conteo_facturas: tot.conteo,
        conteo_fotos: fotos,
      };
    });

    if (marcaIdParam) {
      resultado = resultado.filter((p) =>
        p.marcas.some((m) => m.marca.id === marcaIdParam),
      );
    }

    return NextResponse.json(resultado);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("marketing/proyectos GET:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/marketing/proyectos
export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await req.json()) as Partial<CreateProyectoInput>;
    if (!body?.tienda) {
      return NextResponse.json(
        { error: "Falta campo: tienda" },
        { status: 400 },
      );
    }
    // Fase 2: marcas opcionales. Si no vienen, el proyecto se crea sin
    // filas en mk_proyecto_marcas y las marcas se asignan por factura.
    const proyecto = await createProyecto({
      tienda: body.tienda,
      nombre: body.nombre,
      notas: body.notas,
      marcas: Array.isArray(body.marcas) ? body.marcas : [],
    });
    return NextResponse.json(proyecto);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "No se pudo crear el proyecto";
    console.error("marketing/proyectos POST:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
