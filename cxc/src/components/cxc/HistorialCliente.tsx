"use client";

// ─────────────────────────────────────────────────────────────────────────────
// «Ver todos los pagos» · «Ver facturas» — el historial COMPLETO del cliente,
// debajo de «Últimos pagos» (19-nov-2026, `HISTORIAL_CLIENTE_2026_11`).
//
// Daniel: «como en cuentas por cobrar pero con más historial». Por eso se ve
// como la página del cliente en CxC: los pagos son el MISMO bloque «Últimos
// pagos» (`UltimosPagosPorFecha`), un mes por tarjeta; las facturas, los MISMOS
// renglones de «Documentos» (número · empresa, la fecha debajo, el monto a la
// derecha). Solo que yendo hasta oct-2022, con el total de cada mes.
//
// En el teléfono abre como hoja (BottomSheet); en la computadora, como panel.
//
// 🔴 Este archivo no decide qué empresas se ven: lo decide el SERVIDOR. La
// cartera del grupo pide a `/api/cxc/historial` (por código) y la de Boston a
// `/api/cxc/boston/historial` (por id de Switch). Nunca se cruzan.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import Drawer from "@/components/Drawer";
import { BottomSheet } from "@/components/ui";
import { fmt, fmtDate } from "@/lib/format";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import type { PagoDelDia } from "@/lib/cxc/pagos-por-fecha";
import UltimosPagosPorFecha from "@/app/cxc/components/UltimosPagosPorFecha";
import {
  nombreDelTipo,
  rotuloMes,
  tieneRenglones,
  type FacturaHistorial,
  type Mes,
  type RenglonFactura,
} from "@/lib/cxc/historial-cliente";

export type FuenteHistorial = { cartera: "grupo"; codigo: string } | { cartera: "boston"; cliente: number };
type Vista = "pagos" | "facturas";

const nombreEmpresa = (k: string) => EMPRESA_KEY_TO_NAME[k] ?? k;
const dinero = (n: number) => (n < 0 ? `-$${fmt(Math.abs(n))}` : `$${fmt(n)}`);

function urlHistorial(f: FuenteHistorial, vista: Vista): string {
  return f.cartera === "grupo"
    ? `/api/cxc/historial?codigo=${encodeURIComponent(f.codigo)}&tipo=${vista}`
    : `/api/cxc/boston/historial?cliente=${f.cliente}&tipo=${vista}`;
}

function useEsTelefono(): boolean {
  const [tel, setTel] = useState(false);
  useEffect(() => {
    const mq = typeof window !== "undefined" ? window.matchMedia?.("(max-width: 639px)") : null;
    if (!mq) return;
    setTel(mq.matches);
    const cambio = (e: MediaQueryListEvent) => setTel(e.matches);
    mq.addEventListener?.("change", cambio);
    return () => mq.removeEventListener?.("change", cambio);
  }, []);
  return tel;
}

/** Los dos renglones que van debajo de «Últimos pagos». */
export default function HistorialCliente({ fuente, nombre }: { fuente: FuenteHistorial; nombre: string }) {
  const [vista, setVista] = useState<Vista | null>(null);
  const tel = useEsTelefono();
  const cerrar = () => setVista(null);
  const titulo = vista === "facturas" ? "Historial de facturas" : "Historial de pagos";
  const cuerpo = vista ? <ListaHistorial key={vista} fuente={fuente} vista={vista} nombre={nombre} titulo={titulo} enHoja={tel} /> : null;

  return (
    <>
      <div data-historial-cliente className="mt-2 border-t border-gray-100">
        {(["pagos", "facturas"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setVista(v)}
            className="flex min-h-[44px] w-full items-center justify-between border-t border-gray-100 text-left text-[15px] text-blue-600 first:border-t-0 active:opacity-60"
          >
            {v === "pagos" ? "Ver todos los pagos" : "Ver facturas"}
            <span aria-hidden className="text-[17px] text-gray-300">›</span>
          </button>
        ))}
      </div>
      {tel ? (
        <BottomSheet open={vista !== null} onClose={cerrar} abreCompleta>{cuerpo}</BottomSheet>
      ) : (
        <Drawer open={vista !== null} onClose={cerrar} title={titulo}>{cuerpo}</Drawer>
      )}
    </>
  );
}

