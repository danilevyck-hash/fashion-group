// Reloj CLAVADO para el servidor de producción, en la misma idea que
// `vi.setSystemTime` de los tests: `new Date()` y `Date.now()` devuelven el
// instante de RELOJ_FIJO y nada más.
//
// Sin esto, el bug del borde horario de Panamá solo se puede medir contra
// producción 5 horas de cada 24 (00:00–05:00 UTC), y "antes" y "después"
// quedarían medidos con relojes distintos — o sea, sin comparar nada.
//
//   NODE_OPTIONS="--require ./scripts/_reloj-clavado.cjs" \
//   RELOJ_FIJO=2026-08-25T00:30:00Z npx next start -p 3223
const FIJO = Date.parse(process.env.RELOJ_FIJO || "");
if (!Number.isFinite(FIJO)) throw new Error("RELOJ_FIJO inválido: " + process.env.RELOJ_FIJO);
const Real = Date;
class Clavado extends Real {
  constructor(...args) {
    if (args.length === 0) super(FIJO);
    else super(...args);
  }
  static now() { return FIJO; }
}
globalThis.Date = Clavado;
