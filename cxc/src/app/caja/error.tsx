"use client";

export default function CajaError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4">
      <p className="text-sm text-gray-600 mb-1 font-medium">Error en Caja</p>
      <p className="text-xs text-red-500 mb-4 max-w-md text-center">{error.message}</p>
      <button
        onClick={reset}
        className="text-sm bg-black text-white px-4 py-1.5 rounded-md active:scale-[0.97] transition"
      >
        Reintentar
      </button>
    </div>
  );
}
