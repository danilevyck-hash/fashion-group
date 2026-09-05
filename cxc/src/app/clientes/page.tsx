// ─────────────────────────────────────────────────────────────────────────────
// /clientes — LA LISTA.
//
// 🔴 SU TRABAJO ES BUSCAR A ALGUIEN Y ARREGLAR SUS DATOS (5-sep-2026). Cobrar es
// Cuentas por Cobrar y analizar la venta es Ventas › Clientes; esta lista no
// repite ninguna de las dos. Por eso sus chips son de datos que FALTAN y su
// última columna es «Cómo contactarlo».
//
// 🔴 LOS 150 EN UNA SOLA LISTA CON SCROLL, sin páginas y sin cortar por
// «activos». Medido: **Outlet Duty Free S.A. (D-119) facturó $21.826,00 este
// año** —4 facturas, la última el 27-ago— y su neto es cero porque el 1-sep le
// entraron cuatro notas de crédito por los mismos montos. Con un corte por
// actividad ese cliente desaparecería estando vivo.
//
// 🩸 SE FUE EL FILTRO POR PROVINCIA: **99 de los 150 no tienen provincia**, así
// que elegir una escondía a dos de cada tres. Daniel: *«si, no sirve»*.
//
// 🔴 EL QUE YA NO ESTÁ EN SWITCH NO SALE. Daniel: *«si en switch no esta, aqui
// no debe de aparecer»*. Su ficha SÍ sigue abriendo por enlace directo — las
// guías y facturas viejas apuntan a él y no pueden quedar rotas.
// ─────────────────────────────────────────────────────────────────────────────

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { verifySession } from "@/lib/session-cookie";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import ClientesListClient, { type Cliente } from "./ClientesListClient";
import { leerClientesDelGrupo } from "@/lib/clientes/directorio-cache";

const ALLOWED_ROLES = ["admin", "secretaria", "vendedor", "bodega"];

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

/**
 * Lo que debe cada cliente, en UNA consulta.
 *
 * La vista de aging del grupo tiene 211 filas: cabe entera y no hace falta
 * paginar. ⚠️ Su columna de empresa se llama `company_key`, no `empresa_key`, y
 * se filtra por las 6 en la misma cadena — Boston tiene su propia vista y no se
 * mezcla ni acá ni en ningún lado.
 *
 * Falla ABIERTO: sin este dato la lista igual sale, con la columna vacía. Una
 * lista de clientes que no abre porque el aging no respondió es peor que una
 * columna en blanco.
 */
async function saldoPorCodigo(): Promise<Record<string, number>> {
  const { data, error } = await supabaseServer
    .from("switch_estadocuenta_aging")
    .select("codigo, company_key, total")
    .in("company_key", [...B2B_EMPRESA_KEYS]);
  if (error) {
    console.error("[clientes/lista] aging:", error.message);
    return {};
  }
  const mapa: Record<string, number> = {};
  for (const r of (data ?? []) as { codigo: string | null; total: number | string }[]) {
    if (!r.codigo) continue;
    mapa[r.codigo] = Math.round(((mapa[r.codigo] ?? 0) + Number(r.total ?? 0)) * 100) / 100;
  }
  return mapa;
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

  // 🚪 SE ENTRA POR LA MISMA PUERTA QUE `/api/clientes` — `leerClientesDelGrupo`,
  // con su caché de 60 s y su filtro de mundos. Sin `incluirAusentes`: el
  // default de esa puerta es «solo lo que se puede ofrecer», que es exactamente
  // lo que esta lista quiere desde el 5-sep-2026.
  const filas = await leerClientesDelGrupo("").catch(() => []);
  const debe = await saldoPorCodigo();

  // ⚠️ `.slice()` OBLIGATORIO: `filas` puede ser el MISMO array que guarda el
  // caché en memoria. Acá se mapea (que ya crea uno nuevo), pero el orden se
  // aplica sobre la copia, nunca sobre el estado compartido entre requests.
  const clientes: Cliente[] = filas
    .filter((c) => !!c.codigo)
    .map((c) => ({
      id: c.id,
      codigo: c.codigo as string,
      nombre: c.nombre ?? "",
      razon_social: c.razon_social,
      telefono: c.telefono,
      celular: c.celular,
      email: c.email,
      debe: debe[c.codigo as string] ?? 0,
    }))
    .sort((a, b) => (a.nombre ?? "").localeCompare(b.nombre ?? "", "es"));

  return <ClientesListClient initialClientes={clientes} />;
}
