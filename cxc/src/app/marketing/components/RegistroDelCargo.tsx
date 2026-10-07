"use client";

// ============================================================================
// Marketing › registrar un cargo a la marca (7-oct-2026,
// `MKT_SOLO_COBRABLE_2026_10`, apagado). Las dos piezas propias de la pantalla
// nueva; los datos de la factura siguen siendo los de `FacturaForm`.
//
//   1. COMPROBANTE — arriba de todo: el PDF (o la foto) y la IA llena los datos.
//   2. DESTINO     — debajo de los datos: Marca · Tienda (una, obligatoria) ·
//                    Se cobra 100 % · 50 % · Observaciones, discretas.
//
// Nada viene preseleccionado salvo lo que da el contexto (la marca o la tienda
// desde la que se abrió): son decisiones de una persona (diseno.md, regla 4).
// ============================================================================

import { useState } from "react";
import ClientePicker from "@/components/ClientePicker";
import type { MkMarca } from "@/lib/marketing/types";
import { ENLACE } from "@/lib/marketing/marketing-2026-10";
import { PCT_QUE_SE_COBRA, type DestinoDelCargo } from "@/lib/marketing/solo-cobrable-2026-10";
import { ROTULO_ADJUNTAR_COMPROBANTE, ROTULO_COMPROBANTE, ROTULO_SE_COBRA } from "@/lib/marketing/proveedores-2026-10";

const CAMPO =
  "w-full rounded-md border border-gray-300 px-3 py-2 min-h-[44px] text-base sm:text-sm focus:border-black focus:outline-none bg-white";

const OPCION = (sel: boolean) =>
  `rounded-md border-2 px-3 min-h-[44px] text-sm transition ${
    sel ? "border-black bg-gray-50 font-medium text-gray-900" : "border-gray-200 text-gray-700 hover:border-gray-400"
  }`;

// ─── 1 · EL COMPROBANTE ─────────────────────────────────────────────────────

export function ComprobanteDelCargo({
  archivo,
  leyendo,
  enCelular,
  onAdjuntar,
  onEscanear,
  onQuitar,
}: {
  archivo: string | null;
  leyendo: boolean;
  enCelular: boolean;
  /** Abre el selector de archivo (PDF o foto). */
  onAdjuntar: () => void;
  /** Abre la cámara (solo en el celular). */
  onEscanear: () => void;
  onQuitar: () => void;
}) {
  return (
    <div data-testid="comprobante-del-cargo">
      <div className="text-sm font-medium text-gray-700 mb-1">{ROTULO_COMPROBANTE}</div>
      {leyendo ? (
        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 min-h-[44px] py-2 text-sm text-gray-600 flex items-center">
          Leyendo la factura…
        </div>
      ) : archivo ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 min-h-[44px] py-2 text-sm">
          <span className="text-gray-800 truncate">{archivo}</span>
          <button
            type="button"
            onClick={onQuitar}
            className="shrink-0 text-sm text-gray-600 hover:text-black min-h-[44px] -my-2 inline-flex items-center"
          >
            Quitar
          </button>
        </div>
      ) : enCelular ? (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onEscanear} className={OPCION(false)} data-testid="escanear-cargo">
            Escanear
          </button>
          <button type="button" onClick={onAdjuntar} className={OPCION(false)}>
            Subir PDF
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onAdjuntar}
          className="w-full rounded-md border border-dashed border-gray-300 px-3 min-h-[56px] py-3 text-sm text-gray-600 hover:border-gray-500 hover:text-black transition"
          data-testid="adjuntar-cargo"
        >
          {ROTULO_ADJUNTAR_COMPROBANTE}
        </button>
      )}
    </div>
  );
}

// ─── 2 · EL DESTINO ─────────────────────────────────────────────────────────

