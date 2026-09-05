import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { logActivity } from "@/lib/log-activity";
import { PRESTAMOS_ADMIN_ROLES, PRESTAMOS_ROLES } from "@/lib/prestamos-roles";
import {
  CONCEPTOS_OFRECIDOS,
  CONCEPTO_DANO,
  CONCEPTO_PAGO,
  CONCEPTO_PRESTAMO,
  ORIGEN_POR_DEFECTO,
  cuentaDeCargo,
  esCargo,
  esOrigenPago,
} from "@/lib/prestamos-conceptos";
import {
  CUENTA_DANO,
  CUENTA_PRESTAMO,
  ESTADO_PENDIENTE,
  calcularSaldoPrestamo,
  cuentaDeMovimiento,
  cuentaMasVieja,
  type CuentaPrestamo,
  type MovimientoParaSaldo,
} from "@/lib/prestamos-saldo";
import { evaluarTopePrestamo, textoAvisoTope, textoTelegramTope } from "@/lib/prestamos-tope";
import { hoyPanamaYmd, quincenaDeFecha, QUINCENA_TOLERANCIA_DIAS } from "@/lib/prestamos-quincena";
import { enviarNegocioPrivado } from "@/lib/alertas/canal";

export const dynamic = "force-dynamic";

interface MovDb extends MovimientoParaSaldo {
  id: string;
  fecha: string;
  origen_pago: string | null;
}

const COLS_MOV = "id, fecha, concepto, monto, estado, deleted, cuenta, origen_pago";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, [...PRESTAMOS_ROLES]);
  if (auth instanceof NextResponse) return auth;
  const empleadoId = req.nextUrl.searchParams.get("empleado_id");

  let query = supabaseServer
    .from("prestamos_movimientos")
    .select("*")
    .or("deleted.is.null,deleted.eq.false")
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  if (empleadoId) query = query.eq("empleado_id", empleadoId);

  const { data, error } = await query;
  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data);
}

