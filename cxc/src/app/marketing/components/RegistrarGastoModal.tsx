"use client";

// ============================================================================
// UN SOLO BOTÓN: "Registrar gasto". Tres caminos detrás de la misma puerta.
//
// 🔴 EL PROYECTO DEJÓ DE SER UN PASO. Daniel: *"¿alguna vez creas un proyecto
// antes de tener un gasto?"* → *"no"*. *"El nombre del proyecto es solo una
// etiqueta"*. El dato que lo confirma: 18 de los 22 proyectos que existen se
// llaman literalmente "Remodelacion". Antes había que crear el proyecto y
// después colgarle facturas; eso se eliminó.
//
// ⚠️ `mk_proyectos` SE CONSERVA POR DEBAJO como contenedor, y los 22 proyectos
// actuales NO se tocan. Lo que se va es el PASO de crearlo: acá el proyecto se
// busca solo por el cliente y, si no existe, se crea con el nombre del cliente.
// El agrupamiento por cliente lo hace el sistema, no el usuario.
//
// ORDEN DE LA PUERTA — actualizado el 12-ago-2026 con la aprobación de Daniel:
//   Qué es      → Factura · Mueble · Gasto de la marca
//   Cliente     → OBLIGATORIO en Factura y Mueble. Daniel, textual: *"dejalo
//                 obligatorio, para gastos como vallas, o algun otro evento
//                 que vaya en el tab de impulsadora que ahi es para la marca
//                 en general"*. Medido antes del cambio: las 17 facturas con
//                 proyecto null de producción son TODAS pagos de impulsadora —
//                 0 facturas libres sin cliente, 0 entregas sin cliente.
//                 🔴 Y DE LA LISTA (12-ago-2026, misma noche). Daniel: *"donde
//                 dice cliente, me deja pasar sin que amarre un cliente de mi
//                 lista de fashion group? no te tengo que decir cada cosita,
//                 eso es obvio across todo el sistema"*. El campo es el
//                 selector CERRADO de la casa (`ClientePicker`, el de Guías y
//                 Cheques) SIN la salida "Otro": texto tipeado que no matchea
//                 NO enciende Continuar, y la pantalla dice el camino — el
//                 cliente que falta se da de alta EN SWITCH (los clientes
//                 nacen allá; el directorio se sincroniza de ahí). El
//                 typeahead libre (`ClienteTypeahead`) quedó solo en
//                 EditarProyectoModal, que edita proyectos históricos.
//   Marca       → UNA por gasto. Nada de repartos 50/50. Si el modal se abre
//                 desde la página de una marca, viene PRESELECCIONADA
//                 (`marcaInicial`) y se enseña como renglón fijo con "Cambiar"
//                 — no se pregunta dos veces.
//   Foto        → OPCIONAL, y puede llegar después.
//
// "GASTO DE LA MARCA" tiene DOS sub-opciones:
//   · Impulsadora → el flujo de SIEMPRE, intacto (RegistrarPagoModal,
//     anti-solape, split, comprobante obligatorio — nada de eso se tocó).
//   · Otro gasto  → vallas, eventos, catálogos: el formulario de factura con
//     `proyecto_id = null` y la marca elegida. El backend ya lo soportaba;
//     esos gastos caen en la carpeta General/ del ZIP como siempre.
// El "Cuánto" y el COMPROBANTE los pide el formulario de cada camino, que es el
// que ya existía y no se reescribió.
//
// 🔴 LA FOTO ESTÁ VIVA EN LOS TRES CAMINOS, SIEMPRE. Daniel, textual: *"te dije
// que no limites subir fotos de impulsadora porque si hago un evento y quiero
// subir fotos del evento me lo va a limitar, todo el modulo tiene que tener
// sentido"*. Ninguna regla de esta pantalla esconde ni apaga la foto por tipo
// de gasto ni por tener o no cliente. Lo único que mira el cliente es el AVISO
// del cierre ("N gastos sin foto"), que es otra cosa y vive en otro archivo.
//
// 🔴 EL COMPROBANTE ES OBLIGATORIO EN LOS TRES CAMINOS, y eso ya lo exigen los
// formularios de siempre — no se reimplementa acá.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/components/ToastSystem";
import { useFormModalDismiss } from "@/lib/hooks/useModalDismiss";
import ClientePicker from "@/components/ClientePicker";
import { FacturaForm } from "@/components/marketing";
import EntregaForm from "@/components/marketing/EntregaForm";
import RegistrarPagoModal from "./RegistrarPagoModal";
import { pedirUploadUrl, subirArchivoAStorage } from "./uploadHelpers";
import { MARCAS_BLOQUE } from "@/lib/marketing/bloques";
import type {
  EstadoPagoFactura,
  ImpulsadoraConEstado,
  MarcaPorcentajeInput,
  MkFactura,
  MkInventarioProducto,
  MkMarca,
  MkProyecto,
} from "@/lib/marketing/types";

