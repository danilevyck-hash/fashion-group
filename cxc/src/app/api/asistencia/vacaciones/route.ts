// Las VACACIONES, por rango de fechas.
//
// 🔴 NO SON JUSTIFICACIONES, y por eso viven en su propia tabla y en su propia
// ruta. Ver `lib/asistencia/vacaciones.ts`: una justificación explica por qué
// alguien FALTÓ; unas vacaciones son un derecho que se gana y se gasta, y en
// esos días no se calcula nada del reloj.
//
// Una vacación es: persona + desde + hasta + un interruptor. Nada más — no hay
// nota, no hay motivo, no hay horas.

import { NextRequest, NextResponse } from "next/server";
import { asistenciaRoles } from "@/lib/asistencia/roles";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { TABLA_VACACIONES, esTablaFaltante } from "@/lib/asistencia/config";
import {
  avisoMigracionVacaciones,
  leerPersonasDelModulo,
  vigenciaDeFila,
  type FilaPersonaDb,
} from "@/lib/asistencia/config-server";
import { esYaPagada, type Vacacion } from "@/lib/asistencia/vacaciones";
import { tieneBaja } from "@/lib/asistencia/vigencia";
import {
  avisoSinFechaIngreso,
  DESDE_CUANDO_CUENTA,
  saldoDe,
  type SaldoVacaciones,
} from "@/lib/asistencia/saldo-vacaciones";
import { hoyPanama } from "@/lib/fecha-panama";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COLS = "id, empleado_codigo, desde, hasta, ya_pagadas, registrado_por, created_at";
/** Tope de filas de la lista. El `count` de al lado dice si se quedó corta. */
const TOPE_FILAS = 500;
const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 🔴 SIN LA TABLA NO SE ROMPE NADA: la pantalla carga vacía y DICE qué archivo
 * hay que correr. En este proyecto los DDL los corre Daniel a mano y varios se
 * quedaron pendientes semanas; un 500 se leería como «Asistencia está rota».
 *
 * ⚠️ Solo se degrada cuando el error NOMBRA la tabla. Tragarse cualquier error
 * convertiría un permiso, un timeout o un RLS en «no hay vacaciones», y eso se
 * paga: esos días volverían a contarse como ausencia sin que nadie se entere.
 */
function faltaLaTabla(error: unknown): boolean {
  return esTablaFaltante(error, TABLA_VACACIONES);
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;

  // 🩸 La lista de personas sale del DIRECTORIO, no del reloj: el reloj manda
  // `empleado_nombre` vacío en las 3.287 marcaciones cargadas, y el desplegable
  // terminaría diciendo «15, 16, 17, 21…». Es la MISMA fuente que usa
  // Justificaciones — dos listas distintas para elegir a la misma persona es
  // como se termina cargando una vacación al código equivocado.
  const [res, { personas, faltaMigracion, filas }] = await Promise.all([
    supabaseServer
      .from(TABLA_VACACIONES)
      // 🔴 EL `count` NO ES DECORACIÓN: de estas filas sale el SALDO, y un corte
      // silencioso a las 500 restaría de menos sin que nadie se entere. Con el
      // total se puede comparar contra lo que llegó y DECIRLO. (PostgREST
      // cortando en silencio ya costó bugs caros en este repo.)
      .select(COLS, { count: "exact" })
      .eq("deleted", false)
      .order("desde", { ascending: false })
      .limit(TOPE_FILAS),
    leerPersonasDelModulo(),
  ]);

  if (res.error) {
    if (faltaLaTabla(res.error)) {
      return NextResponse.json({
        vacaciones: [],
        personas,
        faltaMigracion,
        puedeCargar: false,
        avisoMigracion: avisoMigracionVacaciones(),
        // Sin la tabla no hay vacaciones que restar, así que un saldo sería
        // «todo lo ganado y nada gastado»: un número inventado. No se manda
        // ninguno — el aviso ámbar de arriba ya dice qué falta.
        saldos: [],
        avisoSaldo: null,
        avisoSaldoIncompleto: null,
        desdeCuandoCuenta: DESDE_CUANDO_CUENTA,
      });
    }
    return NextResponse.json({ error: res.error.message }, { status: 500 });
  }

  const vacaciones = res.data ?? [];
  const { saldos, avisoSaldo } = armarSaldos(vacaciones, personas, filas);

  return NextResponse.json({
    vacaciones,
    personas,
    faltaMigracion,
    puedeCargar: true,
    avisoMigracion: null,
    saldos,
    avisoSaldo,
    // 🔴 Se DICE, no se esconde: si llegaron menos vacaciones de las que hay, el
    // saldo está restando de menos y quien lo mire tiene que saberlo.
    avisoSaldoIncompleto:
      typeof res.count === "number" && res.count > vacaciones.length
        ? `Se están mostrando ${vacaciones.length} de ${res.count} vacaciones: el saldo puede estar restando de menos.`
        : null,
    desdeCuandoCuenta: DESDE_CUANDO_CUENTA,
  });
}

/**
 * El saldo de cada persona ACTIVA, en el orden que ya trae el directorio
 * (nombre alfabético; los códigos sin ficha al final).
 *
 * ── 🔴 QUIEN NO TIENE FECHA DE INGRESO IGUAL APARECE ────────────────────────
 *
 * Con `saldo: null` y `faltaFechaIngreso: true`, que la pantalla pinta como
 * «Falta la fecha de ingreso». Filtrarlo de la lista sería descartarlo en
 * silencio: son 20 de las 36 personas activas (medido por la puerta de la app
 * el 25-ago-2026) y es justamente el trabajo que contabilidad tiene por delante.
 *
 * ── ⚠️ QUIEN YA NO TRABAJA ACÁ NO ENTRA ─────────────────────────────────────
 *
 * Misma regla que el resumen de Configuración: el saldo es para decidir quién
 * puede irse de vacaciones, y quien ya se fue de la empresa no. Su liquidación
 * es otra cuenta —y otra pantalla— que hoy no existe.
 */
