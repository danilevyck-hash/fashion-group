"use client";

// Guías › «Pedidos» (5-oct-2026, `PEDIDOS_BODEGA_2026_10`). La pregunta de la
// pantalla: «¿qué pedidos me faltan por preparar?». Lista del más viejo al más
// nuevo; un toque cambia Pendiente ↔ Preparado. 🔴 Sin enlace a Etiquetas ni
// a Guías (Daniel, 5-oct-2026). Solo LEE lo que trajo el cron de madrugada:
// «Actualizar» trae las 6 empresas una tras otra por `sync-now` (módulo
// «pedidos»), como Ventas y CxC con «Todas».

import { useEffect, useState } from "react";
import { Check, Printer } from "lucide-react";
import { AJUSTES_APPLE_6_2026_10 as CIRCULO } from "@/lib/ajustes-apple-6-2026-10";
import LineaDeFrescura from "@/components/shared/LineaDeFrescura";
import { CLASE_BOTON_TEXTO, CLASE_FILA_MENU, ChipSelector, EnLaBarra, useHayBarraCelular } from "@/components/celular/BarraDeControles";
import { useToast } from "@/components/ToastSystem";
import { Aviso } from "@/components/ui/Aviso";
import { ThOrden, useOrdenTabla } from "@/components/ui/OrdenTabla";
import { descargarArchivo } from "@/lib/compartir-archivo";
import { fmtDate } from "@/lib/format";
import { fechaPanamaDe, hoyPanama } from "@/lib/fecha-panama";
import { B2B_EMPRESA_KEYS, nombreCortoEmpresa } from "@/lib/empresa-mapping";
import PedidoBultos, { type PedidoDelDetalle } from "./PedidoBultos";
import {
  PEDIDOS_BULTOS_2026_10 as BULTOS,
  ESTADOS_BULTOS,
  ROTULO_ESTADO_BULTOS,
  ROLES_TERMINADO,
  estadoLeido,
  siguienteEstado,
  type EstadoBultos,
} from "@/lib/guias/pedidos-bultos";
import {
  PEDIDOS_BODEGA_ROLES,
  PEDIDOS_TABLA_2026_10 as NUEVO,
  ROTULO_ESTADO,
  PEDIDOS_POR_EMPRESA_2026_10 as POR_EMPRESA,
  abreviarEmpresa,
  agruparPorEmpresa,
  haceDias,
  haceDiasCorto,
  lineaDePendientes,
  lineaDePendientesCorta,
  tituloPedidosImpresos,
  vendedorEnPantalla,
  type EstadoPedido,
  type PedidoBodega,
} from "@/lib/guias/pedidos-bodega";

type Filtro = EstadoPedido | EstadoBultos;
/**
 * 🔴 Con bultos son TRES chips, los tres estados del flujo (6-oct-2026):
 * Pendiente → Terminado (bodega) → Recibido (la secretaria) → Etiquetas.
 * Apagado, los dos de hoy.
 */
const CHIPS: { value: Filtro; label: string }[] = BULTOS
  ? ESTADOS_BULTOS.map((e) => ({ value: e, label: `${ROTULO_ESTADO_BULTOS[e]}s` }))
  : [
      { value: "pendiente", label: "Pendientes" },
      { value: "preparado", label: "Preparados" },
    ];

const clave = (p: Pick<PedidoBodega, "empresa_key" | "pedido_switch_id">) => `${p.empresa_key}:${p.pedido_switch_id}`;

/** Lo que el detalle con bultos necesita de la fila. */
/** El rótulo del estado, con los dos juegos: los 2 de hoy y los 3 con bultos. */
const rotuloDe = (e: PedidoBodega["estado"]): string =>
  e === "pendiente" || e === "preparado" ? ROTULO_ESTADO[e] : ROTULO_ESTADO_BULTOS[e];

const detalleDe = (p: PedidoBodega): PedidoDelDetalle => ({
  empresa_key: p.empresa_key,
  pedido_switch_id: p.pedido_switch_id,
  secuencial: p.secuencial,
  cliente_codigo: p.cliente_codigo,
  cliente_nombre: p.cliente_nombre,
});

