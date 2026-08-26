"use client";

// Form modal para crear/editar una entrega de muebles.
//
// Registro de gastos (jun 2026): se retiró el reparto 50/50 marca↔empresa
// interna (FW/Vistana). Ahora cada entrega lleva 1 o varias MARCAS con % entre
// ellas (suma 100; 1 marca = 100%) y el total del kit se reparte por esos %.
//
// Flow:
//   1) Nombre de la entrega (opcional) + marca(s) con %.
//   2) Input destacado "Cantidad de paneles". ⛔ NO ES OBLIGATORIO desde el
//      23-ago-2026 (Daniel: *"no tengo. No debe de ser obligatorio, no tiene
//      sentido"*). Era el resto del kit auto-rellenable, donde paneles era el
//      driver de la curva; la curva se fue el 12-ago y el requisito quedó
//      huérfano. Está destacado porque es lo que más se manda, no porque haga
//      falta. Lo que SÍ frena: la entrega necesita al menos un producto con
//      cantidad (ver "Validación").
//   3) Bloque "Accesorios": tablas, conjunto, norte, barra. 100% MANUALES.
//      ⛔ El AUTORRELLENO por curva (3/3/1/3) SE ELIMINÓ (Daniel, 12-ago-2026)
//      y no debe volver: los kits reales no siguen la curva y el autofill
//      metía cantidades que nadie escribió. Candado en
//      src/__tests__/lib/poda-textos-ayuda.test.ts (sección EntregaForm).
//   4) Resumen en vivo: total $ + desglose por marca (al 100%, por %).
//   5) Al GUARDAR una entrega nueva: pantalla de éxito con la NOTA DE ENVÍO
//      (Compartir / Imprimir) — Daniel: *"me tiene que dar una entrega de
//      envío de eso, para saber que se fue"*.
//
// 🔴 CADA RENGLÓN LLEVA DOS NÚMEROS: **PIEZAS** y **BULTOS**.
//   Las piezas son la mercancía y son lo ÚNICO que descuenta el inventario.
//   Los bultos son en cuántas cajas/atados viajó ese renglón, y son sólo
//   información para la nota de entrega. Daniel, textual: *"puedo mandar 30
//   norte colgador en 1 bulto. o 20 norte colgador en un bulto"* — o sea que
//   el bulto es VARIABLE y NO hay conversión fija. Nunca escribir acá una
//   cuenta que pase de uno al otro. La regla vive en
//   `src/lib/marketing/piezas-bultos.ts`.
//   Los bultos son OPCIONALES: en blanco = "no se anotó", nunca 0.
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
import NotaEntregaAcciones from "@/components/marketing/NotaEntregaAcciones";
import {
  bultosParaInput,
  normalizarBultos,
  textoPiezasBultos,
} from "@/lib/marketing/piezas-bultos";

interface Props {
  open: boolean;
  /**
   * `null` = entrega sin cliente. Desde "Registrar gasto" un gasto puede no
   * tener proyecto —Daniel sacó ese paso— y la fila se guarda con
   * `proyecto_id = null`, igual que ya viven los pagos de impulsadora.
   */
  proyectoId: string | null;
  proyectoNombre: string;
  marcasProyecto: MarcaConPorcentaje[];
  productos: MkInventarioProducto[];
  initial?: EntregaConItems | null;
  onClose: () => void;
  onSaved: () => void;
}

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

/**
 * La marca INICIAL de una entrega nueva sale de las marcas que trae el caller
 * (`marcasProyecto`): viniendo de "Registrar gasto" la marca ya se eligió en
 * la puerta y preguntarla de nuevo era preguntar dos veces (pedido de Daniel,
 * 12-ago-2026). El multi-select se conserva: esto solo PRESELECCIONA — quien
 * entra por otro camino, o quiere cambiarla, toca las marcas como siempre.
 * Los % se normalizan a 100 (la validación del form lo exige).
 */
