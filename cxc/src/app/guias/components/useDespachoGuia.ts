"use client";

// Estado de LA PÁGINA DE UNA GUÍA (`/guias/[id]`): trae la guía, guarda lo que
// se va tipeando y confirma el despacho.
//
// 🩸 Antes esto vivía dentro de `useGuiasState`, el hook de la LISTA, porque el
// formulario de despacho se desplegaba dentro de la fila. Con el despacho en su
// propia pantalla, la lista dejó de necesitarlo: quedarse con esos campos allá
// habría dejado el estado del despacho vivo en una pantalla que ya no despacha.
//
// 🔴 SIN BORRADOR EN EL NAVEGADOR (1-oct-2026). Daniel: *«¿y si lo quitamos?
// Igual no es mucha info en caso de emergencia, son par de clics»*. Antes lo
// tecleado, los N° del transportista, los bultos y las DOS FIRMAS se guardaban
// por guía en localStorage (`guia_despacho_<id>`, `guia_firma_<id>_*`) y se
// recuperaban solos al volver. Ya no: si se recarga la pantalla, se vuelve a
// llenar. Lo que quedó guardado se barre una vez al montar. El aviso de salir
// con cambios (`beforeunload` en DespachoForm) sigue.

import { useCallback, useEffect, useState } from "react";
import type { Guia, GuiaItem } from "./types";
import type { TipoDespacho } from "@/lib/guias/falta-para-despachar";
import { numeroCabeceraAlDespachar } from "@/lib/guias/falta-para-despachar";
import { guiaYaDespachada, tipoDespachoEfectivo } from "@/lib/guias/modo-despacho";
import type { JuegoDespacho } from "@/lib/guias/juegos-despacho";
import { bultosTecleados, correccionesDeBultos } from "@/lib/guias/bultos-correccion";
import { entregadoPorElegido } from "@/lib/guias/despachado-por";
import { GUIA_NUEVA_2026_10 } from "@/lib/guias/guias-2026-10";
import { limpiarBorradoresViejos } from "@/lib/borradores-viejos";

