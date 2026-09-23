/* ─────────────────────────────────────────────────────────────────────────────
 * LOS MOVIMIENTOS DE PRÉSTAMOS DE UNA QUINCENA — solo LECTURA.
 *
 * Daniel, textual (17-sep-2026): *«para ver los movimientos de x quincena?»*.
 *
 * 🔴 ESTA RUTA NO ESCRIBE NADA. No tiene POST, ni PUT, ni PATCH, ni DELETE.
 * Lee `prestamos_movimientos` de la ventana, les pone nombre y empresa, y dice
 * de dónde salió cada uno. La regla vive en `lib/asistencia/movimientos-quincena.ts`,
 * que es PURO; acá solo se junta el dato.
 *
 * 🔴 LOS MISMOS ROLES QUE LA PESTAÑA (`PRESTAMOS_PESTANA_ROLES`): admin ·
 * contabilidad · secretaria. No se inventa una lista nueva — la secretaria ya
 * entra a Préstamos «solo a VER», y esto es exactamente ver.
 *
 * 🔑 LAS DOS TRAMPAS DEL REPO, LAS DOS PUESTAS:
 *   · `deleted` es NULLABLE en préstamos → `.or("deleted.is.null,deleted.eq.false")`.
 *     Un `.eq("deleted", false)` PIERDE filas, y acá perderlas es plata que no
 *     aparece en la pantalla que se hizo justamente para verla toda.
 *   · `db-max-rows` = 1000 y corta EN SILENCIO → `leerTodoPaginado` con
 *     `count: "exact"` y orden estable por `id`.
 * ────────────────────────────────────────────────────────────────────────── */

import { NextResponse, type NextRequest } from "next/server";
import { requireAsistencia } from "@/lib/asistencia/guard";
import { alcanceDelRol, empresaEnAlcance } from "@/lib/asistencia/alcance-boston-server";
import { PRESTAMOS_PESTANA_ROLES } from "@/lib/prestamos-una-puerta";
import { leerPersonas } from "@/lib/asistencia/config-server";
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { TABLA_AMARRE } from "@/lib/asistencia/cierre-prestamo-server";
import {
  filaDeMovimiento,
  type DatosDeLaFicha,
  type MovimientoCrudo,
} from "@/lib/asistencia/movimientos-quincena";

export const dynamic = "force-dynamic";

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

interface FilaFicha {
  id: string;
  nombre: string | null;
  empleado_codigo: string | null;
}

interface FilaAmarre { movimiento_id: string | null }

export async function GET(req: NextRequest) {
  const auth = requireAsistencia(req, [...PRESTAMOS_PESTANA_ROLES]);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const desde = String(url.searchParams.get("desde") ?? "").trim();
  const hasta = String(url.searchParams.get("hasta") ?? "").trim();
  if (!ES_FECHA.test(desde) || !ES_FECHA.test(hasta) || desde > hasta) {
    return NextResponse.json({ error: "Elige la quincena que quieres mirar." }, { status: 400 });
  }

  try {
    const movimientos = await leerTodoPaginado<MovimientoCrudo>(
      "prestamos_movimientos (movimientos de la quincena)",
      (pedirCount, from, to) =>
        supabaseServer
          .from("prestamos_movimientos")
          .select("id, empleado_id, fecha, concepto, monto, origen_pago",
            pedirCount ? { count: "exact" } : {})
          // Lo que espera aprobación no es plata todavía; igual que en el saldo.
          .eq("estado", "aprobado")
          // 🔑 `deleted` es NULLABLE: un `.eq("deleted", false)` pierde filas.
          .or("deleted.is.null,deleted.eq.false")
          .gte("fecha", desde)
          .lte("fecha", hasta)
          .order("id", { ascending: true })
          .range(from, to),
    );

    // 🔑 LAS FICHAS SE LEEN TODAS, SIN FILTRAR POR `deleted`. Esto es un mapa de
    // NOMBRES, no una lista de quién existe: una ficha borrada arrastra sus
    // movimientos al borrado (y por eso ninguno llega acá), pero si alguno
    // llegara tiene que salir CON su nombre y no en blanco.
    const fichasDb = await leerTodoPaginado<FilaFicha>(
      "prestamos_empleados (nombres)",
      (pedirCount, from, to) =>
        supabaseServer
          .from("prestamos_empleados")
          .select("id, nombre, empleado_codigo", pedirCount ? { count: "exact" } : {})
          .order("id", { ascending: true })
          .range(from, to),
    );

    // 🔴 EL AMARRE: qué movimiento reclama como suyo una planilla cerrada. Los
    // revertidos NO cuentan — esa planilla se reabrió y su pago se deshizo.
    const amarreDb = await leerTodoPaginado<FilaAmarre>(
      `${TABLA_AMARRE} (origen del movimiento)`,
      (pedirCount, from, to) =>
        supabaseServer
          .from(TABLA_AMARRE)
          .select("id, movimiento_id", pedirCount ? { count: "exact" } : {})
          .is("revertido_en", null)
          .order("id", { ascending: true })
          .range(from, to),
    );
    const amarrados = new Set(
      amarreDb.map((a) => String(a.movimiento_id ?? "")).filter(Boolean),
    );

    // La empresa de la persona atada, para el filtro de arriba de las pestañas.
    const personas = await leerPersonas();
    const empresaDe = new Map(
      personas.filas.map((p) => [String(p.empleado_codigo), p.empresa ?? null]),
    );

    const fichas = new Map<string, DatosDeLaFicha>(
      fichasDb.map((f) => {
        const codigo = String(f.empleado_codigo ?? "").trim() || null;
        return [String(f.id), {
          nombre: String(f.nombre ?? "").trim(),
          codigo,
          empresa: codigo ? empresaDe.get(codigo) ?? null : null,
        }];
      }),
    );

    // 🔴 EL ALCANCE DE DAVID (23-sep-2026): solo los movimientos de gente de
    // SU empresa (por la ficha de Asistencia). Sin recorte, todos.
    const alcance = alcanceDelRol(auth.role);
    const filas = movimientos
      .map((m) => filaDeMovimiento(m, fichas, amarrados))
      .filter((f) => empresaEnAlcance(alcance, f.empresa));
    return NextResponse.json({ desde, hasta, filas });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/prestamos-movimientos GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
