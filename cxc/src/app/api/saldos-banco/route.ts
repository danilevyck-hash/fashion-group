import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { ALL_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { hoyPanama } from "@/lib/fecha-panama";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { historialPorEmpresa, ultimoPorEmpresa, type FilaSaldo } from "@/lib/saldos-banco/historial";

export const dynamic = "force-dynamic";

// Saldos de Banco — el último saldo de Banco General de cada empresa, y el
// historial de lo que la contadora cargó.
//
// La MISMA tabla `bancos_saldos` y las MISMAS reglas de siempre: el módulo se
// mudó de casa dos veces (era una sección de "Gastos de Empresa", después ficha
// suelta, y desde el 13-ago-2026 es la 2ª PESTAÑA de "Gastos"), el dato no se
// tocó. `bancos_saldos` tiene UNIQUE(empresa_key, fecha_dato) completo → upsert
// directo (repetir la misma fecha CORRIGE el saldo de ese día, nunca duplica ni
// borra, y no puede pisar el de otra fecha). Saldos negativos se permiten: los
// sobregiros existen.
//
// El GET devuelve DOS cosas derivadas de la MISMA lectura, con las MISMAS
// funciones puras que usa la pantalla (`lib/saldos-banco/historial.ts`):
//   · `bancos`    — el último saldo por empresa (lo que ya devolvía).
//   · `historial` — todas las cargas, por empresa, de la más nueva a la más
//                   vieja, marcando la que repite EXACTO a la anterior.
//
// La "Disponibilidad" de Vista General lee `bancos_saldos` por su cuenta y con
// el mismo criterio (último por empresa) — no pasa por acá, así que nada de lo
// de este archivo puede moverle un centavo.

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(fecha: string): boolean {
  const d = new Date(`${fecha}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha;
}

interface BancoRow {
  id: string;
  empresa_key: string;
  saldo: number | string;
  fecha_dato: string;
  created_by: string | null;
  created_at: string | null;
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "contabilidad"]);
  if (auth instanceof NextResponse) return auth;

  try {
    // Paginado + verificado contra COUNT: `db-max-rows` = 1000 corta en
    // silencio. Hoy son 52 filas, pero la tabla crece ~84/año y un truncado
    // acá se vería como "esta empresa no tiene saldo", no como un error.
    // Orden de PAGINACIÓN por `id` (único y estable); el orden de negocio
    // (fecha_dato DESC) se aplica en memoria, sobre la lista completa.
    const filas = await leerTodoPaginado<BancoRow>("bancos_saldos (saldos-banco)", (pedirCount, desde, hasta) =>
      supabaseServer
        .from("bancos_saldos")
        .select("id, empresa_key, saldo, fecha_dato, created_by, created_at", pedirCount ? { count: "exact" } : {})
        .order("id", { ascending: true })
        .range(desde, hasta),
    );

    // `saldo` llega como string desde PostgREST (es `numeric`): se normaliza UNA
    // vez, acá, para que las funciones puras comparen números y no textos.
    const normalizadas: FilaSaldo[] = filas.map((f) => ({
      empresa_key: f.empresa_key,
      saldo: Number(f.saldo),
      fecha_dato: f.fecha_dato,
      created_by: f.created_by,
      created_at: f.created_at,
    }));

    // Último saldo por empresa. Mismo criterio que la Disponibilidad de Vista
    // General: la fila con `fecha_dato` más reciente de cada empresa.
    const bancos = ultimoPorEmpresa(normalizadas).map((b) => ({
      empresa_key: b.empresa_key,
      saldo: b.saldo,
      fecha_dato: b.fecha_dato,
    }));

    // Historial completo por empresa (de la más nueva a la más vieja), con la
    // marca de "repite exacto al anterior". Hoy son 52 filas: se manda entero
    // en vez de agregar una segunda ruta que vuelva a leer la misma tabla.
    const historial: Record<string, unknown[]> = {};
    for (const [empresa, cargas] of historialPorEmpresa(normalizadas)) {
      historial[empresa] = cargas;
    }

    return NextResponse.json({ bancos, historial });
  } catch (err) {
    console.error("[saldos-banco] GET", err);
    return NextResponse.json(
      { error: "No se pudieron cargar los saldos. Intenta de nuevo en unos segundos." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "contabilidad"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Datos inválidos. Recarga la página e intenta de nuevo." }, { status: 400 });
    }

    const empresaKey = typeof body.empresa_key === "string" ? body.empresa_key : "";
    // Solo las 8 empresas reales (no 'grupo'): 1 cuenta bancaria por empresa.
    if (!(ALL_EMPRESA_KEYS as readonly string[]).includes(empresaKey)) {
      return NextResponse.json({ error: "Empresa inválida." }, { status: 400 });
    }

    const saldo = Number(body.saldo);
    if (!Number.isFinite(saldo)) {
      return NextResponse.json({ error: "El saldo debe ser un número." }, { status: 400 });
    }

    const fechaDato = typeof body.fecha_dato === "string" ? body.fecha_dato : "";
    if (!FECHA_RE.test(fechaDato) || !isValidDate(fechaDato)) {
      return NextResponse.json(
        { error: "Fecha inválida. Usa el formato AAAA-MM-DD (ej: 2026-07-18)." },
        { status: 400 },
      );
    }
    if (fechaDato > hoyPanama()) {
      return NextResponse.json(
        { error: "La fecha no puede ser futura. Usa hoy o una fecha anterior." },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseServer
      .from("bancos_saldos")
      .upsert(
        {
          empresa_key: empresaKey,
          saldo: Math.round(saldo * 100) / 100,
          fecha_dato: fechaDato,
          created_by: auth.userName ?? auth.role,
        },
        { onConflict: "empresa_key,fecha_dato" },
      )
      .select("id, empresa_key, saldo, fecha_dato, created_by, created_at")
      .single();
    if (error) throw new Error(`bancos_saldos (upsert): ${error.message}`);

    return NextResponse.json({ ok: true, saldo: { ...data, saldo: Number(data.saldo) } });
  } catch (err) {
    console.error("[saldos-banco] POST", err);
    return NextResponse.json(
      { error: "No se pudo guardar el saldo. Intenta de nuevo en unos segundos." },
      { status: 500 },
    );
  }
}
