"use client";

// ============================================================================
// LA PUERTA «＋ Gasto» — el rediseño (22-sep-2026, pieza A).
//
// UNA puerta, tres formularios. Daniel: *«para meter un gasto poner un botón
// de agregar gasto y automáticamente se guardó en el cliente que está y ya»*,
// *«reportar gasto, estilo reclamos que esta claro todo»*.
//
// Los pasos:
//   1. QUÉ ES — factura de un proveedor · mueble de la bodega · pago de
//      impulsadora (`OPCIONES_DE_TIPO`, derivadas de la lista cerrada de
//      `gasto.ts`). Es lo único que decide qué formulario se abre.
//   2. DE QUIÉN ES — la marca (UNA), la tienda del directorio o «General», la
//      casilla «Se reporta a la marca» (prendida) y la nota. Si la puerta se
//      abrió desde una marca o desde una tienda, eso viene puesto y no se
//      pregunta. El botón apagado DICE qué falta («Falta: la marca y la
//      tienda»), como en Préstamos.
//   3. EL FORMULARIO de ese tipo — los que ya existían (`FacturaForm`,
//      `EntregaForm`, `RegistrarPagoModal`), que reciben lo del paso 2 y lo
//      mandan al servidor en el MISMO guardado.
//
// 🔴 EL PROYECTO NO EXISTE ACÁ. La tienda es un dato del gasto
//    (`tienda_codigo`); no se busca ni se crea ningún `mk_proyectos`.
// 🔴 LA MARCA VIAJA CON LA FACTURA (`marcaId` en el POST) y el servidor la
//    escribe en el mismo acto: sin marca, 400 antes de escribir nada.
// 🔴 EL FRENO DE DUPLICADOS ES DEL SERVIDOR: el 400 llega con su mensaje y la
//    pantalla lo dice tal cual; nada se guardó.
// 🔴 EL MUEBLE YA TIENE FOTO (22-sep-2026, los remates). Cuelga de la TIENDA
//    del gasto (`mk_adjuntos.tienda_codigo`, pieza B) y, en «General», del
//    cajón `TIENDA_GENERAL`. Se sube DESPUÉS de que la entrega quedó guardada:
//    si el gasto no se guarda, no queda una foto suelta. Nunca tumba el
//    guardado — la plata ya está escrita cuando esto corre.
//
// Todo cuelga de `MARKETING_PUERTA_GASTO` (`RegistrarGastoModal.tsx` elige).
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/components/ToastSystem";
import { useFormModalDismiss } from "@/lib/hooks/useModalDismiss";
import { hoyPanama } from "@/lib/fecha-panama";
import { FacturaForm } from "@/components/marketing";
import EntregaForm from "@/components/marketing/EntregaForm";
import RegistrarPagoModal from "./RegistrarPagoModal";
import BloqueDatosDelGasto, { type TiendaElegida } from "./BloqueDatosDelGasto";
import PuertasDeLaFacturaCelular from "./celular/PuertasDeLaFacturaCelular";
import { BotonAncho } from "./celular/PiezasCelular";
import { useEsCelular } from "./celular/useEsCelular";
import {
  ACCEPT_DE_LA_CAMARA,
  CALIDAD_DE_LA_FOTO,
  CAPTURE_DE_LA_CAMARA,
  LADO_MAYOR_DE_LA_FOTO,
  initialDeLaLectura,
  type LecturaDeLaFactura,
} from "@/lib/marketing/celular";
import { compressImage, validateFotoFile } from "@/app/reclamos/components/fotoUpload";
import {
  adjuntarPdfDeFactura,
  pedirUploadUrl,
  subirAdjunto,
  subirArchivoAStorage,
} from "./uploadHelpers";
import {
  MARKETING_PDF_EN_LA_PUERTA,
  aceptaDeLaPuerta,
  clasificarArchivoDeLaPuerta,
  rotuloBotonDeLaPuerta,
  rotuloDeLaPuerta,
} from "@/lib/marketing/pdf-en-la-puerta";
import { MARCAS_BLOQUE } from "@/lib/marketing/bloques";
import { ROTULO_DE_TIPO, TIENDA_GENERAL, type TipoGasto } from "@/lib/marketing/gasto";
import {
  OPCIONES_DE_TIPO,
  datosPorDefecto,
  paraGuardar,
  queFaltaEnLaPuerta,
  resumenDelGasto,
  textoFaltaEnLaPuerta,
  type DatosDelGasto,
} from "@/lib/marketing/puerta-gasto";
import type {
  EstadoPagoFactura,
  ImpulsadoraConEstado,
  MarcaPorcentajeInput,
  MkFactura,
  MkInventarioProducto,
  MkMarca,
} from "@/lib/marketing/types";

