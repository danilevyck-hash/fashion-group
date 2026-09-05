-- ─────────────────────────────────────────────────────────────────────────────
-- BORRAR DE VERDAD LOS PEDIDOS DE PRUEBA DE CALVIN Y JOYBEES (4-sep-2026)
--
-- Daniel, textual: *«borro de verdad de la base»*.
--
-- Son las corridas de verificación de agosto: 16 en `calvin_orders` y 37 en
-- `joybees_orders`, todas ya marcadas `deleted = true`, todas en estado
-- `borrador`, con nombres «PRUEBA … — BORRAR» / «PRUEBA-BOT» o creadas por el
-- usuario `medicion` para medir el flujo del checkout. Las dos más viejas
-- (JBP-004 y JBP-005, 24-jul) son del bot que probó el pedido público.
--
-- 🔴 NINGUNO SE MANDÓ A SWITCH — verificado contra producción el 4-sep-2026, y
-- verificado OTRA VEZ acá adentro: antes de borrar nada, el que tenga un envío
-- vivo se SACA de la lista (`EXISTS` contra `<marca>_switch_envios` con
-- `estado <> 'error'` — el índice parcial único del at-most-once). Un pedido
-- que llegó al ERP guarda lo que Switch no tiene (quién lo armó, el comentario,
-- si fue pedido o cotización, el PDF que se le mandó al cliente): **ése no se
-- borra**. Si alguno de estos ids ganara un envío entre que se escribe esta
-- migración y que se aplica, el filtro lo salva solo — no hay que acordarse.
--
-- Medido antes de escribir esto:
--   calvin_switch_envios   3 filas, ninguna apunta a los 16 ids de abajo
--   joybees_switch_envios  4 filas, ninguna apunta a los 37 ids de abajo
--   calvin_order_items    16 renglones de esos pedidos (de 52 en la tabla)
--   joybees_order_items   45 renglones de esos pedidos (de 77 en la tabla)
--   ninguna fila viva de `<marca>_orders` los referencia por `reemplaza_a`
--
-- ⚠️ El `AND o.deleted IS TRUE` es el segundo freno: un id de esta lista que
-- alguien hubiera "restaurado" tampoco se borra.
--
-- ⚠️ Quedan a propósito dos filas de `joybees_pedidos_publicos` (`jz3tcmm2` y
-- `wsui927p`) con `ped_order_number` = JBP-004 / JBP-005. Las dos están ya
-- borradas (`deleted = true`) y son del mismo bot, así que ninguna pantalla las
-- mira; borrar filas que Daniel no pidió borrar sería pasarse del encargo.
--
-- 🔴 ESTE ES UN BORRADO REAL Y NO SE DESHACE. Es la excepción, no la regla: la
-- casa borra suave (`deleted`) y conserva las tablas (`mayor_lineas`). Acá se
-- borra porque lo que se va no es un dato del negocio — es basura de una
-- verificación, y Daniel lo pidió por su nombre.
--
-- Lista EXPLÍCITA de ids: nada de `WHERE client_name LIKE '%PRUEBA%'`, que
-- mañana engancharía un pedido de verdad de un cliente que se llame así.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Calvin Klein (16 pedidos) ──────────────────────────────────────────────
CREATE TEMP TABLE _calvin_prueba (id uuid PRIMARY KEY);
INSERT INTO _calvin_prueba (id) VALUES
    ('77c612ab-8064-4dde-b7fd-f9beee2f21dc'::uuid),  -- CKP-001 · PRUEBA T169 — BORRAR · 2026-08-13
    ('e277c302-5664-4847-aa6d-88694ca82ca4'::uuid),  -- CKP-002 · PRUEBA T169 — BORRAR · 2026-08-13
    ('8637e94f-7325-46ee-8c5c-d3e9ecd20ca5'::uuid),  -- CKP-003 · PRUEBA T169 — BORRAR · 2026-08-13
    ('9ce582bb-80af-4298-a23c-03b473f882a5'::uuid),  -- CKP-004 · PRUEBA T169 — BORRAR · 2026-08-13
    ('df8f173e-c627-4855-8b25-c1a0c757cd9f'::uuid),  -- CKP-008 · PRUEBA T173 — BORRAR · 2026-08-13
    ('8ce5c4e4-6b19-4630-9331-5193a2d13b38'::uuid),  -- CKP-009 · PRUEBA T173 — BORRAR · 2026-08-13
    ('c82468ca-6461-4848-8683-4617d59df408'::uuid),  -- CKP-010 · PRUEBA T173 — BORRAR · 2026-08-13
    ('674a38c1-49d5-4088-bfa4-eff71c2faf46'::uuid),  -- CKP-011 · PRUEBA T173 — BORRAR · 2026-08-13
    ('66edbf63-2f2e-46e6-bb8f-1a1514b21e3b'::uuid),  -- CKP-012 · PRUEBA T173 — BORRAR · 2026-08-13
    ('24ee6286-71b8-4fc9-98b8-54948a4dab99'::uuid),  -- CKP-013 · PRUEBA T173 — BORRAR · 2026-08-13
    ('00ef7ef6-d28d-4cf0-a7bd-52e326f74213'::uuid),  -- CKP-014 · PRUEBA T173 — BORRAR · 2026-08-13
    ('491cad08-7937-44d4-8db3-39c3b5f4b09f'::uuid),  -- CKP-015 · PRUEBA T173 — BORRAR · 2026-08-13
    ('004dbc5a-53d7-455d-92c4-8601255acf62'::uuid),  -- CKP-016 · PRUEBA T173 — BORRAR · 2026-08-13
    ('8a16099e-b876-4481-8a4b-86df2fdf1700'::uuid),  -- CKP-017 · PRUEBA T173 — BORRAR · 2026-08-13
    ('7de5a5a4-93b4-4d2a-be50-15efd78b1b3c'::uuid),  -- CKP-018 · PRUEBA T173 — BORRAR · 2026-08-13
    ('664ac30f-6b87-41c6-9659-c0750f80ac4b'::uuid);  -- CKP-019 · PRUEBA T173 — BORRAR · 2026-08-13

