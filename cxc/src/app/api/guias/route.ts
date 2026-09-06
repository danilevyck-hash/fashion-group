import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";
import { getSession } from "@/lib/require-auth";
import { transportistaLabel } from "@/lib/transportistaLabel";
import { validarEmpresasItems } from "@/lib/guias/validar-items";
import {
  CAMPOS_OBLIGATORIOS,
  respuestaErrorEscritura,
  validarObligatorios,
} from "@/lib/campos-obligatorios";

const GUIAS_ROLES = ["admin", "secretaria", "bodega", "vendedor"]; // lectura (GET)
const GUIAS_WRITE_ROLES = ["admin", "secretaria", "bodega"]; // escritura: vendedor es solo lectura

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session || !GUIAS_ROLES.includes(session.role)) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  // SELECT explícito: excluye firmas base64 (firma_transportista, firma_base64,
  // firma_entregador_base64) que pesan 30-100 KB cada una. El detalle completo
  // se sirve desde /api/guias/[id] cuando el usuario expande una fila.
  // Sprint 3: JOIN a transportistas para resolver el label canónico; la
  // columna TEXT vieja ya no se selecciona ni se lee.
  //
  // ⚠️ `direccion`, `empresa` y `orden` viajan desde el 25-ago-2026: el Excel
  // pasó a UNA FILA POR ENVÍO y se arma con lo que trae el listado. Sin ellos
  // las columnas «Destino» y «Empresa» salían VACÍAS — de hecho «Empresa» ya
  // salía vacía antes, y nadie lo había notado porque el resumen por guía las
  // juntaba en una celda. `orden` es lo que hace que los envíos salgan en el
  // orden de la guía y no en el que la base los devuelva.
  //
  // ⚠️ `cedula` también viaja, y por el mismo motivo: la marca "salió
  // incompleta" mira placa, quién recibió y cédula (Daniel, punto 13). Sin ella
  // el listado marcaría a TODAS las guías como si les faltara la cédula. Es un
  // TEXT de 13 caracteres; las firmas base64 siguen fuera.
  //
  // ⚠️ `guia_items.cliente_codigo` viaja desde el 26-ago-2026, y tampoco es
  // adorno: el BUSCADOR de la lista tiene que poder encontrar una guía por el
  // nombre del cliente ATADO y por su código `D-XXX`, que es lo que la pantalla
  // muestra desde #638. Sin esta columna el filtro solo veía el texto que
  // tecleó bodega, así que teclear lo que se ve en pantalla NO encontraba la
  // guía (medido: «Sporting Shoes N 4» dejaba fuera las 21 líneas escritas
  // «Sporting Shoes N4», y «D-142» daba 0). Es un TEXT de 6 caracteres; las
  // firmas base64 siguen fuera.
  //
  // ⚠️ `guia_items.numero_guia_transp` SÍ viaja, y no es adorno: la marca
  // "Falta N° transportista" se calcula por LÍNEA. Sin él, el listado solo
  // podía mirar el de la cabecera —que NO se reescribe al anotar un número
  // tarde— y el chip ámbar se quedaría puesto para siempre en una guía que ya
  // tiene su número. Es un TEXT corto; las firmas base64 siguen fuera.
  const { data, error } = await supabaseServer
    .from("guia_transporte")
    .select("id, numero, fecha, modo_entrega, transportista_id, transportistas(nombre), placa, observaciones, estado, tipo_despacho, receptor_nombre, entregado_por, nombre_chofer, cedula, numero_guia_transp, created_at, deleted, guia_items(orden, bultos, facturas, cliente, cliente_codigo, direccion, empresa, numero_guia_transp)")
    .eq("deleted", false)
    .order("numero", { ascending: false });

  // 🩸 `monto_total` Y `nombre_entregador` SALIERON DE ESTE SELECT (5-sep-2026).
  // Medido sobre las 242 guías de toda la historia: `monto_total` vale **0.00 en
  // las 242** y `nombre_entregador` está **vacío en las 242** — y ninguna
  // pantalla los muestra. Viajaban al navegador en cada carga de la lista para
  // nada. Las columnas NO se dropean (patrón `mayor_lineas`): quedan sin
  // lectores, con su `COMMENT`, y con candado que impide que vuelvan.
  // Daniel: *«sí»*.

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }

  const result = (data || []).map((g) => ({
    ...g,
    // Los envíos, en el orden de la guía. La base no garantiza ninguno, y el
    // Excel (una fila por envío) y el papel numeran por posición.
    guia_items: [...(g.guia_items || [])].sort(
      (a: { orden?: number }, b: { orden?: number }) => (a.orden ?? 0) - (b.orden ?? 0),
    ),
    // Override transportista con label computado para mantener compat con UI
    // que ya consume g.transportista como string display-ready.
    transportista: transportistaLabel(g),
    total_bultos: (g.guia_items || []).reduce((s: number, i: { bultos: number }) => s + (i.bultos || 0), 0),
    item_count: (g.guia_items || []).length,
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const s = getSession(req);
  if (!s || !GUIAS_WRITE_ROLES.includes(s.role)) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const body = await req.json();
  // 🩸 `monto_total` y `firma_transportista` ya NO se leen del body (5-sep-2026):
  // 0.00 y vacía en las 242 guías de la historia, sin una sola pantalla que las
  // muestre. Ver el comentario del GET.
  const { fecha, modo_entrega, transportista_id, placa, observaciones, items, estado, entregado_por, numero_guia_transp } = body;

  // `guia_transporte.fecha` es NOT NULL sin default y era el ÚNICO obligatorio
  // que llegaba crudo del body: el formulario la valida en el navegador
  // (guia-form-logic.ts) y el servidor no tenía red. Un body sin `fecha` daba
  // 23502 y la ruta devolvía el mensaje de Postgres tal cual.
  const faltaObligatorio = validarObligatorios(body, CAMPOS_OBLIGATORIOS.guia_transporte);
  if (faltaObligatorio) return faltaObligatorio;

  // Validate modo_entrega + transportista_id (Sprint 2 schema)
  if (modo_entrega !== "transportista" && modo_entrega !== "entrega_directa") {
    return NextResponse.json({ error: "Debes indicar el modo de entrega" }, { status: 400 });
  }
  if (modo_entrega === "transportista" && !transportista_id) {
    return NextResponse.json({ error: "Selecciona un transportista" }, { status: 400 });
  }

  // Validate items
  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "La guía debe tener al menos un item" }, { status: 400 });
  }
  const totalBultos = items.reduce((s: number, i: { bultos?: number }) => s + (i.bultos || 0), 0);
  if (totalBultos === 0) {
    return NextResponse.json({ error: "La guía debe tener al menos un item con bultos > 0" }, { status: 400 });
  }

  // Guía NUEVA: empresa cerrada a las 8 del grupo, sin excepción histórica.
  const errEmpresa = validarEmpresasItems(items);
  if (errEmpresa) return NextResponse.json({ error: errEmpresa }, { status: 400 });

  // Auto-increment numero with retry for race conditions (UNIQUE constraint)
  let guia: Record<string, unknown> | null = null;
  let guiaErr: { message: string } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: last } = await supabaseServer
      .from("guia_transporte")
      .select("numero")
      .order("numero", { ascending: false })
      .limit(1)
      .single();

    const numero = (last?.numero || 0) + 1;

    // transportista TEXT queda en NULL — Sprint 2 dejó la columna como respaldo
    // histórico, las escrituras nuevas usan modo_entrega + transportista_id.
    const insertData: Record<string, unknown> = {
      numero,
      fecha,
      modo_entrega,
      transportista_id: modo_entrega === "transportista" ? transportista_id : null,
      placa: placa || null,
      observaciones: observaciones || null,
      estado: estado || "Pendiente Bodega",
      entregado_por: entregado_por || null,
      numero_guia_transp: numero_guia_transp || null,
    };

    const { data, error } = await supabaseServer
      .from("guia_transporte")
      .insert(insertData)
      .select()
      .single();

    if (!error) {
      guia = data;
      guiaErr = null;
      break;
    }
    // Retry on unique constraint violation (code 23505)
    if (error.message?.includes("unique") || error.message?.includes("duplicate") || error.message?.includes("23505")) {
      continue;
    }
    guiaErr = error;
    break;
  }

  // El mensaje crudo de Postgres NO va al navegador (filtraba nombres de tabla
  // y columna); el detalle queda en el log y, si es un desacuerdo de schema,
  // sale por el canal de sistema.
  if (guiaErr || !guia) return respuestaErrorEscritura(guiaErr, { tabla: "guia_transporte", accion: "Guías › crear guía" });

  if (items && items.length > 0) {
    const rows = items.map((item: Record<string, unknown>, i: number) => ({
      guia_id: guia.id,
      orden: i + 1,
      cliente: item.cliente || "",
      cliente_codigo: item.cliente_codigo || null,
      direccion: item.direccion || "",
      empresa: item.empresa || "",
      facturas: item.facturas || "",
      bultos: item.bultos || 0,
      numero_guia_transp: item.numero_guia_transp || "",
    }));

    const { error: itemsErr } = await supabaseServer.from("guia_items").insert(rows);
    if (itemsErr) return respuestaErrorEscritura(itemsErr, { tabla: "guia_items", accion: "Guías › crear guía" });
  }

  const session = getSession(req);
  await logActivity(session?.role || "unknown", "guia_create", "guias", { guiaId: guia.id, numero: guia.numero }, session?.userName);
  return NextResponse.json(guia);
}
