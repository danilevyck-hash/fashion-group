"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LA PANTALLA DE «NO EXISTE», EN ESPAÑOL Y CON SALIDA (17-sep-2026).
//
// 🩸 Hasta hoy NO había un solo `not-found.tsx` en todo `src/app` (medido el
// 6-sep-2026, `docs/mapas/rutas.md` › C). Quien escribía mal una dirección —o
// recortaba una intermedia: `/catalogos`, `/catalogo`, `/productos`, `/g`— veía
// el 404 de Next: una pantalla en blanco que dice «This page could not be
// found». En inglés, sin decir qué pasó y sin un solo enlace para salir.
//
// 🔴 «IR AL INICIO» ES LA CASA DEL ROL, NO `/home` A SECAS. Bodega, Jennifer
// (`gerente_acs`) y David (`gerente_boston`) tienen un módulo y `/home` los
// rebota: mandarlos ahí es dejarlos en el mismo callejón. La regla vive en
// `lib/navegacion/casa-del-rol.ts`, la MISMA que usa el redirect de `/home`.
//
// ⚠️ «Volver» solo se dibuja si hay a dónde volver (`history.length > 1`): un
// botón que no hace nada es peor que no tenerlo.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { casaDelRol, INICIO } from "@/lib/navegacion/casa-del-rol";

export default function NotFound() {
  const router = useRouter();
  const [casa, setCasa] = useState(INICIO);
  const [hayAtras, setHayAtras] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let modulos: string[] | null = null;
    try {
      const guardados = sessionStorage.getItem("fg_modules");
      if (guardados) modulos = JSON.parse(guardados);
    } catch {
      /* sin permisos de sessionStorage: se cae al Inicio de siempre */
    }
    let rol = "";
    try {
      rol = sessionStorage.getItem("cxc_role") || "";
    } catch {
      /* ídem */
    }
    setCasa(casaDelRol(rol, modulos));
    setHayAtras(window.history.length > 1);
  }, []);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-semibold text-gray-900 mb-2">Esta pantalla no existe</h1>
        <p className="text-sm text-gray-500 mb-6">
          Puede que la dirección esté mal escrita, o que la pantalla se haya movido a otro lugar.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => router.push(casa)}
            className="min-h-[44px] bg-black text-white text-sm font-medium px-6 rounded-md active:scale-[0.97] transition-all"
          >
            Ir al inicio
          </button>
          {hayAtras && (
            <button
              onClick={() => router.back()}
              className="min-h-[44px] border border-gray-200 text-gray-700 text-sm font-medium px-6 rounded-md hover:bg-gray-50 active:scale-[0.97] transition-all"
            >
              Volver
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
