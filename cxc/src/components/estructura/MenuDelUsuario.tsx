"use client";

// El botón del usuario de la estructura estilo Apple (1-oct-2026,
// `ESTRUCTURA_APPLE_2026_10`): inicial y nombre; al tocarlo abre «Cambiar
// contraseña» y «Cerrar sesión». Reemplaza la llave y el botón de salir sueltos.
// Cerrar sesión hace lo MISMO que hoy: espera el DELETE de /api/auth, limpia la
// pestaña y vuelve al login.

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CambiarContrasenaModal } from "@/components/CambiarContrasena";
import DesplegableFlotante from "@/components/ui/DesplegableFlotante";
import { etiquetaDeRol } from "@/lib/roles-etiquetas";
import { OPCIONES_DEL_USUARIO } from "@/lib/navegacion/estructura-2026-10";

export default function MenuDelUsuario({ nombre, rol }: { nombre: string; rol: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [contrasena, setContrasena] = useState(false);
  const cerrar = useCallback(() => setAbierto(false), []);
  const botonRef = useRef<HTMLButtonElement>(null);

  async function cerrarSesion() {
    try { await fetch("/api/auth", { method: "DELETE" }); } catch { /* sin red: igual se sale localmente */ }
    sessionStorage.clear();
    router.push("/");
  }

  const acciones: Record<(typeof OPCIONES_DEL_USUARIO)[number], () => void> = {
    "Cambiar contraseña": () => { setAbierto(false); setContrasena(true); },
    "Cerrar sesión": () => { setAbierto(false); void cerrarSesion(); },
  };

  if (!nombre) return null;
  const primerNombre = nombre.split(" ")[0];

  return (
    <div className="relative flex-shrink-0" data-menu-usuario>
      <button
        ref={botonRef}
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        className="flex min-h-[44px] items-center gap-2 rounded-full pl-1 pr-2 text-sm text-gray-700 transition hover:bg-gray-50"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-medium uppercase text-gray-600">
          {nombre[0]}
        </span>
        <span className="font-medium capitalize">{primerNombre}</span>
      </button>
      {/* Flota en un portal: la barra de arriba se corre con `transform`, y un
          panel `absolute`/`fixed` adentro quedaría atrapado en ella. */}
      <DesplegableFlotante abierto={abierto} anclaRef={botonRef} onCerrar={cerrar} alinear="derecha" ancho={224} role="menu" marca="menu-del-usuario" className="rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
        <div className="border-b border-gray-100 px-3 py-2">
          <div className="truncate text-sm font-medium capitalize text-gray-900">{nombre}</div>
          <div className="text-xs text-gray-500">{etiquetaDeRol(rol)}</div>
        </div>
        {OPCIONES_DEL_USUARIO.map((op) => (
          <button
            key={op}
            type="button"
            role="menuitem"
            onClick={acciones[op]}
            className="flex min-h-[44px] w-full items-center px-3 text-left text-sm text-gray-700 transition hover:bg-gray-50"
          >
            {op}
          </button>
            ))}
      </DesplegableFlotante>
      <CambiarContrasenaModal open={contrasena} onClose={() => setContrasena(false)} />
    </div>
  );
}
