"use client";

// Las reglas, en simple. Daniel lo pidió: "algo que le explique al usuario de
// forma sencilla y fácil y corta de entender el módulo y la marcación".
//
// Va DENTRO del módulo a propósito: un reglamento en un papel se pierde; acá
// está al lado del número que genera la discusión. Sin jerga y sin fórmulas.

import { useEffect, useState } from "react";
import { ALMUERZO_FIJO_MIN, REGLAS_DEFAULT, type ReglasAsistencia } from "@/lib/asistencia/config";
import { MOTIVOS_JUSTIFICACION } from "@/lib/asistencia/motivos";

/** Los motivos salen de la MISMA lista que ofrece el desplegable.
 *  🩸 Este cartel nombraba «vacaciones» y «permiso»: las vacaciones se mudaron a
 *  su propia pestaña el 25-ago-2026 y «permiso» se retiró ese mismo día. Un
 *  cartel que manda a buscar una opción que ya no está hace perder el rato. */
const MOTIVOS_EN_TEXTO = MOTIVOS_JUSTIFICACION.map((m) => m.toLowerCase()).join(", ");

/** Los minutos de la tolerancia salen de la CONFIGURACIÓN, no de un texto fijo.
 *  🩸 Este cartel decía "8:05" con la tolerancia en 5; la contable la subió a 10
 *  y un cartel que contradice al cálculo es peor que no tener cartel. */
const reglasDe = (r: ReglasAsistencia): Array<{ t: string; d: string }> => {
  const tol = r.toleranciaTardanzaMin;
  const limite = `8:${String(tol).padStart(2, "0")}`;
  const unoMas = `8:${String(tol + 1).padStart(2, "0")}`;
  return [
  {
    t: "Se marca 4 veces al día",
    d: "Al llegar, al salir a almorzar, al volver, y al irse. Si falta alguna, el día queda señalado como “a revisar”.",
  },
  {
    t: `La entrada es a las 8:00, con ${tol} minutos de gracia`,
    d: `Marcar hasta las ${limite} no cuenta como tarde. Pasadas las ${limite}, se cuentan los minutos desde las 8:00 — o sea que llegar ${unoMas} son ${tol + 1} minutos, no 1.`,
  },
  {
    t: `El almuerzo es de ${ALMUERZO_FIJO_MIN} minutos, igual para todos`,
    d: "Se mide entre la salida a almorzar y el regreso. Lo que pase de ahí cuenta como tiempo no trabajado.",
  },
  {
    t: "La hora de salida depende de cada quien",
    d: "Unos salen 4:30 y otros 5:00. Salir antes de tu hora cuenta como tiempo no trabajado.",
  },
  {
    t: "Las horas extra se aprueban, no se toman",
    d: `Quedarse después de tu hora se registra, pero solo cuenta como hora extra si alguien la autoriza. Menos de ${r.extraMinimoMin} minutos no cuenta. Y si ese día llegaste tarde, primero se recupera ese tiempo.`,
  },
  {
    t: "Faltar sin marcar es ausencia",
    d: `Salvo que sea feriado, que esté de vacaciones o que se haya registrado una justificación (${MOTIVOS_EN_TEXTO}).`,
  },
  {
    t: "Marcar mal es responsabilidad de cada uno",
    d: "Si no marcaste al entrar, el sistema cuenta desde tu primera marca. El día queda señalado para corregirlo, pero los minutos cuentan.",
  },
  ];
};

