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

  // 2. Query — replica exacta de /api/cheques.
  //
  // Ya NO se lee `directorio_clientes`. Ese select alimentaba el autocompletar
  // viejo del formulario, que era el módulo Directorio legacy: 33 nombres, sin
  // código. El selector nuevo es el MISMO de Guías y busca contra
  // `clientes_master` (149 clientes vivos) por `/api/clientes`, o sea el
  // directorio de verdad, así que la consulta quedó sin lectores.
  const chequesRes = await supabaseServer
    .from("cheques")
    .select("*")
    .eq("deleted", false)
    .order("fecha_deposito", { ascending: true });

  const cheques = (chequesRes.data || []) as Cheque[];

  return <ChequesClient initialData={{ cheques }} />;
}