function marcasInicialesDesdeProyecto(
  marcasProyecto: ReadonlyArray<MarcaConPorcentaje>,
): MarcaSel[] {
  const uniq: MarcaConPorcentaje[] = [];
  const vistos = new Set<string>();
  for (const m of marcasProyecto) {
    if (!m.marca?.id || vistos.has(m.marca.id)) continue;
    vistos.add(m.marca.id);
    uniq.push(m);
  }
  if (uniq.length === 0) return [];
  if (uniq.length === 1) {
    return [{ marcaId: uniq[0].marca.id, porcentajeStr: "100" }];
  }
  const sum = uniq.reduce((s, m) => s + (Number(m.porcentaje) || 0), 0);
  if (!(sum > 0)) return repartirParejo(uniq.map((m) => m.marca.id));
  let acum = 0;
  return uniq.map((m, i) => {
    const pct =
      i === uniq.length - 1
        ? round2(100 - acum)
        : round2(((Number(m.porcentaje) || 0) / sum) * 100);
    acum = round2(acum + pct);
    return { marcaId: m.marca.id, porcentajeStr: String(pct) };
  });
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
  // BULTOS por categoría y por producto "otros". Vacío = no se anotó.
  const [bultosCat, setBultosCat] = useState<Record<Categoria, string>>({
    paneles: "",
    tablas: "",
    conjunto: "",
    norte: "",
    barra: "",
    otros: "",
  });
  const [otrosCant, setOtrosCant] = useState<Record<string, string>>({});
  const [otrosBultos, setOtrosBultos] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  // Entrega NUEVA ya guardada → pantalla de éxito con la nota de envío.
  // Daniel: *"me tiene que dar una entrega de envío de eso, para saber que
  // se fue"*. Solo aplica al crear; editar sigue cerrando con su toast.
  const [guardadaId, setGuardadaId] = useState<string | null>(null);
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
      // Bultos: se acumulan igual que las piezas, pero POR SEPARADO. `null`
      // (no anotado) queda como cadena vacía, no como 0.
      const bultosByCat: Record<Categoria, number | null> = {
        paneles: null,
        tablas: null,
        conjunto: null,
        norte: null,
        barra: null,
        otros: null,
      };
      const otrosB: Record<string, string> = {};
      for (const it of initial.items ?? []) {
        const nombreProd = productoNombreById.get(it.producto_id) ?? "";
        const cat = categorizarProducto(nombreProd);
        let totalItem = 0;
        for (const r of it.reparto ?? []) {
          totalItem += Number(r.cantidad ?? 0);
        }
        const b = normalizarBultos(it.bultos);
        if (cat === "otros") {
          otros[it.producto_id] = String(totalItem);
          if (b !== null) otrosB[it.producto_id] = String(b);
        } else {
          cantsByCat[cat] += totalItem;
          if (b !== null) bultosByCat[cat] = (bultosByCat[cat] ?? 0) + b;
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
      setBultosCat({
        paneles: bultosParaInput(bultosByCat.paneles),
        tablas: bultosParaInput(bultosByCat.tablas),
        conjunto: bultosParaInput(bultosByCat.conjunto),
        norte: bultosParaInput(bultosByCat.norte),
        barra: bultosParaInput(bultosByCat.barra),
        otros: "",
      });
      setOtrosCant(otros);
      setOtrosBultos(otrosB);
    } else {
      setNombre("");
      // Entrega NUEVA: la marca se HEREDA del caller (viniendo de "Registrar
      // gasto" ya se eligió en la puerta — no se pregunta dos veces).
      setMarcasSel(marcasInicialesDesdeProyecto(marcasProyecto));
      setPanelesStr("");
      setAccesorios({
        paneles: "",
        tablas: "",
        conjunto: "",
        norte: "",
        barra: "",
        otros: "",
      });
      setBultosCat({
        paneles: "",
        tablas: "",
        conjunto: "",
        norte: "",
        barra: "",
        otros: "",
      });
      setOtrosCant({});
      setOtrosBultos({});
    }
    setGuardadaId(null);
    setHidratado(true);
    // ⚠️ `marcasProyecto` queda FUERA de las deps a propósito: los callers la
    // arman inline (`[{ marca, porcentaje: 100 }]`), así que es una referencia
    // nueva en cada render — meterla acá re-hidrataría el formulario en cada
    // render y pisaría lo que el usuario está escribiendo. Solo se usa al
    // (re)abrir, que es cuando este efecto corre por `open`/`initial`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial, productos]);

  // Con la entrega ya guardada, CUALQUIER salida (Cerrar, Escape, Listo) tiene
  // que avisarle al caller que hubo cambios — si no, la lista no se refresca.
  const cerrarModal = guardadaId ? onSaved : onClose;

  // ---- Cierre por clic fuera + Escape ----
  // El form es largo (nombre, marcas, paneles, accesorios): solo cierra si el
  // usuario no ha tocado nada. Si ya escribió, se sale con Cancelar/Cerrar.
  // Va después de los efectos de hidratación para que la foto se tome sobre
  // los valores ya hidratados. Antes del return condicional (reglas de hooks).
  const { panelRef, backdrop } = useFormModalDismiss(
    open && hidratado,
    cerrarModal,
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
  // `cant` son PIEZAS (lo que descuenta el stock) y `bultos` es transporte.
  // Van en el mismo objeto pero no se tocan entre sí en ningún cálculo.
  const filasParaResumen = useMemo(() => {
    const filas: Array<{
      producto: MkInventarioProducto;
      cant: number;
      bultos: number | null;
    }> = [];
    const cats: Categoria[] = ["paneles", "tablas", "conjunto", "norte", "barra"];
    for (const c of cats) {
      const prod = productoDe(c);
      const cant = trunc(Number(accesorios[c]));
      if (prod && cant > 0) {
        filas.push({ producto: prod, cant, bultos: normalizarBultos(bultosCat[c]) });
      }
    }
    for (const p of productosByCat.otros) {
      const cant = trunc(Number(otrosCant[p.id] ?? 0));
      if (cant > 0) {
        filas.push({
          producto: p,
          cant,
          bultos: normalizarBultos(otrosBultos[p.id]),
        });
      }
    }
    return filas;
  }, [accesorios, bultosCat, otrosCant, otrosBultos, productosByCat]);

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
  // ⛔ SIN AUTORRELLENO: cada campo es lo que la persona escribió, nada más.
  const setAccesorio = (cat: Categoria, value: string) => {
    const clean = value.replace(/[^0-9]/g, "");
    setAccesorios((prev) => ({ ...prev, [cat]: clean }));
  };

  // Paneles vive en su propio input destacado, pero sus PIEZAS cuentan igual
  // que las de cualquier accesorio: se espejan en `accesorios.paneles`, que es
  // lo que lee el resumen y lo que se guarda.
  const setPaneles = (value: string) => {
    const clean = value.replace(/[^0-9]/g, "");
    setPanelesStr(clean);
    setAccesorios((prev) => ({ ...prev, paneles: clean }));
  };

  // Bultos: sólo dígitos. Dejarlo vacío es válido y significa "no se anotó".
  // 🔴 No dispara NINGÚN autorrelleno de piezas: no hay conversión.
  const setBultos = (cat: Categoria, value: string) => {
    setBultosCat((prev) => ({ ...prev, [cat]: value.replace(/[^0-9]/g, "") }));
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
  //
  // ⛔ PANELES NO ES OBLIGATORIO (23-ago-2026). Daniel, textual: *"me sale
  //   obligatorio poner paneles. Pero no tengo. No debe de ser obligatorio, no
  //   tiene sentido"*. El `panelesOk` que estaba acá NO protegía nada: nació
  //   en el commit del KIT AUTO-RELLENABLE (bb6be309, may-2026), donde paneles
  //   era el DRIVER de la curva 3/3/1/3 — sin paneles no había con qué llenar
  //   el resto y el form entero se quedaba en blanco. **Esa curva se eliminó
  //   el 12-ago-2026** (los accesorios pasaron a 100% manuales) y el freno
  //   quedó huérfano, exigiendo un número para un mecanismo que ya no existe.
  //   Se ve en los datos: las 23 entregas que hay traen la firma de la curva
  //   (paneles=N, tablas=3N, conjunto=3N, norte=N, barra=3N) — o sea que el
  //   "todas llevan paneles" era la huella del autorrelleno, no una regla del
  //   negocio. Una entrega de puras barras y colgadores es un envío real.
  //
  // 🔴 EL FRENO CORRECTO ES OTRO, Y SE QUEDA: una entrega tiene que llevar AL
  //   MENOS UN PRODUCTO con cantidad. Sin eso quedaría guardada una entrega de
  //   cero piezas —papel, total en $0 y nada que descontar—, que es basura.
  //   `tieneAlMenosUno` ya lo hacía y ahora es el único freno de mercancía;
  //   el servidor lo repite por su cuenta ("La entrega debe tener al menos un
  //   item con cantidad" en `inventario.ts`), así que la puerta está cerrada
  //   de los dos lados.
  const tieneAlMenosUno = filasParaResumen.length > 0;
  const marcasOk =
    marcasSel.length >= 1 &&
    marcasSel.every((m) => (Number(m.porcentajeStr) || 0) > 0) &&
    Math.abs(sumPctSel - 100) < 0.01;
  const puedeGuardar = marcasOk && tieneAlMenosUno && !guardando;

  // 🩸 Lo que falta, dicho con todas las letras. Antes el botón se apagaba y la
  // única explicación era un `title=` — un globito del mouse que en el iPhone
  // NO EXISTE. Mandar sólo barras y colgadores es un envío real, así que el
  // usuario se quedaba con un botón gris y sin idea de por qué. Mismo patrón
  // que MetaFormModal y que Guías: "Falta: …".
  const falta = useMemo(() => {
    const f: string[] = [];
    if (marcasSel.length === 0) f.push("al menos una marca");
    else if (!marcasOk) f.push("que el % de las marcas sume 100");
    if (!tieneAlMenosUno) f.push("al menos un producto con cantidad");
    return f;
  }, [marcasOk, marcasSel.length, tieneAlMenosUno]);

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
        // `cantidad` son PIEZAS — el servidor descuenta esto y nada más.
        cantidad: f.cant,
        bultos: f.bultos,
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
        : { proyectoId: proyectoId ?? null, items, marcas, notas: nombre.trim() || null };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo guardar la entrega");
      }
      if (initial) {
        toast("Entrega actualizada", "success");
        onSaved();
      } else {
        // Entrega NUEVA: en vez de cerrar, la pantalla de éxito ofrece la
        // nota de envío (Compartir / Imprimir) ahí mismo. El POST devuelve la
        // entrega creada; sin id no hay nota que ofrecer y se cierra como
        // antes — la plata ya quedó guardada, eso nunca se pierde.
        const creada = (await res.json().catch(() => null)) as
          | { id?: string }
          | null;
        if (creada?.id) {
          setGuardadaId(String(creada.id));
        } else {
          toast("Entrega registrada", "success");
          onSaved();
        }
      }
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
    /* Sin slide-up y centrado en todos los anchos: regla de la casa. */
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/40" {...backdrop} />
      <div
        ref={panelRef}
        className="relative bg-white rounded-lg max-w-2xl w-full border border-gray-200 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900">
              {guardadaId
                ? "Entrega registrada"
                : initial
                  ? "Editar entrega"
                  : "Nueva entrega de muebles"}
            </h3>
            <p className="text-xs text-gray-500 truncate">{proyectoNombre}</p>
          </div>
          <button
            type="button"
            onClick={cerrarModal}
            disabled={guardando}
            className="text-sm text-gray-500 hover:text-black transition disabled:opacity-50 min-h-[44px] px-1"
          >
            Cerrar
          </button>
        </div>

        {guardadaId ? (
          /* ---- ÉXITO: la nota de envío, alcanzable EN EL MOMENTO ----
             Daniel: *"me tiene que dar una entrega de envío de eso, para
             saber que se fue"*. Antes: toast y se cerraba — la nota de una
             entrega sin proyecto quedaba inalcanzable. Los botones son el
             MISMO componente de la ficha (NotaEntregaAcciones). */
          <div className="p-6 space-y-5">
            <div className="flex flex-col items-center text-center gap-2 py-2">
              <div
                className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center"
                aria-hidden="true"
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div className="text-base font-semibold text-gray-900">
                Entrega registrada
              </div>
              <p className="text-sm text-gray-600 max-w-sm">
                El inventario ya se descontó. Comparte o imprime la nota de
                envío — es el papel que viaja con la mercancía, para que quede
                constancia de que se fue.
              </p>
            </div>
            <div className="flex justify-center">
              <NotaEntregaAcciones entregaId={guardadaId} />
            </div>
            <div className="flex justify-end pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={onSaved}
                className="rounded-md bg-gray-900 text-white px-4 min-h-[44px] text-sm font-medium active:scale-[0.97] transition"
              >
                Listo
              </button>
            </div>
          </div>
        ) : (
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
                  className="w-full rounded-md border border-gray-300 px-3 min-h-[44px] text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50"
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
                            className="w-20 rounded-md border border-gray-300 px-2 min-h-[44px] text-sm text-right font-mono tabular-nums focus:border-gray-900 focus:outline-none disabled:bg-gray-50"
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

              {/* Paso 2: Paneles destacado. ⛔ Sin curva, sin autorrelleno:
                  el ⓘ "Cómo se llena el kit" se fue CON la funcionalidad que
                  explicaba (Daniel, 12-ago-2026) — no es una poda de texto. */}
              <section className="space-y-2">
                <label
                  htmlFor="entrega-paneles"
                  className="block text-base font-semibold text-gray-900"
                >
                  Cantidad de paneles
                </label>
                {/* ⛔ ACÁ DECÍA "* Obligatorio — sin paneles no se puede
                    registrar la entrega", y se fue el 23-ago-2026 con la regla
                    que anunciaba (Daniel: *"no tengo. No debe de ser
                    obligatorio, no tiene sentido"*). No es una poda de texto:
                    el texto era CIERTO mientras el freno existía. Se borra
                    porque el freno se borró — un aviso que sobrevive a su
                    regla es una mentira en pantalla. Lo que frena hoy —que la
                    entrega lleve al menos un producto— sigue dicho con todas
                    las letras abajo, en el "Falta: …" del botón.
                    Paneles se queda destacado y primero: es lo que más se
                    manda, sólo que ya no es un requisito. */}
                {/* Piezas (grande, es lo que más se entrega) + bultos (chico,
                    es sólo cómo viajó). El bulto NUNCA modifica las piezas. */}
                <div className="flex items-end gap-2">
                  <div className="flex-1 min-w-0">
                    <input
                      id="entrega-paneles"
                      type="number"
                      inputMode="numeric"
                      /* min 0: dejarlo en blanco o en cero es una entrega
                         sin paneles, que ahora es válida. */
                      min={0}
                      step={1}
                      value={panelesStr}
                      onChange={(e) => setPaneles(e.target.value)}
                      disabled={guardando}
                      className="w-full rounded-md border border-gray-300 px-3 py-3 text-lg font-mono tabular-nums focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50"
                      placeholder="0"
                    />
                    <div className="text-xs text-gray-400 mt-0.5">Piezas</div>
                  </div>
                  <div className="w-24 shrink-0">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={bultosCat.paneles}
                      onChange={(e) => setBultos("paneles", e.target.value)}
                      disabled={guardando}
                      aria-label="Bultos de paneles"
                      className="w-full rounded-md border border-gray-300 px-3 py-3 text-lg font-mono tabular-nums focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50"
                      placeholder="—"
                    />
                    <div className="text-xs text-gray-400 mt-0.5">Bultos</div>
                  </div>
                </div>
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
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              step={1}
                              value={value}
                              onChange={(e) => setAccesorio(cat, e.target.value)}
                              disabled={guardando || !prod}
                              aria-label={`Piezas de ${labelAccesorio(cat)}`}
                              className="flex-1 min-w-0 rounded-md border border-gray-300 px-3 min-h-[44px] text-sm font-mono tabular-nums focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50"
                              placeholder="0"
                            />
                            <input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              step={1}
                              value={bultosCat[cat]}
                              onChange={(e) => setBultos(cat, e.target.value)}
                              disabled={guardando || !prod}
                              aria-label={`Bultos de ${labelAccesorio(cat)}`}
                              className="w-20 shrink-0 rounded-md border border-gray-300 px-2 min-h-[44px] text-sm font-mono tabular-nums text-right focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50"
                              placeholder="—"
                            />
                          </div>
                          <div className="flex items-center justify-between text-xs text-gray-400 mt-0.5">
                            <span>Piezas</span>
                            <span className="w-20 shrink-0 text-right">
                              Bultos
                            </span>
                          </div>
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
                        <div className="flex items-center gap-2">
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
                            aria-label={`Piezas de ${p.nombre}`}
                            className="flex-1 min-w-0 rounded-md border border-gray-300 px-3 min-h-[44px] text-sm font-mono tabular-nums focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50"
                            placeholder="0"
                          />
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step={1}
                            value={otrosBultos[p.id] ?? ""}
                            onChange={(e) =>
                              setOtrosBultos((prev) => ({
                                ...prev,
                                [p.id]: e.target.value.replace(/[^0-9]/g, ""),
                              }))
                            }
                            disabled={guardando}
                            aria-label={`Bultos de ${p.nombre}`}
                            className="w-20 shrink-0 rounded-md border border-gray-300 px-2 min-h-[44px] text-sm font-mono tabular-nums text-right focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50"
                            placeholder="—"
                          />
                        </div>
                        <div className="flex items-center justify-between text-xs text-gray-400 mt-0.5">
                          <span>Piezas · Stock disponible: {p.stock_total}</span>
                          <span className="w-20 shrink-0 text-right">Bultos</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Aviso de stock.
                  🟡 AVISA, NO BLOQUEA. Decisión de Daniel: "negativo".
                  Entregar más de lo que estaba cargado es un hecho real; el
                  sistema lo muestra en vez de esconderlo. */}
              {warningsStock.length > 0 && (
                <div className="rounded-md border border-orange-200 bg-orange-50 p-3 text-xs text-orange-900">
                  ⚠ Vas a entregar más piezas de las que hay en el inventario:{" "}
                  {warningsStock
                    .map(
                      (w) =>
                        `${w.nombre} (entregas ${w.pedido}, hay ${w.disponible})`,
                    )
                    .join(", ")}
                  . Puedes guardar igual — el inventario va a quedar en negativo
                  hasta que cargues la próxima compra.
                </div>
              )}

              {/* Resumen */}
              <section className="rounded-md border border-gray-200 bg-gray-50/50 p-3 space-y-1">
                <div className="text-xs uppercase tracking-wide text-gray-500">
                  Resumen
                </div>
                {/* Cómo va a salir cada renglón en la nota de entrega. Es el
                    formato que escribió Daniel: "150 piezas en 5 bultos". */}
                {filasParaResumen.length > 0 && (
                  <div className="text-xs text-gray-600 space-y-0.5 pb-1 border-b border-gray-200">
                    {filasParaResumen.map((f) => (
                      <div
                        key={f.producto.id}
                        className="flex justify-between gap-3"
                      >
                        <span className="min-w-0 break-words">
                          {f.producto.nombre}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {textoPiezasBultos(f.cant, f.bultos)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
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

          <div className="space-y-2 pt-2">
          {/* El botón apagado dice POR QUÉ está apagado, en la pantalla y no en
              un globito del mouse (en el iPhone no hay `title=`). Va en su
              propia línea, a lo ancho: en 390 px la lista completa no entra al
              lado del botón sin empujar la fila. */}
          {!guardando && falta.length > 0 && (
            <p className="text-xs text-amber-800">Falta: {falta.join(", ")}.</p>
          )}
          <div className="flex items-center justify-between gap-3">
            {initial ? (
              <button
                type="button"
                onClick={handleEliminar}
                disabled={guardando}
                className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50 min-h-[44px] px-1"
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
                className="rounded-md border border-gray-300 bg-white text-gray-700 px-3 min-h-[44px] text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGuardar}
                disabled={!puedeGuardar}
                className="rounded-md bg-gray-900 text-white px-4 min-h-[44px] text-sm font-medium active:scale-[0.97] transition disabled:opacity-50"
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
        )}
      </div>
    </div>
  );
}
