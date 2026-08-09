// ─────────────────────────────────────────────────────────────────────────────
// ATAR (o desatar) EL CLIENTE DE UNA LÍNEA DE GUÍA. Y NADA MÁS.
//
// 🩸 POR QUÉ ES UN ENDPOINT APARTE Y NO UN CAMPO MÁS DEL PUT.
//
// Una guía **Completada** está bloqueada para edición, y tiene que seguir
// estándolo: el PUT y el PATCH de `/api/guias/[id]` devuelven "Guía ya
// despachada, no se puede editar". Ese candado protege el DESPACHO — lo que
// se mandó, cuántos bultos, quién firmó, con qué placa. Es el respaldo de una
// entrega que ya ocurrió y que alguien firmó en papel.
//
// Anotar a qué cliente fue esa línea NO es editar el despacho: no cambia el
// nombre que se escribió, ni los bultos, ni las facturas, ni las firmas. Es
// ponerle el código al destino que YA está escrito. Medido: de 177 guías vivas,
// 174 están Completadas — si atar el cliente pasara por el PUT, el 98% de las
// guías del sistema serían inatables para siempre.
//
// Por eso este endpoint:
//   · toca UNA columna, `guia_items.cliente_codigo`, de UNA línea;
//   · **no lee ni escribe `guia_transporte`** más allá de comprobar que la guía
//     existe y no está borrada. El estado ni se mira: no es una condición.
//   · deja `guia_items.cliente` (el texto que escribió bodega) INTACTO. Ese
//     texto es el display y es la prueba de lo que se anotó a mano; pisarlo con
//     el nombre canónico reescribiría el historial.
//
// Lo que el candado de "Completada" sigue impidiendo, exactamente igual que
// antes: cambiar bultos, facturas, empresa, dirección, firmas, placa o estado.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getSession } from "@/lib/require-auth";
import { requireRole } from "@/lib/requireRole";
import { logActivity } from "@/lib/log-activity";
import { leerClientesDelGrupo } from "@/lib/clientes/directorio-cache";
import { validarCodigoParaAtar } from "@/lib/guias/atar-cliente";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Los mismos que ya pueden escribir sobre una guía. Vendedor sigue de lectura. */
const GUIAS_WRITE_ROLES = ["admin", "secretaria", "bodega"];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, GUIAS_WRITE_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { id } = params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  let body: { itemId?: unknown; cliente_codigo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
  if (!UUID_RE.test(itemId)) {
    return NextResponse.json({ error: "Línea inválida" }, { status: 400 });
  }
  if (body.cliente_codigo !== null && typeof body.cliente_codigo !== "string" && body.cliente_codigo !== undefined) {
    return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  }

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
  // el id de cualquier línea del sistema para escribirle encima desde acá.
  const { data: item, error: itemErr } = await supabaseServer
    .from("guia_items")
    .select("id, cliente, cliente_codigo")
    .eq("id", itemId)
    .eq("guia_id", id)
    .maybeSingle();
  if (itemErr) return NextResponse.json({ error: "Error interno" }, { status: 500 });
  if (!item) return NextResponse.json({ error: "Esa línea no es de esta guía" }, { status: 404 });

  // El universo de códigos válidos entra por LA PUERTA ÚNICA de clientes
  // (`leerClientesDelGrupo`), la misma que usan el selector de Guías, el de
  // Cheques y el Directorio. Sin esto se podría atar a un código de Boston.
  let codigosDelGrupo: Set<string>;
  try {
    const clientes = await leerClientesDelGrupo();
    codigosDelGrupo = new Set(clientes.map((c) => (c.codigo ?? "").trim()).filter(Boolean));
  } catch {
    return NextResponse.json({ error: "No se pudo leer el directorio de clientes" }, { status: 500 });
  }

  const validado = validarCodigoParaAtar(
    typeof body.cliente_codigo === "string" ? body.cliente_codigo : null,
    codigosDelGrupo
  );
  if (!validado.ok) return NextResponse.json({ error: validado.error }, { status: 400 });

  // UNA columna. `cliente` no se toca a propósito.
  const { error: updErr } = await supabaseServer
    .from("guia_items")
    .update({ cliente_codigo: validado.codigo })
    .eq("id", itemId)
    .eq("guia_id", id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  const session = getSession(req);
  await logActivity(
    session?.role || "unknown",
    "guia_item_cliente",
    "guias",
    {
      guiaId: id,
      numero: guia.numero,
      itemId,
      cliente: item.cliente,
      de: item.cliente_codigo ?? null,
      a: validado.codigo,
    },
    session?.userName
  );

  return NextResponse.json({ ok: true, cliente_codigo: validado.codigo });
}
