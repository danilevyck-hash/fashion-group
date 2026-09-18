-- ─────────────────────────────────────────────────────────────────────────────
-- Una descripción que «PASA» también entra al catálogo (17-sep-2026).
--
-- Daniel, 8-sep-2026: «q siga pasando pero se agregue al catalogo (para poner
-- formulas en algun momento)».
--
-- Hasta hoy `depurador_descripciones.origen` solo aceptaba dos valores:
--   · 'seed'     → las 227 del catálogo original.
--   · 'aprobada' → las que alguien MIRÓ en la alarma y decidió aprobar (77 en
--                  producción al 17-sep-2026).
--
-- Falta el tercero: la que entró SOLA porque su veredicto fue `pasa` (las dos
-- mitades ya existían dentro de su marca). No la aprobó nadie, así que decirle
-- 'aprobada' sería mentir en la auditoría, y decirle 'seed' sería mentir dos
-- veces. Se llama 'automatica' y va con `aprobada_por` y `aprobada_at` en NULL.
--
-- 🔴 ADITIVA Y SIN RIESGO: solo ENSANCHA el CHECK. Ninguna fila cambia, ningún
-- valor viejo deja de valer y nada se borra. Mientras no corra, la ruta
-- `…/descripciones/registrar` falla ABIERTA (el 23514 se traga, contesta ok con
-- cero registradas) y todo se comporta exactamente como antes.
--
-- Idempotente: se puede correr dos veces.
-- ─────────────────────────────────────────────────────────────────────────────

alter table depurador_descripciones
  drop constraint if exists depurador_descripciones_origen_check;

alter table depurador_descripciones
  add constraint depurador_descripciones_origen_check
  check (origen in ('seed', 'aprobada', 'automatica'));

comment on column depurador_descripciones.origen is
  'De dónde salió la fila: seed (catálogo original) · aprobada (alguien la miró en la alarma y la aprobó; aprobada_por/aprobada_at dicen quién y cuándo) · automatica (entró sola: su veredicto fue «pasa», las dos mitades ya existían en su marca).';
