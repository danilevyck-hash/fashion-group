// ─────────────────────────────────────────────────────────────────────────────
// /api/marcacion — el reloj del teléfono (14-sep-2026).
//
//   GET  → qué hora es (LA DEL SERVIDOR), qué dice el botón, y sus marcas de
//          la quincena. Nada de nadie más.
//   POST → guarda la marca: la selfie al bucket privado y la fila en
//          `asistencia_marcaciones`, la MISMA tabla de los relojes físicos.
//
// 🔴 TRES COSAS QUE ESTA RUTA NO HACE, Y SON LA MITAD DEL DISEÑO:
//   · NO le cree al teléfono qué hora es. Con señal, `ocurrio_en` sale de acá.
//     Daniel: *«que no puedan cambiar la hora de su teléfono»*.
//   · NO le cree al teléfono por QUIÉN marca. El código de colaborador sale de
//     `fg_users.empleado_codigo` de la SESIÓN, nunca del cuerpo del pedido.
//   · NO edita ni borra nada. La tabla es append-only: se escribe por
//     `guardarMarcaciones` (upsert que IGNORA duplicados), que es la misma
//     puerta que usa el agente del reloj.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { guardarMarcaciones } from "@/lib/asistencia/guardar-marcaciones";
import { leerEmpleadoCodigo, requireMarcacion } from "@/lib/marcacion/acceso";
import {
  armarEstadoDeLaPantalla as estado,
  leerMarcasDeLaQuincena,
  marcaYaGuardada,
  nombreDeLaFicha,
} from "@/lib/marcacion/estado-server";
import { borrarSelfies, subirSelfie } from "@/lib/marcacion/selfie-servidor";
import {
  AVISO_FALTA_MIGRACION,
  AVISO_SIN_CODIGO as SIN_CODIGO,
  DISPOSITIVO_TELEFONO,
  diaPanamaDe,
  estadoDelBoton,
  faltaLaMigracion,
  horaQueCuenta,
  marcasDelDia,
  rutaDeSelfie,
  validarPayloadMarca,
} from "@/lib/marcacion/marcacion";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Sin código atado no hay a quién marcarle. Se DICE, no se inventa uno. El
// texto vive en el módulo puro (`AVISO_SIN_CODIGO`) porque la PÁGINA dice lo
// mismo: ver la nota de ese archivo.

