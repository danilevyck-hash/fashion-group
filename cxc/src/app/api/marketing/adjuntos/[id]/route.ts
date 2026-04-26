import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { deleteAdjunto } from "@/lib/marketing/mutations";
import { esPathStorage } from "@/lib/marketing/storage";
import { logAudit } from "@/lib/marketing/audit";

export const dynamic = "force-dynamic";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Fallback para filas antiguas que guardaron la URL firmada completa.
function extraerPathDesdeUrlFirmada(url: string): string | null {
  const marker = "/marketing/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const resto = url.slice(idx + marker.length);
  const sinQuery = resto.split("?")[0];
  return sinQuery.length > 0 ? sinQuery : null;
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;
  if (!uuidRegex.test(params.id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  try {
    // Lookup para borrar también el objeto físico en Storage si aplica
    const { data: row, error: lookupError } = await supabaseServer
      .from("mk_adjuntos")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();
    if (lookupError) throw new Error(lookupError.message);
    if (!row) {
      return NextResponse.json(
        { error: "Adjunto no encontrado" },
        { status: 404 },
      );
    }

    const urlValue = String((row as { url: string }).url);
    const path = esPathStorage(urlValue)
      ? urlValue
      : extraerPathDesdeUrlFirmada(urlValue);
    if (path) {
      // Best-effort: si el storage falla, seguimos borrando la fila.
      const { error: storageError } = await supabaseServer.storage
        .from("marketing")
        .remove([path]);
      if (storageError) {
        console.warn(
          "marketing/adjuntos DELETE storage warning:",
          storageError.message,
        );
      }
    }

    await deleteAdjunto(params.id);

    await logAudit({
      action: "delete_definitivo",
      entityType: "mk_adjuntos",
      entityId: params.id,
      userRole: auth.role,
      userName: auth.userName,
      before: row,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "No se pudo eliminar el adjunto";
    console.error("marketing/adjuntos/[id] DELETE:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
