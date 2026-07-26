"use client";

import { useState } from "react";
import { useToast } from "@/components/ToastSystem";
import {
  API_BASE,
  GRUPO_KEY,
  empresaNombre,
  limpiarMonto,
  mesLabel,
  money,
  montoInputValue,
  parseMonto,
  type Categoria,
  type Gasto,
} from "./types";

interface Props {
  empresaKey: string;
  mes: string;
  categorias: Categoria[]; // activas, ordenadas por orden asc
  gastosIniciales: Gasto[]; // gastos existentes de esta empresa+mes
  onVolver: () => void;
  onGuardado: () => Promise<void> | void;
  onCategoriaCreada: () => Promise<unknown> | void;
}

export default function EmpresaGastosForm({
  empresaKey,
  mes,
  categorias,
  gastosIniciales,
  onVolver,
  onGuardado,
  onCategoriaCreada,
}: Props) {
  const { toast } = useToast();

  // Estado inicializado 1 sola vez por (empresa, mes) — el padre remonta con
  // key={`${empresa}-${mes}`}, así los revalidates de SWR no pisan lo tecleado.
  const [montos, setMontos] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const g of gastosIniciales) m[String(g.categoria_id)] = montoInputValue(Number(g.monto) || 0);
    return m;
  });
  const [notas, setNotas] = useState<Record<string, string>>(() => {
    const n: Record<string, string> = {};
    for (const g of gastosIniciales) if (g.notas) n[String(g.categoria_id)] = g.notas;
    return n;
  });
  const [notaAbierta, setNotaAbierta] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    for (const g of gastosIniciales) if (g.notas) o[String(g.categoria_id)] = true;
    return o;
  });
  const [guardando, setGuardando] = useState(false);

  const nombre = empresaKey === GRUPO_KEY ? "Grupo (compartidos)" : empresaNombre(empresaKey);

  // Total en vivo del formulario (solo montos con valor).
  let total = 0;
  let hayInvalido = false;
  for (const c of categorias) {
    const raw = montos[String(c.id)] ?? "";
    const n = parseMonto(raw);
    if (raw.trim() && n == null) hayInvalido = true;
    if (n != null) total += n;
  }

  const guardar = async () => {
    if (hayInvalido) {
      toast("Revisa los montos marcados en rojo.", "error");
      return;
    }
    setGuardando(true);
    try {
      // Solo filas con valor: los inputs vacíos se omiten y el server los
      // elimina (reconciliación completa de esa empresa+mes).
      const items = categorias
        .map((c) => {
          const n = parseMonto(montos[String(c.id)] ?? "");
          if (n == null) return null;
          const nota = (notas[String(c.id)] ?? "").trim();
          return nota ? { categoria_id: c.id, monto: n, notas: nota } : { categoria_id: c.id, monto: n };
        })
        .filter((x): x is NonNullable<typeof x> => x != null);

      const res = await fetch(`${API_BASE}/gastos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_key: empresaKey, mes, items }),
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
    <div>
      {/* Encabezado del formulario */}
      <div className="mb-4">
        <button
          onClick={onVolver}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition min-h-[44px] -ml-1 px-1"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          Volver al checklist
        </button>
        <h1 className="text-xl font-semibold tracking-tight text-gray-900 mt-1">{nombre}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Gastos de {mesLabel(mes)}
          {empresaKey === GRUPO_KEY ? " · se reparte entre las empresas según sus ventas del mes" : ""}
        </p>
      </div>

      {/* Filas por categoría */}
      <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
        {categorias.length === 0 && (
          <p className="p-4 text-sm text-gray-400">
            Todavía no hay categorías. Agrega la primera aquí abajo.
          </p>
        )}
        {categorias.map((c) => {
          const id = String(c.id);
          const raw = montos[id] ?? "";
          const invalido = !!raw.trim() && parseMonto(raw) == null;
          return (
            <div key={id} className="p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{c.nombre}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className={`text-xs font-medium rounded-full px-1.5 py-px ${
                        c.es_fijo ? "bg-green-50 text-green-700 border border-green-200" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {c.es_fijo ? "fijo" : "variable"}
                    </span>
                    <button
                      onClick={() => setNotaAbierta((p) => ({ ...p, [id]: !p[id] }))}
                      className="text-xs text-gray-400 hover:text-gray-600 transition"
                    >
                      {notaAbierta[id] ? "− nota" : "+ nota"}
                    </button>
                  </div>
                </div>
                <input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={raw}
                  onChange={(e) => setMontos((p) => ({ ...p, [id]: limpiarMonto(e.target.value) }))}
                  className={`w-32 shrink-0 text-right text-base tabular-nums border rounded-md px-3 py-2.5 outline-none transition ${
                    invalido ? "border-red-400 focus:border-red-500" : "border-gray-200 focus:border-black"
                  }`}
                />
              </div>
              {notaAbierta[id] && (
                <input
                  type="text"
                  placeholder="Nota (opcional)"
                  value={notas[id] ?? ""}
                  onChange={(e) => setNotas((p) => ({ ...p, [id]: e.target.value }))}
                  className="mt-2 w-full border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-black transition"
                />
              )}
            </div>
          );
        })}
      </div>

      <AgregarCategoria onCreada={onCategoriaCreada} />

      {/* Footer sticky: total + guardar */}
      <div className="sticky bottom-0 -mx-4 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-gray-50/95 backdrop-blur border-t border-gray-200 mt-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-500">Total del mes</span>
          <span className="text-base font-semibold tabular-nums text-gray-900">{money(total)}</span>
        </div>
        <button
          onClick={guardar}
          disabled={guardando}
          className="w-full rounded-md bg-black text-white py-3 text-sm font-medium active:scale-[0.97] transition disabled:opacity-50"
        >
          {guardando ? "Guardando…" : `Guardar gastos de ${empresaKey === GRUPO_KEY ? "Grupo" : empresaNombre(empresaKey)}`}
        </button>
      </div>
    </div>
  );
}

