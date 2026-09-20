// POST /api/asistencia/correcciones/dia
//   { codigo, fecha, motivo, cambios: [{ tipo, marcacionId, reemplaza, hora }] }
//
// ── 🔴 EL DÍA COMPLETO, DE UN SOLO GOLPE (19-sep-2026) ──────────────────────
//
// Hasta hoy corregir un día era una ventana por marca, y cambiar una hora ya
// corregida obligaba a deshacer primero y volver a escribir el motivo. Medido:
// **58 de 141 días necesitaron 2, 3 y hasta 7 ventanas**, y **44 de las 58
// correcciones anuladas** fueron seguidas de otra del mismo día en menos de 10
// minutos — deshacer-para-reescribir.
//
// Esta ruta recibe las cuatro marcas de un día arregladas a la vez, con UN
// motivo, y escribe lo que cambió.
//
// ── 🔴 LO QUE ESTA RUTA NO HACE ─────────────────────────────────────────────
//
// NO toca `asistencia_marcaciones`. Ni un UPDATE, ni un DELETE. Lo único que le
// hace es LEER una fila para validar que la corrección apunta a la persona y al
// día que dice — lo mismo que la ruta de a una. La marcación del reloj es la
// única prueba de a qué hora entró alguien, y eso define un pago.
//
// ── 🔴 SE VALIDA TODO ANTES DE ESCRIBIR NADA ────────────────────────────────
//
// No hay transacción: son N inserts. Por eso la validación entera (el motivo,
// cada hora, que lo que se quita exista en el reloj, que el día salga de la
// MARCACIÓN y no del navegador) corre ANTES del primer write. Un cuerpo malo no
// escribe ni media corrección.
//
// ── 🔑 REEMPLAZAR = ANULAR + ESCRIBIR ───────────────────────────────────────
//
// La base tiene un único parcial: UNA corrección viva por marcación. Cambiar
// una hora ya corregida se hace anulando la anterior (con firma, `anulada_en`)
// y escribiendo la nueva. Las dos filas quedan. Lo que se ahorra es el viaje.

import { NextRequest, NextResponse } from "next/server";
import { asistenciaRoles } from "@/lib/asistencia/roles";
import { requireAsistencia } from "@/lib/asistencia/guard";
import { diaPanama } from "@/lib/asistencia/reporte";
import {
  avisoMigracionCorrecciones,
  fechaValida,
  motivoValido,
  normalizarHora,
  normalizarMotivo,
} from "@/lib/asistencia/correcciones";
import type { TipoCambio } from "@/lib/asistencia/editar-el-dia";
import {
  anularCorreccion,
  crearCorreccion,
  leerMarcacion,
} from "@/lib/asistencia/correcciones-server";

export const dynamic = "force-dynamic";

/** Cuántas marcas puede traer un día. Cuatro son las de siempre; el tope deja
 *  lugar a los días con marcas de más sin dejar pasar un cuerpo absurdo. */
const MAX_CAMBIOS = 24;

/**
 * Quién firma. Nunca puede quedar vacío: el nombre de la sesión, y si no lo
 * hubiera, el rol. La misma función que la ruta de a una.
 */
function firma(auth: { userName?: string | null; role?: string | null }): string {
  const n = String(auth.userName ?? "").trim();
  if (n) return n;
  const r = String(auth.role ?? "").trim();
  return r || "desconocido";
}

/** Un cambio ya validado y con la persona y el día resueltos. */
interface CambioListo {
  clave: string;
  tipo: TipoCambio;
  marcacionId: string | null;
  reemplaza: string | null;
  hora: string | null;
  codigo: string;
  fecha: string;
}

