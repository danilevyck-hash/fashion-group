import { verifyGalleryToken } from "@/lib/marketing/gallery-token";
import { getGaleriaCliente } from "@/lib/marketing/galeria";
import GaleriaView from "./GaleriaView";

// Pública (exenta de auth en middleware). El acceso lo controla el token HMAC
// por cliente que viaja en ?t=. Re-firma las fotos en cada carga (sin expiración
// de links). Expone SOLO las fotos del cliente — ningún dato financiero.
export const dynamic = "force-dynamic";

function Mensaje({ texto }: { texto: string }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="text-sm text-gray-600">{texto}</p>
    </main>
  );
}

export default async function GaleriaPage({
  params,
  searchParams,
}: {
  params: Promise<{ cliente: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { cliente } = await params;
  const { t } = await searchParams;
  const codigo = decodeURIComponent(cliente);

  if (!verifyGalleryToken(codigo, t)) {
    return <Mensaje texto="Enlace inválido. Pídele al equipo un enlace nuevo." />;
  }

  const data = await getGaleriaCliente(codigo);
  return <GaleriaView nombre={data.nombre} fotos={data.fotos} />;
}
