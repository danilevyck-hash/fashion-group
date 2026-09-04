/**
 * Guías › Configuración — los destinos definidos de cada cliente.
 *
 * 🩸 Daniel, textual (4-sep-2026): *«city shoes → Calle 19 Central, al lado de
 * la joyería Super Oro. Y Nine Sport en Calle 19 Central.»* — cada corrección
 * así necesitaba un despliegue porque los definidos vivían en una constante.
 * Ahora viven en `guias_destino_cliente` y se corrigen desde la pantalla.
 *
 * Quién escribe: **admin Y secretaria** — Daniel: *«configuraciones también
 * deja a secretaria»* (Angela y Andrea hacen las guías y son quienes notan un
 * destino mal escrito). Bodega y vendedor: 403.
 *
 *   GET    → { destinos: DestinoConfigurado[] } (activos, con nombre resuelto)
 *   POST   → { cliente_codigo, destino, tiendas? } → 201 { id }
 *   PATCH  → ?id= { destino?, tiendas?, elDeSiempre? } → edita una fila activa
 *            (marcar «el de siempre» apaga los demás del cliente: a lo sumo uno)
 *   DELETE → ?id= → SOFT DELETE (activo = false, firmado). NUNCA borra la fila.
 *
 * 🔴 Esta ruta NO toca `guia_items`: el histórico es lo que el transportista
 * firmó. Solo escribe en la tabla nueva. Quien decide qué botones ve el
 * formulario es `destinosDefinidosPara` (tabla → constante → histórico).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { leerClientesDelGrupo } from "@/lib/clientes/directorio-cache";
import { validarCodigoParaAtar } from "@/lib/guias/atar-cliente";
import { CONFIG_GUIAS_ROLES, validarDestinoEdicion, validarDestinoNuevo } from "@/lib/guias/destinos-config";
import {
  agregarDestino,
  desactivarDestino,
  editarDestino,
  leerDestinosConfigurados,
  marcarElDeSiempre,
} from "@/lib/guias/destinos-config-server";

export const dynamic = "force-dynamic";

const ROLES = [...CONFIG_GUIAS_ROLES];

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ROLES);
  if (auth instanceof NextResponse) return auth;

  try {
    const destinos = await leerDestinosConfigurados();
    return NextResponse.json({ destinos });
  } catch (e) {
    if ((e as Error & { tablaAusente?: boolean }).tablaAusente) {
      return NextResponse.json(
        { error: "Falta correr la migración de guias_destino_cliente (20260918120000)" },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "No se pudo cargar la lista. Intenta de nuevo en unos segundos." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ROLES);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const v = validarDestinoNuevo(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  // La puerta única del directorio: un D-XXX que no existe, o un código de
  // Boston, se rechazan — la misma regla que atar un cliente en una guía.
  const codigos = new Set(
    (await leerClientesDelGrupo()).map((c) => c.codigo).filter((c): c is string => !!c),
  );
  const codigoOk = validarCodigoParaAtar(v.valor.cliente_codigo, codigos);
  if (!codigoOk.ok || !codigoOk.codigo) {
    return NextResponse.json(
      { error: codigoOk.ok ? "Elige el cliente" : codigoOk.error },
      { status: 400 },
    );
  }

  const r = await agregarDestino(
    { ...v.valor, cliente_codigo: codigoOk.codigo },
    auth.userName ?? auth.userId ?? auth.role,
  );
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, id: r.id }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const auth = requireRole(req, ROLES);
  if (auth instanceof NextResponse) return auth;

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Falta el id de la fila" }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const v = validarDestinoEdicion(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const { elDeSiempre, ...cambiosTexto } = v.valor;
  if (cambiosTexto.destino !== undefined || cambiosTexto.tiendas !== undefined) {
    const r = await editarDestino(id, cambiosTexto);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  }
  // 🔴 «El de siempre» (4-sep-2026): el servidor garantiza a lo sumo UNO por
  // cliente — al marcar, apaga los demás destinos activos de ese cliente.
  if (elDeSiempre !== undefined) {
    const r = await marcarElDeSiempre(id, elDeSiempre);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = requireRole(req, ROLES);
  if (auth instanceof NextResponse) return auth;

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Falta el id de la fila" }, { status: 400 });
  }
  const r = await desactivarDestino(id, auth.userName ?? auth.userId ?? auth.role);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}
