"use client";

// Estado de LA PÁGINA DE UNA GUÍA (`/guias/[id]`): trae la guía, guarda lo que
// se va tipeando y confirma el despacho.
//
// 🩸 Antes esto vivía dentro de `useGuiasState`, el hook de la LISTA, porque el
// formulario de despacho se desplegaba dentro de la fila. Con el despacho en su
// propia pantalla, la lista dejó de necesitarlo: quedarse con esos campos allá
// habría dejado el estado del despacho vivo en una pantalla que ya no despacha.
//
// ⚠️ EL BORRADOR SE GUARDA POR GUÍA, igual que antes. La PWA se recarga sola al
// haber build nuevo y en la bodega el WiFi se cae: lo tipeado y lo firmado
// sobreviven a eso. Lo nuevo es que los N° del transportista también, uno por
// línea (`numerosTransp`).

import { useCallback, useEffect, useState } from "react";
import type { Guia, GuiaItem } from "./types";
import type { TipoDespacho } from "@/lib/guias/falta-para-despachar";
import { numeroCabeceraAlDespachar } from "@/lib/guias/falta-para-despachar";
import { guiaYaDespachada, tipoDespachoEfectivo } from "@/lib/guias/modo-despacho";
import type { JuegoDespacho } from "@/lib/guias/juegos-despacho";
import { bultosTecleados, correccionesDeBultos } from "@/lib/guias/bultos-correccion";

interface Draft {
  placa?: string;
  receptor?: string;
  cedula?: string;
  chofer?: string;
  tipoDespacho?: TipoDespacho;
  numerosTransp?: string[];
  /** Los bultos que bodega contó, uno por línea (5-sep-2026). */
  bultos?: number[];
}

function leerDraft(id: string): Draft {
  try {
    return JSON.parse(localStorage.getItem(`guia_despacho_${id}`) || "{}") as Draft;
  } catch {
    return {};
  }
}

function escribirDraft(id: string, campo: keyof Draft, valor: unknown) {
  try {
    const cur = leerDraft(id) as Record<string, unknown>;
    cur[campo] = valor;
    localStorage.setItem(`guia_despacho_${id}`, JSON.stringify(cur));
  } catch {
    /* sin borrador; la pantalla sigue funcionando */
  }
}

