import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import {
  CAMPOS_OBLIGATORIOS,
  respuestaErrorEscritura,
  textoObligatorio,
  validarObligatorios,
} from "@/lib/campos-obligatorios";
import { codigoNormalizado, nombreEnPantalla, type PersonaDeAsistencia } from "@/lib/caja/responsable";

const CAJA_ROLES = ["admin", "secretaria"];

export const dynamic = "force-dynamic";

/**
 * El catálogo de quién puede ser responsable de un período de caja.
 *
 * 🔴 Hoy son SOLO Angela. Daniel: «Andrea 16, Julio 11, Rodrigo 13 — estos no
 * deben de estar en el módulo, solo Angela». Los otros seis nunca se usaron y
 * quedaron APAGADOS (`activo = false`), nunca borrados.
 *
 * 🔴 El NOMBRE que sale de aquí es el de ASISTENCIA, leído por
 * `empleado_codigo` — no el texto guardado en Caja, que llegó a tener tres
 * escrituras para la misma persona.
 */
export async function GET(req: NextRequest) {
  const auth = requireRole(req, CAJA_ROLES);
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await supabaseServer
    .from("caja_responsables")
    .select("*")
    .eq("activo", true)
    .order("nombre");

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }

  const filas = (data || []) as Array<{ id: string; nombre: string; empleado_codigo?: string | null }>;
  const codigos = Array.from(
    new Set(filas.map((r) => codigoNormalizado(r.empleado_codigo)).filter((c) => c.length > 0)),
  );

  // Falla ABIERTA: sin la DDL 20261013120000 no hay códigos y el catálogo sale
  // con el nombre que ya tenía, igual que antes.
  const porCodigo = new Map<string, string>();
  if (codigos.length > 0) {
    const { data: personas } = await supabaseServer
      .from("asistencia_personas")
      .select("empleado_codigo, nombre")
      .in("empleado_codigo", codigos);
    for (const p of (personas || []) as PersonaDeAsistencia[]) {
      porCodigo.set(codigoNormalizado(p.empleado_codigo), nombreEnPantalla(p.nombre));
    }
  }

  return NextResponse.json(
    filas.map((r) => {
      const codigo = codigoNormalizado(r.empleado_codigo);
      return {
        ...r,
        empleado_codigo: codigo || null,
        nombre: (codigo && porCodigo.get(codigo)) || nombreEnPantalla(r.nombre),
      };
    }),
  );
}

export async function POST(req: NextRequest) {
  const auth = requireRole(req, CAJA_ROLES);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json();

  // `caja_responsables.nombre` es NOT NULL sin default. Sin esta validación un
  // body sin `nombre` llegaba como `undefined`, `JSON.stringify` borraba la
  // clave y Postgres devolvía 23502 — tapado por un 500 "Error interno".
  const falta = validarObligatorios(body, CAMPOS_OBLIGATORIOS.caja_responsables);
  if (falta) return falta;

  const { data, error } = await supabaseServer
    .from("caja_responsables")
    .insert({ nombre: textoObligatorio(body.nombre) })
    .select()
    .single();

  if (error) return respuestaErrorEscritura(error, { tabla: "caja_responsables", accion: "Caja Menuda › responsables" });
  return NextResponse.json(data);
}
