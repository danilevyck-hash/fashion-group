"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { fmt, fmtDate } from "@/lib/format";
import AppHeader from "@/components/AppHeader";

// ── Types ────────────────────────────────────────────────

interface Position {
  symbol: string;
  quantity: number;
  avg_cost: number;
  current_price: number;
  unrealized_pnl: number;
  market_value: number;
}

interface Trade {
  date: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  pnl: number;
}

interface BotData {
  portfolio: {
    total_value: number;
    cash: number;
    positions: Position[];
  };
  metrics: {
    total_pnl: number;
    total_pnl_pct: number;
    win_rate: number;
    profit_factor: number;
    total_trades: number;
    winning_trades: number;
    losing_trades: number;
    max_drawdown: number;
    sharpe_ratio: number;
  };
  equity_curve: { date: string; equity: number }[];
  recent_trades: Trade[];
  memory: {
    notes: string[];
  };
}

// ── Skeleton ─────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="border border-gray-200 rounded-lg p-3 animate-pulse">
      <div className="h-3 w-20 bg-gray-100 rounded mb-2" />
      <div className="h-6 w-28 bg-gray-100 rounded" />
    </div>
  );
}

function SkeletonTable() {
  return (
    <div className="border border-gray-200 rounded-lg p-4 animate-pulse">
      <div className="h-4 w-32 bg-gray-100 rounded mb-4" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-4 mb-3">
          <div className="h-3 w-16 bg-gray-100 rounded" />
          <div className="h-3 w-20 bg-gray-100 rounded" />
          <div className="h-3 w-24 bg-gray-100 rounded" />
        </div>
      ))}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────

function pnlColor(value: number): string {
  if (value > 0) return "text-emerald-600";
  if (value < 0) return "text-red-600";
  return "text-gray-600";
}

