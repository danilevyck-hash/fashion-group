/* ─────────────────────────────────────────────────────────────────────────────
 * LA DEUDA, VISTA DESDE LA PLANILLA — y los abonos extraordinarios.
 *
 * Daniel, textual: *«asistencia se ingresa la info y prestamos seria para como
 * ver la info y hacer pagos extraordinarios como abonos etc»*.
 *
 * O sea, dos cosas y nada más: VER lo que cada quien debe, y anotar un pago que
 * NO salió de la quincena. Lo que sale de la quincena ya no se teclea: lo
 * escribe el cierre (`cierre-prestamo-server.ts`).
 *
 * ⚠️ EL MÓDULO DE PRÉSTAMOS NO DESAPARECE, y está medido: de 337 pagos, **53
 * (el 42 % de la plata, $8.834,22) NO salieron de la quincena** — salieron de
 * abonos, décimo, vacaciones o liquidación. Esta pestaña es justamente para
 * esos.
 *
 * ── 🔴 LAS DOS PUERTAS SON DISTINTAS ────────────────────────────────────────
 *
 * GET  → `asistenciaRoles()`  = admin · secretaria · contabilidad.
 * POST → `cerrarPlanillaRoles()` = admin · contabilidad.
 *
 * Daniel: *«La secretaria entra a Préstamos solo a VER»*. Es la MISMA lista que
 * decide quién cierra la quincena, derivada y no escrita a mano: las dos
 * preguntas son la misma —¿quién mueve la plata?— y tenerlas en dos listas es
 * cómo se separan.
 * ────────────────────────────────────────────────────────────────────────── */

import { NextResponse, type NextRequest } from "next/server";
import { requireAsistencia } from "@/lib/asistencia/guard";
import { asistenciaRoles } from "@/lib/asistencia/roles";
import { cerrarPlanillaRoles } from "@/lib/asistencia/planilla-guardada";
import { leerPrestamosDeQuincena } from "@/lib/asistencia/prestamos-planilla-server";
import { supabaseServer } from "@/lib/supabase-server";
import { validarAbono, CONCEPTO_DE_ABONO } from "@/lib/asistencia/abono-extra";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireAsistencia(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  // La ventana solo sirve para decir «esta quincena ya se le descontó X». El
  // SALDO es histórico y no se recorta por fecha: recortarlo daría un saldo
  // falso y una cuota falsa.
  const desde = url.searchParams.get("desde") ?? "";
  const hasta = url.searchParams.get("hasta") ?? "";

  try {
    const { fichas } = await leerPrestamosDeQuincena(desde, hasta);
    // 🔴 SE MUESTRA A QUIEN DEBE, y también a quien tiene saldo a FAVOR
    // (negativo): esconder un saldo a favor es esconder plata que es de la
    // persona. Quien llegó a cero sale solo de la lista.
    const conDeuda = fichas.filter((f) => Math.abs(f.saldo) > 0.004);
    return NextResponse.json({
      fichas: conDeuda.map((f) => ({
        id: f.id,
        codigo: f.codigo,
        nombre: f.nombre,
        saldo: f.saldo,
        saldoPrestamo: f.saldoPrestamo,
        saldoDano: f.saldoDano,
        cuota: f.cuota,
        cuotaDano: f.cuotaDano,
        yaDescontado: f.yaDescontado,
      })),
      // Quien puede anotar un abono. La pantalla lo usa para no dibujar un
      // botón que va a contestar 403.
      puedeAnotar: cerrarPlanillaRoles().includes(String(auth.role ?? "")),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/prestamos-deuda GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * UN ABONO EXTRAORDINARIO: un pago que NO salió de la quincena.
 *
 * 🔴 `origen_pago` NUNCA es «Quincena» acá. Ese origen lo escribe el cierre, y
 * solo el cierre: si un abono se anotara como Quincena, la casilla de la
 * planilla lo leería como «ya descontado» (el caso 1 de `montoDeFicha`) y esa
 * quincena no le descontaría nada a la persona. El mismo pago contado dos veces,
 * al revés.
 */
export async function POST(req: NextRequest) {
  const auth = requireAsistencia(req, cerrarPlanillaRoles());
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const v = validarAbono(body);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

    const { error } = await supabaseServer.from("prestamos_movimientos").insert({
      empleado_id: v.valor.fichaId,
      fecha: v.valor.fecha,
      concepto: CONCEPTO_DE_ABONO[v.valor.cuenta],
      cuenta: v.valor.cuenta,
      monto: v.valor.monto,
      // El que anota es quien mueve la plata: no espera aprobación de nadie.
      estado: "aprobado",
      origen_pago: v.valor.origen,
      notas: v.valor.notas,
    });
    if (error) {
      console.error("[asistencia/prestamos-deuda POST]", error.message);
      return NextResponse.json({ error: "No se pudo anotar el abono. Intenta de nuevo." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/prestamos-deuda POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
