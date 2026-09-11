import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import PedidosListClient from "@/components/catalogo/PedidosListClient";
import { getMarcaTheme } from "@/lib/catalogo/marcas-ui";
import { verifySession } from "@/lib/session-cookie";
import { puedeVerComprobantes } from "@/lib/catalogo/roles";

// 🩸 ESTA PÁGINA NO TENÍA GUARD DE SERVIDOR (hasta el 11-sep-2026). Montaba la
// lista y el navegador pedía `GET /orders`, que a quien no está en
// `COMPROBANTES_ROLES` le contesta 403 — y la pantalla se comía el 403 y decía
// «No hay comprobantes aún»: un permiso negado se veía igual que una marca sin
// ventas. Mismo patrón que `/catalogos/admin/[marca]` y `/multifashion`: el
// guard ANTES de dibujar nada, y la lista se DERIVA de `lib/catalogo/roles.ts`.
export const dynamic = "force-dynamic";

export default async function PedidosPage({ params }: { params: { marca: string } }) {
  const role = verifySession((await cookies()).get("cxc_session")?.value)?.role ?? null;
  if (!role) redirect("/");
  if (!puedeVerComprobantes(role)) redirect("/home");

  const theme = getMarcaTheme(params.marca);
  if (!theme) notFound();
  return <PedidosListClient marca={theme.marca} />;
}
