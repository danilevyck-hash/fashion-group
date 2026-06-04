"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { SkeletonTable, EmptyState, ScrollableTable } from "@/components/ui";

export interface Cliente {
  id: string;
  codigo: string;
  nombre: string;
  telefono: string | null;
  celular: string | null;
  email: string | null;
  provincia: string | null;
}

interface Props {
  initialClientes: Cliente[];
  initialTotal: number;
  provincias: string[];
  pageSize: number;
}

export default function ClientesListClient({ initialClientes, initialTotal, provincias, pageSize }: Props) {
  const { authChecked } = useAuth({
    moduleKey: "directorio",
    allowedRoles: ["admin", "secretaria", "vendedor", "bodega"],
  });

  const [clientes, setClientes] = useState<Cliente[]>(initialClientes);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [provincia, setProvincia] = useState("");
  const [loading, setLoading] = useState(false);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  const fetchPage = useCallback(async (p: number, query: string, prov: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(pageSize) });
      if (query) params.set("q", query);
      if (prov)  params.set("provincia", prov);
      const res = await fetch(`/api/clientes?${params}`, { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setClientes(json.clientes ?? []);
        setTotal(json.total ?? 0);
        setPage(json.page ?? p);
      }
    } finally {
      setLoading(false);
    }
  }, [pageSize]);

  // Debounced search
  useEffect(() => {
    const handle = setTimeout(() => {
      fetchPage(1, q, provincia);
    }, q || provincia ? 250 : 0);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, provincia]);

  if (!authChecked) return null;

  return (
    <div className="min-h-screen bg-white">
      <AppHeader module="Reportes" breadcrumbs={[{ label: "Clientes" }]} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Datos fiscales y de contacto, ventas YTD y CXC actual por las 6 empresas B2B.
          </p>
        </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            type="search"
            placeholder="Buscar por nombre o código (D-XXX)..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-black transition"
          />
          <select
            value={provincia}
            onChange={(e) => setProvincia(e.target.value)}
            className="border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-black transition sm:w-48"
          >
            <option value="">Todas las provincias</option>
            {provincias.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div className="text-xs text-gray-500 mb-2 tabular-nums">
          {total.toLocaleString("es")} {total === 1 ? "cliente" : "clientes"}
          {(q || provincia) && " (filtrados)"}
        </div>

        {/* Tabla */}
        {loading ? (
          <SkeletonTable rows={8} cols={5} />
        ) : clientes.length === 0 ? (
          <EmptyState
            title="Sin resultados"
            subtitle={q || provincia ? "Probá con otros filtros." : "No hay clientes cargados aún."}
          />
        ) : (
          <ScrollableTable>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.05em] text-gray-400 border-b border-gray-200">
                  <th className="py-2 px-3">Código</th>
                  <th className="py-2 px-3">Nombre</th>
                  <th className="py-2 px-3">Teléfono</th>
                  <th className="py-2 px-3">Email</th>
                  <th className="py-2 px-3">Provincia</th>
                </tr>
              </thead>
              <tbody>
                {clientes.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                    <td className="py-2 px-3 tabular-nums text-gray-500">{c.codigo}</td>
                    <td className="py-2 px-3 font-medium">
                      <Link href={`/clientes/${encodeURIComponent(c.codigo)}`} className="hover:underline">
                        {c.nombre}
                      </Link>
                    </td>
                    <td className="py-2 px-3 text-gray-600">{c.telefono || c.celular || "—"}</td>
                    <td className="py-2 px-3 text-gray-600 max-w-[14rem] truncate">{c.email || "—"}</td>
                    <td className="py-2 px-3 text-gray-600">{c.provincia || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
        )}

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm">
            <div className="text-gray-500 tabular-nums">
              Página {page} de {totalPages}
            </div>
            <div className="flex gap-2">
              <button
                disabled={page <= 1 || loading}
                onClick={() => fetchPage(page - 1, q, provincia)}
                className="border border-gray-200 rounded-md px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition"
              >
                ← Anterior
              </button>
              <button
                disabled={page >= totalPages || loading}
                onClick={() => fetchPage(page + 1, q, provincia)}
                className="border border-gray-200 rounded-md px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition"
              >
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
