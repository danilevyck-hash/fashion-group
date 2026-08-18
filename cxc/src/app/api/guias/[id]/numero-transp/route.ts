// ─────────────────────────────────────────────────────────────────────────────
// ANOTAR EL N° DE GUÍA DEL TRANSPORTISTA DE UNA LÍNEA. Y NADA MÁS.
//
// 🩸 POR QUÉ ES UN ENDPOINT APARTE Y POR QUÉ NO MIRA EL ESTADO.
//
// Desde el 17-ago-2026 el número **no bloquea** el despacho —Daniel: *"a veces
// el transportista lo da, a veces no"*— así que hay guías que salen sin él y
// quedan marcadas con el chip ámbar. Completarlo después es justamente para lo
// que sirve la marca. Daniel: ***"hazle la excepción para ese número"***.
//
// 🔑 ESTO ES UNA COPIA DEL MOLDE DE `PATCH /api/guias/[id]/cliente`, no un
// invento nuevo. Ese endpoint existe porque **174 de 177 guías vivas están
// Completada** y el PUT las rechaza: anotar un dato sobre un renglón no es
// editar el despacho. Acá vale igual — el número que el transportista dio tarde
// no cambia un bulto, ni una factura, ni el texto que escribió bodega, ni una
// firma, ni la placa, ni el estado.
//
// Por eso este endpoint:
//   · toca UNA columna, `guia_items.numero_guia_transp`, de UNA línea;
//   · **no lee ni escribe `guia_transporte`** más allá de comprobar que la guía
//     existe y no está borrada. El estado ni se mira: no es una condición;
//   · deja TODO lo demás de la línea intacto — cliente, dirección, empresa,
//     facturas y bultos ni se nombran.
//
// 🔴 LO QUE EL CANDADO DE "Completada" SIGUE IMPIDIENDO, EXACTAMENTE IGUAL QUE
// ANTES: cambiar bultos, facturas, empresa, dirección, el cliente escrito,
// placa, receptor, cédula, firmas o estado. El PUT y el PATCH de
// `/api/guias/[id]` los siguen rechazando, y `/api/guias/[id]/item` (la
// corrección de bodega) también.
//
// ⚠️ QUEDA QUIÉN Y CUÁNDO. Escribir sobre un documento ya firmado se anota en
// `activity_log` con el usuario, el rol, el valor viejo y el nuevo — el mismo
// patrón que usa `…/cliente` para atar un cliente sobre una guía cerrada.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getSession } from "@/lib/require-auth";
import { requireRole } from "@/lib/requireRole";
import { logActivity } from "@/lib/log-activity";
import { validarNumeroTransp } from "@/lib/guias/numero-transp-tarde";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Los mismos que ya pueden escribir sobre una guía. Vendedor sigue de lectura. */
const GUIAS_WRITE_ROLES = ["admin", "secretaria", "bodega"];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, GUIAS_WRITE_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { id } = params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  let body: { itemId?: unknown; numero_guia_transp?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
  if (!UUID_RE.test(itemId)) return NextResponse.json({ error: "Línea inválida" }, { status: 400 });

  const validado = validarNumeroTransp(body.numero_guia_transp);
  if (!validado.ok) return NextResponse.json({ error: validado.error }, { status: 400 });

  // La guía tiene que existir y no estar borrada. El ESTADO no se mira: ver la
  // cabecera del archivo.
  const { data: guia, error: guiaErr } = await supabaseServer
    .from("guia_transporte")
    .select("id, numero, deleted")
    .eq("id", id)
    .maybeSingle();
  if (guiaErr) return NextResponse.json({ error: "Error interno" }, { status: 500 });
  if (!guia || guia.deleted) return NextResponse.json({ error: "Guía no encontrada" }, { status: 404 });

  // La línea tiene que ser DE ESTA GUÍA. Sin este `.eq("guia_id", id)` bastaría
  // el id de cualquier renglón del sistema para escribirle encima desde acá.
  const { data: item, error: itemErr } = await supabaseServer
    .from("guia_items")
    .select("id, cliente, numero_guia_transp")
    .eq("id", itemId)
    .eq("guia_id", id)
    .maybeSingle();
  if (itemErr) return NextResponse.json({ error: "Error interno" }, { status: 500 });
  if (!item) return NextResponse.json({ error: "Esa línea no es de esta guía" }, { status: 404 });

  // Las escrituras que no cambian nada no se hacen.
  if (String(item.numero_guia_transp ?? "").trim() === validado.numero) {
    return NextResponse.json({ ok: true, sinCambios: true, numero_guia_transp: validado.numero });
  }

  // UNA columna. Nada más de la línea se nombra siquiera.
  const { error: updErr } = await supabaseServer
    .from("guia_items")
    .update({ numero_guia_transp: validado.numero })
    .eq("id", itemId)
    .eq("guia_id", id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  const session = getSession(req);
  await logActivity(
    session?.role || "unknown",
    "guia_item_numero_transp",
    "guias",
    {
      guiaId: id,
      numero: guia.numero,
      itemId,
      destino: item.cliente,
      de: item.numero_guia_transp ?? null,
      a: validado.numero,
    },
    session?.userName,
  );

  return NextResponse.json({ ok: true, numero_guia_transp: validado.numero });
}
