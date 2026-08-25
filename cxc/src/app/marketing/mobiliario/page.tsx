"use client";

// Página de Mobiliario (inventario de muebles). 4 cards de métricas, tabla de
// productos editable, tabla de reparto por tienda con expand para editar la
// entrega. Ruta de página: /marketing/mobiliario. La API interna sigue en
// /api/marketing/inventario/* (plomería, datos intactos).
//
// 🩸 RECORTE (jul-2026). Las dos tablas vivían dentro de un contenedor con
// `overflow-hidden` y SIN scroller propio adentro. Medido: ancho ÚTIL 358px
// @390 y 562px @834 (la barra lateral se come 224px desde md), contra 695px
// que pide la tabla de Productos y 605px la de Resumen por tienda. Recorte:
// 338px y 248px @390; 134px y 44px @834. Se perdían ENTREGADO, DISPONIBLE,
// VALOR y ACCIONES del inventario, y "$ Tommy Hilfiger" y "TOTAL $" del
// resumen — sin scroll y sin aviso.
//   * < lg → TARJETAS con los mismos datos y las mismas etiquetas.
//   * ≥ lg → las mismas tablas (útil 752px a 1024 y 1104px a 1440: entran), con
//     un scroller propio adentro para que crecer nunca vuelva a ser recortar
//     (el resumen gana una columna por cada marca nueva).
//
// 🩸 UNA SOLA TABLA (ago-2026). La pantalla listaba los MISMOS 6 muebles dos
// veces: en "Productos" (lo que valen para Daniel) y en "Notas del proveedor"
// (lo que le cobra Changalo), con precios distintos y fotos solo abajo.
// Daniel, textual: *"quiero productos tal cual como esta, solo que con las
// fotos de notas proveedor. y con ? global que muestre los precios reales que
// son los que estan en nota proveedor. y despues eliminar notas proveedor"*.
//   * Las fotos se MUDARON a `mk_inventario_productos.foto_path` (backfill en
//     la migración 20260811150000, la corre Daniel a mano).
//   * Los costos del proveedor viven en UN solo "?" arriba, de solo lectura.
//   * El bloque de abajo desapareció. La TABLA `mk_mobiliario_notas_proveedor`
//     NO se borró: es de donde el "?" saca los precios.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { useToast } from "@/components/ToastSystem";
import { ConfirmDeleteModal, ConfirmModal } from "@/components/ui";
import { formatearMonto } from "@/lib/marketing/normalizar";
import { resumirPorTienda } from "@/lib/marketing/inventario-resumen";
import EntregaForm from "@/components/marketing/EntregaForm";
import PreciosProveedorAyuda from "@/components/marketing/PreciosProveedorAyuda";
// Reusa el compresor que ya usa Reclamos: baja la foto de celular a ~1600px
// JPEG antes de subirla. Importa porque la MISMA foto termina incrustada en el
// PDF de la nota de entrega, y una foto de 8 MB haría un papel que no se puede
// mandar por WhatsApp.
import { compressImage, validateFotoFile } from "@/app/reclamos/components/fotoUpload";
import { useFormModalDismiss } from "@/lib/hooks/useModalDismiss";
import type {
  EntregaConItems,
  MarcaConPorcentaje,
  MkInventarioProducto,
  MkMarca,
  MkProyecto,
  ProyectoConMarcas,
} from "@/lib/marketing/types";

interface ProductoEditState {
  id: string | null; // null = nuevo
  nombre: string;
  precio: string;
  stockTotal: string;
  precioOriginal: number | null; // precio al abrir (para detectar cambio)
  /** Ruta en el bucket `marketing`. null = sin foto. */
  fotoPath: string | null;
  /** URL para la vista previa (firmada o local recién subida). */
  fotoUrl: string | null;
}

// Impacto de cambiar el precio (preview del endpoint impacto-precio).
interface ImpactoPrecio {
  entregasAfectadas: number;
  totalAntes: number;
  totalDespues: number;
  delta: number;
}

