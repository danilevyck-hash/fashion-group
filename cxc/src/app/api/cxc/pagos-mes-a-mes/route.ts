// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cxc/pagos-mes-a-mes?codigo=D-25 (27-nov-2026, `MANTENER_PRESIONADO_2026_11`)
//
// Mantener presionado un cliente en CxC (celular): lo que PAGÓ mes a mes este
// año contra el año pasado, y sus teléfonos del directorio para el menú de
// abajo (Llamar · WhatsApp · Copiar código).
//
// 🔴 LA MISMA REGLA DE «ÚLTIMOS PAGOS» (`/api/cxc/ultimos-pagos`): sin
// retenciones y sin recibos en cero, EMPRESA POR EMPRESA con la empresa en la
// MISMA cadena (las 6 de `CXC_GRUPO_EMPRESA_KEYS`): Boston NO entra; tiene su
// propia ruta (`/api/cxc/boston/pagos-mes-a-mes`). El vendedor, solo su empresa.
// 🔴 El mes en curso va contra los mismos días del año pasado, con el día de
// Panamá (`hoyPanama`). Solo lectura.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { CXC_GRUPO_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { hoyPanama } from "@/lib/fecha-panama";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { desdeParaComparar, mesesContraAnioPasado, type FilaConMonto } from "@/lib/mes-contra-anio-pasado";
import { MANTENER_PRESIONADO_2026_11 } from "@/lib/ui/mantener-presionado-2026-11";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Los mismos roles que `/api/cxc/ultimos-pagos`.
const CXC_ROLES = ["admin", "secretaria", "vendedor"];

/** Los recibos REALES de un cliente en UNA empresa del grupo desde `desde`. */
async function pagosDe(empresa: string, codigo: string, desde: string): Promise<FilaConMonto[]> {
  const filas = await leerTodoPaginado<{ fecha: string; total: unknown }>(`switch_recibos ${empresa}/${codigo}`, (pedirCount, a, b) =>
    supabaseServer
      .from("switch_recibos")
      .select("fecha,total", pedirCount ? { count: "exact" } : {})
      .eq("empresa_key", empresa)
      .eq("cliente_codigo", codigo)
      .eq("es_retencion", false)
      .neq("total", 0)
      .gte("fecha", desde)
      .order("id", { ascending: true })
      .range(a, b),
  );
  return filas.map((r) => ({ fecha: String(r.fecha), monto: Number(r.total) || 0 }));
}

export async function GET(req: NextRequest) {
  if (!MANTENER_PRESIONADO_2026_11) return NextResponse.json({ error: "Apagado" }, { status: 404 });
  const auth = requireRole(req, CXC_ROLES);
  if (auth instanceof NextResponse) return auth;

  const codigo = (req.nextUrl.searchParams.get("codigo") ?? "").trim();
  if (!codigo) return NextResponse.json({ error: "codigo requerido" }, { status: 400 });

  // Vendedor: solo su empresa asociada (misma regla que «Últimos pagos»).
  let empresas: readonly string[] = CXC_GRUPO_EMPRESA_KEYS;
  if (auth.role === "vendedor" && auth.userId) {
    const { data: u } = await supabaseServer.from("fg_users").select("associated_company").eq("id", auth.userId).maybeSingle();
    const asociada = u?.associated_company ?? null;
    if (asociada) empresas = (CXC_GRUPO_EMPRESA_KEYS as readonly string[]).includes(asociada) ? [asociada] : [];
  }

  const hoy = hoyPanama();
  const desde = desdeParaComparar(hoy);
  let pagos: FilaConMonto[];
  try {
    pagos = (await Promise.all(empresas.map((e) => pagosDe(e, codigo, desde)))).flat();
  } catch (e) {
    console.error(`[cxc/pagos-mes-a-mes] ${codigo}: ${e instanceof Error ? e.message : e}`);
    return NextResponse.json({ error: "No se pudieron leer los pagos" }, { status: 500 });
  }

  // Teléfonos del DIRECTORIO del grupo. Falla abierto: sin ellos, el menú no los ofrece.
  const { data: dir } = await supabaseServer.from("clientes_master").select("telefono,celular").eq("codigo", codigo).maybeSingle();

  return NextResponse.json({
    codigo,
    empresas,
    ...mesesContraAnioPasado(pagos, hoy),
    telefono: ((dir?.telefono as string | null) ?? "").trim(),
    celular: ((dir?.celular as string | null) ?? "").trim(),
  });
}
