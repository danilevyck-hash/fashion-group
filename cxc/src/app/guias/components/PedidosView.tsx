"use client";

// Guías › «Pedidos» (5-oct-2026, `PEDIDOS_BODEGA_2026_10`). La pregunta de la
// pantalla: «¿qué pedidos me faltan por preparar?». Lista del más viejo al más
// nuevo; un toque cambia Pendiente ↔ Preparado. 🔴 Sin enlace a Etiquetas ni
// a Guías (Daniel, 5-oct-2026). Solo LEE lo que trajo el cron de madrugada:
// «Actualizar» trae las 6 empresas una tras otra por `sync-now` (módulo
// «pedidos»), como Ventas y CxC con «Todas».

import { useEffect, useState } from "react";
import LineaDeFrescura from "@/components/shared/LineaDeFrescura";
import { ChipSelector, EnLaBarra, useHayBarraCelular } from "@/components/celular/BarraDeControles";
import { useToast } from "@/components/ToastSystem";
import { Aviso } from "@/components/ui/Aviso";
import { fmtDate } from "@/lib/format";
import { fechaPanamaDe, hoyPanama } from "@/lib/fecha-panama";
import { B2B_EMPRESA_KEYS, nombreCortoEmpresa } from "@/lib/empresa-mapping";
import {
  PEDIDOS_BODEGA_ROLES,
  PEDIDOS_TABLA_2026_10 as NUEVO,
  ROTULO_ESTADO,
  abreviarEmpresa,
  haceDias,
  lineaDePendientes,
  vendedorEnPantalla,
  type EstadoPedido,
  type PedidoBodega,
} from "@/lib/guias/pedidos-bodega";

type Filtro = EstadoPedido;
const CHIPS: { value: Filtro; label: string }[] = [
  { value: "pendiente", label: "Pendientes" },
  { value: "preparado", label: "Preparados" },
];

const clave = (p: Pick<PedidoBodega, "empresa_key" | "pedido_switch_id">) => `${p.empresa_key}:${p.pedido_switch_id}`;

