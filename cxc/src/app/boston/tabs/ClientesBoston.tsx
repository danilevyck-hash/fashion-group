"use client";

// CLIENTES de Confecciones Boston.
//
// Sin buscar, muestra los que TIENEN SALDO ABIERTO — con los que se trabaja —
// y lo dice con todas las letras. Boston tiene 4.911 clientes en el maestro de
// Switch: mandarlos todos son ~600 KB por visita contra una base en compute
// Micro, y nadie lee una lista de 4.911. El buscador sí llega a los 4.911, en
// el servidor.

import { useState } from "react";
import useSWR from "swr";
import { fmt } from "@/lib/format";

interface ClienteBoston {
  codigo: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  activo: boolean;
  saldo: number;
  vencido: number;
}
interface Respuesta {
  modo: "saldo" | "busqueda";
  total: number;
  truncado: boolean;
  clientes: ClienteBoston[];
}

const fetcher = (u: string) =>
  fetch(u, { cache: "no-store" }).then((r) => {
    if (!r.ok) throw new Error("No se pudieron leer los clientes de Confecciones Boston");
    return r.json();
  });

export default function ClientesBoston() {
  const [texto, setTexto] = useState("");
  // El buscador va contra el SERVIDOR, así que se espera a 3 caracteres: con
  // uno o dos la consulta trae medio maestro y no ayuda a nadie.
  const q = texto.trim().length >= 3 ? texto.trim() : "";
  const { data, error, isLoading } = useSWR<Respuesta>(
    `/api/boston/clientes${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    fetcher,
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  const clientes = data?.clientes ?? [];

  return (
    <div>
      <input
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar cliente por nombre o código..."
        aria-label="Buscar cliente de Confecciones Boston"
        className="w-full min-h-[44px] px-4 rounded-xl border border-gray-200 bg-white text-base mb-3
                   focus:outline-none focus:ring-2 focus:ring-gray-900/10"
      />

      <p className="text-sm text-gray-500 mb-3">
        {error
          ? ""
          : isLoading
            ? "Cargando…"
            : data?.modo === "busqueda"
              ? `${clientes.length} ${clientes.length === 1 ? "cliente" : "clientes"}${data.truncado ? " (hay más, afina la búsqueda)" : ""}`
              : `${clientes.length} ${clientes.length === 1 ? "cliente" : "clientes"} con saldo abierto — busca por nombre para ver el resto`}
      </p>

      {error && (
        <p className="text-sm text-red-600 py-8">No se pudieron cargar los clientes de Confecciones Boston.</p>
      )}

      {!error && !isLoading && clientes.length === 0 && (
        <p className="text-sm text-gray-500 py-8">
          {q ? "Ningún cliente coincide." : "Ningún cliente con saldo abierto."}
        </p>
      )}

      {/* 🔑 EL CORTE ES `lg` (1024) Y NO `sm`: lo que decide es el ancho ÚTIL.
          La barra lateral se lleva 224 px, así que un iPad de 834 deja 610 —
          más angosto que un iPhone acostado. Es la misma regla, el mismo número
          y el mismo patrón que la pestaña CXC y las otras cuatro pantallas del
          30-jul-2026. `data-vista` es FIJO para que la medición no busque el
          layout por su clase de breakpoint y compare cero en verde. */}
      <div data-vista="tarjetas" className="lg:hidden space-y-2">
        {clientes.map((c) => (
          <div key={c.codigo} className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-gray-900 truncate">{c.nombre}</span>
              <span className="font-semibold tabular-nums shrink-0">
                {c.saldo ? `$${fmt(c.saldo)}` : "—"}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-gray-500">
              {c.codigo}
              {c.telefono ? ` · ${c.telefono}` : ""}
              {!c.activo ? " · inactivo" : ""}
            </p>
            {c.vencido > 0 && (
              <p className="mt-1 text-xs text-red-600 tabular-nums">
                ${fmt(c.vencido)} con más de 121 días
              </p>
            )}
          </div>
        ))}
      </div>

      <div data-vista="tabla" className="hidden lg:block rounded-xl border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
              <th className="text-left font-normal px-4 py-3">Cliente</th>
              <th className="text-left font-normal px-3">Código</th>
              <th className="text-left font-normal px-3">Teléfono</th>
              <th className="text-right font-normal px-3">121 y más</th>
              <th className="text-right font-normal px-4">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.codigo} className="border-b border-gray-50 last:border-0">
                <td className="px-4 py-3 text-gray-900">
                  {c.nombre}
                  {!c.activo && <span className="ml-2 text-xs text-gray-400">inactivo</span>}
                </td>
                <td className="px-3 text-gray-500">{c.codigo}</td>
                <td className="px-3 text-gray-500">{c.telefono ?? "—"}</td>
                <td className={`px-3 text-right tabular-nums ${c.vencido ? "text-red-600" : "text-gray-300"}`}>
                  {c.vencido ? fmt(c.vencido) : "—"}
                </td>
                <td className="px-4 text-right font-semibold tabular-nums">
                  {c.saldo ? fmt(c.saldo) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