type Paso = "tipo" | "datos" | "form";

export interface PuertaGastoProps {
  marcas: MkMarca[];
  /** La marca de la página desde la que se abrió: viene puesta, con «Cambiar». */
  marcaInicial?: MkMarca | null;
  /** La tienda desde la que se abrió: viene puesta y no se pregunta. */
  tiendaInicial?: TiendaElegida | null;
  /**
   * Lo mismo, por CÓDIGO (la vista de tienda de la pieza B pasa `D-25`):
   * viene puesta y no se pregunta. `tiendaNombre` es solo para dibujarla;
   * sin él se enseña el código. `tiendaInicial` manda si vienen los dos.
   */
  tiendaCodigo?: string | null;
  tiendaNombre?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

const ORDEN_MARCA = new Map<string, number>(MARCAS_BLOQUE.map((m, i) => [m.key, i] as const));

function ordenarMarcas(marcas: MkMarca[]): MkMarca[] {
  return [...marcas].sort((a, b) => {
    const ia = ORDEN_MARCA.get((a.codigo ?? "").trim().toUpperCase()) ?? 90;
    const ib = ORDEN_MARCA.get((b.codigo ?? "").trim().toUpperCase()) ?? 90;
    if (ia !== ib) return ia - ib;
    return a.nombre.localeCompare(b.nombre, "es");
  });
}

async function leerJson<T>(url: string, respaldo: T): Promise<T> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return respaldo;
    return (await res.json()) as T;
  } catch {
    return respaldo;
  }
}

