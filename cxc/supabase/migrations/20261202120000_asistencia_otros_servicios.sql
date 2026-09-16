-- ─────────────────────────────────────────────────────────────────────────────
-- «OTROS SERVICIOS» SALE DE LA FICHA (15-sep-2026).
--
-- Daniel, textual: *«debería de haber un campo en la ficha que diga "otros
-- servicios", y a qué quincena se le aplica ese extra (debe de ser la misma en
-- la que trabajó)»* · *«que sea como está, el total, ya el detalle debería estar
-- en el perfil»* · *«no paga seguro social y educativo»* · *«todos»* lo pueden
-- registrar.
--
-- ── 🩸 QUÉ VIENE A ARREGLAR ──────────────────────────────────────────────────
-- El caso real: JULIO GARAY, 1–15 sep, $31.00 de mensajería y flete + $120.00
-- de una fiesta religiosa = $151.00. Hoy eso vive en una nota suelta del Excel
-- de la contadora, y en la planilla es UN número tecleado a mano sin nada que
-- diga de dónde salió. Cuando alguien pregunte «¿y estos $151?», la respuesta
-- está en un archivo que no es el sistema.
--
-- ── 🔴 NO SE ELIGE FECHA NI QUINCENA ─────────────────────────────────────────
-- Daniel, 15-sep-2026 (su propia idea, y es mejor que la de partida): *«se
-- anota el día que se hace la gestión y entra en esa quincena, sin elegir
-- fecha»*. La `fecha` es la de HOY en Panamá, la pone el SERVIDOR, y de ahí sale
-- la `quincena`. Con eso desaparece entera la pregunta de qué pasa si alguien
-- anota algo con fecha de una quincena ya cerrada y pagada.
--
-- ⚠️ Lo único que se pierde es cuándo pasó de verdad si se anota tarde, y eso
-- lo cubre el `concepto`, que es OBLIGATORIO («mensajería del 8»). Algo hecho
-- el 15 y anotado el 16 cae en la quincena siguiente: la misma regla que todo
-- lo demás del módulo.
--
-- ── 🔴 SOFT DELETE, NUNCA UN `DELETE` ────────────────────────────────────────
-- La regla de la casa. Y con la quincena YA CERRADA un renglón no se borra ni
-- se edita (Daniel: *«no»*): eso lo decide el servidor mirando
-- `asistencia_planilla_guardada`, no esta tabla.
--
-- ── SEGURIDAD DE LA MIGRACIÓN ────────────────────────────────────────────────
-- Tabla NUEVA: no toca ni una fila de nada que exista. Y el código aguanta que
-- ESTO NO SE HAYA CORRIDO — sin la tabla, la sección de la ficha dice que falta
-- prepararla y la planilla se comporta EXACTAMENTE como hoy (la casilla «Otros
-- servicios» se escribe a mano, como siempre). Falla ABIERTA.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS asistencia_otros_servicios (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 🔴 LA IDENTIDAD ES EL CÓDIGO, nunca el nombre. Igual que todo el módulo.
  empleado_codigo text NOT NULL,

  -- La quincena a la que se le aplica, con la MISMA clave que
  -- `asistencia_planilla_manual` («2026-09-1»). La deriva el servidor de
  -- `fecha`: acá no se elige.
  quincena       text NOT NULL,

  -- El día en que se hizo la gestión = el día en que se anota (Panamá).
  fecha          date NOT NULL,

  -- 🔴 SE SUMA AL NETO, así que es positivo y no puede ser cero: un renglón de
  -- $0 no es un servicio, es un renglón que alguien dejó a medias.
  monto          numeric(12,2) NOT NULL CHECK (monto > 0),

  -- 🔴 OBLIGATORIO (Daniel: *«sí»*). Es lo único que explica de dónde salió la
  -- plata, y lo que reemplaza a la fecha que no se elige.
  concepto       text NOT NULL CHECK (btrim(concepto) <> ''),

  -- Quién lo anotó. Sale de la SESIÓN, nunca del cuerpo del pedido.
  anotado_por    text NOT NULL,
  creado_en      timestamptz NOT NULL DEFAULT now(),

  -- Soft delete firmado. NUNCA un DELETE.
  deleted        boolean NOT NULL DEFAULT false,
  deleted_por    text,
  deleted_en     timestamptz
);

-- Lo que la ficha y la planilla preguntan: los renglones vivos de una persona
-- en una quincena. La planilla pide la quincena entera de una empresa, así que
-- el índice arranca por ahí.
CREATE INDEX IF NOT EXISTS asistencia_otros_servicios_quincena_idx
  ON asistencia_otros_servicios (quincena, empleado_codigo)
  WHERE deleted = false;

COMMENT ON TABLE asistencia_otros_servicios IS
  'Los renglones de «Otros servicios» de cada colaborador, cargados desde su ficha (15-sep-2026). Se SUMAN al neto después de las deducciones y NO pagan seguro social ni educativo. La fecha es la del día en que se anotan y de ahí sale la quincena: no se elige.';
COMMENT ON COLUMN asistencia_otros_servicios.concepto IS
  'Obligatorio. Es lo que explica de dónde salió la plata, y lo que reemplaza a la fecha que no se elige («mensajería del 8»).';
COMMENT ON COLUMN asistencia_otros_servicios.quincena IS
  'Clave «AAAA-MM-N», la misma de asistencia_planilla_manual. La deriva el servidor de `fecha`.';
