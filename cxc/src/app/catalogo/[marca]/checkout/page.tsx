import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import CheckoutClient from "@/components/catalogo/CheckoutClient";
import { getMarcaTheme } from "@/lib/catalogo/marcas-ui";
import { CATALOGOS_APPLE_2026_10_B } from "@/lib/catalogo/catalogos-2026-10-b";
import { CATALOGOS_APPLE_V2_2026_10 } from "@/lib/catalogo/catalogos-2026-10-v2";
import { VENDEDOR_PUESTO_2026_11 } from "@/lib/catalogo/reebok-catalogo-2026-11";
import { leerMiVendedor, type MiVendedor } from "@/lib/catalogo/mi-vendedor";
import { puedePedir } from "@/lib/catalogo/roles";
import { verifySession } from "@/lib/session-cookie";

/**
 * 🔴 reebok-cat-03 (15-nov-2026): el vendedor del login se resuelve AQUÍ, en el
 * servidor, para que «Confirmar pedido» abra con él puesto y sin «Cargando…».
 * Falla ABIERTA: cualquier tropiezo devuelve `undefined` y la pantalla lo
 * pregunta desde el navegador, como antes (y sin dato, «Seleccionar»).
 */
async function vendedorDelServidor(empresa: string): Promise<MiVendedor | null | undefined> {
  if (!VENDEDOR_PUESTO_2026_11) return undefined;
  try {
    const s = verifySession(cookies().get("cxc_session")?.value);
    if (!s?.userId) return undefined;
    if (!puedePedir(s)) return undefined;
    return await leerMiVendedor(s.userId, empresa);
  } catch {
    return undefined;
  }
}

// Checkout único del catálogo (el guard vive en el layout de /catalogo/[marca]).
export default async function CheckoutPage({ params }: { params: { marca: string } }) {
  const theme = getMarcaTheme(params.marca);
  if (!theme) notFound();
  const vendedorInicial = await vendedorDelServidor(theme.empresaKey);
  return <CheckoutClient marca={theme.marca} tituloEnLaBarra={CATALOGOS_APPLE_2026_10_B.subpaginasInternas}
    listaAgrupada={CATALOGOS_APPLE_2026_10_B.subpaginasInternas} v2={CATALOGOS_APPLE_V2_2026_10}
    vendedorInicial={vendedorInicial} />;
}
