"use client";

// Las reglas, en simple. Daniel lo pidió: "algo que le explique al usuario de
// forma sencilla y fácil y corta de entender el módulo y la marcación".
//
// Va DENTRO del módulo a propósito: un reglamento en un papel se pierde; acá
// está al lado del número que genera la discusión. Sin jerga y sin fórmulas.

const REGLAS: Array<{ t: string; d: string }> = [
  {
    t: "Se marca 4 veces al día",
    d: "Al llegar, al salir a almorzar, al volver, y al irse. Si falta alguna, el día queda señalado como “a revisar”.",
  },
  {
    t: "La entrada es a las 8:00, con 5 minutos de gracia",
    d: "Marcar hasta las 8:05 no cuenta como tarde. Pasadas las 8:05, se cuentan los minutos desde las 8:00 — o sea que llegar 8:06 son 6 minutos, no 1.",
  },
  {
    t: "El almuerzo es de 30 minutos",
    d: "Se mide entre la salida a almorzar y el regreso. Lo que pase de ahí cuenta como tiempo no trabajado. Algunas personas tienen 60 minutos.",
  },
  {
    t: "La hora de salida depende de cada quien",
    d: "Unos salen 4:30 y otros 5:00. Salir antes de tu hora cuenta como tiempo no trabajado.",
  },
  {
    t: "Las horas extra se aprueban, no se toman",
    d: "Quedarse después de tu hora se registra, pero solo cuenta como hora extra si alguien la autoriza. Menos de 15 minutos no cuenta. Y si ese día llegaste tarde, primero se recupera ese tiempo.",
  },
  {
    t: "Faltar sin marcar es ausencia",
    d: "Salvo que sea feriado o que se haya registrado una justificación (vacaciones, incapacidad, permiso).",
  },
  {
    t: "Marcar mal es responsabilidad de cada uno",
    d: "Si no marcaste al entrar, el sistema cuenta desde tu primera marca. El día queda señalado para corregirlo, pero los minutos cuentan.",
  },
];

export default function ComoFuncionaTab() {
  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Cómo funciona la marcación</h2>
        <p className="mt-1 text-sm text-gray-500">
          Esto es lo que mide el sistema. Sirve para imprimirlo y pegarlo al lado del reloj.
        </p>
      </div>

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
          Del reloj de la entrada. Hoy se cargan subiendo el Excel que se exporta desde
          iVMS-4200; más adelante entrarán solos. Se puede subir el mismo archivo varias
          veces sin miedo: las marcaciones repetidas no se duplican.
        </p>
      </div>

      {/* Lo aprendido el 5-ago: el reloj traía el turno mal en 12 de 31 personas.
          Que quede escrito para que nadie vuelva a confiar en ese dato. */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-medium text-gray-900">Antes de descontarle a alguien</h3>
        <ul className="mt-1 space-y-1.5 text-[13px] leading-relaxed text-gray-600">
          <li>· Revisa en <b>Horarios</b> que la hora de salida de esa persona sea la correcta. La que trae el reloj viene equivocada seguido.</li>
          <li>· Mira si sus minutos vienen de <b>días a revisar</b>: ahí el número puede estar inflado porque no marcó.</li>
          <li>· Comprueba que las <b>justificaciones</b> del período ya estén cargadas.</li>
        </ul>
      </div>
    </div>
  );
}
