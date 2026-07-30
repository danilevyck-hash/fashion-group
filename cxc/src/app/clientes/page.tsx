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
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { idsFueraDelDirectorio, sinClientesFueraDelDirectorio } from "@/lib/clientes/directorio-exclusiones";

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

  // Fetches paralelos para primer render.
  //
  // 🩸 La lista se lee ENTERA y se recorta acá, en vez de pedirle a la base la
  // primera página con `count: exact`. Es por las exclusiones del Directorio:
  // los clientes exclusivos de Boston se quitan DESPUÉS de leer, así que un
  // `count` de la base contaría 794 que no se van a mostrar y la paginación
  // prometería páginas vacías. Mismo criterio que `/api/clientes`, que ya leía
  // así — el primer render y el refetch tienen que dar el MISMO total.
  const [todosRes, provinciasRes, excluidos] = await Promise.all([
    leerTodoPaginado<Cliente>(
      "clientes_master (primer render del Directorio)",
      (pedirCount, from, to) =>
        supabaseServer
          .from("clientes_master")
          .select(
            "id, codigo, nombre, razon_social, telefono, celular, email, provincia",
            pedirCount ? { count: "exact" } : {},
          )
          .eq("deleted", false)
          .order("id", { ascending: true })
          .range(from, to),
    ).catch(() => [] as Cliente[]),
    supabaseServer
      .from("clientes_master")
      .select("provincia")
      .eq("deleted", false)
      .not("provincia", "is", null),
    idsFueraDelDirectorio(),
  ]);

  const visibles = sinClientesFueraDelDirectorio(todosRes, excluidos);
  visibles.sort((a, b) => (a.nombre ?? "").localeCompare(b.nombre ?? "", "es"));
  const clientes = visibles.slice(0, PAGE_SIZE);
  const total = visibles.length;
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
