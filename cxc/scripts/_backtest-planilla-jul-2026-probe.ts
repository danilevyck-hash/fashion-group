import { NextRequest } from "next/server";
import { GET } from "@/app/api/asistencia/planilla/route";
import { PLANILLA_UNIDA } from "@/lib/asistencia/planilla-unida";
async function main() {
  console.log("PLANILLA_UNIDA", PLANILLA_UNIDA);
  const url = new URL("http://localhost/api/asistencia/planilla?quincena=2026-07-2&empresa=vistana");
  const r = await GET(new NextRequest(url));
  console.log("status", r.status);
  const j: any = await r.json();
  console.log(Object.keys(j));
  console.log("corte", j.corte, "marcaciones", j.marcaciones, "lineas", j.lineas?.length, "neto", j.totales?.netoPagar, "correcciones", j.avisos?.correcciones);
  for (const l of j.lineas) console.log(l.codigo, l.etiqueta, l.empresa, l.dinero?.netoPagar, l.dinero?.extraDiurno, l.horas?.extraNoAprobadaMin, l.decidirAMano, l.faltaConfigurar);
}
main().catch(e => { console.error(e); process.exit(1); });
