// ─────────────────────────────────────────────────────────────────────────────
// GET /api/asistencia/marcacion-foto?id=<marcación> — la selfie de una marca.
//
// 🔴 EL BUCKET ES PRIVADO Y LA URL SE FIRMA ACÁ, con vida de una hora. Mismo
// patrón que la foto de la cédula: nunca `getPublicUrl`, que es una dirección
// eterna para cualquiera que la adivine. Es la cara de una persona.
//
// 🔑 SE PIDE POR EL `id` DE LA MARCACIÓN, NUNCA POR EL PATH. Si el path
// viniera del navegador, quien conozca esta ruta podría pedir la carpeta de
// otra persona. Acá el path sale de la fila.
//
// 🔴 ENTRA QUIEN ENTRA A ASISTENCIA (la contadora y Daniel), no quien marca:
// nadie mira la selfie de otro. La persona ve sus HORAS en su pantalla, no sus
// fotos.
//
// ⚠️ A los 90 días la foto ya no está (Daniel: *«se borran solas»*) y la fila
// sigue viva con su `foto_path`: eso NO es un error, se contesta `url: null` y
// la pantalla dice que la foto ya se retiró.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { requireAsistencia } from "@/lib/asistencia/guard";
import { asistenciaRoles } from "@/lib/asistencia/roles";
import { supabaseServer } from "@/lib/supabase-server";
import { firmarSelfie } from "@/lib/marcacion/selfie-servidor";
import { DISPOSITIVO_TELEFONO } from "@/lib/marcacion/marcacion";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireAsistencia(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;

  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "Falta la marcación." }, { status: 400 });

  try {
    const { data, error } = await supabaseServer
      .from("asistencia_marcaciones")
      .select("foto_path, lat, lng")
      .eq("id", id)
      .eq("dispositivo", DISPOSITIVO_TELEFONO)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ url: null, lat: null, lng: null });

    const fila = data as { foto_path?: string | null; lat?: number | null; lng?: number | null };
    return NextResponse.json({
      url: await firmarSelfie(fila.foto_path),
      lat: typeof fila.lat === "number" ? fila.lat : null,
      lng: typeof fila.lng === "number" ? fila.lng : null,
    });
  } catch (e) {
    console.error("[asistencia/marcacion-foto]", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "No se pudo abrir la selfie. Intenta de nuevo en unos segundos." },
      { status: 500 },
    );
  }
}
