"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import FGLogo from "@/components/FGLogo";
import SearchBar, { SEARCH_ROLES } from "@/components/SearchBar";
import { BotonCambiarContrasena } from "@/components/CambiarContrasena";
import { getVisibleGroups, getModulesInGroup, type AppModule } from "@/lib/modules";
import { casaDelRol, INICIO } from "@/lib/navegacion/casa-del-rol";
import { recordModuleClick, getFrequentModules } from "@/lib/module-frequents";
import { fmtDate } from "@/lib/format";
import { hoyPanama } from "@/lib/fecha-panama";
import { ESTRUCTURA_APPLE_2026_10 } from "@/lib/navegacion/estructura-2026-10";
import MenuDelUsuario from "@/components/estructura/MenuDelUsuario";
import AvatarDelUsuario from "@/components/estructura/AvatarDelUsuario";
import AppHeader from "@/components/AppHeader";
import { TAB_BAR_2026_10 } from "@/lib/navegacion/tab-bar";
import { CLAVE_NOMBRE_VISIBLE } from "@/lib/hooks/useNombreVisible";
import { capitalizarNombre } from "@/lib/nombre-en-pantalla";
import { INICIO_APPLE_2026_10 } from "@/lib/navegacion/inicio-apple-2026-10";
import { getModuleColorByKey } from "@/lib/moduleColors";

// 🔴 Estructura estilo Apple (1-oct-2026): saludo y fecha con el botón del
// usuario; sin «Accesos frecuentes», sin modo oscuro y sin el logo grande.

// Caché del nombre para saludar (fg_users.nombre_completo). Se guarda para que
// el saludo aparezca instantáneo en las siguientes visitas y se refresca en
// segundo plano contra /api/auth/perfil.
const DISPLAY_NAME_KEY = CLAVE_NOMBRE_VISIBLE;