export default function MobiliarioPage() {
  const router = useRouter();
  const { authChecked, role } = useAuth({
    moduleKey: "marketing",
    allowedRoles: ["admin", "secretaria"],
  });
  const { toast } = useToast();

  const [productos, setProductos] = useState<MkInventarioProducto[]>([]);
  const [entregas, setEntregas] = useState<EntregaConItems[]>([]);
  const [proyectoById, setProyectoById] = useState<Map<string, MkProyecto>>(
    new Map(),
  );
  const [proyectoConMarcasById, setProyectoConMarcasById] = useState<
    Map<string, ProyectoConMarcas>
  >(new Map());
  const [marcas, setMarcas] = useState<MkMarca[]>([]);
  const [loading, setLoading] = useState(true);

  const [editProd, setEditProd] = useState<ProductoEditState | null>(null);
  const [savingProd, setSavingProd] = useState(false);
  // Confirmación de precio vivo: impacto a mostrar antes de aplicar el cambio.
  const [confirmPrecio, setConfirmPrecio] = useState<ImpactoPrecio | null>(null);
  const [checkingPrecio, setCheckingPrecio] = useState(false);
  const [deleteProd, setDeleteProd] = useState<MkInventarioProducto | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [editEntrega, setEditEntrega] = useState<EntregaConItems | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  // Clic fuera + Escape en el modal de producto. Si ya editó algún campo, no
  // cierra (se sale con Cancelar) para no perder lo escrito.
  const cerrarEditProd = useCallback(() => setEditProd(null), []);
  const editProdDismiss = useFormModalDismiss(
    editProd !== null,
    cerrarEditProd,
    !savingProd,
  );


  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, eRes, mRes] = await Promise.all([
        fetch("/api/marketing/inventario/productos", { cache: "no-store" }),
        fetch("/api/marketing/inventario/entregas", { cache: "no-store" }),
        fetch("/api/marketing/marcas", { cache: "no-store" }),
      ]);
      if (!pRes.ok) throw new Error("No se pudieron cargar productos");
      if (!eRes.ok) throw new Error("No se pudieron cargar entregas");
      const pData = (await pRes.json()) as MkInventarioProducto[];
      const eData = (await eRes.json()) as EntregaConItems[];
      const mData = mRes.ok ? ((await mRes.json()) as MkMarca[]) : [];
      setProductos(pData);
      setEntregas(eData);
      setMarcas(mData);

      // Cargar proyectos relacionados (solo los que tienen entrega asignada,
      // necesarios para mostrar nombre de tienda en filas asignadas).
      const proyIds = Array.from(
        new Set(
          eData
            .map((e) => e.proyecto_id)
            .filter((id): id is string => id !== null),
        ),
      );
      const entries = await Promise.all(
        proyIds.map(async (id) => {
          try {
            const r = await fetch(`/api/marketing/proyectos/${id}`, {
              cache: "no-store",
            });
            if (!r.ok) return null;
            return (await r.json()) as ProyectoConMarcas;
          } catch {
            return null;
          }
        }),
      );
      const mapBasic = new Map<string, MkProyecto>();
      const mapFull = new Map<string, ProyectoConMarcas>();
      for (const p of entries) {
        if (!p) continue;
        mapBasic.set(p.id, p);
        mapFull.set(p.id, p);
      }
      setProyectoById(mapBasic);
      setProyectoConMarcasById(mapFull);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (authChecked) cargar();
  }, [authChecked, cargar]);

  // Métricas
  const metricas = useMemo(() => {
    const valor = productos.reduce(
      (s, p) => s + Number(p.precio) * Number(p.stock_total),
      0,
    );
    const entregado = entregas.reduce((s, e) => s + Number(e.total ?? 0), 0);
    const tiendas = new Set(entregas.map((e) => e.proyecto_id)).size;
    // 🩸 Acá había DOS campos con el MISMO valor: `valor` y `disponible`, los
    // dos `precio × stock_total`. En pantalla salían como "Valor total" y
    // "Disponible", que se leen como "lo que tengo" contra "lo que me queda", y
    // nunca podían diferir ni un centavo.
    //
    // Cuál sobraba: `mk_inventario_productos.stock_total` son las UNIDADES
    // DISPONIBLES AHORA MISMO — cada entrega se lo descuenta
    // (inventario.ts: `update({ stock_total: actual - unidades })`) y el modelo
    // es plano, sin histórico de compras. O sea que `precio × stock_total` ya
    // ES el disponible, y "Valor total" era el rótulo equivocado: no existe en
    // ningún lado el dato de "lo que se compró en total".
    //
    // Queda UN número, con el nombre que le corresponde. No se tocó ningún
    // monto: es el mismo cálculo de siempre, dicho una sola vez.
    return {
      enBodega: Number(valor.toFixed(2)),
      entregado: Number(entregado.toFixed(2)),
      tiendas,
    };
  }, [productos, entregas]);

  // Agregado por tienda: 1 fila por tienda con total de paneles + monto (100%)
  // por marca. Toda entrega tiene proyecto_id (la tienda sale de proyecto.tienda).
  const { filas: resumenFilas, marcas: resumenMarcas } = useMemo(() => {
    const proyectos: MkProyecto[] = Array.from(proyectoById.values());
    return resumirPorTienda(entregas, proyectos, productos, marcas);
  }, [entregas, proyectoById, productos, marcas]);

  const totalResumen = useMemo(() => {
    const montoPorMarca: Record<string, number> = {};
    let totalPaneles = 0;
    let totalMonto = 0;
    for (const f of resumenFilas) {
      totalPaneles += f.totalPaneles;
      totalMonto += f.totalMonto;
      for (const [mid, m] of Object.entries(f.montoPorMarca)) {
        montoPorMarca[mid] = (montoPorMarca[mid] ?? 0) + m;
      }
    }
    for (const k of Object.keys(montoPorMarca)) {
      montoPorMarca[k] = Math.round(montoPorMarca[k] * 100) / 100;
    }
    return {
      totalPaneles,
      montoPorMarca,
      totalMonto: Math.round(totalMonto * 100) / 100,
    };
  }, [resumenFilas]);


  // Entregado por producto (para columna "Entregado" en tabla)
  const entregadoPorProducto = useMemo(() => {
    const out = new Map<string, number>();
    for (const e of entregas) {
      for (const it of e.items) {
        let total = 0;
        for (const v of Object.values(it.cantidad_por_marca ?? {})) {
          total += Number(v ?? 0);
        }
        out.set(it.producto_id, (out.get(it.producto_id) ?? 0) + total);
      }
    }
    return out;
  }, [entregas]);

  // Handlers
  const abrirNuevoProducto = () => {
    setEditProd({
      id: null,
      nombre: "",
      precio: "0",
      stockTotal: "0",
      precioOriginal: null,
      fotoPath: null,
      fotoUrl: null,
    });
  };
  const abrirEditarProducto = (p: MkInventarioProducto) => {
    setEditProd({
      id: p.id,
      nombre: p.nombre,
      precio: String(p.precio),
      stockTotal: String(p.stock_total),
      precioOriginal: Number(p.precio),
      fotoPath: p.foto_path,
      fotoUrl: p.foto_url,
    });
  };

  // ── Foto del producto: URL firmada → PUT directo a Storage ───────────────
  // Mismo patrón que Notas del proveedor. El archivo NO pasa por Vercel.
  const subirFotoProducto = async (file: File) => {
    if (!editProd) return;
    const errValidacion = validateFotoFile(file);
    if (errValidacion) {
      toast(errValidacion, "error");
      return;
    }
    setSubiendoFoto(true);
    try {
      const comprimida = await compressImage(file);
      const urlRes = await fetch(
        "/api/marketing/inventario/productos/upload-url",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: comprimida.name || file.name }),
        },
      );
      if (!urlRes.ok) {
        const err = await urlRes.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo preparar la subida");
      }
      const { uploadUrl, path } = (await urlRes.json()) as {
        uploadUrl: string;
        path: string;
      };
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": comprimida.type || "application/octet-stream",
        },
        body: comprimida,
      });
      if (!put.ok) throw new Error("No se pudo subir la foto");
      setEditProd((prev) =>
        prev === null
          ? prev
          : {
              ...prev,
              fotoPath: path,
              fotoUrl: URL.createObjectURL(comprimida),
            },
      );
      toast("Foto lista — se guarda al tocar Guardar", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudo subir", "error");
    } finally {
      setSubiendoFoto(false);
    }
  };

  // Escribe el producto (POST/PATCH). El PATCH propaga el precio vivo a las
  // entregas; la confirmación previa (si aplica) ya la maneja guardarProducto.
  const aplicarGuardarProducto = async () => {
    if (!editProd) return;
    setSavingProd(true);
    try {
      const body = {
        nombre: editProd.nombre.trim(),
        precio: Number(editProd.precio),
        stockTotal: Number(editProd.stockTotal),
        fotoPath: editProd.fotoPath,
      };
      const url = editProd.id
        ? `/api/marketing/inventario/productos/${editProd.id}`
        : "/api/marketing/inventario/productos";
      const method = editProd.id ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo guardar");
      }
      const data = (await res.json().catch(() => null)) as {
        impacto?: ImpactoPrecio | null;
        foto_path?: string | null;
      } | null;
      // cols-opcionales: si se mandó foto y volvió sin ella, la columna
      // todavía no existe. Se dice con todas las letras en vez de dejar creer
      // que la foto quedó guardada.
      if (editProd.fotoPath && data && !data.foto_path) {
        toast(
          "El producto se guardó, pero la foto todavía no: falta correr en Supabase la migración 20260808160000_mk_mobiliario_bultos_y_foto.sql",
          "error",
        );
      }
      const n = data?.impacto?.entregasAfectadas ?? 0;
      toast(
        !editProd.id
          ? "Producto creado"
          : n > 0
            ? `Precio actualizado · ${n} ${n === 1 ? "entrega recalculada" : "entregas recalculadas"}`
            : "Producto actualizado",
        "success",
      );
      setConfirmPrecio(null);
      setEditProd(null);
      cargar();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    } finally {
      setSavingProd(false);
    }
  };

  const guardarProducto = async () => {
    if (!editProd) return;
    // Si es edición y el precio cambió, consultar el impacto antes de aplicar
    // y pedir confirmación si hay entregas afectadas (precio vivo).
    const cambioPrecio =
      editProd.id !== null &&
      editProd.precioOriginal !== null &&
      Math.abs(Number(editProd.precio) - editProd.precioOriginal) > 0.005;
    if (cambioPrecio) {
      setCheckingPrecio(true);
      try {
        const res = await fetch(
          `/api/marketing/inventario/productos/${editProd.id}/impacto-precio?precio=${Number(editProd.precio)}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const imp = (await res.json()) as ImpactoPrecio;
          if (imp.entregasAfectadas > 0) {
            setConfirmPrecio(imp);
            return; // espera confirmación → aplicarGuardarProducto
          }
        }
      } catch {
        /* si el preview falla, seguimos al guardado normal */
      } finally {
        setCheckingPrecio(false);
      }
    }
    await aplicarGuardarProducto();
  };

  const ejecutarBorrarProducto = async () => {
    if (!deleteProd) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/marketing/inventario/productos/${deleteProd.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo eliminar");
      }
      toast("Producto eliminado", "success");
      setDeleteProd(null);
      cargar();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    } finally {
      setDeleting(false);
    }
  };

  const descargarExcel = async (proyectoId?: string) => {
    const id = proyectoId ?? "global";
    setDownloading(id);
    try {
      const url = proyectoId
        ? `/api/marketing/inventario/export?proyecto_id=${proyectoId}`
        : "/api/marketing/inventario/export";
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo generar Excel");
      }
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      const cd = res.headers.get("Content-Disposition") ?? "";
      const m = cd.match(/filename="?([^"]+)"?/);
      link.download = m?.[1] ?? "mobiliario.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      toast("Excel listo — revisa tu carpeta de descargas", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    } finally {
      setDownloading(null);
    }
  };

  if (!authChecked) return null;

  const breadcrumbs = [{ label: "Mobiliario" }];

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader module="Marketing" breadcrumbs={breadcrumbs} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <button
              type="button"
              onClick={() => router.push("/marketing")}
              className="text-sm text-gray-600 hover:text-black transition inline-flex items-center gap-1 min-h-[44px] -mt-2"
            >
              ← Proyectos
            </button>
            <h1 className="text-xl font-semibold text-gray-900">
              Mobiliario
            </h1>
          </div>
          <button
            type="button"
            onClick={() => descargarExcel()}
            disabled={downloading === "global"}
            className="rounded-md border border-gray-300 bg-white text-gray-700 px-3 min-h-[44px] text-sm hover:bg-gray-50 active:scale-[0.97] transition disabled:opacity-60"
          >
            {downloading === "global" ? "Generando…" : "Descargar Excel"}
          </button>
        </div>

        {/* Resumen sutil — sin cards grandes, solo línea de texto. */}
        <div className="text-xs text-gray-500 tabular-nums">
          En bodega:{" "}
          <span className="text-emerald-700">
            {formatearMonto(metricas.enBodega)}
          </span>{" "}
          · Entregado: {formatearMonto(metricas.entregado)} · Tiendas:{" "}
          {metricas.tiendas}
        </div>

        {/* Tabla productos */}
        <section className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-xs uppercase tracking-wide text-gray-500 font-medium">
              Productos
            </h2>
            {/* UN SOLO "?" con los costos del proveedor, al lado de Agregar.
                Solo admin: es la misma puerta que tenía el bloque viejo de
                "Notas del proveedor", y el candado real está en el servidor. */}
            <div className="flex items-center gap-2">
              {role === "admin" && <PreciosProveedorAyuda />}
              <button
                type="button"
                onClick={abrirNuevoProducto}
                className="text-xs text-gray-500 hover:text-black underline min-h-[44px] px-1"
              >
                + Agregar producto
              </button>
            </div>
          </div>
          {/* TARJETAS — hasta lg. Mismos datos y mismas etiquetas que la tabla. */}
          <div className="lg:hidden space-y-2">
            {loading ? (
              <div className="rounded-[10px] border border-gray-200 bg-white px-3 py-6 text-center text-gray-400 text-sm">
                Cargando…
              </div>
            ) : productos.length === 0 ? (
              <div className="rounded-[10px] border border-gray-200 bg-white px-3 py-6 text-center text-gray-400 text-sm">
                No hay productos. Agrega el primero.
              </div>
            ) : (
              <>
                {productos.map((p) => {
                  const entregado = entregadoPorProducto.get(p.id) ?? 0;
                  const comprado = entregado + Number(p.stock_total);
                  const valor = Number(p.precio) * Number(p.stock_total);
                  return (
                    <div
                      key={p.id}
                      data-fg-tarjeta
                      data-fg-fila={p.id}
                      className="rounded-[10px] border border-gray-200 bg-white p-3"
                    >
                      <div className="flex items-center gap-3">
                        <FotoProducto url={p.foto_url} nombre={p.nombre} />
                        <div
                          data-fg-campo="producto"
                          className="min-w-0 flex-1 text-sm font-medium text-gray-900 break-words"
                        >
                          {p.nombre}
                        </div>
                      </div>
                      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                        <Dato campo="precio" label="Precio" valor={formatearMonto(p.precio)} />
                        <Dato campo="comprado" label="Comprado" valor={String(comprado)} />
                        <Dato campo="entregado" label="Entregado" valor={String(entregado)} />
                        <Dato campo="disponible" label="Disponible" valor={String(p.stock_total)} />
                        <Dato campo="valor" label="Valor" valor={formatearMonto(valor)} />
                      </dl>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => abrirEditarProducto(p)}
                          className="flex-1 min-h-[44px] px-3 rounded-md border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 active:scale-[0.97]"
                        >
                          Editar
                        </button>
                        {role === "admin" && (
                          <button
                            type="button"
                            onClick={() => setDeleteProd(p)}
                            className="flex-1 min-h-[44px] px-3 rounded-md border border-red-200 bg-white text-sm font-medium text-red-600 hover:bg-red-50 active:scale-[0.97]"
                          >
                            Borrar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div
                  data-fg-tarjeta
                  data-fg-fila="TOTAL"
                  className="rounded-[10px] border border-gray-300 bg-gray-50 p-3"
                >
                  <div className="text-sm font-semibold text-gray-900">TOTAL</div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                    <Dato
                      campo="comprado"
                      label="Comprado"
                      valor={String(
                        productos.reduce(
                          (s, p) =>
                            s + (entregadoPorProducto.get(p.id) ?? 0) + p.stock_total,
                          0,
                        ),
                      )}
                    />
                    <Dato
                      campo="entregado"
                      label="Entregado"
                      valor={String(
                        productos.reduce(
                          (s, p) => s + (entregadoPorProducto.get(p.id) ?? 0),
                          0,
                        ),
                      )}
                    />
                    <Dato
                      campo="disponible"
                      label="Disponible"
                      valor={String(productos.reduce((s, p) => s + p.stock_total, 0))}
                    />
                    <Dato
                      campo="valor"
                      label="Valor"
                      valor={formatearMonto(metricas.enBodega)}
                    />
                  </dl>
                </div>
              </>
            )}
          </div>

          {/* TABLA — desde lg. El div interno es el scroller. */}
          <div className="hidden lg:block rounded-[10px] border border-gray-200 overflow-hidden bg-white">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-xs uppercase tracking-wide text-gray-500">
                  {/* La foto no lleva encabezado: se entiende sola y ahorra
                      ancho en una tabla que ya tuvo un recorte grave. */}
                  <th className="w-16 px-3 py-2" aria-label="Foto" />
                  <th className="text-left font-medium px-3 py-2">Producto</th>
                  <th className="text-right font-medium px-3 py-2 w-24">Precio</th>
                  <th className="text-right font-medium px-3 py-2 w-24">Comprado</th>
                  <th className="text-right font-medium px-3 py-2 w-24">Entregado</th>
                  <th className="text-right font-medium px-3 py-2 w-24">Disponible</th>
                  <th className="text-right font-medium px-3 py-2 w-28">Valor</th>
                  <th className="text-right font-medium px-3 py-2 w-28">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-gray-400 text-sm">
                      Cargando…
                    </td>
                  </tr>
                ) : productos.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-gray-400 text-sm">
                      No hay productos. Agrega el primero.
                    </td>
                  </tr>
                ) : (
                  <>
                    {productos.map((p) => {
                      const entregado = entregadoPorProducto.get(p.id) ?? 0;
                      const comprado = entregado + Number(p.stock_total);
                      const valor = Number(p.precio) * Number(p.stock_total);
                      return (
                        <tr
                          key={p.id}
                          data-fg-fila={p.id}
                          className="border-t border-gray-100"
                        >
                          <td className="px-3 py-2">
                            <FotoProducto url={p.foto_url} nombre={p.nombre} />
                          </td>
                          <td data-fg-campo="producto" className="px-3 py-2 text-gray-900">
                            {p.nombre}
                          </td>
                          <td data-fg-campo="precio" className="px-3 py-2 text-right tabular-nums">
                            {formatearMonto(p.precio)}
                          </td>
                          <td data-fg-campo="comprado" className="px-3 py-2 text-right tabular-nums text-gray-600">
                            {comprado}
                          </td>
                          <td data-fg-campo="entregado" className="px-3 py-2 text-right tabular-nums text-gray-600">
                            {entregado}
                          </td>
                          <td data-fg-campo="disponible" className="px-3 py-2 text-right tabular-nums font-medium">
                            {p.stock_total}
                          </td>
                          <td data-fg-campo="valor" className="px-3 py-2 text-right tabular-nums">
                            {formatearMonto(valor)}
                          </td>
                          <td className="px-3 py-2 text-right space-x-2">
                            <button
                              type="button"
                              onClick={() => abrirEditarProducto(p)}
                              className="text-xs text-gray-700 hover:text-black underline"
                            >
                              Editar
                            </button>
                            {role === "admin" && (
                              <button
                                type="button"
                                onClick={() => setDeleteProd(p)}
                                className="text-xs text-red-600 hover:text-red-800 underline"
                              >
                                Borrar
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    <tr
                      data-fg-fila="TOTAL"
                      className="border-t border-gray-200 bg-gray-50/50 font-semibold text-gray-900"
                    >
                      <td />
                      <td className="px-3 py-2">TOTAL</td>
                      <td />
                      <td data-fg-campo="comprado" className="px-3 py-2 text-right tabular-nums">
                        {productos.reduce(
                          (s, p) =>
                            s + (entregadoPorProducto.get(p.id) ?? 0) + p.stock_total,
                          0,
                        )}
                      </td>
                      <td data-fg-campo="entregado" className="px-3 py-2 text-right tabular-nums">
                        {productos.reduce(
                          (s, p) => s + (entregadoPorProducto.get(p.id) ?? 0),
                          0,
                        )}
                      </td>
                      <td data-fg-campo="disponible" className="px-3 py-2 text-right tabular-nums">
                        {productos.reduce((s, p) => s + p.stock_total, 0)}
                      </td>
                      <td data-fg-campo="valor" className="px-3 py-2 text-right tabular-nums">
                        {formatearMonto(metricas.enBodega)}
                      </td>
                      <td />
                    </tr>
                  </>
                )}
              </tbody>
            </table>
            </div>
          </div>
        </section>

        {/* Resumen por tienda — formato changalo. Toma TODAS las entregas
            (incluidas pendientes), agrupa por tienda (proyecto.tienda o notas),
            y reparte Paneles + montos entre Fashion Wear y Vistana. */}
        <section className="space-y-1.5">
          {/* 🩸 Acá vivía un segundo botón "Descargar Excel", DENTRO de
              "Resumen por tienda", que llamaba exactamente a `descargarExcel()`
              sin argumentos — el mismo archivo completo que baja el botón de
              arriba. Prometía el resumen y bajaba todo. No hay endpoint que
              exporte sólo este resumen, así que el botón se retira: el de la
              cabecera baja el Excel del módulo y es el único que lo dice. */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs uppercase tracking-wide text-gray-500 font-medium">
                Resumen por tienda
              </h2>
            </div>
          </div>
          {/* TARJETAS — hasta lg. Una por tienda, con las mismas etiquetas de
              columna ("Total Paneles", "$ <marca>", "Total $"). */}
          <div className="lg:hidden space-y-2">
            {loading ? (
              <div className="rounded-[10px] border border-gray-200 bg-white px-3 py-6 text-center text-gray-400 text-sm">
                Cargando…
              </div>
            ) : resumenFilas.length === 0 ? (
              <div className="rounded-[10px] border border-gray-200 bg-white px-3 py-6 text-center text-gray-400 text-sm">
                Aún no hay entregas registradas.
              </div>
            ) : (
              <>
                {resumenFilas.map((f) => (
                  <div
                    key={f.tienda}
                    data-fg-tarjeta
                    data-fg-fila={f.tienda}
                    className="rounded-[10px] border border-gray-200 bg-white p-3"
                  >
                    <div
                      data-fg-campo="cliente"
                      className="text-sm font-medium text-gray-900 break-words"
                    >
                      {f.tienda}
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                      <Dato
                        campo="paneles"
                        label="Total Paneles"
                        valor={f.totalPaneles > 0 ? String(f.totalPaneles) : "—"}
                        atenuado={f.totalPaneles <= 0}
                      />
                      {resumenMarcas.map((m) => {
                        const monto = f.montoPorMarca[m.id] ?? 0;
                        return (
                          <Dato
                            key={m.id}
                            campo={`marca:${m.id}`}
                            label={`$ ${m.nombre}`}
                            valor={monto > 0 ? formatearMonto(monto) : "—"}
                            atenuado={monto <= 0}
                          />
                        );
                      })}
                      <Dato
                        campo="total"
                        label="Total $"
                        valor={
                          f.totalMonto > 0 ? formatearMonto(f.totalMonto) : "—"
                        }
                        atenuado={f.totalMonto <= 0}
                        destacado
                      />
                    </dl>
                  </div>
                ))}
                <div
                  data-fg-tarjeta
                  data-fg-fila="Total"
                  className="rounded-[10px] border border-gray-300 bg-gray-900 text-white p-3"
                >
                  <div className="text-xs font-bold uppercase tracking-wide">
                    Total
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                    <Dato
                      campo="paneles"
                      label="Total Paneles"
                      valor={
                        totalResumen.totalPaneles
                          ? String(totalResumen.totalPaneles)
                          : "—"
                      }
                      oscuro
                    />
                    {resumenMarcas.map((m) => {
                      const monto = totalResumen.montoPorMarca[m.id] ?? 0;
                      return (
                        <Dato
                          key={m.id}
                          campo={`marca:${m.id}`}
                          label={`$ ${m.nombre}`}
                          valor={monto > 0 ? formatearMonto(monto) : "—"}
                          oscuro
                        />
                      );
                    })}
                    <Dato
                      campo="total"
                      label="Total $"
                      valor={
                        totalResumen.totalMonto > 0
                          ? formatearMonto(totalResumen.totalMonto)
                          : "—"
                      }
                      oscuro
                    />
                  </dl>
                </div>
              </>
            )}
          </div>

          {/* TABLA — desde lg. El div interno es el scroller: el resumen gana
              una columna por cada marca nueva, así que crecer no puede volver
              a significar recortar. */}
          <div className="hidden lg:block rounded-[10px] border border-gray-200 overflow-hidden bg-white">
            <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-gray-50">
                <tr className="text-xs uppercase tracking-wide text-gray-500">
                  <th className="text-left font-medium px-3 py-2">Cliente</th>
                  <th className="text-right font-medium px-3 py-2 w-28">
                    Total Paneles
                  </th>
                  {resumenMarcas.map((m) => (
                    <th
                      key={m.id}
                      className="text-right font-medium px-3 py-2 w-28"
                    >
                      $ {m.nombre}
                    </th>
                  ))}
                  <th className="text-right font-medium px-3 py-2 w-28">
                    Total $
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={resumenMarcas.length + 3}
                      className="px-3 py-6 text-center text-gray-400 text-sm"
                    >
                      Cargando…
                    </td>
                  </tr>
                ) : resumenFilas.length === 0 ? (
                  <tr>
                    <td
                      colSpan={resumenMarcas.length + 3}
                      className="px-3 py-6 text-center text-gray-400 text-sm"
                    >
                      Aún no hay entregas registradas.
                    </td>
                  </tr>
                ) : (
                  <>
                    {resumenFilas.map((f) => (
                      <tr
                        key={f.tienda}
                        data-fg-fila={f.tienda}
                        className="border-t border-gray-100 hover:bg-gray-50 transition-colors"
                      >
                        <td data-fg-campo="cliente" className="px-3 py-2 text-gray-900">
                          {f.tienda}
                        </td>
                        <td data-fg-campo="paneles" className="px-3 py-2 text-right font-mono tabular-nums text-gray-700">
                          {f.totalPaneles > 0 ? (
                            f.totalPaneles
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        {resumenMarcas.map((m) => {
                          const monto = f.montoPorMarca[m.id] ?? 0;
                          return (
                            <td
                              key={m.id}
                              data-fg-campo={`marca:${m.id}`}
                              className="px-3 py-2 text-right font-mono tabular-nums"
                            >
                              {monto > 0 ? (
                                formatearMonto(monto)
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td data-fg-campo="total" className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-gray-900">
                          {f.totalMonto > 0 ? (
                            formatearMonto(f.totalMonto)
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {/* Fila TOTAL — fondo oscuro para contraste con el módulo. */}
                    <tr
                      data-fg-fila="Total"
                      className="border-t border-gray-300 bg-gray-900 text-white"
                    >
                      <td className="px-3 py-2.5 font-bold uppercase text-xs tracking-wide">
                        Total
                      </td>
                      <td data-fg-campo="paneles" className="px-3 py-2.5 text-right font-mono tabular-nums font-bold">
                        {totalResumen.totalPaneles || (
                          <span className="opacity-50">—</span>
                        )}
                      </td>
                      {resumenMarcas.map((m) => {
                        const monto = totalResumen.montoPorMarca[m.id] ?? 0;
                        return (
                          <td
                            key={m.id}
                            data-fg-campo={`marca:${m.id}`}
                            className="px-3 py-2.5 text-right font-mono tabular-nums font-bold"
                          >
                            {monto > 0 ? formatearMonto(monto) : "—"}
                          </td>
                        );
                      })}
                      <td data-fg-campo="total" className="px-3 py-2.5 text-right font-mono tabular-nums font-bold">
                        {totalResumen.totalMonto > 0
                          ? formatearMonto(totalResumen.totalMonto)
                          : "—"}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
            </div>
          </div>
        </section>

        {/* 🔴 "Notas del proveedor" YA NO ES UN BLOQUE DE ESTA PANTALLA.
            Daniel: *"quiero productos tal cual como esta, solo que con las
            fotos de notas proveedor (…) y despues eliminar notas proveedor"*.
            Los mismos 6 muebles se listaban DOS veces con precios distintos y
            eso confundía. Ahora: las fotos viven en la tabla de Productos y
            los costos del proveedor en el "?" de arriba.
            ⚠️ La TABLA `mk_mobiliario_notas_proveedor` sigue existiendo y con
            sus 6 filas — es de donde sale el contenido del "?". */}
      </main>

      {/* Modal edit/nuevo producto */}
      {editProd && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            {...editProdDismiss.backdrop}
          />
          <div
            ref={editProdDismiss.panelRef}
            className="relative bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-md w-full mx-0 sm:mx-4 border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-4">
              {editProd.id ? "Editar producto" : "Nuevo producto"}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Nombre<span className="text-red-500 ml-0.5">*</span>
                </label>
                <input
                  type="text"
                  value={editProd.nombre}
                  onChange={(e) =>
                    setEditProd({ ...editProd, nombre: e.target.value })
                  }
                  className="w-full rounded-md border border-gray-300 px-3 min-h-[44px] text-sm focus:border-black focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Precio</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={editProd.precio}
                    onChange={(e) =>
                      setEditProd({ ...editProd, precio: e.target.value })
                    }
                    className="w-full rounded-md border border-gray-300 px-3 min-h-[44px] text-sm tabular-nums focus:border-black focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Stock total</label>
                  <input
                    type="number"
                    step="1"
                    value={editProd.stockTotal}
                    onChange={(e) =>
                      setEditProd({ ...editProd, stockTotal: e.target.value })
                    }
                    className="w-full rounded-md border border-gray-300 px-3 min-h-[44px] text-sm tabular-nums focus:border-black focus:outline-none"
                  />
                </div>
              </div>

              {/* Foto del mueble. Sale también en la nota de entrega, que es
                  para lo que Daniel la pidió: quien recibe en la tienda no
                  sabe qué es un "Norte colgador", con la foto sí. */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">Foto</label>
                <div className="flex items-center gap-3">
                  {editProd.fotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={editProd.fotoUrl}
                      alt=""
                      className="h-20 w-20 rounded-md border border-gray-200 object-cover bg-gray-50"
                    />
                  ) : (
                    <div className="h-20 w-20 rounded-md border border-dashed border-gray-200 bg-gray-50" />
                  )}
                  <div className="flex flex-col gap-1">
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) subirFotoProducto(f);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={subiendoFoto || savingProd}
                      className="rounded-md border border-gray-300 bg-white text-gray-700 px-3 min-h-[44px] text-sm hover:bg-gray-50 active:scale-[0.97] transition disabled:opacity-50"
                    >
                      {subiendoFoto
                        ? "Subiendo…"
                        : editProd.fotoPath
                          ? "Cambiar foto"
                          : "+ Agregar foto"}
                    </button>
                    {editProd.fotoPath && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditProd({
                            ...editProd,
                            fotoPath: null,
                            fotoUrl: null,
                          })
                        }
                        disabled={subiendoFoto || savingProd}
                        className="text-xs text-gray-500 hover:text-red-600 underline min-h-[44px] px-1 text-left disabled:opacity-50"
                      >
                        Quitar foto
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditProd(null)}
                disabled={savingProd || subiendoFoto}
                className="rounded-md border border-gray-300 bg-white text-gray-700 px-3 min-h-[44px] text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarProducto}
                disabled={savingProd || checkingPrecio || subiendoFoto || !editProd.nombre.trim()}
                className="rounded-md bg-black text-white px-4 min-h-[44px] text-sm font-medium active:scale-[0.97] transition disabled:opacity-50"
              >
                {checkingPrecio
                  ? "Revisando…"
                  : savingProd
                    ? "Guardando…"
                    : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        open={deleteProd !== null}
        title={deleteProd ? `Eliminar ${deleteProd.nombre}` : "Eliminar producto"}
        description="Esta acción no se puede deshacer. Si el producto está en alguna entrega, no se podrá eliminar."
        onConfirm={ejecutarBorrarProducto}
        onCancel={() => setDeleteProd(null)}
        loading={deleting}
      />

      {/* Confirmación de precio vivo: el cambio recalcula entregas existentes. */}
      <ConfirmModal
        open={confirmPrecio !== null}
        title="Actualizar precio y entregas"
        message={
          confirmPrecio
            ? `Este precio se usa en ${confirmPrecio.entregasAfectadas} ${
                confirmPrecio.entregasAfectadas === 1 ? "entrega" : "entregas"
              }. Al cambiarlo, el total de muebles pasa de ${formatearMonto(
                confirmPrecio.totalAntes,
              )} a ${formatearMonto(confirmPrecio.totalDespues)} (${
                confirmPrecio.delta >= 0 ? "+" : "−"
              }${formatearMonto(Math.abs(confirmPrecio.delta))}). ¿Aplicar a todas?`
            : ""
        }
        confirmLabel="Sí, aplicar a todas"
        loading={savingProd}
        onConfirm={aplicarGuardarProducto}
        onClose={() => setConfirmPrecio(null)}
      />

      {/* Modal editar entrega — usa marcas asignadas al proyecto */}
      {editEntrega && (() => {
        const proy = editEntrega.proyecto_id
          ? proyectoConMarcasById.get(editEntrega.proyecto_id)
          : null;
        const marcasParaEntrega: MarcaConPorcentaje[] =
          proy?.marcas ?? [];
        const proyNombre = proy?.nombre || proy?.tienda || "Proyecto";
        return (
          <EntregaForm
            open={true}
            proyectoId={editEntrega.proyecto_id ?? ""}
            proyectoNombre={proyNombre}
            marcasProyecto={marcasParaEntrega}
            productos={productos}
            initial={editEntrega}
            onClose={() => setEditEntrega(null)}
            onSaved={() => {
              setEditEntrega(null);
              cargar();
            }}
          />
        );
      })()}

    </div>
  );
}

// Un dato de tarjeta: la MISMA etiqueta que el encabezado de columna de la
// tabla, y el mismo valor ya formateado. `data-fg-campo` es lo que permite
// comparar fila por fila entre anchos sin depender de clases de breakpoint.
function Dato({
  campo,
  label,
  valor,
  atenuado,
  destacado,
  oscuro,
}: {
  campo: string;
  label: string;
  valor: string;
  atenuado?: boolean;
  destacado?: boolean;
  oscuro?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 min-w-0">
      <dt
        className={`text-xs uppercase tracking-wide truncate ${
          oscuro ? "text-white/60" : "text-gray-500"
        }`}
      >
        {label}
      </dt>
      <dd
        data-fg-campo={campo}
        className={`text-xs font-mono tabular-nums shrink-0 ${
          oscuro
            ? "font-bold"
            : atenuado
              ? "text-gray-300"
              : destacado
                ? "font-semibold text-gray-900"
                : "text-gray-700"
        }`}
      >
        {valor}
      </dd>
    </div>
  );
}

/**
 * Miniatura del mueble. Sin foto se ve un recuadro vacío del MISMO tamaño, no
 * un hueco: así la lista no se descuadra entre productos con y sin foto.
 *
 * ⚠️ Es la foto del INVENTARIO (el mueble que se entrega y que sale en la nota
 * de entrega). No tiene nada que ver con las fotos de "Notas del proveedor",
 * que son la libreta de costos y viven aparte a propósito.
 */
function FotoProducto({
  url,
  nombre,
}: {
  url: string | null;
  nombre: string;
}) {
  if (!url) {
    return (
      <div
        aria-hidden
        className="h-11 w-11 shrink-0 rounded-md border border-dashed border-gray-200 bg-gray-50"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={nombre}
      loading="lazy"
      className="h-11 w-11 shrink-0 rounded-md border border-gray-200 object-cover bg-gray-50"
    />
  );
}

function MetricCard({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="text-xs uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div
        className={`text-base font-semibold font-mono tabular-nums mt-1 ${
          valueClassName ?? "text-gray-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
