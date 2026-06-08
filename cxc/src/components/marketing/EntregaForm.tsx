"use client";

// Form modal para crear/editar una entrega de muebles.
//
// Flow nuevo (mayo 2026):
//   1) Selector de marca (Tommy / Calvin / Reebok / Joybees según corresponda).
//      La empresa interna pagadora se deriva de marca.empresa_codigo y NO se
//      expone en UI — el backend la resuelve por default al guardar.
//   2) Input destacado "Cantidad de paneles" (driver del kit).
//   3) Bloque "Accesorios": tablas, conjunto, norte, barra. Al escribir paneles
//      se autorrellenan según la curva sugerida (3/3/1/3). Editables a mano.
//      Si el usuario edita uno y luego cambia paneles, se ofrece un link
//      "Recalcular según curva" en vez de pisar el valor manual.
//   4) Resumen en vivo: total $, reparto Marca / Empresa interna o "100%
//      absorbe" si la marca es interna (Joybees).
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import type {
  EntregaConItems,
  EntregaItemInput,
  MarcaConPorcentaje,
  MkInventarioProducto,
  MkMarca,
} from "@/lib/marketing/types";
import { useToast } from "@/components/ToastSystem";
import { formatearMonto } from "@/lib/marketing/normalizar";
import { getEmpresaStyle } from "@/lib/marketing/empresa-styles";

interface Props {
  open: boolean;
  proyectoId: string;
  proyectoNombre: string;
  marcasProyecto: MarcaConPorcentaje[];
  productos: MkInventarioProducto[];
  initial?: EntregaConItems | null;
  onClose: () => void;
  onSaved: () => void;
}

// ---- Curva del KIT: paneles es el driver. ----
const CURVA: Record<string, number> = {
  paneles: 1,
  tablas: 3,
  conjunto: 3,
  norte: 1,
  barra: 3,
};

type Categoria = "paneles" | "tablas" | "conjunto" | "norte" | "barra" | "otros";

function categorizarProducto(nombre: string): Categoria {
  const n = nombre.toLowerCase();
  if (n.includes("panel")) return "paneles";
  if (n.includes("tabla")) return "tablas";
  if (n.includes("conjunto")) return "conjunto";
  if (n.includes("norte") || n.includes("colgador")) return "norte";
  if (n.includes("barra")) return "barra";
  return "otros";
}

function labelAccesorio(c: Categoria): string {
  if (c === "tablas") return "Tablas";
  if (c === "conjunto") return "Conjunto soporte";
  if (c === "norte") return "Norte (colgador)";
  if (c === "barra") return "Barra plana";
  return "Otro";
}

