import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/session-cookie";
import ReferenciaClient from "./ReferenciaClient";

export const dynamic = "force-dynamic";

// Referencia con ruta propia (12-ago-2026). Daniel: *"habilita referencia para
// los vendedores y bodega"*. Es la MISMA vista del tab Ventas › Referencia —
// el componente se REUSA, no se copia — pero /ventas sigue siendo solo admin:
// este guard abre SOLO esta pantalla. El margen no viaja para vendedor/bodega
// (gate en /api/ventas/referencia, no acá).
const ROLES_REFERENCIA = ["admin", "vendedor", "bodega"];

export default async function ReferenciaPage() {
  const role = verifySession((await cookies()).get("cxc_session")?.value)?.role ?? null;
  if (!role) redirect("/");
  if (!ROLES_REFERENCIA.includes(role)) redirect("/home");

  return (
    // Suspense por useSearchParams (useUrlState en componentes compartidos del
    // header) — mismo patrón que /ventas.
    <Suspense>
      <ReferenciaClient />
    </Suspense>
  );
}
