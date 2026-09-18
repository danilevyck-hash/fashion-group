-- ═════════════════════════════════════════════════════════════════════════════
-- guias_etiquetas — LAS ETIQUETAS DE LAS CAJAS DE UN DESPACHO (18-sep-2026)
-- ═════════════════════════════════════════════════════════════════════════════
-- Daniel: elegir una factura, escribir cuántas cajas y que salgan las hojas
-- para pegar. La etiqueta se imprime PRIMERO; la guía se hace ese mismo día o
-- tres días después.
--
-- 🩸 POR QUÉ NACE UNA TABLA. Medido contra producción el 18-sep-2026: los
-- bultos de hoy son UN NÚMERO POR RENGLÓN de la guía (`guia_items.bultos`,
-- 607 renglones vivos, 14,2 de promedio) y se escriben AL CREAR LA GUÍA, o sea
-- DESPUÉS de lo que Daniel quiere imprimir ANTES. Un bulto no es una cosa en
-- ningún lado: no hay caja 1, caja 2, caja 3 — ni tabla, ni columna, ni id. Y
-- el número de factura del renglón es TEXTO LIBRE (`11-000003252, 11-000003250`
-- pegadas con coma), sin un solo id de Switch: se parea por empresa + últimos
-- 4 dígitos, que es una convención, no una relación. Esta tabla llena esos dos
-- huecos y no toca ni una fila de lo que ya existe.
--
-- 🔴 EL ESTADO SE DERIVA, NO SE MANTIENE. No hay columna «estado». Una etiqueta
-- está «En GT-XXX» si su `guia_item_id` apunta a un renglón VIVO de una guía
-- VIVA; en cualquier otro caso —sin renglón, renglón con `deleted = true`, guía
-- con `deleted = true`— vuelve sola a «Pendiente de guía». Daniel, al aprobar:
-- «si la guía o el renglón se borran, la etiqueta vuelve sola a Pendiente».
-- Una columna de estado que alguien tenga que mantener es una columna que
-- algún día miente.
--
-- 🔴 EL ÚNICO ES PARCIAL: `(empresa_key, switch_factura_id) WHERE NOT deleted`.
-- Una factura no puede tener dos juegos de etiquetas a la vez, pero borrado el
-- juego SÍ se puede volver a etiquetar (dos filas, una viva). El anti-duplicado
-- lo decide el SERVIDOR (409) y este índice es la red de abajo.
--
-- ⚠️ LA CONVENCIÓN DE ESTA TABLA, ESCRITA: `deleted` es `NOT NULL DEFAULT
-- false`, nunca NULL. En varias tablas de la casa `deleted` es NULLABLE y hay
-- que filtrar `.or("deleted.is.null,deleted.eq.false")` (préstamos); acá NO —
-- `NOT NULL` es lo que hace que el índice parcial `WHERE NOT deleted` sea
-- simple y no deje pasar un repetido con `deleted IS NULL`.
--
-- 🔴 SOFT DELETE FIRMADO, NUNCA DELETE — el mismo patrón que
-- `guias_destino_lista` y `guias_destino_cliente`, con CHECK que exige la firma.
--
-- 🔴 Esta tabla NO ESCRIBE NADA en `guia_items` ni en `guia_transporte`: la guía
-- se sigue creando exactamente igual que hoy. Lo único que cruza es la lectura
-- del renglón para saber si la etiqueta ya salió, y el `guia_item_id` que se
-- anota de ESTE lado al importar.
--
-- Empresas: solo las 6 del grupo (`B2B_EMPRESA_KEYS`). Boston y Multifashion
-- no entran — no tienen líneas de factura y no son guías de este módulo.
-- RLS: solo `service_role`; la app entra por el cliente del servidor y la ruta
-- exige rol (admin · secretaria · bodega, los mismos de `GUIAS_WRITE_ROLES`).
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS guias_etiquetas (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- ── La factura, con su id de Switch: el dato que hoy se pierde ────────────
  -- `empresa_key` es una de las 6 del grupo. La lista NO se cierra con un CHECK
  -- enumerado a propósito: las claves viven en `B2B_EMPRESA_KEYS` y quien
  -- escribe es el servidor, que ya valida contra esa lista. Un CHECK acá sería
  -- una segunda definición de «las seis».
  empresa_key       text    NOT NULL,
  -- 🔴 EL ID DE SWITCH (`switch_facturas.switch_factura_id`, integer). Es lo
  -- que permite juntar sin adivinar: la guía guarda el número como texto.
  switch_factura_id integer NOT NULL,
  -- El número tal cual lo imprime Switch («11-000002558»). Se guarda COMPLETO;
  -- recortarlo es cosa de la pantalla (`facturasParaMostrar`).
  secuencial        text    NOT NULL,
  -- La fecha de la FACTURA (no la de hoy): es la que sale en la etiqueta.
  fecha_factura     date    NOT NULL,

  -- ── El cliente y a dónde va ──────────────────────────────────────────────
  cliente_codigo    text    NOT NULL,
  -- El nombre tal cual se va a imprimir. Se congela al etiquetar: el papel
  -- pegado a la caja no cambia porque el directorio cambie después.
  cliente_nombre    text    NOT NULL,
  -- 🔴 El DESTINO DEL ENVÍO, no la dirección del directorio. Misma regla que
  -- `guia_items.direccion`; el candado `clientes-direccion-no-alimenta-guias`
  -- sigue valiendo.
  destino           text    NOT NULL,

  -- ── Las cajas ────────────────────────────────────────────────────────────
  -- Cuántas cajas lleva ESTA factura. Entre 1 y 300 (el récord real de una
  -- guía entera son 291 bultos; el de un renglón, 79).
  cajas             integer NOT NULL,

  -- ── El amarre con la guía: EL RENGLÓN, no la guía ────────────────────────
  -- 🔴 NULL = todavía no salió en ninguna guía. Apunta a `guia_items`, no a
  -- `guia_transporte`, porque una guía lleva varios clientes y varias empresas
  -- y lo que se llevó esta factura es UN renglón. `ON DELETE SET NULL`: si
  -- alguna vez se borrara de verdad un renglón, la etiqueta vuelve a
  -- «Pendiente» en vez de quedar apuntando al vacío.
  guia_item_id      uuid REFERENCES guia_items(id) ON DELETE SET NULL,

  -- ── Soft delete firmado ──────────────────────────────────────────────────
  deleted           boolean NOT NULL DEFAULT false,
  creado_por        text    NOT NULL,
  creado_en         timestamptz NOT NULL DEFAULT now(),
  borrado_por       text,
  borrado_en        timestamptz,

  CONSTRAINT guias_etiquetas_cajas_rango
    CHECK (cajas >= 1 AND cajas <= 300),
  CONSTRAINT guias_etiquetas_textos_no_vacios
    CHECK (
      empresa_key    = BTRIM(empresa_key)    AND empresa_key    <> '' AND
      secuencial     = BTRIM(secuencial)     AND secuencial     <> '' AND
      cliente_codigo = BTRIM(cliente_codigo) AND cliente_codigo <> '' AND
      cliente_nombre = BTRIM(cliente_nombre) AND cliente_nombre <> '' AND
      destino        = BTRIM(destino)        AND destino        <> ''
    ),
  -- Un borrado se firma: sin quién ni cuándo, no hay soft delete.
  CONSTRAINT guias_etiquetas_baja_firmada
    CHECK (NOT deleted OR (borrado_por IS NOT NULL AND borrado_en IS NOT NULL))
);