export function useDespachoGuia(id: string | null) {
  const [guia, setGuia] = useState<Guia | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [tipoDespacho, _setTipoDespacho] = useState<TipoDespacho>("externo");
  const [bPlaca, _setBPlaca] = useState("");
  const [bReceptor, _setBReceptor] = useState("");
  const [bCedula, _setBCedula] = useState("");
  const [bChofer, _setBChofer] = useState("");
  const [numerosTransp, _setNumerosTransp] = useState<string[]>([]);
  /**
   * 🔴 LOS BULTOS QUE BODEGA CUENTA AL DESPACHAR (5-sep-2026). Daniel: *«porque
   * bodega si al despachar cuentan más bultos de lo que puso la secretaria,
   * quiero que lo pueda cambiar en caso de algún error»*. Arranca con lo que la
   * secretaria puso; lo tecleado sobrevive a que se caiga el WiFi de la bodega,
   * igual que el N° del transportista.
   */
  const [bultosPorLinea, _setBultosPorLinea] = useState<number[]>([]);
  const [bSaving, setBSaving] = useState(false);
  const [pendingFirma1, _setPendingFirma1] = useState<string | null>(null);
  const [pendingFirma2, _setPendingFirma2] = useState<string | null>(null);
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
      _setBPlaca(g.placa || "");
      _setBReceptor(g.receptor_nombre || "");
      _setBCedula(g.cedula || "");
      _setBChofer(g.nombre_chofer || "");
      // 🔴 EL MODO ARRANCA EN LO QUE SE ELIGIÓ AL CREAR LA GUÍA.
      // Acá vivía `(g.tipo_despacho as TipoDespacho) || "externo"`, que nunca
      // miraba `modo_entrega`. Y no era un `??` faltante: `tipo_despacho` tiene
      // DEFAULT 'externo' en la base, así que la rama de respaldo era
      // inalcanzable. Medido: 50 de 51 guías creadas como entrega directa
      // terminaron grabadas como transportista externo. Ver `modo-despacho.ts`.
      _setTipoDespacho(tipoDespachoEfectivo(g));
      _setNumerosTransp(desdeServidor);
      _setBultosPorLinea(bultosServidor);

      try {
        const f1 = localStorage.getItem(`guia_firma_${id}_transportista`);
        const f2 = localStorage.getItem(`guia_firma_${id}_entregador`);
        if (f1) _setPendingFirma1(f1);
        if (f2) _setPendingFirma2(f2);
        // El borrador solo pisa lo que el servidor NO trae.
        const d = leerDraft(id);
        if (d.placa && !g.placa) _setBPlaca(d.placa);
        if (d.receptor && !g.receptor_nombre) _setBReceptor(d.receptor);
        if (d.cedula && !g.cedula) _setBCedula(d.cedula);
        if (d.chofer && !g.nombre_chofer) _setBChofer(d.chofer);
        // El borrador manda mientras la guía NO haya salido: es lo que la
        // persona eligió con "cambiar". La condición vieja era
        // `!g.tipo_despacho`, o sea NUNCA (la columna trae DEFAULT 'externo'):
        // cambiar el modo y perder la conexión te devolvía al modo del alta.
        if (d.tipoDespacho && !yaSalio) _setTipoDespacho(d.tipoDespacho);
        if (Array.isArray(d.numerosTransp)) {
          _setNumerosTransp(
            desdeServidor.map((v, i) => (v ? v : (d.numerosTransp?.[i] ?? "")))
          );
        }
        // ⚠️ El borrador de bultos SOLO manda mientras la guía no salió, y solo
        // si tiene el mismo largo que los renglones: con una línea agregada o
        // quitada, las posiciones ya no son las mismas y aplicarlo movería
        // bultos de un cliente a otro.
        if (
          !yaSalio &&
          Array.isArray(d.bultos) &&
          d.bultos.length === bultosServidor.length
        ) {
          _setBultosPorLinea(
            bultosServidor.map((v, i) => {
              const guardado = Number(d.bultos?.[i]);
              return Number.isFinite(guardado) && guardado >= 0 ? guardado : v;
            }),
          );
        }
      } catch {
        /* sin borrador */
      }
    } catch {
      setError("Error al cargar la guía");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void cargar(); }, [cargar]);

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

  // ── setters que además guardan el borrador ────────────────────────────────
  const setBPlaca = (v: string) => { _setBPlaca(v); if (id) escribirDraft(id, "placa", v); };
  const setBReceptor = (v: string) => { _setBReceptor(v); if (id) escribirDraft(id, "receptor", v); };
  const setBCedula = (v: string) => { _setBCedula(v); if (id) escribirDraft(id, "cedula", v); };
  const setBChofer = (v: string) => { _setBChofer(v); if (id) escribirDraft(id, "chofer", v); };
  const setTipoDespacho = (v: TipoDespacho) => { _setTipoDespacho(v); if (id) escribirDraft(id, "tipoDespacho", v); };
  /** Teclear bultos: entero ≥ 0, y al borrador — como todo lo del despacho. */
  const setBultos = (idx: number, v: string) => {
    _setBultosPorLinea((prev) => {
      const next = [...prev];
      next[idx] = bultosTecleados(v);
      if (id) escribirDraft(id, "bultos", next);
      return next;
    });
  };
  const setNumeroTransp = (idx: number, v: string) => {
    _setNumerosTransp((prev) => {
      const next = [...prev];
      next[idx] = v;
      if (id) escribirDraft(id, "numerosTransp", next);
      return next;
    });
  };
  /**
   * Un toque llena los TRES campos — y los tres quedan editables. Pasa por los
   * setters de siempre, así que el borrador también los guarda: si se corta el
   * WiFi en la bodega, lo tomado no se pierde.
   */
  const usarJuego = (j: JuegoDespacho) => {
    setBReceptor(j.receptor);
    setBCedula(j.cedula);
    setBPlaca(j.placa);
  };

  const setPendingFirma1 = (v: string | null) => {
    _setPendingFirma1(v);
    try {
      if (!id) return;
      if (v) localStorage.setItem(`guia_firma_${id}_transportista`, v);
      else localStorage.removeItem(`guia_firma_${id}_transportista`);
    } catch { /* */ }
  };
  const setPendingFirma2 = (v: string | null) => {
    _setPendingFirma2(v);
    try {
      if (!id) return;
      if (v) localStorage.setItem(`guia_firma_${id}_entregador`, v);
      else localStorage.removeItem(`guia_firma_${id}_entregador`);
    } catch { /* */ }
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
        try {
          localStorage.removeItem(`guia_firma_${id}_transportista`);
          localStorage.removeItem(`guia_firma_${id}_entregador`);
          localStorage.removeItem(`guia_despacho_${id}`);
        } catch { /* */ }
        setDespachada(true);
        await cargar();
        return true;
      }
      const err = await res.json().catch(() => ({}));
      showToast(err.error || "No se pudo guardar. Intenta de nuevo en unos segundos.");
    } catch {
      showToast("Sin conexión. Tus datos y firmas quedaron guardados — intenta de nuevo.");
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
    juegos, usarJuego,
    numerosTransp, setNumeroTransp,
    bultosPorLinea, setBultos,
    bSaving, confirmarDespacho,
    pendingFirma1, setPendingFirma1,
    pendingFirma2, setPendingFirma2,
  };
}
