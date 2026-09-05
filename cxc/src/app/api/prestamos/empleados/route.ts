import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { PRESTAMOS_ROLES } from "@/lib/prestamos-roles";
import { leerDatosPrestamos } from "@/lib/prestamos-lista-server";
import { logActivity } from "@/lib/log-activity";

export const dynamic = "force-dynamic";

/**
 * La lista: SOLO quien debe, más las 37 personas activas para buscar y prestar.
 *
 * 🔴 Ya no hay `?archivados=`. La bandera `activo` de la ficha se retiró el
 * 5-sep-2026: nunca significó «trabaja acá» sino «tiene algo abierto», y eso ya
 * lo dice el saldo. Quien llega a cero sale solo de la lista; su historial se
 * queda y se abre desde el buscador.
 */
export async function GET(req: NextRequest) {
  const auth = requireRole(req, [...PRESTAMOS_ROLES]);
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json(await leerDatosPrestamos());
  } catch (e) {
    console.error("[prestamos/empleados]", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/**
 * Una ficha nueva NACE CON SU CÓDIGO.
 *
 * 🩸 Hasta el 5-sep-2026 el alta pedía un nombre tecleado a mano y nada más, y
 * `empleado_codigo` **no se podía poner desde ninguna parte** — mientras el
 * aviso de la planilla decía, textual, *«Se atan en Préstamos, eligiendo la
 * persona de la ficha»*, una acción que no existía. Las dos fichas creadas el 2
 * y el 4 de septiembre nacieron sin código: **$400 de deuda viva que la planilla
 * no puede descontar**.
 *
 * 🔴 Ahora se elige a la persona de Asistencia y el servidor saca de ahí el
 * nombre y la empresa. Nada se ata por parecido: se manda el CÓDIGO.
 */
export async function POST(req: NextRequest) {
  const auth = requireRole(req, [...PRESTAMOS_ROLES]);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => ({}));
  const codigo = String(body?.empleado_codigo ?? "").trim();
  const cuotaPrestamo = Number(body?.deduccion_quincenal) || 0;
  const cuotaDano = Number(body?.deduccion_dano) || 0;

  if (!codigo) {
    return NextResponse.json(
      { error: "Elige a la persona de la lista de colaboradores." },
      { status: 400 },
    );
  }
  if (cuotaPrestamo < 0 || cuotaDano < 0) {
    return NextResponse.json({ error: "Las cuotas no pueden ser negativas." }, { status: 400 });
  }

  const { data: persona, error: ePersona } = await supabaseServer
    .from("asistencia_personas")
    .select("empleado_codigo, nombre, empresa")
    .eq("empleado_codigo", codigo)
    .maybeSingle();
  if (ePersona) {
    console.error("[prestamos/empleados] persona:", ePersona.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
  if (!persona) {
    return NextResponse.json(
      { error: "Esa persona no está en Asistencia. Elige a alguien de la lista." },
      { status: 400 },
    );
  }

  // Una persona, una ficha. Ramón Miranda llegó a tener dos con el mismo código
  // solo para poder cobrarle un daño de $3,13 — justo lo que las dos cuentas
  // resuelven, así que ya no hace falta y no se permite.
  const { data: yaTiene } = await supabaseServer
    .from("prestamos_empleados")
    .select("id")
    .eq("empleado_codigo", codigo)
    .or("deleted.is.null,deleted.eq.false")
    .limit(1);
  if (yaTiene && yaTiene.length > 0) {
    return NextResponse.json({ id: yaTiene[0].id, yaExistia: true });
  }

  const { EMPRESA_KEY_TO_NAME } = await import("@/lib/empresa-mapping");
  const empresaNombre = persona.empresa ? (EMPRESA_KEY_TO_NAME[persona.empresa] ?? persona.empresa) : null;

  const { data, error } = await supabaseServer
    .from("prestamos_empleados")
    .insert({
      nombre: persona.nombre,
      empresa: empresaNombre,
      empleado_codigo: codigo,
      deduccion_quincenal: cuotaPrestamo,
      deduccion_dano: cuotaDano,
    })
    .select()
    .single();

  if (error) {
    console.error("[prestamos/empleados]", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
  await logActivity(auth.role, "prestamo_empleado_create", "prestamos", { empleadoId: data.id, codigo }, auth.userName);
  return NextResponse.json(data);
}
