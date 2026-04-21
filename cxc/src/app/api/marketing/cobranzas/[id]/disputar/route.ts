import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { marcarCobranzaDisputada } from "@/lib/marketing/mutations";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireRole(req, ["admin", "secretaria", "director"]);
  if (auth instanceof NextResponse) return auth;

  try {
    await marcarCobranzaDisputada(params.id);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
