"use client";

// PRÉSTAMOS — **TODOS**, y es la única excepción del módulo.
//
// 🔴 Daniel lo pidió con esas palabras: «Préstamos (TODOS, no solo los de
// Boston)». Todo lo demás en /boston es de Boston; acá entran las 3 empresas
// que tienen gente con préstamo. Que la excepción esté ESCRITA es lo que impide
// que mañana alguien la "arregle" filtrando por Boston.
//
// ⚠️ SOLO LECTURA, y no por una condición que haya que acordarse de chequear:
// `/api/boston/prestamos` tiene UN solo verbo, GET. No hay nada que gatear
// porque no hay nada que escribir, y la pantalla de Contabilidad no se tocó.

import useSWR from "swr";
import { fmt, fmtDate } from "@/lib/format";

interface EmpleadoPrestamo {
  id: string;
  nombre: string;
  empresa: string;
  deduccionQuincenal: number;
  prestado: number;
  pagado: number;
  saldo: number;
  pct: number;
  ultimoMovimiento: string | null;
}
interface Respuesta {
  empleados: EmpleadoPrestamo[];
  totales: { personas: number; conSaldo: number; saldo: number };
}

const fetcher = (u: string) =>
  fetch(u, { cache: "no-store" }).then((r) => {
    if (!r.ok) throw new Error("No se pudieron leer los préstamos");
    return r.json();
  });

function colorBarra(pct: number) {
  if (pct >= 75) return "bg-emerald-500";
  if (pct >= 25) return "bg-amber-500";
  return "bg-red-500";
}

export default function PrestamosBoston() {
  const { data, error, isLoading } = useSWR<Respuesta>("/api/boston/prestamos", fetcher, {
    revalidateOnFocus: false,
  });

  if (error) return <p className="text-sm text-red-600 py-8">No se pudieron cargar los préstamos.</p>;
  if (isLoading) return <p className="text-sm text-gray-500 py-8">Cargando…</p>;

  const empleados = data?.empleados ?? [];
  const t = data?.totales;
  // Primero quien todavía debe, y dentro de esos quien debe más.
  const orden = [...empleados].sort(
    (a, b) => b.saldo - a.saldo || a.nombre.localeCompare(b.nombre, "es"),
  );

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
          <span className="block text-xs uppercase tracking-wide text-gray-500">Por cobrar</span>
          <span className="block text-base sm:text-lg font-semibold tabular-nums text-gray-900">
            ${fmt(t?.saldo ?? 0)}
          </span>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
          <span className="block text-xs uppercase tracking-wide text-gray-500">Con saldo</span>
          <span className="block text-base sm:text-lg font-semibold tabular-nums text-gray-900">
            {t?.conSaldo ?? 0}
          </span>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
          <span className="block text-xs uppercase tracking-wide text-gray-500">Personas</span>
          <span className="block text-base sm:text-lg font-semibold tabular-nums text-gray-900">
            {t?.personas ?? 0}
          </span>
        </div>
      </div>

      <p className="text-xs text-gray-500 mb-3">
        Son los préstamos de las tres empresas que tienen gente con préstamo, no solo los de
        Confecciones Boston.
      </p>

      <div className="space-y-2">
        {orden.map((e) => (
          <div key={e.id} className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0">
                <span className="block font-medium text-gray-900 truncate">{e.nombre}</span>
                <span className="block text-xs text-gray-500">{e.empresa}</span>
              </span>
              <span className="shrink-0 text-right">
                <span
                  className={`block text-base font-semibold tabular-nums ${
                    e.saldo > 0 ? "text-gray-900" : e.saldo < 0 ? "text-blue-600" : "text-gray-400"
                  }`}
                >
                  ${fmt(Math.abs(e.saldo))}
                </span>
                {e.saldo < 0 && <span className="block text-xs text-blue-500 -mt-0.5">a favor</span>}
              </span>
            </div>

            {e.prestado > 0 && (
              <span className="mt-2 block h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <span
                  className={`block h-full rounded-full ${colorBarra(e.pct)}`}
                  style={{ width: `${Math.min(100, Math.max(0, e.pct))}%` }}
                />
              </span>
            )}

            <p className="mt-1 text-xs text-gray-500 tabular-nums">
              Prestado ${fmt(e.prestado)} · pagado ${fmt(e.pagado)}
              {e.deduccionQuincenal > 0 && ` · descuenta $${fmt(e.deduccionQuincenal)} por quincena`}
              {e.ultimoMovimiento && ` · último mov. ${fmtDate(e.ultimoMovimiento)}`}
            </p>
          </div>
        ))}
        {orden.length === 0 && (
          <p className="text-sm text-gray-500 py-8">No hay préstamos activos.</p>
        )}
      </div>
    </div>
  );
}