function armarSaldos(
  vacacionesDb: readonly Record<string, unknown>[],
  personas: readonly { codigo: string; etiqueta: string }[],
  filas: readonly FilaPersonaDb[],
): { saldos: SaldoVacaciones[]; avisoSaldo: string | null } {
  const fichas = new Map(filas.map((f) => [String(f.empleado_codigo), f]));
  const hoy = hoyPanama();

  // Al tipo que entiende el módulo puro. `=== true` y no truthy: el default de
  // la columna es `false` y un valor raro tiene que caer del lado del default.
  const vacaciones: Vacacion[] = vacacionesDb.map((f) => ({
    empleado_codigo: String(f.empleado_codigo ?? ""),
    desde: String(f.desde ?? ""),
    hasta: String(f.hasta ?? ""),
    ya_pagadas: f.ya_pagadas === true,
  }));

  const saldos = personas
    // Sin ficha NO hay baja posible: es un código que marca y nadie configuró
    // todavía, o sea que sigue activo. Es el mismo criterio de Configuración.
    .filter((p) => {
      const f = fichas.get(p.codigo);
      return !f || !tieneBaja(vigenciaDeFila(f));
    })
    .map((p) =>
      saldoDe(
        p.codigo,
        p.etiqueta,
        fichas.get(p.codigo)?.fecha_ingreso ?? null,
        vacaciones,
        hoy,
      ),
    );

  return {
    saldos,
    avisoSaldo: avisoSinFechaIngreso(saldos.filter((s) => s.faltaFechaIngreso).length),
  };
}

/** Lo que las tres escrituras validan igual. `null` = está bien. */
function revisarFechas(desde: string, hasta: string): string | null {
  if (!ES_FECHA.test(desde) || !ES_FECHA.test(hasta)) return "Fechas inválidas";
  // Un rango al revés no cubriría ningún día: serían unas vacaciones que no
  // vacacionan nada, y en silencio.
  if (hasta < desde) return "La fecha final es anterior a la inicial";
  return null;
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;

  let b: { codigo?: string; desde?: string; hasta?: string; yaPagadas?: unknown };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const codigo = (b.codigo ?? "").trim();
  const desde = (b.desde ?? "").trim();
  const hasta = (b.hasta ?? desde).trim();
  if (!codigo) return NextResponse.json({ error: "Falta la persona" }, { status: 400 });
  const mal = revisarFechas(desde, hasta);
  if (mal) return NextResponse.json({ error: mal }, { status: 400 });

  const { error } = await supabaseServer.from(TABLA_VACACIONES).insert({
    empleado_codigo: codigo,
    desde,
    hasta,
    // 🔑 El servidor no se cree el texto del navegador: `esYaPagada` acepta el
    // booleano y el string "true", y CUALQUIER otra cosa cae en `false`. El
    // modo de fallo aceptable es que la vacación se pague —que es el default y
    // el caso normal—, nunca que se descuente una quincena por un valor raro.
    ya_pagadas: esYaPagada(b.yaPagadas),
    // La firma sale de la SESIÓN, nunca del cuerpo. Sin esto, «cualquiera de
    // Asistencia puede cargarlas» se vuelve «nadie sabe quién la cargó».
    registrado_por: auth.userName ?? auth.role,
  });

  if (error) {
    if (faltaLaTabla(error)) {
      return NextResponse.json(
        { error: avisoMigracionVacaciones(), faltaMigracion: true },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * Editar una vacación: las fechas y/o el interruptor.
 *
 * 🔑 Solo se escriben los campos que VINIERON. Mandar el objeto entero le
 * pondría `desde` a un pedido que solo quería mover el interruptor, y con una
 * fecha ausente eso sería borrar el rango. Es la misma regla que ya aplica la
 * corrección de un renglón de guía.
 */
export async function PATCH(req: NextRequest) {
  const auth = requireRole(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;

  let b: { id?: string; desde?: string; hasta?: string; yaPagadas?: unknown };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const id = (b.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });

  const cambios: Record<string, unknown> = {};
  if (b.desde !== undefined || b.hasta !== undefined) {
    // 🔴 LAS DOS FECHAS VIAJAN JUNTAS al mover el rango. Con una sola no se
    // puede comprobar que `hasta >= desde` sin releer la fila, y guardar media
    // corrección dejaría un rango al revés que el CHECK rechaza con un error
    // de base en la cara de quien lo estaba editando.
    const desde = (b.desde ?? "").trim();
    const hasta = (b.hasta ?? "").trim();
    const mal = revisarFechas(desde, hasta);
    if (mal) return NextResponse.json({ error: mal }, { status: 400 });
    cambios.desde = desde;
    cambios.hasta = hasta;
  }
  if (b.yaPagadas !== undefined) cambios.ya_pagadas = esYaPagada(b.yaPagadas);

  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: "No hay nada que cambiar" }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from(TABLA_VACACIONES)
    .update(cambios)
    .eq("id", id)
    // 🔑 No se «edita» una vacación retirada: el soft delete es el rastro de
    // que existió, y volver a escribirle encima lo borraría.
    .eq("deleted", false);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/**
 * Quitar una vacación. **Soft delete**, como el resto del módulo: una vacación
 * ya avisada al personal no se borra, se retira.
 */
export async function DELETE(req: NextRequest) {
  const auth = requireRole(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;

  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });

  const { error } = await supabaseServer
    .from(TABLA_VACACIONES)
    .update({ deleted: true })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
