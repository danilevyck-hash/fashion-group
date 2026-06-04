import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import PackingListsClient, { type PLRecord } from "./PackingListsClient";

const PACKING_LISTS_ROLES = ["admin", "secretaria", "bodega", "vendedor"];

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

export default async function PackingListsPage() {
  // 1. Auth gate SSR
  const cookieStore = await cookies();
  const session = parseSession(cookieStore.get("cxc_session")?.value);
  if (!session || !PACKING_LISTS_ROLES.includes(session.role || "")) {
    redirect("/");
  }
  if (!(await isSessionValid(session.sessionToken))) {
    redirect("/");
  }

  // 2. Query inicial — replica /api/packing-lists
  const { data } = await supabaseServer
    .from("packing_lists")
    .select("*")
    .order("created_at", { ascending: false });

  const plList = (data || []) as PLRecord[];

  return <PackingListsClient initialData={{ plList }} />;
}
