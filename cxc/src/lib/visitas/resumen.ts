// ─────────────────────────────────────────────────────────────────────────────
// «QUIÉN USA QUÉ» — cómo se leen las visitas. Módulo PURO: acá no hay consultas
// ni `new Date()`. Recibe las filas crudas de `visitas_modulo` y arma las dos
// cosas que la pantalla muestra:
//
//   · el RESUMEN por módulo — «N personas · N visitas»;
//   · la LISTA por persona — módulo, persona, rol, visitas, celular/computadora
//     y última vez.
//
// 🔴 CELULAR Y COMPUTADORA SON DOS FILAS EN LA BASE y UNA sola en la pantalla:
// la misma persona entra al mismo módulo desde los dos aparatos y sigue siendo
// UNA persona. Sumarlas acá (y no en la base) es lo que permite decir «12
// visitas, 9 desde el teléfono» sin volver a preguntar nada.
// ─────────────────────────────────────────────────────────────────────────────

import { ALL_MODULES } from "@/lib/modules";

/** Una fila tal como sale de `visitas_modulo`. */
export interface FilaVisita {
  dia: string;
  user_id: string;
  user_name: string | null;
  role: string | null;
  modulo: string;
  aparato: string;
  visitas: number;
  ultima_en: string | null;
}

/** Una persona en un módulo: lo que se ve en cada renglón de la tabla. */
export interface VisitaDePersona {
  modulo: string;
  moduloLabel: string;
  userId: string;
  nombre: string;
  rol: string;
  visitas: number;
  celular: number;
  computadora: number;
  ultimaEn: string | null;
}

/** Un módulo: la línea del resumen de arriba. */
export interface VisitaDeModulo {
  modulo: string;
  moduloLabel: string;
  personas: number;
  visitas: number;
}

/** El nombre del módulo como se ve en el menú. Una key que ya no exista se
 *  muestra tal cual, nunca se esconde: la fila vieja sigue contando. */
export function rotuloDelModulo(key: string): string {
  return ALL_MODULES.find((m) => m.key === key)?.label ?? key;
}

function masReciente(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

/**
 * Una línea por (módulo, persona), con los dos aparatos sumados.
 *
 * Orden: primero el módulo más usado (más visitas), y dentro de él la persona
 * que más entró. Así lo primero que se lee contesta la pregunta de Daniel.
 */
export function visitasPorPersona(filas: readonly FilaVisita[]): VisitaDePersona[] {
  const porClave = new Map<string, VisitaDePersona>();

  for (const f of filas) {
    const clave = `${f.modulo}::${f.user_id}`;
    const visitas = Number(f.visitas) || 0;
    const previa = porClave.get(clave);
    const fila: VisitaDePersona = previa ?? {
      modulo: f.modulo,
      moduloLabel: rotuloDelModulo(f.modulo),
      userId: f.user_id,
      nombre: f.user_name || "—",
      rol: f.role || "—",
      visitas: 0,
      celular: 0,
      computadora: 0,
      ultimaEn: null,
    };
    fila.visitas += visitas;
    if (f.aparato === "celular") fila.celular += visitas;
    else fila.computadora += visitas;
    const antes = fila.ultimaEn;
    fila.ultimaEn = masReciente(antes, f.ultima_en);
    // El nombre y el rol más frescos son los de la visita más reciente.
    if (f.ultima_en && fila.ultimaEn === f.ultima_en) {
      if (f.user_name) fila.nombre = f.user_name;
      if (f.role) fila.rol = f.role;
    }
    porClave.set(clave, fila);
  }

  const visitasDelModulo = new Map<string, number>();
  for (const f of porClave.values()) {
    visitasDelModulo.set(f.modulo, (visitasDelModulo.get(f.modulo) ?? 0) + f.visitas);
  }

  return [...porClave.values()].sort((a, b) => {
    const ma = visitasDelModulo.get(a.modulo) ?? 0;
    const mb = visitasDelModulo.get(b.modulo) ?? 0;
    if (ma !== mb) return mb - ma;
    if (a.modulo !== b.modulo) return a.moduloLabel.localeCompare(b.moduloLabel, "es");
    if (a.visitas !== b.visitas) return b.visitas - a.visitas;
    return a.nombre.localeCompare(b.nombre, "es");
  });
}

/** «N personas · N visitas» por módulo, del más usado al menos usado. */
export function visitasPorModulo(filas: readonly FilaVisita[]): VisitaDeModulo[] {
  const porModulo = new Map<string, { visitas: number; personas: Set<string> }>();
  for (const f of filas) {
    const acc = porModulo.get(f.modulo) ?? { visitas: 0, personas: new Set<string>() };
    acc.visitas += Number(f.visitas) || 0;
    acc.personas.add(f.user_id);
    porModulo.set(f.modulo, acc);
  }
  return [...porModulo.entries()]
    .map(([modulo, acc]) => ({
      modulo,
      moduloLabel: rotuloDelModulo(modulo),
      personas: acc.personas.size,
      visitas: acc.visitas,
    }))
    .sort((a, b) =>
      b.visitas - a.visitas || a.moduloLabel.localeCompare(b.moduloLabel, "es"),
    );
}

/**
 * Los módulos que NADIE abrió en la ventana medida.
 *
 * Es la mitad que de verdad contesta «¿quién usa qué?»: un módulo que no
 * aparece en ninguna fila no es un dato que falta, es la respuesta.
 */
export function modulosSinVisitas(filas: readonly FilaVisita[]): VisitaDeModulo[] {
  const vistos = new Set(filas.map((f) => f.modulo));
  return ALL_MODULES
    .filter((m) => !vistos.has(m.key))
    .map((m) => ({ modulo: m.key, moduloLabel: m.label, personas: 0, visitas: 0 }))
    .sort((a, b) => a.moduloLabel.localeCompare(b.moduloLabel, "es"));
}
