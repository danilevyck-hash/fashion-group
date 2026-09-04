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
import { leerClientesDelGrupo, type FilaCliente } from "@/lib/clientes/directorio-cache";

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

  // 🚪 SE ENTRA POR LA MISMA PUERTA QUE `/api/clientes`, y eso es todo el
  // arreglo de esta pantalla (12-ago-2026).
  //
  // 🩸 Acá había una SEGUNDA copia de la lectura: `clientes_master` entera
  // (5.062 filas, 6 viajes paginados) + `switch_clientes` (6.634 filas, 7
  // viajes) — 11.700 filas y 13 idas a Supabase — con `force-dynamic` y SIN
  // caché, o sea en CADA apertura de la pantalla. Y el endpoint `/api/clientes`
  // ya hacía exactamente lo mismo con una caché de 60 s que esta pantalla no
  // usaba. Medido contra el build de producción: el HTML tardaba 3.215 ms.
  //
  // Las columnas son las MISMAS ocho (se compararon una por una antes de tocar
  // nada), el filtro de mundos es el mismo y el orden de presentación es el
  // mismo, así que el primer render y el refetch siguen dando el MISMO total —
  // que es lo que sostiene la paginación.
  //
  // 🩸 La lista se lee ENTERA y se recorta acá, en vez de pedirle a la base la
  // primera página con `count: exact`. Es por las exclusiones del Directorio:
  // los que no son del grupo se quitan DESPUÉS de leer, así que un
  // `count` de la base contaría miles que no se van a mostrar y la paginación
  // prometería páginas vacías.
  // CON AUSENTES: esta pantalla es el directorio completo — el cliente que
  // Switch ya no manda se ve, con su rótulo, y su ficha sigue abriendo. Los
  // que NO lo ofrecen son los selectores (default de `leerClientesDelGrupo`).
  const visiblesCache: FilaCliente[] = await leerClientesDelGrupo("", { incluirAusentes: true }).catch(() => []);

  // ⚠️ `.slice()` OBLIGATORIO: `visiblesCache` es el MISMO array que guarda el
  // caché en memoria, y `sort` ordena EN EL LUGAR. Sin la copia, esta pantalla
  // mutaría estado compartido entre requests. (Es el mismo cuidado que ya
  // tomaba `/api/clientes`, y por eso hay un test que lo vigila.)
  const visibles = visiblesCache.slice() as Cliente[];
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
