// Faltas justificadas, por RANGO de fechas.
//
// 🩸 Idea de Daniel y la que más trabajo ahorra: se marca el día que pasa, no
// al cerrar la quincena — para entonces nadie recuerda quién fue al doctor el
// día 14. También se pueden cargar retroactivas.
//
// Es un RANGO y no un día suelto: unas vacaciones son UNA fila, no diez.

import { NextRequest, NextResponse } from "next/server";
import { asistenciaRoles } from "@/lib/asistencia/roles";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { MOTIVOS_JUSTIFICACION, motivoSeOfrece } from "@/lib/asistencia/motivos";
import {
  avisoMigracionPermisoHoras,
  COLS_PERMISO_HORAS,
  esColumnaPermisoHorasFaltante,
  ventanaDe,
} from "@/lib/asistencia/permiso-horas";
import { leerPersonasDelModulo } from "@/lib/asistencia/config-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = requireRole(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;
  const sp = req.nextUrl.searchParams;
  const COLS_BASE = "id, empleado_codigo, desde, hasta, motivo, nota, registrado_por, created_at";
  const desde = sp.get("desde"), hasta = sp.get("hasta");
  // Se solapa con el rango pedido, no "está contenido en": unas vacaciones que
  // arrancan antes del rango igual cubren días de adentro.
  const armar = (cols: string) => {
    let q = supabaseServer
      .from("asistencia_justificaciones")
      .select(cols)
      .order("desde", { ascending: false })
      .limit(500);
    if (desde && hasta) q = q.lte("desde", hasta).gte("hasta", desde);
    return q;
  };

  // 🩸 La lista de personas se pide ACÁ y no a `/horarios`, que es de donde
  // salía antes. Aquella devuelve solo a quien marcó en los últimos 90 días y
  // trae el nombre del RELOJ —que viene vacío—, así que el desplegable listaba
  // «15, 16, 17, 21…». Ahora sale del directorio, que es el único lugar donde
  // un código se vuelve un nombre.
  // 🩸 ESCALERA, igual que `leerPersonas`: en este proyecto los DDL los corre
  // Daniel a mano y varios se quedaron pendientes semanas. Una lista explícita
  // de columnas hace que PostgREST rechace el select ENTERO, así que sin esto
  // Justificaciones no cargaría NI UNA fila hasta que alguien corra el SQL —y
  // el síntoma sería "Asistencia está rota".
  let [{ data, error }, { personas, faltaMigracion }] = await Promise.all([
    armar(`${COLS_BASE}, ${COLS_PERMISO_HORAS.join(", ")}`),
    leerPersonasDelModulo(),
  ]);
  let faltaHoras = false;
  if (error && esColumnaPermisoHorasFaltante(error)) {
    faltaHoras = true;
    ({ data, error } = await armar(COLS_BASE));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    justificaciones: data ?? [],
    motivos: MOTIVOS_JUSTIFICACION,
    personas,
    faltaMigracion,
    // Sin las columnas, la pantalla no ofrece las horas y lo dice de entrada,
    // no al fallar el guardado.
    puedeCargarHoras: !faltaHoras,
    avisoMigracionHoras: faltaHoras ? avisoMigracionPermisoHoras() : null,
  });
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;
  let b: {
    codigo?: string; desde?: string; hasta?: string; motivo?: string; nota?: string;
    horaDesde?: string; horaHasta?: string;
  };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const codigo = (b.codigo ?? "").trim();
  const desde = (b.desde ?? "").trim();
  const hasta = (b.hasta ?? desde).trim();
  const motivo = (b.motivo ?? "").trim();
  if (!codigo) return NextResponse.json({ error: "Falta la persona" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    return NextResponse.json({ error: "Fechas inválidas" }, { status: 400 });
  }
  // Un rango al revés no cubriría ningún día: sería una justificación que no
  // justifica nada, y en silencio.
  if (hasta < desde) return NextResponse.json({ error: "La fecha final es anterior a la inicial" }, { status: 400 });
  if (!motivo) return NextResponse.json({ error: "Falta el motivo" }, { status: 400 });
  // 🔴 SOLO LOS MOTIVOS QUE LA PANTALLA OFRECE. Los retirados —Vacaciones,
  // Permiso, Luto, Otro— se siguen LEYENDO de las filas viejas, pero nadie
  // puede crear una nueva con ellos: si la ruta los aceptara, esconderlos del
  // desplegable sería cosmético y en tres meses volverían por la puerta de
  // atrás. La lista vive en `motivos.ts`, no repetida acá.
  if (!motivoSeOfrece(motivo)) {
    return NextResponse.json(
      { error: `Ese motivo ya no se usa. Elige uno de: ${MOTIVOS_JUSTIFICACION.join(" · ")}.` },
      { status: 400 },
    );
  }

  // Las dos horas VIAJAN JUNTAS y la ventana tiene que ser hacia adelante. El
  // validador es el mismo módulo puro que usa el motor, así que la regla no
  // puede decir dos cosas distintas en dos lugares.
  const horaDesde = (b.horaDesde ?? "").trim();
  const horaHasta = (b.horaHasta ?? "").trim();
  const pidioHoras = horaDesde !== "" || horaHasta !== "";
  if (pidioHoras && !ventanaDe(horaDesde, horaHasta)) {
    return NextResponse.json(
      { error: "El permiso de horas necesita las DOS horas, y la de fin tiene que ser posterior a la de inicio." },
      { status: 400 },
    );
  }

  const base = {
    empleado_codigo: codigo, desde, hasta, motivo,
    nota: (b.nota ?? "").trim() || null,
    registrado_por: auth.userName ?? auth.role,
  };
  let { error } = await supabaseServer.from("asistencia_justificaciones").insert(
    pidioHoras ? { ...base, hora_desde: horaDesde, hora_hasta: horaHasta } : base,
  );

  // 🩸 FALTAN LAS COLUMNAS. Misma bifurcación que el resto del módulo:
  //  · si NO se pidieron horas, se reintenta sin ellas y cargar una
  //    justificación de día entero sigue funcionando igual que ayer;
  //  · si SÍ se pidieron, NO se guarda a medias. Una justificación que se traga
  //    las horas pasa a justificar el DÍA ENTERO —ocho horas de sueldo— y nadie
  //    sabría por qué.
  if (error && esColumnaPermisoHorasFaltante(error)) {
    if (pidioHoras) {
      return NextResponse.json(
        { error: avisoMigracionPermisoHoras(), faltaMigracionHoras: true },
        { status: 503 },
      );
    }
    ({ error } = await supabaseServer.from("asistencia_justificaciones").insert(base));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = requireRole(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });
  const { error } = await supabaseServer.from("asistencia_justificaciones").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
