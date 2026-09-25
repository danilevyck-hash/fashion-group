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
  faltaLaMigracion,
  horaQueCuenta,
  marcasDelDia,
  rutaDeSelfie,
  validarPayloadMarca,
} from "@/lib/marcacion/marcacion";
import { avisoDiaCompleto, estadoDelBotonHoy, pideFoto } from "@/lib/marcacion/cuatro-marcas";
// 🔴 LO QUE NACIÓ EL 25-sep-2026, y las dos cosas fallan ABIERTAS: sin la
// migración `20261220120000` la marca entra igual, sin calle y sin sello.
import { CAMPO_APARATO, selloValido } from "@/lib/marcacion/sello-del-aparato";
import { faltaUnaColumnaNueva, sinLasColumnasNuevas } from "@/lib/marcacion/columnas-nuevas";
import { lugarTextoDeLaMarca } from "@/lib/marcacion/lugar-al-marcar";
import { revisarMismoAparato } from "@/lib/asistencia/mismo-aparato-io";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Panamá es UTC−5 fijo, como en todo el sistema. */
const PANAMA = "-05:00";

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
  // 🔴 EL SELLO DEL TELÉFONO — opcional, y no se le cree nada más que la forma.
  // Un sello raro se descarta y la marca entra igual: acá nada se bloquea.
  const selloCrudo = String(form.get(CAMPO_APARATO) ?? "").trim();
  const aparatoId = selloValido(selloCrudo) ? selloCrudo : null;
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

  const loQueLlego = {
    eventoId,
    tipo,
    lat: num("lat"),
    lng: num("lng"),
    precisionM: num("precisionM"),
    selfie: esArchivo(selfie) ? { tipo: String(selfie.type ?? ""), bytes: selfie.size } : null,
  };
  // 🔑 PRIMERO LO QUE NO DEPENDE DE NADIE —quién es, dónde está, y que la foto,
  // SI VINO, sea una imagen que no pese de más—. Si la foto es obligatoria se
  // decide abajo, cuando se sabe QUÉ MARCA del día es ésta: eso lo dice el
  // orden, y el orden lo tiene la base.
  const malo = validarPayloadMarca(loQueLlego, false);
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

    // 🔴 LAS MARCAS DEL DÍA Y NI UNA MÁS, comprobado en el SERVIDOR. Desde el
    // 24-sep-2026 son CUATRO (`cuatro-marcas.ts`); con ese interruptor apagado,
    // las dos de siempre. La pantalla apaga el botón, pero una marca sin señal
    // puede llegar tarde y encontrar el día ya completo: se rechaza con su
    // motivo, la persona lo lee y, si de verdad hay un error, lo corrige la
    // contadora. 🔑 La regla es LA MISMA del botón, nunca una copia con un
    // número escrito a mano.
    const { marcas } = await leerMarcasDeLaQuincena(codigo, fecha);
    const yaTiene = marcasDelDia(marcas, fecha);
    if (!estadoDelBotonHoy(yaTiene).tipo) {
      return NextResponse.json({ error: avisoDiaCompleto() }, { status: 409 });
    }

    // 🔴 LA FOTO LA EXIGE EL SERVIDOR, Y SOLO EN LA ENTRADA Y EN LA SALIDA
    // (24-sep-2026). Las dos del ALMUERZO van sin foto —un solo toque—, pero
    // quién es cuál lo dice el ORDEN del día, que sale de la base: el teléfono
    // no puede saltarse la foto de la entrada diciendo que es el almuerzo. Es
    // la MISMA validación de siempre, contestada con la respuesta de `pideFoto`.
    const faltaFoto = validarPayloadMarca(loQueLlego, pideFoto(yaTiene));
    if (faltaFoto) return NextResponse.json({ error: faltaFoto }, { status: 400 });

    // 🔑 Sin foto no se sube nada y `foto_path` queda en NULL — la columna es
    // nullable desde que nació y así están TODAS las marcas del reloj físico.
    if (esArchivo(selfie)) {
      const path = rutaDeSelfie(codigo, fecha, eventoId);
      subida = (await subirSelfie(path, Buffer.from(await (selfie as Blob).arrayBuffer()))).path;
    }

    // 🔴 EL LUGAR EN PALABRAS SE RESUELVE ACÁ Y VIAJA EN EL MISMO INSERT.
    // `asistencia_marcaciones` es append-only —hay barrido que prohíbe el
    // `update`—, así que rellenarlo después no era una opción. Sin la llave de
    // Google esto contesta `null` sin tocar la red. Ver `lugar-al-marcar.ts`.
    const lugarTexto = await lugarTextoDeLaMarca(num("lat"), num("lng"));

    const fila = {
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
        lugar_texto: lugarTexto,
        aparato_id: aparatoId,
    };

    let { error } = await guardarMarcaciones([fila]);
    // 🔴 FALLA ABIERTA: sin las columnas nuevas, la marca de siempre entra tal
    // cual. Lo único que se pierde es la calle y el sello.
    if (faltaUnaColumnaNueva(error)) {
      ({ error } = await guardarMarcaciones([sinLasColumnasNuevas(fila)]));
    }

    if (error) {
      // La fila no entró: la foto no se queda suelta en el bucket. Una marca
      // del almuerzo no subió ninguna: no hay nada que borrar.
      if (subida) await borrarSelfies([subida]);
      subida = null;
      if (faltaLaMigracion(error)) {
        return NextResponse.json({ error: AVISO_FALTA_MIGRACION }, { status: 503 });
      }
      throw new Error(error.message);
    }

    // 🔴 DOS PERSONAS, UN SOLO TELÉFONO: se mira DESPUÉS de que la fila entró y
    // nunca frena nada. Manda un mensaje al chat privado de Daniel, uno por
    // (aparato, día), y no bloquea ninguna marca. Ver `mismo-aparato.ts`.
    await revisarMismoAparato(
      aparatoId,
      new Date(Date.parse(`${fecha}T00:00:00.000${PANAMA}`)).toISOString(),
      new Date(Date.parse(`${fecha}T23:59:59.999${PANAMA}`)).toISOString(),
    );

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
