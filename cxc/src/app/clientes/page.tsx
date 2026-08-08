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
import { mundosDeClientes, soloClientesDelGrupo } from "@/lib/clientes/mundos";

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
  // los que no son del grupo se quitan DESPUÉS de leer, así que un
  // `count` de la base contaría miles que no se van a mostrar y la paginación
  // prometería páginas vacías. Mismo criterio que `/api/clientes`, que ya leía
  // así — el primer render y el refetch tienen que dar el MISMO total.
  const [todosRes, mundos] = await Promise.all([
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
    mundosDeClientes(),
  ]);

  const visibles = soloClientesDelGrupo(todosRes, mundos);
  visibles.sort((a, b) => (a.nombre ?? "").localeCompare(b.nombre ?? "", "es"));
  const clientes = visibles.slice(0, PAGE_SIZE);
  const total = visibles.length;

  // Las provincias salen de los clientes que SE VEN, no de la tabla entera.
  //
  // 🩸 Era una segunda consulta a `clientes_master` sin paginar y sin filtro de
  // mundo: PostgREST cortaba en 1.000 de 5.062 filas EN SILENCIO, y las que sí
  // llegaban eran casi todas de Boston (4.883 de 5.062). O sea que el
  // desplegable ofrecía provincias donde no vive NINGÚN cliente visible — se
  // elegía una y la lista quedaba vacía. Derivarlas de `visibles` no cuesta una
  // consulta más, no se puede truncar y no puede desincronizarse de la lista.
  const provincias = [
    ...new Set(visibles.map(c => (c.provincia ?? "").trim()).filter(Boolean)),
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
