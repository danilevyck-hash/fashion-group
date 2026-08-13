"use client";

// UNA FILA POR EMPRESA, con lo que SALIÓ de caja y banco en el mes.
//
// 🔑 DOS NÚMEROS, NO UNO. "Salió" y "de eso, gastos" no son lo mismo: el reporte
// trae TODO lo que sale de caja y banco, y solo el grupo 6 es gasto. Medido
// sobre los 378 renglones reales de Vistana, de $243.342,48 que salieron solo
// $118.753,76 son gasto — el resto son transferencias entre cuentas propias,
// planilla por pagar y pagos intercompañía. Mostrar un solo número sería
// llamarle "gasto" a un préstamo devuelto.
//
// Dos formas del MISMO modelo (`filas`) para que no puedan decir cosas
// distintas: tarjetas por debajo de `lg` y tabla desde `lg`. El corte es `lg`
// (1024) y no `sm`/`md` porque a 834 (iPad) la barra lateral se lleva 224 px y
// quedan ~610 útiles — más angosto que un iPhone acostado.

import { ETIQUETA_ESTADO_EGRESOS, type EstadoEgresos } from "@/lib/egresos/reglas";
import type { AlDia } from "@/lib/egresos/al-dia";
import type { EmpresaEgresosResumen } from "./tipos";
import { mesLargo, usd } from "./tipos";

/**
 * HASTA QUÉ MES ESTÁ AL DÍA esta empresa — el avance de la contadora, en una
 * línea, para que Daniel lo vea sin preguntárselo a nadie.
 *
 * 🔴 DICE "CARGADO HASTA", NO "AL DÍA HASTA", Y NO ES UN CAPRICHO: la píldora
 * de la MISMA fila ya usa "Al día" para otra cosa —que el mes que estás mirando
 * tuvo movimientos—, así que "Al día" + "Al día hasta mayo" en el mismo renglón
 * son dos frases parecidas diciendo cosas distintas. La píldora es anterior y
 * no se toca; lo que se renombra es el texto nuevo.
 *
 * 🔴 SE DICE LO QUE EL DATO DICE, Y NADA MÁS. "Hasta qué mes hay renglones" es
 * un hecho. "Ese mes está incompleto" NO se puede afirmar con egresos —son pagos
 * sueltos, no tienen asiento de cierre— así que cuando el historial de la propia
 * empresa lo justifica se dice **"puede estar a medio cargar"**, con los dos
 * números a la vista para que se pueda juzgar. Nunca un semáforo inventado.
 *
 * ⚠️ Devuelve `null` para la empresa que NO se baja sola (Boston): ahí el vacío
 * no es atraso de la contadora sino una decisión de Daniel, y su explicación ya
 * lo dice entera. Repetirlo como "todavía no hay gastos registrados" la
 * acusaría de un atraso que no existe.
 */
export function fraseAlDia(alDia: AlDia | undefined, descargaAutomatica: boolean): string | null {
  // ⚠️ `undefined` es posible de verdad y NO es un caso teórico: SWR sirve el
  // payload cacheado de la visita anterior mientras revalida, y ese payload
  // puede venir de la versión de la app que todavía no mandaba este campo. Sin
  // dato no se dice nada — inventar una línea sería peor que no tenerla.
  if (!alDia || !descargaAutomatica) return null;
  switch (alDia.estado) {
    // 🔴 NUNCA "$0.00". Cero es un hecho contable; esto es ausencia de dato.
    case "sin_nada":
      return "Todavía no hay gastos registrados";
    case "al_dia":
      return `Cargado hasta ${mesLargo(alDia.mes)}`;
    // El mes que todavía corre no puede estar completo, y eso lo dice el
    // calendario — no hace falta ninguna estadística para afirmarlo.
    case "mes_en_curso":
      return `Cargado hasta ${mesLargo(alDia.mes)}, que todavía va corriendo`;
    case "quizas_incompleto":
      return `Cargado hasta ${mesLargo(alDia.mes)} · ese mes va en ${usd(alDia.gastoCent)} y lo habitual acá es ${usd(alDia.habitualCent)}: puede estar a medio cargar`;
  }
}

