"use client";

import { Empleado } from "./types";

interface Props {
  empleado: Empleado;
  saldo: number;
  onEdit: () => void;
  onToggleArchive: () => void;
  onBack: () => void;
}

export default function EmpleadoHeader({ empleado, saldo, onEdit, onToggleArchive, onBack }: Props) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-xl font-light">{empleado.nombre}</h1>
        <div className="flex items-center gap-2 mt-1">
          {empleado.empresa && <span className="text-sm text-gray-500">{empleado.empresa}</span>}
          <span className={`text-xs px-2 py-0.5 rounded-full ${empleado.activo ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
            {empleado.activo ? "Activo" : "Archivado"}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={onEdit} className="border border-gray-200 px-4 py-2 rounded-full text-sm hover:border-gray-400 transition">Editar</button>
        {empleado.activo && saldo === 0 && (
          <button onClick={onToggleArchive} className="border border-gray-200 px-4 py-2 rounded-full text-sm hover:border-gray-400 transition">Archivar</button>
        )}
        {!empleado.activo && (
          <button onClick={onToggleArchive} className="border border-gray-200 px-4 py-2 rounded-full text-sm hover:border-gray-400 transition">Reactivar</button>
        )}
        <button onClick={onBack} className="border border-gray-200 px-4 py-2 rounded-full text-sm hover:border-gray-400 transition">Volver</button>
      </div>
    </div>
  );
}