function trunc(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

export default function EntregaForm({
  open,
  proyectoId,
  proyectoNombre,
  marcasProyecto,
  productos,
  initial,
  onClose,
  onSaved,
}: Props) {
  const { toast } = useToast();

  // ---- Marcas elegibles ----
  // Si el form se abre desde un proyecto, las opciones son las marcas del
  // proyecto. Si es standalone (sin proyecto: marcasProyecto vacío), cargamos
  // todas las marcas activas del catálogo.
  const [catalogoMarcas, setCatalogoMarcas] = useState<MkMarca[]>([]);
  useEffect(() => {
    if (!open) return;
    if (marcasProyecto.length > 0) return;
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/marketing/marcas", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as MkMarca[];
        if (!cancelado) setCatalogoMarcas(Array.isArray(data) ? data : []);
      } catch {
        /* noop */
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [open, marcasProyecto.length]);

  const marcasOpciones: MkMarca[] = useMemo(() => {
    if (marcasProyecto.length > 0) {
      return marcasProyecto.map((m) => m.marca);
    }
    return catalogoMarcas;
  }, [marcasProyecto, catalogoMarcas]);

  // ---- Estado del form ----
  const [marcaIdSel, setMarcaIdSel] = useState<string>("");
  const [panelesStr, setPanelesStr] = useState<string>("");
  // Cantidades por categoría (string para input controlado).
  const [accesorios, setAccesorios] = useState<Record<Categoria, string>>({
    paneles: "",
    tablas: "",
    conjunto: "",
    norte: "",
    barra: "",
    otros: "",
  });
  // Tracking: ¿el usuario tocó manualmente el accesorio? (evita pisar al
  // recalcular paneles).
  const [tocadoManual, setTocadoManual] = useState<Record<Categoria, boolean>>({
    paneles: false,
    tablas: false,
    conjunto: false,
    norte: false,
    barra: false,
    otros: false,
  });
  // Cantidades libres para productos en categoría "otros" (uno por producto).
  const [otrosCant, setOtrosCant] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  // ---- Hidratar al abrir / cuando cambia initial ----
  useEffect(() => {
    if (!open) return;
    if (initial) {
      // Reconstruir desde la entrega existente. Asumimos una sola marca en el
      // reparto (caso normal) — tomamos el marca_id del primer entry con
      // cantidad>0.
      const productoNombreById = new Map(
        productos.map((p) => [p.id, p.nombre]),
      );
      let marcaId = "";
      const cantsByCat: Record<Categoria, number> = {
        paneles: 0,
        tablas: 0,
        conjunto: 0,
        norte: 0,
        barra: 0,
        otros: 0,
      };
      const otros: Record<string, string> = {};
      for (const it of initial.items ?? []) {
        const nombre = productoNombreById.get(it.producto_id) ?? "";
        const cat = categorizarProducto(nombre);
        let totalItem = 0;
        for (const r of it.reparto ?? []) {
          if (!marcaId) marcaId = r.marca_id;
          totalItem += Number(r.cantidad ?? 0);
        }
        if (cat === "otros") {
          otros[it.producto_id] = String(totalItem);
        } else {
          cantsByCat[cat] += totalItem;
        }
      }
      setMarcaIdSel(marcaId);
      setPanelesStr(cantsByCat.paneles > 0 ? String(cantsByCat.paneles) : "");
      setAccesorios({
        paneles: cantsByCat.paneles > 0 ? String(cantsByCat.paneles) : "",
        tablas: cantsByCat.tablas > 0 ? String(cantsByCat.tablas) : "",
        conjunto: cantsByCat.conjunto > 0 ? String(cantsByCat.conjunto) : "",
        norte: cantsByCat.norte > 0 ? String(cantsByCat.norte) : "",
        barra: cantsByCat.barra > 0 ? String(cantsByCat.barra) : "",
        otros: "",
      });
      // En edit, asumimos que cualquier valor que difiera de la curva pudo
      // ser editado a mano — marcamos todo como tocado para no pisar.
      setTocadoManual({
        paneles: false,
        tablas: true,
        conjunto: true,
        norte: true,
        barra: true,
        otros: true,
      });
      setOtrosCant(otros);
    } else {
      // Reset al abrir en modo crear.
      setMarcaIdSel("");
      setPanelesStr("");
      setAccesorios({
        paneles: "",
        tablas: "",
        conjunto: "",
        norte: "",
        barra: "",
        otros: "",
      });
      setTocadoManual({
        paneles: false,
        tablas: false,
        conjunto: false,
        norte: false,
        barra: false,
        otros: false,
      });
      setOtrosCant({});
    }
  }, [open, initial, productos]);

  // ---- Auto-fill al cambiar paneles ----
  // Solo rellenamos accesorios que NO fueron tocados manualmente.
  // Sincroniza accesorios.paneles con panelesStr.
  useEffect(() => {
    const n = trunc(Number(panelesStr));
    setAccesorios((prev) => {
      const next = { ...prev, paneles: panelesStr };
      if (!tocadoManual.tablas) next.tablas = n > 0 ? String(n * CURVA.tablas) : "";
      if (!tocadoManual.conjunto)
        next.conjunto = n > 0 ? String(n * CURVA.conjunto) : "";
      if (!tocadoManual.norte)
        next.norte = n > 0 ? String(n * CURVA.norte) : "";
      if (!tocadoManual.barra)
        next.barra = n > 0 ? String(n * CURVA.barra) : "";
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelesStr]);

  // ---- Productos por categoría (para mapear accesorios → productoId) ----
  const productosByCat = useMemo(() => {
    const out: Record<Categoria, MkInventarioProducto[]> = {
      paneles: [],
      tablas: [],
      conjunto: [],
      norte: [],
      barra: [],
      otros: [],
    };
    for (const p of productos) {
      out[categorizarProducto(p.nombre)].push(p);
    }
    return out;
  }, [productos]);

  // Tomamos el primer producto de cada categoría (el seed tiene un único
  // producto por categoría — Paneles, Tablas, Conjunto soporte, etc).
  const productoDe = (c: Categoria): MkInventarioProducto | null =>
    productosByCat[c][0] ?? null;

  // Marca seleccionada
  const marcaSel = useMemo(
    () => marcasOpciones.find((m) => m.id === marcaIdSel) ?? null,
    [marcasOpciones, marcaIdSel],
  );
  const esInterna = marcaSel?.tipo === "interna";
  const empresaCodigo = marcaSel?.empresa_codigo ?? "";
  const empresaStyle = !esInterna && empresaCodigo
    ? getEmpresaStyle(empresaCodigo)
    : null;

  // ---- Cálculo en vivo ----
  const filasParaResumen = useMemo(() => {
    const filas: Array<{ producto: MkInventarioProducto; cant: number }> = [];
    const cats: Categoria[] = ["paneles", "tablas", "conjunto", "norte", "barra"];
    for (const c of cats) {
      const prod = productoDe(c);
      const cant = trunc(Number(accesorios[c]));
      if (prod && cant > 0) filas.push({ producto: prod, cant });
    }
    for (const p of productosByCat.otros) {
      const cant = trunc(Number(otrosCant[p.id] ?? 0));
      if (cant > 0) filas.push({ producto: p, cant });
    }
    return filas;
  }, [accesorios, otrosCant, productosByCat]);

  const totalEntrega = useMemo(() => {
    let t = 0;
    for (const f of filasParaResumen) {
      t += Number(f.producto.precio) * f.cant;
    }
    return Math.round(t * 100) / 100;
  }, [filasParaResumen]);

  const repartoMarca = useMemo(() => {
    if (esInterna) return totalEntrega;
    return Math.round(totalEntrega * 50) / 100;
  }, [totalEntrega, esInterna]);
  const repartoEmpresa = useMemo(() => {
    if (esInterna) return 0;
    return Math.round(totalEntrega * 50) / 100;
  }, [totalEntrega, esInterna]);

  // ---- Handlers ----
  const setAccesorio = (cat: Categoria, value: string) => {
    const clean = value.replace(/[^0-9]/g, "");
    setAccesorios((prev) => ({ ...prev, [cat]: clean }));
    if (cat !== "paneles") {
      setTocadoManual((prev) => ({ ...prev, [cat]: true }));
    }
  };

  const setPaneles = (value: string) => {
    const clean = value.replace(/[^0-9]/g, "");
    setPanelesStr(clean);
  };

  const recalcularCurva = () => {
    const n = trunc(Number(panelesStr));
    if (n <= 0) return;
    setAccesorios({
      paneles: String(n),
      tablas: String(n * CURVA.tablas),
      conjunto: String(n * CURVA.conjunto),
      norte: String(n * CURVA.norte),
      barra: String(n * CURVA.barra),
      otros: "",
    });
    setTocadoManual({
      paneles: false,
      tablas: false,
      conjunto: false,
      norte: false,
      barra: false,
      otros: false,
    });
  };

  // ¿Algún accesorio editado a mano difiere de la curva? Si sí, ofrecemos
  // el link "Recalcular según curva".
  const hayManualEditado = useMemo(() => {
    return (["tablas", "conjunto", "norte", "barra"] as Categoria[]).some(
      (c) => tocadoManual[c],
    );
  }, [tocadoManual]);

  // Sugerido por accesorio (gris debajo del input cuando difiere del valor real).
  const sugeridoDe = (cat: Categoria): number => {
    const n = trunc(Number(panelesStr));
    if (n <= 0) return 0;
    return n * (CURVA[cat] ?? 0);
  };

  // ---- Validación ----
  const tieneAlMenosUno = filasParaResumen.length > 0;
  const panelesOk = trunc(Number(panelesStr)) >= 1;
  const marcaOk = !!marcaIdSel;
  const puedeGuardar = panelesOk && marcaOk && tieneAlMenosUno && !guardando;

  // Warnings de stock por producto (no bloqueantes).
  const warningsStock = useMemo(() => {
    const out: Array<{ nombre: string; pedido: number; disponible: number }> = [];
    for (const f of filasParaResumen) {
      // Si está en initial, sumamos lo que esa entrega ya tomaba para no contar
      // doble (lectura informativa, el backend recalcula stock al guardar).
      let previa = 0;
      if (initial) {
        for (const it of initial.items ?? []) {
          if (it.producto_id !== f.producto.id) continue;
          for (const r of it.reparto ?? []) previa += Number(r.cantidad ?? 0);
        }
      }
      const disponibleEfectivo = Number(f.producto.stock_total ?? 0) + previa;
      if (f.cant > disponibleEfectivo) {
        out.push({
          nombre: f.producto.nombre,
          pedido: f.cant,
          disponible: disponibleEfectivo,
        });
      }
    }
    return out;
  }, [filasParaResumen, initial]);

  // ---- Guardar ----
  const handleGuardar = async () => {
    if (!puedeGuardar) return;
    setGuardando(true);
    try {
      const items: EntregaItemInput[] = filasParaResumen.map((f) => ({
        productoId: f.producto.id,
        // No mandamos `empresa` — el backend la deriva de marca.empresa_codigo.
        reparto: [{ marcaId: marcaIdSel, cantidad: f.cant }],
      }));

      const url = initial
        ? `/api/marketing/inventario/entregas/${initial.id}`
        : "/api/marketing/inventario/entregas";
      const method = initial ? "PATCH" : "POST";
      const body = initial
        ? { items }
        : {
            // proyectoId="" significa "standalone, sin proyecto" → null para
            // que entre a la bandeja de pendientes.
            proyectoId: proyectoId ? proyectoId : null,
            items,
          };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo guardar la entrega");
      }
      toast(initial ? "Entrega actualizada" : "Entrega registrada", "success");
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async () => {
    if (!initial) return;
    if (!window.confirm("¿Eliminar esta entrega? El stock se devolverá al inventario.")) {
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch(
        `/api/marketing/inventario/entregas/${initial.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo eliminar");
      }
      toast("Entrega eliminada", "success");
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    } finally {
      setGuardando(false);
    }
  };

  if (!open) return null;

  // ---- Render ----
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => !guardando && onClose()}
      />
      <div
        className="relative bg-white sm:rounded-lg rounded-t-2xl max-w-2xl w-full mx-0 sm:mx-4 border border-stone-200 max-h-[95vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-stone-100 px-6 py-4 flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-stone-900">
              {initial ? "Editar entrega" : "Nueva entrega de muebles"}
            </h3>
            <p className="text-xs text-stone-500 truncate">{proyectoNombre}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            className="text-sm text-stone-500 hover:text-black transition disabled:opacity-50"
          >
            Cerrar
          </button>
        </div>

        <div className="p-6 space-y-6">
          {productos.length === 0 ? (
            <div className="rounded-md border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600">
              No hay productos en el inventario. Agrega productos primero en{" "}
              <span className="underline">/marketing/mobiliario</span>.
            </div>
          ) : marcasOpciones.length === 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              No hay marcas disponibles. Asigna marcas al proyecto antes de
              registrar la entrega.
            </div>
          ) : (
            <>
              {/* Paso 1: Marca */}
              <section className="space-y-2">
                <label className="block text-sm font-medium text-stone-800">
                  ¿A qué marca pertenece esta entrega?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {marcasOpciones.map((m) => {
                    const seleccionada = marcaIdSel === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMarcaIdSel(m.id)}
                        disabled={guardando}
                        className={`text-left rounded-lg border-2 px-4 py-3 transition ${
                          seleccionada
                            ? "border-stone-900 bg-stone-50"
                            : "border-stone-200 bg-white hover:border-stone-400"
                        } disabled:opacity-50`}
                      >
                        <div className="text-sm font-medium text-stone-900">
                          {m.nombre}
                        </div>
                        {m.tipo === "interna" && (
                          <div className="text-[11px] text-emerald-700 mt-0.5">
                            Marca interna · absorbe 100%
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Paso 2: Paneles destacado */}
              <section className="space-y-2">
                <label
                  htmlFor="entrega-paneles"
                  className="block text-base font-semibold text-stone-900"
                >
                  Cantidad de paneles
                </label>
                <p className="text-xs text-stone-500">
                  Los paneles definen el kit. Cuando escribas la cantidad,
                  los accesorios se llenan según la curva sugerida (×3 tablas,
                  ×3 conjunto, ×1 colgador, ×3 barra). Podés ajustarlos a mano.
                </p>
                <input
                  id="entrega-paneles"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={panelesStr}
                  onChange={(e) => setPaneles(e.target.value)}
                  disabled={guardando}
                  className="w-full rounded-md border border-stone-300 px-3 py-3 text-lg font-mono tabular-nums focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900 disabled:bg-stone-50"
                  placeholder="0"
                />
                {hayManualEditado && panelesOk && (
                  <button
                    type="button"
                    onClick={recalcularCurva}
                    className="text-xs text-stone-600 hover:text-black underline"
                  >
                    Recalcular accesorios según curva
                  </button>
                )}
              </section>

              {/* Paso 3: Accesorios */}
              <section className="space-y-2">
                <h4 className="text-sm font-medium text-stone-800">
                  Accesorios
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(["tablas", "conjunto", "norte", "barra"] as Categoria[]).map(
                    (cat) => {
                      const prod = productoDe(cat);
                      const value = accesorios[cat] ?? "";
                      const sugerido = sugeridoDe(cat);
                      const valActual = trunc(Number(value));
                      const muestraSugerido =
                        panelesOk && sugerido > 0 && valActual !== sugerido;
                      return (
                        <div key={cat}>
                          <label className="block text-sm text-stone-700 mb-1">
                            {labelAccesorio(cat)}
                            {prod ? null : (
                              <span className="text-amber-700 text-xs ml-1">
                                (no existe en inventario)
                              </span>
                            )}
                          </label>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step={1}
                            value={value}
                            onChange={(e) => setAccesorio(cat, e.target.value)}
                            disabled={guardando || !prod}
                            className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm font-mono tabular-nums focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900 disabled:bg-stone-50"
                            placeholder="0"
                          />
                          {muestraSugerido && (
                            <div className="text-[11px] text-stone-400 mt-0.5">
                              Sugerido: {sugerido}
                            </div>
                          )}
                          {prod && (
                            <div className="text-[11px] text-stone-400 mt-0.5">
                              Stock disponible: {prod.stock_total}
                            </div>
                          )}
                        </div>
                      );
                    },
                  )}
                </div>

                {/* Otros productos del catálogo (si hay) */}
                {productosByCat.otros.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-stone-100">
                    {productosByCat.otros.map((p) => (
                      <div key={p.id}>
                        <label className="block text-sm text-stone-700 mb-1">
                          {p.nombre}
                        </label>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={1}
                          value={otrosCant[p.id] ?? ""}
                          onChange={(e) =>
                            setOtrosCant((prev) => ({
                              ...prev,
                              [p.id]: e.target.value.replace(/[^0-9]/g, ""),
                            }))
                          }
                          disabled={guardando}
                          className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm font-mono tabular-nums focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900 disabled:bg-stone-50"
                          placeholder="0"
                        />
                        <div className="text-[11px] text-stone-400 mt-0.5">
                          Stock disponible: {p.stock_total}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Warnings stock */}
              {warningsStock.length > 0 && (
                <div className="rounded-md border border-orange-200 bg-orange-50 p-3 text-xs text-orange-900">
                  ⚠ Algunas cantidades superan el stock disponible:{" "}
                  {warningsStock
                    .map(
                      (w) => `${w.nombre} (pedido ${w.pedido}, disp. ${w.disponible})`,
                    )
                    .join(", ")}
                  . Podés guardar igual; el stock quedará negativo hasta la
                  próxima compra.
                </div>
              )}

              {/* Resumen */}
              <section className="rounded-md border border-stone-200 bg-stone-50/50 p-3 space-y-1">
                <div className="text-[11px] uppercase tracking-wider text-stone-500">
                  Resumen
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-stone-700">Total entrega</span>
                  <span className="font-mono tabular-nums font-semibold text-stone-900">
                    {formatearMonto(totalEntrega)}
                  </span>
                </div>
                {marcaSel && totalEntrega > 0 && (
                  <div className="text-xs text-stone-600 pt-1 border-t border-stone-200">
                    {esInterna ? (
                      <div className="flex justify-between">
                        <span>{marcaSel.nombre} absorbe 100%</span>
                        <span className="font-mono tabular-nums">
                          {formatearMonto(totalEntrega)}
                        </span>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between">
                          <span>{marcaSel.nombre} paga</span>
                          <span className="font-mono tabular-nums">
                            {formatearMonto(repartoMarca)}
                          </span>
                        </div>
                        {empresaStyle && (
                          <div className="flex justify-between">
                            <span>{empresaStyle.nombre} paga</span>
                            <span className="font-mono tabular-nums">
                              {formatearMonto(repartoEmpresa)}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </section>
            </>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            {initial ? (
              <button
                type="button"
                onClick={handleEliminar}
                disabled={guardando}
                className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
              >
                Eliminar entrega
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={guardando}
                className="rounded-md border border-stone-300 bg-white text-stone-700 px-3 py-2 text-sm hover:bg-stone-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGuardar}
                disabled={!puedeGuardar}
                className="rounded-md bg-stone-900 text-white px-4 py-2 text-sm font-medium active:scale-[0.97] transition disabled:opacity-50"
                title={
                  !marcaOk
                    ? "Selecciona una marca"
                    : !panelesOk
                      ? "Indica al menos 1 panel"
                      : !tieneAlMenosUno
                        ? "Agrega al menos una cantidad"
                        : undefined
                }
              >
                {guardando
                  ? "Guardando…"
                  : initial
                    ? "Guardar cambios"
                    : "Registrar entrega"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
