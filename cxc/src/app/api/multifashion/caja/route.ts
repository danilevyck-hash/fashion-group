// ─────────────────────────────────────────────────────────────────────────────
// GET /api/multifashion/caja?fecha=YYYY-MM-DD — Cierre diario de caja de ACS
// según Switch (/apireporte/diarioventas, instancia MULTI, sucursal 1).
//
// Caché en multifashion_caja_diaria para respetar la SESIÓN ÚNICA de Switch
// (cada vista sin caché sería un login que puede matar el token de un cron):
//   - día cerrado (fecha < hoy Panamá): cacheado para siempre (no cambia).
//   - día en curso: TTL 10 min.
//   - tabla ausente (DDL pendiente): modo directo sin caché — funciona igual.
//   - Switch caído + hay caché viejo: sirve el caché con stale=true.
// Tras cada llamada a Switch se cierra la sesión (logout best-effort).
//
// Semántica del endpoint VERIFICADA EN VIVO (4-jul-2026): `hasta` es exclusivo
// → día D = desde=D, hasta=D+1; corte de día en hora LOCAL Panamá; granTotal
// cuadró al centavo con switch_facturas 3 días seguidos.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { createSwitchClient, type SwitchDiarioVentas } from "@/lib/switch-api/client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

const EMPRESA_KEY = "american_classic"; // instancia MULTI (Multifashion/ACS)
const SUCURSAL_ID = 1; // PRINCIPAL (única — verificado vía /apisucursal/lista)
const CACHE_TABLE = "multifashion_caja_diaria";
const TTL_HOY_MS = 10 * 60 * 1000;

function hoyPanama(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Panama" }).format(new Date());
}

function diaSiguiente(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  return new Date(d.getTime() + 86_400_000).toISOString().slice(0, 10);
}

interface CacheRow {
  fecha: string;
  data: SwitchDiarioVentas;
  synced_at: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = requireRole(req, ["admin", "secretaria", "gerente_acs"]);
  if (auth instanceof NextResponse) return auth;

  const hoy = hoyPanama();
  // Cualquier día pasado, para todos los roles del módulo: la ventana acotada de
  // `gerente_acs` se levantó el 13-ago-2026 (ver CLAUDE.md § Roles). Las dos
  // validaciones de abajo se quedan — un día futuro no existe para nadie.
  const fecha = req.nextUrl.searchParams.get("fecha") || hoy;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: "Fecha inválida (YYYY-MM-DD)" }, { status: 400 });
  }
  if (fecha > hoy) {
    return NextResponse.json({ error: "La fecha no puede ser futura" }, { status: 400 });
  }

  // 1. Caché (si la tabla existe). Día cerrado = permanente; hoy = TTL.
  let cached: CacheRow | null = null;
  let cacheDisponible = true;
  const { data: row, error: readErr } = await supabaseServer
    .from(CACHE_TABLE)
    .select("fecha, data, synced_at")
    .eq("fecha", fecha)
    .maybeSingle();
  if (readErr) {
    // PGRST205 = tabla no existe (DDL pendiente) → modo directo sin caché.
    cacheDisponible = false;
    if (!/PGRST205|does not exist|could not find the table/i.test(`${readErr.code} ${readErr.message}`)) {
      console.error(`[caja] lectura caché: ${readErr.message}`);
    }
  } else if (row) {
    cached = row as CacheRow;
    const esHoy = fecha === hoy;
    const fresco = !esHoy || Date.now() - new Date(cached.synced_at).getTime() < TTL_HOY_MS;
    if (fresco) {
      return NextResponse.json({ fecha, caja: cached.data, synced_at: cached.synced_at, cached: true });
    }
  }

  // 2. Switch (con cierre de sesión al terminar — sesión única).
  const client = createSwitchClient(EMPRESA_KEY);
  try {
    const data = await client.getDiarioVentas({
      sucursalId: SUCURSAL_ID,
      desde: fecha,
      hasta: diaSiguiente(fecha), // hasta EXCLUSIVO (verificado en vivo)
    });
    const caja = data.diarioDeVentas;
    const syncedAt = new Date().toISOString();

    if (cacheDisponible) {
      const { error: upErr } = await supabaseServer
        .from(CACHE_TABLE)
        .upsert({ fecha, data: caja, synced_at: syncedAt }, { onConflict: "fecha" });
      if (upErr) console.error(`[caja] upsert caché: ${upErr.message}`);
    }

    return NextResponse.json({ fecha, caja, synced_at: syncedAt, cached: false });
  } catch (err) {
    // Switch caído: servir caché viejo si hay; si no, error accionable.
    if (cached) {
      return NextResponse.json({ fecha, caja: cached.data, synced_at: cached.synced_at, cached: true, stale: true });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[caja] switch: ${msg}`);
    return NextResponse.json(
      { error: "No se pudo consultar Switch. Intenta de nuevo en unos segundos." },
      { status: 502 },
    );
  } finally {
    await client.logout();
  }
}
