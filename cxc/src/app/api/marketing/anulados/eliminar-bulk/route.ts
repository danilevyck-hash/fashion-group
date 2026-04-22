import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import {
  eliminarFacturaPermanente,
  eliminarProyectoPermanente,
} from "@/lib/marketing/mutations";

export const dynamic = "force-dynamic";

type Tipo = "proyecto" | "factura";

interface BulkBody {
  items?: Array<{ tipo?: unknown; id?: unknown }>;
}

function esTipo(t: unknown): t is Tipo {
  return t === "proyecto" || t === "factura";
}

// POST /api/marketing/anulados/eliminar-bulk
//   body: { items: [{ tipo: 'proyecto'|'factura', id: '<uuid>' }, ...] }
// Solo admin/director. Valida que cada item esté anulado antes de borrar.
// Retorna { ok: true, eliminados: N, fallos: [{ tipo, id, error }] }.
export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "director"]);
  if (auth instanceof NextResponse) return auth;

  let body: BulkBody;
  try {
    body = (await req.json()) as BulkBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json({ error: "items requerido" }, { status: 400 });
  }

  let eliminados = 0;
  const fallos: Array<{ tipo: string; id: string; error: string }> = [];

  for (const raw of items) {
    const tipo = raw?.tipo;
    const id = raw?.id;
    if (!esTipo(tipo) || typeof id !== "string" || id.length === 0) {
      fallos.push({
        tipo: String(tipo ?? "?"),
        id: String(id ?? "?"),
        error: "tipo o id inválido",
      });
      continue;
    }
    try {
      if (tipo === "proyecto") await eliminarProyectoPermanente(id);
      else await eliminarFacturaPermanente(id);
      eliminados += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      fallos.push({ tipo, id, error: msg });
    }
  }

  return NextResponse.json({ ok: true, eliminados, fallos });
}