export default function ComoFuncionaTab() {
  // Arranca con los valores por defecto para que el cartel se lea de inmediato,
  // y se corrige solo cuando llegan los configurados.
  const [reglas, setReglas] = useState<ReglasAsistencia>(REGLAS_DEFAULT);
  useEffect(() => {
    let vivo = true;
    void fetch("/api/asistencia/configuracion/reglas", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vivo && d?.reglas) setReglas(d.reglas as ReglasAsistencia); })
      .catch(() => { /* el cartel sirve igual con los valores por defecto */ });
    return () => { vivo = false; };
  }, []);

  const REGLAS = reglasDe(reglas);

  return (
    <div className="max-w-2xl space-y-5">
      <h2 className="text-base font-semibold text-gray-900">Cómo funciona la marcación</h2>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {REGLAS.map((r, i) => (
          <div key={r.t} className="flex gap-3 border-b border-gray-100 p-4 last:border-0">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[12px] font-semibold text-gray-600">
              {i + 1}
            </span>
            <div>
              <h3 className="text-sm font-medium text-gray-900">{r.t}</h3>
              <p className="mt-0.5 text-[13px] leading-relaxed text-gray-600">{r.d}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-medium text-gray-900">De dónde salen los datos</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-gray-600">
          Del reloj de la entrada. Entran <b>solas</b>: un programita instalado en la PC de la
          oficina le pregunta al reloj cada pocos minutos y las manda para acá. Si esa PC está
          apagada no se pierde ninguna —el reloj las guarda— y entran todas juntas cuando se
          prenda. En el <b>Reporte</b>, arriba, siempre dice cómo va.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-gray-600">
          El botón <b>Traer ahora</b> deja un pedido que esa PC recoge en su vuelta siguiente
          (un par de minutos). El reloj es la <b>única</b> forma de que entren marcaciones: ya
          no se suben Excel a mano, porque las mismas marcaciones entrando por dos caminos se
          contaban dos veces.
        </p>
      </div>

      {/* La Planilla es el destino de todo esto. Se explica acá con las MISMAS
          reglas configuradas, no con números escritos a mano en el texto. */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-medium text-gray-900">Cómo sale la planilla quincenal</h3>
        <ul className="mt-1 space-y-1.5 text-[13px] leading-relaxed text-gray-600">
          <li>· La quincena va del <b>1 al 15</b> y del <b>16 al fin de mes</b>. El día 31 no paga sueldo de más, pero si se falta ese día sí se descuenta.</li>
          <li>· La <b>rata por hora</b> es el salario del mes dividido entre {reglas.divisor40} para quien trabaja 40 horas por semana, y entre {reglas.divisor48} para quien trabaja 48.</li>
          <li>· Las <b>horas extra</b> hasta las {reglas.horaCorteNocturno} se pagan × {reglas.recargoExtraDiurno}; desde el minuto siguiente × {reglas.recargoExtraNocturno}. <b>No hay un tercer escalón</b>: el «excedente de 9 horas» también va × {reglas.recargoExtraNocturno} y su columna queda en $0.00.</li>
          <li>· Los <b>domingos y feriados</b> trabajados se pagan × {reglas.recargoDomingoFeriado}.</li>
          <li>· Se descuentan las <b>tardanzas</b> (minutos × el valor del minuto), las <b>ausencias</b> (8 horas × la rata por cada día completo), el seguro social ({reglas.seguroSocialPct} %) y el educativo ({reglas.seguroEducativoPct} %).</li>
          <li>· Las <b>vacaciones</b> se pagan: esos días entran en el sueldo de la quincena y no descuentan nada. Solo se descuentan si están marcadas <b>«ya se le pagó»</b> —porque se cobraron en efectivo antes—, y en ese caso la planilla dice a quién y cuánto no le pagó.</li>
          {/* ⚠️ La pantalla para CARGAR vacaciones se apagó el 1-sep-2026
              (`PESTANAS_OCULTAS` en lib/asistencia/roles.ts). El cálculo no
              cambió, y decirlo acá evita que alguien busque una pestaña que no
              está y suponga que sus vacaciones dejaron de valer. */}
          <li>· ⚠️ La <b>pestaña para cargar vacaciones está oculta</b> desde el 1 de septiembre de 2026, mientras se trabaja la planilla. Las que ya estaban cargadas <b>siguen valiendo igual</b>: esos días se pagan y no cuentan como ausencia. Para cargar una nueva, pedísela a Daniel.</li>
          <li>· El <b>ISR, el préstamo, los terceros, la mercancía y los otros servicios</b> no salen de ningún sistema: se escriben a mano en la planilla. Los cuatro primeros se restan; <b>«otros servicios» se SUMA</b>, porque es un pago extra y no un descuento.</li>
          <li>· 🔴 A quien le falte el salario, la jornada o la ficha <b>no se le calcula nada</b>: sale listado con lo que le falta y queda <b>fuera del total</b>. Nunca en $0.</li>
        </ul>
      </div>

      {/* Lo aprendido el 5-ago: el reloj traía el turno mal en 12 de 31 personas.
          Que quede escrito para que nadie vuelva a confiar en ese dato. */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-medium text-gray-900">Antes de descontarle a alguien</h3>
        <ul className="mt-1 space-y-1.5 text-[13px] leading-relaxed text-gray-600">
          <li>· Revisa en <b>Horarios</b> que la hora de salida de esa persona sea la correcta. La que trae el reloj viene equivocada seguido.</li>
          <li>· Mira si sus minutos vienen de <b>días a revisar</b>: ahí el número puede estar inflado porque no marcó.</li>
          <li>· Comprueba que las <b>justificaciones</b> del período ya estén cargadas.</li>
          <li>· Los números de arriba se cambian en <b>Configuración</b> si la regla cambia.</li>
        </ul>
      </div>
    </div>
  );
}
