"use client";

import { useState } from "react";

/**
 * 🩸 SE FUE «FORZAR ARCHIVADO». Existía porque «Archivar» solo se podía tocar
 * con el saldo EXACTAMENTE en 0, así que para archivar a alguien que se fue
 * debiendo había que abrir esta zona — y solo un admin podía. Con la bandera
 * `activo` retirada (5-sep-2026) no hay nada que archivar: quien llega a cero
 * sale solo de la lista, y quien se fue debiendo aparece marcado «ya no
 * trabaja».
 *
 * ⚠️ «Eliminar Todo el Historial» se queda, pero ya NO es un hard delete: el
 * servidor hace soft delete y lo registra en `activity_logs`. Era el único
 * `.delete()` real del repo, en la tabla de plata, y sin auditoría.
 */
interface Props {
  isAdmin: boolean;
  hasMovs: boolean;
  onDeleteEmployee: () => void;
  onClearHistory: () => void;
}

export default function DangerZone({ isAdmin, hasMovs, onDeleteEmployee, onClearHistory }: Props) {
  const [dangerOpen, setDangerOpen] = useState(false);

  const TrashIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    </svg>
  );

  const WarnIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  );

  if (!isAdmin) return <div className="mt-12" />;

  return (
    <div className="mt-12">
      <button onClick={() => setDangerOpen(!dangerOpen)} className="flex min-h-[44px] items-center gap-2 text-xs text-gray-400 hover:text-gray-600 transition">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        Zona de acciones peligrosas
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${dangerOpen ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {dangerOpen && (
        <div className="border border-red-200 bg-red-50/50 rounded-lg p-6 mt-2">
          <div className="space-y-3">
            {/* Eliminar la ficha */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-red-700">Eliminar ficha</div>
                <div className="text-xs text-red-400">La saca del módulo. Los movimientos quedan guardados.</div>
              </div>
              <button
                onClick={onDeleteEmployee}
                disabled={hasMovs}
                title={hasMovs ? "Primero hay que borrar los movimientos" : ""}
                className="px-4 min-h-[44px] bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                <TrashIcon />
                Eliminar
              </button>
            </div>

            {/* Borrar el historial */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-red-700">Eliminar todo el historial</div>
                <div className="text-xs text-red-400">Borra todos los movimientos y deja la ficha. Queda registrado quién y cuándo.</div>
              </div>
              <button
                onClick={onClearHistory}
                disabled={!hasMovs}
                className="px-4 min-h-[44px] bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                <WarnIcon />
                Eliminar historial
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
