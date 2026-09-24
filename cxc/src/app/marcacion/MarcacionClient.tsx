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
import { BloquesDelEsqueleto } from "./EsqueletoMarcacion";
import { ROTULO_MARCACION } from "@/lib/marcacion/rol";
import { capitalizarNombre } from "@/lib/nombre-en-pantalla";
import {
  diasDeLaQuincena,
  estadoDelBoton,
  fechaLarga,
  horaAmPm,
  marcasDelDia,
  notaDespuesDe,
  type MarcaSimple,
  type TipoMarca,
} from "@/lib/marcacion/marcacion";
import { queSeDeshace, type Deshacible } from "@/lib/marcacion/deshacer";
import {
  borrarPendiente,
  guardarPendiente,
  leerPendientes,
  type MarcaPendiente,
} from "@/lib/marcacion/cola-offline";
import { achicarEnElTelefono } from "@/lib/marcacion/selfie-telefono";
import PantallaUnToque from "./PantallaUnToque";
import PantallaDeAntes from "./PantallaDeAntes";
import {
  AVISO_UBICACION_NEGADA,
  botonUnToque,
  CAPTURE_CAMARA,
  CLASES_AIRE_PARA_EL_BOTON,
  faltoLaSalidaDeAyer,
  MARCACION_UN_TOQUE,
} from "@/lib/marcacion/un-toque";

