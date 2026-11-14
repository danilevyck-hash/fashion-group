"use client";

// Plantilla Switch › Tallas por bulto — el «Excel de tallas» de un pedido o de
// una factura (13/14-nov-2026). Se escribe el número (completo o sus últimos
// dígitos); el servidor lo busca en pedidos activos y facturas de las 6 empresas
// (varios = se toca uno), lee sus renglones y las tallas de los despachos del
// proveedor, y de esas MISMAS
// filas salen la vista previa y el Excel (`lib/tallas-pedido/excel.ts`).

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { fmtDate } from "@/lib/format";
import type { PedidoEncontrado, TipoDocumento } from "@/lib/tallas-pedido/server";
import { idDelPedido, nombreDelArchivo, type FilaTallas, type ResumenTallas } from "@/lib/tallas-pedido/armar";
import { logActivityClient } from "@/lib/logActivityClient";
import { Aviso } from "@/components/ui/Aviso";

interface Respuesta {
  tipo: TipoDocumento;
  empresa: string;
  pedido: { secuencial: string; cliente: string | null };
  filas: FilaTallas[];
  resumen: ResumenTallas;
  hoy: string;
}

// En pantalla, los dos tonos de la paleta; el Excel lleva el amarillo y el naranja de verdad.
const FONDO_FILA = { amarillo: "bg-amber-100", naranja: "bg-amber-300" } as const;
const TIPO = { pedido: "Pedido", factura: "Factura" } as const;
const campo = "mt-1 h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900";

