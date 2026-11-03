"use client";

// Comisiones › «Buscar cliente» (mockup, 3-nov-2026, `COMISIONES_BUSCAR_CLIENTE`).
// Una caja arriba de la lista. Con texto, la lista se cambia por los documentos
// del cliente en el período: a quién le contó cada uno, o por qué no.

import { useEffect, useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { fmt, fmtDate } from "@/lib/format";
import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { nombreVendedorEnPantalla } from "@/lib/comisiones/alias";
import { facturaParaMostrar } from "@/lib/comisiones/factura-en-pantalla";
import { separarRetenciones } from "@/lib/comisiones/buscar-cliente";

interface Fila {
  fecha: string;
  empresa: string;
  comprobante?: string;
  tipo?: string;
  vendedor: string;
  monto: number;
  comision: number | null;
  motivo: string | null;
}
interface Cliente {
  codigo: string;
  nombre: string;
  facturas: Fila[];
  cobros: Fila[];
  /** Ya redondeada por vendedor en el servidor, como el detalle del vendedor. */
  comision_pagable: number;
}

const dinero = (n: number) => (n < 0 ? `−$${fmt(-n)}` : `$${fmt(n)}`);

function Comision({ f }: { f: Fila }) {
  if (f.motivo && f.comision == null) return <span className="text-gray-500">{f.motivo}</span>;
  if (f.motivo) return <span className="text-gray-500">{dinero(f.comision!)} · {f.motivo}</span>;
  return <span className="font-medium text-gray-900">{dinero(f.comision!)}</span>;
}

function Tabla({ titulo, filas, conComprobante }: { titulo: string; filas: Fila[]; conComprobante: boolean }) {
  if (!filas.length) return null;
  return (
    <section className="mt-3">
      <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">{titulo}</h3>
      {/* ≥ 1024 px: tabla */}
      <table className="hidden w-full text-sm tabular-nums lg:table">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="py-2 pr-3 font-medium">Fecha</th>
            <th className="py-2 pr-3 font-medium">Empresa</th>
            {conComprobante && <th className="py-2 pr-3 font-medium">Comprobante</th>}
            <th className="py-2 pr-3 font-medium">Vendedor</th>
            <th className="py-2 pr-3 text-right font-medium">Monto</th>
            <th className="py-2 text-right font-medium">Comisión</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i} className="border-b border-gray-100 last:border-0">
              <td className="py-2.5 pr-3 text-gray-700">{fmtDate(f.fecha)}</td>
              <td className="py-2.5 pr-3 text-gray-700">{nombreCortoEmpresa(f.empresa)}</td>
              {conComprobante && (
                <td className="py-2.5 pr-3 text-gray-700">
                  {f.tipo === "Factura" ? "" : `${f.tipo} `}{facturaParaMostrar(f.comprobante)}
                </td>
              )}
              <td className="py-2.5 pr-3 text-gray-900">{nombreVendedorEnPantalla(f.vendedor)}</td>
              <td className="py-2.5 pr-3 text-right text-gray-700">{dinero(f.monto)}</td>
              <td className="py-2.5 text-right"><Comision f={f} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* < 1024 px: fichas */}
      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white lg:hidden">
        {filas.map((f, i) => (
          <li key={i} className="px-3 py-2.5 text-sm tabular-nums">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-gray-900">{nombreVendedorEnPantalla(f.vendedor)}</span>
              <span className="text-right"><Comision f={f} /></span>
            </div>
            <div className="mt-0.5 text-gray-500">
              {fmtDate(f.fecha)} · {nombreCortoEmpresa(f.empresa)}
              {conComprobante && <> · {f.tipo === "Factura" ? "" : `${f.tipo} `}{facturaParaMostrar(f.comprobante)}</>}
              {" "}· {dinero(f.monto)}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** `empresa`: la elegida arriba, o `null` con «Todas» (las 6 del grupo). */
export function BuscarClienteComisiones({ year, mes, empresa, children }: { year: number; mes: number; empresa: string | null; children: ReactNode }) {
  const [q, setQ] = useState("");
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const buscando = q.trim().length >= 2;

  useEffect(() => {
    if (!buscando) { setClientes(null); setError(null); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setClientes(null);
      try {
        const r = await fetch(`/api/ventas/comisiones/buscar-cliente?q=${encodeURIComponent(q.trim())}&year=${year}&mes=${mes}${empresa ? `&empresa=${encodeURIComponent(empresa)}` : ""}`, { signal: ctrl.signal });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setClientes(j.clientes); setError(null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message || "No se pudo buscar. Vuelve a intentar.");
      }
    }, 300);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, year, mes, empresa, buscando]);

  return (
    <div>
      <div className="relative mb-3 px-4 sm:px-0">
        <Search className="pointer-events-none absolute left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 sm:left-3" />
        <input
          type="text"
          role="searchbox"
          aria-label="Buscar cliente"
          placeholder="Buscar cliente por nombre o código"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="min-h-[44px] w-full rounded-lg border border-gray-200 bg-white pl-9 pr-10 text-[15px] text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-900"
        />
        {q && (
          <button type="button" aria-label="Borrar búsqueda" onClick={() => setQ("")}
            className="absolute right-4 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center text-gray-400 hover:text-gray-900 sm:right-0">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {!buscando ? children : (
        <div className="px-4 sm:px-0" data-buscar-cliente-listo={clientes || error ? "" : undefined}>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!clientes && !error && <div className="h-40 animate-pulse rounded-lg bg-gray-100" aria-hidden />}
          {clientes?.length === 0 && <p className="py-8 text-center text-sm text-gray-500">Sin clientes con ese nombre o código</p>}
          {clientes?.map((c) => {
            const cuentan = c.facturas.filter((f) => f.comision != null && !f.motivo).length;
            const { filas: cobros, retenciones } = separarRetenciones(c.cobros);
            return (
              <article key={c.codigo} className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
                <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h2 className="text-base font-semibold text-gray-900">{c.nombre} <span className="font-normal text-gray-500">· {c.codigo}</span></h2>
                  <p className="text-sm tabular-nums text-gray-600">
                    {c.facturas.length} comprobantes · {cuentan} con comisión · <span className="font-medium text-gray-900">Comisión total {dinero(c.comision_pagable)}</span>
                  </p>
                </header>
                {!c.facturas.length && !c.cobros.length && <p className="mt-3 text-sm text-gray-500">Sin facturas ni cobros en el período</p>}
                <Tabla titulo="Ventas" filas={c.facturas} conComprobante />
                <Tabla titulo="Cobros" filas={cobros} conComprobante={false} />
                {retenciones.cantidad > 0 && (
                  <p className="mt-2 text-sm tabular-nums text-gray-500">
                    Retenciones: {retenciones.cantidad} · {dinero(retenciones.monto)} · sin comisión
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
