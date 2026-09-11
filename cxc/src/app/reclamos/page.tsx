import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { verifySession } from "@/lib/session-cookie";
import ReclamosClient from "./ReclamosClient";
import type { Reclamo, Contacto } from "./components/types";
import { LISTA_SELECT } from "@/lib/reclamos/lista-select";
import { leerDetalleReclamo } from "@/lib/reclamos/leer-detalle";

const RECLAMOS_ROLES = ["admin", "secretaria"];

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
  //    /api/reclamos/[id] (condicional). Los motivos personalizados se
  //    retiraron del formulario el 10-sep-2026 (0 usos en toda la historia).
  const [reclamosRes, contactosRes, detailRes] = await Promise.all([
    supabaseServer
      .from("reclamos")
      .select(LISTA_SELECT)
      .eq("deleted", false)
      .order("created_at", { ascending: false }),
    supabaseServer
      .from("reclamo_contactos")
      .select("*")
      .eq("activo", true)
      .order("empresa"),
    // 🔴 EL DETALLE SE LEE POR LA MISMA PUERTA QUE AL NAVEGAR (11-sep-2026).
    //
    // 🩸 Acá vivía un `select` propio que NO traía `reclamo_settlements` y NO
    // firmaba un solo archivo, y el cliente no vuelve a pedir el detalle en la
    // primera corrida (el efecto se la salta a propósito). Abrir un reclamo por
    // enlace directo —o recargar con F5— lo pintaba con las fotos rotas, sin
    // «Factura del proveedor» en el menú Descargar, sin la tarjeta de
    // Comprobante y con «Recuperación 0%» aunque hubiera notas de crédito.
    // Entrando por la lista se veía bien, y por eso no se notaba.
    //
    // ⚠️ Falla ABIERTA: si la lectura del detalle se cae, la LISTA igual se
    // dibuja (el cliente vuelve a pedir el detalle al tocar la fila).
    detailId
      ? leerDetalleReclamo(detailId).catch((err) => {
          console.error("reclamos SSR detalle:", err);
          return null;
        })
      : Promise.resolve(null),
  ]);

  const reclamos = (reclamosRes.data || []) as Reclamo[];
  const contactos = (contactosRes.data || []) as Contacto[];
  const detail = (detailRes ?? null) as Reclamo | null;

  return (
    <ReclamosClient
      initialData={{ reclamos, contactos, detail }}
    />
  );
}
