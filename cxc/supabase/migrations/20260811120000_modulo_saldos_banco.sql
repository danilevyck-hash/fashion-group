-- ============================================================================
-- Saldos de Banco — el módulo propio para lo que ya existe
-- ============================================================================
-- Los saldos bancarios eran una SECCIÓN dentro de "Gastos de Empresa". Ahora
-- son su propio módulo (`saldos-banco`, /saldos-banco) para que el módulo de
-- gastos pueda retirarse sin llevárselos puestos.
--
-- QUÉ NO HACE ESTE ARCHIVO, y es lo importante:
--   · NO toca `bancos_saldos`. Ni una fila, ni una columna, ni un índice, ni
--     una política. Las 52 filas cargadas por Contabilidad (ene→ago 2026, 7
--     empresas) quedan exactamente como están, y la "Disponibilidad" de Vista
--     General las sigue leyendo con el mismo criterio de siempre.
--   · NO borra `empresa_gastos_mensuales` (0 filas) ni `gastos_categorias`
--     (6 filas) ni quita `gastos-empresa` de nadie. Retirar el módulo viejo es
--     otro cambio, y va DESPUÉS de que el módulo de gastos nuevo esté publicado.
--
-- LO ÚNICO que hace: darle la key nueva a quien ya tenía la vieja, para que la
-- ficha del menú aparezca. Es aditivo e idempotente.
--
-- ⚠️ LA PANTALLA FUNCIONA ANTES DE QUE ESTO CORRA. `MODULO_HEREDA_PERMISO_DE`
-- (src/lib/modules.ts) hace que quien tenga `gastos-empresa` vea también
-- `saldos-banco`. Esta migración es lo que permite RETIRAR esa herencia más
-- adelante — no es lo que enciende el módulo.
-- ============================================================================

-- Los roles que hoy tienen `gastos-empresa` son los que cargan y miran los
-- saldos: admin y contabilidad (las 52 filas están firmadas "Contabilidad").
-- Se deriva de la lista existente en vez de escribir los roles a mano: si
-- alguien le dio el módulo viejo a otro rol, hereda el nuevo también.
UPDATE role_permissions
SET modulos = array_append(modulos, 'saldos-banco')
WHERE 'gastos-empresa' = ANY (COALESCE(modulos, '{}'))
  AND NOT ('saldos-banco' = ANY (COALESCE(modulos, '{}')));

-- Verificación (no escribe): las filas que deberían tener la key nueva.
--   SELECT role, modulos FROM role_permissions
--   WHERE 'saldos-banco' = ANY (COALESCE(modulos, '{}'));
