"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import type { Clientes, Cliente } from "./types";
import { fmtMoney, fmtPct, deltaSymbol } from "@/lib/ventas/format";
import { cn } from "@/lib/utils";

type SortKey = "rank" | "nombre" | "empresa" | "ytd" | "delta" | "ultima";
type SortDir = "asc" | "desc";

export function ClientesView({ data }: { data: Clientes }) {
  const [search, setSearch] = useState("");
  const [empresa, setEmpresa] = useState("todas");
  const [sortBy, setSortBy] = useState<SortKey>("ytd");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const empresas = Array.from(new Set(data.rows.map(r => r.empresa)));

  const filtered = useMemo(() => {
    let r = data.rows.slice();
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(c => c.nombre.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
    }
    if (empresa !== "todas") r = r.filter(c => c.empresa === empresa);
    r.sort((a, b) => {
      const sign = sortDir === "asc" ? 1 : -1;
      switch (sortBy) {
        case "rank":    return (a.rank - b.rank) * sign;
        case "nombre":  return a.nombre.localeCompare(b.nombre) * sign;
        case "empresa": return a.empresa.localeCompare(b.empresa) * sign;
        case "ytd":     return (a.ytd - b.ytd) * sign;
        case "delta":   return (a.delta - b.delta) * sign;
        case "ultima":  return a.ultima.localeCompare(b.ultima) * sign;
      }
    });
    return r;
  }, [data.rows, search, empresa, sortBy, sortDir]);

  const onSort = (col: SortKey) => {
    if (sortBy === col) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir(col === "nombre" || col === "empresa" ? "asc" : "desc"); }
  };

  return (
    <div className="space-y-3">
      {/* Sticky toolbar — search (flex-1) | filter (auto) | counter (right). */}
      <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-3 border-b border-stone-200 bg-stone-50 px-1 py-2.5">
        <div className="relative min-w-[200px] max-w-[360px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-stone-500" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar cliente o código…"
            className="w-full pl-8"
          />
        </div>
        <Select value={empresa} onValueChange={v => setEmpresa(v)}>
          {/* w-auto + min-w prevents native truncation of “Todas las empresas”. */}
          <SelectTrigger className="h-8 w-auto min-w-[200px] gap-2 text-sm">
            <SelectValue placeholder="Filtrar empresa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las empresas</SelectItem>
            {empresas.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="ml-auto whitespace-nowrap text-xs text-stone-500">
          <span className="font-mono text-stone-950">{filtered.length}</span> clientes · ordenados por compras YTD ↓
        </p>
      </div>

      {/* Lista completa — scroll vertical, header sticky bajo el toolbar */}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 920 }}>
            <thead className="sticky top-[56px] z-10">
              <tr className="bg-stone-100">
                <SortHeader col="rank"    align="right" sortBy={sortBy} sortDir={sortDir} onClick={onSort}>#</SortHeader>
                <SortHeader col="nombre"  align="left"  sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Cliente</SortHeader>
                <SortHeader col="empresa" align="left"  sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Empresa</SortHeader>
                <SortHeader col="ytd"     align="right" sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Compras YTD</SortHeader>
                <SortHeader col="delta"   align="right" sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Δ vs 2025</SortHeader>
                <SortHeader col="ultima"  align="right" sortBy={sortBy} sortDir={sortDir} onClick={onSort}>Última compra</SortHeader>
                <th className="w-12 border-b border-stone-200 px-3.5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => <ClienteRow key={`${c.id}-${c.rank}`} c={c} />)}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-3.5 py-12 text-center text-sm text-stone-500">
                  No se encontraron clientes con esos filtros.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ClienteRow({ c }: { c: Cliente }) {
  const tone =
    c.delta > 0.05  ? "text-emerald-600" :
    c.delta < -0.05 ? "text-red-600"     : "text-stone-500";

  return (
    <tr className="cursor-pointer transition hover:bg-stone-50" onClick={() => { /* TODO #2: open detalle drawer */ }}>
      <td className="border-b border-stone-200 px-3.5 py-3 text-right font-mono text-xs text-stone-500 tabular-nums">{c.rank}</td>
      <td className="border-b border-stone-200 px-3.5 py-3 text-sm text-stone-950">
        <div className="font-medium leading-tight">{c.nombre}</div>
        <div className="font-mono text-[11px] leading-tight text-stone-500">{c.id}</div>
      </td>
      <td className="whitespace-nowrap border-b border-stone-200 px-3.5 py-3 text-xs text-stone-700">{c.empresa}</td>
      <td className="whitespace-nowrap border-b border-stone-200 px-3.5 py-3 text-right font-mono text-sm font-medium text-stone-950 tabular-nums">{fmtMoney(c.ytd)}</td>
      <td className={cn("whitespace-nowrap border-b border-stone-200 px-3.5 py-3 text-right font-mono text-xs tabular-nums", tone)}>
        {deltaSymbol(c.delta)} {fmtPct(c.delta)}
      </td>
      <td className="whitespace-nowrap border-b border-stone-200 px-3.5 py-3 text-right font-mono text-xs text-stone-500 tabular-nums">{c.ultima}</td>
      <td className="border-b border-stone-200 px-3.5 py-3 text-center">
        <a
          href={`https://wa.me/${c.wa.replace("+","")}`}
          target="_blank" rel="noopener noreferrer"
          aria-label={`Enviar WhatsApp a ${c.nombre}`}
          onClick={e => e.stopPropagation()}
          className="inline-flex text-[#25D366] hover:opacity-80"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.4-1.5-.9-.8-1.5-1.8-1.6-2.1-.2-.3 0-.4.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.1-.6-1.5-.9-2.1-.2-.5-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4 0 1.4 1 2.8 1.2 3 .1.2 2.1 3.2 5.1 4.5 1.8.7 2.5.8 3.4.7.5-.1 1.7-.7 2-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3z M12 2C6.5 2 2 6.5 2 12c0 1.7.4 3.3 1.2 4.7L2 22l5.3-1.2c1.4.7 3 1.1 4.7 1.1 5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18c-1.5 0-3-.4-4.3-1.1l-.3-.2-3.2.7.7-3-.2-.4C4 14.6 4 13.3 4 12c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8z"/></svg>
        </a>
      </td>
    </tr>
  );
}

function SortHeader({
  col, align, children, sortBy, sortDir, onClick,
}: {
  col: SortKey; align: "left" | "right"; children: React.ReactNode;
  sortBy: SortKey; sortDir: SortDir; onClick: (c: SortKey) => void;
}) {
  const active = sortBy === col;
  return (
    <th
      onClick={() => onClick(col)}
      className={cn(
        "cursor-pointer select-none whitespace-nowrap border-b border-stone-200 px-3.5 py-2.5 text-[11px] font-medium uppercase tracking-wider transition",
        align === "right" ? "text-right" : "text-left",
        active ? "text-stone-950" : "text-stone-500 hover:text-stone-700"
      )}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <span className={cn("text-[9px]", active ? "opacity-100" : "opacity-35")}>
          {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </span>
    </th>
  );
}