export interface EstadoServidor {
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

/** El instante de la semilla del servidor, o `null` si no vino o vino rota. */
function instanteDeLaSemilla(inicial: EstadoServidor | null): number | null {
  if (!inicial) return null;
  const t = Date.parse(inicial.ahora);
  return Number.isFinite(t) ? t : null;
}

export default function MarcacionClient({ inicial = null }: { inicial?: EstadoServidor | null }) {
  // ───────────────────────────────────────────────────────────────────────────
  // 🔴 EL PRIMER PINTADO ES EL DE VERDAD (19-sep-2026). `inicial` viene del
  // SERVIDOR (ver `page.tsx`): con él, el saludo, la hora y el botón se dibujan
  // en el primer cuadro y Ana no ve el blanco que veía. Sin él —solo si la base
  // no contestó— esto arranca en `null` y se pide desde el navegador como
  // siempre, pero dibujando el ESQUELETO, nunca un blanco.
  //
  // 🔴 Y EL RELOJ ARRANCA EN LA HORA DEL SERVIDOR, NO EN LA DEL TELÉFONO: con
  // semilla, `ahora` arranca en el instante que dijo el servidor y el desfase
  // en 0, así que ese primer cuadro dibuja EXACTAMENTE `inicial.ahora`. No es
  // una hora inventada: es la que contestó el servidor. Un segundo después el
  // efecto de abajo vuelve a medir el desfase contra este teléfono y el reloj
  // empieza a caminar, anclado ahí. Que el servidor y el navegador dibujen el
  // MISMO texto en el primer cuadro es además lo que evita que React tenga que
  // corregir la hidratación — que se vería como un parpadeo.
  // ───────────────────────────────────────────────────────────────────────────
  const semilla = instanteDeLaSemilla(inicial);
  const [estado, setEstado] = useState<EstadoServidor | null>(inicial);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  /** Diferencia entre el reloj del servidor y el de este teléfono. */
  const [desfase, setDesfase] = useState<number | null>(semilla === null ? null : 0);
  const [ahora, setAhora] = useState<number>(() => semilla ?? Date.now());
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
    // 🔴 ACÁ EL RELOJ EMPIEZA A CAMINAR. Hasta este momento se dibujó, quieta,
    // la hora que mandó el servidor. Ahora se mide cuánto le lleva (o le
    // atrasa) el reloj de este teléfono a esa hora, y a partir de ahí el reloj
    // corre anclado en la del servidor: si alguien mueve la hora del teléfono,
    // esta pantalla no se mueve. La carga de abajo lo vuelve a medir más fino.
    // 🔑 LAS DOS COSAS CON EL MISMO INSTANTE. `ahora` deja de ser la hora de la
    // semilla y pasa a ser el reloj de este teléfono, y el desfase compensa
    // exactamente esa diferencia: `ahora + desfase` sigue dando la hora del
    // servidor, sin un salto de un cuadro al otro. Medirlos por separado es
    // cómo el reloj se iría tres horas para atrás en el primer tic.
    if (semilla !== null) {
      const enEsteTelefono = Date.now();
      setAhora(enEsteTelefono);
      setDesfase(semilla - enEsteTelefono);
    }
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
  }, [cargar, refrescarCola, semilla, vaciarCola]);

  // 🔴 LA UBICACIÓN SE PIDE AL ABRIR (24-sep-2026), no después de la foto.
  // Antes se pedía recién con la foto ya tomada: si el permiso estaba negado,
  // la caja roja aparecía DESPUÉS de gastar la foto y sin decir dónde se
  // arregla. Ahora, si falta, se sabe antes de abrir la cámara — y el botón
  // sigue funcionando: se vuelve a pedir al marcar, por si ya lo aceptó.
  const ubicacionPedida = useRef(false);
  useEffect(() => {
    if (!MARCACION_UN_TOQUE) return;
    if (ubicacionPedida.current) return;
    if (!estado?.codigo) return;
    ubicacionPedida.current = true;
    void pedirUbicacion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado?.codigo]);

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
  // 🔴 LA MISMA REGLA, UN TEXTO DISTINTO. `botonUnToque` no vuelve a contar
  // nada: llama a `estadoDelBoton` y solo cambia «Ya marcaste hoy» por «Listo
  // por hoy». Con el interruptor apagado, el botón de siempre.
  const boton = MARCACION_UN_TOQUE ? botonUnToque(marcasHoy) : estadoDelBoton(marcasHoy);
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
    // 🔴 ACEPTAR LA FOTO ES MARCAR (24-sep-2026). La cámara de iOS ya preguntó
    // «¿Usar foto?»: volver a pedir «Enviar» era el cuarto toque, el que sobra.
    // La red es «Deshacer», los 2 minutos de siempre.
    if (MARCACION_UN_TOQUE) {
      const tipo = tipoEnCurso ?? boton.tipo;
      if (!tipo) return;
      await enviarMarca(chica, tipo);
      return;
    }
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
          // 🔴 CON EL INTERRUPTOR NUEVO SE DICE DÓNDE SE ARREGLA. En iPhone un
          // permiso negado no se vuelve a preguntar: el texto de antes se
          // repetía para siempre sin salida.
          setAviso({
            tono: "error",
            texto: MARCACION_UN_TOQUE
              ? AVISO_UBICACION_NEGADA
              : "Falta la ubicación. Acepta el permiso de ubicación para poder marcar.",
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

  /** El botón «Enviar» de la pantalla de antes. Con el interruptor nuevo esa
   *  pantalla no existe: la foto aceptada llama directo a `enviarMarca`. */
  async function enviar() {
    if (!foto || !tipoEnCurso) return;
    await enviarMarca(foto.blob, tipoEnCurso);
  }

  /**
   * MANDAR LA MARCA. Recibe la foto y el tipo POR PARÁMETRO y no del estado:
   * con «aceptar la foto es marcar» el envío ocurre en el mismo tic en que
   * llega la foto, y un `setState` todavía no se leyó.
   */
  async function enviarMarca(blob: Blob, tipoDeLaMarca: TipoMarca) {
    if (enviando) return;
    const coords = ubicacion ?? (await pedirUbicacion());
    if (!coords) {
      // Sin ubicación no se puede marcar (el servidor la exige). Se dijo qué
      // falta; el botón vuelve a quedar disponible.
      if (MARCACION_UN_TOQUE) setTipoEnCurso(null);
      return;
    }
    setEnviando(true);
    setAviso(null);
    // La hora de la FOTO es la de este teléfono. Con señal no se usa —manda la
    // del servidor—, pero viaja siempre: es el testigo de las dos horas.
    const horaTelefono = new Date().toISOString();
    const eventoId = nuevoId();
    const pendiente: MarcaPendiente = {
      eventoId,
      tipo: tipoDeLaMarca,
      horaTelefono,
      lat: coords.latitude,
      lng: coords.longitude,
      precisionM: Number.isFinite(coords.accuracy) ? Math.round(coords.accuracy) : null,
      selfie: blob,
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
      cuerpo.set("tipo", tipoDeLaMarca);
      cuerpo.set("sinSenal", "0");
      cuerpo.set("horaTelefono", horaTelefono);
      cuerpo.set("lat", String(pendiente.lat));
      cuerpo.set("lng", String(pendiente.lng));
      if (pendiente.precisionM !== null) cuerpo.set("precisionM", String(pendiente.precisionM));
      cuerpo.set("selfie", blob, "selfie.jpg");

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
      // 🔑 Con «un toque» no hay pantalla de foto que cerrar, pero el tipo en
      // curso sí tiene que soltarse: si no, un envío fallido dejaría el botón
      // creyendo que todavía está marcando.
      if (MARCACION_UN_TOQUE) setTipoEnCurso(null);
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
      {/* 🩸 EL ENCABEZADO DECÍA «marcacion», EN MINÚSCULA Y SIN TILDE
          (24-sep-2026). En el celular la barra pinta la prop `module` CRUDA
          (`AppHeader`, `<span className="truncate sm:hidden">`) y el rótulo
          bonito viajaba en `breadcrumbs`, que solo se dibuja en escritorio.
          Era el único módulo del sistema que pasaba la KEY; los otros 20 pasan
          el nombre. Se le pasa el RÓTULO y el breadcrumb queda «Inicio ›
          Marcación», sin repetirlo. */}
      <AppHeader module={MARCACION_UN_TOQUE ? ROTULO_MARCACION : "marcacion"} breadcrumbs={MARCACION_UN_TOQUE ? undefined : [{ label: ROTULO_MARCACION }]} />
      <input
        ref={archivoRef}
        type="file"
        accept="image/*"
        // 🔴 LA CÁMARA NORMAL, NO LA DE SELFIE. Daniel: «sus fotos son del
        // lugar, no de su cara». La foto sigue siendo obligatoria y se guarda
        // igual: lo único que cambia es hacia dónde mira la cámara.
        capture={MARCACION_UN_TOQUE ? CAPTURE_CAMARA : "user"}
        onChange={llegoLaFoto}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      <main
        className={`mx-auto w-full max-w-md px-4 pt-6 ${MARCACION_UN_TOQUE ? CLASES_AIRE_PARA_EL_BOTON : "pb-16"}`}
      >
        {/* 🔴 MIENTRAS NO HAY DATO SE DIBUJA EL ESQUELETO, NUNCA UN BLANCO.
            Esto solo se ve cuando el servidor no pudo armar el estado (ver
            `page.tsx`) y el dato tiene que venir del navegador: ocupa el MISMO
            lugar que la pantalla de verdad, así lo que llega después no empuja
            nada. */}
        {!estado && !errorCarga && <BloquesDelEsqueleto />}

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

        {/* ── «UN TOQUE» (24-sep-2026) ───────────────────────────────────────
            Un botón fijo abajo que no se mueve nunca, la foto aceptada ES la
            marca, y una sola confirmación. Con el interruptor apagado, lo de
            abajo — la pantalla de antes, intacta. */}
        {MARCACION_UN_TOQUE && estado?.codigo && (
          <PantallaUnToque
            nombre={capitalizarNombre(estado.nombre) || `Código ${estado.codigo}`}
            hora={horaAmPm(isoQueCuenta)}
            fecha={fechaLarga(hoy)}
            enLinea={enLinea}
            hoyMarcado={hoyMarcado}
            sePuedeDeshacer={sePuedeDeshacer}
            deshaciendo={deshaciendo}
            onDeshacer={deshacer}
            aviso={avisoVisible}
            pendientes={pendientes.length}
            faltoAyer={faltoLaSalidaDeAyer(dias, hoy)}
            boton={boton}
            marcando={enviando || tipoEnCurso !== null}
            onTocarBoton={tocarBoton}
          />
        )}

        {/* ── LA PANTALLA DE ANTES, entera, con el interruptor apagado ────
            Vive en su propio archivo (`PantallaDeAntes.tsx`) y no se toca: es
            el «volver atrás» de Daniel. */}
        {!MARCACION_UN_TOQUE && estado?.codigo && (
          <PantallaDeAntes
            nombre={capitalizarNombre(estado.nombre) || `Código ${estado.codigo}`}
            hora={horaAmPm(isoQueCuenta)}
            fecha={fechaLarga(hoy)}
            enLinea={enLinea}
            hoyMarcado={hoyMarcado}
            sePuedeDeshacer={sePuedeDeshacer}
            deshaciendo={deshaciendo}
            onDeshacer={deshacer}
            avisoVisible={avisoVisible}
            aviso={aviso}
            pendientes={pendientes.length}
            nota={nota}
            boton={boton}
            onTocarBoton={tocarBoton}
            dias={dias}
            rotuloQuincena={estado.rotuloQuincena ?? ""}
            hoy={hoy}
            foto={foto}
            tipoEnCurso={tipoEnCurso}
            buscandoUbicacion={buscandoUbicacion}
            enviando={enviando}
            onEnviar={enviar}
            onCancelarFoto={cancelarFoto}
          />
        )}
      </main>
    </div>
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
