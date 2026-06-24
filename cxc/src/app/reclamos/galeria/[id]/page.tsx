import { verifyReclamoGalleryToken } from "@/lib/reclamos/gallery-token";
import { getGaleriaReclamo } from "@/lib/reclamos/galeria";
import GaleriaView from "./GaleriaView";

// Pública (exenta de auth en middleware vía /reclamos/galeria/). El acceso lo
// controla el token HMAC por reclamo que viaja en ?t=. Expone SOLO las fotos del
// reclamo — ningún dato financiero. Espejo de marketing/galeria/[cliente].
export const dynamic = "force-dynamic";

function Mensaje({ texto }: { texto: string }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="text-sm text-gray-600">{texto}</p>
    </main>
  );
}

export default async function GaleriaReclamoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t } = await searchParams;
  const reclamoId = decodeURIComponent(id);

  if (!verifyReclamoGalleryToken(reclamoId, t)) {
    return <Mensaje texto="Enlace inválido. Pídele al equipo un enlace nuevo." />;
  }

  const data = await getGaleriaReclamo(reclamoId);
  return <GaleriaView nombre={data.nombre} fotos={data.fotos} />;
}
