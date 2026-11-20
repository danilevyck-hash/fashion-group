"use client";

// ─────────────────────────────────────────────────────────────────────────────
// «Últ. pago» y «Últ. compra» se TOCAN (19-nov-2026, `HISTORIAL_CLIENTE_2026_11`).
//
// En la tabla «Por empresa» de CxC, tocar «Últ. pago $X · N d» abre TODOS los
// pagos del cliente en ESA empresa; tocar «Últ. compra $X · N d», todas sus
// compras en ESA empresa. Desde oct-2022, por mes, con el total de cada mes.
//
// Una compra = las facturas de la empresa dentro de 7 días; la nota de crédito
// va aparte como «Devolución» (`historialDeCompras`). Sin detalle de productos.
// Los pagos son el MISMO bloque «Últimos pagos» (`UltimosPagosPorFecha`).
//
// En el teléfono abre como hoja (BottomSheet); en la computadora, como panel.
// 🔴 La empresa la valida el SERVIDOR (`/api/cxc/historial`): solo las 6 del grupo.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, type ReactNode } from "react";
import Drawer from "@/components/Drawer";
import { BottomSheet } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { montoExacto } from "@/lib/cxc/lista-celular";
import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import type { PagoDelDia } from "@/lib/cxc/pagos-por-fecha";
import UltimosPagosPorFecha from "@/app/cxc/components/UltimosPagosPorFecha";
import { rotuloMes, type FilaDeCompras, type Mes, type MesDeCompras } from "@/lib/cxc/historial-cliente";

type Vista = "pagos" | "compras";

/** Sin centavos (Daniel, 19-nov-2026) y con el menos tipográfico: «−$18». */
const dinero = (n: number) => (n < 0 ? `−${montoExacto(-n)}` : montoExacto(n));

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

/** El texto «Últ. pago $X · N d ›» (o «Últ. compra …») hecho botón, en el azul
 *  de los enlaces del sistema. Abre la hoja o el panel de esa empresa. */
export default function TocarHistorial({ codigo, nombre, empresa, vista, children }: {
  codigo: string; nombre: string; empresa: string; vista: Vista; children: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const tel = useEsTelefono();
  const titulo = `${vista === "pagos" ? "Pagos" : "Compras"} · ${nombreCortoEmpresa(empresa)}`;
  const cuerpo = abierto ? (
    <ListaHistorial codigo={codigo} empresa={empresa} vista={vista} nombre={nombre} titulo={titulo} enHoja={tel} />
  ) : null;
  const cerrar = () => setAbierto(false);
  return (
    <>
      <button
        type="button"
        data-historial={vista}
        onClick={(e) => { e.stopPropagation(); setAbierto(true); }}
        className="whitespace-nowrap text-blue-600 hover:text-blue-800 active:opacity-60"
      >
        {children}
        <span aria-hidden className="ml-0.5">›</span>
      </button>
      {/* Solo se monta abierta: cada fila tiene dos, y cerradas no dejan nada en la tabla. */}
      {abierto && (tel ? (
        <BottomSheet open={abierto} onClose={cerrar} abreCompleta>{cuerpo}</BottomSheet>
      ) : (
        <Drawer open={abierto} onClose={cerrar} title={titulo}>{cuerpo}</Drawer>
      ))}
    </>
  );
}

function ListaHistorial({ codigo, empresa, vista, nombre, titulo, enHoja }: {
  codigo: string; empresa: string; vista: Vista; nombre: string; titulo: string; enHoja: boolean;
}) {
  const [meses, setMeses] = useState<(Mes<PagoDelDia> | MesDeCompras)[] | null | "error">(null);
  const url = `/api/cxc/historial?codigo=${encodeURIComponent(codigo)}&empresa=${encodeURIComponent(empresa)}&tipo=${vista}`;

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
        // El MISMO bloque de «Últimos pagos», un mes por tarjeta; la empresa ya está en el título.
        <div key={m.mes} data-historial-mes={m.mes} className="mt-4 rounded-2xl bg-white px-4 py-3">
          <UltimosPagosPorFecha pagos={m.filas.map((p) => ({ ...p, empresas: [] }))} titulo={`${rotuloMes(m.mes)} · ${dinero(m.total)}`} monto={dinero} />
        </div>
      ))}
      {Array.isArray(meses) && vista === "compras" && (meses as MesDeCompras[]).map((m) => (
        <section key={m.mes}>
          <h3 className="flex items-baseline justify-between px-1 pb-2 pt-5 text-[12px] uppercase tracking-wider text-gray-500">
            <span>{rotuloMes(m.mes)}</span>
            {/* Un mes con solo devoluciones no dice «$0.00»: su línea va abajo. */}
            {m.total !== 0 && <span className="tabular-nums">{dinero(m.total)}</span>}
          </h3>
          <ul data-historial-mes={m.mes} className="overflow-hidden rounded-2xl bg-white">
            {m.filas.map((f, i) => <RenglonCompra key={`${f.clase}-${f.fecha}-${i}`} fila={f} />)}
          </ul>
          {m.devoluciones !== 0 && (
            <p className="px-1 pt-1.5 text-right text-[13px] tabular-nums text-gray-500">Devoluciones {dinero(m.devoluciones)}</p>
          )}
        </section>
      ))}
    </div>
  );
}

/** «Compra · 1 sept 2026» y el monto; debajo «Factura 2534». Dos renglones siempre. */
function RenglonCompra({ fila: f }: { fila: FilaDeCompras }) {
  const devolucion = f.clase === "devolucion";
  const documentos = devolucion
    ? `Nota de crédito ${f.numero}`
    : `${f.facturas.length === 1 ? "Factura" : "Facturas"} ${f.facturas.join(" · ")}`;
  return (
    <li className="flex items-start gap-3 border-t border-gray-100 px-4 py-3 first:border-t-0">
      <div className="min-w-0 flex-1">
        <p className="text-[16px] text-gray-900">{devolucion ? "Devolución" : "Compra"} · {fmtDate(f.fecha)}</p>
        <p className="mt-0.5 text-[13px] tabular-nums text-gray-500">{documentos}</p>
      </div>
      <span className={`shrink-0 text-[16px] tabular-nums ${devolucion ? "text-emerald-700" : "text-gray-900"}`}>{dinero(f.monto)}</span>
    </li>
  );
}