export default function TallasDePedido() {
  // Nada = buscar en las 6 empresas; puesto = el que se tocó en la lista.
  const [elegido, setElegido] = useState<PedidoEncontrado | null>(null);
  const [opciones, setOpciones] = useState<PedidoEncontrado[]>([]);
  const [pedido, setPedido] = useState("");
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [bajando, setBajando] = useState(false);

  // Se lee solo: medio segundo después de escribir un número de pedido válido.
  useEffect(() => {
    setDatos(null);
    setOpciones([]);
    setError("");
    if (idDelPedido(pedido) === null) return;
    let vigente = true;
    const t = setTimeout(async () => {
      setCargando(true);
      try {
        const q = elegido
          ? `empresa=${elegido.empresa}&tipo=${elegido.tipo}&id=${elegido.id}`
          : `pedido=${encodeURIComponent(pedido.trim())}`;
        const r = await fetch(`/api/productos/tallas-pedido?${q}`);
        const j = await r.json().catch(() => ({}));
        if (!vigente) return;
        if (!r.ok) setError(j.error ?? "No se pudo leer el pedido o la factura.");
        else if (j.opciones) setOpciones(j.opciones);
        else setDatos(j as Respuesta);
      } catch {
        if (vigente) setError("Sin conexión. Intenta de nuevo.");
      } finally {
        if (vigente) setCargando(false);
      }
    }, 500);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [elegido, pedido]);

  const descargar = async () => {
    if (!datos || bajando) return;
    setBajando(true);
    try {
      const [{ libroDeTallas }, { downloadWorkbook }] = await Promise.all([
        import("@/lib/tallas-pedido/excel"),
        import("@/lib/excel-export"),
      ]);
      downloadWorkbook(libroDeTallas(datos.filas, `${TIPO[datos.tipo]} ${datos.pedido.secuencial}`), nombreDelArchivo(datos.pedido.secuencial, datos.hoy));
      logActivityClient({
        action: "descarga_tallas_pedido",
        module: "depurador",
        details: { tipo: datos.tipo, empresa: datos.empresa, pedido: datos.pedido.secuencial, ...datos.resumen },
      });
    } finally {
      setBajando(false);
    }
  };

  return (
    <section className="mb-8" aria-label="Excel de tallas de un pedido o factura">
      <label className="block max-w-sm text-xs font-medium text-gray-500">
        Número de pedido o factura
        <input
          className={`${campo} tabular-nums`}
          inputMode="numeric"
          placeholder="Número completo o últimos dígitos"
          value={pedido}
          onChange={(e) => {
            setElegido(null);
            setPedido(e.target.value);
          }}
        />
      </label>

      {cargando && <p className="mt-3 text-sm text-gray-500">Buscando…</p>}
      {error && <Aviso tono="error" className="mt-3">{error}</Aviso>}

      {opciones.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-sm text-gray-600">Hay {opciones.length} resultados con ese número. Selecciona uno:</p>
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
            {opciones.map((o) => (
              <li key={`${o.tipo}-${o.empresa}-${o.id}`}>
                <button
                  type="button"
                  onClick={() => {
                    setElegido(o);
                    setPedido(o.secuencial);
                  }}
                  className="flex w-full flex-wrap items-baseline gap-x-2 px-4 py-3 text-left text-sm hover:bg-gray-50 active:bg-gray-100"
                >
                  <span className="font-medium text-gray-900">{TIPO[o.tipo]}</span>
                  <span className="text-gray-600">·</span>
                  <span className="font-medium text-gray-900">{nombreCortoEmpresa(o.empresa)}</span>
                  <span className="text-gray-600">· {o.cliente} · {fmtDate(o.fecha)} ·</span>
                  <span className="tabular-nums text-gray-900">{o.secuencial}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {datos && (
        <>
          <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-sm text-gray-900">
              <span className="font-semibold">{TIPO[datos.tipo]} {datos.pedido.secuencial}</span> · {nombreCortoEmpresa(datos.empresa)}
              {datos.pedido.cliente && <> · {datos.pedido.cliente}</>} · <span className="tabular-nums">{datos.resumen.pares}</span> pares
            </div>
            <div className="mt-1 text-sm tabular-nums text-gray-600">
              {datos.resumen.referencias} referencias · {datos.resumen.conTallas} con tallas
              {datos.resumen.aMano > 0 && (
                <> · <span className="font-medium text-amber-700">{datos.resumen.aMano} a llenar a mano</span></>
              )}
            </div>
            <button
              type="button"
              onClick={descargar}
              disabled={bajando}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-black px-5 py-3 text-sm font-medium text-white transition-all hover:bg-gray-800 active:scale-[0.97] disabled:opacity-40 sm:w-auto"
            >
              <Download className="h-4 w-4" strokeWidth={2} />
              {bajando ? "Generando…" : "Descargar Excel de tallas"}
            </button>
          </div>

          <div className="mt-5 mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
            <span className="font-medium text-gray-700">Vista previa del Excel</span>
            <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded-sm bg-amber-100" />Sin datos del proveedor</span>
            <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded-sm bg-amber-300" />Sin cajas completas</span>
          </div>
          <div className="max-h-[480px] overflow-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[620px] text-[13px] tabular-nums">
              <thead className="sticky top-0 bg-gray-50 text-left text-gray-600">
                <tr>
                  {["Referencia", "Descripción", "Talla", "Código de barra", "Pares", "Opción"].map((h) => (
                    <th key={h} className={`px-3 py-2 font-semibold ${h === "Pares" ? "text-right" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {datos.filas.map((f, i) => (
                  <tr key={i} className={`border-t border-gray-100 ${f.color ? FONDO_FILA[f.color] : ""} ${f.esTotal ? "font-semibold" : ""}`}>
                    <td className="px-3 py-1.5">{f.referencia}</td>
                    <td className="px-3 py-1.5">{f.descripcion}</td>
                    <td className="px-3 py-1.5">{f.talla}</td>
                    <td className="px-3 py-1.5">{f.codigoBarra}</td>
                    <td className="px-3 py-1.5 text-right">{f.pares ?? ""}</td>
                    <td className="px-3 py-1.5">{f.opcion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h3 className="mt-8 mb-2 text-sm font-semibold text-gray-900">Detalle por bulto desde un Excel</h3>
    </section>
  );
}
