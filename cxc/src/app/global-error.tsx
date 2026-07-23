"use client";

// Error boundary GLOBAL (cubre errores del propio layout raíz). Debe renderizar
// <html>/<body> propios porque reemplaza el layout completo. Misma lógica que
// error.tsx: ChunkLoadError → recovery una-sola-vez; resto → mensaje simple.

import { useEffect, useState } from "react";
import { isChunkError, attemptChunkRecovery } from "@/lib/chunk-recovery";

export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (isChunkError(error?.message) && attemptChunkRecovery()) {
      setRecovering(true);
    }
  }, [error]);

  return (
    <html lang="es">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          {recovering ? (
            <p style={{ fontSize: 14, color: "#6b7280" }}>Actualizando la aplicación…</p>
          ) : (
            <div style={{ textAlign: "center", maxWidth: 340 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: "#111827", marginBottom: 8 }}>Algo salió mal</h2>
              <p style={{ fontSize: 14, color: "#4b5563", marginBottom: 20 }}>Recarga la página para continuar.</p>
              <button
                onClick={() => window.location.reload()}
                style={{
                  background: "#000",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 500,
                  padding: "10px 24px",
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Recargar
              </button>
            </div>
          )}
        </div>
      </body>
    </html>
  );
}
