import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { rolesModuloBoston } from "@/lib/boston/rol";
import { calcularSaldoPrestamo, type MovimientoParaSaldo } from "@/lib/prestamos-saldo";

// ─────────────────────────────────────────────────────────────────────────────
// PRÉSTAMOS — **TODOS**, y ésta es la ÚNICA excepción del módulo.
//
// 🔴 Daniel lo pidió así, con esas palabras: **«Préstamos (TODOS, no solo los de
// Boston)»**. Todo lo demás en `/boston` es de Boston y nada más; acá, a
// propósito, entran las 3 empresas que tienen gente con préstamo (Confecciones
// Boston 20, Vistana International 5, Fashion Wear 5 — medido el 27-ago-2026).
//
// ⚠️ ESTO NO AFLOJA LA REGLA, LA CONFIRMA. La regla es *"no quiero que vea info
// de fashion group"* y esta excepción es del propio Daniel, dicha aparte y en
// mayúsculas justamente porque sabe que es la excepción. Que esté ESCRITA acá
// —y probada por un test que exige ver las 3 empresas— es lo que impide que
// mañana alguien la "arregle" filtrando por Boston y le rompa la pantalla sin
// entender por qué estaba así.
//
// ═══ POR QUÉ UNA RUTA PROPIA Y NO `/api/prestamos/*` ════════════════════════
//
// Porque **David LEE, no escribe**, y por acá eso es una propiedad de la ruta y
// no una condición que haya que acordarse de chequear.
//
// El módulo Préstamos de Contabilidad tiene 6 rutas con 9 verbos entre POST,
// PUT, PATCH y DELETE (dar de alta, mover plata, aplicar la quincena a todos,
// borrar). Sumar `gerente_boston` a su lista de roles le habría abierto los
// nueve de una: para dejarlo en solo-lectura habría que haber gateado verbo por
// verbo en 6 archivos —y 3 de ellos ni siquiera pasan por `requireRole`, hacen
// el chequeo a mano con `getSession`—, más esconder los botones en un
// componente de 755 líneas que usa la contadora todos los días.
//
// 🔑 **Acá el único verbo es GET. No hay nada que gatear porque no hay nada que
// escribir**, y la pantalla de Contabilidad no se tocó ni un carácter.
//
// 🔑 Y la CUENTA no se copió: `calcularSaldoPrestamo` es la misma función que
// usa `PrestamosClient` desde el 27-ago. Dos definiciones de "lo que debe" son
// dos números que un día no coinciden — el mismo error que ya costó la MV de la
// cartera.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

interface EmpleadoFila {
  id: string;
  nombre: string;
  empresa: string | null;
  deduccion_quincenal: number | string | null;
  activo: boolean | null;
  prestamos_movimientos: (MovimientoParaSaldo & { fecha?: string | null })[] | null;
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, rolesModuloBoston());
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await supabaseServer
    .from("prestamos_empleados")
    // Columnas explícitas: `select("*")` traería mañana una columna nueva sin
    // que nadie decida que David la puede ver.
    .select("id, nombre, empresa, deduccion_quincenal, activo, prestamos_movimientos(concepto, monto, estado, deleted, fecha)")
    .eq("activo", true)
    .order("nombre", { ascending: true });

  if (error) {
    console.error(`[boston/prestamos] ${error.message}`);
    return NextResponse.json({ error: "No se pudieron leer los préstamos" }, { status: 500 });
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const empleados = ((data ?? []) as EmpleadoFila[]).map((e) => {
    const c = calcularSaldoPrestamo(e.prestamos_movimientos);
    // La última fecha con movimiento aprobado: es lo que contesta "¿está
    // pagando?" sin tener que abrir la ficha.
    const ultimo = (e.prestamos_movimientos ?? [])
      .filter((m) => m.deleted !== true && m.estado === "aprobado" && m.fecha)
      .map((m) => String(m.fecha))
      .sort()
      .pop() ?? null;
    return {
      id: e.id,
      nombre: e.nombre,
      // `prestamos_empleados.empresa` guarda el NOMBRE de la empresa
      // ("Confecciones Boston"), no la key — al revés que `asistencia_personas`.
      // No se traduce acá: se muestra tal cual lo guardó Contabilidad.
      empresa: e.empresa ?? "Sin empresa",
      deduccionQuincenal: Number(e.deduccion_quincenal ?? 0),
      prestado: round2(c.prestado),
      pagado: round2(c.pagado),
      saldo: round2(c.saldo),
      pct: Math.round(c.pct),
      ultimoMovimiento: ultimo,
    };
  });

  const conSaldo = empleados.filter((e) => e.saldo > 0);
  return NextResponse.json({
    empleados,
    totales: {
      personas: empleados.length,
      conSaldo: conSaldo.length,
      saldo: round2(conSaldo.reduce((s, e) => s + e.saldo, 0)),
    },
  });
}
