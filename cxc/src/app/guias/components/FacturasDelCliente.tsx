"use client";

// ─────────────────────────────────────────────────────────────────────────────
// FACTURAS DEL CLIENTE — el cliente se elige UNA vez y se marcan sus facturas.
//
// Daniel aprobó el mockup: «va» (3-sep-2026). Hoy, con un cliente que compró en
// 3 empresas, se hacen 3 envíos y el cliente se escribe 3 veces; acá se marca
// cada factura y la EMPRESA y el NÚMERO los pone la factura. Al guardar salen
// los mismos envíos de siempre, uno por empresa (`guia_items`) — la tabla, la
// guía impresa y el Excel no cambian ni un campo.
//
// 🔴 TODO ES ATAJO, JAMÁS CANDADO. Elegir cliente sigue sin ser obligatorio y
// escribir cliente, empresa y facturas a mano sigue funcionando igual que hoy
// (los renglones de abajo no cambiaron). Este panel entero cuelga de
// `GUIAS_ATAJOS_NUEVOS` — en `false` no se dibuja y la pantalla es la de hoy.
//
// 🔴 «Ya salió en otra guía» es AVISO, nunca bloqueo: la casilla se puede
// marcar igual. Y el sistema puede afirmar «ya salió», pero NO lo contrario
// (hay facturas sin guía que son mostrador o retiro en bodega).
//
// Fail-open de punta a punta: si la lista no carga, se dice y se escribe a
// mano como siempre. «Buscar otra vez» dispara la lectura corta de HOY
// (/api/guias/facturas-hoy) y vuelve a pedir la lista.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import ClientePicker from "@/components/ClientePicker";
import type { ClienteHit } from "@/lib/hooks/useBusquedaClientes";
import type { GuiaItem } from "./types";
import { hoyPanama } from "@/lib/fecha-panama";
import {
  FACTURAS_VISIBLES_INICIAL,
  FACTURA_TRASLADO,
  ORDEN_GRUPOS,
  TITULO_GRUPO,
  desmarcarFactura,
  facturaMarcada,
  grupoDeFecha,
  marcarFactura,
  renglonDelCliente,
  type FacturaDelCliente as Factura,
} from "@/lib/guias/atajos-facturas";

interface Props {
  items: GuiaItem[];
  /** Reemplaza los renglones del formulario (el hook renumera y asigna uid). */
  onReemplazarItems: (items: GuiaItem[]) => void;
  /** Clientes más usados en guías, para elegir sin teclear. */
  clientesTop?: ClienteHit[];
  /**
   * El destino que se AUTOLLENA al marcar la primera factura del cliente
   * (4-sep-2026, Daniel: «sí quiero que se llene sola…»): lo calcula GuiaForm
   * con `destinoParaAutollenar` — UN solo destino (definido o único en la
   * historia agrupada) o null. Solo entra en filas que nacen acá; lo escrito
   * a mano nunca se pisa.
   */
  destinoAutollenadoDe?: (codigo: string) => string | null;
}

