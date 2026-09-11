// POST /api/asistencia/aprobaciones
//   { decision: 'si' | 'no' | null, dias: [{ codigo, fecha, minutos }] }
//   (o el viejo `aprobado: boolean` — true = 'si', false = pendiente)
//
// Decidir las horas extra de una o varias personas, día por día: Sí (se paga),
// No (no se paga, y deja de ser pendiente) o pendiente (10-sep-2026).
//
// ── 🔴 POR QUÉ ACÁ NO HAY GET ────────────────────────────────────────────────
//
// La LISTA de lo que hay para aprobar sale de `/api/asistencia/planilla`
// (`?aprobaciones=1`), y no de una segunda ruta que rearme la misma cuenta. Los
// minutos de hora extra salen de paginar todas las marcaciones del período,
// aplicar las correcciones, armar el reporte y clasificar día por día: una
// segunda copia de ese camino sería una segunda verdad, y el día que las dos se
// separen la pantalla de aprobar diría una cosa y la que paga, otra. Es
// exactamente el error que ya pasó con `motivosDeQuienNoMarco`.
//
// Acá solo se ESCRIBE.

import { NextRequest, NextResponse } from "next/server";
import { empresaParaPedir } from "@/lib/asistencia/empresa-para-todo";
import { etiquetaEmpresa } from "@/lib/asistencia/config";
import { aprobacionesRoles } from "@/lib/asistencia/roles";
import { requireAsistencia } from "@/lib/asistencia/guard";
import {
  avisoMigracionAprobaciones,
  claveDia,
  decisionDeToque,
  type Decision,
} from "@/lib/asistencia/aprobaciones";
import { guardarAprobaciones, type DiaAAprobar } from "@/lib/asistencia/aprobaciones-server";
import { MODULOS_PLANILLA } from "@/lib/asistencia/guard";
import { puedeAprobarA } from "@/lib/asistencia/aprobador-empresa";
import { leerAlcanceAprobador } from "@/lib/asistencia/aprobador-empresa-server";
import { leerPersonas } from "@/lib/asistencia/config-server";

