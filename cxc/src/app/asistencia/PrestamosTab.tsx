"use client";

// PRÉSTAMOS, ADENTRO DE PLANILLA.
//
// Daniel, textual: *«asistencia se ingresa la info y prestamos seria para como
// ver la info y hacer pagos extraordinarios como abonos etc»*.
//
// O sea, esta pantalla hace estas cosas y ninguna más:
//   1. VER cuánto debe cada quien, en sus cuentas.
//   2. Anotar un abono EXTRAORDINARIO — un pago que no salió de la quincena.
//   3. 🔴 Crear un préstamo nuevo (11-sep-2026, Daniel: *«sí, arregla lo de
//      préstamos»*, con el mockup aprobado) — el MISMO formulario del módulo de
//      Préstamos, elegido de las fichas activas, con concepto, monto y cuota.
//   4. 🔴 Tocar el nombre abre SUS MOVIMIENTOS (`/prestamos/<id>`, la página del
//      módulo de siempre, con «← Préstamos» de vuelta a esta pestaña).
//
// 🩸 Del 10 al 11-sep-2026, con la «una sola puerta» prendida, esta pestaña
// tenía SOLO «Anotar abono»: no se podía crear un préstamo, ver los
// movimientos de nadie ni llegar a la ficha, porque todo lo que colgaba de
// `/prestamos/` rebotaba acá. Se reusa lo del módulo viejo en vez de dibujar copias.
//
// ── 🔴 LO QUE SALE DE LA QUINCENA YA NO SE TECLEA ───────────────────────────
//
// Lo escribe el cierre de la planilla. 🩸 Medido en la quincena del 1 al 15 de
// agosto de 2026: el módulo de Préstamos tenía 9 descuentos por $360,00 y la
// casilla de la planilla decía 7 por $265,00 — KEVIN LUBO, LUIS PARAJON y
// YULICAR CORONA con el pago anotado y la casilla en cero (se les bajó la deuda
// por plata que nunca se les quitó del sueldo), y LUIS ARROYO al revés. Los dos
// errores son el mismo: la plata se tecleaba dos veces, en dos pantallas.
//
// ⚠️ PRÉSTAMOS NO DESAPARECE, Y ESTÁ MEDIDO: de 337 pagos, **53 (el 42 % de la
// plata, $8.834,22) NO salieron de la quincena**. Para esos es esta pestaña.
//
// ── 🔴 LA SECRETARIA SOLO MIRA ──────────────────────────────────────────────
//
// Daniel: *«La secretaria entra a Préstamos solo a VER»*. Lo decide el SERVIDOR
// (`cerrarPlanillaRoles()`); acá solo se dibujan o no los botones y el enlace a
// los movimientos, para no ofrecer algo que va a contestar 403.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { empresaParaPedir, filtrarPorEmpresa } from "@/lib/asistencia/empresa-para-todo";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";
import { descargarHistorialPrestamos, type AmbitoHistorial } from "@/lib/prestamos-descargar-historial";
import { useToast } from "@/components/ToastSystem";
import { NOMBRE_CUENTA, type CuentaPrestamo } from "@/lib/prestamos-saldo";
import { ORIGENES_ABONO } from "@/lib/asistencia/abono-extra";
import { hoyPanama } from "@/lib/fecha-panama";
import { capitalizarNombre } from "@/lib/nombre-en-pantalla";
import { quincenasHasta } from "@/lib/asistencia/planilla";
import { PARAM_NUEVO_PRESTAMO, enlaceAPrestamos } from "@/lib/prestamos-una-puerta";
import type { Colaborador, DatosPrestamos } from "@/lib/prestamos-lista-server";
import { VacioDeBusqueda } from "@/components/BuscadorDeLista";
import { BuscarEnLaBarra, CLASE_FILA_MENU, CLASE_SEGMENTADO_BARRA, EnLaBarra, useHayBarraCelular } from "@/components/celular/BarraDeControles";
import { Download, Search } from "lucide-react";
import { ControlSegmentado } from "@/components/ventas/ControlSegmentado";
import {
  LIMPIAR_BUSQUEDA,
  PARAM_BUSCAR,
  PLACEHOLDER_COLABORADOR,
  VACIO_BUSQUEDA,
  vistaDeLista,
} from "@/lib/buscar-en-lista";
import { useUrlState } from "@/lib/hooks/useUrlState";
import MovimientosQuincenaTab from "./MovimientosQuincenaTab";
import {
  PARAM_VISTA,
  VISTAS_PRESTAMOS,
  VISTA_MOVIMIENTOS,
  vistaDePrestamos,
} from "@/lib/asistencia/movimientos-quincena";
import ElegirPersonaModal from "@/app/prestamos/components/ElegirPersonaModal";
import NuevoMovimientoModal from "@/app/prestamos/components/NuevoMovimientoModal";
import { useMovimientoForm } from "@/app/prestamos/components/useMovimientoForm";
import { vidrioSobre } from "@/lib/ui/vidrio";
import { ThOrden, useOrdenTabla } from "@/components/ui/OrdenTabla";
import CampoFecha from "@/components/ui/CampoFecha";
import { PRESTAMOS_APPLE_2026_10, conAtencionArriba, totalProximoDescuento } from "@/lib/prestamos-apple-2026-10";