export async function POST(req: NextRequest) {
  const auth = requireAsistencia(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;

    // 🔴 EL MOTIVO PRIMERO Y NO SE NEGOCIA. Es UNO para todo el día: la razón
    // por la que ese día se tocó. Vacío o solo espacios no sirve.
    if (!motivoValido(body?.motivo)) {
      return NextResponse.json(
        { error: "Escribe por qué se corrige. Sin razón no se puede guardar." },
        { status: 400 },
      );
    }
    const motivo = normalizarMotivo(body?.motivo);

    const crudos = Array.isArray(body?.cambios) ? (body!.cambios as unknown[]) : [];
    if (crudos.length === 0) {
      return NextResponse.json({ error: "No cambiaste nada en este día." }, { status: 400 });
    }
    if (crudos.length > MAX_CAMBIOS) {
      return NextResponse.json({ error: "Son demasiados cambios para un día." }, { status: 400 });
    }

    const codigoCuerpo = String(body?.codigo ?? "").trim();
    const fechaCuerpo = String(body?.fecha ?? "").trim();

    // ── VALIDAR TODO, SIN ESCRIBIR ──────────────────────────────────────────
    const listos: CambioListo[] = [];
    const vistas = new Set<string>();
    for (const c of crudos) {
      const o = c as Record<string, unknown> | null;
      const clave = String(o?.clave ?? "").trim() || `#${listos.length + 1}`;
      const tipoCrudo = String(o?.tipo ?? "").trim();
      if (tipoCrudo !== "corregir" && tipoCrudo !== "agregar" && tipoCrudo !== "quitar") {
        return NextResponse.json({ error: "Llegó un cambio que no se entiende." }, { status: 400 });
      }
      const tipo = tipoCrudo as TipoCambio;
      const marcacionId = String(o?.marcacionId ?? "").trim() || null;
      const reemplaza = String(o?.reemplaza ?? "").trim() || null;

      // 🔑 UNA MARCACIÓN NO SE TOCA DOS VECES EN EL MISMO GOLPE: el único
      // parcial de la base solo admite una corrección viva, así que el segundo
      // insert reventaría a mitad de camino y el día quedaría a medias.
      const huella = marcacionId ? `m:${marcacionId}` : `c:${clave}`;
      if (vistas.has(huella)) {
        return NextResponse.json(
          { error: "Llegó dos veces la misma marcación. Actualiza la pantalla y vuelve a intentar." },
          { status: 400 },
        );
      }
      vistas.add(huella);

      // 🔴 NO SE QUITA UNA MARCACIÓN QUE NO EXISTE. Lo que se «quitaría» sería
      // una agregada a mano, y ésa se deshace (`anulada_en`), que es otra cosa.
      if (tipo === "quitar" && !marcacionId) {
        return NextResponse.json(
          { error: "Solo se puede quitar una marcación que el reloj registró." },
          { status: 400 },
        );
      }

      const hora = tipo === "quitar" ? null : normalizarHora(o?.hora);
      if (tipo !== "quitar" && !hora) {
        return NextResponse.json(
          { error: "Hay una hora que no sirve. Se espera algo como 8:00 o 17:04:30." },
          { status: 400 },
        );
      }

      let codigo = codigoCuerpo;
      let fecha = fechaCuerpo;
      if (marcacionId) {
        // 🔑 LA PERSONA Y EL DÍA SALEN DE LA MARCACIÓN, no de lo que mandó el
        // navegador. Aceptar el `fecha` del cuerpo dejaría mover horas de una
        // quincena a otra sin que nada lo avisara.
        const m = await leerMarcacion(marcacionId);
        if (!m) {
          return NextResponse.json(
            { error: "Una de esas marcaciones ya no está. Actualiza la pantalla y vuelve a intentar." },
            { status: 404 },
          );
        }
        codigo = m.empleadoCodigo;
        fecha = diaPanama(m.ocurrioEn);
      } else {
        if (!codigo) return NextResponse.json({ error: "Falta el colaborador." }, { status: 400 });
        if (!fechaValida(fecha)) return NextResponse.json({ error: "La fecha no sirve." }, { status: 400 });
      }

      listos.push({ clave, tipo, marcacionId, reemplaza, hora, codigo, fecha });
    }

    // ── ESCRIBIR ────────────────────────────────────────────────────────────
    const quien = firma(auth);
    const errores: Array<{ clave: string; error: string }> = [];
    let aplicados = 0;

    for (const c of listos) {
      // 🔴 Primero se ANULA la corrección vieja: el único parcial de la base no
      // admite dos vivas sobre la misma marcación.
      if (c.reemplaza) {
        const a = await anularCorreccion(c.reemplaza, quien);
        if (!a.ok) {
          if (a.faltaMigracion) {
            return NextResponse.json({ error: avisoMigracionCorrecciones() }, { status: 503 });
          }
          errores.push({ clave: c.clave, error: a.error });
          continue;
        }
      }
      const r = await crearCorreccion({
        marcacionId: c.marcacionId,
        empleadoCodigo: c.codigo,
        fecha: c.fecha,
        hora: c.hora,
        motivo,
        creadaPor: quien,
        // ⚠️ Viaja SOLO cuando se quita: sin la migración de `quita`, el alta de
        // una corrección normal tiene que seguir funcionando igual.
        ...(c.tipo === "quitar" ? { quita: true } : {}),
      });
      if (r.ok) { aplicados += 1; continue; }
      if (r.faltaMigracion) {
        return NextResponse.json({ error: avisoMigracionCorrecciones() }, { status: 503 });
      }
      errores.push({ clave: c.clave, error: r.error });
    }

    if (errores.length > 0 && aplicados === 0) {
      return NextResponse.json({ error: errores[0].error, errores }, { status: 400 });
    }
    return NextResponse.json({ ok: true, aplicados, errores });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/correcciones/dia POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