-- 🔴 El que tenga un envío VIVO (estado <> 'error') se saca de la lista y NO se
-- toca. Este `DELETE` es el que decide, no la medición de arriba.
DELETE FROM _calvin_prueba p
 WHERE EXISTS (
   SELECT 1 FROM calvin_switch_envios e
    WHERE e.order_id = p.id AND e.estado <> 'error'
 );

DELETE FROM calvin_order_items i
 WHERE i.order_id IN (SELECT id FROM _calvin_prueba);

DELETE FROM calvin_orders o
 WHERE o.id IN (SELECT id FROM _calvin_prueba)
   AND o.deleted IS TRUE;

DROP TABLE _calvin_prueba;

-- ── Joybees (37 pedidos) ───────────────────────────────────────────────────
CREATE TEMP TABLE _joybees_prueba (id uuid PRIMARY KEY);
INSERT INTO _joybees_prueba (id) VALUES
    ('647e9eff-0c24-4338-b585-25630f756494'::uuid),  -- JBP-004 · PRUEBA-BOT · 2026-07-24
    ('fdafea91-1775-443b-84b4-c7844baf8539'::uuid),  -- JBP-005 · PRUEBA-BOT · 2026-07-24
    ('4a52add7-38aa-4688-ae0b-6c504f0bd22e'::uuid),  -- JBP-006 · PRUEBA T143 — BORRAR · 2026-08-12
    ('ef36f10b-dda8-46bb-8692-70adac8bf288'::uuid),  -- JBP-007 · PRUEBA T143 — BORRAR · 2026-08-12
    ('be66493d-6250-4b6a-9863-c11b0cc9523b'::uuid),  -- JBP-008 · PRUEBA T143 — BORRAR · 2026-08-12
    ('ad608c0b-d6f2-480c-944a-7521a7ced0d8'::uuid),  -- JBP-009 · PRUEBA T143 DUP — BORRAR · 2026-08-12
    ('f2ce2f7d-1397-4e4d-a37d-f73a8db9f756'::uuid),  -- JBP-010 · PRUEBA T143 DUP — BORRAR · 2026-08-12
    ('2db4a925-8ed7-44f0-9101-f5f749b57c00'::uuid),  -- JBP-011 · PRUEBA T143 — BORRAR · 2026-08-12
    ('92ed90d3-bbed-4b1f-a4f7-6ebdfa7a346e'::uuid),  -- JBP-012 · A-Amani, S.A. · 2026-08-12
    ('2a449c94-8017-4e9f-b05c-2778c5bace78'::uuid),  -- JBP-013 · Contado (mostrador) · 2026-08-12
    ('e8e4395e-9dc2-4c40-8861-f53b9a19144c'::uuid),  -- JBP-014 · PRUEBA T143 — BORRAR · 2026-08-12
    ('c6d0be4d-2f39-4af9-8690-4bb41558c28e'::uuid),  -- JBP-015 · A-Amani, S.A. · 2026-08-12
    ('fe3c2905-4a14-4abf-9495-ef159d5b2ac6'::uuid),  -- JBP-016 · Contado (mostrador) · 2026-08-12
    ('9b7d98e3-a5e1-4eec-9e33-036a9c7f6266'::uuid),  -- JBP-017 · PRUEBA T143 — BORRAR · 2026-08-12
    ('0075c416-625f-4706-adbf-fb97f1659e5e'::uuid),  -- JBP-018 · A-Amani, S.A. · 2026-08-12
    ('5fc03b22-5b4f-48e0-bc17-2eda59b72b39'::uuid),  -- JBP-019 · Contado (mostrador) · 2026-08-12
    ('e22952e4-605b-43c8-b491-de99a9b59bd6'::uuid),  -- JBP-020 · PRUEBA T143 — BORRAR · 2026-08-12
    ('6b4fd716-3719-473e-8db7-fa7892c2628b'::uuid),  -- JBP-021 · A-Amani, S.A. · 2026-08-12
    ('c97bc4c2-cf3a-4f51-82ed-e01669e4918f'::uuid),  -- JBP-022 · Contado (mostrador) · 2026-08-12
    ('08b0dc6f-2f76-4911-a18c-f928a3e4d7c0'::uuid),  -- JBP-023 · PRUEBA T143 — BORRAR · 2026-08-12
    ('e2052d09-b5fe-4ee0-951b-933611e2a563'::uuid),  -- JBP-024 · A-Amani, S.A. · 2026-08-12
    ('5599b31a-b26c-4433-8894-c14a9e5b2f95'::uuid),  -- JBP-025 · Contado (mostrador) · 2026-08-12
    ('80561e77-2b2e-4124-81bb-58badd8693ca'::uuid),  -- JBP-026 · PRUEBA T143 — BORRAR · 2026-08-12
    ('fb72a707-f2e2-4d88-adde-ac0d58b6282d'::uuid),  -- JBP-027 · A-Amani, S.A. · 2026-08-12
    ('6367cb71-9879-460c-af62-4dde25999aca'::uuid),  -- JBP-028 · Contado (mostrador) · 2026-08-12
    ('05f86d1d-e89b-4210-be48-e0897665edbb'::uuid),  -- JBP-029 · PRUEBA T143 — BORRAR · 2026-08-12
    ('c82419e4-a7d4-42df-a32d-58e6a9f1de17'::uuid),  -- JBP-030 · A-Amani, S.A. · 2026-08-12
    ('d9067dbe-05a7-4033-b573-b5da941fea16'::uuid),  -- JBP-031 · Contado (mostrador) · 2026-08-12
    ('1422bd0c-aca3-42b1-aff6-c11b2bb8d0d7'::uuid),  -- JBP-032 · PRUEBA T173 — BORRAR · 2026-08-13
    ('976166f6-45d8-4713-8906-c468fc3fe923'::uuid),  -- JBP-033 · A-Amani, S.A. · 2026-08-13
    ('4f0ef685-f10e-41a3-b1c6-7fe397fff1e1'::uuid),  -- JBP-034 · Contado (mostrador) · 2026-08-13
    ('66db2d8d-296d-42cb-a4a1-44c17133c17c'::uuid),  -- JBP-035 · PRUEBA T173 — BORRAR · 2026-08-13
    ('48a3cebb-6b68-43d6-b151-9a5c92badcb5'::uuid),  -- JBP-036 · A-Amani, S.A. · 2026-08-13
    ('5a6a16a3-b1d3-498f-8fdb-9cf3554c9108'::uuid),  -- JBP-037 · Contado (mostrador) · 2026-08-13
    ('93334444-20f8-436d-84fe-1ae7b02b31af'::uuid),  -- JBP-038 · PRUEBA T173 — BORRAR · 2026-08-13
    ('d0db243d-d93e-49e3-b257-f3296b95e64d'::uuid),  -- JBP-039 · A-Amani, S.A. · 2026-08-13
    ('bbd50666-d386-43a4-b3e5-02b84f38becd'::uuid);  -- JBP-040 · Contado (mostrador) · 2026-08-13

DELETE FROM _joybees_prueba p
 WHERE EXISTS (
   SELECT 1 FROM joybees_switch_envios e
    WHERE e.order_id = p.id AND e.estado <> 'error'
 );

DELETE FROM joybees_order_items i
 WHERE i.order_id IN (SELECT id FROM _joybees_prueba);

DELETE FROM joybees_orders o
 WHERE o.id IN (SELECT id FROM _joybees_prueba)
   AND o.deleted IS TRUE;

DROP TABLE _joybees_prueba;

COMMIT;
