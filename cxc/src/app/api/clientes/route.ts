// ─────────────────────────────────────────────────────────────────────────────
// GET /api/clientes  (Sprint 1 Fase 4D)
//
// Lista paginada de clientes_master con búsqueda por nombre/código y filtro
// por provincia. Es el reemplazo del módulo Directorio.
//
// Query params:
//   q          búsqueda (ilike sobre nombre y codigo)
//   provincia  filtro exacto
//   page       1-indexed, default 1
//   limit      default 50, max 200
//
// Devuelve:
//   { clientes: Cliente[], total: number, page: number, limit: number,
//     provincias: string[] }
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["admin", "director", "secretaria", "vendedor", "bodega"];

export async function GET(req: NextRequest) {
  const authError = requireAuth(req, ALLOWED_ROLES);
  if (authError) return authError;

  const url = req.nextUrl;
  const q = (url.searchParams.get("q") ?? "").trim();
  const provincia = (url.searchParams.get("provincia") ?? "").trim();
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "50", 10) || 50;
  const limit = Math.min(200, Math.max(1, limitRaw));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabaseServer
    .from("clientes_master")
    .select("id, codigo, nombre, telefono, celular, email, provincia", { count: "exact" })
    .eq("deleted", false);

  if (q) {
    // Match en nombre OR codigo (case-insensitive)
    const safe = q.replace(/[%_]/g, ""); // evitar wildcards de usuario
    query = query.or(`nombre.ilike.%${safe}%,codigo.ilike.%${safe}%`);
  }
  if (provincia) {
    query = query.eq("provincia", provincia);
  }

  query = query.order("nombre", { ascending: true }).range(from, to);

  const [{ data: clientes, count, error }, provinciasRes] = await Promise.all([
    query,
    supabaseServer
      .from("clientes_master")
      .select("provincia")
      .eq("deleted", false)
      .not("provincia", "is", null),
  ]);

  if (error) {
    console.error("[api/clientes] list error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const provincias = [
    ...new Set(
      (provinciasRes.data ?? [])
        .map(r => (r.provincia ?? "").trim())
        .filter(Boolean) as string[],
    ),
  ].sort((a, b) => a.localeCompare(b, "es"));

  return NextResponse.json({
    clientes: clientes ?? [],
    total: count ?? 0,
    page,
    limit,
    provincias,
  });
}
