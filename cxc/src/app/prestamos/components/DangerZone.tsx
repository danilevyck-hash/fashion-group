"use client";

import { useState } from "react";

interface Props {
  isAdmin: boolean;
  isAdminOrDirector: boolean;
  activo: boolean;
  saldo: number;
  hasMovs: boolean;
  role: string;
  onDeleteEmployee: () => void;
  onClearHistory: () => void;
  onForceArchive: () => void;
}

export default function DangerZone({
  isAdmin,
  isAdminOrDirector,
  activo,
  saldo,
  hasMovs,
  role,
  onDeleteEmployee,
  onClearHistory,
  onForceArchive,
}: Props) {
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

  return (
    <div className="mt-12">
      {isAdmin && (
        <>
          <button onClick={() => setDangerOpen(!dangerOpen)} className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 transition">
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
                {/* Delete Employee */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-red-700">Eliminar Empleado</div>
                    <div className="text-xs text-red-400">Elimina permanentemente al empleado y todos sus datos</div>
                  </div>
                  <button
                    onClick={onDeleteEmployee}
                    disabled={hasMovs}
                    title={hasMovs ? "Debes borrar todos los movimientos primero" : ""}
                    className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    <TrashIcon />
                    Eliminar
                  </button>
                </div>

                {/* Clear History */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-red-700">Borrar Todo el Historial</div>
                    <div className="text-xs text-red-400">Elimina todos los movimientos pero mantiene al empleado</div>
                  </div>
                  <button
                    onClick={onClearHistory}
                    disabled={!hasMovs}
                    className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    <WarnIcon />
                    Borrar Historial
                  </button>
                </div>

                {/* Force Archive (admin) */}
                {isAdminOrDirector && activo && saldo > 0 && (
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-red-700">Forzar Archivado</div>
                      <div className="text-xs text-red-400">Archiva aunque tenga saldo pendiente (salida de empresa)</div>
                    </div>
                    <button
                      onClick={onForceArchive}
                      className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition flex items-center gap-1.5"
                    >
                      <WarnIcon />
                      Forzar Archivado
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Force Archive for director (outside danger zone) */}
      {role === "director" && !isAdmin && activo && saldo > 0 && (
        <div className="border border-red-200 bg-red-50/50 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-red-700">Forzar Archivado</div>
              <div className="text-xs text-red-400">Archiva aunque tenga saldo pendiente (salida de empresa)</div>
            </div>
            <button onClick={onForceArchive} className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition">
              Forzar Archivado
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
