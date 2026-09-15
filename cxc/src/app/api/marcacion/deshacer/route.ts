// ─────────────────────────────────────────────────────────────────────────────
// /api/marcacion/deshacer — DESHACER LA ÚLTIMA MARCA, DOS MINUTOS (14-sep-2026)
//
// Daniel probó el reloj del teléfono y marcó la salida cinco minutos después de
// la entrada, por error de dedo. Hasta hoy eso pedía escribirle a la contadora.
//
// 🔴 ESTA RUTA NO BORRA NADA Y NO TOCA `asistencia_marcaciones`. La marca se
// QUITA con una corrección encima, en `asistencia_correcciones` —el mecanismo
// que ya existía, con su motivo, su firma y su `anulada_en`—. La fila del reloj
// queda intacta para siempre: es la prueba de a qué hora marcó alguien, y eso
// define un pago.
//
// 🔴 EL TELÉFONO NO DICE QUÉ SE DESHACE. Manda un POST vacío; el servidor mira
// cuál fue la última marca de ESA persona (el código sale de la sesión, nunca
// del cuerpo), comprueba que salió del teléfono y que no pasaron los dos
// minutos, y recién ahí la quita. Sin eso, un teléfono podría nombrar la marca
// de cualquier día y pedir que se quite.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { hoyPanama } from "@/lib/fecha-panama";
import { crearCorreccion } from "@/lib/asistencia/correcciones-server";
import { leerEmpleadoCodigo, requireMarcacion } from "@/lib/marcacion/acceso";
import {
  armarEstadoDeLaPantalla,
  leerMarcasDeLaQuincena,
  nombreDeLaFicha,
} from "@/lib/marcacion/estado-server";
import { diaPanamaDe } from "@/lib/marcacion/marcacion";
import { MOTIVO_DESHACER, avisoDeshecha } from "@/lib/marcacion/deshacer";

export const dynamic = "force-dynamic";

/** Lo que se contesta cuando ya no hay nada que deshacer. Dice qué hacer. */
const YA_NO =
  "Ya pasaron los dos minutos para deshacer esa marca. Si está mal, avísale a Roxana.";

/** Sin la migración corrida no se puede quitar una marca, y se DICE. */
const FALTA_MIGRACION =
  "Todavía no se puede deshacer una marca del lado del sistema. "
  + "Avísale a Daniel: falta correr la migración 20261128120000_marcacion_deshacer.sql.";

export async function POST(req: NextRequest) {
  const auth = requireMarcacion(req);
  if (auth instanceof NextResponse) return auth;

  const codigo = await leerEmpleadoCodigo(auth.userId);
  if (!codigo) {
    return NextResponse.json(
      { error: "Tu usuario no tiene una ficha de colaborador, así que no hay marca que deshacer." },
      { status: 409 },
    );
  }

  try {
    const nombre = await nombreDeLaFicha(codigo);
    // 🔑 La MISMA lectura de siempre: ya viene sin las marcas deshechas y ya
    // trae calculado qué se puede deshacer, con la regla del módulo puro.
    const { deshacer } = await leerMarcasDeLaQuincena(codigo, hoyPanama());
    if (!deshacer) return NextResponse.json({ error: YA_NO }, { status: 409 });

    const escrita = await crearCorreccion({
      marcacionId: deshacer.id,
      empleadoCodigo: codigo,
      // 🔴 EL DÍA SALE DE LA MARCA, no de «hoy»: deshacer a las 00:01 una marca
      // de las 23:59 tiene que anotarse en el día de la marca.
      fecha: diaPanamaDe(deshacer.ocurrioEn),
      hora: null,
      quita: true,
      motivo: MOTIVO_DESHACER,
      // Queda dicho quién la deshizo: ella misma, con su usuario.
      creadaPor: (auth.userName ?? "").trim() || nombre || `colaborador ${codigo}`,
    });

    if (!escrita.ok) {
      if (escrita.faltaMigracion) {
        return NextResponse.json({ error: FALTA_MIGRACION }, { status: 503 });
      }
      // 🔑 El índice único deja UNA corrección viva por marcación: dos toques
      // seguidos chocan acá. No es un error de nadie — ya está deshecha.
      if (/ya tiene una corrección/i.test(escrita.error)) {
        return NextResponse.json({
          ok: true,
          yaEstaba: true,
          ...(await armarEstadoDeLaPantalla(codigo, nombre)),
        });
      }
      // Sin la columna `quita` la base rechaza la fila con su propio mensaje:
      // se traduce a algo que una persona entiende.
      if (/quita/i.test(escrita.error)) {
        return NextResponse.json({ error: FALTA_MIGRACION }, { status: 503 });
      }
      throw new Error(escrita.error);
    }

    return NextResponse.json({
      ok: true,
      aviso: avisoDeshecha(deshacer.tipo),
      ...(await armarEstadoDeLaPantalla(codigo, nombre)),
    });
  } catch (e) {
    console.error("[marcacion deshacer]", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "No se pudo deshacer la marca. Intenta de nuevo en unos segundos." },
      { status: 500 },
    );
  }
}
