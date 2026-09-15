"use client";

import { useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { Modal } from "@/components/ui";

// ─────────────────────────────────────────────────────────────────────────────
// CAMBIAR MI CONTRASEÑA — la ventana y el botón que la abre (14-sep-2026).
//
// Daniel: *«has que todos los usuarios puedan cambiar su contraseña»*. Vive al
// lado del nombre en los TRES lugares donde ya estaba «Salir»: el encabezado de
// escritorio, el cajón del teléfono y el pie de la barra lateral (y en /home,
// que tiene su propio encabezado). Es para TODOS los roles.
//
// Lo que decide está en el servidor (`PUT /api/auth/contrasena`): que la actual
// sea la de hoy, que la nueva no sea la de otra persona («Crea otra, esa no se
// puede»), y que se cierren las otras sesiones. Acá solo se pide y se dice.
// ─────────────────────────────────────────────────────────────────────────────

const MINIMO = 8;

export function CambiarContrasenaModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetir, setRepetir] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [listo, setListo] = useState<{ sesionesCerradas: number } | null>(null);

  function cerrar() {
    setActual(""); setNueva(""); setRepetir(""); setVer(false); setError(""); setListo(null);
    onClose();
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (nueva.trim().length < MINIMO) { setError(`La nueva tiene que tener al menos ${MINIMO} caracteres.`); return; }
    if (nueva !== repetir) { setError("Las dos nuevas no coinciden."); return; }
    setGuardando(true);
    try {
      const res = await fetch("/api/auth/contrasena", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actual, nueva }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "No se pudo guardar. Intenta de nuevo en unos segundos."); return; }
      setListo({ sesionesCerradas: Number(data.sesionesCerradas) || 0 });
    } catch {
      setError("Sin conexión. Verifica tu internet e intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  const campo = "w-full border border-gray-300 rounded-md px-3 py-3 text-base sm:text-sm focus:outline-none focus:border-black";

  return (
    <Modal open={open} onClose={cerrar} title="Cambiar mi contraseña">
      {listo ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-800">Listo, contraseña cambiada.</p>
          {listo.sesionesCerradas > 0 && (
            <p className="text-sm text-gray-600">
              {listo.sesionesCerradas === 1
                ? "Cerramos tu otra sesión abierta: ahí tendrás que entrar con la nueva."
                : `Cerramos tus otras ${listo.sesionesCerradas} sesiones abiertas: ahí tendrás que entrar con la nueva.`}
            </p>
          )}
          <button type="button" onClick={cerrar} className="w-full min-h-[44px] bg-black text-white rounded-md text-sm font-medium active:scale-[0.97] transition">
            Entendido
          </button>
        </div>
      ) : (
        <form onSubmit={guardar} className="space-y-3">
          <label className="block">
            <span className="block text-xs text-gray-500 mb-1">Contraseña actual</span>
            <input type={ver ? "text" : "password"} value={actual} onChange={(e) => { setActual(e.target.value); setError(""); }}
              className={campo} autoCapitalize="none" autoCorrect="off" autoComplete="current-password" disabled={guardando} />
          </label>
          <label className="block">
            <span className="block text-xs text-gray-500 mb-1">Nueva contraseña (mínimo {MINIMO} caracteres)</span>
            <input type={ver ? "text" : "password"} value={nueva} onChange={(e) => { setNueva(e.target.value); setError(""); }}
              className={campo} autoCapitalize="none" autoCorrect="off" autoComplete="new-password" disabled={guardando} />
          </label>
          <label className="block">
            <span className="block text-xs text-gray-500 mb-1">Repite la nueva</span>
            <input type={ver ? "text" : "password"} value={repetir} onChange={(e) => { setRepetir(e.target.value); setError(""); }}
              className={campo} autoCapitalize="none" autoCorrect="off" autoComplete="new-password" disabled={guardando} />
          </label>
          <button type="button" onClick={() => setVer(!ver)} className="min-h-[44px] px-1 text-xs text-gray-500 hover:text-gray-800 transition">
            {ver ? "Ocultar contraseñas" : "Ver contraseñas"}
          </button>
          <p className="text-xs text-gray-500">
            Con la nueva entras solo tú: si ya la usa otra persona, te pedimos otra.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={cerrar} disabled={guardando}
              className="flex-1 min-h-[44px] border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 transition">
              Cerrar
            </button>
            <button type="submit" disabled={guardando}
              className="flex-1 min-h-[44px] bg-black text-white rounded-md text-sm font-medium active:scale-[0.97] transition disabled:opacity-50">
              {guardando ? "Guardando…" : "Guardar contraseña"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/**
 * El botón que abre la ventana. 44×44 al tacto, como «Salir».
 * `variante="icono"` (llave, escritorio) o `"texto"` («Contraseña», cajón y home).
 */
export function BotonCambiarContrasena({ variante = "icono", className = "" }: { variante?: "icono" | "texto"; className?: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      {variante === "icono" ? (
        <button type="button" onClick={() => setAbierto(true)} title="Cambiar mi contraseña" aria-label="Cambiar mi contraseña"
          className={`inline-flex h-11 w-11 items-center justify-center text-gray-300 hover:text-gray-600 transition ${className}`}>
          <KeyRound size={14} strokeWidth={2} />
        </button>
      ) : (
        <button type="button" onClick={() => setAbierto(true)}
          className={`min-h-[44px] min-w-[44px] flex items-center justify-center text-xs text-gray-400 hover:text-black transition ${className}`}>
          Contraseña
        </button>
      )}
      <CambiarContrasenaModal open={abierto} onClose={() => setAbierto(false)} />
    </>
  );
}
