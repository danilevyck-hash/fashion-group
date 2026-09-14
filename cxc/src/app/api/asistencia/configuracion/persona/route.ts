// ─────────────────────────────────────────────────────────────────────────────
// LA FICHA DE UNA PERSONA — GET, solo lectura (14-sep-2026).
//
// ── 🩸 QUÉ ARREGLA ───────────────────────────────────────────────────────────
//
// `/asistencia/colaboradores/:codigo` abría pidiendo `/api/asistencia/
// configuracion`, o sea la lista ENTERA, y se quedaba con una fila. Eso es leer
// las **6.998 marcaciones de 180 días** (835 KB, siete páginas de PostgREST)
// para dibujar a una persona. Medido contra producción ese día: **1.656 ms** por
// ese camino contra **189-408 ms** por éste, según cuántas veces marcó.
//
// ── 🔴 LA NOTA QUE ESTO DA VUELTA, Y CON QUÉ CANDADO ─────────────────────────
//
// `PersonaPagina.tsx` decía, textual: *«EL MISMO GET DE SIEMPRE. No se estrena
// una ruta "de una persona": dos lecturas de la misma ficha es cómo nacen dos
// verdades»*. La nota NO SE BORRA y su miedo era el correcto — de esta ficha
// sale lo que se le paga a la gente—; lo que estaba mal era el remedio. Lo que
// no puede haber son dos CÁLCULOS, y acá no hay dos: el mapeo de una fila a una
// persona vive en `lib/asistencia/ficha-de-configuracion.ts` y esta ruta y la de
// la lista LLAMAN LA MISMA FUNCIÓN. Lo único distinto es a qué le pregunta cada
// una a la base.
//
// 🔴 Y como una promesa así no se sostiene sola, hay candado:
// `asistencia-ficha-una-persona.test.ts` corre LOS DOS CAMINOS sobre el universo
// entero de personas y exige igualdad CAMPO POR CAMPO. Si un día difieren en uno
// solo, el build se pone rojo.
//
// ⚠️ NO ESCRIBE NADA. Guardar la ficha sigue siendo el `PUT` de
// `/api/asistencia/configuracion`, que no se tocó: una sola puerta de escritura.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { asistenciaRoles } from "@/lib/asistencia/roles";
import { requireAsistencia } from "@/lib/asistencia/guard";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import {
  armarPersonaDeConfiguracion,
  BANDERAS_DE_CONFIGURACION,
} from "@/lib/asistencia/ficha-de-configuracion";
import { leerInsumosDeUnaPersona } from "@/lib/asistencia/ficha-de-configuracion-server";
import { leerTrabajaAfuera } from "@/lib/asistencia/config-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = requireAsistencia(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;

  const codigo = (req.nextUrl.searchParams.get("codigo") ?? "").trim();
  if (!codigo) {
    return NextResponse.json({ error: "Falta el código del colaborador." }, { status: 400 });
  }

  try {
    // 🔴 «Trabaja afuera» se lee APARTE (14-sep-2026): su columna nace con la
    // migración sin aplicar, y la lectura es la MISMA que usa la lista.
    const [insumos, afuera] = await Promise.all([leerInsumosDeUnaPersona(codigo), leerTrabajaAfuera()]);

    // 🔴 `null` = el código está IGNORADO, y entonces la respuesta es la misma
    // que daba la lista: la lista lo filtraba con `sinIgnorados` y el `find` de
    // la página no lo encontraba. La página ya sabe qué hacer con eso —abre la
    // ficha en blanco, en «Editar»— y ese comportamiento no cambia.
    // Y se le pega la casilla exactamente como lo hace la lista.
    const persona = insumos
      ? { ...armarPersonaDeConfiguracion(insumos).persona, trabajaAfuera: afuera.has(codigo) }
      : null;

    return NextResponse.json({
      persona,
      // Las reglas viajan porque la respuesta de la lista también las manda y
      // la pantalla es la misma. Salen del MISMO `leerReglas`.
      reglas: insumos?.reglas ?? REGLAS_DEFAULT,
      reglasDefault: REGLAS_DEFAULT,
      // Las banderas «qué se puede hacer», del mismo lugar que la lista.
      ...BANDERAS_DE_CONFIGURACION,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/configuracion/persona GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
