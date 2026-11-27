"use client";

// ─────────────────────────────────────────────────────────────────────────────
// NUEVA GUÍA › «ENVÍO SIN FACTURA» (26-nov-2026, `GUIA_ENVIO_SIN_FACTURA_2026_11`).
// Reemplaza «+ Agregar traslado». Campos: Qué lleva (obligatorio, con
// sugerencias que se tocan) · Empresa (obligatoria; «Ninguna» para documentos)
// · Cliente · Bultos · Destino. Sale un renglón con
// `facturas = «Sin factura · <qué lleva>»` (lib/guias/envio-sin-factura.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import ClientePicker from "@/components/ClientePicker";
import { CODIGOS_RETIRADOS_DE_GUIAS } from "@/lib/guias/american-classics";
import type { ClienteHit } from "@/lib/hooks/useBusquedaClientes";
import { ALL_EMPRESA_KEYS, mapEmpresaName } from "@/lib/empresa-mapping";
import {
  MAX_QUE_LLEVA,
  SUGERENCIAS_QUE_LLEVA,
  facturasSinFactura,
  limpiarQueLleva,
} from "@/lib/guias/envio-sin-factura";
import { emptyItem } from "./constants";
import { conRenglonNuevo } from "./AgregarSinEtiquetas";
import type { GuiaItem } from "./types";

const CAMPO = "w-full rounded-md border border-gray-300 px-3 text-base outline-none transition focus:border-black min-h-[44px] md:text-sm";
const ROTULO = "mb-1 block text-xs text-gray-500";
/** El valor del desplegable para «Ninguna»: se guarda como empresa vacía. */
export const EMPRESA_NINGUNA = "__ninguna__";

export function armarEnvioSinFactura(d: {
  queLleva: string;
  empresa: string;
  cliente: { nombre: string; codigo: string } | null;
  bultos: string;
  destino: string;
  orden: number;
}): { ok: true; item: GuiaItem } | { ok: false; falta: string[] } {
  const falta: string[] = [];
  const queLleva = limpiarQueLleva(d.queLleva);
  const nombre = d.cliente?.nombre.trim() ?? "";
  const bultos = Number(d.bultos);
  if (!queLleva) falta.push("qué lleva");
  if (!d.empresa) falta.push("la empresa");
  if (!nombre) falta.push("el cliente");
  if (!(Number.isInteger(bultos) && bultos > 0)) falta.push("los bultos");
  if (!d.destino.trim()) falta.push("el destino");
  if (falta.length > 0) return { ok: false, falta };
  return {
    ok: true,
    item: {
      ...emptyItem(d.orden),
      cliente: nombre,
      cliente_codigo: d.cliente?.codigo ?? "",
      direccion: d.destino.trim(),
      empresa: d.empresa === EMPRESA_NINGUNA ? "" : d.empresa,
      facturas: facturasSinFactura(queLleva),
      bultos,
    },
  };
}

interface Props {
  items: GuiaItem[];
  onReemplazarItems: (items: GuiaItem[]) => void;
  onCerrar: () => void;
  clientesTop?: ClienteHit[];
  destinoAutollenadoDe?: (codigo: string) => string | null;
}

export default function AgregarSinFactura({ items, onReemplazarItems, onCerrar, clientesTop, destinoAutollenadoDe }: Props) {
  const [queLleva, setQueLleva] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [cliente, setCliente] = useState<{ nombre: string; codigo: string } | null>(null);
  const [bultos, setBultos] = useState("");
  const [destino, setDestino] = useState("");
  const [error, setError] = useState<string | null>(null);

  function elegirCliente(nombre: string, codigo: string) {
    setCliente(nombre.trim() || codigo ? { nombre: nombre.trim(), codigo } : null);
    setError(null);
    if (codigo) setDestino(destinoAutollenadoDe?.(codigo) ?? "");
  }

  function agregar() {
    const r = armarEnvioSinFactura({ queLleva, empresa, cliente, bultos, destino, orden: items.length + 1 });
    if (!r.ok) {
      setError(`Falta: ${r.falta.join(" · ")}`);
      return;
    }
    onReemplazarItems(conRenglonNuevo(items, r.item).items);
    onCerrar();
  }

  return (
    <div data-testid="agregar-sin-factura" className="mt-3 rounded-lg border border-gray-200 p-4">
      <label htmlFor="sin-factura-que-lleva" className={ROTULO}>Qué lleva</label>
      <input
        id="sin-factura-que-lleva"
        type="text"
        maxLength={MAX_QUE_LLEVA}
        value={queLleva}
        onChange={(e) => { setQueLleva(e.target.value); setError(null); }}
        className={`max-w-sm ${CAMPO}`}
      />
      <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Usados antes">
        {SUGERENCIAS_QUE_LLEVA.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => { setQueLleva(s); setError(null); }}
            aria-pressed={queLleva === s}
            className={`inline-flex min-h-[32px] items-center rounded-full border px-3 text-xs transition active:scale-[0.97] ${
              queLleva === s ? "border-black bg-black text-white" : "border-gray-200 text-gray-600 hover:border-gray-400"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="sin-factura-empresa" className={ROTULO}>Empresa</label>
          <select
            id="sin-factura-empresa"
            value={empresa}
            onChange={(e) => { setEmpresa(e.target.value); setError(null); }}
            className={`bg-white ${CAMPO}`}
          >
            <option value="">Seleccionar empresa…</option>
            {ALL_EMPRESA_KEYS.map((k) => (
              <option key={k} value={mapEmpresaName(k)}>{mapEmpresaName(k)}</option>
            ))}
            <option value={EMPRESA_NINGUNA}>Ninguna (documentos o sobres)</option>
          </select>
        </div>
        <div>
          <label htmlFor="sin-factura-cliente" className={ROTULO}>Cliente</label>
          <ClientePicker
            id="sin-factura-cliente"
            inputClassName={CAMPO}
            value={cliente?.nombre ?? ""}
            codigo={cliente?.codigo ?? ""}
            topClientes={clientesTop}
            codigosOcultos={CODIGOS_RETIRADOS_DE_GUIAS}
            permitirOtro
            onChange={elegirCliente}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[96px_1fr] gap-4">
        <div>
          <label htmlFor="sin-factura-bultos" className={ROTULO}>Bultos</label>
          <input
            id="sin-factura-bultos"
            type="number"
            min={1}
            inputMode="numeric"
            value={bultos}
            onChange={(e) => { setBultos(e.target.value); setError(null); }}
            className={`text-right tabular-nums ${CAMPO}`}
          />
        </div>
        <div>
          <label htmlFor="sin-factura-destino" className={ROTULO}>Destino</label>
          <input
            id="sin-factura-destino"
            type="text"
            list="direcciones-list"
            value={destino}
            onChange={(e) => { setDestino(e.target.value); setError(null); }}
            className={`max-w-sm ${CAMPO}`}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={agregar}
          className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-black px-4 text-sm font-medium text-white transition hover:bg-gray-800 active:scale-[0.97]"
        >
          Agregar a la guía
        </button>
        <button type="button" onClick={onCerrar} className="inline-flex min-h-[44px] items-center text-xs text-gray-400 transition hover:text-black">
          Cerrar
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-amber-700">{error}</p>}
    </div>
  );
}
