"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL MENÚ DEL USUARIO EN EL CELULAR: UN AVATAR CON LA INICIAL (2-oct-2026,
// `TAB_BAR_2026_10`).
//
// Con la barra de pestañas el ☰ redondo se fue y Daniel preguntó dónde quedan
// «Cambiar contraseña» y «Cerrar sesión». Como en las apps de Apple (App Store,
// Fotos): un avatar redondo con la inicial, arriba a la derecha, en la línea del
// título del módulo y en el Inicio. Al tocarlo sube una hoja de vidrio con el
// nombre, el rol y las dos opciones. Gerente Multifashion y Marcación, que no
// tienen barra, también lo usan: ya no les hace falta el ☰.
//
// 🔴 Cerrar sesión hace lo MISMO que hoy: espera el DELETE de /api/auth, limpia
// la pestaña y vuelve al login. En la computadora no se dibuja (`sm:hidden`):
// ahí sigue el botón con el nombre (`MenuDelUsuario`).
//
// `flotante`: se pinta en un portal sobre `body`, arriba a la derecha de la
// página, y se va con el dedo junto con el título. La fila del título le deja
// sitio con `data-fila-del-avatar` (regla en `globals.css`).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { CambiarContrasenaModal } from "@/components/CambiarContrasena";
import { CLASE_FILA_MENU, HojaMenu } from "@/components/celular/BarraDeControles";
import { etiquetaDeRol } from "@/lib/roles-etiquetas";
import { OPCIONES_DEL_USUARIO } from "@/lib/navegacion/estructura-2026-10";

/** La clase que avisa a la fila del título que el avatar está arriba a la derecha. */
export const CLASE_BODY_CON_AVATAR = "fg-con-avatar";

export default function AvatarDelUsuario({
  nombre,
  rol,
  flotante = false,
  extra,
}: {
  nombre: string;
  rol: string;
  flotante?: boolean;
  /** Acciones del módulo que vivían en el ☰ (Multifashion «Actualizar ahora»), para quien no tiene barra. */
  extra?: ReactNode;
}) {
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [contrasena, setContrasena] = useState(false);
  const cerrar = useCallback(() => setAbierta(false), []);

  useEffect(() => {
    if (!flotante || !nombre) return;
    document.body.classList.add(CLASE_BODY_CON_AVATAR);
    return () => document.body.classList.remove(CLASE_BODY_CON_AVATAR);
  }, [flotante, nombre]);

  async function cerrarSesion() {
    try { await fetch("/api/auth", { method: "DELETE" }); } catch { /* sin red: igual se sale localmente */ }
    sessionStorage.clear();
    router.push("/");
  }

  const acciones: Record<(typeof OPCIONES_DEL_USUARIO)[number], () => void> = {
    "Cambiar contraseña": () => { setAbierta(false); setContrasena(true); },
    "Cerrar sesión": () => { setAbierta(false); void cerrarSesion(); },
  };

  if (!nombre) return null;
  const inicial = nombre.trim()[0]?.toUpperCase() ?? "";

  const boton = (
    <button
      type="button"
      data-avatar-usuario
      onClick={() => setAbierta(true)}
      aria-label={`Tu cuenta: ${nombre}`}
      aria-haspopup="dialog"
      aria-expanded={abierta}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-[0.97] sm:hidden ${flotante ? "absolute z-20" : ""}`}
      style={flotante ? { top: "calc(env(safe-area-inset-top, 0px) + 4px)", right: 12 } : undefined}
    >
      <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-[15px] font-semibold text-gray-700">
        {inicial}
      </span>
    </button>
  );

  return (
    <>
      {flotante ? (typeof document === "undefined" ? null : createPortal(boton, document.body)) : boton}
      <HojaMenu abierta={abierta} onCerrar={cerrar} etiqueta="Tu cuenta">
        <div data-hoja-avatar className="flex items-center gap-3 px-1">
          <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gray-200 text-lg font-semibold text-gray-700">
            {inicial}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[17px] font-semibold capitalize text-gray-900">{nombre}</div>
            <div className="text-[13px] text-gray-500">{etiquetaDeRol(rol)}</div>
          </div>
        </div>
        {extra}
        {OPCIONES_DEL_USUARIO.map((op) => (
          <button
            key={op}
            type="button"
            onClick={acciones[op]}
            className={`${CLASE_FILA_MENU} ${op === "Cerrar sesión" ? "!text-red-600" : ""}`}
          >
            {op}
          </button>
        ))}
      </HojaMenu>
      <CambiarContrasenaModal open={contrasena} onClose={() => setContrasena(false)} />
    </>
  );
}
