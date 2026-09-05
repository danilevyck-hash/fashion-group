// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cxc/boston/estado-cuenta?codigo=<codigo de Boston>
//
// Los DOCUMENTOS con saldo de UN cliente de Confecciones Boston, para el cajón
// de su cartera.
//
// 🔴 ES UNA RUTA APARTE, CON SU PROPIA CONSULTA, A PROPÓSITO. No reusa
// `fetchEstadoCuentaData` —el helper del GRUPO— aunque haga casi lo mismo:
// ese helper recibe una LISTA de empresas y bastaría con pasarle
// `["confecciones_boston"]` para mezclar los dos mundos por descuido. Mientras
// sean dos caminos, mezclar la plata de Boston con la del grupo no es algo que
// se pueda hacer sin proponérselo. Regla de Daniel: *"debe de ser cxc de
// fashion group y otro aparte de boston, no deben de ni convivir juntos."*
//
// 🔴 `.eq("empresa_key", "confecciones_boston")` va EN LA MISMA CADENA de la
// consulta, no en una proyección posterior: es lo que el barrido de
// `cxc-boston-fuera-de-toda-superficie.test.ts` exige de toda lectura de
// `switch_estadocuenta`.
//
// El signo por tipo de comprobante es el MISMO que usa la vista
// `switch_estadocuenta_aging_boston` (débito suma, crédito resta, desconocido
// vale 0), así que el total del cajón cuadra al centavo con el de la lista.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { rolesBoston } from "@/lib/cxc/boston-roles";
import { CREDITO, DEBITO } from "@/lib/cxc/estado-cuenta-data";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** La ÚNICA empresa de esta cartera. Constante del servidor, nunca de la URL. */
const EMPRESA_BOSTON = "confecciones_boston";

const round = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0) || 0);

/** Mismo signo que la vista de aging de Boston. */
function signo(tipo: string): number {
  if (CREDITO.has(tipo)) return -1;
  if (DEBITO.has(tipo)) return 1;
  return 0;
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, rolesBoston());
  if (auth instanceof NextResponse) return auth;

  const codigo = (req.nextUrl.searchParams.get("codigo") ?? "").trim();
  if (!codigo) return NextResponse.json({ error: "codigo requerido" }, { status: 400 });

  const { data, error } = await supabaseServer
    .from("switch_estadocuenta")
    .select("secuencial, numero_fiscal, tipo_comprobante, fecha_creacion, total, saldo, dias")
    .eq("empresa_key", EMPRESA_BOSTON)
    .eq("cliente_codigo", codigo)
    .neq("saldo", 0)
    .order("fecha_creacion", { ascending: true });

  if (error) {
    console.error(`[cxc/boston/estado-cuenta] ${error.message}`);
    return NextResponse.json({ error: "Error al leer el estado de cuenta" }, { status: 500 });
  }

  let total = 0;
  const documentos = (data ?? []).map((r) => {
    const fila = r as Record<string, unknown>;
    const tipo = (fila.tipo_comprobante as string | null) ?? "";
    const saldo = round(signo(tipo) * num(fila.saldo));
    total += saldo;
    return {
      numero: (fila.secuencial as string | null) || (fila.numero_fiscal as string | null) || "—",
      fecha: (fila.fecha_creacion as string | null) ?? null,
      tipo,
      monto: round(num(fila.total)),
      saldo,
      dias: (fila.dias as number | null) ?? null,
    };
  });

  return NextResponse.json({
    codigo,
    documentos,
    total: round(total),
    generadoEn: new Date().toISOString(),
  });
}
