/* ─────────────────────────────────────────────────────────────────────────────
 * «OTROS SERVICIOS» — la puerta. GET (lo de una persona en una quincena),
 * POST (anotar) y DELETE (quitar, soft).
 *
 * Daniel, 15-sep-2026: lo registra *«todos»* los que entran a Asistencia — la
 * misma lista de roles del módulo (`asistenciaRoles()`), sin una cuarta lista
 * escrita a mano. ⚠️ Bodega no entra a Asistencia (solo aprueba horas extra),
 * así que queda afuera por donde ya estaba afuera.
 *
 * 🔴 LA FECHA Y LA QUINCENA LAS PONE EL SERVIDOR. Daniel: *«se anota el día que
 * se hace la gestión y entra en esa quincena, sin elegir fecha»*. El cuerpo NO
 * trae fecha ni quincena, y si las trajera se ignorarían: `hoyPanama()` manda.
 * Con eso el renglón SIEMPRE cae en la quincena abierta.
 *
 * 🔴 CON LA QUINCENA YA CERRADA, UN RENGLÓN NO SE BORRA (Daniel: *«no»*). Lo
 * decide el servidor mirando `asistencia_planilla_guardada`, que es donde vive
 * «esto ya se pagó» — no una bandera de esta tabla.
 * ────────────────────────────────────────────────────────────────────────── */

import { NextRequest, NextResponse } from "next/server";

import { requireAsistencia } from "@/lib/asistencia/guard";
import { asistenciaRoles } from "@/lib/asistencia/roles";
import { codigosDelAlcance, rechazarFueraDeAlcance, soloPermitidos } from "@/lib/asistencia/alcance-boston-server";
import { hoyPanama } from "@/lib/fecha-panama";
import { quincenaDesdeClave } from "@/lib/asistencia/planilla";
import { esCerrada } from "@/lib/asistencia/planilla-guardada";
import { leerCabeceras } from "@/lib/asistencia/planilla-guardada-server";
import { EMPRESAS_ASISTENCIA } from "@/lib/asistencia/config";
import {
  avisoMigracionOtrosServicios,
  quincenaDeFecha,
  validarOtroServicio,
} from "@/lib/asistencia/otros-servicios";
import {
  anotarOtroServicio,
  leerOtrosServicios,
  leerUnOtroServicio,
  quitarOtroServicio,
} from "@/lib/asistencia/otros-servicios-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** La quincena de HOY en Panamá. Es la única que se puede escribir. */
function quincenaAbierta(): string {
  return quincenaDeFecha(hoyPanama()) ?? "";
}

/**
 * 🔴 ¿ESA QUINCENA YA SE PAGÓ EN ALGUNA EMPRESA?
 *
 * Se pregunta por el RANGO de la quincena contra las cabeceras cerradas de las
 * cuatro empresas. Se mira `esCerrada` y no «existe una cabecera»: un borrador
 * o una reabierta no pagaron nada, y frenar sobre ellas sería impedir arreglar
 * justo lo que se está por volver a cerrar.
 *
 * ⚠️ Alcanza con que UNA empresa la tenga cerrada para frenar. Es de más —la
 * persona cobra en una sola— y es a propósito: saber en cuál cobra pide leer su
 * ficha Y su reparto, y equivocarse en ese lado deja borrar un renglón de una
 * quincena ya pagada. Ante la duda, no se borra.
 */