interface FichaDeuda {
  id: string;
  codigo: string | null;
  nombre: string;
  saldo: number;
  saldoPrestamo: number;
  saldoDano: number;
  /** Lo que debe por «Descuento a terceros». Opcional: un payload viejo no lo trae. */
  saldoTerceros?: number;
  /** La empresa de la persona atada (10-sep-2026): por ella filtra el selector de arriba. */
  empresa?: string | null;
  cuota: number;
  /** La cuota de daño de mercancía. Desde el 14-sep-2026 también se descuenta sola. */
  cuotaDano: number;
  cuotaTerceros?: number;
  yaDescontado: number;
}

/** 🔴 Lo que se le descuenta por quincena: las TRES cuotas (el daño desde el 14-sep-2026). */
function cuotaPorQuincena(f: FichaDeuda): number {
  return f.cuota + (f.cuotaTerceros ?? 0) + (f.cuotaDano ?? 0);
}

/** Plata con centavos y menos tipográfico, como en todo el sistema. */
function money(n: number): string {
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `−$${abs}` : `$${abs}`;
}

/** 🔴 Los ceros van con guion (11-sep-2026, mockup): un $0.00 en una columna de plata se lee como dato. */
function plataOGuion(n: number | undefined) {
  const v = n ?? 0;
  return v > 0 || v < 0 ? money(v) : <span className="text-gray-400">—</span>;
}

/**
 * 🔴 DOS VISTAS, UNA PUERTA (17-sep-2026). Daniel, textual: *«quisiera que en
 * préstamo tener como que un botón para ver el historial de las quincenas. Ya
 * que para ver movimiento tengo que meterme a cada perfil. Pero para ver los
 * movimientos de x quincena?»*.
 *
 * «Quiénes deben» es la de siempre y sigue siendo la que abre; «Movimientos» es
 * una pantalla de LECTURA que no escribe nada. Las dos comparten el selector de
 * empresa de arriba, los roles y esta misma puerta: no hay una pestaña nueva.
 */
export default function PrestamosTab(props: { desde?: string; hasta?: string; empresa?: string } = {}) {
  // Mismo nivel → `replace` (default): el Atrás del navegador no cicla por vistas.
  const [subUrl, setSub] = useUrlState(PARAM_VISTA, "");
  const vista = vistaDePrestamos(subUrl);
  const barra = useHayBarraCelular();

  return (
    <div className={barra ? "space-y-3" : "space-y-4"}>
      {/* 🔴 ELEGIR UNA VISTA NO ES UNA ACCIÓN (29-sep-2026, audit visual que
          aprobó Daniel): eran dos botones, uno negro relleno, y el negro se
          reserva para lo que HACE algo («+ Nuevo préstamo»). Ahora es el mismo
          segmentado gris de Ventas, a lo ancho de su contenido. */}
      {/* 🔴 v3.1: en el celular nuevo el segmentado va al renglón 3 de la barra,
          con el alto de todos los segmentados (36 px, se toca en 44). */}
      {barra ? (
        <EnLaBarra
          pestana="prestamos"
          filaIzq={
            <ControlSegmentado
              ancho="contenido"
              ariaLabel="Vista de Préstamos"
              className={CLASE_SEGMENTADO_BARRA}
              options={VISTAS_PRESTAMOS.map(([value, label]) => ({ value, label }))}
              active={vista}
              onChange={setSub}
            />
          }
        />
      ) : (
      <ControlSegmentado
        ancho="contenido"
        ariaLabel="Vista de Préstamos"
        options={VISTAS_PRESTAMOS.map(([value, label]) => ({ value, label }))}
        active={vista}
        onChange={setSub}
      />
      )}

      {vista === VISTA_MOVIMIENTOS
        ? <MovimientosQuincenaTab empresa={props.empresa} />
        : <ListaDeDeuda {...props} />}
    </div>
  );
}

