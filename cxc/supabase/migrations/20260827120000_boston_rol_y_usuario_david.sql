-- ─────────────────────────────────────────────────────────────────────────────
-- EL ROL `gerente_boston` Y EL USUARIO DE DAVID (27-ago-2026)
--
-- Daniel, textual: "si crea el usuario david, david debe de ver cxc boston…
-- el es mi hermano y ve toda la operacion de confecciones boston, no quiero
-- que vea info de fashion group".
--
-- ADITIVA: no toca ni una fila existente. Los dos INSERT son idempotentes.
--
-- 🔴 LA CONTRASEÑA NO SE PONE ACÁ, Y NO ES UN OLVIDO.
--
-- El login de este sistema es SOLO por contraseña (no hay usuario): la que se
-- escriba queda hasheada con bcrypt y tiene que ser ÚNICA entre todos los
-- usuarios (dos iguales hacen el login ambiguo y `passwordInUse` lo rechaza).
-- Escribirla en una migración la dejaría en texto plano dentro del repo, en el
-- historial de git y en cualquier copia del proyecto — para siempre.
--
-- Por eso la fila nace con un centinela que NO es un hash de bcrypt, y el login
-- es IMPOSIBLE hasta que alguien le ponga una de verdad: `isHash()` en
-- `src/app/api/auth/route.ts` saltea toda contraseña que no empiece con `$2a$`
-- o `$2b$`, y lo anota en el log. Fail-closed por construcción.
--
-- 🔑 DÓNDE SE LE PONE: Daniel entra a **Usuarios** (`/admin/usuarios`), toca
-- **david**, escribe la contraseña y guarda. Eso llama al `PUT` de
-- `/api/admin/users`, que la hashea con bcrypt(10) y verifica que no choque con
-- la de nadie más. Mínimo 8 caracteres.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Los módulos del rol. UNO solo: `boston`.
--
-- Es la misma forma que la fila de `gerente_acs` (`{multifashion}`), y es lo que
-- hace que el auto-redirect de "rol con un solo módulo" lo mande directo a
-- /boston desde /home — o sea lo que le tapa la fuga del Inicio del grupo.
--
-- ⚠️ Si esta fila no existiera, el login cae a `getDefaultModulesForRole()`,
-- que para este rol da EXACTAMENTE lo mismo (`["boston"]`, derivado del
-- `roles[]` del módulo). La app funciona con o sin la fila; la fila es para que
-- el permiso también se pueda administrar desde la base, como los demás roles.
INSERT INTO role_permissions (role, modulos, activo)
VALUES ('gerente_boston', ARRAY['boston']::text[], true)
ON CONFLICT DO NOTHING;

-- Si la fila ya existía (de una corrida anterior), que diga lo que tiene que
-- decir. No toca ninguna otra fila.
UPDATE role_permissions
   SET modulos = ARRAY['boston']::text[], activo = true, updated_at = now()
 WHERE role = 'gerente_boston';

-- 2. El usuario.
--
-- `associated_company` queda en NULL a propósito: esa columna es el filtro de
-- empresa del CXC del GRUPO (un vendedor con empresa asociada ve solo la suya),
-- y David no entra al CXC del grupo por ningún lado. Su empresa no sale de acá:
-- sale de que su único módulo ES Boston.
--
-- `modulos_override` en NULL = hereda los del rol. Ponerle una lista propia
-- sería una segunda fuente de permisos para la misma persona.
INSERT INTO fg_users (name, password, role, active, associated_company, modulos_override, nombre_completo)
SELECT 'david',
       'PENDIENTE-DANIEL-PONE-LA-CONTRASENA-EN-ADMIN-USUARIOS',
       'gerente_boston',
       true,
       NULL,
       NULL,
       'David Levy'
 WHERE NOT EXISTS (SELECT 1 FROM fg_users WHERE name = 'david');