function fmtMonto(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Hora si es de hoy; si no, la fecha corta. */
function rotuloFecha(fechaIso: string, hoy: string): string {
  const d = new Date(fechaIso);
  if (Number.isNaN(d.getTime())) return "";
  const enPanama = new Intl.DateTimeFormat("es-PA", {
    timeZone: "America/Panama",
    ...(grupoDeFecha(fechaIso, hoy) === "hoy"
      ? { hour: "numeric", minute: "2-digit" }
      : { day: "numeric", month: "short" }),
  });
  return enPanama.format(d);
}

function horaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("es-PA", {
    timeZone: "America/Panama",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export default function FacturasDelCliente({ items, onReemplazarItems, clientesTop, destinoAutollenadoDe }: Props) {
  const [cliente, setCliente] = useState<{ nombre: string; codigo: string } | null>(null);
  const [facturas, setFacturas] = useState<Factura[] | null>(null);
  const [hasta, setHasta] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [sinLista, setSinLista] = useState(false);
  const [verTodas, setVerTodas] = useState(false);
  const [buscandoOtraVez, setBuscandoOtraVez] = useState(false);

  const hoy = hoyPanama();

  const cargarFacturas = useCallback(async (codigo: string) => {
    setCargando(true);
    setSinLista(false);
    try {
      const r = await fetch(`/api/guias/facturas-cliente?codigo=${encodeURIComponent(codigo)}`, {
        cache: "no-store",
      });
      if (!r.ok) throw new Error("no ok");
      const d = (await r.json()) as { facturas?: Factura[]; hasta?: string | null };
      setFacturas(Array.isArray(d.facturas) ? d.facturas : []);
      setHasta(d.hasta ?? null);
    } catch {
      // Fail-open: sin lista se escribe a mano, como siempre.
      setFacturas(null);
      setSinLista(true);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (cliente?.codigo) void cargarFacturas(cliente.codigo);
  }, [cliente?.codigo, cargarFacturas]);

  /** «Buscar otra vez»: primero la lectura corta de HOY, después la lista. */
  async function buscarOtraVez() {
    if (!cliente?.codigo || buscandoOtraVez) return;
    setBuscandoOtraVez(true);
    try {
      await fetch("/api/guias/facturas-hoy", { method: "POST" }).catch(() => {});
      await cargarFacturas(cliente.codigo);
    } finally {
      setBuscandoOtraVez(false);
    }
  }

  /** El destino único del cliente elegido (o null): viaja a marcar, desmarcar
   *  y a los dos botones de siempre, para que el renglón nazca con su destino. */
  const destinoAuto = cliente ? (destinoAutollenadoDe?.(cliente.codigo) ?? null) : null;

  function toggle(f: Factura) {
    if (!cliente) return;
    const marcada = facturaMarcada(items, cliente, f);
    const nuevos = marcada
      ? desmarcarFactura(items, cliente, f, destinoAuto)
      : marcarFactura(items, cliente, f, destinoAuto);
    onReemplazarItems(nuevos as GuiaItem[]);
  }

  const visibles = facturas ? (verTodas ? facturas : facturas.slice(0, FACTURAS_VISIBLES_INICIAL)) : [];
  const ocultas = facturas ? facturas.length - visibles.length : 0;

  const grupos = ORDEN_GRUPOS.map((g) => ({
    grupo: g,
    facturas: visibles.filter((f) => grupoDeFecha(f.fecha, hoy) === g),
  })).filter((g) => g.facturas.length > 0);

  return (
    <div data-testid="facturas-del-cliente" className="mb-8">
      <div className="text-xs uppercase tracking-[0.05em] text-gray-400 mb-4">
        Facturas del cliente
      </div>
      <div className="border border-gray-200 rounded-lg p-4">
        <div className="max-w-sm">
          <ClientePicker
            id="facturas-cliente"
            value={cliente?.nombre ?? ""}
            codigo={cliente?.codigo ?? ""}
            topClientes={clientesTop}
            // Acá el cliente sale del directorio: las facturas viven amarradas
            // a su código. El que no está se escribe a mano en los envíos de
            // abajo, exactamente como hoy.
            permitirOtro={false}
            onChange={(nombre, codigo) => {
              setVerTodas(false);
              setCliente(codigo ? { nombre, codigo } : null);
              if (!codigo) setFacturas(null);
            }}
          />
        </div>

        {cliente && (
          <div className="mt-4">
            {cargando && <p className="text-sm text-gray-400">Buscando facturas…</p>}

            {!cargando && sinLista && (
              <p className="text-sm text-amber-700">
                No se pudieron cargar las facturas. Escribe los datos a mano abajo, como siempre.
              </p>
            )}

            {!cargando && facturas && facturas.length === 0 && (
              <p className="text-sm text-gray-500">
                Este cliente no tiene facturas registradas. Escribe los datos a mano abajo.
              </p>
            )}

            {!cargando && facturas && facturas.length > 0 && (
              <div className="space-y-4">
                {grupos.map(({ grupo, facturas: fs }) => (
                  <div key={grupo}>
                    <div className="text-xs uppercase tracking-[0.05em] text-gray-400 mb-1">
                      {TITULO_GRUPO[grupo]}
                    </div>
                    <ul>
                      {fs.map((f) => {
                        const marcada = cliente ? facturaMarcada(items, cliente, f) : false;
                        return (
                          <li key={`${f.empresa_key}-${f.secuencial}`}>
                            <label className="flex items-center gap-3 py-1.5 min-h-[44px] cursor-pointer text-sm">
                              <input
                                type="checkbox"
                                checked={marcada}
                                onChange={() => toggle(f)}
                                className="w-4 h-4 shrink-0 accent-black"
                              />
                              <span className="font-mono tabular-nums shrink-0">{f.secuencial}</span>
                              <span className="text-gray-500 truncate">{f.empresa}</span>
                              <span className="tabular-nums text-gray-600 ml-auto shrink-0">
                                {fmtMonto(f.total)}
                              </span>
                              <span className="text-gray-400 tabular-nums shrink-0 w-14 text-right">
                                {rotuloFecha(f.fecha, hoy)}
                              </span>
                              {/* 🔴 AVISO, NUNCA BLOQUEO: se puede marcar igual. */}
                              {f.yaSalioEn != null && (
                                <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 shrink-0">
                                  Ya salió en GT-{String(f.yaSalioEn).padStart(3, "0")}
                                </span>
                              )}
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}

                {ocultas > 0 && (
                  <button
                    type="button"
                    onClick={() => setVerTodas(true)}
                    className="text-sm text-gray-400 hover:text-black transition inline-flex items-center min-h-[44px] px-2 -mx-2"
                  >
                    Ver más ({ocultas})
                  </button>
                )}
              </div>
            )}

            {!cargando && (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 pt-3">
                {hasta && (
                  <span className="text-xs text-gray-400">hasta las {horaCorta(hasta)}</span>
                )}
                <button
                  type="button"
                  onClick={() => void buscarOtraVez()}
                  disabled={buscandoOtraVez}
                  className="text-xs text-gray-400 hover:text-black transition inline-flex items-center min-h-[44px] px-2 -mx-2 disabled:opacity-40"
                >
                  {buscandoOtraVez ? "Buscando…" : "Buscar otra vez"}
                </button>
                <span className="flex-1" />
                {/* Los dos caminos de siempre, con el cliente ya puesto. */}
                <button
                  type="button"
                  onClick={() => onReemplazarItems(renglonDelCliente(items, cliente, "", destinoAuto) as GuiaItem[])}
                  className="text-xs text-gray-400 hover:text-black transition inline-flex items-center min-h-[44px] px-2"
                >
                  No está en la lista
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onReemplazarItems(renglonDelCliente(items, cliente, FACTURA_TRASLADO, destinoAuto) as GuiaItem[])
                  }
                  className="text-xs text-gray-400 hover:text-black transition inline-flex items-center min-h-[44px] px-2"
                >
                  Traslado sin factura
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
