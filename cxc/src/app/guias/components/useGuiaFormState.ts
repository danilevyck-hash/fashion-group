"use client";

// Hook del FORM de guía (crear o editar). Extraído de useGuiasState para
// soportar rutas dedicadas /guias/nueva y /guias/[id]/editar.
// El hook del listado (useGuiasState) ya no maneja estado de form.
//
// Sprint 2 (2026-05-26): el campo libre `transportista` se reemplazó por
// (modoEntrega, transportistaId). El catálogo se lee de /api/transportistas
// (tabla canónica con 6 registros activos seedeados en Sprint 1).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDraftAutoSave } from "@/lib/hooks/useDraftAutoSave";
import type { Guia, GuiaItem, ModoEntrega, Transportista } from "./types";
import { DEFAULT_DIRECCIONES, loadList, saveList, emptyItem } from "./constants";
import { nuevoUid, quitarFila, restaurarFila, validarGuia } from "./guia-form-logic";
import {
  hayCambios as calcularHayCambios,
  instantaneaGuia,
  renglonesCambiaron,
  type InstantaneaGuia,
} from "@/lib/guias/cambios-form";
import { numeroCabeceraAlDespachar } from "@/lib/guias/falta-para-despachar";
import { guiaYaDespachada } from "@/lib/guias/modo-despacho";
import { cabeceraEditable, cambiosDeRenglon } from "@/lib/guias/campos-editables";

interface Options {
  editingId?: string | null; // null = creación
  /**
   * Qué hacer cuando un guardado A MANO sale bien. Sin esto se vuelve a
   * `/guias`, que es lo que corresponde cuando el formulario ES la pantalla
   * entera (`/guias/nueva`). Cuando el formulario se abre DENTRO de la guía
   * —el botón "Editar" de `/guias/[id]`— irse de la pantalla sería sacar a la
   * persona de la guía que estaba por despachar.
   */
  alGuardar?: () => void;
  /**
   * 🔴 LA GUÍA QUE LA PANTALLA YA TIENE EN LA MANO — para no pedirla dos veces.
   *
   * 🩸 Al tocar «Editar» salían **6 pedidos** y la guía viajaba DOS VECES: una
   * la pide `useDespachoGuia` (la pantalla) y otra la pedía este hook al
   * montarse el formulario. Además de la red, eso es lo que hacía que el
   * formulario apareciera un rato después que la pantalla — el segundo tiempo
   * del parpadeo.
   *
   * Con la guía servida de acá, el formulario nace LLENO en el mismo dibujo.
   * Sin ella (nadie la cargó todavía) se pide, como siempre.
   */
  guiaInicial?: Guia | null;
}


/**
 * 🔴 LA INSTANTÁNEA DE "LO QUE EL SERVIDOR YA TIENE" — con la MISMA derivación
 * del N° de cabecera que usa la instantánea de "lo que se mandaría".
 *
 * 🩸 SIN ESTO EL FORMULARIO NACE SUCIO, y es un caso REAL, no teórico. Desde el
 * 18-ago-2026 el N° del transportista se puede anotar TARDE, y eso escribe UNA
 * columna de UNA línea **sin tocar `guia_transporte`**: hay guías con la
 * cabecera vacía y `725` en un renglón. Como el N° de cabecera pasó a
 * DERIVARSE de los renglones, la referencia (`""`, lo guardado) y lo actual
 * (`"725"`, lo derivado) diferían apenas se abría la guía — y el formulario se
 * declaraba "Sin guardar" sin que nadie tocara una tecla. Es exactamente el
 * defecto que `cambios-form.ts` vino a matar: *cargar la guía no puede producir
 * una diferencia contra sí misma*.
 *
 * ⚠️ La cabecera SÍ se actualiza cuando se guarda por otro motivo — eso es lo
 * que `numeroCabeceraAlDespachar` decide, y es lo correcto (gana la línea, que
 * es el dato más específico y el que el papel imprime). Lo que no puede es
 * contar como un cambio PENDIENTE de algo que nadie pidió.
 */
function instantaneaDeLoGuardado(c: ReturnType<typeof camposDeLaGuia>): InstantaneaGuia {
  return instantaneaGuia(
    {
      fecha: c.fecha,
      modoEntrega: c.modoEntrega,
      transportistaId: c.transportistaId,
      entregadoPor: c.entregadoPor,
      observaciones: c.observaciones,
      numeroGuiaTransp: numeroCabeceraAlDespachar(
        c.items.map((i) => i.numero_guia_transp ?? ""),
        c.numeroGuiaTransp,
      ),
    },
    c.items,
  );
}

