import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { verifySession } from "@/lib/session-cookie";
import RecordatoriosClient, { type Cheque } from "./RecordatoriosClient";
import { leerRecordatorios } from "@/lib/recordatorios/server";
import { RECORDATORIOS_ROLES, ROLES_QUE_ELIGEN_DESTINO } from "@/lib/recordatorios/roles";
import { fechaPanama } from "@/lib/cheques-aviso-ventana";

// 🔴 Admin y secretaria — Daniel, a la pregunta de quién ve los recordatorios:
// *"admin y secre"*. Es la MISMA pareja que ya entraba a los cheques, y se lee
// de un solo lugar para que las dos no se puedan separar.
const CHEQUES_ROLES = RECORDATORIOS_ROLES;

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

export default async function RecordatoriosPage() {
  // 1. Auth gate SSR
  const cookieStore = await cookies();
  const session = parseSession(cookieStore.get("cxc_session")?.value);
  const rol = session?.role || "";
  if (!session || !CHEQUES_ROLES.includes(rol)) {
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

  const { recordatorios, faltaMigracion } = await leerRecordatorios();

  // 🔴 HOY SE CALCULA EN EL SERVIDOR, EN FECHA DE PANAMÁ.
  //
  // La pantalla agrupa por «Vencido / Hoy / Esta semana / Después» y propone
  // «Mañana» y «Lunes» al escribir: las dos cosas dependen de qué día es HOY.
  // Sacado del reloj del navegador, un celular con la zona mal puesta —o
  // simplemente en otro país— vería otro día que el que el aviso de las 9:00 va
  // a usar. Panamá es UTC−5 fijo y esa cuenta ya vive en `fechaPanama`.
  const hoy = fechaPanama();

  return (
    <RecordatoriosClient
      initialData={{
        cheques,
        recordatorios,
        faltaMigracionRecordatorios: faltaMigracion,
        hoy,
        // Solo los admin eligen a quién le llega. Viaja resuelto desde el
        // servidor para que la pantalla no tenga que saber la regla.
        puedeElegirDestino: ROLES_QUE_ELIGEN_DESTINO.includes(rol),
      }}
    />
  );
}
