// Marketing › Mobiliario — notas del proveedor. Edición y borrado.
//
// 🔴 SOLO ADMIN en el SERVIDOR. Ver el comentario de ../route.ts.
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import {
  deleteNotaProveedor,
  updateNotaProveedor,
} from "@/lib/marketing/notas-proveedor-server";
import { validarNotaProveedor } from "@/lib/marketing/notas-proveedor";
import { logActivity } from "@/lib/log-activity";

export const dynamic = "force-dynamic";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  if (!uuidRegex.test(params.id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  try {
    const body = (await req.json()) as {
      producto?: string;
      precio?: string;
      nota?: string;
      fotoPaths?: string[];
    };
    const validada = validarNotaProveedor(body);
    if (!validada.ok) {
      return NextResponse.json({ error: validada.error }, { status: 400 });
    }
    const nota = await updateNotaProveedor(params.id, validada.valor);
    logActivity(
      auth.role,
      "mobiliario_nota_proveedor_editada",
      "marketing",
      { id: params.id, producto: nota.producto },
      auth.userName,
    ).catch(() => {});
    return NextResponse.json(nota);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    console.error("marketing/mobiliario/notas-proveedor/[id] PUT:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  if (!uuidRegex.test(params.id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  try {
    await deleteNotaProveedor(params.id);
    logActivity(
      auth.role,
      "mobiliario_nota_proveedor_eliminada",
      "marketing",
      { id: params.id },
      auth.userName,
    ).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    console.error("marketing/mobiliario/notas-proveedor/[id] DELETE:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