type Camino = "factura" | "mueble" | "marca";
/** Sub-opción de "Gasto de la marca". */
type SubGasto = "impulsadora" | "otro";
type Paso = "tipo" | "datos" | "form";

interface Props {
  marcas: MkMarca[];
  /**
   * La marca de la página desde la que se abrió el modal (nivel 2/3 de
   * Marketing). Con esto puesto, la marca se enseña como renglón fijo con
   * "Cambiar" en vez de volver a preguntarla. Desde /marketing (la portada)
   * no hay marca de contexto y se pregunta como siempre.
   */
  marcaInicial?: MkMarca | null;
  onClose: () => void;
  /** Se llama cuando el gasto quedó guardado, para refrescar el inicio. */
  onSaved: () => void;
}

/** Proyecto tal como lo devuelve `GET /api/marketing/proyectos`. */
type ProyectoFila = MkProyecto;

const CAMINOS: ReadonlyArray<{
  key: Camino;
  titulo: string;
}> = [
  { key: "factura", titulo: "Factura" },
  { key: "mueble", titulo: "Mueble" },
  { key: "marca", titulo: "Gasto de la marca" },
];

const SUB_GASTOS: ReadonlyArray<{
  key: SubGasto;
  titulo: string;
  ayuda: string;
}> = [
  {
    key: "impulsadora",
    titulo: "Impulsadora",
    ayuda: "El pago de una impulsadora por el período que trabajó.",
  },
  {
    key: "otro",
    titulo: "Otro gasto",
    ayuda: "Vallas, eventos, catálogos, material general de la marca.",
  },
];

/** Orden de las marcas: el canónico del módulo puro, y lo demás al final. */
const ORDEN_MARCA = new Map<string, number>(
  MARCAS_BLOQUE.map((m, i) => [m.key, i] as const),
);

function ordenarMarcas(marcas: MkMarca[]): MkMarca[] {
  return [...marcas].sort((a, b) => {
    const ia = ORDEN_MARCA.get((a.codigo ?? "").trim().toUpperCase()) ?? 90;
    const ib = ORDEN_MARCA.get((b.codigo ?? "").trim().toUpperCase()) ?? 90;
    if (ia !== ib) return ia - ib;
    return a.nombre.localeCompare(b.nombre, "es");
  });
}

