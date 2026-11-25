-- ─────────────────────────────────────────────────────────────────────────────
-- LIMPIEZA ÚNICA (25-nov-2026, Daniel: «sí, los tres»): 7 etiquetas que decían
-- «pendiente de guía» aunque ya salieron en una guía COMPLETADA. La guía
-- llevaba su factura escrita a mano y nada las ató. Desde hoy las ata sola el
-- servidor al completar (`GUIA_AMARRE_FACTURAS_2026_11`), con el MISMO criterio
-- que aquí: misma empresa + últimos 4 dígitos + guía completada.
--
-- Solo escribe `guias_etiquetas.guia_item_id`, y solo si sigue vacío (correrla
-- dos veces no hace nada). Medido el 25-nov-2026, cada etiqueta con UN renglón
-- y el MISMO cliente:
--
--   id  │ empresa       │ factura │ cliente │ guía
--   99  │ fashion_wear  │ 3345    │ D-82    │ GT-293
--   103 │ vistana       │ 3166    │ D-129   │ GT-293
--   115 │ fashion_wear  │ 3352    │ D-8     │ GT-295
--   123 │ fashion_shoes │ 2612    │ D-86    │ GT-313
--   124 │ fashion_shoes │ 2611    │ D-112   │ GT-313
--   159 │ fashion_wear  │ 3378    │ D-24    │ GT-308
--   208 │ vistana       │ 3222    │ D-14    │ GT-312
--
-- 🔴 QUEDAN FUERA, a propósito:
--   · id 178, Sporting Shoes 11-2438 (50 bultos, 16-nov): Daniel dirá si fue prueba.
--   · GT-313 renglón Dorado Sports: dice «2943» y es la 2643 (error de dedo); no se toca.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE guias_etiquetas AS e
SET guia_item_id = v.item::uuid
FROM (VALUES
  (99,  'b3bc8b84-2f4d-406b-baf0-58d9be9ab1fd'),
  (103, 'af3057d2-4b46-4393-8fe2-b668ed2613c5'),
  (115, 'cf20fb5b-46c1-433b-88a4-6ce0b4fd7c23'),
  (123, '8d04b93c-aa14-4ca6-a369-4d4cb1404d16'),
  (124, '39481798-21cc-4cc3-a365-21f930886a3a'),
  (159, '551b5333-5e89-45c6-9063-1cab9d163e41'),
  (208, '413efae5-461c-4721-aa2c-68e8432d970c')
) AS v(id, item)
WHERE e.id = v.id
  AND e.guia_item_id IS NULL
  AND NOT e.deleted;
