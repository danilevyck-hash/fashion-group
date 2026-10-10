// GET ?empresa= → { codigo } — el siguiente código libre de la serie de esa
// empresa para «+ Nuevo colaborador», o `null` si no se puede proponer sin
// adivinar. Solo lee. Ver `lib/asistencia/alta-colaborador.ts`.
import { NextRequest, NextResponse } from "next/server";
import { asistenciaRoles } from "@/lib/asistencia/roles";
import { requireAsistencia } from "@/lib/asistencia/guard";
import { siguienteCodigoLibre, valoresPorOmision } from "@/lib/asistencia/alta-colaborador-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireAsistencia(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;
  const empresa = (req.nextUrl.searchParams.get("empresa") ?? "").trim();
  try {
    // `porOmision`: el horario y la jornada más usados en esa empresa.
    const [codigo, porOmision] = await Promise.all([siguienteCodigoLibre(empresa), valoresPorOmision(empresa)]);
    return NextResponse.json({ codigo, porOmision });
  } catch {
    return NextResponse.json({ codigo: null });
  }
}