export default function HomePage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [role, setRole] = useState("");
  const [userName, setUserName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [fgModules, setFgModules] = useState<string[] | null>(null);
  const apple = ESTRUCTURA_APPLE_2026_10;
  const [frequents, setFrequents] = useState<AppModule[]>([]);

  // El botón de arriba a la derecha tiene que REVOCAR la sesión en el server
  // (3-sep-2026): antes solo borraba sessionStorage y la cookie de 7 días
  // quedaba viva — con la reanudación de sesión del login, eso ya no bastaría.
  // Se espera el DELETE antes de navegar (sin carrera con la pantalla de login).
  async function cerrarSesion() {
    try { await fetch("/api/auth", { method: "DELETE" }); } catch { /* sin red: igual se sale localmente */ }
    sessionStorage.clear();
    router.push("/");
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const r = sessionStorage.getItem("cxc_role") || "";
    if (!r) { router.push("/"); return; }
    if (r === "cliente") { router.push("/catalogo/reebok"); return; }
    setRole(r);
    const login = sessionStorage.getItem("fg_user_name") || "";
    setUserName(login);
    setDisplayName(sessionStorage.getItem(DISPLAY_NAME_KEY) || login);

    try {
      const mods = sessionStorage.getItem("fg_modules");
      if (mods) setFgModules(JSON.parse(mods));
    } catch { /* ignore */ }

    setAuthChecked(true);
  }, [router]);

  // Nombre real del usuario (fg_users.nombre_completo) para el saludo. El
  // sessionStorage solo guarda el usuario de login, así que se pide al server;
  // si el endpoint falla, el saludo se queda con el usuario de login.
  useEffect(() => {
    if (!authChecked || !role) return;
    let cancelled = false;
    fetch("/api/auth/perfil", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { displayName?: string } | null) => {
        if (cancelled || !j?.displayName) return;
        setDisplayName(j.displayName);
        try { sessionStorage.setItem(DISPLAY_NAME_KEY, j.displayName); } catch { /* ignore */ }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [authChecked, role]);

  // Auto-redirect si user tiene 1 solo modulo (ej: Bodega → Guías), y el rol
  // que tiene UNA CASA aterriza ahí aunque tenga varios módulos.
  //
  // 🔴 LA REGLA SE MUDÓ A `lib/navegacion/casa-del-rol.ts` (17-sep-2026), que
  // es la MISMA que ahora usan el 404 y el botón «Inicio» del encabezado: sin
  // un solo lugar, «ir al inicio» mandaba a bodega a `/home` y `/home` lo
  // devolvía — el botón se sentía muerto.
  //
  // 🔴 Y SE EMPUJA CON `replace`, NO CON `push`. Con `push`, `/home` quedaba en
  // el historial: bodega, Jennifer y David tocaban Atrás, volvían a `/home` y
  // `/home` los empujaba de nuevo. Atrás quedaba muerto mientras estuvieran en
  // la app — 108 sesiones en 30 días (`docs/mapas/rutas.md` › B-1).
  useEffect(() => {
    if (!authChecked || !role) return;
    const casa = casaDelRol(role, fgModules);
    if (casa !== INICIO) router.replace(casa);
  }, [authChecked, role, fgModules, router]);

  // 🔴 EL AVISO DE DATA HEALTH SE RETIRÓ DEL INICIO (11-sep-2026). Daniel,
  // textual: «data health quiero que el sistema o tú mida todo pero no verlo…
  // no lo uso y no lo quiero usar». Era una franja que aparecía al entrar y
  // llevaba a una pantalla que él nunca abrió; sin pantalla a la que llevar, el
  // aviso no tiene a dónde ir. LA MEDICIÓN NO SE TOCÓ: el cron
  // `integrity-check` corre a las 12:00 UTC, escribe `data_integrity_checks` y
  // los checks CRÍTICOS siguen avisando por Telegram 🔧 SISTEMA — que es el
  // canal que Daniel sí lee. Los `warning` vuelven a vivir solo en la tabla.

  // "Tus frecuentes": top módulos por clics del usuario (localStorage). Se lee
  // tras montar (client-only) para no romper SSR/hidratación; se recalcula si
  // cambian rol/permisos/usuario.
  useEffect(() => {
    if (!authChecked || !role) return;
    setFrequents(getFrequentModules(role, fgModules, userName));
  }, [authChecked, role, fgModules, userName]);

  const visibleGroups = role ? getVisibleGroups(role, fgModules) : [];
  const saludo = displayName ? `Buen día, ${displayName}` : "Buen día";

  if (!authChecked) return null;

  // Ficha: fondo gris claro, borde sutil, borde más oscuro al hover y elevación
  // mínima. Alto uniforme (78px en la cuadrícula) — cómodo para el dedo.
  const fichaBase =
    "group flex rounded-lg border transition-all duration-150 active:scale-[0.97] " +
    "border-gray-200 bg-gray-50 hover:border-gray-400 hover:bg-white hover:shadow-sm";
  const iconoBase = "shrink-0 transition-colors text-gray-500 group-hover:text-gray-900";
  const textoBase = "text-xs font-medium leading-tight transition-colors text-gray-900 group-hover:text-black";

  return (
    <div className="min-h-screen bg-white">
      {/* La barra de pestañas también en Inicio (`TAB_BAR_2026_10`): solo la
          barra y su menú, nada del encabezado de los módulos. */}
      {TAB_BAR_2026_10 && <AppHeader module="Inicio" soloMenuDelCelular />}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Encabezado: saludo en serif + fecha del día */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="min-w-0">
            {!apple && <FGLogo variant="horizontal" theme="light" size={28} />}
            <h1 className={`font-display text-2xl sm:text-3xl font-medium tracking-tight ${apple ? "" : "mt-3"} truncate text-gray-950`}>
              {saludo}
            </h1>
            <p className="text-sm mt-0.5 text-gray-500">
              {fmtDate(hoyPanama())}
            </p>
          </div>
          {/* /home NO usa AppHeader: tiene su propio encabezado, así que los 44×44
              que se arreglaron allá nunca llegaron acá. Estos dos botones medían
              22×21 y 29×21 en el iPhone — y son los de la primera pantalla que ve
              todo el mundo al entrar. El -mr-2 compensa el ancho nuevo contra el
              borde del contenedor. */}
          {/* 🔴 Con la barra de pestañas (`TAB_BAR_2026_10`), en el celular el
              menú del usuario es el avatar con la inicial, como en las apps de
              Apple; en la computadora sigue el botón con el nombre. */}
          {apple && (TAB_BAR_2026_10
            ? <div className="hidden sm:block"><MenuDelUsuario nombre={capitalizarNombre(displayName)} rol={role} /></div>
            : <MenuDelUsuario nombre={capitalizarNombre(displayName)} rol={role} />)}
          {/* El nombre visible, capitalizado: «Daniel Levy», no «daniel». */}
          {TAB_BAR_2026_10 && <AvatarDelUsuario nombre={capitalizarNombre(displayName)} rol={role} />}
          {!apple && <div className="flex items-center shrink-0 -mr-2">
            {/* Cambiar MI contraseña (14-sep-2026), para todos los roles. ⚠️ El
                  comentario no nombra al botón de cerrar sesión: el candado
                  `toque-44` busca su texto por la PRIMERA vez que aparece en el
                  archivo, y una mención acá lo dejaría midiendo el comentario. */}
            <BotonCambiarContrasena variante="texto" className="text-sm" />
            <button
              onClick={cerrarSesion}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-sm text-gray-400 hover:text-black transition active:scale-[0.97]"
            >
              Cerrar sesión
            </button>
          </div>}
        </div>

        {/* 🔴 LA CAJA DE BUSCAR ES DE LOS MISMOS CINCO ROLES EN TODAS PARTES.
            11-sep-2026. Acá estaba escrita a mano `["admin","secretaria"]`
            mientras la lista única del sistema (`SEARCH_ROLES`, la que decide
            en `AppHeader` y la que acepta `/api/search`) tiene CINCO. Medido:
            contabilidad y vendedor entraban al Inicio sin caja de buscar y la
            encontraban arriba en cualquier módulo — la misma app diciendo dos
            cosas. Bodega aterriza en Guías, así que en la práctica los que
            recuperan la caja del Inicio son contabilidad y vendedor. */}
        {SEARCH_ROLES.includes(role) && (
          INICIO_APPLE_2026_10 ? <SearchBar alineado /> : <SearchBar />
        )}

        {/* Tus frecuentes: los módulos más usados por el usuario (aprendido de
            sus clics reales). Fila arriba de los grupos, misma ficha pero
            HORIZONTAL. Solo aparece si ya hay historial. */}
        {frequents.length > 0 && !apple && (
          <div className="mb-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide mb-2 px-1 text-gray-500">
              Accesos frecuentes
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              {frequents.map((m) => {
                const ModIcon = m.icon;
                return (
                  <Link
                    key={m.key}
                    href={m.href}
                    onClick={() => recordModuleClick(m.key, userName)}
                    className={`${fichaBase} min-h-[56px] items-center gap-2.5 px-3 py-3`}
                  >
                    <ModIcon size={20} strokeWidth={1.5} className={iconoBase} />
                    <span className={`${textoBase} truncate`}>{m.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Grupos: cuadrícula de fichas (ícono de línea arriba, nombre debajo,
            sin subtítulo). Solo aparecen los módulos visibles según permisos
            (misma fuente que el sidebar: getVisibleGroups/getModulesInGroup). */}
        {/* 🔴 INICIO ESTILO APPLE (`INICIO_APPLE_2026_10`, prendido 9-oct-2026).
            Celular: la lista agrupada de Ajustes, la MISMA forma de la hoja
            «Más». Computadora: las fichas de siempre (Daniel: las horizontales
            NO). */}
        {INICIO_APPLE_2026_10 && (
            <div data-inicio="lista-celular" className="space-y-5 sm:hidden">
              {visibleGroups.map((g) => (
                <section key={g.key}>
                  <h2 className="px-3.5 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">{g.label}</h2>
                  <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                    {getModulesInGroup(g.key, role, fgModules).map((m) => {
                      const ModIcon = m.icon;
                      const tono = getModuleColorByKey(m.key);
                      return (
                        <Link
                          key={m.key}
                          href={m.href}
                          onClick={() => recordModuleClick(m.key, userName)}
                          className="flex min-h-[44px] items-center gap-3 border-t border-gray-100 px-3.5 py-2.5 text-[15px] text-gray-900 transition first:border-t-0 active:bg-gray-100"
                        >
                          <ModIcon size={18} strokeWidth={1.75} className={`shrink-0 ${tono ? tono.text : "text-gray-400"}`} />
                          <span className="min-w-0 flex-1 truncate">{m.label}</span>
                          <span aria-hidden="true" className="shrink-0 text-sm text-gray-300">›</span>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
        )}
        <div {...(INICIO_APPLE_2026_10 ? { "data-inicio": "fichas" } : {})} className={INICIO_APPLE_2026_10 ? "hidden space-y-6 sm:block" : "space-y-6"}>
          {visibleGroups.map((g) => {
            const modules = getModulesInGroup(g.key, role, fgModules);
            return (
              <section key={g.key}>
                <h2 className="text-xs font-semibold uppercase tracking-wide mb-2 px-1 text-gray-500">
                  {g.label}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2 sm:gap-3">
                  {modules.map((m) => {
                    const ModIcon = m.icon;
                    return (
                      <Link
                        key={m.key}
                        href={m.href}
                        onClick={() => recordModuleClick(m.key, userName)}
                        className={`${fichaBase} min-h-[78px] flex-col items-center justify-center gap-2 px-2 py-3 text-center`}
                      >
                        <ModIcon size={20} strokeWidth={1.5} className={iconoBase} />
                        <span className={textoBase}>{m.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