function ListaDeDeuda(props: { desde?: string; hasta?: string; empresa?: string } = {}) {
  const { toast } = useToast();
  const barra = useHayBarraCelular();
  // 🔑 Sin período dado, la quincena EN CURSO — y el «hoy» es el de PANAMÁ, no
  // el del navegador. Solo decide la columna «esta quincena»: el SALDO es
  // histórico y no se recorta por fecha.
  const { desde, hasta } = useMemo(() => {
    if (props.desde && props.hasta) return { desde: props.desde, hasta: props.hasta };
    const q = quincenasHasta(hoyPanama(), 1)[0];
    return { desde: q.desde, hasta: q.hasta };
  }, [props.desde, props.hasta]);
  const [fichas, setFichas] = useState<FichaDeuda[] | null>(null);
  const [puedeAnotar, setPuedeAnotar] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [abonando, setAbonando] = useState<FichaDeuda | null>(null);
  /** El texto del buscador vive en la URL (`replace`), con la MISMA llave de las otras pestañas. */
  const [busqueda, setBusqueda] = useUrlState(PARAM_BUSCAR, "");

  // ── «+ Nuevo préstamo»: la misma elección y el mismo formulario del módulo ──
  // Los colaboradores (las fichas activas de Asistencia) y las filas con saldo
  // se piden al TOCAR el botón, no al abrir la pestaña: esta lista se lee
  // muchas más veces de las que se crea un préstamo.
  const [datosModulo, setDatosModulo] = useState<DatosPrestamos | null>(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [personaElegida, setPersonaElegida] = useState<Colaborador | null>(null);
  const [descargaAbierta, setDescargaAbierta] = useState(false);
  const [descargando, setDescargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const q = new URLSearchParams({ desde, hasta });
      const r = await fetch(`/api/asistencia/prestamos-deuda?${q}`, { cache: "no-store" });
      const j = (await r.json()) as { fichas?: FichaDeuda[]; puedeAnotar?: boolean; error?: string };
      if (!r.ok) throw new Error(j.error ?? "No se pudo leer la deuda");
      // 🔴 Filtrado por la empresa de arriba: la lista y el total (10-sep-2026).
      setFichas(filtrarPorEmpresa(j.fichas ?? [], props.empresa));
      setPuedeAnotar(!!j.puedeAnotar);
    } catch {
      toast("No se pudo leer la deuda. Intenta de nuevo.", "error");
      setFichas([]);
    } finally {
      setCargando(false);
    }
  }, [desde, hasta, toast, props.empresa]);

  useEffect(() => { void cargar(); }, [cargar]);

  const movForm = useMovimientoForm({
    onSuccess: () => { setPersonaElegida(null); setDatosModulo(null); void cargar(); },
    // 🔴 El TIPO lo dice el hook, no el texto (11-sep-2026): el aviso del tope
    // sale en ámbar y por 8 s. Antes se clasificaba por `startsWith("Error")`.
    showToast: (m, tipo) => toast(m, tipo ?? "success"),
  });

  async function leerColaboradores(): Promise<DatosPrestamos | null> {
    try {
      const r = await fetch("/api/prestamos/empleados", { cache: "no-store" });
      if (!r.ok) throw new Error();
      const d = (await r.json()) as DatosPrestamos;
      setDatosModulo(d);
      return d;
    } catch {
      toast("No se pudo abrir la lista de colaboradores. Intenta de nuevo.", "error");
      return null;
    }
  }

  async function abrirNuevoPrestamo() {
    if (await leerColaboradores()) setEligiendo(true);
  }

  // ── 🔴 SE LLEGA DESDE LA FICHA, CON LA PERSONA YA ELEGIDA (11-sep-2026) ────
  // «+ Préstamo» de la ficha trae `?nuevo=<código>`: se abre el MISMO formulario
  // como si se la hubiera tocado en la lista. Una vez por montaje.
  const sp = useSearchParams();
  const nuevoDeUrl = (sp?.get(PARAM_NUEVO_PRESTAMO) ?? "").trim();
  const abiertoDesdeUrl = useRef(false);
  useEffect(() => {
    if (!nuevoDeUrl || !puedeAnotar || abiertoDesdeUrl.current) return;
    abiertoDesdeUrl.current = true;
    void (async () => {
      const d = await leerColaboradores();
      const c = d?.colaboradores.find((x) => String(x.codigo) === nuevoDeUrl);
      if (c) void elegirPersona(c);
      else toast("No se encontró ese colaborador entre los activos.", "error");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nuevoDeUrl, puedeAnotar]);

  /** Elegir a la persona crea (o encuentra) su ficha y abre el formulario — igual que el módulo. */
  async function elegirPersona(c: Colaborador) {
    setEligiendo(false);
    if (c.fichaId) { setPersonaElegida({ ...c }); return; }
    try {
      const res = await fetch("/api/prestamos/empleados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empleado_codigo: c.codigo }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { toast(json?.error || "No se pudo abrir la ficha", "error"); return; }
      setPersonaElegida({ ...c, fichaId: json.id });
    } catch { toast("Sin conexión. Intenta de nuevo.", "error"); }
  }

  // 🔴 Por nombre y por código, sin acentos ni mayúsculas y por subcadena
  // exacta — nunca por parecido. Filtra lo ya cargado; cero peticiones nuevas.
  const { visibles, conteo, buscando, sinResultados } = useMemo(
    // Estilo Apple (prendido 9-oct-2026): lo que requiere atención arriba, después el saldo mayor.
    () => vistaDeLista(fichas && PRESTAMOS_APPLE_2026_10 ? conAtencionArriba(fichas) : fichas, busqueda, (f) => [f.nombre, f.codigo]),
    [fichas, busqueda],
  );

  // 🔴 EL TOTAL SIGUE AL FILTRO (11-sep-2026). Se suma sobre lo que se VE, no
  // sobre la lista entera. 🩸 Nació al revés —sumaba todo con la lista
  // recortada— y es la misma duda que hizo quitarle el buscador a la Planilla:
  // un total que no corresponde a las filas de arriba hace dudar de cuál de los
  // dos manda. Quién es «lo que se ve» lo dice el conteo de al lado, y acá el
  // total no se paga: es lo que se debe hoy.
  const total = useMemo(
    () => visibles.reduce((a, f) => a + f.saldo, 0),
    [visibles],
  );
  // 6-oct-2026: en la computadora cada encabezado ordena; sin tocar, como siempre.
  const orden = useOrdenTabla<"colaborador" | "prestamo" | "dano" | "terceros" | "saldo" | "cuota" | "quincena">("asistencia-prestamos", {
    columnas: ["colaborador", "prestamo", "dano", "terceros", "saldo", "cuota", "quincena"], textos: ["colaborador"],
  });
  const ordenadas = useMemo(() => orden.ordenar(visibles, (f, c) => {
    switch (c) {
      case "colaborador": return capitalizarNombre(f.nombre);
      case "prestamo": return f.saldoPrestamo;
      case "dano": return f.saldoDano;
      case "terceros": return f.saldoTerceros ?? 0;
      case "saldo": return f.saldo;
      case "cuota": return cuotaPorQuincena(f);
      case "quincena": return f.yaDescontado;
    }
  }), [visibles, orden]);

  if (fichas === null) {
    return <p className="text-sm text-gray-500">Cargando…</p>;
  }

  // 🔴 LA COLUMNA «Descuento a terceros» SOLO CUANDO ALGUIEN LO TIENE (10-sep-2026,
  // Daniel: *«que aparezca solo cuando alguien lo tenga»*). Una columna de ceros
  // es una columna que no dice nada.
  const hayTerceros = fichas.some((f) => (f.saldoTerceros ?? 0) > 0);
  // 🔴 «ESTA QUINCENA» SOLO SI ALGUIEN TIENE ALGO ESTA QUINCENA (29-sep-2026,
  // audit visual aprobado por Daniel): 🩸 salía «—» en las 15 filas. Misma regla
  // que la de terceros: una columna de guiones no dice nada.
  const hayEstaQuincena = fichas.some((f) => f.yaDescontado > 0);

  // 🔴 24 — «DESCARGAR» (29-sep-2026). Daniel: *«solo quiero descargar»*. El
  // MISMO Excel del historial que bajaba el módulo viejo («Descargar historial»),
  // con sus dos opciones y la MISMA función (`descargarHistorialPrestamos`).
  // Sigue a la empresa de arriba: la ruta filtra por el NOMBRE de la empresa de
  // la ficha de préstamos. Se ofrece a quien escribe aquí: la ruta es de
  // `PRESTAMOS_ROLES` y a la secretaria le contestaría 403.
  async function descargar(ambito: AmbitoHistorial) {
    setDescargaAbierta(false);
    setDescargando(true);
    const clave = empresaParaPedir(props.empresa);
    const empresa = clave ? EMPRESA_KEY_TO_NAME[clave] ?? clave : null;
    if (!(await descargarHistorialPrestamos(ambito, empresa, hoyPanama()))) {
      toast("No se pudo descargar. Intenta de nuevo.", "error");
    }
    setDescargando(false);
  }

  // 🔴 En el celular con la barra nueva (2-oct-2026): «Descargar» va al «···»
  // y «+ Nuevo préstamo» fijo abajo. Las MISMAS funciones de la computadora.
  const botonNuevo = puedeAnotar && (barra ? (
    <EnLaBarra
      pestana="prestamos"
      iconos={
        <>
          <BuscarEnLaBarra valor={busqueda} onCambiar={setBusqueda} placeholder={PLACEHOLDER_COLABORADOR} etiqueta="Buscar colaborador por nombre o código" />
        </>
      }
      menu={
        <>
          <button type="button" disabled={descargando} onClick={() => void descargar("deben")} className={`${CLASE_FILA_MENU} min-h-[44px]`}>
            Descargar · Solo con saldo
          </button>
          <button type="button" disabled={descargando} onClick={() => void descargar("todos")} className={`${CLASE_FILA_MENU} min-h-[44px]`}>
            Descargar · Todos
          </button>
        </>
      }
      accion={{ rotulo: "+ Nuevo préstamo", onClick: () => void abrirNuevoPrestamo() }}
    />
  ) : (
    <div className="flex items-center gap-2">
      <div className="relative">
        <button type="button" onClick={() => setDescargaAbierta((v) => !v)} disabled={descargando}
          aria-haspopup="menu" aria-expanded={descargaAbierta}
          className="flex min-h-[44px] items-center gap-1.5 rounded-md border border-gray-300 px-3 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97] disabled:opacity-40">
          <Download aria-hidden className="h-4 w-4" />
          {descargando ? "Descargando…" : "Descargar"}
        </button>
        {descargaAbierta && (
          <div role="menu" className={vidrioSobre("absolute right-0 z-20 mt-1 w-52 rounded-lg border border-gray-200 bg-white py-1 shadow-lg")}>
            <button type="button" role="menuitem" onClick={() => void descargar("deben")}
              className="block min-h-[44px] w-full px-3 py-2.5 text-left text-sm text-gray-700 transition hover:bg-gray-50">
              Solo con saldo
            </button>
            <button type="button" role="menuitem" onClick={() => void descargar("todos")}
              className="block min-h-[44px] w-full px-3 py-2.5 text-left text-sm text-gray-700 transition hover:bg-gray-50">
              Todos
            </button>
          </div>
        )}
      </div>
      <button type="button" onClick={() => void abrirNuevoPrestamo()}
        className="min-h-[44px] rounded-md bg-black px-4 text-sm text-white transition active:scale-[0.97]">
        + Nuevo préstamo
      </button>
    </div>
  ));

  const filaDelModulo = personaElegida?.fichaId
    ? datosModulo?.filas.find((f) => f.id === personaElegida.fichaId) ?? null
    : null;

  const modales = (
    <>
      {/* 🔴 SOLO LOS DE LA EMPRESA ELEGIDA ARRIBA (11-sep-2026): la lista y el
          total ya filtraban, el alta ofrecía a las 4. Con «Todas», todos. */}
      <ElegirPersonaModal
        open={eligiendo}
        colaboradores={filtrarPorEmpresa(datosModulo?.colaboradores ?? [], props.empresa)}
        onClose={() => setEligiendo(false)}
        onElegir={(c) => void elegirPersona(c)}
      />
      {personaElegida?.fichaId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPersonaElegida(null)}>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6" onClick={(e) => e.stopPropagation()}>
            <NuevoMovimientoModal
              nombre={personaElegida.nombre}
              empleadoId={personaElegida.fichaId}
              saldoPrestamo={filaDelModulo?.saldoPrestamo ?? 0}
              saldoDano={filaDelModulo?.saldoDano ?? 0}
              cuentaMasVieja={filaDelModulo?.cuentaMasVieja ?? null}
              salarioMensual={personaElegida.salarioMensual}
              hoy={hoyPanama()}
              cuotaActual={{ prestamo: filaDelModulo?.cuotaPrestamo ?? 0, terceros: filaDelModulo?.cuotaTerceros ?? 0, dano: filaDelModulo?.cuotaDano ?? 0 }}
              onCancelar={() => setPersonaElegida(null)}
              onGuardar={async (payload) => { await movForm.crear(payload); }}
            />
          </div>
        </div>
      )}
    </>
  );

  if (!fichas.length) {
    // 🔑 Nunca un «$0.00» grande: se dice con palabras qué pasa.
    return (
      <div className="space-y-4">
        {botonNuevo && <div className="flex justify-end">{botonNuevo}</div>}
        <p className="rounded-lg border border-gray-200 px-4 py-6 text-center text-sm text-gray-600">
          Sin saldos pendientes.
        </p>
        {modales}
      </div>
    );
  }

  /** El nombre: enlace a sus movimientos para quien puede escribir; texto para quien solo mira. */
  const nombre = (f: FichaDeuda, clase: string) =>
    puedeAnotar
      ? (
        <Link href={enlaceAPrestamos(f.id)} className={`${clase} underline-offset-2 hover:underline`}>
          {capitalizarNombre(f.nombre)} <span className="text-gray-400">›</span>
        </Link>
      )
      : <span className={clase}>{capitalizarNombre(f.nombre)}</span>;

  return (
    <div className="space-y-4">
      {PRESTAMOS_APPLE_2026_10 ? (
        // Estilo Apple (prendido 9-oct-2026): lo importante primero. El conteo se va: son las filas.
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div data-saldo-total-prestamos>
            <p className="text-sm text-gray-500">Saldo total</p>
            <p className="text-2xl font-semibold tabular-nums text-gray-900">{money(total)}</p>
            <p className="text-sm text-gray-500">
              Próximo descuento <span className="font-medium tabular-nums text-gray-900">{money(totalProximoDescuento(visibles))}</span>
            </p>
          </div>
          {botonNuevo}
        </div>
      ) : (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">
          {visibles.length === 1 ? "1 colaborador con saldo" : `${visibles.length} colaboradores con saldo`}
          <span className="text-gray-400"> · </span>
          <span className="text-gray-500">Total </span>
          <span className="font-medium tabular-nums text-gray-900">{money(total)}</span>
        </p>
        {botonNuevo}
      </div>
      )}

      {/* 🔴 EL BUSCADOR CON BORDE Y LUPA, DEL ALTO DE LOS DEMÁS (29-sep-2026,
          audit visual aprobado por Daniel): 🩸 era una línea subrayada al lado
          de campos con caja. Mismo filtro y mismo conteo de `buscar-en-lista`;
          solo cambia el dibujo, y solo en esta pestaña. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className={barra ? "hidden" : "relative w-full max-w-xs sm:w-64"}>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={PLACEHOLDER_COLABORADOR}
            aria-label="Buscar colaborador por nombre o código"
            className="min-h-[44px] w-full rounded-md border border-gray-300 pl-9 pr-3 text-base outline-none transition focus:border-black sm:text-sm"
          />
        </div>
        {conteo !== "" && (
          <span data-testid="conteo-busqueda" className="text-sm tabular-nums text-gray-500">{conteo}</span>
        )}
      </div>

      {sinResultados && (
        <VacioDeBusqueda texto={VACIO_BUSQUEDA} onLimpiar={() => setBusqueda("")} rotulo={LIMPIAR_BUSQUEDA} />
      )}

      {/* 🔴 EL DESLIZAMIENTO VIVE ADENTRO DE LA TABLA, nunca en la página: en el
          iPhone la pantalla entera no se puede mover de lado. */}
      {visibles.length > 0 && (
      <div className="hidden overflow-x-auto rounded-lg border border-gray-200 lg:block">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <ThOrden col="colaborador" api={orden} className="px-3 py-2 font-medium">Colaborador</ThOrden>
              <ThOrden col="prestamo" api={orden} derecha className="px-3 py-2 text-right font-medium">Préstamo</ThOrden>
              {/* 🔴 ENCABEZADOS DE UNA PALABRA (29-sep-2026, audit visual aprobado
                  por Daniel): «Daño de mercancía» y «Descuento a terceros» se
                  partían en dos renglones. El nombre largo queda en el `title`. */}
              <ThOrden col="dano" api={orden} derecha className="whitespace-nowrap px-3 py-2 text-right font-medium"><span title={NOMBRE_CUENTA.dano}>Mercancía</span></ThOrden>
              {hayTerceros && <ThOrden col="terceros" api={orden} derecha className="whitespace-nowrap px-3 py-2 text-right font-medium"><span title={NOMBRE_CUENTA.terceros}>Terceros</span></ThOrden>}
              <ThOrden col="saldo" api={orden} derecha className="px-3 py-2 text-right font-medium">Saldo</ThOrden>
              <ThOrden col="cuota" api={orden} derecha className="px-3 py-2 text-right font-medium">Cuota</ThOrden>
              {hayEstaQuincena && <ThOrden col="quincena" api={orden} derecha className="whitespace-nowrap px-3 py-2 text-right font-medium">Esta quincena</ThOrden>}
              {puedeAnotar && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((f) => (
              <tr key={f.id} className="border-b border-gray-100 last:border-0">
                <td className="px-3 py-2">
                  {nombre(f, "text-gray-900")}
                  {/* 🔴 SIN CÓDIGO NO HAY A QUIÉN DESCONTARLE, y se DICE. El
                      amarre es por código y nunca por parecido de nombre. */}
                  {!f.codigo && (
                    <span className="ml-2 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-sm text-amber-800">
                      Sin colaborador asignado
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">{plataOGuion(f.saldoPrestamo)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">{plataOGuion(f.saldoDano)}</td>
                {hayTerceros && (
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                    {(f.saldoTerceros ?? 0) > 0 ? money(f.saldoTerceros ?? 0) : <span className="text-gray-400">—</span>}
                  </td>
                )}
                <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-900">{money(f.saldo)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">{plataOGuion(cuotaPorQuincena(f))}</td>
                {hayEstaQuincena && (
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                    {f.yaDescontado > 0 ? money(f.yaDescontado) : <span className="text-gray-400">—</span>}
                  </td>
                )}
                {puedeAnotar && (
                  <td className="px-3 py-2 text-right">
                    {/* 🔴 «Abono», en UN renglón (29-sep-2026, audit visual aprobado
                        por Daniel): «Anotar abono» se partía en dos en cada fila. */}
                    <button type="button" onClick={() => setAbonando(f)}
                      aria-label={`Registrar abono de ${capitalizarNombre(f.nombre)}`}
                      className="min-h-[44px] whitespace-nowrap rounded-md border border-gray-300 px-3 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97]">
                      Abono
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {/* En el celular, tarjetas: una tabla de 7 columnas en 390 px pide 200 px
          de arrastre lateral y nadie la lee. */}
      {visibles.length > 0 && PRESTAMOS_APPLE_2026_10 && (
      // Estilo Apple (prendido 9-oct-2026): dos líneas y la tarjeta entera abre el detalle,
      // donde están las cuentas y «Registrar abono».
      <div className="space-y-2 lg:hidden">
        {visibles.map((f) => {
          const cuerpo = (
            <>
              <span className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-medium text-gray-900">{capitalizarNombre(f.nombre)}</span>
                <span className="shrink-0 text-sm font-medium tabular-nums text-gray-900">
                  {money(f.saldo)}{puedeAnotar && <span className="ml-1 text-gray-400">›</span>}
                </span>
              </span>
              <span className="mt-0.5 flex items-center gap-2 text-sm text-gray-500">
                Cuota {money(cuotaPorQuincena(f))}
                {!f.codigo && (
                  <span className="font-medium text-amber-700">· Sin colaborador asignado</span>
                )}
              </span>
            </>
          );
          return puedeAnotar ? (
            <Link key={f.id} href={enlaceAPrestamos(f.id)} data-tarjeta-prestamo
              className="block min-h-[44px] rounded-lg border border-gray-200 bg-white p-3 transition active:bg-gray-50">
              {cuerpo}
            </Link>
          ) : (
            <div key={f.id} data-tarjeta-prestamo className="block rounded-lg border border-gray-200 bg-white p-3">{cuerpo}</div>
          );
        })}
      </div>
      )}

      {visibles.length > 0 && !PRESTAMOS_APPLE_2026_10 && (
      <div className="space-y-2 lg:hidden">
        {visibles.map((f) => (
          <div key={f.id} className="rounded-lg border border-gray-200 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-gray-900">{nombre(f, "text-gray-900")}</p>
              <p className="text-sm tabular-nums font-medium text-gray-900">{money(f.saldo)}</p>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {NOMBRE_CUENTA.prestamo} {money(f.saldoPrestamo)} · {NOMBRE_CUENTA.dano} {money(f.saldoDano)}
              {(f.saldoTerceros ?? 0) > 0 && ` · ${NOMBRE_CUENTA.terceros} ${money(f.saldoTerceros ?? 0)}`}
            </p>
            <p className="mt-0.5 text-sm text-gray-500">
              Cuota {money(cuotaPorQuincena(f))}
              {f.yaDescontado > 0 && ` · esta quincena ${money(f.yaDescontado)}`}
            </p>
            {!f.codigo && (
              <p className="mt-1 text-sm text-amber-800">No está vinculado a ningún colaborador: la planilla no le puede descontar.</p>
            )}
            {puedeAnotar && (
              <button type="button" onClick={() => setAbonando(f)}
                className="mt-2 min-h-[44px] w-full rounded-md border border-gray-300 px-3 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97]">
                Registrar abono
              </button>
            )}
          </div>
        ))}
      </div>
      )}

      {/* 4-oct-2026: UNA línea al final (antes tres renglones de explicación). */}
      <p data-pie-prestamos className="text-sm text-gray-500">
        El descuento de la quincena lo registra el cierre de la planilla
      </p>

      {abonando && (
        <AbonoModal
          ficha={abonando}
          hasta={hasta}
          cerrando={cargando}
          onCerrar={() => setAbonando(null)}
          onListo={() => { setAbonando(null); void cargar(); }}
        />
      )}

      {modales}
    </div>
  );
}

/**
 * Anotar un abono. Cuatro campos: de qué cuenta, cuánto, cuándo y de dónde salió.
 *
 * 🔴 «Quincena» NO está entre los orígenes, y el servidor lo rechaza aunque
 * alguien lo mande a mano: ese origen lo escribe el cierre y solo el cierre.
 * Un abono anotado como Quincena se leería como «ya descontado» y esa quincena
 * no se le descontaría nada a la persona.
 */
function AbonoModal(props: {
  ficha: FichaDeuda;
  hasta: string;
  cerrando: boolean;
  onCerrar: () => void;
  onListo: () => void;
}) {
  const { toast } = useToast();
  const { ficha } = props;
  const debeLasDos = ficha.saldoPrestamo > 0 && ficha.saldoDano > 0;
  const [cuenta, setCuenta] = useState<CuentaPrestamo>(
    // Viene puesta la que de verdad debe. Con las dos, la de préstamo.
    ficha.saldoPrestamo > 0 ? "prestamo" : "dano",
  );
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(props.hasta);
  const [origen, setOrigen] = useState<string>(ORIGENES_ABONO[0]);
  const [guardando, setGuardando] = useState(false);

  const tope = cuenta === "prestamo" ? ficha.saldoPrestamo : ficha.saldoDano;

  async function guardar() {
    setGuardando(true);
    try {
      const r = await fetch("/api/asistencia/prestamos-deuda", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fichaId: ficha.id, cuenta, monto: Number(monto), fecha, origen,
        }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || j.ok === false) throw new Error(j.error ?? "No se pudo registrar el abono");
      toast("Abono registrado", "success");
      props.onListo();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo registrar el abono", "error");
    } finally {
      setGuardando(false);
    }
  }

  const montoNum = Number(monto);
  const sirve = Number.isFinite(montoNum) && montoNum > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog" aria-modal="true" aria-label={`Registrar abono de ${capitalizarNombre(ficha.nombre)}`}>
      <div className="w-full max-w-md rounded-t-lg border border-gray-200 bg-white p-4 sm:rounded-lg">
        <h2 className="text-base font-medium text-gray-900">Registrar abono</h2>
        <p className="mt-0.5 text-sm text-gray-500">{capitalizarNombre(ficha.nombre)}</p>

        <div className="mt-4 space-y-3">
          {debeLasDos && (
            <label className="block text-sm">
              <span className="text-gray-600">Cuenta</span>
              <select value={cuenta} onChange={(e) => setCuenta(e.target.value as CuentaPrestamo)}
                className="mt-1 min-h-[44px] w-full rounded-md border border-gray-300 px-3 text-sm">
                <option value="prestamo">{NOMBRE_CUENTA.prestamo} — saldo {money(ficha.saldoPrestamo)}</option>
                <option value="dano">{NOMBRE_CUENTA.dano} — saldo {money(ficha.saldoDano)}</option>
              </select>
            </label>
          )}

          <label className="block text-sm">
            <span className="text-gray-600">Monto</span>
            <input type="number" inputMode="decimal" step="0.01" min="0" value={monto}
              onChange={(e) => setMonto(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-md border border-gray-300 px-3 text-sm tabular-nums" />
            {/* ⚠️ Se AVISA que pasa el saldo; no se bloquea. Un abono de más es
                un saldo a favor, y eso puede ser correcto. */}
            {sirve && montoNum > tope + 0.004 && (
              <span className="mt-1 block text-sm text-amber-800">
                Es más de lo que debe en esa cuenta ({money(tope)}). Le quedaría saldo a favor.
              </span>
            )}
          </label>

          <label className="block text-sm">
            <span className="text-gray-600">Fecha</span>
            <CampoFecha value={fecha} onChange={(e) => setFecha(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-md border border-gray-300 px-3 text-sm" />
          </label>

          <label className="block text-sm">
            <span className="text-gray-600">Origen del pago</span>
            <select value={origen} onChange={(e) => setOrigen(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-md border border-gray-300 px-3 text-sm">
              {ORIGENES_ABONO.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={props.onCerrar} disabled={guardando}
            className="min-h-[44px] flex-1 rounded-md border border-gray-300 px-3 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97] disabled:opacity-40">
            Cancelar
          </button>
          <button type="button" onClick={() => void guardar()} disabled={!sirve || guardando}
            className="min-h-[44px] flex-1 rounded-md bg-black px-3 text-sm text-white transition active:scale-[0.97] disabled:opacity-40">
            {guardando ? "Guardando…" : "Guardar abono"}
          </button>
        </div>
      </div>
    </div>
  );
}
