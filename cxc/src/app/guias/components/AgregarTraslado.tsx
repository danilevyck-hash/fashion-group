"use client";

// ─────────────────────────────────────────────────────────────────────────────
// NUEVA GUÍA › «+ AGREGAR TRASLADO» (5-oct-2026, `GUIA_AGREGAR_TRASLADO_2026_10`).
//
// Los MISMOS campos que el traslado de Etiquetas: Cliente (también escrito a
// mano) · Contenido · Bultos · Destino (prellenado con «el de siempre») ·
// «Empresa: Ninguna ▾», opcional.
//
// 🔴 SE GUARDA IGUAL QUE ANTES: un renglón con el TEXTO `Traslado` en facturas
// (empresa vacía si «Ninguna») y el contenido en Observaciones con la MISMA
// regla del envío etiquetado: «Traslado <cliente>: <contenido>»
// (`lineaDeTrasladoDe`). Sin migración.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import ClientePicker from "@/components/ClientePicker";
import { CODIGOS_RETIRADOS_DE_GUIAS } from "@/lib/guias/american-classics";
import type { ClienteHit } from "@/lib/hooks/useBusquedaClientes";
import { TEXTO_TRASLADO } from "@/lib/guias/atajos-facturas";
import { MAX_NOTA, lineaDeTrasladoDe, normalizarNota } from "@/lib/guias/etiquetas-por-envio";
import { B2B_EMPRESA_KEYS, mapEmpresaName } from "@/lib/empresa-mapping";
import { emptyItem } from "./constants";
import { conRenglonNuevo } from "./AgregarSinEtiquetas";
import type { GuiaItem } from "./types";

const CAMPO = "rounded-md border border-gray-300 px-3 text-base outline-none transition focus:border-black min-h-[44px] md:text-sm";

/** El renglón del traslado y su línea de Observaciones, o lo que falta (todo de una vez). */
export function armarTraslado(d: {
  cliente: { nombre: string; codigo: string } | null;
  contenido: string;
  bultos: string;
  destino: string;
  empresaKey: string;
  orden: number;
}): { ok: true; item: GuiaItem; linea: string } | { ok: false; falta: string[] } {
  const falta: string[] = [];
  const nombre = d.cliente?.nombre.trim() ?? "";
  const nota = normalizarNota(d.contenido);
  const bultos = Number(d.bultos);
  if (!nombre) falta.push("el cliente");
  if (!nota.ok) falta.push(nota.error);
  else if (!nota.valor) falta.push("el contenido");
  if (!(Number.isInteger(bultos) && bultos > 0)) falta.push("los bultos");
  if (!d.destino.trim()) falta.push("el destino");
  if (falta.length > 0 || !nota.ok || !nota.valor) return { ok: false, falta };
  return {
    ok: true,
    item: {
      ...emptyItem(d.orden),
      cliente: nombre,
      cliente_codigo: d.cliente?.codigo ?? "",
      direccion: d.destino.trim(),
      empresa: d.empresaKey ? mapEmpresaName(d.empresaKey) : "",
      facturas: TEXTO_TRASLADO,
      bultos,
      contenido_traslado: nota.valor,
    },
    linea: lineaDeTrasladoDe(nombre, nota.valor),
  };
}

interface Props {
  items: GuiaItem[];
  onReemplazarItems: (items: GuiaItem[]) => void;
  onLineaDeTraslado?: (linea: string, poner: boolean) => void;
  onCerrar: () => void;
  clientesTop?: ClienteHit[];
  destinoAutollenadoDe?: (codigo: string) => string | null;
}

export default function AgregarTraslado({ items, onReemplazarItems, onLineaDeTraslado, onCerrar, clientesTop, destinoAutollenadoDe }: Props) {
  const [cliente, setCliente] = useState<{ nombre: string; codigo: string } | null>(null);
  const [contenido, setContenido] = useState("");
  const [bultos, setBultos] = useState("");
  const [destino, setDestino] = useState("");
  const [empresaKey, setEmpresaKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  function elegirCliente(nombre: string, codigo: string) {
    setCliente(nombre.trim() || codigo ? { nombre: nombre.trim(), codigo } : null);
    setError(null);
    if (codigo) setDestino(destinoAutollenadoDe?.(codigo) ?? "");
  }

  function agregar() {
    const r = armarTraslado({ cliente, contenido, bultos, destino, empresaKey, orden: items.length + 1 });
    if (!r.ok) {
      setError(`Falta: ${r.falta.join(" · ")}`);
      return;
    }
    onReemplazarItems(conRenglonNuevo(items, r.item).items);
    onLineaDeTraslado?.(r.linea, true);
    onCerrar();
  }

  return (
    <div data-testid="agregar-traslado" className="mt-3 rounded-lg border border-gray-200 p-4">
      <div className="max-w-sm">
        <ClientePicker
          id="traslado-cliente"
          value={cliente?.nombre ?? ""}
          codigo={cliente?.codigo ?? ""}
          topClientes={clientesTop}
          codigosOcultos={CODIGOS_RETIRADOS_DE_GUIAS}
          permitirOtro
          onChange={elegirCliente}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] flex-1">
          <label htmlFor="nueva-traslado-contenido" className="mb-1 block text-xs text-gray-500">Contenido</label>
          <input
            id="nueva-traslado-contenido"
            type="text"
            maxLength={MAX_NOTA}
            autoCapitalize="characters"
            value={contenido}
            onChange={(e) => { setContenido(e.target.value.toUpperCase()); setError(null); }}
            placeholder="Ej.: 3 MUEBLES CK"
            className={`w-full max-w-[240px] uppercase ${CAMPO}`}
          />
        </div>
        <div>
          <label htmlFor="nueva-traslado-bultos" className="mb-1 block text-xs text-gray-500">Bultos</label>
          <input
            id="nueva-traslado-bultos"
            type="number"
            min={1}
            inputMode="numeric"
            value={bultos}
            onChange={(e) => { setBultos(e.target.value); setError(null); }}
            className={`w-24 text-right tabular-nums ${CAMPO}`}
          />
        </div>
        <div className="min-w-[200px] flex-1">
          <label htmlFor="nueva-traslado-destino" className="mb-1 block text-xs text-gray-500">Destino</label>
          <input
            id="nueva-traslado-destino"
            type="text"
            list="direcciones-list"
            value={destino}
            onChange={(e) => { setDestino(e.target.value); setError(null); }}
            className={`w-full max-w-sm ${CAMPO}`}
          />
        </div>
        {/* Igual que en Etiquetas: el caso raro, un desplegable chico que nace en «Ninguna». */}
        <select
          aria-label="Empresa del traslado"
          value={empresaKey}
          onChange={(e) => { setEmpresaKey(e.target.value); setError(null); }}
          className="min-h-[44px] rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-700 outline-none transition focus:border-black"
        >
          <option value="">Empresa: Ninguna</option>
          {B2B_EMPRESA_KEYS.map((k) => (
            <option key={k} value={k}>{`Empresa: ${mapEmpresaName(k)}`}</option>
          ))}
        </select>
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
