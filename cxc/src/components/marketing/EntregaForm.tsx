"use client";

// Form modal para crear/editar una entrega de muebles.
//
// Registro de gastos (jun 2026): se retiró el reparto 50/50 marca↔empresa
// interna (FW/Vistana). Ahora cada entrega lleva 1 o varias MARCAS con % entre
// ellas (suma 100; 1 marca = 100%) y el total del kit se reparte por esos %.
//
// Flow:
//   1) Nombre de la entrega (opcional) + marca(s) con %.
//   2) Input destacado "Cantidad de paneles" (driver del kit).
//   3) Bloque "Accesorios": tablas, conjunto, norte, barra. Al escribir paneles
//      se autorrellenan según la curva sugerida (3/3/1/3). Editables a mano.
//   4) Resumen en vivo: total $ + desglose por marca (al 100%, por %).
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import type {
  EntregaConItems,
  MarcaConPorcentaje,
  MkInventarioProducto,
  MkMarca,
} from "@/lib/marketing/types";
import { useToast } from "@/components/ToastSystem";
import { formatearMonto } from "@/lib/marketing/normalizar";
import { useFormModalDismiss } from "@/lib/hooks/useModalDismiss";

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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface MarcaSel {
  marcaId: string;
  porcentajeStr: string;
}