function fmtPct(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

// ── Page ─────────────────────────────────────────────────

export default function TradingPage() {
  const { authChecked } = useAuth({
    moduleKey: "trading",
    allowedRoles: ["admin"],
  });

  const [data, setData] = useState<BotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("http://localhost:8888/api/data", {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error("fetch failed");
      const json: BotData = await res.json();
      setData(json);
      setError(false);
      setLastUpdated(new Date());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authChecked) return;
    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [authChecked, fetchData]);

  if (!authChecked) return null;

  // ── Error state ──
  if (error && !data) {
    return (
      <>
        <AppHeader module="Trading Bot" />
        <div className="flex flex-col items-center justify-center py-20 px-4">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <p className="text-sm text-gray-600 mb-1 font-medium">Bot desconectado</p>
          <p className="text-xs text-gray-400 mb-4">No se pudo conectar a localhost:8888</p>
          <button
            onClick={() => { setLoading(true); setError(false); fetchData(); }}
            className="text-sm bg-black text-white px-4 py-1.5 rounded-md active:scale-[0.97] transition"
          >
            Reintentar
          </button>
        </div>
      </>
    );
  }

  // ── Loading state ──
  if (loading && !data) {
    return (
      <>
        <AppHeader module="Trading Bot" />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
          </div>
          <SkeletonTable />
          <SkeletonTable />
        </div>
      </>
    );
  }

  if (!data) return null;

  const { portfolio, metrics, equity_curve, recent_trades, memory } = data;
  const lastEquity = equity_curve.length > 0 ? equity_curve[equity_curve.length - 1].equity : portfolio.total_value;

  return (
    <>
      <AppHeader module="Trading Bot" />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">

        {/* ── Refresh bar ── */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-800">Dashboard</h2>
          <button
            onClick={() => { setLoading(true); fetchData(); }}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
            </svg>
            Actualizar
          </button>
        </div>

        {/* ── Connection error banner ── */}
        {error && data && (
          <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Error al actualizar. Mostrando datos anteriores.
          </div>
        )}

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="border border-gray-200 rounded-lg p-3">
            <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">Portfolio</p>
            <p className="text-lg font-semibold tabular-nums text-gray-900">${fmt(portfolio.total_value)}</p>
            <p className="text-[11px] text-gray-400 tabular-nums">Cash: ${fmt(portfolio.cash)}</p>
          </div>
          <div className="border border-gray-200 rounded-lg p-3">
            <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">P&L Total</p>
            <p className={`text-lg font-semibold tabular-nums ${pnlColor(metrics.total_pnl)}`}>
              ${fmt(metrics.total_pnl)}
            </p>
            <p className={`text-[11px] tabular-nums ${pnlColor(metrics.total_pnl_pct)}`}>
              {fmtPct(metrics.total_pnl_pct)}
            </p>
          </div>
          <div className="border border-gray-200 rounded-lg p-3">
            <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">Win Rate</p>
            <p className="text-lg font-semibold tabular-nums text-gray-900">{metrics.win_rate.toFixed(1)}%</p>
            <p className="text-[11px] text-gray-400 tabular-nums">
              {metrics.winning_trades}W / {metrics.losing_trades}L
            </p>
          </div>
          <div className="border border-gray-200 rounded-lg p-3">
            <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">Profit Factor</p>
            <p className="text-lg font-semibold tabular-nums text-gray-900">{metrics.profit_factor.toFixed(2)}</p>
            <p className="text-[11px] text-gray-400 tabular-nums">Sharpe: {metrics.sharpe_ratio.toFixed(2)}</p>
          </div>
        </div>

        {/* ── Equity summary ── */}
        <div className="border border-gray-200 rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            <span>Equity: <span className="font-medium tabular-nums text-gray-900">${fmt(lastEquity)}</span></span>
          </div>
          <span className={`text-xs tabular-nums ${pnlColor(-metrics.max_drawdown)}`}>
            Max drawdown: {metrics.max_drawdown.toFixed(2)}%
          </span>
        </div>

        {/* ── Positions table ── */}
        <div className="border border-gray-200 rounded-lg">
          <div className="px-3 py-2.5 border-b border-gray-100">
            <h3 className="text-sm font-medium text-gray-800">Posiciones abiertas</h3>
          </div>
          {portfolio.positions.length === 0 ? (
            <p className="text-sm text-gray-400 px-3 py-6 text-center">Sin posiciones abiertas</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-gray-400 uppercase tracking-wide border-b border-gray-100">
                    <th className="text-left px-3 py-2 font-medium">Símbolo</th>
                    <th className="text-right px-3 py-2 font-medium">Cant.</th>
                    <th className="text-right px-3 py-2 font-medium">Costo Prom.</th>
                    <th className="text-right px-3 py-2 font-medium">Precio</th>
                    <th className="text-right px-3 py-2 font-medium">P&L</th>
                    <th className="text-right px-3 py-2 font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolio.positions.map((pos) => (
                    <tr key={pos.symbol} className="border-b border-gray-50 last:border-0">
                      <td className="px-3 py-2 font-medium text-gray-900">{pos.symbol}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-600">{pos.quantity}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-600">${fmt(pos.avg_cost)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-600">${fmt(pos.current_price)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${pnlColor(pos.unrealized_pnl)}`}>
                        ${fmt(pos.unrealized_pnl)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-600">${fmt(pos.market_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Recent trades table ── */}
        <div className="border border-gray-200 rounded-lg">
          <div className="px-3 py-2.5 border-b border-gray-100">
            <h3 className="text-sm font-medium text-gray-800">
              Trades recientes
              <span className="text-[11px] text-gray-400 font-normal ml-2">{metrics.total_trades} total</span>
            </h3>
          </div>
          {recent_trades.length === 0 ? (
            <p className="text-sm text-gray-400 px-3 py-6 text-center">Sin trades recientes</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-gray-400 uppercase tracking-wide border-b border-gray-100">
                    <th className="text-left px-3 py-2 font-medium">Fecha</th>
                    <th className="text-left px-3 py-2 font-medium">Símbolo</th>
                    <th className="text-left px-3 py-2 font-medium">Lado</th>
                    <th className="text-right px-3 py-2 font-medium">Cant.</th>
                    <th className="text-right px-3 py-2 font-medium">Precio</th>
                    <th className="text-right px-3 py-2 font-medium">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {recent_trades.slice(0, 20).map((trade, i) => (
                    <tr key={`${trade.date}-${trade.symbol}-${i}`} className="border-b border-gray-50 last:border-0">
                      <td className="px-3 py-2 text-gray-500 tabular-nums">{fmtDate(trade.date)}</td>
                      <td className="px-3 py-2 font-medium text-gray-900">{trade.symbol}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-block text-[11px] font-medium px-1.5 py-0.5 rounded ${
                          trade.side === "BUY"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-red-50 text-red-700"
                        }`}>
                          {trade.side}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-600">{trade.quantity}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-600">${fmt(trade.price)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${pnlColor(trade.pnl)}`}>
                        ${fmt(trade.pnl)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Claude's Notes ── */}
        {memory.notes.length > 0 && (
          <div className="border border-gray-200 rounded-lg">
            <div className="px-3 py-2.5 border-b border-gray-100">
              <h3 className="text-sm font-medium text-gray-800">Notas de Claude</h3>
            </div>
            <ul className="px-3 py-3 space-y-1.5">
              {memory.notes.map((note, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                  <span className="text-gray-300 mt-0.5">•</span>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Last updated ── */}
        {lastUpdated && (
          <p className="text-[11px] text-gray-300 text-center tabular-nums">
            Actualizado: {lastUpdated.toLocaleTimeString("es-PA")}
          </p>
        )}
      </div>
    </>
  );
}