// ── "+ Agregar categoría" (mini-form inline) ─────────────────────────────────

function AgregarCategoria({ onCreada }: { onCreada: () => Promise<unknown> | void }) {
  const { toast } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [esFijo, setEsFijo] = useState(true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const crear = async () => {
    const n = nombre.trim();
    if (!n) {
      setError("Escribe el nombre de la categoría.");
      return;
    }
    setGuardando(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/categorias`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: n, es_fijo: esFijo }),
      });
      if (res.status === 409) {
        setError("Ya existe una categoría con ese nombre.");
        return;
      }
      if (!res.ok) throw new Error("err");
      toast("Categoría agregada");
      setNombre("");
      setEsFijo(true);
      setAbierto(false);
      await onCreada();
    } catch {
      setError("No se pudo agregar. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="mt-3 w-full rounded-md border border-dashed border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-500 hover:border-gray-400 hover:text-gray-700 active:scale-[0.99] transition"
      >
        + Agregar categoría
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-sm font-medium text-gray-900 mb-2">Nueva categoría</div>
      <input
        type="text"
        placeholder="Nombre de la categoría"
        value={nombre}
        onChange={(e) => { setNombre(e.target.value); setError(""); }}
        className="w-full border border-gray-200 rounded-md px-3 py-2.5 text-sm outline-none focus:border-black transition"
      />
      <label className="flex items-center gap-2.5 mt-3 cursor-pointer select-none min-h-[44px]">
        <button
          type="button"
          role="switch"
          aria-checked={esFijo}
          onClick={() => setEsFijo((v) => !v)}
          className={`relative w-10 h-6 rounded-full transition shrink-0 ${esFijo ? "bg-green-600" : "bg-gray-300"}`}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${esFijo ? "left-[1.125rem]" : "left-0.5"}`}
          />
        </button>
        <span className="text-sm text-gray-700">Gasto fijo</span>
      </label>
      <p className="text-xs text-gray-400 mt-0.5">Los gastos fijos se usan para el punto de equilibrio</p>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      <div className="flex gap-2 mt-3">
        <button
          onClick={crear}
          disabled={guardando}
          className="flex-1 rounded-md bg-black text-white py-2.5 text-sm font-medium active:scale-[0.97] transition disabled:opacity-50"
        >
          {guardando ? "Agregando…" : "Agregar"}
        </button>
        <button
          onClick={() => { setAbierto(false); setError(""); }}
          className="rounded-md border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:border-gray-300 active:scale-[0.97] transition"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
