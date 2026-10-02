"use client";

// ─────────────────────────────────────────────────────────────────────────────
// EL NOMBRE DE LA PERSONA EN PANTALLA: «Daniel Levy», no «daniel» (2-oct-2026).
//
// 🩸 El avatar, la hoja de la cuenta y el pie del menú decían «daniel»: es el
// usuario de LOGIN (`fg_user_name`). El nombre visible es
// `fg_users.nombre_completo`, que da `/api/auth/perfil` (el mismo del saludo del
// Inicio), y se escribe con `capitalizarNombre` (`nombre-en-pantalla.ts`).
// Sin nombre completo, o sin red, queda el de login, capitalizado.
//
// ⚠️ Solo para MOSTRAR. Lo que se guarda con el nombre (visitas, pedidos) sigue
// usando `fg_user_name`.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { capitalizarNombre } from "@/lib/nombre-en-pantalla";

/** Donde queda el nombre completo, una vez por pestaña (lo comparte el Inicio). */
export const CLAVE_NOMBRE_VISIBLE = "fg_user_display_name";

export function useNombreVisible(): string {
  const [nombre, setNombre] = useState("");
  useEffect(() => {
    let login = "";
    let guardado = "";
    try {
      login = sessionStorage.getItem("fg_user_name") || "";
      guardado = sessionStorage.getItem(CLAVE_NOMBRE_VISIBLE) || "";
    } catch { /* sin memoria */ }
    setNombre(guardado || login);
    if (guardado || !login) return;
    let vivo = true;
    fetch("/api/auth/perfil", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { displayName?: string } | null) => {
        if (!vivo || !j?.displayName) return;
        setNombre(j.displayName);
        try { sessionStorage.setItem(CLAVE_NOMBRE_VISIBLE, j.displayName); } catch { /* sin memoria */ }
      })
      .catch(() => { /* sin red: queda el de login */ });
    return () => { vivo = false; };
  }, []);
  return capitalizarNombre(nombre);
}
