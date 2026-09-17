// ─────────────────────────────────────────────────────────────────────────────
// EL DÍA LIBRE DE LA EMPRESA — cargarlo, verlo y quitarlo.
//
// Daniel, textual: *«contabilidad y admin [lo cargan] y sí, a todos los
// colaboradores de esa empresa»* · *«se carga cuando haya ese día… y son pocas
// al año»*.
//
// 🔴 UNA CARGA HACE DOS COSAS, Y LAS DOS TIENEN QUE PASAR:
//   1. la JUSTIFICACIÓN del día, para que se pague completo (sin ella sería una
//      ausencia y le descontaríamos el día que le regalamos);
//   2. la DEUDA de 8 horas en dólares, congelada con la rata de hoy.
// La regla entera vive en `dia-libre-empresa.ts`; acá solo se arma y se guarda.
//
// ⚠️ Sin la migración `20261203120000` esto NO se guarda a medias: se rechaza y
// se dice qué archivo falta. Una justificación sin su deuda regalaría el día
// dos veces —el día y las horas— y nadie lo vería nunca.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireAsistencia } from "@/lib/asistencia/guard";
import { asistenciaRoles, diaLibreRoles } from "@/lib/asistencia/roles";
import { supabaseServer } from "@/lib/supabase-server";
import { MOTIVO_DIA_LIBRE_EMPRESA } from "@/lib/asistencia/motivos";
import { avisoMigracionDiaLibre } from "@/lib/asistencia/dia-libre-empresa";
import {
  cargarDeudasDiaLibre,
  leerSaldosDiaLibre,
  quitarDeudaDiaLibre,
} from "@/lib/asistencia/dia-libre-empresa-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

// ── GET — el saldo de cada quien ─────────────────────────────────────────────
//
// Lo LEE cualquiera que tenga Asistencia: el saldo se muestra en la ficha del
// colaborador y en la planilla, y enterarse no es lo restringido. Cargar sí.
export async function GET(req: NextRequest) {
  const auth = requireAsistencia(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;
  const { saldos, deudas, faltaTabla } = await leerSaldosDiaLibre();
  return NextResponse.json({
    saldos: [...saldos.values()],
    deudas,
    puedeCargar: diaLibreRoles().includes(auth.role),
    faltaMigracion: faltaTabla ? avisoMigracionDiaLibre() : null,
  });
}

// ── POST — cargar el día libre ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = requireAsistencia(req, diaLibreRoles());
  if (auth instanceof NextResponse) return auth;

  let b: { empresa?: string; codigo?: string; desde?: string; hasta?: string; nota?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const desde = (b.desde ?? "").trim();
  const hasta = (b.hasta ?? desde).trim();
  const empresa = (b.empresa ?? "").trim();
  const codigo = (b.codigo ?? "").trim();
  const nota = (b.nota ?? "").trim() || null;

  if (!ES_FECHA.test(desde) || !ES_FECHA.test(hasta)) {
    return NextResponse.json({ error: "Fechas inválidas" }, { status: 400 });
  }
  if (hasta < desde) {
    return NextResponse.json({ error: "La fecha final es anterior a la inicial" }, { status: 400 });
  }
  if (!empresa && !codigo) {
    return NextResponse.json({ error: "Falta la empresa (o el colaborador)" }, { status: 400 });
  }
  // 🔴 UNA SOLA PUERTA para armar y anotar la deuda: la misma que usa el alta
  // de una persona suelta desde Justificaciones (`cargarDeudasDiaLibre`).
  // LA DEUDA VA PRIMERO. Si falta la migración no se guarda NADA: mejor que no
  // se pueda cargar a que se cargue el día sin su deuda.
  const carga = await cargarDeudasDiaLibre({
    empresa, codigo, desde, hasta, nota, usuario: auth.userName ?? auth.role,
  });
  if (carga.faltaTabla) {
    return NextResponse.json(
      { error: avisoMigracionDiaLibre(), faltaMigracion: true },
      { status: 503 },
    );
  }
  if (carga.error) return NextResponse.json({ error: carga.error }, { status: 400 });

  // 2) LA JUSTIFICACIÓN DEL DÍA, para que se pague completo. Una por persona y
  //    por rango, igual que cualquier otra.
  const { error } = await supabaseServer.from("asistencia_justificaciones").insert(
    carga.codigos.map((cod) => ({
      empleado_codigo: cod,
      desde,
      hasta,
      motivo: MOTIVO_DIA_LIBRE_EMPRESA,
      nota,
      registrado_por: auth.userName ?? auth.role,
    })),
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    colaboradores: carga.codigos.length,
    dias: carga.dias,
    deudasCreadas: carga.creadas,
    deudasRepetidas: carga.repetidas,
    // 🔴 A quién no se le pudo calcular la deuda, por nombre: el día se le pagó
    // igual, pero no nació deuda y eso hay que decirlo.
    sinRata: carga.sinRata,
  });
}

// ── DELETE — quitar una deuda cargada por error ──────────────────────────────
//
// 🔴 Soft delete firmado, NUNCA un DELETE: la fila se queda como historial.
// ⚠️ NO borra la justificación del día: el día se siguió pagando y eso no se
// deshace desde acá. Se quita, si hace falta, en Justificaciones.
export async function DELETE(req: NextRequest) {
  const auth = requireAsistencia(req, diaLibreRoles());
  if (auth instanceof NextResponse) return auth;
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });
  const r = await quitarDeudaDiaLibre(id, auth.userName ?? auth.role);
  if (r.faltaTabla) {
    return NextResponse.json({ error: avisoMigracionDiaLibre(), faltaMigracion: true }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
