"use client";

// Guías › «Pedidos» (5-oct-2026, `PEDIDOS_BODEGA_2026_10`). La pregunta de la
// pantalla: «¿qué pedidos me faltan por preparar?». Lista del más viejo al más
// nuevo; un toque cambia Pendiente ↔ Preparado. 🔴 Sin enlace a Etiquetas ni
// a Guías (Daniel, 5-oct-2026). Solo LEE lo que trajo el cron de madrugada:
// «Actualizar» trae las 6 empresas una tras otra por `sync-now` (módulo
// «pedidos»), como Ventas y CxC con «Todas».

import { useEffect, useState } from "react";
import { Check, Printer, Undo2 } from "lucide-react";
import { ConfirmModal } from "@/components/ui";
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
  estadoLeido,
  faltaParaVerificar,
  textoUnidades,
  tituloDeFirmas,
  ultimaFirma,
  siguienteEstado,
  type EstadoBultos,
} from "@/lib/guias/pedidos-bultos";
import {
  PEDIDOS_FLUJO_SIMPLE_2026_10 as SIMPLE,
  ESTADOS_FLUJO_SIMPLE,
  ROTULO_ESTADO_FLUJO_SIMPLE,
  PESTANA_FLUJO_SIMPLE,
  MAX_NOTA_MUESTRA,
  lineaEsperaMuestra,
  estadoFlujoSimpleLeido,
  validarCantidadBultos,
  ultimaFirmaFlujoSimple,
  diasEnPreparado,
  preparadoViejo,
  lineaPreparadoHaceDias,
  type EstadoFlujoSimple,
  type FirmasFlujoSimple,
} from "@/lib/guias/pedidos-flujo-simple";
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

type Filtro = EstadoPedido | EstadoBultos | EstadoFlujoSimple;
/**
 * 🔴 Con el flujo SIMPLIFICADO (7-oct-2026) son CUATRO chips: Pendiente →
 * Preparado → Facturado → Despachado. Con bultos (lo de hoy) son tres:
 * Pendiente → Terminado (bodega) → Recibido (la secretaria) → Etiquetas.
 * Apagados los dos, quedan los de siempre.
 */
const CHIPS: { value: Filtro; label: string }[] = SIMPLE
  ? ESTADOS_FLUJO_SIMPLE.map((e) => ({ value: e, label: PESTANA_FLUJO_SIMPLE[e] }))
  : BULTOS
  ? ESTADOS_BULTOS.map((e) => ({ value: e, label: `${ROTULO_ESTADO_BULTOS[e]}s` }))
  : [
      { value: "pendiente", label: "Pendientes" },
      { value: "preparado", label: "Preparados" },
    ];

const clave = (p: Pick<PedidoBodega, "empresa_key" | "pedido_switch_id">) => `${p.empresa_key}:${p.pedido_switch_id}`;

/** Lo que el detalle con bultos necesita de la fila. */
/** El rótulo del estado, con los tres juegos: los 2 de hoy, los 3 con bultos y los 3 del flujo simple. */
const rotuloDe = (e: PedidoBodega["estado"]): string =>
  e === "pendiente" || e === "preparado"
    ? ROTULO_ESTADO[e]
    : e === "recibido" || e === "en_preparacion"
    ? ROTULO_ESTADO_FLUJO_SIMPLE[e]
    : ROTULO_ESTADO_BULTOS[e];

const detalleDe = (p: PedidoBodega): PedidoDelDetalle => ({
  empresa_key: p.empresa_key,
  pedido_switch_id: p.pedido_switch_id,
  secuencial: p.secuencial,
  cliente_codigo: p.cliente_codigo,
  cliente_nombre: p.cliente_nombre,
});

