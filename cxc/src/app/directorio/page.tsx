import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import DirectorioClient, { type Cliente } from "./DirectorioClient";

const DIRECTORIO_ROLES = ["admin", "secretaria", "director", "vendedor"];
const PAGE_SIZE = 50;

export const dynamic = "force-dynamic";

interface SessionPayload {
  role?: string;
  sessionToken?: string;
}

function parseSession(raw: string | undefined): SessionPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf-8"));
    if (!parsed.role) return null;
    return parsed as SessionPayload;
  } catch {
    return null;
  }
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

export default async function DirectorioPage() {
  // 1. Auth gate — server-side
  const cookieStore = await cookies();
  const session = parseSession(cookieStore.get("cxc_session")?.value);
  if (!session || !DIRECTORIO_ROLES.includes(session.role || "")) {
    redirect("/");
  }
  if (!(await isSessionValid(session.sessionToken))) {
    redirect("/");
  }

  // 2. Fetches críticos para primer render — paralelos
  const [listRes, allRes, cxcRes] = await Promise.all([
    supabaseServer
      .from("directorio_clientes")
      .select("*", { count: "exact" })
      .eq("deleted", false)
      .order("nombre")
      .range(0, PAGE_SIZE - 1),
    supabaseServer
      .from("directorio_clientes")
      .select("empresa")
      .eq("deleted", false),
    supabaseServer
      .from("cxc_rows")
      .select("nombre_normalized"),
  ]);

  const clientes = (listRes.data || []) as Cliente[];
  const total = listRes.count || 0;
  const empresas = [...new Set(
    (allRes.data || [])
      .map((r) => (r.empresa || "").trim())
      .filter(Boolean) as string[]
  )].sort();
  const cxcNombres = (cxcRes.data || [])
    .map((r) => r.nombre_normalized)
    .filter(Boolean) as string[];

  return (
    <DirectorioClient
      initialData={{ clientes, total, empresas, cxcNombres }}
    />
  );
}