/** Sólo `con_movimientos` autoriza a pintar el número como un hecho. */
export const muestraMontoEgresos = (e: EstadoEgresos): boolean => e === "con_movimientos";

/**
 * La frase de abajo. `sin_movimientos` y `sin_datos` NO pueden verse iguales:
 * el primero dice "no salió plata" (un hecho), el segundo "no sabemos".
 *
 * 🔴 Y hay un tercer caso que no puede verse como ninguno de los dos: la empresa
 * que **no se baja sola**. Confecciones Boston quedó fuera de la descarga
 * automática por pedido de Daniel (su usuario del panel es el de él), así que su
 * fila va a decir "No traído" mes tras mes. **Una empresa vacía sin explicación
 * se lee como un error del sistema** — y peor: como que esa empresa no gastó
 * nada. Por eso, cuando no hay descarga automática, la frase lo DICE y termina
 * con lo único que se puede hacer al respecto: traerlos a mano otra vez.
 *
 * 🩸 EL FINAL DE ESA FRASE MANDABA A UNA PESTAÑA QUE YA NO EXISTE. Decía *"En
 * 'Lo que cerró la contadora' sí se ven"*, y esa perilla se fue con el mayor
 * contable (13-ago-2026). Quien la leyera se iba a buscar una segunda fuente
 * que no está: **hoy Egresos Varios es la única**, así que la frase no puede
 * seguir prometiendo otra. Un texto que manda a un lugar inexistente es peor
 * que uno que no dice nada, porque hace perder el tiempo con confianza.
 */
export function explicacionEgresos(
  estado: EstadoEgresos,
  ultimoMesConMovimientos: string | null,
  descargaAutomatica: boolean = true,
): string {
  if (!descargaAutomatica) {
    const traido =
      estado === "con_movimientos"
        ? "Lo que ves es de la última vez que se trajo a mano."
        : ultimoMesConMovimientos
          ? `Lo último que se trajo a mano es de ${mesLargo(ultimoMesConMovimientos)}.`
          // 🔴 Decía "nada de esta fuente", y "esta fuente" solo tenía sentido
          // mientras hubiera otra. Con el mayor retirado, nombrarla insinúa una
          // segunda que no existe — justo lo que este arreglo vino a sacar.
          : "Todavía no se ha traído nada.";
    return `Los gastos de esta empresa no se traen solos de Switch, para no quitarle el panel a quien lo esté usando. ${traido} Esta pantalla es el único lugar donde se ven: para ponerlos al día hay que traerlos a mano otra vez.`;
  }
  switch (estado) {
    case "con_movimientos":
      return "";
    case "sin_movimientos":
      return "Este mes no salió plata de caja ni del banco.";
    case "sin_datos":
      // 🔴 La coletilla "Lo último que hay es de …" SE FUE (13-ago-2026): la
      // línea de "Cargado hasta …" que ahora lleva cada empresa dice exactamente
      // eso, y decía DOS VECES el mismo mes en la misma tarjeta. El parámetro
      // se queda porque la rama de "no se baja sola" (arriba) sí lo usa.
      return "Este mes todavía no se ha traído de Switch.";
  }
}

interface Fila {
  empresa: EmpresaEgresosResumen;
  estado: EstadoEgresos;
  hayMonto: boolean;
  /** Lo que dice la píldora Y el lugar del monto cuando no hay número: los dos
   *  salen de acá para que no puedan decir cosas distintas. */
  etiquetaEstado: string;
  salidaTexto: string;
  gastoTexto: string;
  explicacion: string;
  /** "Cargado hasta julio 2026". `null` en la empresa que no se baja sola. */
  alDiaTexto: string | null;
  /** ¿Esa línea es una sospecha (mes a medio cargar) y no un hecho? Solo cambia
   *  el color: ámbar es "mirá esto", gris es "así está". */
  alDiaDudoso: boolean;
}

