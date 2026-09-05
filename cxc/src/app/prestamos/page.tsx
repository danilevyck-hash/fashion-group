import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { verifySession } from "@/lib/session-cookie";
import { PRESTAMOS_ROLES } from "@/lib/prestamos-roles";
import { leerDatosPrestamos } from "@/lib/prestamos-lista-server";
import PrestamosClient from "./PrestamosClient";

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

export default async function PrestamosPage() {
  // 1. Auth gate SSR
  const cookieStore = await cookies();
  const session = parseSession(cookieStore.get("cxc_session")?.value);
  if (!session || !PRESTAMOS_ROLES.includes(session.role || "")) {
    redirect("/");
  }
  if (!(await isSessionValid(session.sessionToken))) {
    redirect("/");
  }

  // 2. La MISMA lectura que usa `/api/prestamos/empleados`. Antes eran dos
  //    consultas escritas aparte, o sea dos formas de contestar «quién debe».
  const datos = await leerDatosPrestamos();

  return <PrestamosClient initialData={datos} />;
}
