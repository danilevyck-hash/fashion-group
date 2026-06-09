"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { SkeletonTable, EmptyState, ScrollableTable, PullToRefresh } from "@/components/ui";
import { getCompanyDisplay } from "@/lib/companies";
import { fmt } from "@/lib/format";

// Las 6 B2B con CxP (empresasConCxc).
const EMPRESAS = ["vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep"];

interface ListItem {
  key: string;
  nombre: string;
  saldo_total: number;
  comprado_ytd: number;
  empresas_count: number;
  ultimo_pago_dias: number | null;
}

export default function ProveedoresListClient() {
  const { authChecked } = useAuth({ moduleKey: "proveedores", allowedRoles: ["admin", "contabilidad"] });
  const router = useRouter();

  const [items, setItems] = useState<ListItem[]>([]);
  const [grupoSaldo, setGrupoSaldo] = useState(0);
  const [empresa, setEmpresa] = useState<string>(""); // "" = Todas
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchList = useCallback(async (emp: string, query: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (emp) params.set("empresa", emp);
      if (query) params.set("q", query);
      const res = await fetch(`/api/proveedores?${params}`, { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setItems(json.proveedores ?? []);
        setGrupoSaldo(json.grupo_saldo ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = setTimeout(() => fetchList(empresa, q), q ? 200 : 0);
    return () => clearTimeout(h);
  }, [empresa, q, fetchList]);

  if (!authChecked) return null;

  const goFicha = (key: string) => router.push(`/proveedores/${encodeURIComponent(key)}`);

  return (
    <div className="min-h-screen bg-white">
      <AppHeader module="Proveedores" breadcrumbs={[{ label: "Proveedores" }]} />
      <PullToRefresh onRefresh={() => fetchList(empresa, q)}>
        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <div className="mb-5">
            <h1 className="text-xl font-semibold tracking-tight">Proveedores</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Cuentas por pagar por las 6 empresas B2B: saldo, antigüedad y pagos.
            </p>
          </div>

          {/* Total por pagar (grupo o empresa filtrada) */}
          <div className="border border-gray-200 rounded-lg p-4 mb-4">
            <div className="text-[11px] uppercase tracking-[0.05em] text-gray-400">
              {empresa ? `Por pagar · ${getCompanyDisplay(empresa)}` : "Por pagar · grupo"}
            </div>
            <div className={`text-2xl font-semibold tabular-nums mt-1 ${grupoSaldo < 0 ? "text-blue-600" : "text-purple-700"}`}>
              {grupoSaldo < 0 ? `Saldo a favor $${fmt(Math.abs(grupoSaldo))}` : `$${fmt(grupoSaldo)}`}
            </div>
          </div>

          {/* Chips por empresa */}
          <div className="flex flex-wrap gap-2 mb-3">
            <Chip active={empresa === ""} onClick={() => setEmpresa("")}>Todas</Chip>
            {EMPRESAS.map((e) => (
              <Chip key={e} active={empresa === e} onClick={() => setEmpresa(e)}>
                {getCompanyDisplay(e)}
              </Chip>
            ))}
          </div>

          {/* Search */}
          <input
            type="search"
            placeholder="Buscar proveedor..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-black transition mb-4"
          />

          {loading ? (
            <SkeletonTable rows={8} cols={4} />
          ) : items.length === 0 ? (
            <EmptyState title="Sin proveedores" subtitle={q ? "Probá con otra búsqueda." : "No hay datos sincronizados aún."} />
          ) : (
            <>
              <div className="text-xs text-gray-500 mb-2 tabular-nums">
                {items.length} {items.length === 1 ? "proveedor" : "proveedores"} · ordenados por saldo
              </div>

              {/* Desktop */}
              <div className="hidden sm:block">
                <ScrollableTable>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-[0.05em] text-gray-400 border-b border-gray-200">
                        <th className="py-2 px-3">Proveedor</th>
                        <th className="py-2 px-3 text-right">Comprado YTD</th>
                        <th className="py-2 px-3 text-right">Por pagar</th>
                        {!empresa && <th className="py-2 px-3 text-right">Empresas</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it) => (
                        <tr
                          key={it.key}
                          onClick={() => goFicha(it.key)}
                          className="border-b border-gray-100 hover:bg-gray-50 transition cursor-pointer"
                        >
                          <td className="py-2 px-3 font-medium">{it.nombre}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-gray-600">${fmt(it.comprado_ytd)}</td>
                          <SaldoCell value={it.saldo_total} />
                          {!empresa && <td className="py-2 px-3 text-right tabular-nums text-gray-400">{it.empresas_count}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollableTable>
              </div>

              {/* Mobile */}
              <ul className="sm:hidden border-t border-gray-100">
                {items.map((it) => (
                  <li
                    key={it.key}
                    onClick={() => goFicha(it.key)}
                    className="border-b border-gray-100 px-1 py-3 active:bg-gray-50 cursor-pointer"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium truncate">{it.nombre}</span>
                      <span className={`shrink-0 text-sm font-medium tabular-nums ${it.saldo_total < 0 ? "text-blue-600" : it.saldo_total > 0 ? "text-purple-700" : "text-gray-400"}`}>
                        {it.saldo_total < 0 ? `+$${fmt(Math.abs(it.saldo_total))}` : `$${fmt(it.saldo_total)}`}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500 tabular-nums">
                      Comprado YTD ${fmt(it.comprado_ytd)}{!empresa && it.empresas_count > 1 ? ` · ${it.empresas_count} empresas` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </main>
      </PullToRefresh>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium border transition active:scale-[0.97] ${
        active ? "bg-purple-600 text-white border-purple-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
      }`}
    >
      {children}
    </button>
  );
}

// Por pagar: positivo = púrpura; cero = gris; negativo = "Saldo a favor" azul.
function SaldoCell({ value }: { value: number }) {
  if (value < 0) {
    return <td className="py-2 px-3 text-right tabular-nums text-blue-600">Saldo a favor ${fmt(Math.abs(value))}</td>;
  }
  return (
    <td className={`py-2 px-3 text-right tabular-nums ${value > 0 ? "text-purple-700 font-medium" : "text-gray-400"}`}>
      ${fmt(value)}
    </td>
  );
}