export async function GET(req: NextRequest) {
  const auth = requireMarcacion(req);
  if (auth instanceof NextResponse) return auth;

  const codigo = await leerEmpleadoCodigo(auth.userId);
  if (!codigo) {
    // 🔑 200 y no 403: el permiso está bien, lo que falta es el amarre. Un
    // error rojo haría pensar que la pantalla no es suya.
    return NextResponse.json({ codigo: null, aviso: SIN_CODIGO, ahora: new Date().toISOString() });
  }

  try {
    return NextResponse.json(await estado(codigo, await nombreDeLaFicha(codigo)));
  } catch (e) {
    console.error("[marcacion GET]", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "No se pudieron leer tus marcas. Intenta de nuevo en unos segundos." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireMarcacion(req);
  if (auth instanceof NextResponse) return auth;

  const codigo = await leerEmpleadoCodigo(auth.userId);
  if (!codigo) return NextResponse.json({ error: SIN_CODIGO }, { status: 409 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "No se entendió lo que se envió. Vuelve a marcar." }, { status: 400 });
  }

  const eventoId = String(form.get("eventoId") ?? "").trim();
  const tipo = String(form.get("tipo") ?? "").trim();
  const sinSenal = String(form.get("sinSenal") ?? "") === "1";
  const horaTelefono = String(form.get("horaTelefono") ?? "").trim() || null;
  const selfie = form.get("selfie");
  // 🔑 NO SE PREGUNTA `instanceof File`. El `File` que arma el runtime al
  // parsear el formulario no siempre es el MISMO `File` global del entorno
  // (undici contra el del navegador o el de jsdom): con `instanceof`, una
  // selfie perfectamente válida se rechazaría con «Falta la selfie» y nadie
  // entendería por qué. Se pregunta por lo que se le va a pedir.
  const esArchivo = (v: unknown): v is Blob & { type: string; size: number } =>
    typeof v === "object" && v !== null &&
    typeof (v as Blob).arrayBuffer === "function" &&
    typeof (v as Blob).size === "number";
  const num = (k: string): number | null => {
    const v = String(form.get(k) ?? "").trim();
    if (v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const malo = validarPayloadMarca({
    eventoId,
    tipo,
    lat: num("lat"),
    lng: num("lng"),
    precisionM: num("precisionM"),
    selfie: esArchivo(selfie) ? { tipo: String(selfie.type ?? ""), bytes: selfie.size } : null,
  });
  if (malo) return NextResponse.json({ error: malo }, { status: 400 });

  const cuando = horaQueCuenta({ sinSenal, horaTelefono, ahoraServidor: new Date().toISOString() });
  if (!cuando.ok) return NextResponse.json({ error: cuando.motivo }, { status: 400 });

  let subida: string | null = null;
  try {
    // 🔑 UN REENVÍO NO ES UN ERROR. El teléfono manda su cola apenas vuelve la
    // señal y puede reenviar una marca que sí había entrado (se cortó al
    // contestar). Se contesta `ok` con el estado de hoy: el teléfono la saca de
    // la cola y nadie ve un aviso rojo por algo que ya está bien.
    if (await marcaYaGuardada(DISPOSITIVO_TELEFONO, eventoId)) {
      return NextResponse.json({
        ok: true,
        yaEstaba: true,
        ...(await estado(codigo, await nombreDeLaFicha(codigo))),
      });
    }

    const fecha = diaPanamaDe(cuando.ocurrioEn);

    // 🔴 DOS MARCAS AL DÍA Y NADA MÁS, comprobado en el SERVIDOR. La pantalla
    // apaga el botón, pero una marca sin señal puede llegar tarde y encontrar
    // el día ya cerrado: se rechaza con su motivo, la persona lo lee y, si de
    // verdad hay un error, lo corrige la contadora.
    const { marcas } = await leerMarcasDeLaQuincena(codigo, fecha);
    const yaTiene = marcasDelDia(marcas, fecha);
    if (!estadoDelBoton(yaTiene).tipo) {
      return NextResponse.json(
        { error: "Ese día ya tiene su entrada y su salida. Si algo está mal, avísale a Roxana." },
        { status: 409 },
      );
    }

    const archivo = selfie as Blob;
    const path = rutaDeSelfie(codigo, fecha, eventoId);
    subida = (await subirSelfie(path, Buffer.from(await archivo.arrayBuffer()))).path;

    const { error } = await guardarMarcaciones([
      {
        dispositivo: DISPOSITIVO_TELEFONO,
        evento_id: eventoId,
        empleado_codigo: codigo,
        empleado_nombre: await nombreDeLaFicha(codigo),
        ocurrio_en: cuando.ocurrioEn,
        tipo,
        // El crudo de esta fuente: de dónde salió y con qué venía. Las columnas
        // de arriba son lo que se lee; esto es para poder auditar después.
        raw: {
          fuente: DISPOSITIVO_TELEFONO,
          enviado_en: new Date().toISOString(),
          user_agent: req.headers.get("user-agent") ?? null,
        },
        sin_senal: sinSenal,
        hora_telefono: horaTelefono,
        foto_path: subida,
        lat: num("lat"),
        lng: num("lng"),
        precision_m: num("precisionM"),
        marcada_por: auth.userName ?? null,
      },
    ]);

    if (error) {
      // La fila no entró: la foto no se queda suelta en el bucket.
      await borrarSelfies([subida]);
      subida = null;
      if (faltaLaMigracion(error)) {
        return NextResponse.json({ error: AVISO_FALTA_MIGRACION }, { status: 503 });
      }
      throw new Error(error.message);
    }

    return NextResponse.json({
      ok: true,
      ...(await estado(codigo, await nombreDeLaFicha(codigo))),
    });
  } catch (e) {
    if (subida) await borrarSelfies([subida]).catch(() => undefined);
    console.error("[marcacion POST]", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "No se pudo guardar la marca. Intenta de nuevo en unos segundos." },
      { status: 500 },
    );
  }
}
