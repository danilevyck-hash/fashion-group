import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { verifySession } from "@/lib/session-cookie";
import ChequesClient, { type Cheque } from "./ChequesClient";

const CHEQUES_ROLES = ["admin", "secretaria"];

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

export default async function ChequesPage() {
  // 1. Auth gate SSR
  const cookieStore = await cookies();
  const session = parseSession(cookieStore.get("cxc_session")?.value);
  if (!session || !CHEQUES_ROLES.includes(session.role || "")) {
    redirect("/");
  }
  if (!(await isSessionValid(session.sessionToken))) {
    redirect("/");
  }

  // 2. Queries paralelas — replica exacto de /api/cheques + extracción de nombres
  const [chequesRes, dirRes] = await Promise.all([
    supabaseServer
      .from("cheques")
      .select("*")
      .eq("deleted", false)
      .order("fecha_deposito", { ascending: true }),
    supabaseServer
      .from("directorio_clientes")
      .select("nombre")
      .eq("deleted", false),
  ]);

  const cheques = (chequesRes.data || []) as Cheque[];
  const dirClientes = (dirRes.data || [])
    .map((r) => r.nombre)
    .filter(Boolean) as string[];

  return <ChequesClient initialData={{ cheques, dirClientes }} />;
}
