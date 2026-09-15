// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL PORTERO DE /marcacion — GUARD SSR DEL SEGMENTO (14-sep-2026).
//
// ⚠️ ESTE ARCHIVO ES DEL PERMISO, NO DE LA PANTALLA. Decide QUIÉN ENTRA y nada
// más: no dibuja, no lee marcas, no toca la cámara. La pantalla de marcar vive
// en `page.tsx` y es de otra mano. Si hace falta cambiar algo de acá, es un
// cambio de permisos.
//
// 🔴 VA EN EL LAYOUT Y NO EN LA PÁGINA A PROPÓSITO: un layout cubre el segmento
// ENTERO, así que cubre `/marcacion` y cualquier pantalla que nazca debajo
// —`/marcacion/mis-marcas`, lo que sea— sin que nadie se acuerde de copiar tres
// líneas. Las dos veces que un módulo de este sistema quedó abierto
// (`/multifashion` el 6-sep-2026, `/catalogos/admin/[marca]` el mismo día) fue
// exactamente por eso: una página que se olvidó de preguntar. El middleware
// solo valida que la sesión EXISTA; sin esto, cualquiera con sesión abriría
// esta dirección.
//
// 🔴 Y VA ANTES DE DIBUJAR NADA: el redirect ocurre en el servidor, así que a
// quien no le toca no le llega ni el HTML. Un guard del lado del navegador
// llega tarde.
//
// Quién entra lo dice `lib/marcacion/acceso.ts`: el rol `marcacion`, `admin`
// (Daniel lo prueba en su iPhone) y quien lleve el módulo en su override
// —Rodrigo, que es bodega—. Sin sesión, a la contraseña; con sesión y sin
// permiso, al Inicio.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { destinoSiNoAbreMarcacion } from "@/lib/marcacion/acceso";

export const dynamic = "force-dynamic";

export default async function MarcacionLayout({ children }: { children: ReactNode }) {
  const destino = destinoSiNoAbreMarcacion((await cookies()).get("cxc_session")?.value);
  if (destino) redirect(destino);
  return <>{children}</>;
}
