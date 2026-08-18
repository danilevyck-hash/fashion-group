"use client";

// Hook del FORM de guía (crear o editar). Extraído de useGuiasState para
// soportar rutas dedicadas /guias/nueva y /guias/[id]/editar.
// El hook del listado (useGuiasState) ya no maneja estado de form.
//
// Sprint 2 (2026-05-26): el campo libre `transportista` se reemplazó por
// (modoEntrega, transportistaId). El catálogo se lee de /api/transportistas
// (tabla canónica con 6 registros activos seedeados en Sprint 1).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useDraftAutoSave } from "@/lib/hooks/useDraftAutoSave";
import type { GuiaItem, ModoEntrega, Transportista } from "./types";
import { DEFAULT_DIRECCIONES, loadList, saveList, emptyItem } from "./constants";
import { nuevoUid, quitarFila, restaurarFila, validarGuia } from "./guia-form-logic";
import {
  hayCambios as calcularHayCambios,
  instantaneaGuia,
  renglonesCambiaron,
  type InstantaneaGuia,
} from "@/lib/guias/cambios-form";

interface Options {
  editingId?: string | null; // null = creación
}

export function useGuiaFormState({ editingId = null }: Options = {}) {
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  // Catálogo canónico de transportistas (vive en DB, no localStorage).
  const [transportistas, setTransportistas] = useState<Transportista[]>([]);
  const [direcciones, setDirecciones] = useState<string[]>(DEFAULT_DIRECCIONES);

  // Form state
  const [editingEstado, setEditingEstado] = useState<string | null>(null);
  // Fecha default = HOY en hora LOCAL. toISOString() es UTC y en Panamá (UTC-5)
  // de noche devolvía el día siguiente; construimos la fecha local a mano.
  const [fecha, setFecha] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });
  const [modoEntrega, setModoEntrega] = useState<ModoEntrega>(() => {
    try { return (localStorage.getItem("fg_last_modo_entrega") as ModoEntrega) || "transportista"; } catch { return "transportista"; }
  });
  const [transportistaId, setTransportistaId] = useState<string | null>(() => {
    try { return localStorage.getItem("fg_last_transportista_id") || null; } catch { return null; }
  });
  const [entregadoPor, setEntregadoPor] = useState(() => {
    try { return localStorage.getItem("fg_last_entregado_por") || ""; } catch { return ""; }
  });
  const [observaciones, setObservaciones] = useState("");
  // N° de guía del transportista (nivel guía). Opcional al crear; obligatorio
  // al despachar cuando el modo es transportista externo (validado en despacho).
  const [numeroGuiaTransp, setNumeroGuiaTransp] = useState("");
  const [items, setItems] = useState<GuiaItem[]>([emptyItem(1)]);
  const [formNumero, setFormNumero] = useState(1);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(editingId === null);

  // ── Lo ÚLTIMO que el servidor ya tiene ─────────────────────────────────────
  // 🔴 ES EL CANDADO. Mientras esto sea `null`, el formulario NO puede
  // declararse sucio y por lo tanto NO puede autoguardar: no hay contra qué
  // comparar. Se llena UNA vez, con lo que se acaba de cargar (o, al crear, con
  // el formulario vacío), y se vuelve a llenar con lo que se acaba de mandar
  // cada vez que un guardado sale bien.
  //
  // 🩸 Antes esto era `changeCount.current > 1` dentro de GuiaForm: contar
  // renders, no cambios. Abrir la pantalla de editar disparaba un PUT solo, y
  // ese PUT REEMPLAZA los renglones (borra e inserta) → abrir una guía y
  // arrepentirse le cambiaba el id a cada línea. Medido contra el log del
  // servidor el 17-ago-2026 con GT-204.
  const [guardado, setGuardado] = useState<InstantaneaGuia | null>(null);
  /** Hora del último guardado que el servidor aceptó (no del que se intentó). */
  const [guardadoEn, setGuardadoEn] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Cargar listas dinámicas + catálogo de transportistas
  useEffect(() => {
    setDirecciones(loadList("fg_direcciones", DEFAULT_DIRECCIONES));
    fetch("/api/transportistas", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Transportista[]) => setTransportistas(data || []))
      .catch(() => { /* el form muestra el modo "Entrega directa" como fallback */ });
  }, []);

  // Si es edición: cargar la guía una sola vez
  useEffect(() => {
    if (!editingId) return;
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch(`/api/guias/${editingId}`, { cache: "no-store" });
        if (!res.ok) throw new Error("No se pudo cargar la guía");
        const g = await res.json();
        if (cancelado) return;
        setEditingEstado(g.estado || null);
        setFormNumero(g.numero);
        setFecha(g.fecha);
        // Sprint 2: modo + FK directos del backend
        const modoCargado: ModoEntrega =
          g.modo_entrega === "transportista" || g.modo_entrega === "entrega_directa"
            ? g.modo_entrega
            : g.transportista_id
              ? "transportista"
              : "entrega_directa";
        setModoEntrega(modoCargado);
        setTransportistaId(g.transportista_id || null);
        setEntregadoPor(g.entregado_por || "");
        setObservaciones(g.observaciones || "");
        setNumeroGuiaTransp(g.numero_guia_transp || "");
        const guiaItems = (g.guia_items || []) as GuiaItem[];
        const itemsCargados =
          guiaItems.length > 0
            // `uid` no viene de la base: se genera acá para que las filas de una
            // guía existente también tengan identidad estable al editarlas.
            ? guiaItems.map((item, i) => ({ ...item, uid: item.uid ?? nuevoUid(), orden: i + 1 }))
            : [emptyItem(1)];
        setItems(itemsCargados);
        // 🔴 La referencia contra la que se mide "¿cambió algo?" se toma de los
        // MISMOS valores que se acaban de poner en el formulario, no de un
        // render posterior: si se tomara después, cualquier render de más
        // (los datos que llegan, un remontaje) volvería a producir el bug.
        setGuardado(
          instantaneaGuia(
            {
              fecha: g.fecha,
              modoEntrega: modoCargado,
              transportistaId: g.transportista_id || null,
              entregadoPor: g.entregado_por || "",
              observaciones: g.observaciones || "",
              numeroGuiaTransp: g.numero_guia_transp || "",
            },
            itemsCargados,
          ),
        );
        setLoaded(true);
      } catch {
        if (!cancelado) {
          showToast("Error al cargar guía");
          router.push("/guias");
        }
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [editingId, router, showToast]);

  // Siguiente número para creación
  useEffect(() => {
    if (editingId) return;
    fetch("/api/guias")
      .then((r) => r.ok ? r.json() : [])
      .then((data: Array<{ numero: number }>) => {
        setFormNumero(data.length > 0 ? data[0].numero + 1 : 1);
      })
      .catch(() => {});
  }, [editingId]);

  // Al CREAR no hay nada que cargar, así que la referencia es el formulario tal
  // como nace (con los valores que recuerda el navegador: modo, transportista y
  // quién despacha). Sin esto, `/guias/nueva` no podría decir "Sin guardar"
  // nunca. No hay PUT en esta pantalla: lo único que gobierna es el aviso de
  // salir con cambios y el rótulo, y el borrador de localStorage sigue
  // guardándose solo cada 5 s como siempre, sin mirar esto.
  useEffect(() => {
    if (editingId) return;
    setGuardado(
      instantaneaGuia(
        { fecha, modoEntrega, transportistaId, entregadoPor, observaciones, numeroGuiaTransp },
        items,
      ),
    );
    // Solo al montar: son los valores iniciales, a propósito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  /** Lo que se le mandaría al servidor AHORA. Es lo que se compara. */
  const instantanea = useMemo(
    () =>
      instantaneaGuia(
        { fecha, modoEntrega, transportistaId, entregadoPor, observaciones, numeroGuiaTransp },
        items,
      ),
    [fecha, modoEntrega, transportistaId, entregadoPor, observaciones, numeroGuiaTransp, items],
  );
  const hayCambios = calcularHayCambios(guardado, instantanea);

  // Draft auto-save (incluye modo + FK)
  const guiaDraftData = useMemo(() => ({
    modoEntrega, transportistaId, entregadoPor, items, observaciones,
  }), [modoEntrega, transportistaId, entregadoPor, items, observaciones]);
  const isGuiaDraftEmpty = useCallback((d: typeof guiaDraftData) => {
    return !d.transportistaId && !d.entregadoPor && !d.observaciones && d.items.every(i => !i.cliente && !i.direccion && !i.facturas && (!i.bultos || i.bultos === 0));
  }, []);
  // Auto-save del borrador + restaurar (banner en /guias/nueva, patrón cheques).
  // Antes el borrador se guardaba pero el banner de restaurar estaba eliminado
  // → trabajo perdido si se cerraba la pestaña en una guía nueva.
  const { draft: guiaDraft, hasDraft: hasGuiaDraft, clearDraft: clearGuiaDraft, draftTimeAgo: guiaDraftTimeAgo } =
    useDraftAutoSave("guia", guiaDraftData, isGuiaDraftEmpty);
  function restoreGuiaDraft() {
    if (!guiaDraft) return;
    setModoEntrega(guiaDraft.modoEntrega || "transportista");
    setTransportistaId(guiaDraft.transportistaId || "");
    setEntregadoPor(guiaDraft.entregadoPor || "");
    setObservaciones(guiaDraft.observaciones || "");
    // Un borrador guardado antes de jul-2026 no trae `uid`.
    if (guiaDraft.items?.length) {
      setItems(guiaDraft.items.map((item) => ({ ...item, uid: item.uid ?? nuevoUid() })));
    }
    clearGuiaDraft();
  }

  // Adders de listas dinámicas (transportistas ya no se agregan desde el form
  // — son catálogo controlado por admin)
  function addDireccion(name: string) {
    const updated = [...direcciones, name];
    setDirecciones(updated);
    saveList("fg_direcciones", DEFAULT_DIRECCIONES, updated);
  }

  // Items. La fila nueva arranca SIEMPRE vacía: no se copia nada de la anterior.
  function addRow() {
    setItems((prev) => [...prev, emptyItem(prev.length + 1)]);
  }
  function removeRow(idx: number) {
    setItems((prev) => quitarFila(prev, idx));
  }
  /** Deshacer un borrado: la fila vuelve ENTERA (con cliente_codigo) y a su lugar. */
  function restoreRow(idx: number, fila: GuiaItem) {
    setItems((prev) => restaurarFila(prev, idx, fila));
  }
  function updateItem(idx: number, field: keyof GuiaItem, value: string | number) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  }

  // Actualiza varios campos de una fila de forma ATÓMICA (functional update),
  // para casos como el typeahead de cliente que setea cliente + cliente_codigo
  // en un solo evento sin que la segunda escritura pise a la primera.
  function updateItemFields(idx: number, partial: Partial<GuiaItem>) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...partial } : item)));
  }

  function validate(): boolean {
    const errors = validarGuia({ fecha, modoEntrega, transportistaId, entregadoPor, items });
    setValidationErrors(errors);
    if (errors.size > 0) {
      setError("Completa todos los campos obligatorios antes de guardar.");
      return false;
    }
    return true;
  }

  async function saveGuia(opts?: { silent?: boolean }) {
    const silent = opts?.silent === true;
    if (!validate()) return;
    try {
      localStorage.setItem("fg_last_modo_entrega", modoEntrega);
      if (transportistaId) localStorage.setItem("fg_last_transportista_id", transportistaId);
      localStorage.setItem("fg_last_entregado_por", entregadoPor);
    } catch { /* */ }
    const validItems = items.filter(
      (i) => i.cliente || i.direccion || i.facturas || i.bultos > 0,
    );
    // La instantánea de lo que se manda, tomada ANTES del fetch: si la persona
    // sigue escribiendo mientras el pedido viaja, eso queda SIN guardar (que es
    // la verdad), en vez de darse por guardado con lo que se tecleó después.
    const enviada = instantanea;
    // 🔴 `items` en el PUT es un REEMPLAZO COMPLETO: borra los renglones e
    // inserta otros con ids NUEVOS. Cambiar la fecha, el transportista o las
    // observaciones no puede costar el id de cada línea, así que los renglones
    // solo viajan cuando de verdad cambiaron. Al CREAR siempre viajan (no hay
    // nada guardado que conservar).
    const mandarItems = !editingId || renglonesCambiaron(guardado, enviada);
    setSaving(true);
    const url = editingId ? `/api/guias/${editingId}` : "/api/guias";
    const method = editingId ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fecha,
        modo_entrega: modoEntrega,
        transportista_id: modoEntrega === "transportista" ? transportistaId : null,
        entregado_por: entregadoPor,
        observaciones,
        numero_guia_transp: numeroGuiaTransp.trim() || null,
        estado: editingId && editingEstado ? editingEstado : "Pendiente Bodega",
        ...(mandarItems ? { items: validItems } : {}),
      }),
    });
    if (res.ok) {
      setError(null);
      // Recién ahora lo enviado ES lo que el servidor tiene.
      setGuardado(enviada);
      setGuardadoEn(new Date().toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit" }));
      clearGuiaDraft();
      // Aviso de creación eliminado (antes mandaba email interno a info@).
      // El único aviso de guías ahora es el de DESPACHO (Telegram), en
      // /api/guias/[id] al pasar a estado "Completada".
      // En silent (auto-save) NO navega ni resetea — preserva contexto.
      if (!silent) {
        router.push("/guias");
      }
    } else {
      const errData = await res.json().catch(() => ({}));
      setError(errData.error || "Error al guardar. Verifica los datos.");
    }
    setSaving(false);
  }

  return {
    // meta
    editingId,
    loaded,
    error,
    validationErrors,
    toast,
    showToast,
    // listas
    transportistas, direcciones,
    addDireccion,
    // form
    formNumero,
    fecha, setFecha,
    modoEntrega, setModoEntrega,
    transportistaId, setTransportistaId,
    entregadoPor, setEntregadoPor,
    observaciones, setObservaciones,
    numeroGuiaTransp, setNumeroGuiaTransp,
    items,
    saving,
    // "¿de verdad se cambió algo?" — se compara contra lo último que el
    // servidor tiene, nunca contra un contador de renders.
    hayCambios,
    instantanea: instantanea.todo,
    guardadoEn,
    updateItem, updateItemFields, addRow, removeRow, restoreRow,
    saveGuia,
    // draft: banner de restaurar en /guias/nueva + limpieza al guardar
    hasGuiaDraft, guiaDraftTimeAgo, restoreGuiaDraft, clearGuiaDraft,
  };
}