function ListaHistorial({ fuente, vista, nombre, titulo, enHoja }: {
  fuente: FuenteHistorial; vista: Vista; nombre: string; titulo: string; enHoja: boolean;
}) {
  const [meses, setMeses] = useState<Mes<PagoDelDia | FacturaHistorial>[] | null | "error">(null);
  const url = urlHistorial(fuente, vista);

  useEffect(() => {
    let vivo = true;
    setMeses(null);
    fetch(url, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { meses?: Mes<PagoDelDia | FacturaHistorial>[] }) => { if (vivo) setMeses(d.meses ?? []); })
      .catch(() => { if (vivo) setMeses("error"); });
    return () => { vivo = false; };
  }, [url]);

  const aviso = (texto: string, rojo = false) => (
    <p className={`rounded-2xl bg-white px-4 py-6 text-center text-[15px] ${rojo ? "text-red-600" : "text-gray-500"}`}>{texto}</p>
  );

  return (
    <div className={`-mx-5 min-h-full bg-fondo-celular px-4 pb-4 ${enHoja ? "" : "-my-4 pt-1"}`}>
      <header className="px-1 pt-3">
        {enHoja && <h2 className="text-[22px] font-semibold tracking-tight text-gray-900">{titulo}</h2>}
        <p className="text-[15px] text-gray-500">{nombre}</p>
      </header>
      {meses === null && <div className="pt-5">{aviso(vista === "pagos" ? "Cargando los pagos…" : "Cargando las facturas…")}</div>}
      {meses === "error" && <div className="pt-5">{aviso("No se pudo cargar el historial. Intenta de nuevo en unos segundos.", true)}</div>}
      {Array.isArray(meses) && meses.length === 0 && (
        <div className="pt-5">{aviso(vista === "pagos" ? "Sin pagos registrados." : "Sin facturas registradas.")}</div>
      )}
      {Array.isArray(meses) && vista === "pagos" && meses.map((m) => (
        // El MISMO bloque de «Últimos pagos», un mes por tarjeta.
        <div key={m.mes} data-historial-mes={m.mes} className="mt-4 rounded-2xl bg-white px-4 py-3">
          <UltimosPagosPorFecha pagos={m.filas as PagoDelDia[]} titulo={`${rotuloMes(m.mes)} · ${dinero(m.total)}`} />
        </div>
      ))}
      {Array.isArray(meses) && vista === "facturas" && meses.map((m) => (
        // Los MISMOS renglones de «Documentos», un mes por sección.
        <section key={m.mes}>
          <h3 className="flex items-baseline justify-between px-1 pb-2 pt-5 text-[12px] uppercase tracking-wider text-gray-500">
            <span>{rotuloMes(m.mes)}</span>
            <span className="tabular-nums">{dinero(m.total)}</span>
          </h3>
          <ul data-historial-mes={m.mes} className="overflow-hidden rounded-2xl bg-white">
            {(m.filas as FacturaHistorial[]).map((f) => (
              <RenglonDocumento key={`${f.empresa}-${f.tipo}-${f.id}`} factura={f} fuente={fuente} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** El renglón de un documento de CxC: arriba qué y dónde, abajo la fecha, a la derecha el monto. */
function Fila({ arriba, abajo, monto, negativo }: { arriba: string; abajo: string; monto: number; negativo?: boolean }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[16px] text-gray-900">{arriba}</p>
        <p className="mt-0.5 text-[13px] tabular-nums text-gray-500">{abajo}</p>
      </div>
      <span className={`shrink-0 text-[16px] tabular-nums ${negativo ? "text-emerald-700" : "text-gray-900"}`}>{dinero(monto)}</span>
    </div>
  );
}

function RenglonDocumento({ factura: f, fuente }: { factura: FacturaHistorial; fuente: FuenteHistorial }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <li className="border-t border-gray-100 first:border-t-0">
      <button type="button" aria-expanded={abierta} onClick={() => setAbierta((a) => !a)} className="block w-full text-left active:bg-gray-50">
        <Fila
          arriba={`${f.numero} · ${nombreEmpresa(f.empresa)}`}
          abajo={f.tipo === "Factura" ? fmtDate(f.fecha) : `${fmtDate(f.fecha)} · ${nombreDelTipo(f.tipo)}`}
          monto={f.monto}
          negativo={f.esNotaCredito}
        />
      </button>
      {abierta && <Productos factura={f} fuente={fuente} />}
    </li>
  );
}

function Productos({ factura: f, fuente }: { factura: FacturaHistorial; fuente: FuenteHistorial }) {
  const sinDetalle = fuente.cartera !== "grupo" || !tieneRenglones(f.empresa);
  const [renglones, setRenglones] = useState<RenglonFactura[] | null | "error">(null);

  useEffect(() => {
    if (sinDetalle) return;
    let vivo = true;
    const q = new URLSearchParams({ empresa: f.empresa, tipo: f.tipo, id: String(f.id) });
    fetch(`/api/cxc/historial/renglones?${q}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { renglones?: RenglonFactura[] }) => { if (vivo) setRenglones(d.renglones ?? []); })
      .catch(() => { if (vivo) setRenglones("error"); });
    return () => { vivo = false; };
  }, [sinDetalle, f.empresa, f.tipo, f.id]);

  const linea = (t: string, rojo = false) => (
    <p className={`px-4 pb-3 text-[14px] ${rojo ? "text-red-600" : "text-gray-500"}`}>{t}</p>
  );
  if (sinDetalle) return linea(`${nombreEmpresa(f.empresa)} no tiene el detalle de productos en el sistema.`);
  if (renglones === null) return linea("Cargando los productos…");
  if (renglones === "error") return linea("No se pudieron cargar los productos. Intenta de nuevo.", true);
  if (renglones.length === 0) return linea("Este documento no tiene productos registrados.");

  return (
    <ul data-productos className="mx-4 mb-3 overflow-hidden rounded-lg bg-gray-50">
      {renglones.map((r, i) => (
        <li key={`${r.codigo}-${i}`} className="flex items-start gap-3 border-t border-gray-100 px-3 py-2 first:border-t-0">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] text-gray-900">{r.codigo}{r.descripcion ? ` · ${r.descripcion}` : ""}</p>
            <p className="mt-0.5 text-[13px] tabular-nums text-gray-500">
              {Number(r.cantidad.toFixed(2))} × ${fmt(r.precio)}
            </p>
          </div>
          <span className="shrink-0 text-[14px] tabular-nums text-gray-900">{dinero(r.subtotal)}</span>
        </li>
      ))}
    </ul>
  );
}