/**
 * 🔑 UNA GUÍA CARGADA, TRADUCIDA A LOS CAMPOS DEL FORMULARIO — en un solo lugar.
 *
 * Lo usan los DOS caminos: el formulario que nace con la guía ya en la mano
 * (`guiaInicial`) y el que la pide él mismo. Con dos traducciones distintas,
 * abrir por un camino o por el otro llenaría el formulario distinto, y la
 * instantánea de "lo último que el servidor tiene" nacería mintiendo.
 */
function camposDeLaGuia(g: Guia) {
  const modoEntrega: ModoEntrega =
    g.modo_entrega === "transportista" || g.modo_entrega === "entrega_directa"
      ? g.modo_entrega
      : g.transportista_id
        ? "transportista"
        : "entrega_directa";
  const guiaItems = (g.guia_items || []) as GuiaItem[];
  const items =
    guiaItems.length > 0
      // `uid` no viene de la base: se genera acá para que las filas de una guía
      // existente también tengan identidad estable al editarlas.
      ? guiaItems.map((item, i) => ({ ...item, uid: item.uid ?? nuevoUid(), orden: i + 1 }))
      : [emptyItem(1)];
  return {
    estado: (g.estado as string | null) ?? null,
    numero: g.numero,
    fecha: g.fecha,
    modoEntrega,
    transportistaId: g.transportista_id || null,
    entregadoPor: g.entregado_por || "",
    observaciones: g.observaciones || "",
    numeroGuiaTransp: g.numero_guia_transp || "",
    items,
  };
}