export default function PuertaGasto({
  marcas,
  marcaInicial = null,
  tiendaInicial: tiendaInicialProp = null,
  tiendaCodigo = null,
  tiendaNombre = null,
  onClose,
  onSaved,
}: PuertaGastoProps) {
  const { toast } = useToast();
  const codigoPuesto = String(tiendaCodigo ?? "").trim().toUpperCase();
  const tiendaInicial: TiendaElegida | null =
    tiendaInicialProp ??
    (codigoPuesto.length > 0
      ? { codigo: codigoPuesto, nombre: String(tiendaNombre ?? "").trim() || codigoPuesto }
      : null);

  const [paso, setPaso] = useState<Paso>("tipo");
  const [tipo, setTipo] = useState<TipoGasto | null>(null);
  const [datos, setDatos] = useState<DatosDelGasto>(() => datosPorDefecto("factura"));

  const [impulsadoras, setImpulsadoras] = useState<ImpulsadoraConEstado[] | null>(null);
  const [impulsadoraSel, setImpulsadoraSel] = useState<ImpulsadoraConEstado | null>(null);
  const [productos, setProductos] = useState<MkInventarioProducto[]>([]);
  const [historicoProveedores, setHistoricoProveedores] = useState<string[]>([]);

  const [foto, setFoto] = useState<File | null>(null);
  const [pdfPuerta, setPdfPuerta] = useState<File | null>(null);
  const [pdfPathPreSubido, setPdfPathPreSubido] = useState<string | null>(null);
  const fotoRef = useRef<HTMLInputElement>(null);
  // ── 🔴 4c · EL ESCANEO DESDE EL TELÉFONO (24-sep-2026) ────────────────────
  // Daniel: *«que se pueda meter un gasto por el teléfono así se escanea»*.
  // El lector YA EXISTÍA (`/api/marketing/ia/leer-factura`, seis campos): lo
  // único que faltaba era abrirle la cámara y enseñarle a leer fotos.
  // 🔴 Lo que se guarda NO CAMBIA: la foto se cuelga por el MISMO camino de
  // siempre (`adjuntarFoto` → `foto_factura`) y el POST de la factura es el de
  // siempre. Lo leído entra por el `initial` del formulario.
  const camaraRef = useRef<HTMLInputElement>(null);
  const [lectura, setLectura] = useState<LecturaDeLaFactura | null>(null);
  const [leyendo, setLeyendo] = useState(false);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const cerrar = useCallback(() => onClose(), [onClose]);
  const tocado = tipo !== null || !!foto || !!pdfPuerta;
  const { panelRef, backdrop } = useFormModalDismiss(mounted, cerrar, !tocado);

  // 🔑 El celular cambia CÓMO se pregunta, nunca QUÉ se guarda.
  const enCelular = useEsCelular();

  const marcasOrdenadas = useMemo(() => ordenarMarcas(marcas), [marcas]);
  const marcaDeImpulsadora = impulsadoraSel?.marcas[0]?.marca ?? null;
  const marcaEfectiva: MkMarca | null =
    tipo === "impulsadora"
      ? marcaDeImpulsadora
      : (marcasOrdenadas.find((m) => m.id === datos.marcaId) ?? null);

  // Cada lectura se pide solo cuando hace falta: el camino más usado no paga
  // lo que no mira.
  useEffect(() => {
    if (tipo !== "impulsadora" || impulsadoras !== null) return;
    let cancelado = false;
    leerJson<ImpulsadoraConEstado[]>("/api/marketing/impulsadoras", []).then((d) => {
      if (!cancelado) setImpulsadoras(Array.isArray(d) ? d : []);
    });
    return () => {
      cancelado = true;
    };
  }, [tipo, impulsadoras]);

  useEffect(() => {
    if (tipo !== "mueble") return;
    let cancelado = false;
    leerJson<MkInventarioProducto[]>("/api/marketing/inventario/productos", []).then((d) => {
      if (!cancelado) setProductos(Array.isArray(d) ? d : []);
    });
    return () => {
      cancelado = true;
    };
  }, [tipo]);

  useEffect(() => {
    if (tipo !== "factura") return;
    let cancelado = false;
    leerJson<{ proveedores?: string[] }>("/api/marketing/facturas/proveedores", {}).then((d) => {
      if (!cancelado) setHistoricoProveedores(Array.isArray(d.proveedores) ? d.proveedores : []);
    });
    return () => {
      cancelado = true;
    };
  }, [tipo]);

  const elegirTipo = (t: TipoGasto) => {
    setTipo(t);
    setImpulsadoraSel(null);
    setDatos(
      datosPorDefecto(t, {
        marcaId: marcaInicial?.id ?? "",
        ...(tiendaInicial
          ? { esDeTienda: true, tiendaCodigo: tiendaInicial.codigo, tiendaNombre: tiendaInicial.nombre }
          : {}),
      }),
    );
    setPaso("datos");
  };

  const faltantes = queFaltaEnLaPuerta({ tipo, datos, impulsadoraId: impulsadoraSel?.id ?? null });
  const textoFalta = textoFaltaEnLaPuerta(faltantes);
  const puedeContinuar = faltantes.length === 0;
  const comun = paraGuardar(datos);
  const resumen = resumenDelGasto(datos, marcaEfectiva?.nombre ?? null);

  /** Sube la foto y la cuelga de la factura recién guardada. Nunca tumba el guardado. */
  const adjuntarFoto = useCallback(
    async (facturaId: string) => {
      if (!foto) return;
      try {
        const { uploadUrl, path } = await pedirUploadUrl({ file: foto, facturaId });
        await subirArchivoAStorage(uploadUrl, foto);
        const res = await fetch("/api/marketing/adjuntos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            facturaId,
            tipo: "foto_factura",
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

  /**
   * 🔴 LA FOTO DE UN MUEBLE CUELGA DE LA TIENDA. No hay factura de dónde
   * colgarla, y el proyecto se fue. Con «General» va al cajón
   * `TIENDA_GENERAL`. Nunca tumba el guardado: la entrega ya quedó escrita.
   */
  const adjuntarFotoALaTienda = useCallback(async () => {
    if (!foto) return;
    const destino = comun.tiendaCodigo ?? TIENDA_GENERAL;
    try {
      await subirAdjunto({ file: foto, tiendaCodigo: destino, tipo: "foto_proyecto" });
    } catch {
      toast(
        "El gasto quedó guardado, pero la foto no subió. Vuelve a intentarlo desde la tienda.",
        "warning",
      );
    }
  }, [foto, comun.tiendaCodigo, toast]);

  /** Sube el PDF sin dueño para que la IA lo lea; su `path` se reusa al guardar. */
  const subirPdfParaIA = useCallback(
    async (file: File): Promise<string | null> => {
      try {
        const { uploadUrl, path } = await pedirUploadUrl({ file, paraLeerConIA: true });
        await subirArchivoAStorage(uploadUrl, file);
        setPdfPathPreSubido(path);
        return path;
      } catch {
        setPdfPathPreSubido(null);
        toast(
          "No se pudo leer la factura con IA. Llena los campos a mano — el PDF se sube al guardar.",
          "warning",
        );
        return null;
      }
    },
    [toast],
  );

  /**
   * 🔴 LA FOTO SE ACHICA EN EL NAVEGADOR ANTES DE VIAJAR: 1600 px de lado
   * mayor, JPEG 0,8 — los MISMOS números de Reclamos y Mobiliario
   * (`compressImage`). El cuerpo de una función de Vercel se topa en ~4,5 MB y
   * una foto de iPhone pesa 3-12 MB.
   *
   * 🔴 Después se sube «sin dueño» para que la IA la lea (el MISMO camino del
   * PDF) y lo leído se aplica al formulario por su `initial`. La foto queda en
   * `foto`, así que al guardar se cuelga como `foto_factura` por el camino de
   * siempre: NADA de lo que se guarda cambia.
   */
  const escanearFactura = useCallback(
    async (original: File) => {
      const malo = validateFotoFile(original);
      if (malo) {
        toast(malo, "error");
        return;
      }
      setLeyendo(true);
      try {
        const chica = await compressImage(original, {
          maxDimension: LADO_MAYOR_DE_LA_FOTO,
          quality: CALIDAD_DE_LA_FOTO,
        });
        setFoto(chica);
        setPdfPuerta(null);
        setPdfPathPreSubido(null);
        const { uploadUrl, path } = await pedirUploadUrl({ file: chica, paraLeerConIA: true });
        await subirArchivoAStorage(uploadUrl, chica);
        const res = await fetch("/api/marketing/ia/leer-factura", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path }),
        });
        if (!res.ok) throw new Error();
        setLectura((await res.json()) as LecturaDeLaFactura);
        toast("Datos leídos de la foto. Revísalos.", "success");
      } catch {
        // Falla ABIERTA: la foto queda adjunta igual y los campos se teclean.
        toast("No se pudo leer la foto. Llena los campos a mano — la foto se sube al guardar.", "warning");
      } finally {
        setLeyendo(false);
      }
    },
    [toast],
  );

  // ---- Guardar la FACTURA: la marca y lo del paso 2 viajan CON ella. ----
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
    const { marcasSeleccionadas: _sinUso, ...payload } = data;
    void _sinUso;
    const res = await fetch("/api/marketing/facturas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proyectoId: null,
        ...payload,
        marcaId: marcaEfectiva?.id ?? "",
        tiendaCodigo: comun.tiendaCodigo,
        seReporta: comun.seReporta,
        nota: comun.nota,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      // El duplicado y la marca que falta llegan con su mensaje; se dicen tal cual.
      throw new Error(err?.error ?? "No se pudo guardar el gasto");
    }
    const factura = (await res.json()) as MkFactura;

    if (pdfFile) {
      try {
        await adjuntarPdfDeFactura({ facturaId: factura.id, file: pdfFile, pathPreSubido: pdfPathPreSubido });
      } catch {
        toast("Gasto guardado, pero el comprobante no subió. Súbelo de nuevo desde su ficha.", "warning");
      }
    }
    await adjuntarFoto(factura.id);
    toast("Gasto registrado", "success");
    onSaved();
  };

  if (!mounted) return null;

  // ---- MUEBLE: el formulario de entregas es su propio modal ----
  if (paso === "form" && tipo === "mueble" && marcaEfectiva) {
    return (
      <EntregaForm
        open
        proyectoId={null}
        proyectoNombre={resumen}
        marcasProyecto={[{ marca: marcaEfectiva, porcentaje: 100 }]}
        marcaFija
        gasto={comun}
        productos={productos}
        onClose={onClose}
        onSaved={() => {
          void adjuntarFotoALaTienda().then(onSaved);
        }}
      />
    );
  }

  // ---- IMPULSADORA: su propio modal (anti-solape, comprobante) ----
  if (paso === "form" && tipo === "impulsadora" && impulsadoraSel) {
    return (
      <RegistrarPagoModal
        impulsadora={impulsadoraSel}
        mesInicial={impulsadoraSel.mesActual?.mes ?? `${hoyPanama().slice(0, 8)}01`}
        fotoOpcional={foto}
        gasto={comun}
        onClose={onClose}
        onSaved={onSaved}
      />
    );
  }

  const elegirArchivo = (archivo: File | null) => {
    if (!archivo) return;
    const cual = clasificarArchivoDeLaPuerta(archivo);
    if (!cual.ok) {
      toast(cual.mensaje, "error");
      return;
    }
    // En un mueble solo entra una FOTO: no hay factura de dónde colgar un PDF.
    if (tipo === "mueble" && cual.clase === "pdf") {
      toast("En un mueble sube una foto, no un PDF.", "error");
      return;
    }
    // UNO U OTRO, nunca los dos: el campo es uno solo.
    if (cual.clase === "pdf") {
      setPdfPuerta(archivo);
      setFoto(null);
    } else {
      setFoto(archivo);
      setPdfPuerta(null);
    }
    setPdfPathPreSubido(null);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4" {...backdrop}>
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

        {/* ─── PASO 1 — ¿Qué es? ─────────────────────────────────────────── */}
        {paso === "tipo" && (
          <div className="p-5 space-y-3">
            <p className="text-sm text-gray-600">¿Qué es el gasto?</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {OPCIONES_DE_TIPO.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  data-tipo={o.key}
                  onClick={() => elegirTipo(o.key)}
                  className="text-left rounded-lg border border-gray-200 bg-white p-4 min-h-[56px] hover:border-gray-500 active:scale-[0.99] transition"
                >
                  <div className="font-semibold text-gray-900">{o.titulo}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ─── PASO 2 — De quién es ──────────────────────────────────────── */}
        {paso === "datos" && tipo && (
          <>
            <div className="p-5 space-y-5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500">Qué es</span>
                <span className="text-sm font-medium text-gray-900">{ROTULO_DE_TIPO[tipo]}</span>
                <button
                  type="button"
                  onClick={() => {
                    setPaso("tipo");
                    setTipo(null);
                    setImpulsadoraSel(null);
                  }}
                  className="text-sm text-teal-700 hover:text-teal-900 transition min-h-[44px] -my-2 inline-flex items-center"
                >
                  Cambiar
                </button>
              </div>

              {tipo === "impulsadora" && (
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-1">
                    ¿A quién le pagas?<span className="text-red-500 ml-0.5">*</span>
                  </div>
                  {impulsadoras === null ? (
                    <div className="h-11 rounded-md bg-gray-100 animate-pulse" />
                  ) : impulsadoras.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      Todavía no hay impulsadoras cargadas. Agrégalas desde Impulsadoras.
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
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <BloqueDatosDelGasto
                datos={datos}
                onChange={setDatos}
                marcas={marcasOrdenadas}
                marcaInicial={marcaInicial}
                marcaDeImpulsadora={tipo === "impulsadora" ? marcaDeImpulsadora : undefined}
                tiendaInicial={tiendaInicial}
              />

              {/* 🔴 4c — EN EL CELULAR, TRES PUERTAS PARA LA FACTURA
                  (24-sep-2026): escanear con la cámara, elegir el PDF o
                  escribirlo a mano. En la computadora, el campo de siempre. */}
              {enCelular && tipo === "factura" ? (
                <div>
                  <div className="text-sm font-medium text-gray-700">La factura</div>
                  <input
                    ref={camaraRef}
                    type="file"
                    accept={ACCEPT_DE_LA_CAMARA}
                    capture={CAPTURE_DE_LA_CAMARA}
                    data-testid="escanear-la-factura"
                    className="hidden"
                    onChange={(e) => {
                      const archivo = e.target.files?.[0] ?? null;
                      e.target.value = "";
                      if (archivo) void escanearFactura(archivo);
                    }}
                  />
                  <PuertasDeLaFacturaCelular
                    leyendo={leyendo}
                    archivo={(foto ?? pdfPuerta)?.name ?? null}
                    onQuitar={() => {
                      setFoto(null);
                      setPdfPuerta(null);
                      setPdfPathPreSubido(null);
                      setLectura(null);
                    }}
                    onElegir={(puerta) => {
                      if (puerta === "escanear") camaraRef.current?.click();
                      else if (puerta === "pdf") fotoRef.current?.click();
                      else if (puedeContinuar) setPaso("form");
                    }}
                  />
                </div>
              ) : null}

              {/* FOTO O FACTURA — opcional. En Mueble solo foto: la foto va a
                  la tienda; un PDF de factura ahí no tendría factura. */}
              <div className={enCelular && tipo === "factura" ? "hidden" : undefined}>
                  <div className="text-sm font-medium text-gray-700 mb-1">
                    {tipo === "mueble" ? "Foto del mueble" : rotuloDeLaPuerta()}{" "}
                    <span className="font-normal text-gray-400">(opcional)</span>
                  </div>
                  <input
                    ref={fotoRef}
                    type="file"
                    accept={tipo === "mueble" ? "image/*" : aceptaDeLaPuerta()}
                    className="hidden"
                    onChange={(e) => {
                      const archivo = e.target.files?.[0] ?? null;
                      e.target.value = "";
                      elegirArchivo(archivo);
                    }}
                  />
                  {foto || pdfPuerta ? (
                    <div className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 min-h-[44px] py-2 text-sm">
                      <span className="text-gray-800 truncate">{(foto ?? pdfPuerta)!.name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setFoto(null);
                          setPdfPuerta(null);
                          setPdfPathPreSubido(null);
                        }}
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
                      data-testid="subir-archivo-de-la-puerta"
                    >
                      {tipo === "mueble" ? "Subir foto" : rotuloBotonDeLaPuerta()}
                    </button>
                  )}
              </div>
            </div>

            {/* 🔴 11a · 12a — EN EL CELULAR, UN BOTÓN ANCHO QUE DICE QUÉ FALTA
                EN SU PROPIO TEXTO, al alcance del pulgar. 🩸 En la pantalla de
                hoy el aviso queda abajo a la izquierda, lejos del campo que lo
                causa. La regla de qué falta NO cambió: es la misma
                `queFaltaEnLaPuerta`. */}
            {enCelular ? (
              <div className="border-t border-gray-100 px-4 py-4 space-y-3">
                {textoFalta && (
                  <span className="sr-only" data-testid="falta-para-continuar">
                    {textoFalta}
                  </span>
                )}
                <BotonAncho onClick={() => puedeContinuar && setPaso("form")} disabled={!puedeContinuar}>
                  {textoFalta || "Continuar"}
                </BotonAncho>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full min-h-[44px] text-center text-[17px] text-gray-600"
                >
                  Cancelar
                </button>
              </div>
            ) : (
            <div className="border-t border-gray-100 px-5 py-4 flex items-center justify-end gap-3">
              {textoFalta && (
                <span className="text-xs text-amber-700 mr-auto" data-testid="falta-para-continuar">
                  {textoFalta}
                </span>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-3 min-h-[44px] inline-flex items-center justify-center rounded-md text-sm text-gray-600 hover:text-black transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => puedeContinuar && setPaso("form")}
                disabled={!puedeContinuar}
                className="rounded-md bg-black text-white px-4 min-h-[44px] inline-flex items-center justify-center text-sm active:scale-[0.97] transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continuar
              </button>
            </div>
            )}
          </>
        )}

        {/* ─── PASO 3 — la FACTURA, el formulario que ya existía ─────────── */}
        {paso === "form" && tipo === "factura" && (
          <div className="p-5 space-y-4">
            <div
              className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700"
              data-testid="resumen-del-gasto"
            >
              {resumen}
              {foto && <> · Foto lista</>}
              {pdfPuerta && <> · Factura lista</>}
            </div>
            <FacturaForm
              proyecto={{ id: "", marcas: [] }}
              marcasCatalogo={marcasOrdenadas}
              {...(initialDeLaLectura(lectura) ? { initial: initialDeLaLectura(lectura) } : {})}
              initialMarcas={marcaEfectiva ? [{ marcaId: marcaEfectiva.id, porcentaje: 100 }] : undefined}
              marcaFija={marcaEfectiva}
              onSubmit={guardarFactura}
              onCancel={onClose}
              historicoProveedores={historicoProveedores}
              {...(MARKETING_PDF_EN_LA_PUERTA
                ? {
                    onUploadPdfForIA: subirPdfParaIA,
                    pdfObligatorio: true,
                    ...(pdfPuerta ? { pdfInicial: pdfPuerta } : {}),
                  }
                : {})}
            />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