function armarFilas(empresas: EmpresaEgresosResumen[]): Fila[] {
  return empresas.map((empresa) => {
    const estado = empresa.resumen.estado;
    const hayMonto = muestraMontoEgresos(estado);
    // Una empresa que no se baja sola no está "No traída" por un problema: es
    // que no se pide. La etiqueta lo dice y la frase de abajo lo explica.
    const etiquetaEstado =
      empresa.descargaAutomatica || hayMonto
        ? ETIQUETA_ESTADO_EGRESOS[estado]
        : "No se baja sola";
    return {
      empresa,
      estado,
      hayMonto,
      etiquetaEstado,
      salidaTexto: hayMonto ? usd(empresa.resumen.totalSalidaCent) : etiquetaEstado,
      gastoTexto: hayMonto ? usd(empresa.resumen.totalGastoCent) : "—",
      explicacion: explicacionEgresos(
        estado,
        empresa.ultimoMesConMovimientos,
        empresa.descargaAutomatica,
      ),
      alDiaTexto: fraseAlDia(empresa.alDia, empresa.descargaAutomatica),
      alDiaDudoso: empresa.alDia?.estado === "quizas_incompleto",
    };
  });
}

/** La línea de "hasta dónde llega esta empresa". Va DEBAJO del nombre, en las
 *  dos formas (tarjeta y tabla), y siempre — no solo cuando el mes elegido está
 *  vacío. Es lo único que contesta "¿por dónde va la contadora?" de un vistazo. */
function AlDiaLinea({ fila }: { fila: Fila }) {
  if (!fila.alDiaTexto) return null;
  return (
    <p className={`text-sm ${fila.alDiaDudoso ? "text-amber-700" : "text-gray-500"}`}>
      {fila.alDiaTexto}
    </p>
  );
}