export default function RegistrarGastoModal({
  marcas,
  marcaInicial = null,
  onClose,
  onSaved,
}: Props) {
  const { toast } = useToast();

  const [paso, setPaso] = useState<Paso>("tipo");
  const [camino, setCamino] = useState<Camino | null>(null);
  const [subGasto, setSubGasto] = useState<SubGasto | null>(null);

  const [cliente, setCliente] = useState("");
  const [clienteCodigo, setClienteCodigo] = useState("");
  // Con marca de contexto arranca preseleccionada; "Cambiar" abre el selector.
  const [marcaId, setMarcaId] = useState(marcaInicial?.id ?? "");
  const [cambiandoMarca, setCambiandoMarca] = useState(false);
  const [foto, setFoto] = useState<File | null>(null);
  const fotoRef = useRef<HTMLInputElement>(null);

  const [impulsadoras, setImpulsadoras] = useState<ImpulsadoraConEstado[] | null>(null);
  const [impulsadoraSel, setImpulsadoraSel] = useState<ImpulsadoraConEstado | null>(null);
  const [productos, setProductos] = useState<MkInventarioProducto[]>([]);

  // El proyecto resuelto (o `null` = gasto sin cliente, `proyecto_id = null`).
  const [proyecto, setProyecto] = useState<ProyectoFila | null>(null);
  const [resolviendo, setResolviendo] = useState(false);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Hooks SIEMPRE antes de cualquier return condicional.
  const cerrar = useCallback(() => onClose(), [onClose]);
  const tocado = camino !== null || cliente.trim() !== "" || !!foto;
  const { panelRef, backdrop } = useFormModalDismiss(
    mounted,
    cerrar,
    !resolviendo && !tocado,
  );

  const marcasOrdenadas = useMemo(() => ordenarMarcas(marcas), [marcas]);
  const marcaElegida = useMemo(
    () => marcasOrdenadas.find((m) => m.id === marcaId) ?? null,
    [marcasOrdenadas, marcaId],
  );

  // Las impulsadoras se piden solo cuando hacen falta: el camino más usado
  // (factura) no tiene por qué pagar una lectura que no mira.
  useEffect(() => {
    if (camino !== "marca" || subGasto !== "impulsadora" || impulsadoras !== null)
      return;
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/marketing/impulsadoras", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as ImpulsadoraConEstado[];
        if (!cancelado) setImpulsadoras(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelado) setImpulsadoras([]);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [camino, subGasto, impulsadoras]);

  // Ídem el inventario: solo para el camino de muebles.
  useEffect(() => {
    if (camino !== "mueble") return;
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/marketing/inventario/productos", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as MkInventarioProducto[];
        if (!cancelado) setProductos(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelado) setProductos([]);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [camino]);

  /**
   * El proyecto del cliente, buscado o creado — SIEMPRE con su D-XXX.
   *
   * 🔴 SIN CÓDIGO DEL DIRECTORIO NO SE CREA NADA (12-ago-2026). El cliente
   * llega ELEGIDO de la lista (el `ClientePicker` de este modal no tiene
   * "Otro" y Continuar no se enciende sin código), así que un proyecto nuevo
   * nace SIEMPRE con `tienda_codigo`. El guard de acá es la segunda cerradura:
   * si algún camino futuro llegara sin código, se corta con el mismo mensaje
   * que dice la pantalla, no se crea un proyecto suelto.
   *
   * ⚠️ Los `mk_proyectos` HISTÓRICOS sin código NO se tocan ni se parean: el
   * pareo va SOLO por código (igual que antes cuando se elegía del
   * autocomplete). Los duplicados de cliente que hoy existen (D-87 y D-25
   * aparecen dos veces cada uno) tampoco se muestran aparte: los dos gastos de
   * D-87 caen en el mismo proyecto y se ven fusionados.
   *
   * Se busca entre TODOS los proyectos vivos, sin mirar estado: "Cerrar
   * proyecto" se retiró (11-ago-2026) y el proyecto es solo el contenedor del
   * cliente. Filtrar por estado acá crearía un proyecto DUPLICADO para un
   * cliente cuyo proyecto quedó en un estado legacy.
   */
  const resolverProyecto = useCallback(async (): Promise<ProyectoFila> => {
    const nombre = cliente.trim();
    const codigo = clienteCodigo.trim();
    if (!nombre || !codigo) {
      throw new Error(
        "Elige un cliente de la lista — si no está, hay que darlo de alta en Switch.",
      );
    }

    const res = await fetch("/api/marketing/proyectos", {
      cache: "no-store",
    });
    if (!res.ok) throw new Error("No se pudo buscar el proyecto del cliente.");
    const lista = (await res.json()) as ProyectoFila[];
    const yaExiste = (Array.isArray(lista) ? lista : []).find(
      (p) => (p.tienda_codigo ?? "") === codigo,
    );
    if (yaExiste) return yaExiste;

    const cRes = await fetch("/api/marketing/proyectos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tienda: nombre,
        tiendaCodigo: codigo,
        // El nombre del proyecto es solo una etiqueta: el del cliente.
        nombre,
      }),
    });
    if (!cRes.ok) {
      const err = await cRes.json().catch(() => null);
      throw new Error(err?.error ?? "No se pudo abrir el proyecto del cliente.");
    }
    return (await cRes.json()) as ProyectoFila;
  }, [cliente, clienteCodigo]);

  /**
   * Sube la foto y la cuelga del gasto recién guardado.
   *
   * Nunca tumba el guardado: la plata ya quedó registrada y perderla por una
   * foto sería el peor canje posible. Si no se pudo colgar, se DICE.
   */
  const adjuntarFoto = useCallback(
    async (destino: { facturaId?: string; proyectoId?: string }) => {
      if (!foto) return;
      if (!destino.facturaId && !destino.proyectoId) {
        toast(
          "El gasto quedó guardado. La foto no se pudo adjuntar todavía — agrégala desde la ficha del gasto.",
          "warning",
        );
        return;
      }
      try {
        const { uploadUrl, path } = await pedirUploadUrl({
          file: foto,
          facturaId: destino.facturaId,
          proyectoId: destino.proyectoId,
        });
        await subirArchivoAStorage(uploadUrl, foto);
        const res = await fetch("/api/marketing/adjuntos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            facturaId: destino.facturaId,
            proyectoId: destino.proyectoId,
            tipo: destino.facturaId ? "foto_factura" : "foto_proyecto",
            url: path,
            nombreOriginal: foto.name,
            sizeBytes: foto.size,
          }),
        });
        if (!res.ok) throw new Error();
      } catch {
        toast(
          "El gasto quedó guardado, pero la foto no subió. Vuelve a intentarlo desde la ficha del gasto.",
          "warning",
        );
      }
    },
    [foto, toast],
  );

  const continuar = async () => {
    if (resolviendo) return;
    // "Gasto de la marca" NUNCA lleva cliente: el gasto va con
    // `proyecto_id = null` directo, sin tocar la red. Es el único camino que
    // queda sin cliente — en Factura y Mueble ahora es obligatorio.
    if (camino === "marca") {
      setProyecto(null);
      setPaso("form");
      return;
    }
    setResolviendo(true);
    try {
      const p = await resolverProyecto();
      setProyecto(p);
      setPaso("form");
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudo continuar.", "error");
    } finally {
      setResolviendo(false);
    }
  };

  // ---- Guardar la FACTURA. Misma secuencia que la pantalla del proyecto: se
  // crea la factura, se le asignan las marcas y recién después la foto. ----
  const guardarFactura = async (
    data: {
      numeroFactura: string;
      fechaFactura: string;
      proveedor: string;
      concepto: string;
      subtotal: number;
      itbms: number;
      tieneImportacion: boolean;
      estadoPago: EstadoPagoFactura;
      marcasSeleccionadas: MarcaPorcentajeInput[];
      permitirDuplicado?: boolean;
    },
    pdfFile?: File,
  ) => {
    const { marcasSeleccionadas, ...payload } = data;
    const res = await fetch("/api/marketing/facturas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proyectoId: proyecto?.id ?? null, ...payload }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error ?? "No se pudo guardar el gasto");
    }
    const factura = (await res.json()) as MkFactura;

    const mRes = await fetch(`/api/marketing/facturas/${factura.id}/marcas`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marcas: marcasSeleccionadas }),
    });
    if (!mRes.ok) {
      const err = await mRes.json().catch(() => null);
      // Rollback best-effort: una factura sin marca no le llega a nadie.
      await fetch(`/api/marketing/facturas/${factura.id}/anular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: "Rollback: fallo al asignar la marca" }),
      }).catch(() => {});
      throw new Error(err?.error ?? "No se pudo asignar la marca");
    }

    // El comprobante (PDF o foto de la factura) que pidió el formulario.
    if (pdfFile) {
      try {
        const { uploadUrl, path } = await pedirUploadUrl({
          file: pdfFile,
          facturaId: factura.id,
        });
        await subirArchivoAStorage(uploadUrl, pdfFile);
        await fetch("/api/marketing/adjuntos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            facturaId: factura.id,
            tipo: "pdf_factura",
            url: path,
            nombreOriginal: pdfFile.name,
            sizeBytes: pdfFile.size,
          }),
        });
      } catch {
        toast(
          "Gasto guardado, pero el comprobante no subió. Súbelo de nuevo desde su ficha.",
          "warning",
        );
      }
    }

    await adjuntarFoto({ facturaId: factura.id });
    toast("Gasto registrado", "success");
    onSaved();
  };

  if (!mounted) return null;

  // ---- El formulario de MUEBLES es su propio modal: se le cede la pantalla ----
  if (paso === "form" && camino === "mueble") {
    return (
      <EntregaForm
        open
        proyectoId={proyecto?.id ?? null}
        proyectoNombre={proyecto?.tienda ?? "Sin cliente"}
        marcasProyecto={
          marcaElegida ? [{ marca: marcaElegida, porcentaje: 100 }] : []
        }
        productos={productos}
        onClose={onClose}
        onSaved={async () => {
          await adjuntarFoto({ proyectoId: proyecto?.id });
          onSaved();
        }}
      />
    );
  }

  // ---- El pago de IMPULSADORA también trae su propio modal ----
  // (Es la sub-opción "Impulsadora" de "Gasto de la marca": el flujo de
  // siempre, INTACTO — anti-solape, split y comprobante viven allá adentro.)
  if (
    paso === "form" &&
    camino === "marca" &&
    subGasto === "impulsadora" &&
    impulsadoraSel
  ) {
    return (
      <RegistrarPagoModal
        impulsadora={impulsadoraSel}
        mesInicial={impulsadoraSel.mesActual?.mes ?? new Date().toISOString().slice(0, 8) + "01"}
        fotoOpcional={foto}
        onClose={onClose}
        onSaved={onSaved}
      />
    );
  }

  // Cliente OBLIGATORIO en Factura y Mueble (Daniel: *"dejalo obligatorio"*),
  // y ELEGIDO de la lista: lo que enciende Continuar es el CÓDIGO D-XXX, no el
  // texto. Tipear sin elegir no llena nada — el picker solo escribe al elegir.
  // "Gasto de la marca" es el camino sin cliente: impulsadora exige a quién
  // se le paga; "otro gasto" exige la marca.
  const puedeContinuar =
    camino === "marca"
      ? subGasto === "impulsadora"
        ? !!impulsadoraSel
        : subGasto === "otro" && !!marcaId
      : !!camino && !!marcaId && clienteCodigo.trim() !== "" && !resolviendo;

  // ---- El bloque de MARCA, uno solo para todos los caminos que la piden ----
  // Con marca de contexto (`marcaInicial`) se enseña como renglón fijo:
  // "Marca: Karl Lagerfeld · Cambiar" — no se pregunta dos veces (pedido de
  // Daniel, 12-ago-2026). "Cambiar" reabre el selector de siempre.
  const marcaFijadaVisible = !!marcaInicial && !cambiandoMarca && !!marcaElegida;
  const bloqueMarca = (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Marca<span className="text-red-500 ml-0.5">*</span>
      </label>
      {marcaFijadaVisible ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 min-h-[44px] py-2">
          <span className="text-sm text-gray-900 font-medium truncate">
            {marcaElegida!.nombre}
          </span>
          <button
            type="button"
            onClick={() => setCambiandoMarca(true)}
            className="shrink-0 text-sm text-teal-700 hover:text-teal-900 transition min-h-[44px] -my-2 inline-flex items-center"
          >
            Cambiar
          </button>
        </div>
      ) : marcasOrdenadas.length === 0 ? (
        <p className="text-sm text-gray-500">No hay marcas configuradas.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {marcasOrdenadas.map((m) => (
              <button
                key={m.id}
                type="button"
                data-marca={m.codigo}
                onClick={() => setMarcaId(m.id)}
                className={`text-left rounded-md border-2 px-3 py-2 min-h-[44px] text-sm transition ${
                  marcaId === m.id
                    ? "border-black bg-gray-50 font-medium"
                    : "border-gray-200 hover:border-gray-400"
                }`}
              >
                <span className="block truncate">{m.nombre}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Una sola marca por gasto. Si hay que repartirlo, se registra un
            gasto por marca.
          </p>
        </>
      )}
    </div>
  );

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      {...backdrop}
    >
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        ref={panelRef}
        className="relative bg-white w-full sm:max-w-2xl rounded-lg max-h-[90vh] overflow-y-auto border border-gray-200"
      >
        <div className="border-b border-gray-100 pl-5 pr-2 py-2.5 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-900">Registrar gasto</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 w-11 h-11 flex items-center justify-center rounded-md text-gray-500 hover:text-black active:scale-[0.97] transition"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              &times;
            </span>
          </button>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* PASO 1 — ¿Qué es? Es lo único que decide qué formulario se abre.  */}
        {/* ---------------------------------------------------------------- */}
        {paso === "tipo" && (
          <div className="p-5 space-y-3">
            <p className="text-sm text-gray-600">¿Qué es el gasto?</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {CAMINOS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  /* Gancho ESTABLE para la medición: buscar el botón por su
                     texto exacto se rompe en cuanto el rótulo cambia una coma. */
                  data-camino={c.key}
                  onClick={() => {
                    setCamino(c.key);
                    setPaso("datos");
                  }}
                  className="text-left rounded-lg border border-gray-200 bg-white p-4 min-h-[56px] hover:border-gray-500 active:scale-[0.99] transition"
                >
                  <div className="font-semibold text-gray-900">{c.titulo}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* PASO 2 — de quién es. Cliente OBLIGATORIO (factura/mueble), UNA    */}
        {/* marca, foto opcional. "Gasto de la marca" pide su sub-opción.      */}
        {/* ---------------------------------------------------------------- */}
        {paso === "datos" && camino && (
          <>
            <div className="p-5 space-y-5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500">Qué es</span>
                <span className="text-sm font-medium text-gray-900">
                  {CAMINOS.find((c) => c.key === camino)?.titulo}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPaso("tipo");
                    setCamino(null);
                    setSubGasto(null);
                    setImpulsadoraSel(null);
                  }}
                  className="text-sm text-teal-700 hover:text-teal-900 transition min-h-[44px] -my-2 inline-flex items-center"
                >
                  Cambiar
                </button>
              </div>

              {camino === "marca" ? (
                <>
                  <div>
                    <div className="text-sm font-medium text-gray-700 mb-1">
                      ¿Qué tipo de gasto es?
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {SUB_GASTOS.map((s) => (
                        <button
                          key={s.key}
                          type="button"
                          data-subgasto={s.key}
                          onClick={() => {
                            setSubGasto(s.key);
                            if (s.key !== "impulsadora") setImpulsadoraSel(null);
                          }}
                          className={`text-left rounded-md border-2 px-3 py-2 min-h-[44px] text-sm transition ${
                            subGasto === s.key
                              ? "border-black bg-gray-50 font-medium"
                              : "border-gray-200 hover:border-gray-400"
                          }`}
                        >
                          <span className="block font-medium">{s.titulo}</span>
                          <span className="block text-xs text-gray-500">
                            {s.ayuda}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {subGasto === "impulsadora" && (
                    <div>
                      <div className="text-sm font-medium text-gray-700 mb-1">
                        ¿A quién le pagas?
                      </div>
                      {impulsadoras === null ? (
                        <div className="h-11 rounded-md bg-gray-100 animate-pulse" />
                      ) : impulsadoras.length === 0 ? (
                        <p className="text-sm text-gray-500">
                          Todavía no hay impulsadoras cargadas. Agrégalas desde
                          Impulsadoras.
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {impulsadoras.map((i) => (
                            <button
                              key={i.id}
                              type="button"
                              data-impulsadora={i.id}
                              onClick={() => setImpulsadoraSel(i)}
                              className={`text-left rounded-md border-2 px-3 py-2 min-h-[44px] text-sm transition ${
                                impulsadoraSel?.id === i.id
                                  ? "border-black bg-gray-50 font-medium"
                                  : "border-gray-200 hover:border-gray-400"
                              }`}
                            >
                              <span className="block truncate">{i.nombre}</span>
                              <span className="block text-xs text-gray-500">
                                {i.marcas.map((m) => m.marca.nombre).join(" · ")}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-gray-500 mt-2">
                        La marca sale del reparto que ya tiene configurado esa
                        impulsadora.
                      </p>
                    </div>
                  )}

                  {subGasto === "otro" && bloqueMarca}
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Cliente<span className="text-red-500 ml-0.5">*</span>
                    </label>
                    <ClientePicker
                      value={cliente}
                      codigo={clienteCodigo}
                      onChange={(nombre, codigo) => {
                        setCliente(nombre);
                        setClienteCodigo(codigo);
                      }}
                      permitirOtro={false}
                      placeholder="Busca la tienda…"
                      /* text-base en móvil: con 14 px Safari hace zoom. */
                      inputClassName="w-full rounded-md border border-gray-300 px-3 py-2 min-h-[44px] pr-16 text-base sm:text-sm focus:border-black focus:outline-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Elige la tienda de la lista — si no está, hay que darla
                      de alta en Switch. Si el gasto es para la marca en
                      general (vallas, eventos), usa &ldquo;Gasto de la
                      marca&rdquo;.
                    </p>
                  </div>

                  {bloqueMarca}
                </>
              )}

              {/* FOTO — viva en los TRES caminos, siempre, y opcional. */}
              <div>
                <div className="text-sm font-medium text-gray-700 mb-1">
                  Foto <span className="font-normal text-gray-400">(opcional)</span>
                </div>
                <input
                  ref={fotoRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
                />
                {foto ? (
                  <div className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 min-h-[44px] py-2 text-sm">
                    <span className="text-gray-800 truncate">{foto.name}</span>
                    <button
                      type="button"
                      onClick={() => setFoto(null)}
                      className="shrink-0 text-sm text-gray-600 hover:text-black min-h-[44px] -my-2 inline-flex items-center"
                    >
                      Quitar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fotoRef.current?.click()}
                    className="w-full rounded-md border border-dashed border-gray-300 px-3 min-h-[44px] py-2 text-sm text-gray-600 hover:border-gray-500 hover:text-black transition"
                  >
                    Subir foto
                  </button>
                )}
              </div>
            </div>

            <div className="border-t border-gray-100 px-5 py-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-3 min-h-[44px] inline-flex items-center justify-center rounded-md text-sm text-gray-600 hover:text-black transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={continuar}
                disabled={!puedeContinuar}
                className="rounded-md bg-black text-white px-4 min-h-[44px] inline-flex items-center justify-center text-sm active:scale-[0.97] transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {resolviendo ? "Abriendo…" : "Continuar"}
              </button>
            </div>
          </>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* PASO 3 — el formulario de la FACTURA, el que ya existía. Lo usan   */}
        {/* dos caminos: Factura (con cliente) y "Gasto de la marca › Otro     */}
        {/* gasto" (proyecto_id = null — cae en General/ del ZIP, como los     */}
        {/* pagos de impulsadora de siempre).                                  */}
        {/* ---------------------------------------------------------------- */}
        {paso === "form" &&
          (camino === "factura" ||
            (camino === "marca" && subGasto === "otro")) && (
          <div className="p-5 space-y-4">
            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {camino === "marca" ? (
                <>Gasto de la marca — no se agrupa en ninguna tienda</>
              ) : (
                <>
                  Cliente <span className="font-medium">{cliente.trim()}</span>
                </>
              )}
              {marcaElegida && (
                <>
                  {" · "}Marca{" "}
                  <span className="font-medium">{marcaElegida.nombre}</span>
                </>
              )}
              {foto && <> · Foto lista</>}
            </div>
            <FacturaForm
              proyecto={{ id: proyecto?.id ?? "", marcas: [] }}
              marcasCatalogo={marcasOrdenadas}
              initialMarcas={
                marcaId ? [{ marcaId, porcentaje: 100 }] : undefined
              }
              marcaFija={marcaElegida}
              onSubmit={guardarFactura}
              onCancel={onClose}
            />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
