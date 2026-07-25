import { notFound } from "next/navigation";
import ProductoDetalleClient from "@/components/catalogo/ProductoDetalleClient";
import { getMarcaTheme } from "@/lib/catalogo/marcas-ui";

export default function ProductoDetallePage({ params }: { params: { marca: string } }) {
  const theme = getMarcaTheme(params.marca);
  if (!theme) notFound();
  return <ProductoDetalleClient marca={theme.marca} />;
}
