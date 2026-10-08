import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { ROLES_MARKETING } from "@/lib/marketing/roles";
import { gastoEsDeMultifashion } from "@/lib/marketing/tiendas-y-marcas";
import {
  MKT_SOLO_COBRABLE_2026_10,
  motivoNoRecuperable,
  ordenarNoRecuperables,
  type FilaNoRecuperable,
} from "@/lib/marketing/solo-cobrable-2026-10";

export const dynamic = "force-dynamic";

// GET /api/marketing/no-recuperable
//
// 🔴 SOLO LO COBRABLE (7-oct-2026, apagado): la lista de lo que YA existe y no
// se le cobra a ninguna marca — los gastos de Multi Fashion (tienda propia),
// lo «a cargo de la empresa» (la #145) y lo que no se reporta. SOLO LEE: tres
// lecturas, ninguna escritura. No suma a ninguna marca ni entra a ningún ZIP:
// esas cuentas viven en otro lado y no leen esta ruta.

interface FacturaLeida {
  id: string;
  numero_factura: string | null;
  fecha_factura: string | null;
  proveedor: string | null;
  concepto: string | null;
  total: number | null;
  tienda_codigo: string | null;
  proyecto_id: string | null;
  se_reporta: boolean | null;
  pct_a_la_marca: number | null;
}

interface EntregaLeida {
  id: string;
  numero: number | null;
  created_at: string | null;
  notas: string | null;
  total: number | null;
  tienda_codigo: string | null;
  proyecto_id: string | null;
  se_reporta: boolean | null;
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, [...ROLES_MARKETING]);
  if (auth instanceof NextResponse) return auth;
  if (!MKT_SOLO_COBRABLE_2026_10) return NextResponse.json({ error: "No disponible" }, { status: 404 });

  const [fRes, eRes, pRes] = await Promise.all([
    supabaseServer
      .from("mk_facturas")
      .select(
        "id, numero_factura, fecha_factura, proveedor, concepto, total, tienda_codigo, proyecto_id, se_reporta, pct_a_la_marca",
      )
      .is("anulado_en", null),
    supabaseServer
      .from("mk_entregas_muebles")
      .select("id, numero, created_at, notas, total, tienda_codigo, proyecto_id, se_reporta"),
    supabaseServer.from("mk_proyectos").select("id, tienda, tienda_codigo"),
  ]);
  if (fRes.error || eRes.error || pRes.error) {
    return NextResponse.json({ error: "No se pudo leer la lista" }, { status: 500 });
  }

  const proyectos = new Map(
    ((pRes.data ?? []) as Array<{ id: string; tienda: string | null; tienda_codigo: string | null }>).map(
      (p) => [String(p.id), p] as const,
    ),
  );
  const esPropia = (tiendaCodigo: string | null, proyectoId: string | null) =>
    gastoEsDeMultifashion({
      tiendaCodigo,
      proyecto: proyectoId ? (proyectos.get(String(proyectoId)) ?? null) : null,
    });

  const filas: FilaNoRecuperable[] = [];
  for (const f of (fRes.data ?? []) as FacturaLeida[]) {
    const motivo = motivoNoRecuperable({
      esTiendaPropia: esPropia(f.tienda_codigo, f.proyecto_id),
      pctALaMarca: f.pct_a_la_marca,
      seReporta: f.se_reporta,
    });
    if (!motivo) continue;
    filas.push({
      id: String(f.id),
      tipo: "factura",
      fecha: String(f.fecha_factura ?? "").slice(0, 10),
      numero: String(f.numero_factura ?? ""),
      proveedor: String(f.proveedor ?? ""),
      concepto: String(f.concepto ?? ""),
      tiendaCodigo: f.tienda_codigo,
      tiendaNombre: "",
      motivo,
      total: Number(f.total ?? 0),
    });
  }
  for (const e of (eRes.data ?? []) as EntregaLeida[]) {
    const motivo = motivoNoRecuperable({
      esTiendaPropia: esPropia(e.tienda_codigo, e.proyecto_id),
      seReporta: e.se_reporta,
    });
    if (!motivo) continue;
    filas.push({
      id: String(e.id),
      tipo: "entrega",
      fecha: String(e.created_at ?? "").slice(0, 10),
      numero: e.numero != null ? String(e.numero) : "",
      proveedor: "Mobiliario",
      concepto: String(e.notas ?? "") || "Entrega de mobiliario",
      tiendaCodigo: e.tienda_codigo,
      tiendaNombre: "",
      motivo,
      total: Number(e.total ?? 0),
    });
  }

  // El nombre del directorio, por código: una sola lectura chica.
  const codigos = Array.from(new Set(filas.map((f) => f.tiendaCodigo).filter((c): c is string => !!c)));
  if (codigos.length > 0) {
    const { data } = await supabaseServer.from("clientes_master").select("codigo, nombre").in("codigo", codigos);
    const nombre = new Map(
      ((data ?? []) as Array<{ codigo: string; nombre: string | null }>).map((c) => [c.codigo, c.nombre ?? ""]),
    );
    for (const f of filas) f.tiendaNombre = (f.tiendaCodigo && nombre.get(f.tiendaCodigo)) || "";
  }

  return NextResponse.json(ordenarNoRecuperables(filas));
}
