import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { abrirPeriodo } from "@/lib/caja/abrir-periodo";
import { getSession } from "@/lib/require-auth";
import { totalGastado } from "@/lib/caja/dinero";
import { pegarResponsables } from "@/lib/caja/responsable-lectura";

const CAJA_ROLES = ["admin", "secretaria"];

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, CAJA_ROLES);
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await supabaseServer
    .from("caja_periodos")
    .select("*, caja_gastos(total, deleted)")
    .eq("deleted", false)
    .order("numero", { ascending: false });

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }

  const result = (data || []).map((p) => {
    const vivos = (p.caja_gastos || []).filter((g: { deleted?: boolean }) => !g.deleted);
    return {
      ...p,
      // Redondeado a centavos: sumar 26 recibos en coma flotante daba
      // 200.00000000000003 y el período se pintaba en rojo con «−$0.00».
      total_gastado: totalGastado(vivos as Array<{ total: number | null }>),
      recibos: vivos.length,
    };
  });

  return NextResponse.json(await pegarResponsables(result));
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, CAJA_ROLES);
  if (auth instanceof NextResponse) return auth;
  if (!auth.userId) return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });

  let fondo = 200;
  let responsable = "";
  try {
    const body = await req.json();
    if (body.fondo_inicial && !isNaN(Number(body.fondo_inicial))) {
      fondo = Number(body.fondo_inicial);
    }
    if (typeof body.responsable_empleado_codigo === "string") {
      responsable = body.responsable_empleado_codigo.trim();
    }
  } catch { /* empty body = default fondo */ }

  const session = getSession(req);
  const apertura = await abrirPeriodo(fondo, auth.userId, {
    responsableEmpleadoCodigo: responsable,
    rol: session?.role ?? auth.role,
    userName: session?.userName ?? auth.userName,
  });
  if (!apertura.periodo) {
    return NextResponse.json({ error: apertura.motivo || "Error interno" }, { status: apertura.motivo ? 400 : 500 });
  }
  return NextResponse.json(apertura.periodo);
}
