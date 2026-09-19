"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { hasModuleAccess } from "@/lib/auth-check";
import { accesoConSemilla } from "@/lib/sesion-semilla";
import { useSemillaSesion } from "@/lib/sesion-semilla-provider";

interface UseAuthOptions {
  moduleKey: string;
  allowedRoles: string[];
}

/**
 * 🔴 EL PRIMER PINTADO YA SABE QUIÉN MIRA (19-sep-2026).
 *
 * 🩸 Hasta hoy `authChecked` arrancaba en `false` y solo pasaba a `true` en un
 * efecto del navegador. Treinta pantallas hacen `if (!authChecked) return
 * null`, así que el HTML del servidor salía VACÍO: blanco, bajar JavaScript,
 * confirmar la sesión, y recién ahí dibujar. Ocho pantallas que ya traían sus
 * datos del servidor los tiraban a la basura igual.
 *
 * Ahora el estado ARRANCA en lo que dice la semilla del servidor (la cookie
 * firmada, leída en el layout raíz — `lib/sesion-semilla.ts`), con la MISMA
 * regla que después aplica el navegador (`tieneAccesoAlModulo`). Con acceso, el
 * servidor manda la pantalla dibujada; sin acceso o sin semilla, `null` como
 * siempre. Nada que dependa del rol se dibuja «por si acaso»: el rol del
 * primer cuadro es el de la cookie, no una suposición.
 *
 * ⚠️ El efecto de abajo NO CAMBIÓ: después de hidratar, `sessionStorage`
 * sigue mandando. Si dice que no (o está vacío: una pestaña nueva), la
 * pantalla vuelve a `null` en ese mismo instante y se redirige como antes.
 */
export function useAuth({ moduleKey, allowedRoles }: UseAuthOptions) {
  const router = useRouter();
  const semilla = useSemillaSesion();
  const segunElServidor = accesoConSemilla(semilla, moduleKey, allowedRoles);
  const [authChecked, setAuthChecked] = useState(segunElServidor);
  const [role, setRole] = useState(segunElServidor && semilla ? semilla.role : "");
  const [isOwner, setIsOwner] = useState(segunElServidor && semilla ? semilla.isOwner : false);

  useEffect(() => {
    const r = sessionStorage.getItem("cxc_role") || "";
    if (!hasModuleAccess(moduleKey, allowedRoles)) {
      // Lo que el servidor haya dibujado se retira YA, antes de redirigir.
      setAuthChecked(false);
      setRole("");
      setIsOwner(false);
      if (r) {
        // User is logged in but doesn't have access — show message briefly
        const div = document.createElement("div");
        div.className = "fixed bottom-6 left-1/2 -translate-x-1/2 bg-red-600 text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-[9999]";
        div.textContent = "No tienes acceso a este modulo";
        document.body.appendChild(div);
        setTimeout(() => { div.remove(); router.push("/home"); }, 2000);
      } else {
        router.push("/");
      }
      return;
    }
    setRole(r);
    setIsOwner(sessionStorage.getItem("fg_is_owner") === "1");
    setAuthChecked(true);
  }, [router, moduleKey, allowedRoles]);

  return { authChecked, role, isOwner };
}
