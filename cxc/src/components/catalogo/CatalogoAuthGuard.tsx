"use client";

// Guard del catálogo con sesión (único para todas las marcas — los guards
// gemelos de Reebok/Joybees eran idénticos byte a byte).
//
// 🩸 MIRA `fg_modules`, NO EL ROL, y eso tenía una consecuencia: un módulo
// PRESTADO (`MODULO_HEREDA_PERMISO_DE`) se pinta en el menú y esta pantalla lo
// rebotaba a `/`. Le pasó a David el 27-ago-2026: su fila de `role_permissions`
// dice `["boston"]`, así que hasta que corra la DDL su `catalogos` es prestado.
// Se pregunta con `fgModulesDaAcceso`, la MISMA regla del menú, en vez de un
// `includes` a mano — con dos reglas, el menú ofrece lo que la página rechaza.
//
// ⚠️ La conducta de todos los demás NO cambia: admin, secretaria, vendedor y
// bodega tienen `catalogos` DIRECTO en la lista guardada, y el permiso directo
// sigue mandando sin mirar roles (es lo que un admin asignó a mano).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fgModulesDaAcceso } from "@/lib/modules";

export default function CatalogoAuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    try {
      const mods = sessionStorage.getItem("fg_modules");
      const role = sessionStorage.getItem("cxc_role") || "";
      if (mods) {
        const arr = JSON.parse(mods);
        if (Array.isArray(arr) && fgModulesDaAcceso(arr, "catalogos", role)) {
          setAuthorized(true);
          return;
        }
      }
    } catch { /* */ }
    router.push("/");
  }, [router]);

  if (!authorized) return null;
  return <>{children}</>;
}
