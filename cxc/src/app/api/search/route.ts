import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { calcularSaldoPrestamo, type MovimientoParaSaldo } from "@/lib/prestamos-saldo";
import { transportistaLabel } from "@/lib/transportistaLabel";
import { EMPRESAS_DEL_GRUPO } from "@/lib/clientes/mundos";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// EL BUSCADOR (⌘K) DEVUELVE SOLO CLIENTES DE LAS 6 DEL GRUPO.
//
// 🩸 LA REGLA, cerrada con Daniel (30-jul-2026): los clientes de Boston viven
// SOLO en la pestaña CXC › Boston y los de Multifashion SOLO en su módulo. Las
// 6 del grupo conviven en todos lados. Sobre perder la búsqueda por nombre del
// saldo de un cliente de Boston, textual: *"no aparezca nunca"*.
//
// ⚠️ **ACÁ NO ENTRAN POR `clientes_master`**, que es lo que filtró el PR del
// Directorio. En el buscador los clientes llegan por otras dos puertas, cada
// una con su propia columna de empresa:
//
//   sección     tabla                          columna         filas de fuera
//   ─────────────────────────────────────────────────────────────────────────
//   ventas      switch_facturas                empresa_key     37.205 de 52.480
//   cxc         switch_estadocuenta_aging      company_key     0 de 221 (hoy)
//   cheques     cheques                        empresa         0 de 19 (hoy)
//
// Los ceros NO son motivo para no filtrar: el cron de estado de cuenta ya trae
// `confecciones_boston` a `switch_estadocuenta` desde el 27-jul, y el día que
// eso llegue al agregado el buscador se llenaría de Boston sin que nadie lo
// tocara. El filtro es por INCLUSIÓN (`.in(...)` con las 6), así que una empresa
// nueva tampoco contamina hasta que alguien la agregue a `EMPRESAS_DEL_GRUPO`.
//
// La lista de las 6 NO se escribe acá: sale de `@/lib/clientes/mundos`, que es
// la única fuente de verdad. Este repo ya se quemó con listas repartidas que se
// contradecían en silencio.
//
// CONSECUENCIA MEDIDA Y QUERIDA: 13 nombres compran en los dos mundos (CITY
// MALL DAVID, LA FRONTERA DUTY FREE…). Para ellos el buscador ahora muestra
// **sus ventas del grupo**, no la suma con Boston/Multifashion. Es lo mismo que
// hace Ventas › Clientes. Los totales del MÓDULO Ventas y de Vista General no
// se tocan: la plata de los tres mundos sigue sumando ahí.
//
// Lo que NO se filtra, y por qué:
//   · el bloque «Directorio» lee `clientes_master`, que es SOLO del grupo por
//     construcción (el sync pide por inclusión): no hay nada que filtrar.
//     🩸 Hasta el 5-sep-2026 leía `directorio_clientes`, la libreta de 33
//     contactos escrita a mano antes de que el directorio viniera de Switch —
//     sin código en 8 de ellos, con correos distintos a los reales y sin una
//     entrada nueva desde el 28-may. Daniel: *«si ningún módulo toca esa lista,
//     bórralo»*. La tabla queda (congelada, respaldada), sin un solo lector.
//   · guías, reclamos, préstamos y caja no buscan por nombre de cliente
//     (transportista, nro de reclamo/factura, empleado y proveedor).
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "vendedor", "bodega", "contabilidad"]); if (auth instanceof NextResponse) return auth;
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ cxc: [], reclamos: [], guias: [], directorio: [], cheques: [], ventas: [], prestamos: [], caja: [] });
  }

  const pattern = `%${q}%`;

  const [cxcRes, reclamosRes, guiasRes, dirRes, chequesRes, ventasRes, prestamosRes, cajaRes] = await Promise.all([
    // CxC: buscar por nombre (agregado por cliente vía switch_estadocuenta_aging)
    supabaseServer
      .from("switch_estadocuenta_aging")
      .select("id, nombre_normalized, total, company_key")
      .in("company_key", EMPRESAS_DEL_GRUPO)
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

    // Guías: buscar por observaciones (texto libre del usuario). El match
    // por nombre del transportista se hace en una 2da query más abajo
    // (transportistas → guia_transporte vía FK), porque PostgREST no expone
    // un OR mixto entre la tabla base y una relación joined.
    supabaseServer
      .from("guia_transporte")
      .select("id, numero, fecha, modo_entrega, transportista_id, transportistas(nombre), estado")
      .ilike("observaciones", pattern)
      .eq("deleted", false)
      .order("numero", { ascending: false })
      .limit(5),

    // Directorio: el de verdad (`clientes_master`, 150 del grupo, por CÓDIGO).
    // Se busca por nombre o por código; los ausentes de Switch no se ofrecen.
    supabaseServer
      .from("clientes_master")
      .select("id, nombre, codigo, email, celular")
      .eq("deleted", false)
      .is("ausente_desde", null)
      .or(`nombre.ilike.${pattern},codigo.ilike.${pattern}`)
      .order("nombre")
      .limit(5),

    // Cheques: buscar por cliente
    supabaseServer
      .from("cheques")
      .select("id, cliente, monto, fecha_deposito, estado")
      .in("empresa", EMPRESAS_DEL_GRUPO)
      .ilike("cliente", pattern)
      .order("fecha_deposito", { ascending: false })
      .limit(5),

    // Ventas: buscar por cliente en switch_facturas (fuente única, fresco).
    // Alias PostgREST → el consumidor sigue leyendo row.cliente/empresa/subtotal/fecha.
    // Búsqueda fuzzy: total indicativo (subtotal_descuento magnitud, sin firmar NC).
    supabaseServer
      .from("switch_facturas")
      .select("cliente:cliente_nombre, empresa:empresa_key, subtotal:subtotal_descuento, fecha")
      .in("empresa_key", EMPRESAS_DEL_GRUPO)
      .ilike("cliente_nombre", pattern)
      .order("fecha", { ascending: false })
      .limit(50),

    // Préstamos: buscar por nombre en prestamos_empleados
    supabaseServer
      .from("prestamos_empleados")
      .select("id, nombre, empresa, prestamos_movimientos(monto, concepto, estado, deleted, cuenta)")
      .ilike("nombre", pattern)
      // La bandera `activo` se retiró el 5-sep-2026 (nunca significó «trabaja
      // acá»). `deleted` es NULLABLE acá: un `.eq("deleted", false)` pierde filas.
      .or("deleted.is.null,deleted.eq.false")
      .order("nombre")
      .limit(5),

    // Caja: buscar por descripcion o proveedor en caja_gastos
    supabaseServer
      .from("caja_gastos")
      .select("id, descripcion, proveedor, total, fecha, periodo_id")
      .or(`descripcion.ilike.${pattern},proveedor.ilike.${pattern}`)
      .eq("deleted", false)
      .order("fecha", { ascending: false })
      .limit(5),
  ]);

  // Also search guias by numero if q is numeric, plus by transportistas.nombre
  // ilike (Sprint 2: las filas nuevas tienen transportista TEXT en NULL, así
  // que el OR del Promise.all no las matchea por nombre canónico).
  let guiasData = guiasRes.data || [];
  if (/^\d+$/.test(q)) {
    const numRes = await supabaseServer
      .from("guia_transporte")
      .select("id, numero, fecha, modo_entrega, transportista_id, transportistas(nombre), estado")
      .eq("numero", parseInt(q))
      .eq("deleted", false)
      .limit(5);
    if (numRes.data?.length) {
      const existingIds = new Set(guiasData.map((g) => g.id));
      for (const g of numRes.data) {
        if (!existingIds.has(g.id)) guiasData.push(g);
      }
      guiasData = guiasData.slice(0, 5);
    }
  }
  // Search by canonical transportista name (vía FK transportistas → guia_transporte).
  {
    const { data: matchTransp } = await supabaseServer
      .from("transportistas")
      .select("id")
      .ilike("nombre", pattern);
    const ids = (matchTransp || []).map((t) => t.id);
    if (ids.length > 0) {
      const { data: nameRes } = await supabaseServer
        .from("guia_transporte")
        .select("id, numero, fecha, modo_entrega, transportista_id, transportistas(nombre), estado")
        .in("transportista_id", ids)
        .eq("deleted", false)
        .order("numero", { ascending: false })
        .limit(5);
      if (nameRes?.length) {
        const existingIds = new Set(guiasData.map((g) => g.id));
        for (const g of nameRes) {
          if (!existingIds.has(g.id)) guiasData.push(g);
        }
        guiasData = guiasData.slice(0, 5);
      }
    }
  }
  // Resolver display label
  guiasData = guiasData.map((g) => ({ ...g, transportista: transportistaLabel(g) }));

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
  // 🔴 La cuenta del saldo NO se rehace acá: `calcularSaldoPrestamo` es la única
  // (era uno de los ocho lugares que la escribían aparte, hasta el 5-sep-2026).
  const prestamosData: PrestamoResult[] = prestamosRaw.map((emp: { id: string; nombre: string; empresa: string | null; prestamos_movimientos: MovimientoParaSaldo[] }) => ({
    id: emp.id,
    nombre: emp.nombre,
    empresa: emp.empresa,
    saldo: calcularSaldoPrestamo(emp.prestamos_movimientos).saldo,
  }));

  // Module-level permissions per role
  const role = auth.role;
  const empty = { cxc: [], reclamos: [], guias: [], directorio: [], cheques: [], ventas: [], prestamos: [], caja: [] };
  const allResults = {
    cxc: cxcDeduped,
    reclamos: reclamosRes.data || [],
    guias: guiasData,
    // El consumidor (`SearchBar`) sigue leyendo {id, nombre, empresa, correo,
    // celular}: el código va donde antes iba la «empresa» de la libreta.
    directorio: (dirRes.data || []).map((d: { id: string; nombre: string; codigo: string | null; email: string | null; celular: string | null }) => ({
      id: d.id, nombre: d.nombre, empresa: d.codigo ?? "", correo: d.email ?? "", celular: d.celular ?? "",
    })),
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

  // Admin: everything
  return NextResponse.json(allResults);
}
