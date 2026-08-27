// POST /api/asistencia/prestamos
//   { quincena, aprobado, personas: [{ codigo, monto }] }
//
// Aprobar (o retirar la aprobación de) el descuento de préstamo de una o varias
// personas en UNA quincena.
//
// ── 🔴 POR QUÉ ACÁ NO HAY GET ────────────────────────────────────────────────
//
// La LISTA de lo que hay para aprobar sale de `/api/asistencia/planilla`, y no
// de una segunda ruta que rearme la misma cuenta. El saldo de cada préstamo, lo
// ya descontado en la quincena y quién está en el cuadro salen todos del mismo
// request: una segunda copia de ese camino sería una segunda verdad, y el día
// que las dos se separen la pantalla que aprueba diría un monto y la que paga,
// otro. Es exactamente el error que ya pasó con `motivosDeQuienNoMarco`.
//
// Acá solo se ESCRIBE.
//
// ── 🔴 QUIÉN ENTRA ───────────────────────────────────────────────────────────
//
// `asistenciaRoles()` y NO `aprobacionesRoles()`. Son dos aprobaciones
// distintas y no comparten puerta: las horas extra las autoriza Julio con el
// usuario `bodega`, que a propósito NO ve un solo sueldo (ver `roles.ts`). El
// descuento de préstamo ES plata del sueldo y lo aprueba quien arma la planilla.

import { NextRequest, NextResponse } from "next/server";
import { asistenciaRoles } from "@/lib/asistencia/roles";
import { requireRole } from "@/lib/requireRole";
import { centavos, quincenaDesdeClave } from "@/lib/asistencia/planilla";
import {
  avisoMigracionPrestamoAprobado,
} from "@/lib/asistencia/prestamos-planilla";
import {
  guardarAprobacionesPrestamo,
  leerAprobacionesPrestamo,
  type PrestamoAAprobar,
} from "@/lib/asistencia/prestamos-planilla-server";
import { guardarManuales, leerManuales } from "@/lib/asistencia/planilla-server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = requireRole(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;

    const q = quincenaDesdeClave(String(body?.quincena ?? ""));
    if (!q) {
      return NextResponse.json({ error: "Quincena inválida. Se espera algo como 2026-08-2." }, { status: 400 });
    }
    const aprobado = body?.aprobado !== false;

    // 🔑 Se deduplica por código: el mismo código dos veces en el mismo cuerpo
    // tiene que producir UNA fila, no reventar el upsert de Postgres — que
    // rechaza la sentencia entera si trae la misma llave dos veces.
    const crudas = Array.isArray(body?.personas) ? (body!.personas as unknown[]) : [];
    const porCodigo = new Map<string, PrestamoAAprobar>();
    for (const c of crudas) {
      const o = c as Record<string, unknown> | null;
      const codigo = String(o?.codigo ?? "").trim();
      if (!codigo) continue;
      const n = Number(o?.monto ?? 0);
      // ⚠️ Negativo o basura → 0. La casilla tiene un CHECK `>= 0` y un
      // préstamo con el signo al revés le SUMARÍA al neto sin que nadie lo note.
      porCodigo.set(codigo, {
        codigo,
        monto: Number.isFinite(n) && n > 0 ? centavos(n) : 0,
      });
    }
    const items = [...porCodigo.values()];
    if (items.length === 0) {
      return NextResponse.json({ error: "No se indicó a quién aprobarle el descuento." }, { status: 400 });
    }

    // ── PASO 1: LA DECISIÓN ──────────────────────────────────────────────────
    //
    // Va PRIMERO a propósito. Si la tabla de aprobaciones todavía no existe, no
    // se toca un centavo de la casilla: la pantalla avisa y no queda un monto
    // escrito que nadie autorizó.
    const antes = await leerAprobacionesPrestamo(q.clave);
    const guardado = await guardarAprobacionesPrestamo({
      quincena: q.clave,
      items,
      aprobado,
      // Queda registro de QUIÉN. Misma regla que las horas extra.
      por: auth.userName || auth.role,
      cuando: new Date().toISOString(),
    });
    if (!guardado) {
      return NextResponse.json({ ok: false, aviso: avisoMigracionPrestamoAprobado() });
    }

    // ── PASO 2: LA CASILLA ───────────────────────────────────────────────────
    //
    // 🔴 ES LA MISMA CASILLA DE SIEMPRE (`asistencia_planilla_manual.prestamo`)
    // y sigue siendo editable a mano. Acá solo se la llena: no se lleva ninguna
    // segunda cuenta del saldo ni un monto paralelo.
    //
    // ⚠️ Se leen los montos manuales ENTEROS y se reescriben con el préstamo
    // cambiado: `guardarManuales` pisa la fila completa, así que mandar solo el
    // préstamo borraría el ISR, los terceros, la mercancía y los otros
    // servicios de esa persona.
    const manuales = await leerManuales(q.clave);
    const noTocadas: string[] = [];
    let escritas = 0;

    for (const it of items) {
      const actual = manuales.porCodigo.get(it.codigo);
      const enCasilla = centavos(actual?.prestamo ?? 0);

      let nuevo: number;
      if (aprobado) {
        nuevo = it.monto;
      } else {
        // 🔴 RETIRAR LA APROBACIÓN NO BORRA UN NÚMERO QUE ESCRIBIÓ UNA PERSONA.
        // Solo se vacía la casilla si todavía dice EXACTAMENTE lo que puso la
        // aprobación anterior. Si alguien la corrigió a mano, esa corrección es
        // una decisión y no se pisa: se devuelve en `noTocadas` y la pantalla
        // lo dice. Rechazar sí, borrar en silencio no.
        const previa = antes.porCodigo.get(it.codigo);
        const puestoPorNosotros = previa != null && centavos(previa.montoVisto) === enCasilla;
        if (!puestoPorNosotros && enCasilla > 0) {
          noTocadas.push(it.codigo);
          continue;
        }
        nuevo = 0;
      }

      if (nuevo === enCasilla) continue; // nada que escribir
      const ok = await guardarManuales(q.clave, it.codigo, {
        isr: actual?.isr ?? 0,
        prestamo: nuevo,
        terceros: actual?.terceros ?? 0,
        mercancia: actual?.mercancia ?? 0,
        otrosServicios: actual?.otrosServicios ?? 0,
      });
      if (ok) escritas += 1;
    }

    return NextResponse.json({
      ok: true,
      aprobado,
      quincena: q.clave,
      personas: items.length,
      casillasEscritas: escritas,
      // Las que se dejaron como estaban porque alguien las había corregido.
      noTocadas,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/prestamos POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
