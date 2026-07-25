import { notFound } from "next/navigation";
import CheckoutClient from "@/components/catalogo/CheckoutClient";
import { getMarcaTheme } from "@/lib/catalogo/marcas-ui";

// Checkout único del catálogo (el guard vive en el layout de /catalogo/[marca]).
export default function CheckoutPage({ params }: { params: { marca: string } }) {
  const theme = getMarcaTheme(params.marca);
  if (!theme) notFound();
  return <CheckoutClient marca={theme.marca} />;
}