export function useDespachoGuia(id: string | null) {
  const [guia, setGuia] = useState<Guia | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [tipoDespacho, setTipoDespacho] = useState<TipoDespacho>("externo");
  const [bPlaca, setBPlaca] = useState("");
  const [bReceptor, setBReceptor] = useState("");
  const [bCedula, setBCedula] = useState("");
  const [bChofer, setBChofer] = useState("");
  /**
   * 🔴 «DESPACHADO POR» SE ELIGE AQUÍ (1-oct-2026, Daniel aprobó el mockup):
   * salió de la creación de la guía. Arranca VACÍO —nadie preseleccionado, como
   * pidió Daniel el 19-sep: *«porque puede que alguien deje ese por error»*—,
   * salvo una guía vieja que ya lo traía guardado: eso es el dato.
   */
  const [despachadoPor, setDespachadoPor] = useState("");
  const [numerosTransp, _setNumerosTransp] = useState<string[]>([]);
  /**
   * 🔴 LOS BULTOS QUE BODEGA CUENTA AL DESPACHAR (5-sep-2026). Daniel: *«porque
   * bodega si al despachar cuentan más bultos de lo que puso la secretaria,
   * quiero que lo pueda cambiar en caso de algún error»*. Arranca con lo que la
   * secretaria puso.
   */
  const [bultosPorLinea, _setBultosPorLinea] = useState<number[]>([]);
  const [bSaving, setBSaving] = useState(false);
  const [pendingFirma1, setPendingFirma1] = useState<string | null>(null);
  const [pendingFirma2, setPendingFirma2] = useState<string | null>(null);
  const [despachada, setDespachada] = useState(false);
  // Los juegos MÁS USADOS (recibido por + cédula + placa) de ESTE transportista.
  // Best-effort: si no llegan, los tres campos se escriben a mano como siempre.
  const [juegos, setJuegos] = useState<JuegoDespacho[]>([]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const cargar = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      // cache: "no-store" — sin esto Next sirve la guía de antes del despacho.
      const res = await fetch(`/api/guias/${id}`, { cache: "no-store" });
      if (!res.ok) {
        setError("No se encontró la guía");
        return;
      }
      const g = (await res.json()) as Guia;
      setGuia(g);

      const items = g.guia_items || [];
      // 🔴 CADA LÍNEA ARRANCA CON **SU** NÚMERO, Y CON NADA MÁS.
      //
      // 🩸 Acá decía `it.numero_guia_transp || cabecera || ""`, o sea que el
      // número que la secretaria escribe UNA vez al crear la guía se copiaba
      // SOLO a los 7 envíos: bodega abría la guía y los encontraba todos
      // llenos con el mismo, y tenía que borrarlos y corregirlos uno por uno
      // o el papel salía mal. Es exactamente lo contrario de lo que se
      // decidió el 10-ago-2026 — Daniel: *"la info de guia de transp, debe de
      // ser por linea, no por guia porque nos hacen varias guias el
      // transportista por guia"*.
      //
      // ⚠️ LA HERENCIA NO SE FUE: sigue viva donde siempre estuvo, que es al
      // IMPRIMIR y al MOSTRAR una guía vieja (`numeroTranspDeLinea` /
      // `numeroTranspImpreso`). Una guía histórica sale en el papel igual que
      // siempre. Lo que se quitó es prellenar un campo EDITABLE con un valor
      // que después se ESCRIBE en las 7 líneas como si alguien lo hubiera
      // puesto ahí.
      const desdeServidor = items.map((it) => it.numero_guia_transp || "");
      const bultosServidor = items.map((it) => Number(it.bultos ?? 0) || 0);

      const yaSalio = guiaYaDespachada(g.estado);
      setDespachada(yaSalio);
      setBPlaca(g.placa || "");
      setBReceptor(g.receptor_nombre || "");
      setBCedula(g.cedula || "");
      setBChofer(g.nombre_chofer || "");
      setDespachadoPor(entregadoPorElegido(g.entregado_por) ? String(g.entregado_por).trim() : "");
      // 🔴 EL MODO ARRANCA EN LO QUE SE ELIGIÓ AL CREAR LA GUÍA.
      // Acá vivía `(g.tipo_despacho as TipoDespacho) || "externo"`, que nunca
      // miraba `modo_entrega`. Y no era un `??` faltante: `tipo_despacho` tiene
      // DEFAULT 'externo' en la base, así que la rama de respaldo era
      // inalcanzable. Medido: 50 de 51 guías creadas como entrega directa
      // terminaron grabadas como transportista externo. Ver `modo-despacho.ts`.
      setTipoDespacho(tipoDespachoEfectivo(g));
      _setNumerosTransp(desdeServidor);
      _setBultosPorLinea(bultosServidor);

    } catch {
      setError("Error al cargar la guía");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void cargar(); }, [cargar]);
  useEffect(() => { limpiarBorradoresViejos("guia_despacho_", "guia_firma_"); }, []);

  // Los juegos del transportista de ESTA guía, del más usado al menos. Solo
  // tiene sentido mientras la guía no haya salido: después, lo que se ve es lo
  // que se firmó.
  const transportistaId = guia?.transportista_id ?? null;
  useEffect(() => {
    if (!transportistaId || despachada) { setJuegos([]); return; }
    let cancel = false;
    fetch(`/api/guias/despachos-frecuentes?transportista=${encodeURIComponent(transportistaId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancel || !d || !Array.isArray(d.juegos)) return;
        setJuegos(d.juegos as JuegoDespacho[]);
      })
      .catch(() => { /* sin sugerencias: los campos se llenan a mano */ });
    return () => { cancel = true; };
  }, [transportistaId, despachada]);

  /** Teclear bultos: entero ≥ 0. */
  const setBultos = (idx: number, v: string) => {
    _setBultosPorLinea((prev) => {
      const next = [...prev];
      next[idx] = bultosTecleados(v);
      return next;
    });
  };
  const setNumeroTransp = (idx: number, v: string) => {
    _setNumerosTransp((prev) => {
      const next = [...prev];
      next[idx] = v;
      return next;
    });
  };
  /**
   * Un toque llena los TRES campos — y los tres quedan editables.
   */
  const usarJuego = (j: JuegoDespacho) => {
    setBReceptor(j.receptor);
    setBCedula(j.cedula);
    setBPlaca(j.placa);
  };


  // ─────────────────────────────────────────────────────────────────────────
  // 🔴 ACÁ VIVÍAN `corregirItem` Y `anotarNumeroTransp`, Y LOS DOS SE FUERON.
  //
  // Daniel, punto 1: *"se retira el «Corregir» por renglón. Un formulario, el
  // MISMO al crear y al editar"*; punto 4: en una guía despachada se corrigen
  // el N° del transportista, el cliente y las facturas — con ese mismo
  // formulario.
  //
  // Las dos escrituras que hacían siguen VIVAS y son las mismas
  // (`PATCH /api/guias/[id]/item` y `PATCH /api/guias/[id]/numero-transp`): lo
  // que cambió es QUIÉN las llama. Ahora las llama `useGuiaFormState`, al
  // guardar el formulario de una guía firmada. Dejarlas acá además habría sido
  // un segundo camino a la misma columna, que es exactamente lo que este
  // cambio vino a sacar.
  // ─────────────────────────────────────────────────────────────────────────


  async function confirmarDespacho(firma1: string, firma2: string) {
    if (!guia || !id) return;
    setBSaving(true);

    const items = guia.guia_items || [];
    // 🔴 EL N° DEL TRANSPORTISTA VIAJA POR LÍNEA. `items_guia_transp` toca UNA
    // columna de cada renglón; NO manda `items`, que en el PUT es un reemplazo
    // completo (borra e inserta) y le cambiaría el id a cada línea en pleno
    // despacho.
    const porLinea = items
      .map((it, i) => ({ id: it.id, numero_guia_transp: (numerosTransp[i] ?? "").trim() }))
      .filter((r): r is { id: string; numero_guia_transp: string } => !!r.id);

    // 🔴 SOLO LO QUE CAMBIÓ. `items_bultos` toca UNA columna de las líneas de
    // ESTA guía —el mismo camino que `items_guia_transp`—, nunca `items`, que
    // es un reemplazo completo. Sin correcciones no viaja el campo.
    const bultosCorregidos = correccionesDeBultos(items, bultosPorLinea);

    const payload: Record<string, unknown> = {
      estado: "Completada",
      tipo_despacho: tipoDespacho,
      receptor_nombre: bReceptor,
      cedula: bCedula,
      firma_base64: firma1,
      firma_entregador_base64: firma2,
    };
    if (bultosCorregidos.length > 0) payload.items_bultos = bultosCorregidos;
    // 🔴 1-oct-2026: quien despacha viaja con el despacho; el servidor lo exige.
    if (GUIA_NUEVA_2026_10) payload.entregado_por = despachadoPor.trim();

    if (tipoDespacho === "externo") {
      payload.placa = bPlaca;
      payload.items_guia_transp = porLinea;
      // La columna de la guía NO se retira: la usan el buscador, el Excel y el
      // encabezado del papel. Se llena con el primer número que haya.
      //
      // 🔴 Y SI NINGUNA LÍNEA TRAE NÚMERO, SE CONSERVA EL QUE YA TENÍA. Desde
      // que las líneas dejaron de nacer con el de la cabecera, lo normal es
      // despachar con las 7 vacías —*"a veces el transportista lo da, a veces
      // no"*—, y sin esto el número que la secretaria escribió al crear la
      // guía se borraría en ese mismo momento, sin que nadie lo pidiera.
      payload.numero_guia_transp = numeroCabeceraAlDespachar(numerosTransp, guia.numero_guia_transp);
    } else {
      // 🔴 EN ENTREGA DIRECTA NO HAY TRANSPORTISTA: es nuestro propio camión.
      // La placa y el N° del transportista no se piden en pantalla, así que
      // tampoco se escriben — y se mandan VACÍOS a propósito, no se omiten: si
      // alguien empezó a llenarlos en modo externo y después tocó "cambiar",
      // omitirlos dejaría esa placa ajena pegada a una guía que salió con
      // nuestro camión. Eso es justo la mentira que este cambio vino a sacar.
      payload.placa = "";
      payload.numero_guia_transp = "";
      payload.items_guia_transp = items
        .map((it) => ({ id: it.id, numero_guia_transp: "" }))
        .filter((r): r is { id: string; numero_guia_transp: string } => !!r.id);
      payload.nombre_chofer = bChofer;
    }

    try {
      const res = await fetch(`/api/guias/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        showToast(`Guía GT-${String(guia.numero).padStart(3, "0")} despachada`);
        setDespachada(true);
        await cargar();
        return true;
      }
      const err = await res.json().catch(() => ({}));
      showToast(err.error || "No se pudo guardar. Intenta de nuevo en unos segundos.");
    } catch {
      showToast("Sin conexión. No cierres esta pantalla: intenta de nuevo en unos segundos.");
    } finally {
      setBSaving(false);
    }
    return false;
  }

  return {
    guia, loading, error, toast, showToast, recargar: cargar,
    despachada,
    tipoDespacho, setTipoDespacho,
    bPlaca, setBPlaca,
    bReceptor, setBReceptor,
    bCedula, setBCedula,
    bChofer, setBChofer,
    despachadoPor, setDespachadoPor,
    juegos, usarJuego,
    numerosTransp, setNumeroTransp,
    bultosPorLinea, setBultos,
    bSaving, confirmarDespacho,
    pendingFirma1, setPendingFirma1,
    pendingFirma2, setPendingFirma2,
  };
}
