// ─────────────────────────────────────────────────────────────────────────────
// /clientes  (Sprint 1 Fase 4D)
//
// Reemplaza /directorio. Lista paginada de clientes_master con búsqueda
// y filtro por provincia. Click en un cliente → /clientes/[codigo].
// ─────────────────────────────────────────────────────────────────────────────

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { verifySession } from "@/lib/session-cookie";
import ClientesListClient, { type Cliente } from "./ClientesListClient";

const ALLOWED_ROLES = ["admin", "secretaria", "vendedor", "bodega"];
const PAGE_SIZE = 50;

export const dynamic = "force-dynamic";

interface SessionPayload {
  role?: string;
  sessionToken?: string;
}

function parseSession(raw: string | undefined): SessionPayload | null {
  return verifySession(raw);
}

async function isSessionValid(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const { data } = await supabaseServer
    .from("user_sessions")
    .select("id")
    .eq("session_token", token)
    .eq("revoked", false)
    .limit(1)
    .maybeSingle();
  return !!data;
}

export default async function ClientesPage() {
  const cookieStore = await cookies();
  const session = parseSession(cookieStore.get("cxc_session")?.value);
  if (!session || !ALLOWED_ROLES.includes(session.role || "")) {
    redirect("/");
  }
  if (!(await isSessionValid(session.sessionToken))) {
    redirect("/");
  }

  // Fetches paralelos para primer render
  const [listRes, provinciasRes] = await Promise.all([
    supabaseServer
      .from("clientes_master")
      .select("id, codigo, nombre, telefono, celular, email, provincia", { count: "exact" })
      .eq("deleted", false)
      .order("nombre", { ascending: true })
      .range(0, PAGE_SIZE - 1),
    supabaseServer
      .from("clientes_master")
      .select("provincia")
      .eq("deleted", false)
      .not("provincia", "is", null),
  ]);

  const clientes = (listRes.data ?? []) as Cliente[];
  const total = listRes.count ?? 0;
  const provincias = [
    ...new Set(
      (provinciasRes.data ?? [])
        .map(r => (r.provincia ?? "").trim())
        .filter(Boolean) as string[],
    ),
  ].sort((a, b) => a.localeCompare(b, "es"));

  return (
    <ClientesListClient
      initialClientes={clientes}
      initialTotal={total}
      provincias={provincias}
      pageSize={PAGE_SIZE}
    />
  );
}
