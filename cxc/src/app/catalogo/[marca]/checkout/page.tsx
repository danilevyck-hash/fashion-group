import { notFound } from "next/navigation";
import CheckoutClient from "@/components/catalogo/CheckoutClient";
import { getMarcaTheme } from "@/lib/catalogo/marcas-ui";
import { CATALOGOS_APPLE_2026_10_B } from "@/lib/catalogo/catalogos-2026-10-b";
import { CATALOGOS_APPLE_V2_2026_10 } from "@/lib/catalogo/catalogos-2026-10-v2";

// Checkout único del catálogo (el guard vive en el layout de /catalogo/[marca]).
export default function CheckoutPage({ params }: { params: { marca: string } }) {
  const theme = getMarcaTheme(params.marca);
  if (!theme) notFound();
  return <CheckoutClient marca={theme.marca} tituloEnLaBarra={CATALOGOS_APPLE_2026_10_B.subpaginasInternas}
    listaAgrupada={CATALOGOS_APPLE_2026_10_B.subpaginasInternas} v2={CATALOGOS_APPLE_V2_2026_10} />;
}