export default function PedidosView({
  puedeMarcar = true,
  /** 🔴 «Verificado» lo marca la secretaria (y admin), nunca bodega. */
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
  /**
   * 🔴 CAMBIAR DE ESTADO PIDE CONFIRMAR (Daniel, 7-oct-2026: *«al menos que al
   * poner, ponga botón de confirmar para que no se le vaya sin querer»*). Era
   * un toque y con el dedo en la lista se marcaba un pedido ajeno sin querer.
   * Un pedido marcado por error hace que lo prepare o lo verifique quien no
   * debía, y la regla de los dos pares de ojos vive de esa firma.
   */
  const [porConfirmar, setPorConfirmar] = useState<{ pedido: PedidoBodega; destino: EstadoBultos } | null>(null);

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
      // Con la lista ya en pantalla (refresco al cambiar de pestaña), se deja
      // lo que hay y se avisa; solo la primera carga cae al aviso rojo.
      if (pedidos === null) setError(true);
      else toast("No se pudo actualizar la lista. Intenta de nuevo.", "warning");
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
        | {
            cambiado_por: string;
            cambiado_en: string;
            envio?: { bultos: number };
            avisoEnvio?: string;
            envioAnulado?: boolean;
            error?: string;
          }
        | null;
      if (!r.ok) throw new Error(d?.error ?? String(r.status));
      setPedidos((xs) => (xs ?? []).map((x) => (clave(x) === clave(p) ? { ...x, cambiado_por: d!.cambiado_por, cambiado_en: d!.cambiado_en } : x)));
      // Regla 6: el envío de Etiquetas nace al recibir. Si no se pudo, se DICE
      // (el pedido quedó recibido igual: el aviso no es un error).
      if (d?.envio) toast(`Envío de Etiquetas creado · ${d.envio.bultos} ${d.envio.bultos === 1 ? "bulto" : "bultos"}`, "success");
      else if (d?.avisoEnvio) toast(`Verificado. ${d.avisoEnvio}`, "warning");
      // 🔴 Volver a Preparado anula el envío: se dice, no se calla.
      else if (d?.envioAnulado) toast("Volvió a Preparado · envío de Etiquetas anulado", "success");
    } catch (e) {
      poner(p.estado);
      const msg = e instanceof Error && e.message.length < 90 ? e.message : "No se pudo guardar el estado. Intenta de nuevo.";
      toast(msg, "error");
    }
  }

  /**
   * Lo que dice la ventana de confirmar, por destino. El título es el pedido
   * —para que se vea CUÁL se está marcando, que es justo lo que se marcaba por
   * error— y el mensaje, la consecuencia.
   */
  function textoDeConfirmar(p: PedidoBodega, destino: EstadoBultos) {
    const titulo = `Pedido ${p.secuencial} · ${p.cliente_nombre}`;
    if (destino === "verificado") {
      return { titulo, mensaje: "Queda verificado, con la firma de quien confirma, y nace su envío de Etiquetas.", boton: "Marcar verificado" };
    }
    if (estadoLeido(p.estado) === "verificado") {
      return {
        titulo,
        mensaje: "Vuelve a Preparado y se anula su envío de Etiquetas. La firma de quien lo preparó se conserva.",
        boton: "Volver a Preparado",
      };
    }
    return { titulo, mensaje: "Queda preparado, con la firma de quien confirma, y pasa a la lista de Preparados.", boton: "Marcar preparado" };
  }

  /** Confirmar y recién entonces mover el pedido. */
  function confirmar() {
    const pedir = porConfirmar;
    setPorConfirmar(null);
    if (!pedir) return;
    const { pedido: p, destino } = pedir;
    // El círculo se llena un instante antes de saltar de lista, como antes.
    if (destino === "preparado" && estadoLeido(p.estado) === "pendiente") {
      const k = clave(p);
      setEnTransito((s) => new Set(s).add(k));
      setTimeout(() => {
        setEnTransito((s) => { const n = new Set(s); n.delete(k); return n; });
        void cambiar(p, destino);
      }, 450);
      return;
    }
    void cambiar(p, destino);
  }

  // ── FLUJO SIMPLIFICADO (7-oct-2026) ─────────────────────────────────────
  // Lo que anota bodega en la fila, mientras no se envía: la verdad sigue en
  // `pedidos` hasta que se confirma.
  const [bultoEnFila, setBultoEnFila] = useState<Record<string, string>>({});
  // «Facturado» y «Despachado» SÍ piden confirmar (son el trabajo de la
  // secretaria, con el mismo riesgo de marcar la fila de al lado); «Preparado»
  // no: escribir el número y tocar el botón YA es la confirmación, y Daniel
  // pidió menos pasos, no más.
  const [porConfirmarSimple, setPorConfirmarSimple] = useState<{ pedido: PedidoBodega; destino: EstadoFlujoSimple } | null>(null);

  /** Mueve el pedido, con los bultos si los hay. Optimista, revierte si falla. */
  async function moverSimple(p: PedidoBodega, destino: EstadoFlujoSimple, bultos?: number) {
    const antes = { estado: p.estado, bultos: p.bultos, espera_muestra_desde: p.espera_muestra_desde, espera_muestra_nota: p.espera_muestra_nota };
    // Volver a Pendiente o a En preparación borra los bultos anotados (el
    // servidor hace lo mismo); marcar Preparado quita la espera de muestra.
    const bultosDespues = destino === "pendiente" || destino === "en_preparacion" ? null : bultos ?? p.bultos;
    const sinEspera = destino === "en_preparacion" ? {} : { espera_muestra_desde: null, espera_muestra_nota: null };
    setPedidos((xs) => (xs ?? []).map((x) => (clave(x) === clave(p) ? { ...x, estado: destino, bultos: bultosDespues, ...sinEspera } : x)));
    try {
      const r = await fetch("/api/guias/pedidos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_key: p.empresa_key,
          pedido_switch_id: p.pedido_switch_id,
          estado: destino,
          ...(bultos != null ? { bultos } : {}),
        }),
      });
      const d = (await r.json().catch(() => null)) as Record<string, unknown> | null;
      if (!r.ok) throw new Error(typeof d?.error === "string" ? d.error : String(r.status));
      setPedidos((xs) => (xs ?? []).map((x) => (clave(x) === clave(p) ? { ...x, ...d } : x)));
      setBultoEnFila((m) => { const n = { ...m }; delete n[clave(p)]; return n; });
    } catch (e) {
      setPedidos((xs) => (xs ?? []).map((x) => (clave(x) === clave(p) ? { ...x, ...antes } : x)));
      const msg = e instanceof Error && e.message.length < 90 ? e.message : "No se pudo guardar el estado. Intenta de nuevo.";
      toast(msg, "error");
    }
  }

  /** Bodega marca «Preparado»: valida el número de bultos y lo manda de una vez. */
  function marcarPreparadoSimple(p: PedidoBodega) {
    const v = validarCantidadBultos(bultoEnFila[clave(p)] ?? "");
    if (!v.ok) return toast(v.error, "warning");
    void moverSimple(p, "preparado", v.valor);
  }

  // ── «En espera de muestra» (9-oct-2026) ─────────────────────────────────
  // Un solo motivo, así que un solo botón y una nota opcional. Poner y quitar
  // piden confirmar, con la misma ventana del sistema.
  const [porMarcarMuestra, setPorMarcarMuestra] = useState<{ pedido: PedidoBodega; poner: boolean } | null>(null);
  const [notaMuestra, setNotaMuestra] = useState("");

  async function marcarEsperaMuestra() {
    const pedir = porMarcarMuestra;
    setPorMarcarMuestra(null);
    if (!pedir) return;
    const { pedido: p, poner } = pedir;
    try {
      const r = await fetch("/api/guias/pedidos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_key: p.empresa_key, pedido_switch_id: p.pedido_switch_id, muestra: poner, nota: poner ? notaMuestra : undefined }),
      });
      const d = (await r.json().catch(() => null)) as Record<string, unknown> | null;
      if (!r.ok) throw new Error(typeof d?.error === "string" ? d.error : String(r.status));
      setPedidos((xs) => (xs ?? []).map((x) => (clave(x) === clave(p) ? { ...x, ...d } : x)));
      setNotaMuestra("");
    } catch (e) {
      const msg = e instanceof Error && e.message.length < 90 ? e.message : "No se pudo guardar. Intenta de nuevo.";
      toast(msg, "error");
    }
  }

  function confirmarSimple() {
    const pedir = porConfirmarSimple;
    setPorConfirmarSimple(null);
    if (pedir) void moverSimple(pedir.pedido, pedir.destino);
  }

  function textoDeConfirmarSimple(p: PedidoBodega, destino: EstadoFlujoSimple) {
    const titulo = `Pedido ${p.secuencial} · ${p.cliente_nombre}`;
    if (destino === "recibido") {
      return { titulo, mensaje: "Queda recibido: confirmas que ya tienes el pedido en mano. Se cierra en Pedidos.", boton: "Marcar recibido" };
    }
    if (destino === "en_preparacion" && estadoFlujoSimpleLeido(p.estado) === "pendiente") {
      return { titulo, mensaje: "Confirmas que recibiste la hoja del pedido. Pasa a En preparación.", boton: "Iniciar preparación" };
    }
    // 🔴 Deshacer (8-oct-2026): le toca a quien marcó el paso. El registro de
    // actividad guarda quién lo había marcado.
    const mensaje =
      destino === "pendiente"
        ? "Vuelve a Pendiente: bodega todavía no tiene la hoja del pedido."
        : destino === "en_preparacion"
          ? "Vuelve a En preparación: se quitan los bultos anotados."
          : "Vuelve a Preparado: se quita la recepción. La firma de bodega se conserva.";
    return { titulo, mensaje, boton: `Volver a ${ROTULO_ESTADO_FLUJO_SIMPLE[destino]}` };
  }

  const firmasSimpleDe = (p: PedidoBodega): FirmasFlujoSimple => ({
    en_preparacion_por: p.en_preparacion_por ?? null,
    en_preparacion_en: p.en_preparacion_en ?? null,
    preparado_por: p.preparado_por ?? null,
    preparado_en: p.preparado_en ?? null,
    recibido_por: p.recibido_por ?? null,
    recibido_en: p.recibido_en ?? null,
  });

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
      const titulo = SIMPLE
        ? `Pedidos · ${PESTANA_FLUJO_SIMPLE[filtro as EstadoFlujoSimple].toLowerCase()} · ${empresa === "todas" ? "Todas las empresas" : nombreCortoEmpresa(empresa)} · impreso ${fmtDate(hoy)}`
        : BULTOS
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
            // 🔴 Cambiar de pestaña vuelve a leer la lista de la BASE (Daniel,
            // 9-oct-2026: «que al poner uno de los filtros se actualice»), para
            // ver lo que marcó otra persona. Instantáneo: se muestra lo que ya
            // hay y se refresca encima. NUNCA llama a Switch: los pedidos
            // nuevos siguen llegando por los crons y por «Actualizar».
            onClick={() => { setFiltro(c.value); void cargar(); }}
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
   *   · Pendiente  → el círculo ○ de siempre, que lo pasa a Preparado.
   *   · Preparado  → «Verificar», y SOLO lo ve quien puede marcarlo: bodega lee
   *     el chip «Preparado» quieto, porque «no se puede confiar solo en bodega».
   *   · Verificado → ✓ quieto, y al lado «Volver a Preparado» para la
   *     secretaria y admin (7-oct-2026); bodega solo lee el ✓.
   *
   * 🔴 Y «VERIFICAR» ESTÁ APAGADO MIENTRAS FALTEN ARTÍCULOS SIN BULTO
   * (7-oct-2026). El botón apagado DICE qué falta, como en Préstamos. Lo decide
   * el SERVIDOR con la misma función (`faltaParaVerificar`); la pantalla solo
   * deja de ofrecer lo que la ruta va a rechazar.
   */
  const controlBultos = (p: PedidoBodega) => {
    const e = estadoLeido(p.estado);
    const firma = p.cambiado_por && p.cambiado_en ? `${p.cambiado_por} · ${fmtDate(fechaPanamaDe(p.cambiado_en))}` : undefined;
    if (e === "pendiente") return circulo(p);
    const base = "inline-flex h-7 items-center whitespace-nowrap rounded-full border px-2.5 text-xs font-medium";
    if (e === "verificado") {
      const visto = (
        <span className={`${base} border-emerald-200 bg-emerald-50 text-emerald-700`} title={firma}>
          <Check size={13} strokeWidth={3} aria-hidden className="mr-1" />
          {ROTULO_ESTADO_BULTOS.verificado}
        </span>
      );
      if (!puedeRecibir) return visto;
      return (
        <span className="inline-flex items-center gap-1.5">
          {visto}
          <button
            type="button"
            onClick={() => setPorConfirmar({ pedido: p, destino: "preparado" })}
            title="Volver a Preparado"
            className="relative inline-flex h-7 items-center gap-1 rounded-full px-1.5 text-xs font-medium text-blue-600 transition hover:text-blue-800 active:scale-[0.97] before:absolute before:-inset-x-1 before:-inset-y-2 before:content-['']"
          >
            <Undo2 size={13} strokeWidth={1.8} aria-hidden />
            <span className="hidden sm:inline">Volver a Preparado</span>
            <span className="sr-only sm:hidden">Volver a Preparado</span>
          </button>
        </span>
      );
    }
    if (!puedeRecibir) {
      return <span className={`${base} border-gray-300 bg-white text-gray-700`} title={firma}>{ROTULO_ESTADO_BULTOS.preparado}</span>;
    }
    // `sin_bulto` en `null` = el servidor todavía no sabe: no se apaga nada.
    const falta = p.sin_bulto == null ? null : faltaParaVerificar(p.sin_bulto, p.articulos ?? 0);
    return (
      <>
        <button
          type="button"
          onClick={() => setPorConfirmar({ pedido: p, destino: "verificado" })}
          disabled={!!falta}
          title={falta ?? firma}
          className={`${base} relative border-gray-900 bg-gray-900 text-white transition active:scale-[0.97] disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400 before:absolute before:-inset-x-1 before:-inset-y-2 before:content-['']`}
        >
          Verificar
        </button>
        {/* El botón apagado dice qué falta, visible (como «Falta: la cuota» de
            Préstamos): un `title` no se ve en el celular. */}
        {falta && <span className="mt-0.5 block text-xs text-gray-400">{falta}</span>}
      </>
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
        aria-label={`${p.cliente_nombre} · ${p.secuencial}: ${lleno ? "preparado" : "pendiente"}`}
        disabled={enTransito.has(k)}
        onClick={() => {
          // 🔴 Con bultos, el círculo PIDE CONFIRMAR (7-oct-2026): un toque
          // suelto marcaba el pedido de la fila de al lado. Apagado, el toque
          // de siempre.
          if (BULTOS) return setPorConfirmar({ pedido: p, destino: "preparado" });
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

  const firmasDe = (p: PedidoBodega) => ({
    preparado_por: p.preparado_por ?? null,
    preparado_en: p.preparado_en ?? null,
    verificado_por: p.verificado_por ?? null,
    verificado_en: p.verificado_en ?? null,
  });

  // ── El control de la fila, flujo simplificado ───────────────────────────
  // UN control por fila, que dice lo que hace (docs/diseno.md, regla 6):
  //   · Pendiente → la casilla del número de bultos + «Preparado», apagado
  //     hasta que el número sea válido (bodega o la secretaria).
  //   · Preparado → los bultos que anotó bodega, quietos, + «Recibir» (solo
  //     la secretaria o admin; bodega solo lee el chip). Termina AQUÍ:
  //     facturar en Switch y Etiquetas quedan afuera de Pedidos.
  //   · Recibido → el pedido ya se cerró: un chip quieto y nada más.
  const controlSimple = (p: PedidoBodega) => {
    const e = estadoFlujoSimpleLeido(p.estado);
    const base = "inline-flex h-7 items-center whitespace-nowrap rounded-full border px-2.5 text-xs font-medium";
    // En el celular los controles se APILAN (nunca de lado, regla de
    // `docs/diseno.md`: «nada se desliza de lado en el celular»): el botón de
    // abajo quedaba cortado contra el borde a 390 px.
    const fila = "flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-1.5";
    // 🔴 LAS UNIDADES TAMBIÉN EN PENDIENTES (Daniel, 8-oct-2026): antes solo
    // salían pegadas a los bultos, y un pedido pendiente no tiene bultos.
    const chipUnidades = p.piezas != null && (
      <span className={`${base} border-gray-300 bg-white text-gray-700`}>{textoUnidades(p.piezas)}</span>
    );
    // 🔴 DESHACER (Daniel, 8-oct-2026): le toca a quien marcó el paso —bodega
    // deshace Preparado, la secretaria deshace Recibido; admin, los dos—. El
    // servidor aplica la misma regla (`puedeMoverFlujoSimple`).
    const deshacer = (destino: EstadoFlujoSimple) => (
      <button
        type="button"
        onClick={() => setPorConfirmarSimple({ pedido: p, destino })}
        className="h-7 whitespace-nowrap px-1 text-xs text-gray-500 underline-offset-2 hover:text-gray-900 hover:underline"
      >
        Volver a {ROTULO_ESTADO_FLUJO_SIMPLE[destino]}
      </button>
    );
    if (e === "pendiente") {
      if (!puedeMarcar) return chipUnidades || <span className="text-gray-400">—</span>;
      // 🔴 9-oct-2026: bodega confirma que le entregaron la hoja del pedido.
      return (
        <div className={fila}>
          {chipUnidades}
          <button
            type="button"
            onClick={() => setPorConfirmarSimple({ pedido: p, destino: "en_preparacion" })}
            className="h-9 whitespace-nowrap rounded-md bg-black px-3 text-xs font-medium text-white transition active:scale-[0.97]"
          >
            Iniciar preparación
          </button>
        </div>
      );
    }
    if (e === "en_preparacion") {
      if (!puedeMarcar) return chipUnidades || <span className="text-gray-400">—</span>;
      const valor = bultoEnFila[clave(p)] ?? "";
      const enEspera = !!p.espera_muestra_desde;
      // Lo principal (bultos + Preparado) en una línea; lo secundario, debajo:
      // en la computadora los cinco controles de corrido se salían de la tabla.
      return (
        <div className="flex flex-col items-end gap-1">
        <div className={fila}>
          {chipUnidades}
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={9999}
            value={valor}
            placeholder="N.°"
            aria-label={`Bultos del pedido ${p.secuencial}`}
            onChange={(ev) => setBultoEnFila((m) => ({ ...m, [clave(p)]: ev.target.value }))}
            // 44 px de alto en el celular (regla 10 de docs/diseno.md).
            className="h-11 w-16 rounded-md border border-gray-300 px-1.5 text-right tabular-nums focus:border-gray-900 focus:outline-none sm:h-9"
          />
          <button
            type="button"
            onClick={() => marcarPreparadoSimple(p)}
            disabled={!valor.trim()}
            className="h-9 whitespace-nowrap rounded-md bg-black px-3 text-xs font-medium text-white transition active:scale-[0.97] disabled:opacity-40"
          >
            Preparado
          </button>
        </div>
        <div className={fila}>
          {/* Un solo motivo, un solo botón (Daniel, 9-oct-2026). */}
          <button
            type="button"
            onClick={() => setPorMarcarMuestra({ pedido: p, poner: !enEspera })}
            className="h-7 whitespace-nowrap px-1 text-xs text-amber-700 underline-offset-2 hover:underline"
          >
            {enEspera ? "Quitar espera" : "En espera de muestra"}
          </button>
          {deshacer("pendiente")}
        </div>
        </div>
      );
    }
    // 🔴 LAS PIEZAS, JUNTO A LOS BULTOS (7-oct-2026, Daniel: «¿puedes poner la
    // cantidad de pieza?»): «5 bultos · 620 unidades». `p.piezas == null` =
    // nadie abrió el detalle de este pedido todavía: se calla, no se inventa.
    const chipBultos = (
      <span className={`${base} border-gray-300 bg-white text-gray-700`}>
        {[p.bultos ? `${p.bultos} ${p.bultos === 1 ? "bulto" : "bultos"}` : null, p.piezas != null ? textoUnidades(p.piezas) : null]
          .filter(Boolean)
          .join(" · ") || "—"}
      </span>
    );
    if (e === "preparado") {
      if (!puedeRecibir) {
        return puedeMarcar ? (
          <div className={fila}>
            {chipBultos}
            {deshacer("en_preparacion")}
          </div>
        ) : chipBultos;
      }
      return (
        <div className={fila}>
          {chipBultos}
          {puedeMarcar && deshacer("en_preparacion")}
          <button
            type="button"
            onClick={() => setPorConfirmarSimple({ pedido: p, destino: "recibido" })}
            className="h-7 whitespace-nowrap rounded-full border border-gray-900 bg-gray-900 px-2.5 text-xs font-medium text-white transition active:scale-[0.97]"
          >
            Recibir
          </button>
        </div>
      );
    }
    // recibido: cerrado. Solo la secretaria (o admin) puede deshacerlo.
    const chipRecibido = (
      <span className={`${base} border-emerald-200 bg-emerald-50 text-emerald-700`}>
        <Check size={13} strokeWidth={3} aria-hidden className="mr-1" />
        {ROTULO_ESTADO_FLUJO_SIMPLE.recibido}
      </span>
    );
    // 🔴 Las unidades se ven en TODAS las pestañas (Daniel, 8-oct-2026: «lo quiero afuera»).
    if (!puedeRecibir) {
      return (
        <div className={fila}>
          {chipBultos}
          {chipRecibido}
        </div>
      );
    }
    return (
      <div className={fila}>
        {chipBultos}
        {chipRecibido}
        {deshacer("preparado")}
      </div>
    );
  };

  /**
   * 🔴 UN «PREPARADO» QUE NADIE RECIBE TIENE QUE VERSE (Daniel): en la lista
   * de la secretaria, la línea de antigüedad se vuelve ámbar y dice cuánto
   * lleva, a los `PREPARADO_VIEJO_DIAS` (2) de marcado. Mismo tono de aviso
   * que el resto del sistema (`docs/diseno.md`: ámbar = aviso).
   */
  const avisoPreparadoViejo = (p: PedidoBodega) => {
    if (estadoFlujoSimpleLeido(p.estado) !== "preparado" || !p.preparado_en) return null;
    // El instante EXACTO de ahora, no la fecha-sin-hora de `hoy`: dos
    // pedidos preparados el mismo día pueden llevar horas muy distintas.
    const dias = diasEnPreparado(p.preparado_en, new Date().toISOString());
    if (!preparadoViejo(dias)) return null;
    return <span className="block text-xs font-medium text-amber-700">{lineaPreparadoHaceDias(dias)}</span>;
  };

  /**
   * 🔴 «En espera de muestra» (9-oct-2026): ámbar, con los días que lleva y la
   * nota si tiene. Lo ve todo el que ve Pedidos.
   */
  const avisoEsperaMuestra = (p: PedidoBodega) => {
    if (estadoFlujoSimpleLeido(p.estado) !== "en_preparacion" || !p.espera_muestra_desde) return null;
    const dias = diasEnPreparado(p.espera_muestra_desde, new Date().toISOString());
    return (
      <span className="mt-0.5 block text-xs font-medium text-amber-700">
        {lineaEsperaMuestra(dias, p.espera_muestra_por, p.espera_muestra_desde)}
        {p.espera_muestra_nota && <span className="block font-normal">{p.espera_muestra_nota}</span>}
      </span>
    );
  };

  const tablaSimple = (
    <div className="-mx-4 border-y border-gray-200 bg-white sm:mx-0 sm:rounded-lg sm:border-x">
      <table className="w-full text-left text-xs sm:text-sm">
        <thead className="border-b border-gray-200 text-xs font-medium text-gray-400 sm:uppercase sm:tracking-wide">
          <tr>
            <ThOrden col="antiguedad" api={orden} className="py-2 pl-3 pr-1 sm:px-3"><span className="sm:hidden">Antig.</span><span className="hidden sm:inline">Antigüedad</span></ThOrden>
            <ThOrden col="cliente" api={orden} className="px-1 py-2 sm:px-3">Cliente</ThOrden>
            <th className="hidden px-3 py-2 sm:table-cell">Firma</th>
            <th className="py-2 pl-0.5 pr-3 text-right sm:px-3"><span className="sr-only sm:not-sr-only">Estado</span></th>
          </tr>
        </thead>
        {agruparPorEmpresa(visibles).map((g) => (
          <tbody key={g.empresa_key} className="divide-y divide-gray-100 align-top">
            <tr className="bg-gray-50">
              <th colSpan={4} scope="colgroup" className="px-3 py-2 text-left text-sm font-semibold text-gray-900">
                {nombreCortoEmpresa(g.empresa_key)} · {g.pedidos.length}
              </th>
            </tr>
            {ordenarGrupo(g.pedidos).map((p) => (
              <tr key={clave(p)}>
                <td className="whitespace-nowrap py-2 pl-3 pr-1 text-gray-700 sm:px-3">
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
                <td className="break-words px-1 py-2 sm:px-3">
                  <button type="button" onClick={() => setAbierto(detalleDe(p))} className="text-left">
                    <span className="font-medium text-blue-600 hover:text-blue-800">{p.cliente_nombre}</span>
                    {/* En el celular el renglón se parte: de corrido empujaba la
                        columna de controles fuera de la pantalla. */}
                    <span className="block text-xs text-gray-500 sm:whitespace-nowrap">
                      {p.secuencial}
                      {vendedorEnPantalla(p.vendedor_nombre) ? ` · ${vendedorEnPantalla(p.vendedor_nombre)}` : ""}
                    </span>
                    <span className="block text-xs text-gray-500 sm:hidden">{ultimaFirmaFlujoSimple(firmasSimpleDe(p))}</span>
                  </button>
                  {avisoEsperaMuestra(p)}
                </td>
                <td
                  title={ultimaFirmaFlujoSimple(firmasSimpleDe(p)) ?? undefined}
                  className="hidden whitespace-nowrap px-3 py-2 text-xs text-gray-600 sm:table-cell"
                >
                  {ultimaFirmaFlujoSimple(firmasSimpleDe(p)) ?? <span className="text-gray-300">—</span>}
                </td>
                <td className="py-1.5 pl-0.5 pr-3 text-right sm:px-3">
                  {controlSimple(p)}
                  {avisoPreparadoViejo(p)}
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );

  // 🔴 CADA LISTA MUESTRA UN SOLO TIPO DE CONTROL, porque se filtra por UN
  // estado: en «Pendientes» va el círculo a la izquierda, como hoy; en
  // «Terminados» y «Recibidos» va la columna Estado a la derecha, donde cabe
  // «Marcar recibido». Así no conviven dos controles en la misma fila.
  const conCirculo = CIRCULO && (!BULTOS || filtro === "pendiente");
  const conEstado = BULTOS ? filtro !== "pendiente" : !CIRCULO;
  const columnas = 3 + (conCirculo ? 1 : 0) + (conEstado ? 1 : 0) + (BULTOS ? 1 : 0);

  // Agrupada por empresa (Daniel, 6-oct-2026): el encabezado del grupo dice la
  // empresa y la cuenta; las filas ya no la repiten. Con una sola empresa, un solo grupo.
  const tabla = (
    <div className="-mx-4 border-y border-gray-200 bg-white sm:mx-0 sm:rounded-lg sm:border-x">
      <table className="w-full text-left text-xs sm:text-sm">
        <thead className="border-b border-gray-200 text-xs font-medium text-gray-400 sm:uppercase sm:tracking-wide">
          <tr>
            {conCirculo && <th className="w-11 py-2 pl-1.5 sm:pl-2"><span className="sr-only">Preparado</span></th>}
            <ThOrden col="antiguedad" api={orden} className={`py-2 pr-1 sm:px-3 ${conCirculo ? "pl-1" : "pl-3"}`}><span className="sm:hidden">Antig.</span><span className="hidden sm:inline">Antigüedad</span></ThOrden>
            <ThOrden col="cliente" api={orden} className="px-1 py-2 sm:px-3">Cliente</ThOrden>
            {/* 🔴 EL VENDEDOR BAJA DEBAJO DEL CLIENTE (Daniel, 6-oct-2026): no
                merece una columna propia, y la que deja libre la ocupa Bultos
                —cuántos bultos lleva armados—, que es el dato de este módulo y
                el que dice de un vistazo el tamaño del trabajo. Sin bultos
                sigue teniendo su columna, como hoy. */}
            {!BULTOS && <ThOrden col="vendedor" api={orden} className={`py-2 sm:px-3 ${conCirculo ? "pl-1 pr-3" : "px-1"}`}>Vendedor</ThOrden>}
            {BULTOS && <th className="px-1 py-2 text-right sm:px-3">Bultos</th>}
            {/* 🔴 UNA SOLA columna de firma, con el ÚLTIMO paso (Daniel,
                6-oct-2026: «Verificado por» ocupaba demasiado y se comía el
                ancho del cliente). El paso anterior, al tocar. */}
            {BULTOS && <th className="hidden px-3 py-2 sm:table-cell">Firma</th>}
            {/* En el celular el rótulo sobra —el botón dice lo que hace— y
                recortado se veía mal; en la computadora sí va. */}
            {conEstado && (
              <th className="py-2 pl-0.5 pr-3 text-right sm:px-3">
                <span className="sr-only sm:not-sr-only">Estado</span>
              </th>
            )}
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
                      <span className="block whitespace-nowrap text-xs text-gray-500">
                        {p.secuencial}
                        {/* El vendedor, acá debajo: ya no gasta una columna. */}
                        {vendedorEnPantalla(p.vendedor_nombre) ? ` · ${vendedorEnPantalla(p.vendedor_nombre)}` : ""}
                      </span>
                      {/* En el CELULAR, debajo del pedido; en la computadora
                          tienen su propia columna. */}
                      {/* En el celular, la misma firma corta de la columna:
                          «Preparado por Julio · 3:20 p. m.» se iba a dos
                          renglones y empujaba la fila. */}
                      <span className="block text-xs text-gray-500 sm:hidden">{ultimaFirma(firmasDe(p))}</span>
                    </button>
                  ) : (
                    <>
                      <span className="font-medium text-gray-900">{p.cliente_nombre}</span>
                      <span className="block whitespace-nowrap text-xs text-gray-500">{p.secuencial}</span>
                    </>
                  )}
                </td>
                {!BULTOS && (
                  <td className={`break-words py-2 text-gray-700 sm:px-3 ${conCirculo ? "pl-1 pr-3 pt-3" : "px-1"}`}>{vendedorEnPantalla(p.vendedor_nombre)}</td>
                )}
                {/* ponytail: esta tabla (flujo bulto-por-línea) queda DORMIDA
                    mientras `SIMPLE` esté prendido — ver el render de abajo:
                    `SIMPLE ? tablaSimple : …`. Las piezas se wirearon en
                    `chipBultos` de `tablaSimple`, que es la que se ve hoy;
                    agrégalas aquí también si ese flujo vuelve a activarse. */}
                {BULTOS && (
                  <td className={`whitespace-nowrap px-1 py-2 text-right tabular-nums text-gray-700 sm:px-3 ${conCirculo ? "pt-3" : ""}`}>
                    {p.bultos ? p.bultos : <span className="text-gray-300">—</span>}
                  </td>
                )}
                {BULTOS && (
                  <td
                    title={tituloDeFirmas(firmasDe(p))}
                    className={`hidden whitespace-nowrap px-3 py-2 text-xs text-gray-600 sm:table-cell ${conCirculo ? "pt-3" : ""}`}
                  >
                    {ultimaFirma(firmasDe(p)) ?? <span className="text-gray-300">—</span>}
                  </td>
                )}
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
  // 🔴 Flujo simplificado: el detalle es de SOLO MIRAR —sin columna Bulto, sin
  // casillas, sin barra de abajo—, porque el número se anota desde la lista.
  if (SIMPLE && abierto) {
    return (
      <PedidoBultos
        pedido={abierto}
        puedePoner={false}
        ocultarBulto
        onVolver={() => {
          setAbierto(null);
          void cargar();
        }}
      />
    );
  }
  if (BULTOS && abierto) {
    // 🔴 Verificado = congelado (7-oct-2026): las casillas del bulto no se
    // dibujan y el servidor rechaza el PATCH con la misma regla.
    const verificado = estadoLeido((pedidos ?? []).find((p) => clave(p) === clave(abierto))?.estado) === "verificado";
    return (
      <PedidoBultos
        pedido={abierto}
        puedePoner={puedeMarcar && !verificado}
        verificado={verificado}
        onVolver={() => {
          setAbierto(null);
          void cargar();
        }}
      />
    );
  }

  const confirmacion = porConfirmar && textoDeConfirmar(porConfirmar.pedido, porConfirmar.destino);
  const confirmacionSimple = porConfirmarSimple && textoDeConfirmarSimple(porConfirmarSimple.pedido, porConfirmarSimple.destino);
  const muestra = porMarcarMuestra;

  return (
    <div className={`max-w-6xl mx-auto px-4 sm:px-6 ${barra ? "pb-6 pt-3" : "py-6"}`}>
      {/* 🔴 Cambiar de estado pide confirmar (7-oct-2026). La MISMA ventana del
          sistema (`ConfirmModal`), nunca una propia. */}
      {confirmacion && (
        <ConfirmModal
          open
          onClose={() => setPorConfirmar(null)}
          onConfirm={confirmar}
          title={confirmacion.titulo}
          message={confirmacion.mensaje}
          confirmLabel={confirmacion.boton}
        />
      )}
      {/* 🔴 Flujo simplificado: «Facturado» y «Despachado» también piden
          confirmar —son el trabajo de la secretaria—; «Preparado» no (ver el
          porqué arriba de `moverSimple`). */}
      {confirmacionSimple && (
        <ConfirmModal
          open
          onClose={() => setPorConfirmarSimple(null)}
          onConfirm={confirmarSimple}
          title={confirmacionSimple.titulo}
          message={confirmacionSimple.mensaje}
          confirmLabel={confirmacionSimple.boton}
        />
      )}
      {muestra && (
        <ConfirmModal
          open
          onClose={() => { setPorMarcarMuestra(null); setNotaMuestra(""); }}
          onConfirm={() => void marcarEsperaMuestra()}
          title={`Pedido ${muestra.pedido.secuencial} · ${muestra.pedido.cliente_nombre}`}
          message={
            muestra.poner
              ? "Queda En espera de muestra: le faltan piezas que bodega trae de otro lado."
              : "Se quita la espera: la pieza ya llegó. Sigue En preparación."
          }
          confirmLabel={muestra.poner ? "Marcar en espera" : "Quitar espera"}
        >
          {muestra.poner && (
            <label className="mb-2 block text-sm text-gray-700">
              Observaciones (opcional)
              <input
                type="text"
                value={notaMuestra}
                maxLength={MAX_NOTA_MUESTRA}
                onChange={(ev) => setNotaMuestra(ev.target.value)}
                placeholder="Qué pieza falta"
                className="mt-1 h-11 w-full rounded-md border border-gray-300 px-3 text-base focus:border-gray-900 focus:outline-none sm:h-10 sm:text-sm"
              />
            </label>
          )}
        </ConfirmModal>
      )}
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
          {`Sin pedidos ${CHIPS.find((c) => c.value === filtro)?.label.toLowerCase() ?? ""}`.trim()}
        </p>
      ) : SIMPLE ? (
        tablaSimple
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
