import { notFound } from "next/navigation";
import PedidoDetalleClient from "@/components/catalogo/PedidoDetalleClient";
import { getMarcaTheme } from "@/lib/catalogo/marcas-ui";

export default function PedidoDetallePage({ params }: { params: { marca: string } }) {
  const theme = getMarcaTheme(params.marca);
  if (!theme) notFound();
  return <PedidoDetalleClient marca={theme.marca} />;
}
