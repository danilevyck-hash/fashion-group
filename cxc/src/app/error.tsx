"use client";

// Error boundary raíz (PWA simplificada). Dos funciones:
//   1. ChunkLoadError tras un deploy → recovery automática una-sola-vez
//      (chunk-recovery.ts). Mientras recarga no se muestra nada alarmante.
//   2. Cualquier otro error (o recovery ya agotada) → mensaje simple en
//      español con botón de recarga manual.

import { useEffect, useState } from "react";
import { isChunkError, attemptChunkRecovery } from "@/lib/chunk-recovery";

export default function Error({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (isChunkError(error?.message) && attemptChunkRecovery()) {
      setRecovering(true);
    }
  }, [error]);

  if (recovering) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <p className="text-sm text-gray-500">Actualizando la aplicación…</p>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Algo salió mal</h2>
        <p className="text-sm text-gray-600 mb-5">Recarga la página para continuar.</p>
        <button
          onClick={() => window.location.reload()}
          className="bg-black text-white text-sm font-medium px-6 py-2.5 rounded-md active:scale-[0.97] transition-all"
        >
          Recargar
        </button>
      </div>
    </div>
  );
}
