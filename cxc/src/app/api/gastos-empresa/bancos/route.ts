import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { ALL_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { hoyPanama } from "@/lib/fecha-panama";

export const dynamic = "force-dynamic";

// Registrar/corregir el saldo bancario de una empresa para una fecha.
// bancos_saldos tiene UNIQUE(empresa_key, fecha_dato) completo → upsert directo
// (repetir la misma fecha corrige el saldo del día). Saldos negativos se
// permiten: los sobregiros existen.

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(fecha: string): boolean {
  const d = new Date(`${fecha}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha;
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
    console.error("[gastos-empresa/bancos]", err);
    return NextResponse.json(
      { error: "No se pudo guardar el saldo. Intenta de nuevo en unos segundos." },
      { status: 500 },
    );
  }
}