export function useGuiaFormState({ editingId = null, alGuardar, guiaInicial = null }: Options = {}) {
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  // Catálogo canónico de transportistas (vive en DB, no localStorage).
  const [transportistas, setTransportistas] = useState<Transportista[]>([]);
  const [direcciones, setDirecciones] = useState<string[]>(DEFAULT_DIRECCIONES);

  // 🔴 LO QUE LA PANTALLA YA CARGÓ, listo antes del primer dibujo. Los
  // `useState` de abajo lo leen en su inicializador PEREZOSO: si esperaran a un
  // `useEffect`, el formulario nacería vacío y se llenaría un dibujo después —
  // que es exactamente el parpadeo que este cambio vino a sacar.
  // ⚠️ `useState` con inicializador perezoso, no una expresión suelta: se
  // traduce UNA sola vez. Recalcularla en cada dibujo generaría un `uid` nuevo
  // por renglón cada vez, que es justo lo que la identidad estable evita.
  const [inicial] = useState(() => (guiaInicial && editingId ? camposDeLaGuia(guiaInicial) : null));
  /** ¿La guía llegó servida? Entonces este hook no la vuelve a pedir. */
  const yaSembrada = useRef(inicial !== null);

  // Form state
  const [editingEstado, setEditingEstado] = useState<string | null>(inicial?.estado ?? null);
  // Fecha default = HOY en hora LOCAL. toISOString() es UTC y en Panamá (UTC-5)
  // de noche devolvía el día siguiente; construimos la fecha local a mano.
  const [fecha, setFecha] = useState(() => {
    if (inicial) return inicial.fecha;
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });
  const [modoEntrega, setModoEntrega] = useState<ModoEntrega>(() => {
    if (inicial) return inicial.modoEntrega;
    try { return (localStorage.getItem("fg_last_modo_entrega") as ModoEntrega) || "transportista"; } catch { return "transportista"; }
  });
  const [transportistaId, setTransportistaId] = useState<string | null>(() => {
    if (inicial) return inicial.transportistaId;
    try { return localStorage.getItem("fg_last_transportista_id") || null; } catch { return null; }
  });
  const [entregadoPor, setEntregadoPor] = useState(() => {
    if (inicial) return inicial.entregadoPor;
    try { return localStorage.getItem("fg_last_entregado_por") || ""; } catch { return ""; }
  });
  const [observaciones, setObservaciones] = useState(inicial?.observaciones ?? "");
  // ── EL N° DEL TRANSPORTISTA A NIVEL GUÍA ───────────────────────────────────
  // 🔴 YA NO SE TECLEA ACÁ, Y LA COLUMNA TAMPOCO SE RETIRA.
  //
  // Daniel, punto 7: *"N° del transportista → POR LÍNEA, al lado de bultos"*.
  // El campo de CABECERA salió del formulario: el transportista arma VARIAS
  // guías suyas por cada guía nuestra, así que preguntarlo una sola vez arriba
  // era pedir el dato equivocado (*"nos hacen varias guias el transportista por
  // guia"*, 10-ago-2026).
  //
  // 🩸 PERO LA COLUMNA `guia_transporte.numero_guia_transp` SIGUE VIVA: la leen
  // el buscador de la lista, el Excel, el chip ámbar y el encabezado del papel,
  // y las guías viejas HEREDAN de ella. Si el formulario dejara de mandarla,
  // el PUT escribiría `null` y **borraría el número de todas las guías que se
  // editaran** — la misma trampa que el 25-ago-2026 se tapó al despachar.
  //
  // Por eso se conserva lo que la guía ya tenía y se aplica la MISMA regla que
  // el despacho (`numeroCabeceraAlDespachar`): manda la línea si alguna trae
  // número, y si ninguna trae, se conserva el de antes. Es la misma función,
  // no una copia.
  const [numeroGuiaTransp, setNumeroGuiaTransp] = useState(inicial?.numeroGuiaTransp ?? "");
  const [items, setItems] = useState<GuiaItem[]>(inicial?.items ?? [emptyItem(1)]);
  /** Los renglones tal como el SERVIDOR los tiene. Solo se usa en una guía ya despachada. */
  const [itemsGuardados, setItemsGuardados] = useState<GuiaItem[]>(inicial?.items ?? []);
  const [formNumero, setFormNumero] = useState(inicial?.numero ?? 1);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(editingId === null || inicial !== null);

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
  const [guardado, setGuardado] = useState<InstantaneaGuia | null>(
    // Con la guía servida, la referencia se toma de los MISMOS valores con los
    // que nacen los campos de arriba. Sin esto el formulario nacería "sucio"
    // contra un `null` y el aviso de salir con cambios saltaría sin motivo.
    inicial ? instantaneaDeLoGuardado(inicial) : null,
  );
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

  // Si es edición: cargar la guía una sola vez.
  //
  // 🔴 …salvo que la pantalla ya la haya cargado y nos la haya pasado
  // (`guiaInicial`). Ese era el SEGUNDO pedido de la misma guía al tocar
  // «Editar»: seis llamadas para abrir el formulario, con la guía viajando dos
  // veces. `guiaSemilla` se lee de una ref para que RENOVAR la guía en la
  // pantalla (después de guardar) no vuelva a disparar este efecto.
  useEffect(() => {
    if (!editingId) return;
    if (yaSembrada.current) return;
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch(`/api/guias/${editingId}`, { cache: "no-store" });
        if (!res.ok) throw new Error("No se pudo cargar la guía");
        const g = await res.json();
        if (cancelado) return;
        // 🔑 La MISMA traducción que usa el camino de la guía servida. Con dos
        // copias, abrir por un camino o por el otro llenaría el formulario
        // distinto.
        const c = camposDeLaGuia(g as Guia);
        setEditingEstado(c.estado);
        setFormNumero(c.numero);
        setFecha(c.fecha);
        setModoEntrega(c.modoEntrega);
        setTransportistaId(c.transportistaId);
        setEntregadoPor(c.entregadoPor);
        setObservaciones(c.observaciones);
        setNumeroGuiaTransp(c.numeroGuiaTransp);
        setItems(c.items);
        setItemsGuardados(c.items);
        // 🔴 La referencia contra la que se mide "¿cambió algo?" se toma de los
        // MISMOS valores que se acaban de poner en el formulario, no de un
        // render posterior: si se tomara después, cualquier render de más
        // (los datos que llegan, un remontaje) volvería a producir el bug.
        setGuardado(instantaneaDeLoGuardado(c));
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
        { fecha, modoEntrega, transportistaId, entregadoPor, observaciones, numeroGuiaTransp: numeroCabecera },
        items,
      ),
    );
    // Solo al montar: son los valores iniciales, a propósito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  /**
   * 🔴 EL N° QUE SE ESCRIBE EN LA CABECERA — calculado, no tecleado.
   *
   * Manda la LÍNEA cuando alguna trae número (es el dato más específico y es el
   * que el papel imprime); si ninguna trae, se conserva el que la guía ya
   * tenía. Es la MISMA función que usa el despacho: con dos reglas, guardar
   * desde el formulario y despachar dejarían la columna distinta.
   */
  const numeroCabecera = useMemo(
    () => numeroCabeceraAlDespachar(items.map((i) => i.numero_guia_transp ?? ""), numeroGuiaTransp),
    [items, numeroGuiaTransp],
  );

  /** Lo que se le mandaría al servidor AHORA. Es lo que se compara. */
  const instantanea = useMemo(
    () =>
      instantaneaGuia(
        { fecha, modoEntrega, transportistaId, entregadoPor, observaciones, numeroGuiaTransp: numeroCabecera },
        items,
      ),
    [fecha, modoEntrega, transportistaId, entregadoPor, observaciones, numeroCabecera, items],
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

  /**
   * Reemplaza los renglones ENTEROS de una vez — el panel «Facturas del
   * cliente» (`GUIAS_ATAJOS_NUEVOS`, 4-sep-2026) marca/desmarca facturas y
   * devuelve la lista nueva. Se renumera `orden` y se asigna `uid` a las filas
   * que nacen acá; las que ya existían conservan el suyo (identidad estable).
   * Es estado del formulario, igual que updateItem: lo que se GUARDA no cambia.
   */
  function reemplazarItems(next: GuiaItem[]) {
    setItems(next.map((item, i) => ({ ...item, orden: i + 1, uid: item.uid ?? nuevoUid() })));
  }

  /**
   * 🔴 EL AUTOGUARDADO NO PINTA ERRORES. `pintar: false` valida igual —y frena
   * el guardado igual— pero se calla.
   *
   * 🩸 EL DEFECTO: al empezar el SEGUNDO envío, el formulario se ponía rojo
   * solo. Nadie había tocado "Guardar": a los ~1,5 s el guardado automático
   * llamaba acá, la fila a medio escribir no pasaba la validación, y aparecían
   * "Completa todos los campos obligatorios" y la fila entera en rojo. Es el
   * "rojo prematuro" que ya se había eliminado a propósito (un campo no puede
   * quedar en error por haberlo mirado) y que volvió por la puerta del
   * autoguardado.
   *
   * ⚠️ El autoguardado SE QUEDA — bodega despacha desde el celular y una
   * pestaña que se cierra no puede llevarse los renglones. Lo que no puede es
   * pintar: un guardado que la persona no pidió no puede acusarla de nada.
   * Al apretar "Guardar" se pinta todo lo que falte, igual que siempre.
   */
  function validate(opts?: { pintar?: boolean }): boolean {
    const pintar = opts?.pintar !== false;
    const errors = validarGuia({ fecha, modoEntrega, transportistaId, entregadoPor, items });
    if (errors.size > 0) {
      if (pintar) {
        setValidationErrors(errors);
        setError("Completa todos los campos obligatorios antes de guardar.");
      }
      return false;
    }
    // Válido: se limpia lo que hubiera quedado pintado de un intento anterior.
    setValidationErrors(errors);
    return true;
  }

  /**
   * 🔴 UNA GUÍA YA DESPACHADA: qué está abierto y qué NO.
   *
   * Daniel: *"Guía despachada → se puede corregir **N° del transportista ·
   * cliente · facturas**"* y *"los **bultos** de una despachada **NO se
   * tocan** — es lo que el transportista firmó"*. La lista de tres vive en
   * `campos-editables.ts` y la leen también el formulario y el servidor.
   */
  const despachada = guiaYaDespachada(editingEstado);
  const puedeTocarCabecera = cabeceraEditable(editingEstado);

  /**
   * 🔴 CORREGIR UNA GUÍA FIRMADA VA POR COLUMNA, NUNCA POR EL PUT.
   *
   * 🩸 `items` en el PUT es un REEMPLAZO COMPLETO: borra los renglones e
   * inserta otros con ids NUEVOS, y con eso se pierden el cliente atado y el N°
   * que se anotó tarde. Además el candado del PUT rechaza una guía Completada
   * entera, y ese candado NO se toca. Así que acá se escribe renglón por
   * renglón, campo por campo, con los dos endpoints que ya existían por
   * exactamente esta razón:
   *   · el N° del transportista → `PATCH /api/guias/[id]/numero-transp`
   *   · cliente y facturas      → `PATCH /api/guias/[id]/item`
   *
   * ⚠️ **Las escrituras que no cambian nada no se hacen**: abrir una guía
   * despachada, mirarla y guardar no manda un solo pedido.
   *
   * ⚠️ **No se agregan ni se quitan renglones.** Un renglón sin `id` es uno que
   * nació en esta pantalla, y agregarle carga a una guía que el transportista
   * ya firmó sería inventar mercancía que no viajó.
   */
  async function guardarCorrecciones(): Promise<void> {
    if (!editingId) return;
    const porId = new Map(itemsGuardados.filter((i) => i.id).map((i) => [i.id as string, i]));
    setSaving(true);
    let fallo: string | null = null;
    let escrituras = 0;
    try {
      for (const it of items) {
        if (!it.id) continue;
        const antes = porId.get(it.id);
        if (!antes) continue;
        const cambios = cambiosDeRenglon(editingEstado, antes, it);

        // El N° tiene su propio endpoint desde el 18-ago-2026 y sigue siendo el
        // mismo: una columna de una línea, sin mirar el estado.
        if ("numero_guia_transp" in cambios) {
          const r = await fetch(`/api/guias/${editingId}/numero-transp`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId: it.id, numero_guia_transp: cambios.numero_guia_transp ?? "" }),
          });
          escrituras++;
          if (!r.ok) {
            fallo = (await r.json().catch(() => ({}))).error || "No se pudo guardar el N° del transportista.";
            break;
          }
          delete cambios.numero_guia_transp;
        }

        if (Object.keys(cambios).length > 0) {
          const r = await fetch(`/api/guias/${editingId}/item`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId: it.id, ...cambios }),
          });
          escrituras++;
          if (!r.ok) {
            fallo = (await r.json().catch(() => ({}))).error || "No se pudo guardar la corrección.";
            break;
          }
        }
      }
    } catch {
      fallo = "Sin conexión. No se guardó nada — revisa el internet y vuelve a intentar.";
    } finally {
      setSaving(false);
    }

    if (fallo) {
      setError(fallo);
      return;
    }
    setError(null);
    setItemsGuardados(items);
    setGuardado(instantanea);
    if (escrituras > 0) {
      setGuardadoEn(new Date().toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit" }));
    }
    if (alGuardar) alGuardar();
  }

  async function saveGuia(opts?: { silent?: boolean }) {
    const silent = opts?.silent === true;
    // 🔴 UNA GUÍA FIRMADA NO PASA POR ACÁ. El PUT la rechaza —y con razón—, así
    // que sus correcciones van por columna. Y NUNCA en silencio: corregir un
    // documento que alguien ya firmó tiene que ser un acto deliberado, no algo
    // que pase solo a los 1,5 s de haber mirado la pantalla.
    if (editingId && despachada) {
      if (silent) return;
      return guardarCorrecciones();
    }
    // 🔴 Un guardado AUTOMÁTICO no pinta nada. Ver `validate`.
    if (!validate({ pintar: !silent })) return;
    // 🔴 GUARDAR SIN NADA QUE GUARDAR NO ESCRIBE (5-sep-2026). Daniel: *«al
    // guardar, mandar solo lo que cambió»*.
    //
    // 🩸 Medido contra la bitácora: de los **549 guardados** de esta pantalla,
    // **407 (74%)** mandaron `items` y con eso BORRARON y recrearon todos los
    // renglones — la guía 85 pasó por eso **45 veces en 3 h 38 min**. Desde el
    // 17-ago los renglones ya solo viajan cuando cambiaron (`renglonesCambiaron`),
    // pero el botón seguía disparando un PUT completo de la cabecera aunque no
    // se hubiera tocado una tecla: abrir una guía, mirarla y apretar Guardar
    // reescribía la cabecera y dejaba una línea en la bitácora.
    //
    // ⚠️ **NADIE PIERDE ACCESO.** Daniel: *«quiero que bodega también pueda
    // agregar algo si sale a último segundo, editar un cliente o algo»*. Esto
    // no mira roles: mira si LO QUE SE MANDARÍA es distinto de lo que el
    // servidor ya tiene. Cambiar un cliente o agregar un renglón sigue
    // guardando igual, para bodega y para todos.
    //
    // ⚠️ Solo al EDITAR. Al crear no hay nada guardado contra qué comparar y la
    // guía tiene que nacer sí o sí.
    if (editingId && !calcularHayCambios(guardado, instantanea)) {
      setError(null);
      // El botón hizo lo que se le pidió: no había nada que guardar. Se navega
      // igual —quedarse quieto sin decir nada es peor— y en silencio (el
      // autoguardado) simplemente no se hace nada.
      if (!silent) {
        if (alGuardar) alGuardar();
        else router.push("/guias");
      }
      return;
    }
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
    // 🔴 LA RED DE SEGURIDAD. Sin el `try`, un `fetch` que REVIENTA —el WiFi de
    // la bodega se cae a mitad del pedido— tiraba la excepción antes del
    // `setSaving(false)` de más abajo, así que el botón se quedaba en
    // "Guardando…" PARA SIEMPRE: sin aviso, sin poder reintentar sin recargar
    // la página, y con la persona creyendo que guardó. La pantalla de
    // despachar ya avisaba ("Sin conexión…"); ésta no.
    //
    // ⚠️ El `finally` es lo que de verdad destraba el botón: `setSaving(false)`
    // tiene que correr salga bien, salga mal o reviente.
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha,
          modo_entrega: modoEntrega,
          transportista_id: modoEntrega === "transportista" ? transportistaId : null,
          entregado_por: entregadoPor,
          observaciones,
          // 🔴 EL DERIVADO, no un campo tecleado: manda la línea si alguna trae
          // número, y si ninguna trae se conserva el que la guía ya tenía. Sin
          // esto, editar una guía vieja le BORRARÍA el número de la cabecera —
          // el que leen el buscador, el Excel y el encabezado del papel.
          numero_guia_transp: numeroCabecera.trim() || null,
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
          if (alGuardar) {
            alGuardar();
          } else if (!editingId) {
            // 🔴 GUARDAR UNA GUÍA NUEVA TE DEJA **EN LA GUÍA**, no en el listado.
            //
            // Daniel, punto 12. 🩸 Lo que pasaba: se terminaba de cargar la
            // guía, se apretaba «Guardar Guía» y la pantalla saltaba a `/guias`
            // — justo cuando lo siguiente que hace la secretaria es
            // IMPRIMIRLA para dárselas al chofer. Había que buscarla en la
            // lista, abrir el acordeón y recién ahí imprimir.
            //
            // ⚠️ Si el servidor no devolvió el id (no debería pasar: el POST
            // responde la guía insertada), se vuelve al listado como siempre.
            // Quedarse quieto sin decir nada sería peor.
            const creada = await res.json().catch(() => null);
            const nuevoId = creada && typeof creada.id === "string" ? creada.id : null;
            router.push(nuevoId ? `/guias/${nuevoId}` : "/guias");
          } else {
            router.push("/guias");
          }
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || "Error al guardar. Verifica los datos.");
      }
    } catch {
      // 🔴 Se dice que NO se guardó, y se dice también cuando el guardado era
      // automático: "no se guardó" es exactamente lo que hay que enterarse.
      // `guardado` no se toca, así que el rótulo sigue diciendo "Sin guardar"
      // y el botón vuelve a estar tocable para reintentar.
      setError("Sin conexión. No se guardó nada — revisa el internet y vuelve a intentar.");
    } finally {
      setSaving(false);
    }
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
    // 🔴 El N° del transportista de la CABECERA ya no se teclea: se DERIVA de
    // los renglones (ver `numeroCabecera`). Se expone para que la pantalla
    // pueda decirlo, nunca para escribirlo con un campo aparte.
    numeroCabecera,
    items,
    saving,
    /** El estado guardado de la guía ("Pendiente Bodega", "Completada", …). */
    estado: editingEstado,
    /** ¿Ya salió? Entonces solo se corrigen N° del transportista, cliente y facturas. */
    despachada,
    /** ¿Se pueden tocar fecha, modo, transportista, quién despacha y observaciones? */
    puedeTocarCabecera,
    // "¿de verdad se cambió algo?" — se compara contra lo último que el
    // servidor tiene, nunca contra un contador de renders.
    hayCambios,
    instantanea: instantanea.todo,
    guardadoEn,
    updateItem, updateItemFields, reemplazarItems, addRow, removeRow, restoreRow,
    saveGuia,
    // draft: banner de restaurar en /guias/nueva + limpieza al guardar
    hasGuiaDraft, guiaDraftTimeAgo, restoreGuiaDraft, clearGuiaDraft,
  };
}