async function quincenaYaPagada(clave: string): Promise<boolean> {
  const q = quincenaDesdeClave(clave);
  if (!q) return false;
  for (const empresa of EMPRESAS_ASISTENCIA) {
    const { cabeceras } = await leerCabeceras(empresa);
    if (cabeceras.some((c) => esCerrada(c.estado) && c.desde === q.desde && c.hasta === q.hasta)) {
      return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = requireAsistencia(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const codigo = (sp.get("codigo") ?? "").trim();
  // Sin `quincena` en la URL, la de hoy: es lo que la ficha necesita.
  const quincena = (sp.get("quincena") ?? "").trim() || quincenaAbierta();

  try {
    const { renglones, faltaTabla } = await leerOtrosServicios({
      quincena,
      codigo: codigo || undefined,
    });
    // 🔴 EL ALCANCE DE DAVID (23-sep-2026): solo los renglones de su gente.
    const permitidos = await codigosDelAlcance(auth.role);
    return NextResponse.json({
      quincena,
      renglones: soloPermitidos(renglones, (r) => r.codigo, permitidos),
      // Nada se rompe sin la migración: se DICE, con el nombre del archivo.
      faltaMigracion: faltaTabla ? avisoMigracionOtrosServicios() : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/otros-servicios GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = requireAsistencia(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;

  // 🔴 LA FIRMA SALE DE LA SESIÓN, NUNCA DEL CUERPO. Misma regla que el cierre
  // y que las correcciones de marcación: sin firma, «todos pueden» se vuelve
  // «nadie sabe quién fue».
  const usuario = String(auth.userName ?? "").trim();
  if (!usuario) {
    return NextResponse.json({ error: "La sesión no dice quién eres." }, { status: 400 });
  }

  let body: { codigo?: unknown; monto?: unknown; concepto?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "No se entendió el pedido." }, { status: 400 });
  }

  const codigo = String(body.codigo ?? "").trim();
  if (!codigo) {
    return NextResponse.json({ error: "Falta el colaborador." }, { status: 400 });
  }
  // 🔴 EL ALCANCE DE DAVID (23-sep-2026): a alguien ajeno no se le anota nada.
  const fuera = await rechazarFueraDeAlcance(auth.role, [codigo]);
  if (fuera) return fuera;

  const v = validarOtroServicio(body.monto, body.concepto);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  // 🔴 De acá, y de ningún otro lado. Lo que venga en el cuerpo se ignora.
  const fecha = hoyPanama();
  const quincena = quincenaDeFecha(fecha);
  if (!quincena) {
    return NextResponse.json({ error: "No se pudo saber a qué quincena va." }, { status: 500 });
  }

  try {
    const r = await anotarOtroServicio({
      codigo,
      quincena,
      fecha,
      monto: v.monto,
      concepto: v.concepto,
      anotadoPor: usuario,
    });
    if (!r.ok) {
      if (r.faltaTabla) {
        return NextResponse.json({ error: avisoMigracionOtrosServicios() }, { status: 503 });
      }
      return NextResponse.json({ error: r.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, id: r.id, quincena, fecha });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/otros-servicios POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const auth = requireAsistencia(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;
  const usuario = String(auth.userName ?? "").trim();
  if (!usuario) {
    return NextResponse.json({ error: "La sesión no dice quién eres." }, { status: 400 });
  }

  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "Falta el renglón." }, { status: 400 });

  try {
    const fila = await leerUnOtroServicio(id);
    if (!fila) return NextResponse.json({ error: "Ese renglón ya no está." }, { status: 404 });
    // 🔴 EL ALCANCE DE DAVID (23-sep-2026): se mira de QUIÉN es antes de quitarlo.
    const fuera = await rechazarFueraDeAlcance(auth.role, [fila.codigo]);
    if (fuera) return fuera;

    // 🔴 EL FRENO, ANTES DE ESCRIBIR NADA. Con la quincena ya cerrada un
    // renglón no se edita ni se borra: lo que se pagó se tiene que poder leer
    // después, igual que en todo el módulo.
    if (await quincenaYaPagada(fila.quincena)) {
      return NextResponse.json(
        {
          error:
            "Esa quincena ya está cerrada, así que este renglón no se puede quitar. "
            + "Si hay que corregirlo, hay que reabrir la quincena.",
        },
        { status: 409 },
      );
    }

    const r = await quitarOtroServicio({ id, usuario });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/otros-servicios DELETE]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