export const dynamic = "force-dynamic";

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  // 🔴 EL CANDADO DE VERDAD ESTÁ ACÁ, no en que la pestaña se vea o no. Quien
  // no puede aprobar no aprueba ni entrando por la URL. Ver la nota larga de
  // `APROBACIONES_ROLES`: hoy es solo `admin` porque Julio Garay todavía no
  // tiene usuario en el sistema y crearle uno lo decide Daniel.
  // ⚠️ `MODULOS_PLANILLA` = `asistencia` **o** `boston`. David aprueba desde su
  // módulo: exigirle `asistencia` a secas lo dejaría afuera hasta que corra la
  // DDL que le agrega la key, y aprobar es justo lo que se le abrió.
  const auth = requireAsistencia(req, aprobacionesRoles(), MODULOS_PLANILLA);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    // 🔴 LA DECISIÓN (10-sep-2026): 'si' · 'no' · null. Si el cuerpo trae el
    // `aprobado` de antes, vale lo que siempre valió. Cualquier otra cosa se
    // rechaza: acá no se adivina qué quiso decir un navegador viejo.
    const cruda = body?.decision;
    const decision: Decision | undefined =
      cruda === "si" || cruda === "no" || cruda === null
        ? cruda
        : cruda === undefined
          ? decisionDeToque(body?.aprobado !== false)
          : undefined;
    if (decision === undefined) {
      return NextResponse.json({ error: "La decisión tiene que ser Sí, No o pendiente." }, { status: 400 });
    }
    const aprobado = decision === "si";
    const crudas = Array.isArray(body?.dias) ? (body!.dias as unknown[]) : [];

    // 🔑 `minutos` es el TESTIGO, no el pago. Nunca se multiplica por una rata:
    // lo que se paga lo vuelve a calcular el motor con la base vigente el día
    // del cuadro. Por eso aceptarlo de la pantalla es inofensivo — lo único que
    // podría salir mal es que el aviso «cambió desde que se aprobó» aparezca de
    // más, que es del lado seguro. Igual se normaliza: entero y nunca negativo.
    // 🔑 Se deduplica por (código, fecha): dos veces el mismo día en el mismo
    // cuerpo tiene que producir UNA fila, no reventar el upsert de Postgres —
    // que rechaza la sentencia entera si trae la misma llave dos veces.
    const porClave = new Map<string, DiaAAprobar>();
    for (const c of crudas) {
      const o = c as Record<string, unknown> | null;
      const codigo = String(o?.codigo ?? "").trim();
      const fecha = String(o?.fecha ?? "").trim();
      if (!codigo || !ES_FECHA.test(fecha)) continue;
      const n = Number(o?.minutos ?? 0);
      porClave.set(claveDia(codigo, fecha), {
        codigo,
        fecha,
        minutos: Number.isFinite(n) && n > 0 ? Math.round(n) : 0,
      });
    }
    const dias = [...porClave.values()];

    if (dias.length === 0) {
      return NextResponse.json(
        { error: "No se indicó qué día aprobar." },
        { status: 400 },
      );
    }

    // ── 🔴 ¿SON PERSONAS SUYAS? ────────────────────────────────────────────
    //
    // Hasta el 31-ago-2026 acá no se miraba NADA: llegaba `{codigo, fecha}` y se
    // escribía. Medido en producción, Julio —empleado de Vistana, cuenta
    // `Bodega`— había aprobado 57 días de Confecciones Boston.
    //
    // La empresa NO viene en el cuerpo y no podría: la manda el navegador. Sale
    // de la FICHA de cada persona, que es la misma fuente con la que se arma el
    // cuadro que se está aprobando.
    // 🔴 CON `?empresa=` NO SE APRUEBA NADA DE OTRA EMPRESA (10-sep-2026). El
    // selector de arriba filtra lo que se VE; esto es el candado del lado del
    // servidor para que «Aprobar todo» con Boston elegido no pueda tocar a
    // nadie de Vistana aunque el navegador mande de más. Todo o nada.
    const empresaFiltro = empresaParaPedir(req.nextUrl.searchParams.get("empresa"));
    if (empresaFiltro) {
      const fichas = await leerPersonas();
      const empresaDe = new Map(fichas.filas.map((f) => [String(f.empleado_codigo), f.empresa ?? null]));
      const deOtra = dias.filter((d) => empresaDe.get(d.codigo) !== empresaFiltro).map((d) => d.codigo);
      if (deOtra.length > 0) {
        return NextResponse.json(
          { error: `No se aprobó nada: ${deOtra.length === 1 ? "hay un colaborador que no es" : `hay ${deOtra.length} colaboradores que no son`} de ${etiquetaEmpresa(empresaFiltro)}.`, fuera: [...new Set(deOtra)] },
          { status: 400 },
        );
      }
    }

    const alcance = await leerAlcanceAprobador(auth.role, auth.userName);
    if (alcance.empresas !== null) {
      const fichas = await leerPersonas();
      const empresaDe = new Map(fichas.filas.map((f) => [String(f.empleado_codigo), f.empresa ?? null]));
      const veredicto = puedeAprobarA(
        alcance,
        dias.map((d) => ({ codigo: d.codigo, empresa: empresaDe.get(d.codigo) ?? null })),
      );
      if (!veredicto.ok) {
        // 🔴 TODO O NADA, y con 403: se rechaza el pedido ENTERO sin escribir una
        // fila. Aprobar «lo que sí puedo» dejaría a quien apretó el botón
        // creyendo que aprobó las 12 filas que veía.
        return NextResponse.json(
          { error: veredicto.motivo, fuera: veredicto.fuera },
          { status: 403 },
        );
      }
    }

    const guardado = await guardarAprobaciones({
      dias,
      decision,
      // Queda registro de QUIÉN. Lo pidió Daniel explícitamente.
      por: auth.userName || auth.role,
      cuando: new Date().toISOString(),
    });

    return NextResponse.json(
      guardado
        ? {
          ok: true,
          aprobado,
          decision,
          dias: dias.length,
          claves: [...porClave.keys()],
        }
        : { ok: false, aviso: avisoMigracionAprobaciones() },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/aprobaciones POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
