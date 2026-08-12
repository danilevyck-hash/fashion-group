import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import {
  abrirPeriodo,
  cerrarPeriodo,
  contarAbiertos,
  esFaltaDeTablas,
  getPeriodo,
  reabrirPeriodo,
  sellarDocumento,
} from "@/lib/marketing/periodos-io";
import {
  armarReportePeriodo,
  cargarDatosPeriodos,
} from "@/lib/marketing/periodos-reporte";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MSG_SIN_TABLAS =
  "Todavía no se activaron los períodos. Falta correr la actualización en la base de datos.";

// POST /api/marketing/periodos/[id]/cerrar   body: { nombreSiguiente }
//
// Cierra el período abierto de UN proveedor y abre el siguiente en cero.
//
// 🔑 LOS PROYECTOS NO SE CIERRAN. Lo que se congela es la parte de ESE
// proveedor: un proyecto con Tommy (PVH) y Reebok, al cerrar PVH, conserva su
// parte de Reebok viva y se le puede seguir cargando gasto.
//
// El orden no es negociable:
//   1. validar (existe, está abierto, el nombre del próximo no viene vacío)
//   2. generar el reporte con SOLO la parte de ese proveedor
//   3. cerrar (estado, cuándo y quién) guardando el reporte tal como salió
//   4. abrir el siguiente en cero
//
// 🩸 3 y 4 tienen que quedar consistentes. El índice único
// `mk_periodos_uno_abierto_por_proveedor` protege de dejar DOS abiertos, pero
// no de dejar CERO — y cero abiertos deja al proveedor sin dónde registrar el
// próximo gasto, que es peor que no haber cerrado. Por eso, si el paso 4 falla,
// el 3 se revierte; y al final se verifica que quedó exactamente uno.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  if (!uuidRegex.test(params.id)) {
    return NextResponse.json({ error: "Período inválido" }, { status: 400 });
  }

  let nombreSiguiente = "";
  try {
    const body = (await req.json()) as { nombreSiguiente?: unknown };
    nombreSiguiente =
      typeof body?.nombreSiguiente === "string" ? body.nombreSiguiente.trim() : "";
  } catch {
    return NextResponse.json(
      { error: "No se recibió el nombre del próximo período." },
      { status: 400 },
    );
  }
  if (!nombreSiguiente) {
    return NextResponse.json(
      { error: "Escribí cómo se va a llamar el próximo período." },
      { status: 400 },
    );
  }
  if (nombreSiguiente.length > 120) {
    return NextResponse.json(
      { error: "El nombre es muy largo. Usá menos de 120 letras." },
      { status: 400 },
    );
  }

  try {
    // ---- 1. Validar -------------------------------------------------------
    const periodo = await getPeriodo(params.id);
    if (!periodo) {
      return NextResponse.json({ error: "Ese período no existe." }, { status: 404 });
    }
    if (periodo.estado !== "abierto") {
      return NextResponse.json(
        { error: "Este período ya está cerrado." },
        { status: 400 },
      );
    }

    // ---- 2. Reporte -------------------------------------------------------
    const datos = await cargarDatosPeriodos();
    if (!datos.hayTablas) {
      return NextResponse.json({ error: MSG_SIN_TABLAS }, { status: 409 });
    }
    const { reporte, documentos } = armarReportePeriodo(datos, {
      id: periodo.id,
      proveedor_key: periodo.proveedor_key,
      nombre: periodo.nombre,
    });

    // 2b. Sellar lo que entró en el reporte y todavía no tenía sello.
    //
    // Un documento sin sello se lee como "del período actual". Si se queda sin
    // sellar, después de cerrar volvería a aparecer en el período NUEVO — o
    // sea, ya reportado y contándose otra vez. Se sella ANTES de cerrar,
    // porque `sellarDocumento` ata al período ABIERTO, que en este instante es
    // justamente el que se está por cerrar. Es best-effort: nunca lanza, y un
    // documento ya sellado no se mueve (ON CONFLICT DO NOTHING).
    for (const facturaId of documentos.facturas) {
      await sellarDocumento({
        tipo: "factura",
        documentoId: facturaId,
        proveedorKeys: [periodo.proveedor_key],
      });
    }
    for (const entregaId of documentos.entregas) {
      await sellarDocumento({
        tipo: "entrega",
        documentoId: entregaId,
        proveedorKeys: [periodo.proveedor_key],
      });
    }

    // ---- 3. Cerrar --------------------------------------------------------
    await cerrarPeriodo(periodo.id, reporte, auth.userName || auth.role);

    // ---- 4. Abrir el siguiente en cero ------------------------------------
    let siguienteId: string;
    try {
      const nuevo = await abrirPeriodo(periodo.proveedor_key, nombreSiguiente);
      siguienteId = nuevo.id;
    } catch (errAbrir) {
      // Revertir el cierre: dejar al proveedor sin período abierto lo dejaría
      // sin poder registrar un gasto nuevo.
      try {
        await reabrirPeriodo(periodo.id);
      } catch (errRevertir) {
        console.error(
          "POST /api/marketing/periodos/[id]/cerrar: no se pudo revertir el cierre:",
          errRevertir instanceof Error ? errRevertir.message : errRevertir,
        );
      }
      const msg =
        errAbrir instanceof Error ? errAbrir.message : "no se pudo abrir";
      console.error("cerrar[abrir siguiente]:", msg);
      return NextResponse.json(
        {
          error:
            "No se pudo abrir el período nuevo, así que no se cerró nada. Intenta de nuevo.",
        },
        { status: 500 },
      );
    }

    // ---- Verificación final: exactamente UN período abierto ---------------
    const abiertos = await contarAbiertos(periodo.proveedor_key);
    if (abiertos !== 1) {
      console.error(
        `cerrar[verificación]: ${periodo.proveedor_key} quedó con ${abiertos} períodos abiertos`,
      );
      return NextResponse.json(
        {
          error:
            "El período se cerró pero quedó algo raro con el nuevo. Revisá la lista de períodos antes de seguir.",
          periodoCerrado: periodo.id,
          periodoNuevo: siguienteId,
          abiertos,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      cerrado: {
        id: periodo.id,
        nombre: periodo.nombre,
        proveedorKey: periodo.proveedor_key,
        totales: reporte.totales,
      },
      siguiente: { id: siguienteId, nombre: nombreSiguiente },
    });
  } catch (err) {
    if (esFaltaDeTablas(err)) {
      return NextResponse.json({ error: MSG_SIN_TABLAS }, { status: 409 });
    }
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("POST /api/marketing/periodos/[id]/cerrar:", msg);
    return NextResponse.json(
      { error: "No se pudo cerrar el período. Intenta de nuevo." },
      { status: 500 },
    );
  }
}