export default function PedidosView({ puedeMarcar = true }: { puedeMarcar?: boolean }) {
  const barra = useHayBarraCelular();
  const { toast } = useToast();
  const [pedidos, setPedidos] = useState<PedidoBodega[] | null>(null);
  const [actualizado, setActualizado] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("pendiente");
  // v2: filtro simple; abre SIEMPRE en «Todas» y no se acota por persona (Daniel, 5-oct-2026).
  const [empresa, setEmpresa] = useState("todas");
  // La fecha exacta se ve al pasar el mouse (title) o al tocar la celda.
  const [fechaAbierta, setFechaAbierta] = useState<string | null>(null);

  async function cargar() {
    try {
      const r = await fetch("/api/guias/pedidos", { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { pedidos: PedidoBodega[]; actualizado: string | null };
      setPedidos(d.pedidos);
      setActualizado(d.actualizado);
      setError(false);
    } catch {
      setError(true);
    }
  }
  useEffect(() => { void cargar(); }, []);

  async function cambiar(p: PedidoBodega) {
    const nuevo: EstadoPedido = p.estado === "pendiente" ? "preparado" : "pendiente";
    const poner = (estado: EstadoPedido) =>
      setPedidos((xs) => (xs ?? []).map((x) => (clave(x) === clave(p) ? { ...x, estado } : x)));
    poner(nuevo); // optimista; se revierte si el servidor no guarda
    try {
      const r = await fetch("/api/guias/pedidos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_key: p.empresa_key, pedido_switch_id: p.pedido_switch_id, estado: nuevo }),
      });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { cambiado_por: string; cambiado_en: string };
      setPedidos((xs) => (xs ?? []).map((x) => (clave(x) === clave(p) ? { ...x, cambiado_por: d.cambiado_por, cambiado_en: d.cambiado_en } : x)));
    } catch {
      poner(p.estado);
      toast("No se pudo guardar el estado. Intenta de nuevo.", "error");
    }
  }

  const hoy = hoyPanama();
  const deLaEmpresa = (pedidos ?? []).filter((p) => !NUEVO || empresa === "todas" || p.empresa_key === empresa);
  const visibles = deLaEmpresa.filter((p) => p.estado === filtro);
  const OPCIONES_EMPRESA = [
    { valor: "todas", etiqueta: "Todas" },
    ...B2B_EMPRESA_KEYS.map((k) => ({ valor: k, etiqueta: nombreCortoEmpresa(k) })),
  ];

  const chips = (
    <div className="flex min-w-0 items-center gap-1.5">
      <div role="group" aria-label="Estado" className="flex shrink-0 gap-1.5">
        {CHIPS.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-pressed={filtro === c.value}
            onClick={() => setFiltro(c.value)}
            className={`relative h-9 rounded-full border px-3 text-[13px] font-medium transition active:scale-[0.97] before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] ${
              filtro === c.value ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-700"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      {NUEVO && <ChipSelector rotulo="Empresa" valor={empresa} opciones={OPCIONES_EMPRESA} onCambiar={setEmpresa} />}
    </div>
  );

  // v2: chip chico que se toca para cambiar; quien no marca ve el mismo rótulo, quieto.
  const chipEstado = (p: PedidoBodega) => {
    const color = p.estado === "preparado" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-300 bg-white text-gray-700";
    const clase = `inline-flex h-7 items-center whitespace-nowrap rounded-full border px-1.5 text-xs font-medium sm:px-2.5 ${color}`;
    if (!puedeMarcar) return <span className={clase}>{ROTULO_ESTADO[p.estado]}</span>;
    return (
      <button
        type="button"
        onClick={() => void cambiar(p)}
        title={p.cambiado_por && p.cambiado_en ? `${p.cambiado_por} · ${fmtDate(fechaPanamaDe(p.cambiado_en))}` : undefined}
        className={`${clase} relative transition active:scale-[0.97] before:absolute before:-inset-x-1 before:-inset-y-2 before:content-['']`}
      >
        {ROTULO_ESTADO[p.estado]}
      </button>
    );
  };

  const tabla = (
    <div className="-mx-4 border-y border-gray-200 bg-white sm:mx-0 sm:rounded-lg sm:border-x">
      <table className="w-full text-left text-xs sm:text-sm">
        <thead className="border-b border-gray-200 text-xs font-medium text-gray-400 sm:uppercase sm:tracking-wide">
          <tr>
            <th className="py-2 pl-3 pr-1 sm:px-3"><span className="sm:hidden">Antig.</span><span className="hidden sm:inline">Antigüedad</span></th>
            <th className="px-1 py-2 sm:px-3">Cliente</th>
            {/* En el celular, Empresa va apilada debajo del Vendedor: así entra en 375 sin scroll. */}
            <th className="px-1 py-2 sm:px-3">Vendedor</th>
            <th className="hidden px-3 py-2 sm:table-cell">Empresa</th>
            <th className="py-2 pl-0.5 pr-3 text-right sm:px-3">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 align-top">
          {visibles.map((p) => (
            <tr key={clave(p)}>
              <td className="py-2 pl-3 pr-1 text-gray-700 sm:whitespace-nowrap sm:px-3">
                <button
                  type="button"
                  title={fmtDate(fechaPanamaDe(p.fecha))}
                  onClick={() => setFechaAbierta((k) => (k === clave(p) ? null : clave(p)))}
                  className="text-left"
                >
                  {fechaAbierta === clave(p) ? fmtDate(fechaPanamaDe(p.fecha)) : haceDias(p.fecha, hoy).replace(/ días$/, "\u00a0días")}
                </button>
              </td>
              <td className="break-words px-1 py-2 sm:px-3">
                <span className="font-medium text-gray-900">{p.cliente_nombre}</span>
                <span className="block whitespace-nowrap text-xs text-gray-500">{p.secuencial}</span>
              </td>
              <td className="break-words px-1 py-2 text-gray-700 sm:px-3">
                {vendedorEnPantalla(p.vendedor_nombre)}
                <span className="block text-xs text-gray-500 sm:hidden">{abreviarEmpresa(nombreCortoEmpresa(p.empresa_key))}</span>
              </td>
              <td className="hidden whitespace-nowrap px-3 py-2 text-gray-700 sm:table-cell">{nombreCortoEmpresa(p.empresa_key)}</td>
              <td className="py-1.5 pl-0.5 pr-3 text-right sm:px-3">{chipEstado(p)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const botonEstado = (p: PedidoBodega) => (
    <button
      type="button"
      onClick={() => void cambiar(p)}
      title={p.cambiado_por && p.cambiado_en ? `${p.cambiado_por} · ${fmtDate(fechaPanamaDe(p.cambiado_en))}` : undefined}
      className={`min-h-[44px] shrink-0 rounded-full border px-3 text-sm font-medium transition active:scale-[0.97] ${
        p.estado === "preparado"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-gray-300 bg-white text-gray-700"
      }`}
    >
      {ROTULO_ESTADO[p.estado]}
    </button>
  );

  return (
    <div className={`max-w-6xl mx-auto px-4 sm:px-6 ${barra ? "pb-6 pt-3" : "py-6"}`}>
      {barra && <EnLaBarra pestana="pedidos" filaIzq={chips} />}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-gray-900">
            {pedidos ? lineaDePendientes(deLaEmpresa, hoy) : " "}
          </p>
          <LineaDeFrescura
            actualizado={actualizado}
            opciones={B2B_EMPRESA_KEYS.map((empresa) => ({ modulo: "pedidos", empresa, label: nombreCortoEmpresa(empresa) }))}
            secuencial
            engancharRunning
            roles={[...PEDIDOS_BODEGA_ROLES]}
            onSuccess={cargar}
          />
        </div>
        {!barra && chips}
      </div>

      {error ? (
        <Aviso tono="error">No se pudieron leer los pedidos. Intenta de nuevo.</Aviso>
      ) : !pedidos ? (
        <p className="py-10 text-center text-sm text-gray-500">Cargando…</p>
      ) : visibles.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-500">
          {filtro === "pendiente" ? "Sin pedidos pendientes" : "Sin pedidos preparados"}
        </p>
      ) : NUEVO ? (
        tabla
      ) : barra ? (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {visibles.map((p) => (
            <li key={clave(p)} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium text-gray-900">{p.cliente_nombre}</p>
                <p className="truncate text-xs text-gray-500">
                  {fmtDate(fechaPanamaDe(p.fecha))} · {p.secuencial} · {vendedorEnPantalla(p.vendedor_nombre)} · {nombreCortoEmpresa(p.empresa_key)}
                </p>
              </div>
              {botonEstado(p)}
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">N° de pedido</th>
                <th className="px-3 py-2">Vendedor</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Empresa</th>
                <th className="px-3 py-2 text-right">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibles.map((p) => (
                <tr key={clave(p)}>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{fmtDate(fechaPanamaDe(p.fecha))}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{p.secuencial}</td>
                  <td className="px-3 py-1.5">{vendedorEnPantalla(p.vendedor_nombre)}</td>
                  <td className="px-3 py-1.5">{p.cliente_nombre}</td>
                  <td className="whitespace-nowrap px-3 py-1.5">{nombreCortoEmpresa(p.empresa_key)}</td>
                  <td className="px-3 py-1.5 text-right">{botonEstado(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
