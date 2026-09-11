import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/session-cookie";
import { puedeEscribirGuias } from "@/lib/guias/roles-escritura";
import NuevaGuiaClient from "./NuevaGuiaClient";

export const dynamic = "force-dynamic";

// 🩸 EL VENDEDOR ENTRABA Y SE ENTERABA AL FINAL (hasta el 11-sep-2026).
//
// Esta página aceptaba a `vendedor` y el `POST /api/guias` lo rechaza con
// «Sin permiso»: se elegía cliente, se marcaban facturas, se llenaban bultos
// y destinos, y el único aviso llegaba al tocar «Guardar Guía» — el
// «＋ Agregar destino» ya le había contestado 403 en el camino.
//
// El guard va en el SERVIDOR, antes de dibujar nada, con el MISMO patrón de
// Multifashion: el middleware solo valida que la sesión EXISTA, así que sin
// esto el formulario le llegaba ya escrito en el HTML. La lista de roles es la
// del POST (`roles-escritura.ts`), no una copia.
//
// ⚠️ El vendedor NO pierde Guías: sigue viéndolas (`src/lib/modules.ts`) en
// solo lectura. Lo que se le cierra es la puerta de crear.
export default async function GuiaNuevaPage() {
  const role = verifySession((await cookies()).get("cxc_session")?.value)?.role ?? null;
  if (!role) redirect("/");
  if (!puedeEscribirGuias(role)) redirect("/guias");

  return <NuevaGuiaClient />;
}