export default function PedidosView({
  puedeMarcar = true,
  /** 🔴 «Recibido» lo marca la secretaria (y admin), nunca bodega. */
  puedeRecibir = false,
}: {
  puedeMarcar?: boolean;
  puedeRecibir?: boolean;
}) {
  const barra = useHayBarraCelular();
  // El pedido abierto en el detalle con bultos; `null` = la lista.
  const [abierto, setAbierto] = useState<PedidoDelDetalle | null>(null);
  const { toast } = useToast();
  const [pedidos, setPedidos] = useState<PedidoBodega[] | null>(null);
  const [actualizado, setActualizado] = useState<string | null>(null);
  // 🔴 Las empresas que ESTA persona ve, según el SERVIDOR (`empresasQueVe`):
  // el chip no puede ofrecer Vistana a Julio y devolverle una lista vacía.
  const [susEmpresas, setSusEmpresas] = useState<readonly string[]>(B2B_EMPRESA_KEYS);
  const [error, setError] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("pendiente");
  // v2: filtro simple; abre SIEMPRE en «Todas» y no se acota por persona (Daniel, 5-oct-2026).
  const [empresa, setEmpresa] = useState("todas");
  // La fecha exacta se ve al pasar el mouse (title) o al tocar la celda.
  const [fechaAbierta, setFechaAbierta] = useState<string | null>(null);
  // AJUSTES_APPLE_6: el círculo se llena (o se vacía) un instante antes de que
  // el pedido pase a la otra lista, como en Recordatorios de iOS.
  const [enTransito, setEnTransito] = useState<ReadonlySet<string>>(new Set());

  async function cargar() {
    try {
      const r = await fetch("/api/guias/pedidos", { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { pedidos: PedidoBodega[]; actualizado: string | null; empresas?: string[] };
      setPedidos(d.pedidos);
      setActualizado(d.actualizado);
      if (d.empresas?.length) setSusEmpresas(d.empresas);
      setError(false);
    } catch {
      setError(true);
    }
  }
  useEffect(() => { void cargar(); }, []);

  /**
   * Mueve el pedido al estado que se pide. Con bultos el flujo AVANZA
   * (pendiente → terminado → recibido); apagado, el interruptor alterna como
   * siempre entre los dos de hoy.
   */
  async function cambiar(p: PedidoBodega, destino?: EstadoBultos) {
    const nuevo = destino ?? (BULTOS
      ? siguienteEstado(estadoLeido(p.estado))
      : p.estado === "pendiente" ? "preparado" : "pendiente");
    if (!nuevo) return;
    const poner = (estado: PedidoBodega["estado"]) =>
      setPedidos((xs) => (xs ?? []).map((x) => (clave(x) === clave(p) ? { ...x, estado } : x)));
    poner(nuevo); // optimista; se revierte si el servidor no guarda
    try {
      const r = await fetch("/api/guias/pedidos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_key: p.empresa_key, pedido_switch_id: p.pedido_switch_id, estado: nuevo }),
      });
      const d = (await r.json().catch(() => null)) as
        | { cambiado_por: string; cambiado_en: string; envio?: { bultos: number }; avisoEnvio?: string; error?: string }
        | null;
      if (!r.ok) throw new Error(d?.error ?? String(r.status));
      setPedidos((xs) => (xs ?? []).map((x) => (clave(x) === clave(p) ? { ...x, cambiado_por: d!.cambiado_por, cambiado_en: d!.cambiado_en } : x)));
      // Regla 6: el envío de Etiquetas nace al recibir. Si no se pudo, se DICE
      // (el pedido quedó recibido igual: el aviso no es un error).
      if (d?.envio) toast(`Envío de Etiquetas creado · ${d.envio.bultos} ${d.envio.bultos === 1 ? "bulto" : "bultos"}`, "success");
      else if (d?.avisoEnvio) toast(`Recibido. ${d.avisoEnvio}`, "warning");
    } catch (e) {
      poner(p.estado);
      const msg = e instanceof Error && e.message.length < 90 ? e.message : "No se pudo guardar el estado. Intenta de nuevo.";
      toast(msg, "error");
    }
  }

  const hoy = hoyPanama();
  const deLaEmpresa = (pedidos ?? []).filter((p) => !NUEVO || empresa === "todas" || p.empresa_key === empresa);
  const visibles = deLaEmpresa.filter((p) => p.estado === filtro);
  // 6-oct-2026: cada encabezado ordena DENTRO de su empresa; sin tocar, del más viejo al más nuevo.
  const orden = useOrdenTabla<"antiguedad" | "cliente" | "vendedor">("guias-pedidos", {
    columnas: ["antiguedad", "cliente", "vendedor"], textos: ["cliente", "vendedor"],
  });
  const ordenarGrupo = (ps: PedidoBodega[]) => orden.ordenar(ps, (p, c) =>
    c === "antiguedad" ? -Date.parse(p.fecha) : c === "cliente" ? p.cliente_nombre : vendedorEnPantalla(p.vendedor_nombre));
  // Con una sola empresa el chip no decide nada: no se dibuja (docs/diseno.md).
  const OPCIONES_EMPRESA = [
    { valor: "todas", etiqueta: "Todas" },
    ...susEmpresas.map((k) => ({ valor: k, etiqueta: nombreCortoEmpresa(k) })),
  ];
  const hayQueElegirEmpresa = susEmpresas.length > 1;

  // Imprime lo filtrado (estado + empresa), para bodega sin celular. Pestaña
  // nueva pidiendo imprimir, como la nota de entrega; si la bloquean, se descarga.
  async function imprimir() {
    try {
      const { construirPdfPedidos } = await import("@/lib/guias/pdf-pedidos");
      // Con bultos el estado del título sale del rótulo nuevo; apagado, de los dos de siempre.
      const titulo = BULTOS
        ? `Pedidos ${ROTULO_ESTADO_BULTOS[filtro as EstadoBultos].toLowerCase()}s · ${empresa === "todas" ? "Todas las empresas" : nombreCortoEmpresa(empresa)} · impreso ${fmtDate(hoy)}`
        : tituloPedidosImpresos(filtro as EstadoPedido, empresa === "todas" ? null : nombreCortoEmpresa(empresa), new Date());
      const doc = construirPdfPedidos(titulo, visibles, hoy);
      doc.autoPrint();
      if (!window.open(doc.output("bloburl") as unknown as string, "_blank")) {
        descargarArchivo(new File([doc.output("blob")], `pedidos-${filtro}-${hoy}.pdf`, { type: "application/pdf" }));
        toast("Lista descargada — ábrela para imprimir", "success");
      }
    } catch {
      toast("No se pudo preparar la lista. Intenta de nuevo.", "error");
    }
  }
  const sinNadaQueImprimir = visibles.length === 0;

  // 🩸 Con TRES chips de estado, el de «Empresa» quedaba aplastado a «E. ⌄» en
  // el celular: el grupo de estados no se encoge y el que sobraba era el otro.
  // La fila corre de lado, como las de chips del resto del sistema, en vez de
  // recortar un rótulo hasta dejarlo sin sentido.
  const chips = (
    <div className="-mx-4 flex min-w-0 items-center gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:overflow-visible sm:px-0">
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
      {NUEVO && hayQueElegirEmpresa && <ChipSelector rotulo="Empresa" valor={empresa} opciones={OPCIONES_EMPRESA} onCambiar={setEmpresa} />}
      {POR_EMPRESA && !barra && (
        <button type="button" onClick={() => void imprimir()} disabled={sinNadaQueImprimir} className={`${CLASE_BOTON_TEXTO} gap-1.5`}>
          <Printer size={15} strokeWidth={1.8} aria-hidden /> Imprimir
        </button>
      )}
    </div>
  );

  // v2: chip chico que se toca para cambiar; quien no marca ve el mismo rótulo, quieto.
  const chipEstado = (p: PedidoBodega) => {
    const color = p.estado === "preparado" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-300 bg-white text-gray-700";
    const clase = `inline-flex h-7 items-center whitespace-nowrap rounded-full border px-1.5 text-xs font-medium sm:px-2.5 ${color}`;
    if (!puedeMarcar) return <span className={clase}>{rotuloDe(p.estado)}</span>;
    return (
      <button
        type="button"
        onClick={() => void cambiar(p)}
        title={p.cambiado_por && p.cambiado_en ? `${p.cambiado_por} · ${fmtDate(fechaPanamaDe(p.cambiado_en))}` : undefined}
        className={`${clase} relative transition active:scale-[0.97] before:absolute before:-inset-x-1 before:-inset-y-2 before:content-['']`}
      >
        {rotuloDe(p.estado)}
      </button>
    );
  };

  /**
   * 🔴 CON BULTOS, UN SOLO CONTROL POR FILA Y DICE QUÉ HACE (6-oct-2026):
   *   · Pendiente  → el círculo ○ de siempre, que lo pasa a Terminado (bodega).
   *   · Terminado  → «Recibido», y SOLO lo ve quien puede marcarlo: bodega lee
   *     el chip «Terminado» quieto, porque «no se puede confiar solo en bodega».
   *   · Recibido   → ✓ quieto. De ahí salió a Etiquetas.
   */
  const controlBultos = (p: PedidoBodega) => {
    const e = estadoLeido(p.estado);
    const firma = p.cambiado_por && p.cambiado_en ? `${p.cambiado_por} · ${fmtDate(fechaPanamaDe(p.cambiado_en))}` : undefined;
    if (e === "pendiente") return circulo(p);
    const base = "inline-flex h-7 items-center whitespace-nowrap rounded-full border px-2.5 text-xs font-medium";
    if (e === "recibido") {
      return (
        <span className={`${base} border-emerald-200 bg-emerald-50 text-emerald-700`} title={firma}>
          <Check size={13} strokeWidth={3} aria-hidden className="mr-1" />
          {ROTULO_ESTADO_BULTOS.recibido}
        </span>
      );
    }
    if (!puedeRecibir) {
      return <span className={`${base} border-gray-300 bg-white text-gray-700`} title={firma}>{ROTULO_ESTADO_BULTOS.terminado}</span>;
    }
    return (
      <button
        type="button"
        onClick={() => void cambiar(p, "recibido")}
        title={firma}
        className={`${base} relative border-gray-900 bg-gray-900 text-white transition active:scale-[0.97] before:absolute before:-inset-x-1 before:-inset-y-2 before:content-['']`}
      >
        Marcar recibido
      </button>
    );
  };

  // AJUSTES_APPLE_6 (punto 1): un círculo ○ en vez del botón «Pendiente». Lleno ✓ = preparado.
  // Quien no marca ve el mismo círculo, quieto.
  const circulo = (p: PedidoBodega) => {
    const k = clave(p);
    const lleno = (p.estado === "preparado") !== enTransito.has(k);
    const disco = (
      <span
        aria-hidden
        className={`flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 transition-colors ${
          lleno ? "border-emerald-600 bg-emerald-600 text-white" : "border-gray-300 bg-white"
        }`}
      >
        {lleno && <Check size={14} strokeWidth={3} />}
      </span>
    );
    if (!puedeMarcar) return <span className="flex h-11 w-9 items-center justify-center">{disco}</span>;
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={lleno}
        aria-label={`${p.cliente_nombre} · ${p.secuencial}: ${lleno ? (BULTOS ? "terminado" : "preparado") : "pendiente"}`}
        disabled={enTransito.has(k)}
        onClick={() => {
          setEnTransito((s) => new Set(s).add(k));
          setTimeout(() => {
            setEnTransito((s) => { const n = new Set(s); n.delete(k); return n; });
            void cambiar(p);
          }, 450);
        }}
        title={p.cambiado_por && p.cambiado_en ? `${p.cambiado_por} · ${fmtDate(fechaPanamaDe(p.cambiado_en))}` : undefined}
        className="flex h-11 w-9 items-center justify-center transition active:scale-[0.9]"
      >
        {disco}
      </button>
    );
  };

  // 🔴 CADA LISTA MUESTRA UN SOLO TIPO DE CONTROL, porque se filtra por UN
  // estado: en «Pendientes» va el círculo a la izquierda, como hoy; en
  // «Terminados» y «Recibidos» va la columna Estado a la derecha, donde cabe
  // «Marcar recibido». Así no conviven dos controles en la misma fila.
  const conCirculo = CIRCULO && (!BULTOS || filtro === "pendiente");
  const conEstado = BULTOS ? filtro !== "pendiente" : !CIRCULO;
  const columnas = 3 + (conCirculo ? 1 : 0) + (conEstado ? 1 : 0);

  // Agrupada por empresa (Daniel, 6-oct-2026): el encabezado del grupo dice la
  // empresa y la cuenta; las filas ya no la repiten. Con una sola empresa, un solo grupo.
  const tabla = (
    <div className="-mx-4 border-y border-gray-200 bg-white sm:mx-0 sm:rounded-lg sm:border-x">
      <table className="w-full text-left text-xs sm:text-sm">
        <thead className="border-b border-gray-200 text-xs font-medium text-gray-400 sm:uppercase sm:tracking-wide">
          <tr>
            {conCirculo && <th className="w-11 py-2 pl-1.5 sm:pl-2"><span className="sr-only">{BULTOS ? "Terminado" : "Preparado"}</span></th>}
            <ThOrden col="antiguedad" api={orden} className={`py-2 pr-1 sm:px-3 ${conCirculo ? "pl-1" : "pl-3"}`}><span className="sm:hidden">Antig.</span><span className="hidden sm:inline">Antigüedad</span></ThOrden>
            <ThOrden col="cliente" api={orden} className="px-1 py-2 sm:px-3">Cliente</ThOrden>
            <ThOrden col="vendedor" api={orden} className={`py-2 sm:px-3 ${conCirculo ? "pl-1 pr-3" : "px-1"}`}>Vendedor</ThOrden>
            {conEstado && <th className="py-2 pl-0.5 pr-3 text-right sm:px-3">Estado</th>}
          </tr>
        </thead>
        {agruparPorEmpresa(visibles).map((g) => (
          <tbody key={g.empresa_key} className="divide-y divide-gray-100 align-top">
            <tr className="bg-gray-50">
              <th colSpan={columnas} scope="colgroup" className="px-3 py-2 text-left text-sm font-semibold text-gray-900">
                {nombreCortoEmpresa(g.empresa_key)} · {g.pedidos.length}
              </th>
            </tr>
            {ordenarGrupo(g.pedidos).map((p) => (
              <tr key={clave(p)}>
                {conCirculo && <td className="py-0 pl-1.5 align-top sm:pl-2">{circulo(p)}</td>}
                <td className={`whitespace-nowrap py-2 pr-1 text-gray-700 sm:px-3 ${conCirculo ? "pl-1 pt-3" : "pl-3"}`}>
                  <button
                    type="button"
                    title={fmtDate(fechaPanamaDe(p.fecha))}
                    onClick={() => setFechaAbierta((k) => (k === clave(p) ? null : clave(p)))}
                    className="text-left"
                  >
                    {fechaAbierta === clave(p) ? fmtDate(fechaPanamaDe(p.fecha)) : (
                      <>
                        <span className="sm:hidden">{haceDiasCorto(p.fecha, hoy)}</span>
                        <span className="hidden sm:inline">{haceDias(p.fecha, hoy)}</span>
                      </>
                    )}
                  </button>
                </td>
                <td className={`break-words px-1 py-2 sm:px-3 ${conCirculo ? "pt-3" : ""}`}>
                  {/* Con bultos, tocar el cliente abre el detalle del pedido. */}
                  {BULTOS ? (
                    <button type="button" onClick={() => setAbierto(detalleDe(p))} className="text-left">
                      <span className="font-medium text-blue-600 hover:text-blue-800">{p.cliente_nombre}</span>
                      <span className="block whitespace-nowrap text-xs text-gray-500">{p.secuencial}</span>
                    </button>
                  ) : (
                    <>
                      <span className="font-medium text-gray-900">{p.cliente_nombre}</span>
                      <span className="block whitespace-nowrap text-xs text-gray-500">{p.secuencial}</span>
                    </>
                  )}
                </td>
                <td className={`break-words py-2 text-gray-700 sm:px-3 ${conCirculo ? "pl-1 pr-3 pt-3" : "px-1"}`}>{vendedorEnPantalla(p.vendedor_nombre)}</td>
                {conEstado && (
                  <td className="py-1.5 pl-0.5 pr-3 text-right sm:px-3">{BULTOS ? controlBultos(p) : chipEstado(p)}</td>
                )}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );

  // v2 (hoy): la empresa apilada debajo del Vendedor en el celular.
  const tablaV2 = (
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
      {rotuloDe(p.estado)}
    </button>
  );

  // Una pantalla, una pregunta: el detalle REEMPLAZA la lista, no la tapa.
  if (BULTOS && abierto) {
    return (
      <PedidoBultos
        pedido={abierto}
        puedePoner={puedeMarcar}
        onVolver={() => {
          setAbierto(null);
          void cargar();
        }}
      />
    );
  }

  return (
    <div className={`max-w-6xl mx-auto px-4 sm:px-6 ${barra ? "pb-6 pt-3" : "py-6"}`}>
      {barra && (
        <EnLaBarra
          pestana="pedidos"
          filaIzq={chips}
          menu={POR_EMPRESA ? (
            <button type="button" onClick={() => void imprimir()} disabled={sinNadaQueImprimir} className={CLASE_FILA_MENU}>
              <Printer size={18} strokeWidth={1.8} aria-hidden /> Imprimir
            </button>
          ) : null}
        />
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        {/* AJUSTES_APPLE_6 (punto 2): el título en una línea y la frescura al lado si cabe; si no, debajo, chica. */}
        <div data-titulo-pedidos className={CIRCULO ? "flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5" : undefined}>
          <p className="text-base font-semibold text-gray-900">
            {pedidos ? (CIRCULO ? lineaDePendientesCorta(deLaEmpresa, hoy) : lineaDePendientes(deLaEmpresa, hoy)) : " "}
          </p>
          <LineaDeFrescura
            className={CIRCULO ? "!text-xs" : undefined}
            actualizado={actualizado}
            opciones={susEmpresas.map((empresa) => ({ modulo: "pedidos", empresa, label: nombreCortoEmpresa(empresa) }))}
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
          {BULTOS
            ? `Sin pedidos ${CHIPS.find((c) => c.value === filtro)?.label.toLowerCase() ?? ""}`.trim()
            : filtro === "pendiente" ? "Sin pedidos pendientes" : "Sin pedidos preparados"}
        </p>
      ) : NUEVO ? (
        POR_EMPRESA ? tabla : tablaV2
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
