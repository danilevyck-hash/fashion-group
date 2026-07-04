import ConfirmacionClient from "@/components/catalogo/ConfirmacionClient";

export default function ReebokConfirmacionPage({ params }: { params: { id: string } }) {
  return <ConfirmacionClient marca="reebok" orderId={params.id} />;
}
