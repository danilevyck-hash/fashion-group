"use client";

// ─────────────────────────────────────────────────────────────────────────────
// «Ver todos los pagos» · «Ver compras» — el historial COMPLETO del cliente,
// debajo de «Últimos pagos» (19-nov-2026, `HISTORIAL_CLIENTE_2026_11`).
//
// Daniel: «como en cuentas por cobrar pero con más historial». Por eso se ve
// como la página del cliente en CxC: los pagos son el MISMO bloque «Últimos
// pagos» (`UltimosPagosPorFecha`), un mes por tarjeta; las compras van en los
// renglones de «Documentos» (qué y dónde arriba, los números en gris debajo, el
// monto a la derecha). Solo que yendo hasta oct-2022, con el total de cada mes.
//
// Una compra = las facturas de UNA empresa dentro de 7 días; la nota de crédito
// va aparte como «Devolución» (`historialDeCompras`). Sin detalle de productos:
// Daniel, «solo quiero el número».
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
import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import type { PagoDelDia } from "@/lib/cxc/pagos-por-fecha";
import UltimosPagosPorFecha from "@/app/cxc/components/UltimosPagosPorFecha";
import { rotuloMes, type FilaDeCompras, type Mes, type MesDeCompras } from "@/lib/cxc/historial-cliente";

export type FuenteHistorial = { cartera: "grupo"; codigo: string } | { cartera: "boston"; cliente: number };
type Vista = "pagos" | "compras";

/** Plata negativa con el menos tipográfico (diccionario). */
const dinero = (n: number) => (n < 0 ? `−$${fmt(Math.abs(n))}` : `$${fmt(n)}`);

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
  const titulo = vista === "compras" ? "Historial de compras" : "Historial de pagos";
  const cuerpo = vista ? <ListaHistorial key={vista} fuente={fuente} vista={vista} nombre={nombre} titulo={titulo} enHoja={tel} /> : null;

  return (
    <>
      <div data-historial-cliente className="mt-2 border-t border-gray-100">
        {(["pagos", "compras"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setVista(v)}
            className="flex min-h-[44px] w-full items-center justify-between border-t border-gray-100 text-left text-[15px] text-blue-600 first:border-t-0 active:opacity-60"
          >
            {v === "pagos" ? "Ver todos los pagos" : "Ver compras"}
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
  const [meses, setMeses] = useState<(Mes<PagoDelDia> | MesDeCompras)[] | null | "error">(null);
  const url = urlHistorial(fuente, vista);

  useEffect(() => {
    let vivo = true;
    setMeses(null);
    fetch(url, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { meses?: (Mes<PagoDelDia> | MesDeCompras)[] }) => { if (vivo) setMeses(d.meses ?? []); })
      .catch(() => { if (vivo) setMeses("error"); });
    return () => { vivo = false; };
  }, [url]);

  const aviso = (texto: string, rojo = false) => (
    <p className={`mt-5 rounded-2xl bg-white px-4 py-6 text-center text-[15px] ${rojo ? "text-red-600" : "text-gray-500"}`}>{texto}</p>
  );

  return (
    <div className={`-mx-5 min-h-full bg-fondo-celular px-4 pb-4 ${enHoja ? "" : "-my-4 pt-1"}`}>
      <header className="px-1 pt-3">
        {enHoja && <h2 className="text-[22px] font-semibold tracking-tight text-gray-900">{titulo}</h2>}
        <p className="text-[15px] text-gray-500">{nombre}</p>
      </header>
      {meses === null && aviso(vista === "pagos" ? "Cargando los pagos…" : "Cargando las compras…")}
      {meses === "error" && aviso("No se pudo cargar el historial. Intenta de nuevo en unos segundos.", true)}
      {Array.isArray(meses) && meses.length === 0 && aviso(vista === "pagos" ? "Sin pagos registrados." : "Sin compras registradas.")}
      {Array.isArray(meses) && vista === "pagos" && (meses as Mes<PagoDelDia>[]).map((m) => (
        // El MISMO bloque de «Últimos pagos», un mes por tarjeta.
        <div key={m.mes} data-historial-mes={m.mes} className="mt-4 rounded-2xl bg-white px-4 py-3">
          <UltimosPagosPorFecha pagos={m.filas} titulo={`${rotuloMes(m.mes)} · ${dinero(m.total)}`} />
        </div>
      ))}
      {Array.isArray(meses) && vista === "compras" && (meses as MesDeCompras[]).map((m) => (
        // Los MISMOS renglones de «Documentos», un mes por sección.
        <section key={m.mes}>
          <h3 className="flex items-baseline justify-between px-1 pb-2 pt-5 text-[12px] uppercase tracking-wider text-gray-500">
            <span>{rotuloMes(m.mes)}</span>
            {/* Un mes con solo devoluciones no dice «$0.00»: su línea va abajo. */}
            {m.total !== 0 && <span className="tabular-nums">{dinero(m.total)}</span>}
          </h3>
          <ul data-historial-mes={m.mes} className="overflow-hidden rounded-2xl bg-white">
            {m.filas.map((f, i) => <RenglonCompra key={`${f.clase}-${f.empresa}-${f.fecha}-${i}`} fila={f} />)}
          </ul>
          {m.devoluciones !== 0 && (
            <p className="px-1 pt-1.5 text-right text-[13px] tabular-nums text-gray-500">Devoluciones {dinero(m.devoluciones)}</p>
          )}
        </section>
      ))}
    </div>
  );
}

/** «Compra · 25 sept 2025» y el monto; debajo «Fashion Wear · Facturas 2576 · 2584».
 *  Dos renglones siempre: todas las filas miden lo mismo en el teléfono. */
function RenglonCompra({ fila: f }: { fila: FilaDeCompras }) {
  const devolucion = f.clase === "devolucion";
  const documentos = devolucion
    ? `Nota de crédito ${f.numero}`
    : `${f.facturas.length === 1 ? "Factura" : "Facturas"} ${f.facturas.join(" · ")}`;
  return (
    <li className="flex items-start gap-3 border-t border-gray-100 px-4 py-3 first:border-t-0">
      <div className="min-w-0 flex-1">
        <p className="text-[16px] text-gray-900">{devolucion ? "Devolución" : "Compra"} · {fmtDate(f.fecha)}</p>
        <p className="mt-0.5 text-[13px] tabular-nums text-gray-500">{nombreCortoEmpresa(f.empresa)} · {documentos}</p>
      </div>
      <span className={`shrink-0 text-[16px] tabular-nums ${devolucion ? "text-emerald-700" : "text-gray-900"}`}>{dinero(f.monto)}</span>
    </li>
  );
}
