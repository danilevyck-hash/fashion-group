// ============================================================================
// Marketing › PROVEEDORES — la lista y la ficha (6-oct-2026)
//
// 🔴 SOLO LEE. No escribe una fila.
//
// Una petición trae TODO lo que la pestaña necesita: la lista de proveedores y,
// si se pide uno, su ficha. El agrupado por alias, los destinos y los dos
// totales los hace el módulo PURO (`lib/marketing/proveedores-2026-10.ts`); acá
// solo se leen las filas y se les pone el nombre de la marca y de la tienda.
//
// 🔴 Falla ABIERTA sin la migración `20270101120000_mkt_proveedores.sql`: se
// relee sin `destino_sin_marca` y toda factura sin marca sale como «Costo
// propio», que es lo que hay hoy (`columnas-opcionales.ts`).
//
// 🔴 Apagado el interruptor contesta **404**: la pestaña no existe todavía.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import {
  MKT_SOLO_COBRABLE_2026_10,
  facturasEnPeriodoCerrado,
} from "@/lib/marketing/solo-cobrable-2026-10";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { ROLES_MARKETING } from "@/lib/marketing/roles";
import { TIENDA_GENERAL } from "@/lib/marketing/gasto";
import { esColumnaAusente } from "@/lib/marketing/columnas-opcionales";
import {
  MKT_PROVEEDORES_2026_10,
  fichaDeProveedor,
  listaDeProveedores,
  pctALaMarcaDe,
  type GastoDelProveedor,
} from "@/lib/marketing/proveedores-2026-10";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COLUMNAS_CON =
  "id, numero_factura, fecha_factura, proveedor, concepto, total, se_reporta, tienda_codigo, pct_a_la_marca, impulsadora_id";
const COLUMNAS_SIN =
  "id, numero_factura, fecha_factura, proveedor, concepto, total, se_reporta, tienda_codigo, impulsadora_id";

interface FilaFactura {
  id: string;
  numero_factura: string | null;
  fecha_factura: string | null;
  proveedor: string | null;
  concepto: string | null;
  total: number | null;
  se_reporta?: boolean | null;
  tienda_codigo?: string | null;
  pct_a_la_marca?: number | null;
  impulsadora_id?: string | null;
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, [...ROLES_MARKETING]);
  if (auth instanceof NextResponse) return auth;
  if (!MKT_PROVEEDORES_2026_10) {
    return NextResponse.json({ error: "No disponible" }, { status: 404 });
  }
  try {
    // 🔴 Solo las VIVAS: lo anulado no sale del servidor hacia ninguna pantalla
    // (23-sep-2026, «el período manda»).
    const leer = (cols: string) =>
      supabaseServer.from("mk_facturas").select(cols).is("anulado_en", null).limit(2000);
    let res = await leer(COLUMNAS_CON);
    if (res.error && esColumnaAusente(res.error)) res = await leer(COLUMNAS_SIN);
    if (res.error) throw new Error(res.error.message);
    const filas = (res.data ?? []) as unknown as FilaFactura[];

    const ids = filas.map((f) => String(f.id));
    const codigos = [
      ...new Set(
        filas
          .map((f) => String(f.tienda_codigo ?? "").trim())
          .filter((c) => c.length > 0),
      ),
    ];
    const [marcasRes, fmRes, tiendasRes] = await Promise.all([
      supabaseServer.from("mk_marcas").select("id, nombre"),
      ids.length > 0
        ? supabaseServer
            .from("mk_factura_marcas")
            .select("factura_id, marca_id, porcentaje")
            .in("factura_id", ids)
        : Promise.resolve({ data: [], error: null }),
      codigos.length > 0
        ? supabaseServer.from("clientes_master").select("codigo, nombre").in("codigo", codigos)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (marcasRes.error) throw new Error(marcasRes.error.message);

    // 🔴 SOLO LO COBRABLE (7-oct-2026, apagado): lo que está en un período
    // CERRADO está cobrado (Daniel). Dos lecturas chicas: los cerrados y sus
    // sellos de factura. Apagado, no se lee nada de esto.
    let cobradas: Set<string> | null = null;
    if (MKT_SOLO_COBRABLE_2026_10) {
      const [perRes, selRes] = await Promise.all([
        supabaseServer.from("mk_periodos").select("id, estado"),
        supabaseServer.from("mk_periodo_documentos").select("periodo_id, tipo, documento_id"),
      ]);
      if (perRes.error) throw new Error(perRes.error.message);
      if (selRes.error) throw new Error(selRes.error.message);
      cobradas = facturasEnPeriodoCerrado(
        (perRes.data ?? []) as Array<{ id: string; estado: string | null }>,
        (selRes.data ?? []) as Array<{ periodo_id: string; tipo: string | null; documento_id: string }>,
      );
    }

    const nombreMarca = new Map<string, string>();
    for (const m of (marcasRes.data ?? []) as Array<{ id: string; nombre: string }>) {
      nombreMarca.set(String(m.id), String(m.nombre ?? ""));
    }
    const nombreTienda = new Map<string, string>();
    for (const t of (tiendasRes.data ?? []) as Array<{ codigo: string; nombre: string }>) {
      nombreTienda.set(String(t.codigo), String(t.nombre ?? ""));
    }
    // Las marcas de cada factura, con su porcentaje: así el reparto se VE.
    const marcasDe = new Map<string, Array<{ nombre: string; porcentaje: number }>>();
    for (const r of (fmRes.data ?? []) as Array<{
      factura_id: string;
      marca_id: string;
      porcentaje: number | null;
    }>) {
      const fid = String(r.factura_id);
      const arr = marcasDe.get(fid) ?? [];
      arr.push({
        nombre: nombreMarca.get(String(r.marca_id)) ?? "",
        porcentaje: Number(r.porcentaje ?? 0),
      });
      marcasDe.set(fid, arr);
    }

    const gastos: GastoDelProveedor[] = filas.map((f) => {
      const marcas = (marcasDe.get(String(f.id)) ?? []).filter((m) => m.nombre.length > 0);
      const codigo = String(f.tienda_codigo ?? "").trim();
      return {
        id: String(f.id),
        proveedor: String(f.proveedor ?? ""),
        fecha: String(f.fecha_factura ?? ""),
        numeroFactura: String(f.numero_factura ?? ""),
        concepto: String(f.concepto ?? ""),
        monto: Number(f.total ?? 0),
        // 🔴 UNA marca por factura, siempre (`exigirUnaMarca`). Lo que Daniel
        // pidió es CUÁNTO se le cobra, y va en `pctALaMarca`.
        marcaNombre: marcas.length > 0 ? marcas[0].nombre : null,
        tiendaNombre: codigo.length > 0 ? (nombreTienda.get(codigo) ?? codigo) : null,
        pctALaMarca: pctALaMarcaDe(f.pct_a_la_marca),
        seReporta: f.se_reporta !== false,
        ...(cobradas ? { cobrado: cobradas.has(String(f.id)) } : {}),
      };
    });

    const clave = String(req.nextUrl.searchParams.get("prov") ?? "").trim();
    return NextResponse.json({
      lista: listaDeProveedores(gastos),
      ficha: clave.length > 0 ? fichaDeProveedor(clave, gastos) : null,
      cajonGeneral: TIENDA_GENERAL,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("GET /api/marketing/proveedores-ficha:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