// Reparte 100% en partes parejas entre las marcas (la última absorbe el resto).
function repartirParejo(ids: ReadonlyArray<string>): MarcaSel[] {
  const n = ids.length;
  if (n === 0) return [];
  const base = Math.floor((100 / n) * 100) / 100;
  return ids.map((id, i) => ({
    marcaId: id,
    porcentajeStr: String(
      i === n - 1 ? round2(100 - base * (n - 1)) : base,
    ),
  }));
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
  // Mostramos SIEMPRE el catálogo completo de marcas (igual que el selector de
  // facturas). Antes se restringía a las marcas asignadas al proyecto, lo que
  // dejaba el selector con una sola marca si el proyecto tenía una sola asignada.
  const [catalogoMarcas, setCatalogoMarcas] = useState<MkMarca[]>([]);
  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  const marcasOpciones: MkMarca[] = useMemo(() => {
    // El catálogo completo es la fuente. marcasProyecto solo sirve de respaldo
    // mientras el catálogo termina de cargar (evita un parpadeo vacío).
    if (catalogoMarcas.length > 0) return catalogoMarcas;
    return marcasProyecto.map((m) => m.marca);
  }, [catalogoMarcas, marcasProyecto]);

  const marcaById = useMemo(
    () => new Map(marcasOpciones.map((m) => [m.id, m])),
    [marcasOpciones],
  );

  // ---- Estado del form ----
  const [nombre, setNombre] = useState<string>("");
  const [marcasSel, setMarcasSel] = useState<MarcaSel[]>([]);
  const [panelesStr, setPanelesStr] = useState<string>("");
  const [accesorios, setAccesorios] = useState<Record<Categoria, string>>({
    paneles: "",
    tablas: "",
    conjunto: "",
    norte: "",
    barra: "",
    otros: "",
  });
  const [tocadoManual, setTocadoManual] = useState<Record<Categoria, boolean>>({
    paneles: false,
    tablas: false,
    conjunto: false,
    norte: false,
    barra: false,
    otros: false,
  });
  const [otrosCant, setOtrosCant] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  // La "foto" de los campos para el cierre por clic fuera solo puede tomarse
  // DESPUÉS de hidratar el form; si no, la hidratación se vería como si el
  // usuario hubiera escrito y el modal nunca cerraría.
  const [hidratado, setHidratado] = useState(false);

  // ---- Hidratar al abrir / cuando cambia initial ----
  useEffect(() => {
    if (!open) {
      setHidratado(false);
      return;
    }
    if (initial) {
      const productoNombreById = new Map(
        productos.map((p) => [p.id, p.nombre]),
      );
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
        const nombreProd = productoNombreById.get(it.producto_id) ?? "";
        const cat = categorizarProducto(nombreProd);
        let totalItem = 0;
        for (const r of it.reparto ?? []) {
          totalItem += Number(r.cantidad ?? 0);
        }
        if (cat === "otros") {
          otros[it.producto_id] = String(totalItem);
        } else {
          cantsByCat[cat] += totalItem;
        }
      }
      // Reconstruir marcas con % desde las proporciones de total_por_marca,
      // normalizadas a 100. (En entregas viejas 50/50 ambas marcas eran
      // externas con el mismo factor, así que la proporción de total_por_marca
      // ya refleja el % real entre marcas.)
      const montos = Object.entries(initial.total_por_marca ?? {}).map(
        ([marcaId, v]) => ({ marcaId, monto: Number(v) || 0 }),
      );
      let marcasIni: MarcaSel[];
      if (montos.length === 0) {
        marcasIni = [];
      } else if (montos.length === 1) {
        marcasIni = [{ marcaId: montos[0].marcaId, porcentajeStr: "100" }];
      } else {
        const sum = montos.reduce((s, m) => s + m.monto, 0) || 1;
        let acum = 0;
        marcasIni = montos.map((m, i) => {
          const pct =
            i === montos.length - 1
              ? round2(100 - acum)
              : round2((m.monto / sum) * 100);
          acum = round2(acum + pct);
          return { marcaId: m.marcaId, porcentajeStr: String(pct) };
        });
      }

      setNombre(initial.notas ?? "");
      setMarcasSel(marcasIni);
      setPanelesStr(cantsByCat.paneles > 0 ? String(cantsByCat.paneles) : "");
      setAccesorios({
        paneles: cantsByCat.paneles > 0 ? String(cantsByCat.paneles) : "",
        tablas: cantsByCat.tablas > 0 ? String(cantsByCat.tablas) : "",
        conjunto: cantsByCat.conjunto > 0 ? String(cantsByCat.conjunto) : "",
        norte: cantsByCat.norte > 0 ? String(cantsByCat.norte) : "",
        barra: cantsByCat.barra > 0 ? String(cantsByCat.barra) : "",
        otros: "",
      });
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
      setNombre("");
      setMarcasSel([]);
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
    setHidratado(true);
  }, [open, initial, productos]);

  // ---- Auto-fill al cambiar paneles ----
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

  // ---- Cierre por clic fuera + Escape ----
  // El form es largo (nombre, marcas, paneles, accesorios): solo cierra si el
  // usuario no ha tocado nada. Si ya escribió, se sale con Cancelar/Cerrar.
  // Va después de los efectos de hidratación para que la foto se tome sobre
  // los valores ya hidratados. Antes del return condicional (reglas de hooks).
  const { panelRef, backdrop } = useFormModalDismiss(
    open && hidratado,
    onClose,
    !guardando,
  );

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

  const productoDe = (c: Categoria): MkInventarioProducto | null =>
    productosByCat[c][0] ?? null;

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
    return round2(t);
  }, [filasParaResumen]);

  // Desglose por marca (por %). La última marca absorbe el redondeo.
  const sumPctSel = useMemo(
    () => marcasSel.reduce((s, m) => s + (Number(m.porcentajeStr) || 0), 0),
    [marcasSel],
  );
  const desgloseMarcas = useMemo(() => {
    const sum = sumPctSel || 1;
    let acum = 0;
    return marcasSel.map((m, i) => {
      const pct = Number(m.porcentajeStr) || 0;
      const monto =
        i === marcasSel.length - 1
          ? round2(totalEntrega - acum)
          : round2(totalEntrega * (pct / sum));
      acum = round2(acum + monto);
      return { marcaId: m.marcaId, monto };
    });
  }, [marcasSel, totalEntrega, sumPctSel]);

  // ---- Handlers ----
  const setAccesorio = (cat: Categoria, value: string) => {
    const clean = value.replace(/[^0-9]/g, "");
    setAccesorios((prev) => ({ ...prev, [cat]: clean }));
    if (cat !== "paneles") {
      setTocadoManual((prev) => ({ ...prev, [cat]: true }));
    }
  };

  const setPaneles = (value: string) => {
    setPanelesStr(value.replace(/[^0-9]/g, ""));
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

  const hayManualEditado = useMemo(() => {
    return (["tablas", "conjunto", "norte", "barra"] as Categoria[]).some(
      (c) => tocadoManual[c],
    );
  }, [tocadoManual]);

  const sugeridoDe = (cat: Categoria): number => {
    const n = trunc(Number(panelesStr));
    if (n <= 0) return 0;
    return n * (CURVA[cat] ?? 0);
  };

  // Marca toggle: agrega/quita y reparte el % parejo entre las seleccionadas.
  const toggleMarca = (id: string) => {
    setMarcasSel((prev) => {
      const exists = prev.some((m) => m.marcaId === id);
      const nextIds = exists
        ? prev.filter((m) => m.marcaId !== id).map((m) => m.marcaId)
        : [...prev.map((m) => m.marcaId), id];
      return repartirParejo(nextIds);
    });
  };

  const setMarcaPct = (id: string, value: string) => {
    const clean = value.replace(/[^0-9.]/g, "");
    setMarcasSel((prev) =>
      prev.map((m) => (m.marcaId === id ? { ...m, porcentajeStr: clean } : m)),
    );
  };

  // ---- Validación ----
  const tieneAlMenosUno = filasParaResumen.length > 0;
  const panelesOk = trunc(Number(panelesStr)) >= 1;
  const marcasOk =
    marcasSel.length >= 1 &&
    marcasSel.every((m) => (Number(m.porcentajeStr) || 0) > 0) &&
    Math.abs(sumPctSel - 100) < 0.01;
  const puedeGuardar = panelesOk && marcasOk && tieneAlMenosUno && !guardando;

  // Warnings de stock por producto (no bloqueantes).
  const warningsStock = useMemo(() => {
    const out: Array<{ nombre: string; pedido: number; disponible: number }> = [];
    for (const f of filasParaResumen) {
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
      const items = filasParaResumen.map((f) => ({
        productoId: f.producto.id,
        cantidad: f.cant,
      }));
      const marcas = marcasSel.map((m) => ({
        marcaId: m.marcaId,
        porcentaje: Number(m.porcentajeStr) || 0,
      }));

      const url = initial
        ? `/api/marketing/inventario/entregas/${initial.id}`
        : "/api/marketing/inventario/entregas";
      const method = initial ? "PATCH" : "POST";
      const body = initial
        ? { items, marcas, notas: nombre.trim() || null }
        : { proyectoId, items, marcas, notas: nombre.trim() || null };
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

  const multiMarca = marcasSel.length > 1;

  // ---- Render ----
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" {...backdrop} />
      <div
        ref={panelRef}
        className="relative bg-white sm:rounded-lg rounded-t-2xl max-w-2xl w-full mx-0 sm:mx-4 border border-gray-200 max-h-[95vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900">
              {initial ? "Editar entrega" : "Nueva entrega de muebles"}
            </h3>
            <p className="text-xs text-gray-500 truncate">{proyectoNombre}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            className="text-sm text-gray-500 hover:text-black transition disabled:opacity-50"
          >
            Cerrar
          </button>
        </div>

        <div className="p-6 space-y-6">
          {productos.length === 0 ? (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
              No hay productos en el inventario. Agrega productos primero en{" "}
              <span className="underline">/marketing/mobiliario</span>.
            </div>
          ) : marcasOpciones.length === 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              No hay marcas en el catálogo. Crea marcas en Marketing antes de
              registrar la entrega.
            </div>
          ) : (
            <>
              {/* Nombre de la entrega */}
              <section className="space-y-2">
                <label
                  htmlFor="entrega-nombre"
                  className="block text-sm font-medium text-gray-800"
                >
                  Nombre de la entrega{" "}
                  <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <input
                  id="entrega-nombre"
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  disabled={guardando}
                  maxLength={120}
                  placeholder="Ej: Reposición vitrina, kit local nuevo…"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50"
                />
              </section>

              {/* Paso 1: Marca(s) con % */}
              <section className="space-y-2">
                <label className="block text-sm font-medium text-gray-800">
                  ¿A qué marca(s) pertenece esta entrega?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {marcasOpciones.map((m) => {
                    const seleccionada = marcasSel.some(
                      (s) => s.marcaId === m.id,
                    );
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleMarca(m.id)}
                        disabled={guardando}
                        className={`text-left rounded-lg border-2 px-4 py-3 transition ${
                          seleccionada
                            ? "border-gray-900 bg-gray-50"
                            : "border-gray-200 bg-white hover:border-gray-400"
                        } disabled:opacity-50`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-gray-900">
                            {m.nombre}
                          </span>
                          {seleccionada && (
                            <span className="text-gray-900 text-xs">✓</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* % por marca cuando hay más de una */}
                {multiMarca && (
                  <div className="rounded-md border border-gray-200 bg-gray-50/50 p-3 space-y-2">
                    <div className="text-xs uppercase tracking-wide text-gray-500">
                      Porcentaje por marca (debe sumar 100%)
                    </div>
                    {marcasSel.map((m) => (
                      <div
                        key={m.marcaId}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="text-sm text-gray-700">
                          {marcaById.get(m.marcaId)?.nombre ?? "Marca"}
                        </span>
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={m.porcentajeStr}
                            onChange={(e) =>
                              setMarcaPct(m.marcaId, e.target.value)
                            }
                            disabled={guardando}
                            className="w-20 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-right font-mono tabular-nums focus:border-gray-900 focus:outline-none disabled:bg-gray-50"
                          />
                          <span className="text-sm text-gray-500">%</span>
                        </div>
                      </div>
                    ))}
                    <div
                      className={`text-xs text-right tabular-nums ${
                        Math.abs(sumPctSel - 100) < 0.01
                          ? "text-gray-500"
                          : "text-red-600 font-medium"
                      }`}
                    >
                      Suma: {round2(sumPctSel)}%
                    </div>
                  </div>
                )}
              </section>

              {/* Paso 2: Paneles destacado */}
              <section className="space-y-2">
                <label
                  htmlFor="entrega-paneles"
                  className="block text-base font-semibold text-gray-900"
                >
                  Cantidad de paneles
                </label>
                <p className="text-xs text-gray-500">
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
                  className="w-full rounded-md border border-gray-300 px-3 py-3 text-lg font-mono tabular-nums focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50"
                  placeholder="0"
                />
                {hayManualEditado && panelesOk && (
                  <button
                    type="button"
                    onClick={recalcularCurva}
                    className="text-xs text-gray-600 hover:text-black underline"
                  >
                    Recalcular accesorios según curva
                  </button>
                )}
              </section>

              {/* Paso 3: Accesorios */}
              <section className="space-y-2">
                <h4 className="text-sm font-medium text-gray-800">
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
                          <label className="block text-sm text-gray-700 mb-1">
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
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono tabular-nums focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50"
                            placeholder="0"
                          />
                          {muestraSugerido && (
                            <div className="text-xs text-gray-400 mt-0.5">
                              Sugerido: {sugerido}
                            </div>
                          )}
                          {prod && (
                            <div className="text-xs text-gray-400 mt-0.5">
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                    {productosByCat.otros.map((p) => (
                      <div key={p.id}>
                        <label className="block text-sm text-gray-700 mb-1">
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
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono tabular-nums focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50"
                          placeholder="0"
                        />
                        <div className="text-xs text-gray-400 mt-0.5">
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
              <section className="rounded-md border border-gray-200 bg-gray-50/50 p-3 space-y-1">
                <div className="text-xs uppercase tracking-wide text-gray-500">
                  Resumen
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-700">Total entrega</span>
                  <span className="font-mono tabular-nums font-semibold text-gray-900">
                    {formatearMonto(totalEntrega)}
                  </span>
                </div>
                {marcasSel.length > 0 && totalEntrega > 0 && (
                  <div className="text-xs text-gray-600 pt-1 border-t border-gray-200 space-y-0.5">
                    {desgloseMarcas.map((d) => (
                      <div key={d.marcaId} className="flex justify-between">
                        <span>{marcaById.get(d.marcaId)?.nombre ?? "Marca"}</span>
                        <span className="font-mono tabular-nums">
                          {formatearMonto(d.monto)}
                        </span>
                      </div>
                    ))}
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
                className="rounded-md border border-gray-300 bg-white text-gray-700 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGuardar}
                disabled={!puedeGuardar}
                className="rounded-md bg-gray-900 text-white px-4 py-2 text-sm font-medium active:scale-[0.97] transition disabled:opacity-50"
                title={
                  !marcasOk
                    ? "Selecciona marca(s) y que el % sume 100"
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
