import { notFound } from "next/navigation";
import ConfirmacionClient from "@/components/catalogo/ConfirmacionClient";
import { getMarcaTheme } from "@/lib/catalogo/marcas-ui";

export default function ConfirmacionPage({ params }: { params: { marca: string; id: string } }) {
  const theme = getMarcaTheme(params.marca);
  if (!theme) notFound();
  return <ConfirmacionClient marca={theme.marca} orderId={params.id} />;
}
