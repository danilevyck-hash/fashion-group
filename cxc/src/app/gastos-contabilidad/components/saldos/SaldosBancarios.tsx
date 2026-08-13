"use client";

// Saldos de banco — carga manual, corrección e historial.
//
// Daniel, textual: *"hagamoslo carga manual, pero que se pueda editar, corregir,
// ver historial, osea lo necesario para que la contable meta los saldos y vea si
// lo hizo bien de manera minimalista y simple"*.
//
// 🔴 LO QUE HACE EVIDENTE EL ERROR: un saldo que repite EXACTO al anterior de su
// empresa se marca, y si el repetido es el ÚLTIMO (o sea, el que hoy está
// diciendo cuánta plata hay) sale un aviso arriba de todo. Caso real medido el
// 13-ago-2026: las 3 cargas del 10-ago copiaron al centavo los saldos del
// 31-jul (active_shoes $27.647,97 · active_wear $60.678,97 · fashion_shoes
// $74.336,02). La pantalla vieja mostraba UN saldo por empresa y no había forma
// de verlo.
//
// ⚠️ NO ES UN SISTEMA DE AUDITORÍA. Se muestra lo que `bancos_saldos` YA guarda
// (`created_by`, `created_at`) y nada más. La escritura no cambió: el MISMO
// upsert por `(empresa_key, fecha_dato)` — repetir una fecha corrige ESA carga y
// no puede pisar la de otro día.

import { useState } from "react";
import { useToast } from "@/components/ToastSystem";
import {
  ALL_EMPRESA_KEYS,
  API_BASE,
  diasDesde,
  empresaNombre,
  fechaConAnio,
  fechaCorta,
  hoyISO,
  limpiarMonto,
  money,
  montoInputValue,
  parseMonto,
  type BancoSaldo,
  type CargaSaldo,
} from "./types";

interface Props {
  bancos: BancoSaldo[];
  historial?: Record<string, CargaSaldo[]>;
  onGuardado: () => Promise<unknown> | void;
  /** Título de la sección plegable. `null` = sin plegable (la pantalla ya
   *  tiene su propio título; repetirlo sería decir dos veces lo mismo). */
  titulo?: string | null;
}

export default function SaldosBancarios({ bancos, historial, onGuardado, titulo = "Saldos bancarios" }: Props) {
  const [abierto, setAbierto] = useState(true);
  const porEmpresa = new Map(bancos.map((b) => [b.empresa_key, b]));
  const visible = titulo === null ? true : abierto;

  // Las empresas cuyo ÚLTIMO saldo repite exacto al anterior. Se derivan del
  // historial que YA vino en la respuesta: no se vuelve a pedir nada.
  const repetidas = ALL_EMPRESA_KEYS.filter((k) => {
    const h = historial?.[k];
    return !!h && h.length > 0 && h[0].repiteAnterior;
  });

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
          {repetidas.length > 0 && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-900">
                {repetidas.length === 1
                  ? "Un saldo quedó igualito al anterior"
                  : `${repetidas.length} saldos quedaron igualitos al anterior`}
              </p>
              <p className="mt-1 text-xs text-amber-800">
                {repetidas.map((k) => empresaNombre(k)).join(", ")} — el monto es
                exactamente el mismo de la carga de antes. Puede estar bien, pero
                suele pasar cuando se copia el saldo del mes pasado. Revisá y
                corregí abajo si hace falta.
              </p>
            </div>
          )}

          {/* "una cuenta por empresa" se ve solo: son las 8 filas de abajo. El
              nombre del banco no está en ningún otro lado, así que se queda. */}
          <p className="text-xs text-gray-500 mb-3">Banco General</p>
          <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
            {ALL_EMPRESA_KEYS.map((key) => (
              <BancoRow
                key={key}
                empresaKey={key}
                banco={porEmpresa.get(key)}
                cargas={historial?.[key] ?? []}
                onGuardado={onGuardado}
              />
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
  cargas,
  onGuardado,
}: {
  empresaKey: string;
  banco: BancoSaldo | undefined;
  cargas: CargaSaldo[];
  onGuardado: () => Promise<unknown> | void;
}) {
  const { toast } = useToast();
  const [monto, setMonto] = useState(() => (banco ? montoInputValue(Number(banco.saldo) || 0) : ""));
  const [fecha, setFecha] = useState(() => hoyISO());
  const [guardando, setGuardando] = useState(false);
  const [verHistorial, setVerHistorial] = useState(false);

  const viejo = banco ? diasDesde(banco.fecha_dato) > 7 : false;
  const parsed = parseMonto(monto);
  const invalido = !!monto.trim() && parsed == null;
  const ultimaRepite = cargas.length > 0 && cargas[0].repiteAnterior;
  // Las cargas ANTERIORES a la de arriba: la más nueva ya se muestra en la fila.
  const anteriores = cargas.slice(1);
  // ¿La fecha del formulario es la de una carga que ya existe? Entonces esto no
  // es "cargar", es "corregir" — y decirlo evita el miedo a pisar otra fecha.
  const corrigiendo = cargas.find((c) => c.fecha_dato === fecha) ?? null;

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
      toast(corrigiendo ? `Listo, corregido el ${fechaCorta(fecha)}` : "Listo, guardado");
      await onGuardado();
    } catch {
      toast("No se pudo guardar. Intenta de nuevo.", "error");
    } finally {
      setGuardando(false);
    }
  };

  /** Traer una carga vieja al formulario para corregirla. NO guarda nada: solo
   *  llena monto y fecha. Guardar sigue siendo un toque aparte y deliberado. */
  const corregir = (c: CargaSaldo) => {
    setMonto(montoInputValue(Number(c.saldo) || 0));
    setFecha(c.fecha_dato);
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
          {ultimaRepite && (
            <span className="shrink-0 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-px">
              igual al {fechaCorta(cargas[0].fechaAnterior ?? "")}
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
          {guardando ? "…" : corrigiendo ? "Corregir" : "Guardar"}
        </button>
      </div>

      {corrigiendo && (
        <p className="mt-1.5 text-xs text-gray-500">
          Vas a corregir el saldo del {fechaConAnio(corrigiendo.fecha_dato)} (hoy dice{" "}
          {money(Number(corrigiendo.saldo) || 0)}). Las demás fechas no se tocan.
        </p>
      )}

      {anteriores.length > 0 && (
        <>
          <button
            onClick={() => setVerHistorial((v) => !v)}
            className="mt-1.5 flex min-h-[44px] items-center gap-1 text-xs font-medium text-gray-600"
          >
            {verHistorial
              ? "Ocultar las cargas anteriores"
              : `Ver las ${anteriores.length} cargas anteriores`}
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={`text-gray-400 transition-transform ${verHistorial ? "rotate-180" : ""}`}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {verHistorial && (
            <ul className="mb-1 rounded-md border border-gray-100 bg-gray-50/60 divide-y divide-gray-100">
              {anteriores.map((c) => (
                <li key={c.fecha_dato}>
                  <button
                    onClick={() => corregir(c)}
                    className="flex w-full min-h-[44px] items-center justify-between gap-2 px-2.5 py-2 text-left active:bg-gray-100 transition"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 text-xs text-gray-600">{fechaConAnio(c.fecha_dato)}</span>
                      {c.repiteAnterior && (
                        <span className="shrink-0 text-xs text-amber-700">
                          igual al {fechaCorta(c.fechaAnterior ?? "")}
                        </span>
                      )}
                      {c.created_by && (
                        <span className="truncate text-xs text-gray-400">{c.created_by}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-gray-900">
                      {money(Number(c.saldo) || 0)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
