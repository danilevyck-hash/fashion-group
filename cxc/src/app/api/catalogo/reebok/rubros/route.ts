/**
 * Catálogo Reebok — el mapa `rubro → categoría`, que desde el 17-sep-2026 se
 * administra en vez de programarse.
 *
 * 🩸 Vivía en el código, en DOS listas espejo que había que acordarse de tocar
 * juntas (`CATEGORIA_POR_RUBRO` y `REEBOK_CATEGORY_ESPERADAS`). Daniel,
 * preguntado si quería volverlas administrables: **«sí»**.
 *
 *   GET    → { lista: RubroDelCatalogo[], rubros: string[] }   (admin · secretaria)
 *   POST   → { rubro, categoria } → 201 { id }                 (SOLO admin)
 *   DELETE → ?id= → SOFT DELETE firmado                        (SOLO admin)
 *
 * 🔴 LEER es de quien administra el catálogo, porque la Plantilla Switch
 * —admin + secretaria— necesita la lista para que su aviso no grite de más.
 * ESCRIBIR es **solo admin**: cambiar este mapa mueve el cajón de un producto y,
 * con él, el bulto que se le cobra al cliente.
 *
 * 🔴 El GET FALLA ABIERTO: sin la migración contesta 200 con la lista vacía y
 * `rubros` con los seis del código, así que la Plantilla Switch sigue avisando
 * exactamente igual que antes. Una migración pendiente no rompe una pantalla.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import {
  RUBROS_ROLES_ESCRITURA,
  RUBROS_ROLES_LECTURA,
  rubrosParaElAviso,
  validarRubroNuevo,
} from "@/lib/catalogos/reebok-rubros";
import {
  agregarRubro,
  desactivarRubro,
  leerRubrosConfigurados,
} from "@/lib/catalogos/reebok-rubros-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, [...RUBROS_ROLES_LECTURA]);
  if (auth instanceof NextResponse) return auth;

  try {
    const lista = await leerRubrosConfigurados();
    return NextResponse.json({ lista, rubros: rubrosParaElAviso(lista) });
  } catch (e) {
    if ((e as Error & { tablaAusente?: boolean }).tablaAusente) {
      // ⚠️ 200, no un error: `rubrosParaElAviso(null)` devuelve los seis del
      // código y todo se comporta como antes de la migración.
      return NextResponse.json({ lista: [], rubros: rubrosParaElAviso(null), sinTabla: true });
    }
    return NextResponse.json(
      { error: "No se pudo cargar la lista. Intenta de nuevo en unos segundos." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, [...RUBROS_ROLES_ESCRITURA]);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const v = validarRubroNuevo(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const r = await agregarRubro(v.valor.rubro, v.valor.categoria, auth.userName ?? auth.userId ?? auth.role);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, id: r.id }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = requireRole(req, [...RUBROS_ROLES_ESCRITURA]);
  if (auth instanceof NextResponse) return auth;

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Falta el id de la fila" }, { status: 400 });
  }
  const r = await desactivarRubro(id, auth.userName ?? auth.userId ?? auth.role);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}
