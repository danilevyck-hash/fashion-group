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
import { useMemo } from "react";
import { fmt, fmtDate } from "@/lib/format";
import BuscadorDeLista, { VacioDeBusqueda } from "@/components/BuscadorDeLista";
import {
  LIMPIAR_BUSQUEDA,
  PARAM_BUSCAR,
  PLACEHOLDER_COLABORADOR,
  VACIO_BUSQUEDA,
  vistaDeLista,
} from "@/lib/buscar-en-lista";
import { useUrlState } from "@/lib/hooks/useUrlState";

interface EmpleadoPrestamo {
  id: string;
  nombre: string;
  empresa: string;
  /** Préstamo + terceros: lo que la quincena le descuenta (11-sep-2026). */
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

  // ── 🔴 EL BUSCADOR, Y EL TOTAL QUE LO SIGUE (11-sep-2026) ─────────────────
  //
  // Daniel: *«pon buscador a lo que normalmente llevaría buscador»*. Acá son 31
  // fichas de las tres empresas, sin ningún filtro, y sus dos pantallas hermanas
  // sobre los mismos datos —/prestamos y Asistencia › Préstamos— ya lo tienen.
  //
  // 🔴 LAS TRES TARJETAS SIGUEN AL FILTRO, que es la regla de
  // `lib/buscar-en-lista.ts`. Vienen sumadas del servidor (`data.totales`), así
  // que con búsqueda escrita se vuelven a contar en el navegador sobre las
  // fichas que quedaron — con el MISMO criterio del servidor: «Con saldo» es
  // quien debe algo distinto de cero.
  // ⚠️ Acá el total es lo que se DEBE hoy, no una quincena que se paga: por eso
  // hay buscador y no la salida de la Planilla.
  //
  // 🩸 Los hooks van ARRIBA de los `return` de error y de carga: puestos abajo,
  // el primer render (cargando) corría menos hooks que el segundo y React tira
  // «Rendered more hooks than during the previous render».
  const [busqueda, setBusqueda] = useUrlState(PARAM_BUSCAR, "");
  // Primero quien todavía debe, y dentro de esos quien debe más.
  const orden = useMemo(
    () => [...(data?.empleados ?? [])].sort(
      (a, b) => b.saldo - a.saldo || a.nombre.localeCompare(b.nombre, "es"),
    ),
    [data],
  );
  const { visibles, conteo, buscando, sinResultados } = useMemo(
    () => vistaDeLista(orden, busqueda, (e) => [e.nombre, e.empresa]),
    [orden, busqueda],
  );
  const t = data?.totales;
  const tarjetas = buscando
    ? {
        saldo: visibles.reduce((a, e) => a + e.saldo, 0),
        conSaldo: visibles.filter((e) => e.saldo !== 0).length,
        personas: visibles.length,
      }
    : { saldo: t?.saldo ?? 0, conSaldo: t?.conSaldo ?? 0, personas: t?.personas ?? 0 };

  if (error) return <p className="text-sm text-red-600 py-8">No se pudieron cargar los préstamos.</p>;
  if (isLoading) return <p className="text-sm text-gray-500 py-8">Cargando…</p>;

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
          <span className="block text-xs uppercase tracking-wide text-gray-500">Saldo</span>
          <span className="block text-base sm:text-lg font-semibold tabular-nums text-gray-900">
            ${fmt(tarjetas.saldo)}
          </span>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
          <span className="block text-xs uppercase tracking-wide text-gray-500">Con saldo</span>
          <span className="block text-base sm:text-lg font-semibold tabular-nums text-gray-900">
            {tarjetas.conSaldo}
          </span>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
          <span className="block text-xs uppercase tracking-wide text-gray-500">Colaboradores</span>
          <span className="block text-base sm:text-lg font-semibold tabular-nums text-gray-900">
            {tarjetas.personas}
          </span>
        </div>
      </div>

      <p className="text-xs text-gray-500 mb-3">
        Incluye colaboradores de todas las empresas, no solo de Boston.
      </p>

      <BuscadorDeLista
        className="mb-3"
        valor={busqueda}
        onCambiar={setBusqueda}
        placeholder={PLACEHOLDER_COLABORADOR}
        etiqueta="Buscar colaborador por nombre o empresa"
        conteo={conteo}
      />

      {sinResultados && (
        <VacioDeBusqueda texto={VACIO_BUSQUEDA} onLimpiar={() => setBusqueda("")} rotulo={LIMPIAR_BUSQUEDA} />
      )}

      <div className="space-y-2">
        {visibles.map((e) => (
          // 🔴 Daniel, 2-oct-2026: quitar la línea de resumen de Boston › Préstamos.
          // La fila queda en nombre y saldo; prestado, pagado, cuota y último
          // movimiento se abren al tocar la persona. NO se borran: el rol de
          // Boston no entra a /prestamos, así que este es el único lugar donde
          // los ve. `<details>` nativo: igual en el celular y en la computadora.
          <details key={e.id} data-testid="prestamo-boston" className="group rounded-xl border border-gray-200 bg-white p-3">
            <summary className="list-none cursor-pointer [&::-webkit-details-marker]:hidden">
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

            </summary>

            <dl data-testid="detalle-prestamo-boston" className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums">
              <dt className="text-gray-500">Prestado</dt>
              <dd className="text-right text-gray-900">${fmt(e.prestado)}</dd>
              <dt className="text-gray-500">Pagado</dt>
              <dd className="text-right text-gray-900">${fmt(e.pagado)}</dd>
              {e.deduccionQuincenal > 0 && (
                <>
                  <dt className="text-gray-500">Cuota quincenal</dt>
                  <dd className="text-right text-gray-900">${fmt(e.deduccionQuincenal)}</dd>
                </>
              )}
              {e.ultimoMovimiento && (
                <>
                  <dt className="text-gray-500">Último movimiento</dt>
                  <dd className="text-right text-gray-900">{fmtDate(e.ultimoMovimiento)}</dd>
                </>
              )}
            </dl>
          </details>
        ))}
        {/* 🔴 Con la búsqueda sin resultados ya se dijo arriba: repetir «no hay
            préstamos activos» diría algo que no es cierto. */}
        {orden.length === 0 && !buscando && (
          <p className="text-sm text-gray-500 py-8">No hay préstamos activos.</p>
        )}
      </div>
    </div>
  );
}
