-- ─────────────────────────────────────────────────────────────────────────────
-- EL FLETE POR DEFECTO DE REEBOK (Costo CIF) — una fila, valor 1.1.
--
-- Daniel (7-sep-2026): «la 1 si pero 1.1 por default (que pueda cambiar el
-- default en configuracion de reebok)».
--
-- El default vive en la BASE y no en el navegador a propósito: lo que Daniel
-- deje puesto lo tiene que ver la secretaria. (Guías ya pagó esa lección: la
-- lista de destinos vivía en `localStorage`, lo que agregaba Angela no lo veía
-- nadie y no se podía quitar desde ninguna pantalla.)
--
-- ADITIVA Y ACOTADA: UNA fila nueva, por clave EXACTA, con ON CONFLICT DO
-- NOTHING. No toca ninguna fila existente de `app_settings` (hoy las 7 son de
-- Multifashion) ni ninguna otra tabla.
--
-- ⚠️ EL CÓDIGO NO DEGRADA SIN ESTA MIGRACIÓN: sin la fila, la pantalla y los
-- dos generadores caen a 1.10 (`FLETE_DEFAULT` en `src/lib/depurador/flete.ts`),
-- que es exactamente lo que el sistema hacía escrito a mano. Aplicarla no
-- cambia un centavo; lo único que habilita es poder cambiar ese default.
--
-- 🔴 SOLO SE ADMITEN 1.10 Y 1.15. El rango lo hace cumplir la ruta
-- (`esFleteValido`); acá va el CHECK como último freno, igual que el CHECK del
-- divisor (`20260727190000_divisor_rango.sql`) repite el rango de `divisor.ts`.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.app_settings (key, value, description)
VALUES (
  'reebok_flete_default',
  '1.1'::jsonb,
  'Flete por defecto de Reebok: Costo FOB x flete = Costo CIF. Solo 1.1 o 1.15. Se cambia en Plantilla Switch > Reebok.'
)
ON CONFLICT (key) DO NOTHING;

-- Último freno: esta clave no puede guardar otra cosa que 1.1 o 1.15.
-- NOT VALID → no revisa las 7 filas viejas de Multifashion (no le aplican);
-- solo vigila lo que se escriba de acá en adelante.
ALTER TABLE public.app_settings
  DROP CONSTRAINT IF EXISTS app_settings_reebok_flete_solo_dos;

ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_reebok_flete_solo_dos
  CHECK (
    key <> 'reebok_flete_default'
    OR value::text IN ('1.1', '1.15')
  ) NOT VALID;
