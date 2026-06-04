import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import ReclamosClient from "./ReclamosClient";
import type { Reclamo, Contacto } from "./components/types";

const RECLAMOS_ROLES = ["admin", "secretaria"];

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

export default async function ReclamosPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; id?: string }>;
}) {
  // 1. Auth gate SSR
  const cookieStore = await cookies();
  const session = parseSession(cookieStore.get("cxc_session")?.value);
  if (!session || !RECLAMOS_ROLES.includes(session.role || "")) {
    redirect("/");
  }
  if (!(await isSessionValid(session.sessionToken))) {
    redirect("/");
  }

  // 2. URL params para detalle condicional
  const params = await searchParams;
  const detailId = params.view === "detail" && params.id ? params.id : null;

  // 3. Queries paralelas — replica /api/reclamos + /api/reclamos/contactos +
  //    /api/reclamos/motivos + /api/reclamos/[id] (condicional)
  const [reclamosRes, contactosRes, motivosRes, detailRes] = await Promise.all([
    supabaseServer
      .from("reclamos")
      .select("*, reclamo_items(*), reclamo_fotos(*), reclamo_seguimiento(*)")
      .eq("deleted", false)
      .order("created_at", { ascending: false }),
    supabaseServer
      .from("reclamo_contactos")
      .select("*")
      .eq("activo", true)
      .order("empresa"),
    supabaseServer
      .from("reclamo_custom_motivos")
      .select("motivo"),
    detailId
      ? supabaseServer
          .from("reclamos")
          .select("*, reclamo_items(*), reclamo_fotos(*), reclamo_seguimiento(*)")
          .eq("id", detailId)
          .eq("deleted", false)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const reclamos = (reclamosRes.data || []) as Reclamo[];
  const contactos = (contactosRes.data || []) as Contacto[];
  const customMotivos = ((motivosRes.data || []) as { motivo: string }[])
    .map((r) => r.motivo)
    .filter(Boolean);
  const detail = (detailRes.data ?? null) as Reclamo | null;

  return (
    <ReclamosClient
      initialData={{ reclamos, contactos, customMotivos, detail }}
    />
  );
}
