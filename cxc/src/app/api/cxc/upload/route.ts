import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { logActivity } from "@/lib/log-activity";

export const dynamic = "force-dynamic";

interface CxcRowPayload {
  codigo?: string;
  nombre?: string;
  nombre_normalized: string;
  correo?: string;
  telefono?: string;
  celular?: string;
  contacto?: string;
  pais?: string;
  provincia?: string;
  distrito?: string;
  corregimiento?: string;
  limite_credito?: number;
  limite_morosidad?: number;
  d0_30?: number;
  d31_60?: number;
  d61_90?: number;
  d91_120?: number;
  d121_180?: number;
  d181_270?: number;
  d271_365?: number;
  mas_365?: number;
  total?: number;
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  let body: { companyKey?: string; filename?: string; rows?: CxcRowPayload[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { companyKey, filename, rows } = body;

  if (!companyKey || typeof companyKey !== "string") {
    return NextResponse.json({ error: "companyKey requerido" }, { status: 400 });
  }
  if (!filename || typeof filename !== "string") {
    return NextResponse.json({ error: "filename requerido" }, { status: 400 });
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "rows debe ser un array no vacío" }, { status: 400 });
  }

  const { data, error } = await supabaseServer.rpc("save_cxc_upload", {
    p_company_key: companyKey,
    p_filename: filename,
    p_rows: rows,
  });

  if (error) {
    console.error("[cxc/upload] RPC error", error.code, error.message);
    // 23505 = unique_violation: duplicado de nombre_normalized en el mismo upload
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "El archivo tiene clientes con nombres duplicados después de normalizar. Revisa el reporte CSV.", detail: error.message },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Error al guardar la carga", detail: error.message },
      { status: 500 },
    );
  }

  const result = data as { upload_id: string; count: number };

  await logActivity(
    auth.role,
    "cxc_upload",
    "upload",
    { companyKey, filename, count: result.count, uploadId: result.upload_id },
    auth.userName,
  );

  return NextResponse.json({ ok: true, upload_id: result.upload_id, count: result.count });
}
