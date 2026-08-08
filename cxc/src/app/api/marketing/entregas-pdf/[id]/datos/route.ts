// GET /api/marketing/entregas-pdf/[id]/datos
//
// Los DATOS de la nota de entrega (los mismos que arma el PDF de al lado),
// en JSON y con las fotos ya en base64.
//
// 🩸 POR QUÉ EXISTE, SI YA HAY UNA RUTA QUE DEVUELVE EL PDF HECHO:
//   Para COMPARTIR el archivo, Safari en iOS exige que `navigator.share()`
//   salga del gesto del toque. Si al tocar "Compartir" hay que ir al servidor
//   a buscar el PDF, ese `await` hace que el navegador ya no lo cuente como
//   parte del toque y lo bloquea con `NotAllowedError` (está documentado en
//   `src/lib/compartir-archivo.ts`). La salida es tener los datos EN LA MANO
//   antes del clic: la pantalla los pide al desplegar la entrega y arma el
//   PDF en el navegador, sin ningún `await` en el medio.
//
//   El dibujo es el MISMO módulo (`lib/marketing/pdf-entrega-mueble.ts`) en
//   los dos lados, así que no hay dos papeles posibles: el que se comparte y
//   el que abre el link del Excel del ZIP salen de la misma función.
//
// 🔒 Sesión admin/secretaria, igual que el resto del módulo. A diferencia de
//    la ruta del PDF, ésta NO acepta el token HMAC: el token está pensado
//    para abrir un papel desde un Excel descargado, no para servir datos.
//    El path vive bajo un prefijo público del middleware, así que la puerta
//    la pone ESTE route. FAIL-CLOSED.
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { cargarComprobante } from "@/lib/marketing/entrega-comprobante";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  const id = decodeURIComponent(params.id);
  if (!uuidRegex.test(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  try {
    const datos = await cargarComprobante(id);
    if (!datos) {
      return NextResponse.json(
        { error: "Entrega no encontrada" },
        { status: 404 },
      );
    }
    return NextResponse.json(datos, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("GET /api/marketing/entregas-pdf/[id]/datos:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
