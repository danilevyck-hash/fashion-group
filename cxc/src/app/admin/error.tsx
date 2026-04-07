"use client";

import { useEffect } from "react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin page error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-6">
      <div className="text-red-500 text-4xl">⚠</div>
      <h2 className="text-lg font-semibold text-gray-800">Error en CXC</h2>
      <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 max-w-lg w-full">
        <p className="text-sm text-red-700 font-mono break-all">{error.message}</p>
        {error.stack && (
          <pre className="text-[10px] text-red-500 mt-2 overflow-auto max-h-40 whitespace-pre-wrap">{error.stack}</pre>
        )}
      </div>
      <button
        onClick={reset}
        className="text-sm bg-black text-white px-5 py-2.5 rounded-md hover:bg-gray-800 active:scale-[0.97] transition-all"
      >
        Reintentar
      </button>
    </div>
  );
}
