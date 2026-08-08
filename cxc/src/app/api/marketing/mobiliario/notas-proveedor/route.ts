// Marketing › Mobiliario — notas del proveedor. Lista y alta.
//
// 🔴 SOLO ADMIN, y el candado es ESTE, no la UI.
//    Daniel: "solo info personal". La secretaria entra a Mobiliario pero no
//    debe ver estos costos. Esconder el bloque en el cliente no cierra nada
//    (el `allowedRoles` de `useAuth` es decorativo — ver la nota de Catálogos
//    en CLAUDE.md), así que la puerta real es `requireRole(req, ["admin"])`:
//    con rol `secretaria` devuelve 403 aunque se llame la URL a mano.
//    ⚠️ NO usar `requireAdmin` de api-auth.ts: ese incluye a la secretaria.
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import {
  createNotaProveedor,
  listNotasProveedor,
} from "@/lib/marketing/notas-proveedor-server";
import { validarNotaProveedor } from "@/lib/marketing/notas-proveedor";
import { logActivity } from "@/lib/log-activity";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  try {
    // Degrada limpio si falta la migración: devuelve lista vacía +
    // ddlPendiente, y la pantalla explica qué falta.
    const data = await listNotasProveedor();
    const res = NextResponse.json(data);
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    console.error("marketing/mobiliario/notas-proveedor GET:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
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
    const nota = await createNotaProveedor(validada.valor);
    logActivity(
      auth.role,
      "mobiliario_nota_proveedor_creada",
      "marketing",
      { id: nota.id, producto: nota.producto },
      auth.userName,
    ).catch(() => {});
    return NextResponse.json(nota);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    console.error("marketing/mobiliario/notas-proveedor POST:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
