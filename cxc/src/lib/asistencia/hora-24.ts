// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LAS HORAS SE ESCRIBEN Y SE VEN EN 24 H (29-sep-2026, audit visual «21a»,
// aprobado por Daniel).
//
// 🩸 Horarios usaba `<input type="time">`, que dibuja la hora con el reloj del
// SISTEMA de quien mira: en una Mac en 12 h la salida de las 16:30 se leía
// «04:30 p». Ese formato no se puede forzar desde la página, así que el campo
// pasó a ser de TEXTO y esta función decide qué se escribió.
//
// Se acepta lo que un dedo teclea sin pensar y se devuelve SIEMPRE "HH:MM":
//   "16:30" · "9:05" · "1630" · "905" · "16" · "9"  →  "16:30" · "09:05" · … · "09:00"
// "" = campo vacío (el llamador decide si se puede). `null` = no es una hora del
// día: la pantalla lo DICE y vuelve al valor guardado, nunca guarda a medias.
// Lo que se manda al servidor es el mismo "HH:MM" de siempre.
// ─────────────────────────────────────────────────────────────────────────────

export function leerHora24(texto: string): string | "" | null {
  const t = texto.trim();
  if (t === "") return "";
  let h: string;
  let m: string;
  const conDosPuntos = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (conDosPuntos) {
    [, h, m] = conDosPuntos;
  } else if (/^\d{1,4}$/.test(t)) {
    // 1-2 cifras = la hora en punto; 3-4 = hora y minutos («905», «1630»).
    h = t.length <= 2 ? t : t.slice(0, t.length - 2);
    m = t.length <= 2 ? "00" : t.slice(-2);
  } else {
    return null;
  }
  const hn = Number(h);
  const mn = Number(m);
  if (hn > 23 || mn > 59) return null;
  return `${String(hn).padStart(2, "0")}:${String(mn).padStart(2, "0")}`;
}