function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + dias));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`;
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, [...PRESTAMOS_ROLES]);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => ({}));
  const { empleado_id, fecha, concepto, monto } = body;
  // 🔴 LA NOTA ES OPCIONAL desde el 5-sep-2026. Medido: las 432 filas vivas la
  // tienen y **8 de cada 10 son un eco del concepto** («PRESTAMO», «DEDUCCION
  // QUINCENAL»). Obligar a escribirla producía ruido, no información.
  const notas = typeof body?.notas === "string" && body.notas.trim() ? body.notas.trim() : null;

  if (!empleado_id || !fecha || !concepto || !monto) {
    return NextResponse.json({ error: "Falta la persona, la fecha, el concepto o el monto." }, { status: 400 });
  }
  if (Number(monto) <= 0) {
    return NextResponse.json({ error: "El monto debe ser positivo" }, { status: 400 });
  }
  if (typeof concepto !== "string" || !(CONCEPTOS_OFRECIDOS as readonly string[]).includes(concepto)) {
    return NextResponse.json({ error: "Concepto inválido" }, { status: 400 });
  }
  // Panamá es UTC-5 todo el año (sin DST). La fecha no puede ser futura.
  const hoyPanama = hoyPanamaYmd();
  if (typeof fecha !== "string" || fecha > hoyPanama) {
    return NextResponse.json({ error: "La fecha no puede ser futura. Usa hoy o una fecha anterior." }, { status: 400 });
  }

  // De dónde salió la plata. Solo tiene sentido en un Pago.
  let origenPago: string | null = null;
  if (concepto === CONCEPTO_PAGO) {
    const o = body?.origen_pago ?? ORIGEN_POR_DEFECTO;
    if (!esOrigenPago(o)) {
      return NextResponse.json({ error: "Elige de dónde salió el pago." }, { status: 400 });
    }
    origenPago = o;
  }

  // Las dos cuentas de esta persona, con la cuenta oficial del módulo.
  const { data: movsDb, error: eMovs } = await supabaseServer
    .from("prestamos_movimientos")
    .select(COLS_MOV)
    .eq("empleado_id", empleado_id)
    .or("deleted.is.null,deleted.eq.false");
  if (eMovs) {
    console.error("[prestamos/movimientos]", eMovs.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
  const movs = (movsDb ?? []) as MovDb[];
  const saldo = calcularSaldoPrestamo(movs);

  // ── A QUÉ CUENTA VA ────────────────────────────────────────────────────────
  // Un CARGO la trae puesta por su concepto. Un PAGO baja UNA de las dos: si la
  // persona debe las dos, quien registra elige (viene puesta en la MÁS VIEJA);
  // si debe una sola, no hay nada que preguntar.
  let cuenta: CuentaPrestamo;
  if (esCargo(concepto)) {
    cuenta = cuentaDeCargo(concepto);
  } else {
    const pedida = String(body?.cuenta ?? "").trim();
    if (pedida === CUENTA_DANO || pedida === CUENTA_PRESTAMO) {
      cuenta = pedida;
    } else {
      cuenta = cuentaMasVieja(saldo) ?? CUENTA_PRESTAMO;
    }
  }

  // ── UN PAGO NO PUEDE EXCEDER LO QUE ESA CUENTA DEBE ────────────────────────
  if (concepto === CONCEPTO_PAGO) {
    const disponible = saldo.cuentas[cuenta].saldo;
    if (Number(monto) > disponible) {
      const nombreCuenta = cuenta === CUENTA_DANO ? "daño de mercancía" : "préstamo";
      return NextResponse.json(
        { error: `El pago excede lo que debe de ${nombreCuenta}: $${disponible.toFixed(2)}` },
        { status: 400 },
      );
    }
  }

  // ── EL FRENO DE DUPLICADOS: CONCEPTO + FECHA, NUNCA UN TEXTO ───────────────
  //
  // 🩸 Hasta hoy este candado se apoyaba en que la NOTA empezara con «Deducción
  // quincenal». Medido: 18 filas vivas están escritas de otra forma
  // (`DEDUCCION QUINCENAL `, `DEDUCCION DE QUINCENA`, `DESCUENTO QUINCENAL `…) y
  // con ninguna funcionaba — `ilike` no ignora los acentos. Un candado apagado
  // que nadie sabía apagado.
  //
  // Ahora mira el concepto, el ORIGEN y la fecha: un segundo pago de QUINCENA de
  // la misma cuenta dentro de la misma quincena se rechaza. Los pagos de otro
  // origen (décimo, vacaciones, liquidación, efectivo) NO se frenan: son plata
  // distinta y a propósito.
  if (concepto === CONCEPTO_PAGO && origenPago === ORIGEN_POR_DEFECTO) {
    const q = quincenaDeFecha(fecha);
    const tolStart = q.start;
    const tolEnd = sumarDias(q.end, QUINCENA_TOLERANCIA_DIAS);
    const yaHay = movs.some((m) => {
      if (m.estado !== "aprobado") return false;
      if (m.concepto !== CONCEPTO_PAGO) return false;
      // NULL se lee como Quincena: las 443 filas viejas no traen origen y son,
      // justamente, las que el freno de texto dejaba pasar.
      const origen = String(m.origen_pago ?? "").trim() || ORIGEN_POR_DEFECTO;
      if (origen !== ORIGEN_POR_DEFECTO) return false;
      // Misma derivación que la cuenta oficial: la columna manda; sin ella, el
      // concepto decide. Un `Pago` viejo sin columna es de préstamo.
      const cuentaM = cuentaDeMovimiento(m);
      if (cuentaM !== cuenta) return false;
      const f = String(m.fecha).slice(0, 10);
      return f >= tolStart && f <= tolEnd;
    });
    if (yaHay) {
      return NextResponse.json(
        { error: "Esta persona ya tiene el descuento de esta quincena registrado." },
        { status: 409 },
      );
    }
  }

  // ── EL TOPE: UN SUELDO MENSUAL ─────────────────────────────────────────────
  //
  // 🔴 Solo frena el PRÉSTAMO. El daño de mercancía se registra SIEMPRE: no es
  // plata que se entrega, es plata que ya se perdió, y no anotarla no la
  // devuelve. Y el tope mira la deuda TOTAL (préstamo + daño), no solo la de
  // préstamos.
  let estado = "aprobado";
  let avisoTope: string | null = null;
  if (concepto === CONCEPTO_PRESTAMO) {
    const { data: ficha } = await supabaseServer
      .from("prestamos_empleados")
      .select("nombre, empresa, empleado_codigo")
      .eq("id", empleado_id)
      .maybeSingle();
    let salarioMensual: number | null = null;
    const cod = String(ficha?.empleado_codigo ?? "").trim();
    if (cod) {
      const { data: persona } = await supabaseServer
        .from("asistencia_personas")
        .select("salario_mensual")
        .eq("empleado_codigo", cod)
        .maybeSingle();
      const s = persona?.salario_mensual;
      salarioMensual = s === null || s === undefined ? null : Number(s);
    }
    const evaluacion = evaluarTopePrestamo({
      deudaActual: saldo.saldo,
      monto: Number(monto),
      salarioMensual,
    });
    if (!evaluacion.pasa) {
      estado = ESTADO_PENDIENTE;
      avisoTope = textoAvisoTope(evaluacion);
      // 🔴 Al chat PRIVADO de Daniel (destino de sistema, trato de negocio, SIN
      // el prefijo 🔧 SISTEMA): un préstamo esperando no es una avería.
      await enviarNegocioPrivado(
        textoTelegramTope({
          nombre: String(ficha?.nombre ?? "Sin nombre"),
          empresa: ficha?.empresa ?? null,
          evaluacion,
        }),
      );
    }
  }

  const { data, error } = await supabaseServer
    .from("prestamos_movimientos")
    .insert({
      empleado_id,
      fecha,
      concepto,
      monto: Number(monto),
      notas,
      estado,
      cuenta,
      origen_pago: origenPago,
    })
    .select()
    .single();

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  await logActivity(
    auth.role,
    estado === ESTADO_PENDIENTE ? "prestamo_mov_pendiente" : "prestamo_mov_create",
    "prestamos",
    { movimientoId: data.id, empleadoId: empleado_id, concepto, monto: Number(monto), cuenta },
    auth.userName,
  );
  return NextResponse.json({ ...data, pendiente: estado === ESTADO_PENDIENTE, avisoTope });
}

/**
 * «Eliminar Todo el Historial».
 *
 * 🩸 Hacía un `.delete()` REAL de Postgres —el único hard delete del repo, en la
 * tabla de plata, y sin una línea en `activity_logs`—. Si alguien lo tocaba, el
 * saldo pasaba a $0 y no quedaba forma de saber quién ni cuándo. Desde el
 * 5-sep-2026 es un soft delete con registro, como todo lo demás del módulo.
 */
export async function DELETE(req: NextRequest) {
  const auth = requireRole(req, [...PRESTAMOS_ADMIN_ROLES]);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => ({}));
  const empleado_id = body?.empleado_id;

  if (!empleado_id) {
    return NextResponse.json({ error: "empleado_id requerido" }, { status: 400 });
  }

  const { data: vivos } = await supabaseServer
    .from("prestamos_movimientos")
    .select("id")
    .eq("empleado_id", empleado_id)
    .or("deleted.is.null,deleted.eq.false");

  const { error } = await supabaseServer
    .from("prestamos_movimientos")
    .update({ deleted: true })
    .eq("empleado_id", empleado_id)
    .or("deleted.is.null,deleted.eq.false");

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  await logActivity(
    auth.role,
    "prestamo_historial_delete",
    "prestamos",
    { empleadoId: empleado_id, movimientos: (vivos ?? []).length },
    auth.userName,
  );
  return NextResponse.json({ ok: true, movimientos: (vivos ?? []).length });
}
