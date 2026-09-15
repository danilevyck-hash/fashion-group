"use client";

// ─────────────────────────────────────────────────────────────────────────────
// MARCACIÓN — la pantalla del teléfono (14-sep-2026). Mockup aprobado por
// Daniel: un saludo, la hora grande, UN botón, y abajo sus marcas.
//
// 🔴 LA HORA GRANDE ES LA DEL SERVIDOR. No se dibuja `new Date()`: se dibuja
// `Date.now() + desfase`, donde el desfase es la diferencia contra la hora que
// contestó el servidor. Daniel: *«que no puedan cambiar la hora de su
// teléfono»*. Si alguien mueve el reloj del teléfono, esta pantalla sigue
// diciendo la hora de Panamá — y es la que se va a guardar.
//
// 🔴 EL BOTÓN NO PREGUNTA NADA. Dice «Marcar entrada», después «Marcar
// salida», después se apaga. Qué dice lo decide `estadoDelBoton` del módulo
// puro, contando las marcas del día — las del teléfono, las del reloj físico y
// las que todavía esperan señal, todas juntas.
//
// 🔴 LA HORA SE LEE EN 12 HORAS, Y SOLO ACÁ (14-sep-2026). Daniel: *«quiero
// que la hora salga en formato 12 h»* · *«para la planilla sí se usa formato 24
// horas, ¿no? Formato de 12 horas solo para esto»*. Cómo se ve lo decide
// `enDoceHoras` del módulo puro; esta pantalla NO llama a `horaCorta`, y hay
// candado que lo exige y que exige lo contrario en el reporte.
//
// 🔴 «DESHACER» LA ÚLTIMA MARCA, DOS MINUTOS. Daniel marcó la salida cinco
// minutos después de la entrada, por error de dedo. Pasados los dos minutos el
// botón no está. Deshacer NO borra nada: ver `deshacer.ts`.
//
// ⚠️ SIN SEÑAL: la marca se guarda en el teléfono (`cola-offline.ts`) y se
// manda sola. «Sola» quiere decir: al volver la señal con la pantalla abierta,
// al volver a abrir la app, o cada minuto mientras haya algo esperando. NO hay
// envío en segundo plano con la app cerrada — eso pide tocar el service
// worker, que en esta casa es mínimo a propósito (CLAUDE.md › PWA), y en
// iPhone el Background Sync no existe.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { ROTULO_MARCACION } from "@/lib/marcacion/rol";
import { capitalizarNombre } from "@/lib/nombre-en-pantalla";
import {
  diaCorto,
  diasDeLaQuincena,
  enDoceHoras,
  estadoDelBoton,
  fechaLarga,
  horaAmPm,
  marcasDelDia,
  notaDespuesDe,
  QUIEN_CORRIGE,
  type DiaMarcado,
  type MarcaSimple,
  type TipoMarca,
} from "@/lib/marcacion/marcacion";
import {
  cuentaRegresiva,
  queSeDeshace,
  rotuloDeshacer,
  type Deshacible,
} from "@/lib/marcacion/deshacer";
import {
  borrarPendiente,
  guardarPendiente,
  leerPendientes,
  type MarcaPendiente,
} from "@/lib/marcacion/cola-offline";
import { achicarEnElTelefono } from "@/lib/marcacion/selfie-telefono";

interface EstadoServidor {
  codigo: string | null;
  nombre?: string | null;
  aviso?: string;
  ahora: string;
  hoy?: string;
  quincena?: { desde: string; hasta: string };
  rotuloQuincena?: string;
  marcas?: MarcaSimple[];
  /** Lo que el SERVIDOR dice que se puede deshacer. `null` = nada. */
  deshacer?: Deshacible | null;
}

/** ¿Lo que contestó el servidor es un estado completo? Después de marcar y de
 *  deshacer, la respuesta YA TRAE el estado nuevo: usarlo evita una segunda
 *  vuelta a la red que es justo la que falla cuando la señal está volviendo. */