export function DestinoDelCargoBloque({
  marcas,
  valor,
  onChange,
  tiendaFija,
  nota,
  onNota,
}: {
  /** Ya ordenadas por la puerta. Solo las activas se ofrecen. */
  marcas: MkMarca[];
  valor: DestinoDelCargo;
  onChange: (v: DestinoDelCargo) => void;
  /** La tienda desde la que se abrió: viene puesta, no se pregunta. */
  tiendaFija: { codigo: string; nombre: string } | null;
  nota: string;
  onNota: (n: string) => void;
}) {
  const [verNota, setVerNota] = useState(nota.trim() !== "");
  const activas = marcas.filter((m) => m.activo !== false);
  const cambiar = (parte: Partial<DestinoDelCargo>) => onChange({ ...valor, ...parte });
  const tienda = valor.tienda;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-5" data-testid="destino-del-cargo">
      <div>
        <div id="cargo-marca" className="text-sm font-medium text-gray-700 mb-1">
          Marca
        </div>
        <div role="radiogroup" aria-labelledby="cargo-marca" className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {activas.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={valor.marcaId === m.id}
              data-marca={m.codigo}
              onClick={() => cambiar({ marcaId: m.id })}
              className={`text-left truncate ${OPCION(valor.marcaId === m.id)}`}
            >
              {m.nombre}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-sm font-medium text-gray-700 mb-1">Tienda</div>
        {tiendaFija ? (
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 min-h-[44px] py-2 text-sm flex items-center gap-2">
            <span className="text-gray-900 font-medium truncate">{tiendaFija.nombre}</span>
            <span className="text-gray-500 tabular-nums">{tiendaFija.codigo}</span>
          </div>
        ) : (
          <ClientePicker
            value={tienda ? tienda.nombre : ""}
            codigo={tienda ? tienda.codigo : ""}
            onChange={(nombre, codigo) =>
              cambiar({ tienda: codigo.trim() ? { codigo: codigo.trim().toUpperCase(), nombre } : null })
            }
            permitirOtro={false}
            placeholder="Buscar…"
            inputClassName={`${CAMPO} pr-16`}
          />
        )}
      </div>

      <div>
        <div id="cargo-se-cobra" className="text-sm font-medium text-gray-700 mb-1">
          {ROTULO_SE_COBRA}
        </div>
        <div role="radiogroup" aria-labelledby="cargo-se-cobra" className="grid grid-cols-2 gap-2 sm:max-w-xs">
          {PCT_QUE_SE_COBRA.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={valor.pct === p}
              data-pct={p}
              onClick={() => cambiar({ pct: p })}
              className={`tabular-nums ${OPCION(valor.pct === p)}`}
            >
              {p} %
            </button>
          ))}
        </div>
      </div>

      {verNota ? (
        <div>
          <label htmlFor="cargo-nota" className="block text-sm font-medium text-gray-700 mb-1">
            Observaciones
          </label>
          <input
            id="cargo-nota"
            type="text"
            value={nota}
            onChange={(e) => onNota(e.target.value)}
            maxLength={120}
            className={CAMPO}
            autoFocus={nota === ""}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setVerNota(true)}
          className={`text-sm min-h-[44px] inline-flex items-center ${ENLACE}`}
        >
          + Agregar observaciones
        </button>
      )}
    </div>
  );
}

// ─── 3 · AL EDITAR: «SE COBRA» CON «NO RECUPERABLE» ─────────────────────────

export type SeCobraAlEditarValor = 100 | 50 | "no-recuperable";

/**
 * 🔴 SOLO LO COBRABLE (7-oct-2026, apagado): la ficha de edición pregunta lo
 * mismo que el registro —Marca y Se cobra— y suma «No recuperable». Es la
 * puerta para que Daniel pase una factura ya cargada (las de Boston, la #145)
 * fuera de la marca y del ZIP; aparece en la pestaña «No recuperable». La
 * marca se conserva: volver a 100 % la devuelve tal cual.
 */
export function SeCobraAlEditar({
  marcas,
  marcaId,
  onMarcaId,
  valor,
  onChange,
}: {
  marcas: MkMarca[];
  marcaId: string;
  onMarcaId: (id: string) => void;
  valor: SeCobraAlEditarValor;
  onChange: (v: SeCobraAlEditarValor) => void;
}) {
  const activas = marcas.filter((m) => m.activo !== false || m.id === marcaId);
  const opciones: ReadonlyArray<{ v: SeCobraAlEditarValor; rotulo: string }> = [
    ...PCT_QUE_SE_COBRA.map((p) => ({ v: p as SeCobraAlEditarValor, rotulo: `${p} %` })),
    { v: "no-recuperable", rotulo: "No recuperable" },
  ];
  return (
    <div className="space-y-5" data-testid="se-cobra-al-editar">
      <div>
        <div id="editar-marca" className="text-sm font-medium text-gray-700 mb-1">
          Marca
        </div>
        <div role="radiogroup" aria-labelledby="editar-marca" className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {activas.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={marcaId === m.id}
              onClick={() => onMarcaId(m.id)}
              className={`text-left truncate ${OPCION(marcaId === m.id)}`}
            >
              {m.nombre}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div id="editar-se-cobra" className="text-sm font-medium text-gray-700 mb-1">
          {ROTULO_SE_COBRA}
        </div>
        <div role="radiogroup" aria-labelledby="editar-se-cobra" className="grid grid-cols-3 gap-2 sm:max-w-md">
          {opciones.map((o) => (
            <button
              key={String(o.v)}
              type="button"
              role="radio"
              aria-checked={valor === o.v}
              data-se-cobra={String(o.v)}
              onClick={() => onChange(o.v)}
              className={`tabular-nums ${OPCION(valor === o.v)}`}
            >
              {o.rotulo}
            </button>
          ))}
        </div>
        {valor === "no-recuperable" && (
          <p className="mt-1 text-xs text-gray-500">No suma a la marca ni entra al ZIP. Queda en «No recuperable».</p>
        )}
      </div>
    </div>
  );
}
