/**
 * Comisiones › «Buscar cliente» (3-nov-2026). SOLO LEE.
 * Las facturas y cobros de un cliente en el período, en la empresa elegida (o
 * las 6 del grupo con «Todas»), con a quién le contó cada uno o por qué no.
 * 🔴 `empresa` se valida contra las 6 del grupo: Boston y ACS contestan 400.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { MES_TODO_EL_ANIO } from "@/lib/comisiones/periodo";
import { empresasDeLaBusqueda } from "@/lib/comisiones/buscar-cliente";
import { buscarClienteEnComisiones } from "@/lib/comisiones/buscar-cliente-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "contabilidad", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  const year = parseInt(sp.get("year") ?? "", 10);
  const mes = parseInt(sp.get("mes") ?? "", 10);
  const empresas = empresasDeLaBusqueda(sp.get("empresa"));
  if (!empresas) return NextResponse.json({ error: "Empresa no válida para Comisiones" }, { status: 400 });
  if (!Number.isInteger(year) || year < 2024 || year > 2100 || !Number.isInteger(mes) || mes < 0 || mes > 12) {
    return NextResponse.json({ error: "Período no válido" }, { status: 400 });
  }
  if (q.length < 2) return NextResponse.json({ clientes: [] });
  const mm = String(mes).padStart(2, "0");
  const inicio = mes === MES_TODO_EL_ANIO ? `${year}-01-01` : `${year}-${mm}-01`;
  const fin = mes === MES_TODO_EL_ANIO
    ? `${year}-12-31`
    : `${year}-${mm}-${String(new Date(Date.UTC(year, mes, 0)).getUTCDate()).padStart(2, "0")}`;

  try {
    const clientes = await buscarClienteEnComisiones(supabaseServer, { q, inicio, fin, empresas });
    return NextResponse.json({ clientes });
  } catch (err) {
    console.error("[comisiones/buscar-cliente]", err);
    return NextResponse.json(
      { error: "No se pudo leer la comisión del cliente. Vuelve a intentar en un momento." },
      { status: 500 },
    );
  }
}
