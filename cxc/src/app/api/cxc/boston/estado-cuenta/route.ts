// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cxc/boston/estado-cuenta?codigo=<codigo de Boston>
//
// Los DOCUMENTOS con saldo de UN cliente de Confecciones Boston, para el cajón
// de su cartera.
//
// 🔴 ES UNA RUTA APARTE, CON SU PROPIA CONSULTA, A PROPÓSITO. No reusa
// `fetchEstadoCuentaData` —el helper del GRUPO— aunque haga casi lo mismo:
// ese helper recibe una LISTA de empresas y bastaría con pasarle
// `["confecciones_boston"]` para mezclar los dos mundos por descuido. Mientras
// sean dos caminos, mezclar la plata de Boston con la del grupo no es algo que
// se pueda hacer sin proponérselo. Regla de Daniel: *"debe de ser cxc de
// fashion group y otro aparte de boston, no deben de ni convivir juntos."*
//
// 🔴 LA CONSULTA VIVE EN `lib/cxc/boston-estado-cuenta.ts` DESDE EL 9-SEP-2026,
// y es de Boston de punta a punta: `.eq("empresa_key", EMPRESA_BOSTON)` en la
// misma cadena, su ficha del cliente de `switch_clientes` acotado a Boston. Se
// sacó de acá para que el correo de Boston lea EXACTAMENTE los mismos
// documentos que muestra este cajón — dos consultas para el mismo estado de
// cuenta es cómo se llega a que el papel diga un número y la pantalla otro.
//
// El signo por tipo de comprobante es el MISMO que usa la vista
// `switch_estadocuenta_aging_boston` (débito suma, crédito resta, desconocido
// vale 0), así que el total del cajón cuadra al centavo con el de la lista.
//
// 🔴 SE MUESTRAN TODOS LOS DOCUMENTOS: nada se pliega por ser de menos de $50
// (Daniel, 9-sep-2026: *«En ninguno. Quiero ver todo.»*).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { rolesBoston } from "@/lib/cxc/boston-roles";
import { fetchEstadoCuentaBoston } from "@/lib/cxc/boston-estado-cuenta";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, rolesBoston());
  if (auth instanceof NextResponse) return auth;

  const codigo = (req.nextUrl.searchParams.get("codigo") ?? "").trim();
  if (!codigo) return NextResponse.json({ error: "codigo requerido" }, { status: 400 });

  let estado;
  try {
    estado = await fetchEstadoCuentaBoston(codigo);
  } catch (e) {
    console.error(`[cxc/boston/estado-cuenta] ${(e as Error).message}`);
    return NextResponse.json({ error: "Error al leer el estado de cuenta" }, { status: 500 });
  }

  // La forma que el cajón ya dibujaba. Boston es UNA empresa, así que sus
  // documentos son los de su única fila: no hay desglose que aplanar.
  const documentos = (estado.empresas[0]?.documentos ?? []).map((d) => ({
    numero: d.numero,
    fecha: d.fecha,
    tipo: d.tipo,
    monto: d.monto,
    saldo: d.saldo,
    dias: d.dias,
  }));

  return NextResponse.json({
    codigo,
    documentos,
    total: estado.total,
    generadoEn: estado.generadoEn,
  });
}
