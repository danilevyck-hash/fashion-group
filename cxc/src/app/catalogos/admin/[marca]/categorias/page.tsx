import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import CategoriasRubroClient from "./CategoriasRubroClient";
import { getMarcaTheme } from "@/lib/catalogo/marcas-ui";
import { verifySession } from "@/lib/session-cookie";
import { puedeEditarRubros } from "@/lib/catalogos/reebok-rubros";

// ─────────────────────────────────────────────────────────────────────────────
// CATÁLOGOS › REEBOK › CATEGORÍAS DEL CATÁLOGO (17-sep-2026).
//
// El mapa `rubro de Switch → categoría del catálogo` dejó de vivir en el código.
// Daniel, preguntado si quería volverlo administrable: **«sí»**.
//
// 🔴 SOLO ADMIN, y el guard va en el SERVIDOR, antes de dibujar nada — el mismo
// patrón que `/catalogos/admin/[marca]`. Cambiar este mapa mueve el cajón de un
// producto y, con él, el bulto que se le cobra al cliente: no es administrar una
// foto.
//
// 🔴 ES DE REEBOK Y DE NADIE MÁS. Cada marca clasifica distinto —Tommy y Calvin
// sacan el género de la DESCRIPCIÓN, Reebok del rubro y el subrubro— así que una
// pantalla compartida sería el mismo error que un mapa compartido. Cualquier
// otra marca cae en 404.
// ─────────────────────────────────────────────────────────────────────────────
export const dynamic = "force-dynamic";

/** La única marca que tiene mapa de rubros. */
const MARCA_CON_RUBROS = "reebok";

export default async function CategoriasReebokPage({ params }: { params: { marca: string } }) {
  const role = verifySession((await cookies()).get("cxc_session")?.value)?.role ?? null;
  if (!role) redirect("/");

  const theme = getMarcaTheme(params.marca);
  if (!theme || theme.marca !== MARCA_CON_RUBROS) notFound();

  if (!puedeEditarRubros(role)) redirect("/home");
  return <CategoriasRubroClient />;
}
