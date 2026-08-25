// ─────────────────────────────────────────────────────────────────────────────
// CORREGIR UN RENGLÓN DE UNA GUÍA QUE TODAVÍA NO SALIÓ. Y NADA MÁS.
//
// 🩸 POR QUÉ ES UN ENDPOINT APARTE Y NO UN CAMPO MÁS DEL PUT.
//
// `items` en el PUT es un **REEMPLAZO COMPLETO** —borra los renglones e inserta
// otros nuevos, cambiándoles el id— y el CLAUDE.md ya advierte que usarlo en
// pleno despacho *"tiraría el trabajo de atar clientes"*. Con bodega parada al
// lado del camión, corregir un nombre no puede costar la lista entera.
//
// Acá se escribe **UNA fila, y solo los campos que vinieron**:
//   · `.eq("id", itemId).eq("guia_id", id)` — sin el segundo, el id de cualquier
//     línea del sistema serviría para escribirle encima desde acá;
//   · el resto de los renglones **no se lee, no se borra y no se reinserta**:
//     conservan su id, su `cliente_codigo` y su `numero_guia_transp`.
//
// ─────────────────────────────────────────────────────────────────────────────
// 🔴 UNA GUÍA YA DESPACHADA ACEPTA **TRES COLUMNAS Y NADA MÁS** (25-ago-2026).
//
// Daniel, punto 4: *"Guía despachada → se puede corregir **N° del transportista
// · cliente · facturas**"*. Punto 5: *"los **bultos** de una despachada **NO se
// tocan** — es lo que el transportista firmó"*.
//
// 🩸 Antes esto rechazaba una guía Completada ENTERA. Pero el papel que sale
// mal impreso o con la factura equivocada existe igual, y la única forma de
// arreglarlo era no tenerla: 143 guías sin N° de transportista y facturas
// cargadas mal que nadie podía tocar.
//
// 🔴 LO QUE **NO** CAMBIÓ, y es la mitad de esto:
//   · **El candado del PUT sigue intacto.** Una guía Completada lo rechaza
//     entero, y con razón: `items` en el PUT borra los renglones e inserta
//     otros con ids NUEVOS, o sea que corregir una factura le costaría el
//     `cliente_codigo` y el N° anotado tarde a cada línea. Por eso esto es un
//     endpoint por COLUMNA y no un campo más del PUT.
//   · **`bultos`, `direccion` y `empresa` siguen cerrados** en una guía que ya
//     salió. No están en la lista y se contestan con un 400 que dice por qué.
//   · Placa, receptor, cédula y **las dos firmas** no se tocan desde acá — ni
//     desde ninguna parte: la firma queda la vieja (punto 6).
//
// 🔑 LA LISTA NO SE ESCRIBE ACÁ: se LEE de `campos-editables.ts`, el mismo
// módulo que decide qué campos dibuja el formulario. Con dos copias, la
// pantalla ofrecería un campo que el servidor rechaza — o peor, al revés.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getSession } from "@/lib/require-auth";
import { requireRole } from "@/lib/requireRole";
import { logActivity } from "@/lib/log-activity";
import { leerClientesDelGrupo } from "@/lib/clientes/directorio-cache";
import { validarCodigoParaAtar } from "@/lib/guias/atar-cliente";
import { armarCorreccion, hayCambioReal } from "@/lib/guias/correccion-item";
import { camposEditablesDeRenglon } from "@/lib/guias/campos-editables";
import { validarEmpresasItems } from "@/lib/guias/validar-items";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Los mismos que ya pueden escribir sobre una guía. Vendedor sigue de lectura. */
const GUIAS_WRITE_ROLES = ["admin", "secretaria", "bodega"];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, GUIAS_WRITE_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { id } = params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
  if (!UUID_RE.test(itemId)) return NextResponse.json({ error: "Línea inválida" }, { status: 400 });

  const armada = armarCorreccion(body);
  if (!armada.ok) return NextResponse.json({ error: armada.error }, { status: 400 });
  const cambios = { ...armada.cambios };

  // La guía tiene que existir, no estar borrada y NO haber salido todavía.
  const { data: guia, error: guiaErr } = await supabaseServer
    .from("guia_transporte")
    .select("id, numero, estado, deleted")
    .eq("id", id)
    .maybeSingle();
  if (guiaErr) return NextResponse.json({ error: "Error interno" }, { status: 500 });
  if (!guia || guia.deleted) return NextResponse.json({ error: "Guía no encontrada" }, { status: 404 });

  // 🔴 EL FILTRO POR ESTADO. Antes de salir se corrige todo; después de salir,
  // solo el N° del transportista, el cliente y las facturas. La lista la pone
  // `campos-editables.ts`, el mismo módulo que usa el formulario.
  const permitidos = new Set<string>(camposEditablesDeRenglon(guia.estado));
  const prohibidos = Object.keys(cambios).filter((c) => !permitidos.has(c));
  if (prohibidos.length > 0) {
    return NextResponse.json(
      {
        error:
          "Esta guía ya se despachó: de un envío solo se pueden corregir el cliente, las facturas y el N° del transportista.",
        campos: prohibidos,
      },
      { status: 400 },
    );
  }

  // La línea tiene que ser DE ESTA GUÍA.
  const { data: item, error: itemErr } = await supabaseServer
    .from("guia_items")
    .select("id, cliente, cliente_codigo, direccion, empresa, facturas, bultos, numero_guia_transp")
    .eq("id", itemId)
    .eq("guia_id", id)
    .maybeSingle();
  if (itemErr) return NextResponse.json({ error: "Error interno" }, { status: 500 });
  if (!item) return NextResponse.json({ error: "Esa línea no es de esta guía" }, { status: 404 });

  // Empresa cerrada a las 8 del grupo — MÁS lo que ESTA línea ya tenía. Una guía
  // histórica con texto sucio ("VISTANA / FASHION WEAR") se puede corregir en
  // otro campo sin pelear, y el valor sucio no puede volver una vez limpiado.
  if (typeof cambios.empresa === "string") {
    const errEmpresa = validarEmpresasItems([{ empresa: cambios.empresa }], [item.empresa ?? ""]);
    if (errEmpresa) return NextResponse.json({ error: errEmpresa }, { status: 400 });
  }

  // El código del cliente entra por LA PUERTA ÚNICA (`leerClientesDelGrupo`), la
  // misma que usan el selector y el endpoint de atar. Sin esto se podría atar a
  // un código de Boston.
  if ("cliente_codigo" in cambios) {
    let codigosDelGrupo: Set<string>;
    try {
      const clientes = await leerClientesDelGrupo();
      codigosDelGrupo = new Set(clientes.map((c) => (c.codigo ?? "").trim()).filter(Boolean));
    } catch {
      return NextResponse.json({ error: "No se pudo leer el directorio de clientes" }, { status: 500 });
    }
    const validado = validarCodigoParaAtar(
      typeof cambios.cliente_codigo === "string" ? cambios.cliente_codigo : null,
      codigosDelGrupo,
    );
    if (!validado.ok) return NextResponse.json({ error: validado.error }, { status: 400 });
    cambios.cliente_codigo = validado.codigo;
  }

  // Las escrituras que no cambian nada no se hacen.
  if (!hayCambioReal(cambios, item as unknown as Record<string, unknown>)) {
    return NextResponse.json({ ok: true, sinCambios: true, item });
  }

  const { data: actualizado, error: updErr } = await supabaseServer
    .from("guia_items")
    .update(cambios)
    .eq("id", itemId)
    .eq("guia_id", id)
    .select("id, cliente, cliente_codigo, direccion, empresa, facturas, bultos, numero_guia_transp")
    .maybeSingle();
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  const session = getSession(req);
  await logActivity(
    session?.role || "unknown",
    "guia_item_correccion",
    "guias",
    { guiaId: id, numero: guia.numero, itemId, campos: Object.keys(cambios), cambios },
    session?.userName,
  );

  return NextResponse.json({ ok: true, item: actualizado });
}
