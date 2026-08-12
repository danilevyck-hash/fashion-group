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
// ORDEN DE LA PUERTA — el del mockup aprobado:
//   Qué es      → Factura · Mueble · Impulsadora
//   Cliente     → OPCIONAL. Daniel: *"si, como pagarle a una impulsadora todo
//                 el mes"*, y también catálogos, eventos, material general.
//                 Sin cliente el gasto va con `proyecto_id = null`.
//   Marca       → UNA por gasto. Nada de repartos 50/50.
//   Foto        → OPCIONAL, y puede llegar después.
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
import ClienteTypeahead from "@/app/guias/components/ClienteTypeahead";
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

type Camino = "factura" | "mueble" | "impulsadora";
type Paso = "tipo" | "datos" | "form";

interface Props {
  marcas: MkMarca[];
  onClose: () => void;
  /** Se llama cuando el gasto quedó guardado, para refrescar el inicio. */
  onSaved: () => void;
}

/** Proyecto tal como lo devuelve `GET /api/marketing/proyectos`. */
type ProyectoFila = MkProyecto;

const CAMINOS: ReadonlyArray<{
  key: Camino;
  titulo: string;
  ayuda: string;
}> = [
  {
    key: "factura",
    titulo: "Factura",
    ayuda: "Una factura de un proveedor: letreros, catálogos, material, eventos.",
  },
  {
    key: "mueble",
    titulo: "Mueble",
    ayuda: "Una entrega de mobiliario. Descuenta el inventario en piezas.",
  },
  {
    key: "impulsadora",
    titulo: "Impulsadora",
    ayuda: "El pago de una impulsadora por el período que trabajó.",
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

/** Para parear el cliente escrito a mano con el proyecto que ya existe. */
function norm(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export default function RegistrarGastoModal({ marcas, onClose, onSaved }: Props) {
  const { toast } = useToast();

  const [paso, setPaso] = useState<Paso>("tipo");
  const [camino, setCamino] = useState<Camino | null>(null);

  const [cliente, setCliente] = useState("");
  const [clienteCodigo, setClienteCodigo] = useState("");
  const [marcaId, setMarcaId] = useState("");
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
    if (camino !== "impulsadora" || impulsadoras !== null) return;
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
  }, [camino, impulsadoras]);

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
   * El proyecto del cliente, buscado o creado.
   *
   * 🔴 SIN CLIENTE NO SE CREA NADA: devuelve `null` y el gasto se guarda con
   * `proyecto_id = null`. Inventarle un proyecto "General" a un pago de
   * impulsadora sería volver a meter el paso que Daniel mandó sacar.
   *
   * ⚠️ Los duplicados de cliente que hoy existen (D-87 y D-25 aparecen dos veces
   * cada uno) NO se muestran aparte: el pareo va PRIMERO por código del
   * directorio, así que los dos gastos de D-87 caen en el mismo proyecto y se
   * ven fusionados. El texto libre solo se usa cuando no hay código.
   */
  const resolverProyecto = useCallback(async (): Promise<ProyectoFila | null> => {
    const nombre = cliente.trim();
    if (!nombre) return null;

    const res = await fetch("/api/marketing/proyectos?estado=abierto", {
      cache: "no-store",
    });
    if (!res.ok) throw new Error("No se pudo buscar el proyecto del cliente.");
    const lista = (await res.json()) as ProyectoFila[];
    const codigo = clienteCodigo.trim();
    const yaExiste = (Array.isArray(lista) ? lista : []).find((p) =>
      codigo
        ? (p.tienda_codigo ?? "") === codigo
        : norm(p.tienda) === norm(nombre),
    );
    if (yaExiste) return yaExiste;

    const cRes = await fetch("/api/marketing/proyectos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tienda: nombre,
        tiendaCodigo: codigo || null,
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
  if (paso === "form" && camino === "impulsadora" && impulsadoraSel) {
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

  const puedeContinuar =
    camino === "impulsadora"
      ? !!impulsadoraSel
      : !!camino && !!marcaId && !resolviendo;

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
                  /* Gancho ESTABLE para la medición: el nombre accesible del
                     botón incluye su ayuda, así que buscarlo por texto exacto
                     se rompe en cuanto la ayuda cambia una coma. */
                  data-camino={c.key}
                  onClick={() => {
                    setCamino(c.key);
                    setPaso("datos");
                  }}
                  className="text-left rounded-lg border border-gray-200 bg-white p-4 min-h-[96px] hover:border-gray-500 active:scale-[0.99] transition"
                >
                  <div className="font-semibold text-gray-900">{c.titulo}</div>
                  <div className="text-xs text-gray-500 mt-1">{c.ayuda}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* PASO 2 — de quién es. Cliente OPCIONAL, UNA marca, foto opcional.  */}
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
                    setImpulsadoraSel(null);
                  }}
                  className="text-sm text-teal-700 hover:text-teal-900 transition min-h-[44px] -my-2 inline-flex items-center"
                >
                  Cambiar
                </button>
              </div>

              {camino === "impulsadora" ? (
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
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Cliente{" "}
                      <span className="font-normal text-gray-400">(opcional)</span>
                    </label>
                    <ClienteTypeahead
                      value={cliente}
                      codigo={clienteCodigo}
                      onSelect={(nombre, codigo) => {
                        setCliente(nombre);
                        setClienteCodigo(codigo);
                      }}
                      onFreeText={(texto) => {
                        setCliente(texto);
                        setClienteCodigo("");
                      }}
                      placeholder="Busca la tienda… o déjalo en blanco"
                      /* text-base en móvil: con 14 px Safari hace zoom. */
                      inputClassName="w-full rounded-md border border-gray-300 px-3 py-2 min-h-[44px] pr-16 text-base sm:text-sm focus:border-black focus:outline-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Déjalo en blanco si el gasto no es de una tienda —
                      catálogos, un evento, material general.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Marca<span className="text-red-500 ml-0.5">*</span>
                    </label>
                    {marcasOrdenadas.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        No hay marcas configuradas.
                      </p>
                    ) : (
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
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      Una sola marca por gasto. Si hay que repartirlo, se
                      registra un gasto por marca.
                    </p>
                  </div>
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
                <p className="text-xs text-gray-500 mt-1">
                  La del letrero puesto, el mueble armado, el evento. Puede
                  llegar después — se agrega aunque el período ya esté cerrado.
                </p>
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
        {/* PASO 3 — el formulario de la FACTURA, el que ya existía.          */}
        {/* ---------------------------------------------------------------- */}
        {paso === "form" && camino === "factura" && (
          <div className="p-5 space-y-4">
            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {cliente.trim() ? (
                <>
                  Cliente <span className="font-medium">{cliente.trim()}</span>
                </>
              ) : (
                <>Sin cliente — el gasto no se agrupa en ninguna tienda</>
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