-- 🔴 EL ÚNICO PARCIAL. Una factura viva no se etiqueta dos veces; borrada la
-- etiqueta, esa misma factura se puede volver a etiquetar.
CREATE UNIQUE INDEX IF NOT EXISTS guias_etiquetas_factura_viva_unica
  ON guias_etiquetas (empresa_key, switch_factura_id)
  WHERE NOT deleted;

-- Para derivar el estado de un tirón (etiqueta → renglón → guía).
CREATE INDEX IF NOT EXISTS guias_etiquetas_por_renglon
  ON guias_etiquetas (guia_item_id)
  WHERE guia_item_id IS NOT NULL;

-- La lista abre por «pendientes de guía», lo más reciente arriba.
CREATE INDEX IF NOT EXISTS guias_etiquetas_vivas_por_fecha
  ON guias_etiquetas (creado_en DESC)
  WHERE NOT deleted;

ALTER TABLE guias_etiquetas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'guias_etiquetas' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON guias_etiquetas
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Sin DELETE a propósito: borrar = deleted = true, firmado.
GRANT SELECT, INSERT, UPDATE ON guias_etiquetas TO service_role;

COMMENT ON TABLE guias_etiquetas IS
  'Etiquetas de las cajas de un despacho (Guías › Etiquetas, 18-sep-2026). Una '
  'fila por FACTURA: cuántas cajas lleva, a qué destino y con el id de Switch '
  'de esa factura — el dato que guia_items.facturas (texto libre) no guarda. '
  'El estado se DERIVA de guia_item_id: sin renglón vivo, «Pendiente de guía». '
  'Soft delete (deleted = true) firmado, NUNCA DELETE. `deleted` es NOT NULL '
  'en esta tabla (no la convención nullable de préstamos).';
COMMENT ON COLUMN guias_etiquetas.switch_factura_id IS
  'switch_facturas.switch_factura_id — el id real de Switch. Es lo que permite '
  'juntar sin adivinar por empresa + últimos 4 dígitos.';
COMMENT ON COLUMN guias_etiquetas.cajas IS
  'Cuántas cajas lleva ESTA factura. Se numeran 1..N al imprimir («CAJA 3 de 14»).';
COMMENT ON COLUMN guias_etiquetas.guia_item_id IS
  'El RENGLÓN de la guía que se llevó esta factura, o NULL. El estado se deriva '
  'de acá: renglón borrado o guía borrada = la etiqueta vuelve a «Pendiente».';
COMMENT ON COLUMN guias_etiquetas.destino IS
  'Destino del ENVÍO (el mismo que guia_items.direccion), nunca la dirección del directorio.';
