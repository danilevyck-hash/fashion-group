import ProveedorDetail from "./ProveedorDetail";

export const dynamic = "force-dynamic";

export default function ProveedorFichaPage({ params }: { params: { key: string } }) {
  return <ProveedorDetail fichaKey={params.key} />;
}