function esEstado(j: unknown): j is EstadoServidor {
  return typeof j === "object" && j !== null && "ahora" in j && "codigo" in j;
}

/** Cada cuánto se reintenta la cola mientras haya algo esperando. */
const REINTENTO_MS = 60_000;

export default function MarcacionClient() {
  const [estado, setEstado] = useState<EstadoServidor | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  /** Diferencia entre el reloj del servidor y el de este teléfono. */
  const [desfase, setDesfase] = useState<number | null>(null);
  const [ahora, setAhora] = useState<number>(() => Date.now());
  const [enLinea, setEnLinea] = useState(true);
  const [pendientes, setPendientes] = useState<MarcaPendiente[]>([]);

  // Lo que está pasando ahora mismo con la marca.
  const [foto, setFoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [tipoEnCurso, setTipoEnCurso] = useState<TipoMarca | null>(null);
  const [ubicacion, setUbicacion] = useState<GeolocationCoordinates | null>(null);
  const [buscandoUbicacion, setBuscandoUbicacion] = useState(false);
  const [aviso, setAviso] = useState<{ tono: "error" | "guardada" | "listo"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [deshaciendo, setDeshaciendo] = useState(false);

  const archivoRef = useRef<HTMLInputElement | null>(null);
  const enviandoCola = useRef(false);

  // ── El dato del servidor ───────────────────────────────────────────────────

  /** 🔑 UN SOLO LUGAR APLICA UN ESTADO NUEVO. Lo usan la carga, el envío de una
   *  marca y el deshacer: si cada uno lo hiciera a su manera, la pantalla
   *  quedaría distinta según por dónde se llegó. */
  const aplicarEstado = useCallback((j: EstadoServidor) => {
    setEstado(j);
    setDesfase(Date.parse(j.ahora) - Date.now());
    setErrorCarga(null);
  }, []);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/marcacion", { cache: "no-store" });
      const j = (await res.json()) as EstadoServidor & { error?: string };
      if (!res.ok) throw new Error(j.error ?? "No se pudo cargar");
      aplicarEstado(j);
    } catch {
      setErrorCarga("No se pudo cargar tu reloj. Revisa la señal e intenta de nuevo.");
    }
  }, [aplicarEstado]);

  const refrescarCola = useCallback(async () => {
    try {
      setPendientes(await leerPendientes());
    } catch {
      /* un teléfono sin IndexedDB no guarda cola: marcar con señal sigue igual */
    }
  }, []);

  // ── Mandar lo que esperaba señal ───────────────────────────────────────────
  //
  // 🔑 Una por una y en orden: la entrada antes que la salida. Si una falla,
  // se para — la siguiente probablemente falle igual y reintentar en ráfaga
  // solo gasta batería.
  const vaciarCola = useCallback(async () => {
    if (enviandoCola.current) return;
    enviandoCola.current = true;
    // 🩸 SE GUARDA EL ESTADO QUE CONTESTA EL PROPIO ENVÍO (14-sep-2026). Daniel
    // marcó en modo avión; la marca subió sola y perfecta —23:02:59, con su
    // selfie— y LA PANTALLA NO SE ENTERÓ: seguía diciendo «Todavía no tienes
    // marcas», el botón seguía ofreciendo «Marcar entrada» y el aviso viejo
    // seguía prometiendo que se iba a enviar sola. El refresco de después
    // dependía de una SEGUNDA vuelta a la red, justo en el momento en que la
    // señal está volviendo: si esa fallaba, quedaba en pantalla el estado con
    // el que se había abierto la pantalla, y nada lo decía. El riesgo no es
    // cosmético: ella lo lee, cree que no marcó y vuelve a marcar.
    let fresco: EstadoServidor | null = null;
    try {
      const cola = await leerPendientes();
      for (const m of cola) {
        const cuerpo = new FormData();
        cuerpo.set("eventoId", m.eventoId);
        cuerpo.set("tipo", m.tipo);
        cuerpo.set("sinSenal", "1");
        cuerpo.set("horaTelefono", m.horaTelefono);
        cuerpo.set("lat", String(m.lat));
        cuerpo.set("lng", String(m.lng));
        if (m.precisionM !== null) cuerpo.set("precisionM", String(m.precisionM));
        cuerpo.set("selfie", m.selfie, "selfie.jpg");
        let res: Response;
        try {
          res = await fetch("/api/marcacion", { method: "POST", body: cuerpo });
        } catch {
          break; // sigue sin señal: se queda en la cola, se reintenta después
        }
        // 🔴 SE SACA DE LA COLA CUANDO EL SERVIDOR LA ACEPTA **O** CUANDO DICE
        // QUE NO LA VA A ACEPTAR NUNCA (400/409: hora imposible, día ya
        // cerrado). Dejarla ahí la haría reintentar para siempre. Un 500 sí se
        // reintenta: eso sí se puede arreglar solo.
        if (res.ok || res.status === 400 || res.status === 409) {
          await borrarPendiente(m.eventoId);
          if (res.ok) {
            const j = await res.json().catch(() => null);
            if (esEstado(j)) fresco = j;
          }
        } else {
          break;
        }
      }
    } finally {
      enviandoCola.current = false;
      await refrescarCola();
      // Con el estado que vino en la respuesta no hace falta pedirlo de nuevo.
      if (fresco) aplicarEstado(fresco);
      else await cargar();
    }
  }, [aplicarEstado, cargar, refrescarCola]);

  // La regla de la casa: los éxitos se van solos a los 3 s; los errores y los
  // avisos se quedan hasta que dejan de ser ciertos.
  useEffect(() => {
    if (aviso?.tono !== "listo") return;
    const t = setTimeout(() => setAviso(null), 3000);
    return () => clearTimeout(t);
  }, [aviso]);

  useEffect(() => {
    setEnLinea(navigator.onLine);
    void cargar();
    void refrescarCola();
    void vaciarCola();

    const arriba = () => {
      setEnLinea(true);
      void vaciarCola();
    };
    const abajo = () => setEnLinea(false);
    const volvio = () => {
      if (document.visibilityState === "visible") {
        setEnLinea(navigator.onLine);
        void cargar();
        void vaciarCola();
      }
    };
    window.addEventListener("online", arriba);
    window.addEventListener("offline", abajo);
    document.addEventListener("visibilitychange", volvio);
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    const reintento = setInterval(() => void vaciarCola(), REINTENTO_MS);
    return () => {
      window.removeEventListener("online", arriba);
      window.removeEventListener("offline", abajo);
      document.removeEventListener("visibilitychange", volvio);
      clearInterval(reloj);
      clearInterval(reintento);
    };
  }, [cargar, refrescarCola, vaciarCola]);

  // ── Qué se dibuja ──────────────────────────────────────────────────────────
  //
  // 🔑 LAS MISMAS FUNCIONES QUE EL SERVIDOR, sobre las marcas del servidor MÁS
  // las que esperan señal. Por eso después de una marca sin señal el botón ya
  // dice «Marcar salida»: no hay una segunda regla escrita acá.
  const instanteServidor = desfase === null ? ahora : ahora + desfase;
  const isoServidor = new Date(instanteServidor).toISOString();
  // 🔴 LA HORA GRANDE ES SIEMPRE LA QUE VA A QUEDAR GUARDADA. Con señal es la
  // del servidor; sin señal, la del teléfono — porque sin señal esa es la que
  // se guarda, y la pantalla no puede prometer una hora y guardar otra.
  const isoQueCuenta = enLinea ? isoServidor : new Date(ahora).toISOString();
  const hoy = horaISOaDia(isoQueCuenta);
  const todas: MarcaSimple[] = [
    ...(estado?.marcas ?? []),
    ...pendientes.map((p) => ({ ocurrioEn: p.horaTelefono })),
  ];
  const marcasHoy = marcasDelDia(todas, hoy);
  const boton = estadoDelBoton(marcasHoy);
  const nota = notaDespuesDe(marcasHoy);
  const dias = diasDeLaQuincena(todas, hoy);
  const hoyMarcado = dias.find((d) => d.fecha === hoy) ?? null;

  // 🔴 QUÉ SE PUEDE DESHACER — la última marca, dos minutos. La regla entera
  // vive en el módulo puro; acá solo se le pasan las dos fuentes y los dos
  // relojes. Pasados los dos minutos esto es `null` y el botón no se dibuja.
  const sePuedeDeshacer = queSeDeshace({
    servidor: estado?.deshacer ?? null,
    pendientes: pendientes.map((p) => ({
      eventoId: p.eventoId,
      tipo: p.tipo,
      horaTelefono: p.horaTelefono,
    })),
    ahoraServidorIso: isoServidor,
    ahoraTelefonoIso: new Date(ahora).toISOString(),
  });

  // 🔴 EL AVISO «se va a enviar sola» NO PUEDE SOBREVIVIR A LA COLA. Daniel vio
  // en su iPhone «Conexión restaurada» en verde y, justo debajo, «Se va a
  // enviar sola cuando vuelva la señal» — dos avisos que se contradicen, con la
  // marca ya guardada. Se DERIVA de que quede algo esperando, así no puede
  // quedarse pegado por olvidarse de apagarlo en algún camino.
  const avisoVisible =
    aviso && (aviso.tono !== "guardada" || pendientes.length > 0) ? aviso : null;

  // ── Marcar ─────────────────────────────────────────────────────────────────

  /** La cámara se abre sola: el botón dispara el `<input capture>` escondido.
   *  Tiene que pasar DENTRO del toque — en iPhone, un `click()` fuera del
   *  gesto no abre nada y no dice por qué. */
  function tocarBoton() {
    if (boton.apagado || !boton.tipo) return;
    setAviso(null);
    setTipoEnCurso(boton.tipo);
    archivoRef.current?.click();
  }

  async function llegoLaFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = ""; // volver a tomarla tiene que poder elegir el mismo nombre
    if (!archivo) {
      setTipoEnCurso(null);
      return;
    }
    const chica = await achicarEnElTelefono(archivo);
    setFoto({ blob: chica, url: URL.createObjectURL(chica) });
    void pedirUbicacion();
  }

  function pedirUbicacion() {
    return new Promise<GeolocationCoordinates | null>((resolve) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        setAviso({ tono: "error", texto: "Este teléfono no puede dar la ubicación, y sin ella no se puede marcar." });
        resolve(null);
        return;
      }
      setBuscandoUbicacion(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setBuscandoUbicacion(false);
          setUbicacion(pos.coords);
          setAviso(null);
          resolve(pos.coords);
        },
        () => {
          setBuscandoUbicacion(false);
          setUbicacion(null);
          setAviso({
            tono: "error",
            texto: "Falta la ubicación. Acepta el permiso de ubicación para poder marcar.",
          });
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
      );
    });
  }

  function cancelarFoto() {
    if (foto) URL.revokeObjectURL(foto.url);
    setFoto(null);
    setTipoEnCurso(null);
    setAviso(null);
  }

  async function enviar() {
    if (!foto || !tipoEnCurso || enviando) return;
    const coords = ubicacion ?? (await pedirUbicacion());
    if (!coords) return;

    setEnviando(true);
    setAviso(null);
    // La hora de la FOTO es la de este teléfono. Con señal no se usa —manda la
    // del servidor—, pero viaja siempre: es el testigo de las dos horas.
    const horaTelefono = new Date().toISOString();
    const eventoId = nuevoId();
    const pendiente: MarcaPendiente = {
      eventoId,
      tipo: tipoEnCurso,
      horaTelefono,
      lat: coords.latitude,
      lng: coords.longitude,
      precisionM: Number.isFinite(coords.accuracy) ? Math.round(coords.accuracy) : null,
      selfie: foto.blob,
      intentos: 0,
    };

    const guardarParaDespues = async (texto: string) => {
      try {
        await guardarPendiente(pendiente);
        await refrescarCola();
        setAviso({ tono: "guardada", texto });
      } catch {
        setAviso({
          tono: "error",
          texto: "No hay señal y este teléfono no pudo guardar la marca. Busca señal y vuelve a marcar.",
        });
      }
    };

    try {
      if (!navigator.onLine) {
        await guardarParaDespues("Se va a enviar sola cuando vuelva la señal.");
        cerrarFoto();
        return;
      }
      const cuerpo = new FormData();
      cuerpo.set("eventoId", eventoId);
      cuerpo.set("tipo", tipoEnCurso);
      cuerpo.set("sinSenal", "0");
      cuerpo.set("horaTelefono", horaTelefono);
      cuerpo.set("lat", String(pendiente.lat));
      cuerpo.set("lng", String(pendiente.lng));
      if (pendiente.precisionM !== null) cuerpo.set("precisionM", String(pendiente.precisionM));
      cuerpo.set("selfie", foto.blob, "selfie.jpg");

      let res: Response;
      try {
        res = await fetch("/api/marcacion", { method: "POST", body: cuerpo });
      } catch {
        // Se cortó en el camino. No se sabe si entró: se guarda con el MISMO
        // `eventoId`, y si había entrado el servidor la reconoce y la descarta.
        await guardarParaDespues("Se va a enviar sola cuando vuelva la señal.");
        cerrarFoto();
        return;
      }
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setAviso({ tono: "error", texto: j.error ?? "No se pudo marcar. Intenta de nuevo." });
        return;
      }
      cerrarFoto();
      // El POST contesta con el estado nuevo: se usa ése. Ver la nota de
      // `vaciarCola` — una segunda vuelta a la red es una que puede fallar.
      if (esEstado(j)) aplicarEstado(j as EstadoServidor);
      else await cargar();
    } finally {
      setEnviando(false);
    }
  }

  /**
   * DESHACER la última marca.
   *
   * 🔴 Dos puertas y una sola regla: lo que todavía no salió del teléfono se
   * saca de la cola —nunca fue una marca, no hay nada que anular— y lo que ya
   * está guardado se quita con una corrección firmada, que la escribe el
   * SERVIDOR. Acá no se nombra ninguna marca: el servidor vuelve a calcular
   * cuál es la última y si todavía está dentro de los dos minutos.
   */
  async function deshacer() {
    if (!sePuedeDeshacer || deshaciendo) return;
    const { donde, tipo } = sePuedeDeshacer;
    setDeshaciendo(true);
    setAviso(null);
    try {
      if (donde === "telefono") {
        await borrarPendiente(sePuedeDeshacer.eventoId);
        await refrescarCola();
        setAviso({ tono: "listo", texto: `Listo, se deshizo la ${tipo}. Puedes marcar de nuevo.` });
        return;
      }
      let res: Response;
      try {
        res = await fetch("/api/marcacion/deshacer", { method: "POST" });
      } catch {
        setAviso({ tono: "error", texto: "No hay señal para deshacerla. Intenta de nuevo en unos segundos." });
        return;
      }
      const j = (await res.json()) as { error?: string; aviso?: string };
      if (!res.ok) {
        setAviso({ tono: "error", texto: j.error ?? "No se pudo deshacer. Intenta de nuevo." });
        // Lo que el servidor sepa manda: puede que ya no se pueda deshacer.
        await cargar();
        return;
      }
      if (esEstado(j)) aplicarEstado(j as EstadoServidor);
      else await cargar();
      setAviso({ tono: "listo", texto: j.aviso ?? `Listo, se deshizo la ${tipo}.` });
    } finally {
      setDeshaciendo(false);
    }
  }

  function cerrarFoto() {
    if (foto) URL.revokeObjectURL(foto.url);
    setFoto(null);
    setTipoEnCurso(null);
    setUbicacion(null);
  }

  // ── Pintura ────────────────────────────────────────────────────────────────

  const sinCodigo = estado !== null && !estado.codigo;

  return (
    <div className="min-h-screen bg-white">
      {/* 🔴 El breadcrumb lleva el RÓTULO, no la key. Sin esto el encabezado
          escribía «marcacion» en minúscula y sin tilde, que es el nombre
          interno del módulo y no el que nadie debería leer (14-sep-2026). */}
      <AppHeader module="marcacion" breadcrumbs={[{ label: ROTULO_MARCACION }]} />
      <input
        ref={archivoRef}
        type="file"
        accept="image/*"
        capture="user"
        onChange={llegoLaFoto}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      <main className="mx-auto w-full max-w-md px-4 pb-16 pt-6">
        {errorCarga && !estado && (
          <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-700">
            {errorCarga}
          </p>
        )}

        {/* 🩸 Y CON LA PANTALLA YA DIBUJADA TAMBIÉN SE DICE. Antes el error de
            refresco solo se mostraba cuando no había NADA en pantalla: con algo
            cargado, una lectura caída dejaba a la vista el estado viejo como si
            fuera la verdad — que es cómo alguien lee «Todavía no tienes marcas»
            después de haber marcado. */}
        {errorCarga && estado && (
          <p className="mb-3 text-sm text-gray-500">{errorCarga}</p>
        )}

        {sinCodigo && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
            {estado?.aviso}
          </p>
        )}

        {estado?.codigo && !foto && (
          <>
            <p className="text-sm text-gray-600">
              Hola, <b className="font-semibold text-black">{capitalizarNombre(estado.nombre) || `Código ${estado.codigo}`}</b>
            </p>

            {/* 🔴 12 HORAS, y es la hora que se va a GUARDAR (ver el encabezado). */}
            <p className="mt-3 text-[46px] font-semibold leading-none tracking-tight tabular-nums">
              {horaAmPm(isoQueCuenta)}
            </p>
            <p className="mt-2 text-sm text-gray-500">
              {enLinea
                ? `${fechaLarga(hoy)} · hora de Panamá`
                : "Hora de tu teléfono · sin señal"}
            </p>

            {/* Lo que ya marcó hoy. Nunca «0 marcas»: si no marcó, no se dice. */}
            {hoyMarcado && (
              <p className="mt-4 rounded-md bg-green-50 px-3 py-2.5 text-sm font-medium text-green-800">
                ✓ {hoyMarcado.salida
                  ? `Entrada ${enDoceHoras(hoyMarcado.entrada)} · Salida ${enDoceHoras(hoyMarcado.salida)}`
                  : `Entrada de hoy: ${enDoceHoras(hoyMarcado.entrada)}`}
              </p>
            )}

            {/* 🔴 DESHACER LA ÚLTIMA MARCA — dos minutos, y después no está.
                Va pegado a lo que deshace. No pregunta «¿estás seguro?»: la
                ventana de dos minutos ES el freno, y si se toca por error se
                vuelve a marcar. */}
            {sePuedeDeshacer && (
              <button
                type="button"
                onClick={deshacer}
                disabled={deshaciendo}
                className="mt-2 min-h-[44px] w-full rounded-md px-3 py-2 text-sm text-gray-600 underline decoration-dotted underline-offset-2 transition active:scale-[0.97] disabled:text-gray-400"
              >
                {deshaciendo
                  ? "Deshaciendo…"
                  : `${rotuloDeshacer(sePuedeDeshacer.tipo)} · ${cuentaRegresiva(sePuedeDeshacer.restanMs)}`}
              </button>
            )}

            {avisoVisible && (
              <p
                className={`mt-3 rounded-md px-3 py-2.5 text-sm font-medium ${
                  avisoVisible.tono === "error"
                    ? "bg-red-50 text-red-800"
                    : avisoVisible.tono === "listo"
                      ? "bg-green-50 text-green-800"
                      : "bg-amber-50 text-amber-900"
                }`}
              >
                {avisoVisible.texto}
              </p>
            )}

            {pendientes.length > 0 && (
              <p className="mt-3 rounded-md bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-900">
                {pendientes.length === 1
                  ? "Una marca está esperando señal. Se va a enviar sola."
                  : `${pendientes.length} marcas están esperando señal. Se van a enviar solas.`}
              </p>
            )}

            {nota && <p className="mt-3 text-sm text-gray-600">{nota}</p>}

            <button
              type="button"
              onClick={tocarBoton}
              disabled={boton.apagado}
              className={`mt-6 min-h-[56px] w-full rounded-md px-4 py-4 text-base font-semibold transition active:scale-[0.97] ${
                boton.apagado
                  ? "cursor-default border border-gray-200 bg-gray-100 text-gray-500"
                  : "bg-black text-white"
              }`}
            >
              {boton.texto}
            </button>

            <MisMarcas dias={dias} rotulo={estado.rotuloQuincena ?? ""} hoy={hoy} />
          </>
        )}

        {/* ── La selfie ──────────────────────────────────────────────────── */}
        {foto && (
          <>
            <p className="text-sm text-gray-600">
              {tipoEnCurso === "entrada" ? "Entrada" : "Salida"} ·{" "}
              <span className="tabular-nums">{horaAmPm(isoQueCuenta)}</span>
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={foto.url}
              alt="Tu selfie"
              className="mt-3 w-full rounded-lg border border-gray-200 object-cover"
            />
            {buscandoUbicacion && (
              <p className="mt-3 text-sm text-gray-500">Buscando tu ubicación…</p>
            )}
            {aviso && (
              <p
                className={`mt-3 rounded-md px-3 py-2.5 text-sm font-medium ${
                  aviso.tono === "error" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"
                }`}
              >
                {aviso.texto}
              </p>
            )}
            <button
              type="button"
              onClick={enviar}
              disabled={enviando || buscandoUbicacion}
              className="mt-4 min-h-[56px] w-full rounded-md bg-black px-4 py-4 text-base font-semibold text-white transition active:scale-[0.97] disabled:bg-gray-300"
            >
              {enviando ? "Enviando…" : "Enviar"}
            </button>
            <button
              type="button"
              onClick={cancelarFoto}
              className="mt-2 min-h-[44px] w-full rounded-md px-4 py-2 text-sm text-gray-600 underline decoration-dotted underline-offset-2"
            >
              Volver a tomarla
            </button>
          </>
        )}
      </main>
    </div>
  );
}

