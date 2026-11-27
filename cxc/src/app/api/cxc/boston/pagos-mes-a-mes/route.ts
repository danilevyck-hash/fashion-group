// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cxc/boston/pagos-mes-a-mes?codigo=9 (27-nov-2026, `MANTENER_PRESIONADO_2026_11`)
//
// El gemelo de `/api/cxc/pagos-mes-a-mes` para la cartera de CONFECCIONES
// BOSTON: solo Boston, con `.eq("empresa_key", "confecciones_boston")` en la
// MISMA cadena y sin compartir ni una función de consulta con el grupo (la
// misma razón que `boston/ultimos-pagos`). El cliente se busca por su
// `cliente_switch_id` (el `codigo` de la cartera no es el de los recibos);
// los teléfonos, de SU directorio (`switch_clientes` de Boston).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { rolesBoston } from "@/lib/cxc/boston-roles";
import { hoyPanama } from "@/lib/fecha-panama";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { desdeParaComparar, mesesContraAnioPasado } from "@/lib/mes-contra-anio-pasado";
import { MANTENER_PRESIONADO_2026_11 } from "@/lib/ui/mantener-presionado-2026-11";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** La ÚNICA empresa que esta ruta puede leer. */
const EMPRESA_BOSTON = "confecciones_boston";

export async function GET(req: NextRequest) {
  if (!MANTENER_PRESIONADO_2026_11) return NextResponse.json({ error: "Apagado" }, { status: 404 });
  const auth = requireRole(req, rolesBoston());
  if (auth instanceof NextResponse) return auth;

  const codigo = (req.nextUrl.searchParams.get("codigo") ?? "").trim();
  if (!codigo) return NextResponse.json({ error: "codigo requerido" }, { status: 400 });

  const { data: fila, error: e1 } = await supabaseServer
    .from("switch_estadocuenta_aging_boston")
    .select("cliente_switch_id")
    .eq("codigo", codigo)
    .limit(1)
    .maybeSingle();
  if (e1) return NextResponse.json({ error: "No se pudieron leer los pagos" }, { status: 500 });
  const id = fila?.cliente_switch_id == null ? null : Number(fila.cliente_switch_id);

  const hoy = hoyPanama();
  let pagos: { fecha: string; monto: number }[] = [];
  if (id != null) {
    try {
      const filas = await leerTodoPaginado<{ fecha: string; total: unknown }>(`switch_recibos boston/${id}`, (pedirCount, a, b) =>
        supabaseServer
          .from("switch_recibos")
          .select("fecha,total", pedirCount ? { count: "exact" } : {})
          .eq("empresa_key", EMPRESA_BOSTON)
          .eq("cliente_switch_id", id)
          .eq("es_retencion", false)
          .neq("total", 0)
          .gte("fecha", desdeParaComparar(hoy))
          .order("id", { ascending: true })
          .range(a, b),
      );
      pagos = filas.map((r) => ({ fecha: String(r.fecha), monto: Number(r.total) || 0 }));
    } catch (e) {
      console.error(`[cxc/boston/pagos-mes-a-mes] ${codigo}: ${e instanceof Error ? e.message : e}`);
      return NextResponse.json({ error: "No se pudieron leer los pagos" }, { status: 500 });
    }
  }

  const { data: dir } = await supabaseServer
    .from("switch_clientes")
    .select("telefono,celular")
    .eq("empresa_key", EMPRESA_BOSTON)
    .eq("codigo", codigo)
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    codigo,
    ...mesesContraAnioPasado(pagos, hoy),
    telefono: ((dir?.telefono as string | null) ?? "").trim(),
    celular: ((dir?.celular as string | null) ?? "").trim(),
  });
}
