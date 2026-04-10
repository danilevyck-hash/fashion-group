import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "director", "vendedor", "bodega", "contabilidad"]); if (auth instanceof NextResponse) return auth;
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ cxc: [], reclamos: [], guias: [], directorio: [], cheques: [], ventas: [], prestamos: [], caja: [] });
  }

  const pattern = `%${q}%`;

  const [cxcRes, reclamosRes, guiasRes, dirRes, chequesRes, ventasRes, prestamosRes, cajaRes] = await Promise.all([
    // CxC: buscar por nombre (deduplicated by nombre_normalized)
    supabaseServer
      .from("cxc_rows")
      .select("id, nombre_normalized, total, company_key")
      .ilike("nombre_normalized", pattern)
      .order("total", { ascending: false })
      .limit(20),

    // Reclamos: buscar por nro_reclamo o nro_factura
    supabaseServer
      .from("reclamos")
      .select("id, nro_reclamo, nro_factura, empresa, estado, fecha_reclamo")
      .or(`nro_reclamo.ilike.${pattern},nro_factura.ilike.${pattern}`)
      .eq("deleted", false)
      .order("created_at", { ascending: false })
      .limit(5),

    // Guías: buscar por numero (text) o transportista
    supabaseServer
      .from("guia_transporte")
      .select("id, numero, fecha, transportista, estado")
      .or(`transportista.ilike.${pattern},observaciones.ilike.${pattern}`)
      .order("numero", { ascending: false })
      .limit(5),

    // Directorio: buscar por nombre o empresa
    supabaseServer
      .from("directorio_clientes")
      .select("id, nombre, empresa, correo, celular")
      .or(`nombre.ilike.${pattern},empresa.ilike.${pattern}`)
      .order("nombre")
      .limit(5),

    // Cheques: buscar por cliente
    supabaseServer
      .from("cheques")
      .select("id, cliente, monto, fecha_deposito, estado")
      .ilike("cliente", pattern)
      .order("fecha_deposito", { ascending: false })
      .limit(5),

    // Ventas: buscar por cliente en ventas_raw
    supabaseServer
      .from("ventas_raw")
      .select("cliente, mes, empresa, subtotal, fecha")
      .ilike("cliente", pattern)
      .order("fecha", { ascending: false })
      .limit(50),

    // Préstamos: buscar por nombre en prestamos_empleados
    supabaseServer
      .from("prestamos_empleados")
      .select("id, nombre, empresa, activo, prestamos_movimientos(monto, concepto, estado)")
      .ilike("nombre", pattern)
      .eq("activo", true)
      .order("nombre")
      .limit(5),

    // Caja: buscar por descripcion o proveedor en caja_gastos
    supabaseServer
      .from("caja_gastos")
      .select("id, descripcion, proveedor, total, fecha, periodo_id")
      .or(`descripcion.ilike.${pattern},proveedor.ilike.${pattern}`)
      .order("fecha", { ascending: false })
      .limit(5),
  ]);

  // Also search guias by numero if q is numeric
  let guiasData = guiasRes.data || [];
  if (/^\d+$/.test(q)) {
    const numRes = await supabaseServer
      .from("guia_transporte")
      .select("id, numero, fecha, transportista, estado")
      .eq("numero", parseInt(q))
      .limit(5);
    if (numRes.data?.length) {
      const existingIds = new Set(guiasData.map((g) => g.id));
      for (const g of numRes.data) {
        if (!existingIds.has(g.id)) guiasData.push(g);
      }
      guiasData = guiasData.slice(0, 5);
    }
  }

  // Deduplicate CxC by nombre_normalized — aggregate total across companies
  const cxcRaw = cxcRes.data || [];
  const cxcMap = new Map<string, { id: string; nombre_normalized: string; total: number; company_key: string }>();
  for (const row of cxcRaw) {
    const existing = cxcMap.get(row.nombre_normalized);
    if (existing) {
      existing.total += row.total;
      existing.company_key += `, ${row.company_key}`;
    } else {
      cxcMap.set(row.nombre_normalized, { ...row });
    }
  }
  const cxcDeduped = Array.from(cxcMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // Aggregate ventas by client: latest date and total amount
  const ventasRaw = ventasRes.data || [];
  const ventasMap = new Map<string, { cliente: string; total: number; last_fecha: string; empresa: string }>();
  for (const row of ventasRaw) {
    const key = (row.cliente || "").toUpperCase().trim();
    if (!key) continue;
    const existing = ventasMap.get(key);
    if (existing) {
      existing.total += Number(row.subtotal) || 0;
      if (row.fecha > existing.last_fecha) {
        existing.last_fecha = row.fecha;
        existing.empresa = row.empresa;
      }
    } else {
      ventasMap.set(key, {
        cliente: row.cliente,
        total: Number(row.subtotal) || 0,
        last_fecha: row.fecha || "",
        empresa: row.empresa || "",
      });
    }
  }
  const ventasDeduped = Array.from(ventasMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // Calculate saldo for each prestamo employee
  interface PrestamoResult {
    id: string;
    nombre: string;
    empresa: string | null;
    saldo: number;
  }
  const prestamosRaw = prestamosRes.data || [];
  const prestamosData: PrestamoResult[] = prestamosRaw.map((emp: { id: string; nombre: string; empresa: string | null; prestamos_movimientos: { monto: number; concepto: string; estado: string }[] }) => {
    const movs = emp.prestamos_movimientos || [];
    const prestado = movs
      .filter((m) => (m.concepto === "Préstamo" || m.concepto === "Responsabilidad por daño") && m.estado === "aprobado")
      .reduce((s, m) => s + Number(m.monto), 0);
    const pagado = movs
      .filter((m) => (m.concepto === "Pago" || m.concepto === "Abono extra" || m.concepto === "Pago de responsabilidad") && m.estado === "aprobado")
      .reduce((s, m) => s + Number(m.monto), 0);
    return {
      id: emp.id,
      nombre: emp.nombre,
      empresa: emp.empresa,
      saldo: prestado - pagado,
    };
  });

  // Module-level permissions per role
  const role = auth.role;
  const empty = { cxc: [], reclamos: [], guias: [], directorio: [], cheques: [], ventas: [], prestamos: [], caja: [] };
  const allResults = {
    cxc: cxcDeduped,
    reclamos: reclamosRes.data || [],
    guias: guiasData,
    directorio: dirRes.data || [],
    cheques: chequesRes.data || [],
    ventas: ventasDeduped,
    prestamos: prestamosData,
    caja: cajaRes.data || [],
  };

  // Vendedor: only CXC and Directorio
  if (role === "vendedor") {
    return NextResponse.json({
      ...empty,
      cxc: allResults.cxc,
      directorio: allResults.directorio,
    });
  }

  // Bodega: only Guías and Directorio
  if (role === "bodega") {
    return NextResponse.json({
      ...empty,
      guias: allResults.guias,
      directorio: allResults.directorio,
    });
  }

  // Contabilidad: prestamos and ventas
  if (role === "contabilidad") {
    return NextResponse.json({
      ...empty,
      ventas: allResults.ventas,
      prestamos: allResults.prestamos,
    });
  }

  // Secretaria: everything except ventas and prestamos
  if (role === "secretaria") {
    return NextResponse.json({
      ...allResults,
      ventas: [],
      prestamos: [],
    });
  }

  // Director: everything except prestamos and caja
  if (role === "director") {
    return NextResponse.json({
      ...allResults,
      prestamos: [],
      caja: [],
    });
  }

  // Admin: everything
  return NextResponse.json(allResults);
}
