"use client";

import { useState } from "react";
import { useToast } from "@/components/ToastSystem";
import {
  ALL_EMPRESA_KEYS,
  API_BASE,
  diasDesde,
  empresaNombre,
  fechaCorta,
  hoyISO,
  limpiarMonto,
  money,
  montoInputValue,
  parseMonto,
  type BancoSaldo,
} from "./types";

interface Props {
  bancos: BancoSaldo[];
  onGuardado: () => Promise<unknown> | void;
  /** Título de la sección plegable. `null` = sin plegable (la pantalla ya
   *  tiene su propio título; repetirlo sería decir dos veces lo mismo). */
  titulo?: string | null;
}

export default function SaldosBancarios({ bancos, onGuardado, titulo = "Saldos bancarios" }: Props) {
  const [abierto, setAbierto] = useState(true);
  const porEmpresa = new Map(bancos.map((b) => [b.empresa_key, b]));
  const visible = titulo === null ? true : abierto;

  return (
    <section className="mb-8">
      {titulo !== null && (
        <button
          onClick={() => setAbierto((v) => !v)}
          className="w-full flex items-center justify-between gap-2 min-h-[44px] py-2"
        >
          <span className="text-sm font-semibold text-gray-900">{titulo}</span>
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={`text-gray-400 transition-transform ${abierto ? "rotate-180" : ""}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}

      {visible && (
        <>
          {/* "una cuenta por empresa" se ve solo: son las 8 filas de abajo. El
              nombre del banco no está en ningún otro lado, así que se queda. */}
          <p className="text-xs text-gray-500 mb-3">Banco General</p>
          <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
            {ALL_EMPRESA_KEYS.map((key) => (
              <BancoRow key={key} empresaKey={key} banco={porEmpresa.get(key)} onGuardado={onGuardado} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function BancoRow({
  empresaKey,
  banco,
  onGuardado,
}: {
  empresaKey: string;
  banco: BancoSaldo | undefined;
  onGuardado: () => Promise<unknown> | void;
}) {
  const { toast } = useToast();
  const [monto, setMonto] = useState(() => (banco ? montoInputValue(Number(banco.saldo) || 0) : ""));
  const [fecha, setFecha] = useState(() => hoyISO());
  const [guardando, setGuardando] = useState(false);

  const viejo = banco ? diasDesde(banco.fecha_dato) > 7 : false;
  const parsed = parseMonto(monto);
  const invalido = !!monto.trim() && parsed == null;

  const guardar = async () => {
    if (parsed == null || !fecha) return;
    setGuardando(true);
    try {
      const res = await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_key: empresaKey, saldo: parsed, fecha_dato: fecha }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error("err");
      toast("Listo, guardado");
      await onGuardado();
    } catch {
      toast("No se pudo guardar. Intenta de nuevo.", "error");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-gray-900 truncate">{empresaNombre(empresaKey)}</span>
          {viejo && (
            <span className="shrink-0 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-px">
              dato viejo
            </span>
          )}
        </span>
        <span className="shrink-0 text-sm tabular-nums text-gray-900">
          {banco ? (
            <>
              {money(Number(banco.saldo) || 0)}{" "}
              <span className="text-xs text-gray-400">al {fechaCorta(banco.fecha_dato)}</span>
            </>
          ) : (
            <span className="text-gray-300">sin dato</span>
          )}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          inputMode="decimal"
          placeholder="0.00"
          value={monto}
          onChange={(e) => setMonto(limpiarMonto(e.target.value, true))}
          className={`flex-1 min-w-0 text-right text-base tabular-nums border rounded-md px-3 py-2.5 outline-none transition ${
            invalido ? "border-red-400 focus:border-red-500" : "border-gray-200 focus:border-black"
          }`}
        />
        <input
          type="date"
          value={fecha}
          max={hoyISO()}
          onChange={(e) => setFecha(e.target.value)}
          className="shrink-0 w-[9.5rem] border border-gray-200 rounded-md px-2 py-2.5 text-sm outline-none focus:border-black transition bg-white"
        />
        <button
          onClick={guardar}
          disabled={guardando || parsed == null || !fecha}
          className="shrink-0 rounded-md bg-black text-white px-3 min-h-[44px] py-2.5 text-sm font-medium active:scale-[0.97] transition disabled:opacity-40"
        >
          {guardando ? "…" : "Guardar"}
        </button>
      </div>
    </div>
  );
}