function EstadoTag({ fila }: { fila: Fila }) {
  // Gris, no ámbar, cuando la empresa no se baja sola: el ámbar es "esto está
  // pendiente y hay que mirarlo", y acá no hay nada que mirar — es la decisión
  // que tomó Daniel.
  const color = !fila.empresa.descargaAutomatica && !fila.hayMonto
    ? "border-gray-200 bg-gray-50 text-gray-600"
    : fila.estado === "con_movimientos"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : fila.estado === "sin_movimientos"
        ? "border-gray-200 bg-gray-50 text-gray-600"
        : "border-amber-200 bg-amber-50 text-amber-700";
  return (
    <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-sm ${color}`}>
      {fila.etiquetaEstado}
    </span>
  );
}

function Monto({ texto, hayMonto, fuerte }: { texto: string; hayMonto: boolean; fuerte?: boolean }) {
  return (
    <span
      className={
        !hayMonto
          ? "text-sm font-medium text-gray-500"
          : fuerte
            ? "text-base font-semibold tabular-nums text-gray-900"
            : "text-sm tabular-nums text-gray-700"
      }
    >
      {texto}
    </span>
  );
}

// ── Tarjetas (hasta lg) ──────────────────────────────────────────────────────

function Tarjeta({ fila, onAbrir }: { fila: Fila; onAbrir: (key: string) => void }) {
  const { empresa } = fila;
  // Un mes sin movimientos no se puede abrir: adentro no hay nada que ver.
  const Contenedor = fila.hayMonto ? "button" : "div";
  return (
    <Contenedor
      {...(fila.hayMonto
        ? { type: "button" as const, onClick: () => onAbrir(empresa.empresaKey) }
        : {})}
      className={`w-full rounded-lg border border-gray-200 bg-white p-3 text-left ${
        fila.hayMonto ? "transition active:scale-[0.99]" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-sm font-semibold text-gray-900">{empresa.nombre}</span>
          <AlDiaLinea fila={fila} />
        </div>
        <EstadoTag fila={fila} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
        <div className="min-w-0">
          <div className="text-sm text-gray-500">Salió de caja y banco</div>
          <div className="mt-0.5">
            <Monto texto={fila.salidaTexto} hayMonto={fila.hayMonto} fuerte />
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-sm text-gray-500">De eso, gastos</div>
          <div className="mt-0.5">
            <Monto texto={fila.gastoTexto} hayMonto={fila.hayMonto} />
          </div>
        </div>
      </div>

      {fila.hayMonto && (
        <p className="mt-2 text-sm text-gray-600">
          {empresa.resumen.renglones} {empresa.resumen.renglones === 1 ? "pago" : "pagos"}
        </p>
      )}

      {fila.explicacion && <p className="mt-3 text-sm text-gray-600">{fila.explicacion}</p>}

      {fila.hayMonto && (
        <span className="mt-3 inline-flex min-h-[44px] items-center text-sm font-medium text-gray-900">
          Ver en qué salió
          <svg viewBox="0 0 20 20" fill="none" className="ml-1 h-4 w-4" aria-hidden="true">
            <path d="M7.5 4L13 10l-5.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </Contenedor>
  );
}

// ── Tabla (desde lg) ─────────────────────────────────────────────────────────

function FilaTabla({ fila, onAbrir }: { fila: Fila; onAbrir: (key: string) => void }) {
  const { empresa } = fila;
  return (
    <tr
      {...(fila.hayMonto ? { onClick: () => onAbrir(empresa.empresaKey) } : {})}
      className={`border-t border-gray-200 ${fila.hayMonto ? "cursor-pointer hover:bg-gray-50" : ""}`}
    >
      <td className="px-3 py-3 align-top">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">{empresa.nombre}</span>
          <EstadoTag fila={fila} />
        </div>
        <div className="mt-0.5">
          <AlDiaLinea fila={fila} />
        </div>
        {fila.explicacion && (
          <p className="mt-1 max-w-sm text-sm text-gray-600">{fila.explicacion}</p>
        )}
      </td>
      <td className="px-3 py-3 text-right align-top">
        <Monto texto={fila.salidaTexto} hayMonto={fila.hayMonto} fuerte />
      </td>
      <td className="px-3 py-3 text-right align-top">
        <Monto texto={fila.gastoTexto} hayMonto={fila.hayMonto} />
      </td>
      <td className="px-3 py-3 text-right align-top text-sm tabular-nums text-gray-600">
        {fila.hayMonto ? empresa.resumen.renglones : "—"}
      </td>
      <td className="px-3 py-3 text-right align-top text-gray-400">
        {fila.hayMonto && (
          <svg viewBox="0 0 20 20" fill="none" className="ml-auto h-4 w-4" aria-hidden="true">
            <path d="M7.5 4L13 10l-5.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </td>
    </tr>
  );
}

// ── Público ──────────────────────────────────────────────────────────────────

interface Props {
  empresas: EmpresaEgresosResumen[];
  onAbrir: (empresaKey: string) => void;
}

export default function ResumenEgresos({ empresas, onAbrir }: Props) {
  const filas = armarFilas(empresas);

  return (
    <div>
      {/* Tarjetas: iPhone (390) e iPad (834 → ~610 útiles). */}
      <div className="space-y-2.5 lg:hidden">
        {filas.map((f) => (
          <Tarjeta key={f.empresa.empresaKey} fila={f} onAbrir={onAbrir} />
        ))}
      </div>

      {/* Tabla: sólo desde 1024, donde las columnas entran de verdad. */}
      <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white lg:block">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="bg-gray-50 text-sm text-gray-600">
              <th className="px-3 py-2 text-left font-medium">Empresa</th>
              <th className="px-3 py-2 text-right font-medium">Salió de caja y banco</th>
              <th className="px-3 py-2 text-right font-medium">De eso, gastos</th>
              <th className="px-3 py-2 text-right font-medium">Pagos</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <FilaTabla key={f.empresa.empresaKey} fila={f} onAbrir={onAbrir} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
