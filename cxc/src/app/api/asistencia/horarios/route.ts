// Horario por persona: hora de salida y minutos de almuerzo.
//
// 🩸 Esta pantalla NO es un extra. El `Turno` de iVMS está mal en 12 de 31
// personas (medido): Ángela García figura "8 a 4:30" y sale 17:04. Con ese dato
// le salían 584 minutos de horas extra en 11 días. Lo que se fije acá MANDA.
//
// GET  → todas las personas con marcaciones, con su horario guardado o el
//        SUGERIDO por sus salidas reales si todavía no tiene.
// PUT  → guarda uno.

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { salidaSugerida, minutosDelDia, diaPanama, ALMUERZO_DEFAULT_MIN } from "@/lib/asistencia/reporte";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface FilaMarca { empleado_codigo: string | null; empleado_nombre: string | null; ocurrio_en: string }

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  try {
    // Universo = quien tenga marcaciones. Se leen las de los últimos 90 días:
    // alcanza para sugerir un horario y evita traer la tabla entera.
    const hace90 = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const marcas = await leerTodoPaginado<FilaMarca>(
      "asistencia_marcaciones (horarios)",
      (pedirCount, from, to) =>
        supabaseServer
          .from("asistencia_marcaciones")
          .select("empleado_codigo, empleado_nombre, ocurrio_en", pedirCount ? { count: "exact" } : {})
          .gte("ocurrio_en", hace90)
          .order("ocurrio_en", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
    );

    const { data: guardados, error } = await supabaseServer
      .from("asistencia_horarios")
      .select("empleado_codigo, empleado_nombre, entrada, salida, almuerzo_minutos");
    if (error) throw new Error(error.message);
    const porCodigo = new Map((guardados ?? []).map((h) => [String(h.empleado_codigo), h]));

    // Última marca de cada día por persona → mediana → salida sugerida.
    const nombre = new Map<string, string | null>();
    const ultimaPorDia = new Map<string, number>();
    for (const m of marcas) {
      const cod = (m.empleado_codigo ?? "").trim();
      if (!cod) continue;
      if (m.empleado_nombre) nombre.set(cod, m.empleado_nombre);
      const k = `${cod}|${diaPanama(m.ocurrio_en)}`;
      const v = minutosDelDia(m.ocurrio_en);
      ultimaPorDia.set(k, Math.max(ultimaPorDia.get(k) ?? 0, v));
    }
    const salidas = new Map<string, number[]>();
    for (const [k, v] of ultimaPorDia) {
      const cod = k.split("|")[0];
      const l = salidas.get(cod);
      if (l) l.push(v); else salidas.set(cod, [v]);
    }

    const personas = [...salidas.keys()].map((cod) => {
      const g = porCodigo.get(cod);
      const sug = salidaSugerida(salidas.get(cod) ?? []);
      return {
        codigo: cod,
        nombre: nombre.get(cod) ?? g?.empleado_nombre ?? null,
        entrada: g ? String(g.entrada).slice(0, 5) : "08:00",
        salida: g ? String(g.salida).slice(0, 5) : sug,
        almuerzoMinutos: g?.almuerzo_minutos ?? ALMUERZO_DEFAULT_MIN,
        // `false` = todavía es la sugerencia, nadie la confirmó. La pantalla lo
        // marca para que Daniel sepa qué le falta revisar.
        guardado: !!g,
        sugerida: sug,
        diasMedidos: (salidas.get(cod) ?? []).length,
      };
    });
    personas.sort((a, b) => (a.nombre ?? a.codigo).localeCompare(b.nombre ?? b.codigo, "es"));

    return NextResponse.json({ personas, sinConfirmar: personas.filter((p) => !p.guardado).length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/horarios GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  let body: { codigo?: string; nombre?: string | null; salida?: string; almuerzoMinutos?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const codigo = (body.codigo ?? "").trim();
  if (!codigo) return NextResponse.json({ error: "Falta la persona" }, { status: 400 });
  const salida = (body.salida ?? "").trim();
  if (!/^\d{2}:\d{2}$/.test(salida)) return NextResponse.json({ error: "Hora de salida inválida" }, { status: 400 });
  const almuerzo = Number(body.almuerzoMinutos);
  if (!Number.isInteger(almuerzo) || almuerzo < 0 || almuerzo > 240) {
    return NextResponse.json({ error: "Minutos de almuerzo inválidos" }, { status: 400 });
  }

  const { error } = await supabaseServer.from("asistencia_horarios").upsert(
    {
      empleado_codigo: codigo,
      empleado_nombre: body.nombre ?? null,
      entrada: "08:00",
      salida,
      almuerzo_minutos: almuerzo,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "empleado_codigo" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