/** «Mis marcas» de la quincena. Ella ve sus horas y nada más. */
function MisMarcas({ dias, rotulo, hoy }: { dias: DiaMarcado[]; rotulo: string; hoy: string }) {
  if (dias.length === 0) {
    return (
      <p className="mt-8 text-sm text-gray-500">
        Todavía no tienes marcas en esta quincena.
      </p>
    );
  }
  return (
    <section className="mt-8">
      <h2 className="flex items-baseline justify-between text-sm font-semibold text-black">
        Mis marcas
        <span className="text-sm font-normal text-gray-500">{rotulo}</span>
      </h2>
      <ul className="mt-2 divide-y divide-gray-100">
        {dias.map((d) => (
          <li key={d.fecha} className="flex items-center justify-between py-2.5 text-sm tabular-nums">
            <span className="text-gray-600">{diaCorto(d.fecha)}</span>
            {d.salida ? (
              <span className="font-semibold">{enDoceHoras(d.entrada)} – {enDoceHoras(d.salida)}</span>
            ) : d.faltaSalida ? (
              <span className="font-semibold text-amber-700">falta la salida</span>
            ) : (
              <span className="font-semibold">
                {enDoceHoras(d.entrada)}{d.fecha === hoy ? " –" : ""}
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-gray-500">Si algo está mal, avísale a {QUIEN_CORRIGE}.</p>
    </section>
  );
}

/** El día de Panamá de un instante, sin importar el módulo entero. */
function horaISOaDia(iso: string): string {
  return new Date(Date.parse(iso) - 5 * 3600_000).toISOString().slice(0, 10);
}


/** Un identificador para esta marca. `randomUUID` donde existe; si no, uno
 *  armado a mano — un navegador viejo no puede quedarse sin poder marcar. */
function nuevoId(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
