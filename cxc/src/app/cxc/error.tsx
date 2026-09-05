"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LA PANTALLA DE ERROR DE CUENTAS POR COBRAR.
//
// 🩸 QUÉ MOSTRABA HASTA EL 5-sep-2026. El MENSAJE CRUDO del error y su STACK
// TRACE completo, en rojo, en pantalla. Era la única del sistema que lo hacía.
// A la secretaria le decía cosas como `TypeError: Cannot read properties of
// undefined (reading 'd91_120')` —que no le dice qué hacer— y de paso publicaba
// nombres de tablas, de columnas y rutas internas del servidor a cualquiera que
// abriera el módulo, incluido un vendedor.
//
// Lo que se ve ahora: qué pasó, qué significa (los datos NO se perdieron: esta
// pantalla solo LEE) y qué hacer. El detalle técnico va a la consola y a Sentry,
// que es donde sirve.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import Link from "next/link";

export default function CxcError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // El detalle vive acá y en Sentry, no en la cara de quien está cobrando.
    console.error("[cxc] error de pantalla:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-6 text-center">
      <div className="text-amber-500 text-4xl" aria-hidden>⚠</div>
      <h2 className="text-lg font-semibold text-gray-800">
        No se pudo mostrar Cuentas por Cobrar
      </h2>
      <p className="text-sm text-gray-600 max-w-sm">
        Fue un problema al leer los datos. No se perdió nada: esta pantalla solo
        consulta saldos, no los modifica.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={reset}
          className="text-sm bg-black text-white px-5 min-h-[44px] rounded-md hover:bg-gray-800 active:scale-[0.97] transition-all"
        >
          Intentar de nuevo
        </button>
        <Link
          href="/home"
          className="text-sm border border-gray-300 text-gray-700 px-5 min-h-[44px] inline-flex items-center rounded-md hover:bg-gray-50 active:scale-[0.97] transition-all"
        >
          Ir al inicio
        </Link>
      </div>
      <p className="text-xs text-gray-400 max-w-sm">
        Si vuelve a pasar, avísale a Daniel
        {error.digest ? <> y dile este código: <span className="font-mono">{error.digest}</span></> : null}.
      </p>
    </div>
  );
}
