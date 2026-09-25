"use client";
import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { useBackdropDismiss, useEscapeClose } from "@/lib/hooks/useModalDismiss";
import FGLogo from "@/components/FGLogo";
import SearchBar, { SEARCH_ROLES } from "@/components/SearchBar";
import NotificationCenter from "@/components/NotificationCenter";
import { getModuleColor, getModuleColorByKey } from "@/lib/moduleColors";
import { ALL_MODULES, getVisibleGroups, type AppGroup } from "@/lib/modules";
import { casaDelRol, yaEstaEnSuCasa } from "@/lib/navegacion/casa-del-rol";
import { hrefDelModulo } from "@/lib/navegacion/href-del-modulo";
import NovedadesAviso from "@/components/NovedadesAviso";
import { moduloDeRuta } from "@/lib/novedades/seleccion";
import { usePublicarAlturaEncabezado } from "@/lib/hooks/usePublicarAlturaEncabezado";
import { Z_ENCABEZADO } from "@/lib/ui/barra-pegajosa";
import { etiquetaDeRol } from "@/lib/roles-etiquetas";
import { BotonCambiarContrasena } from "@/components/CambiarContrasena";
import { esRolMarcacion } from "@/lib/marcacion/rol";
import { MARCACION_UN_TOQUE } from "@/lib/marcacion/un-toque";
import { BottomSheet } from "@/components/ui";
import {
  CAJON_HOJA_ABAJO,
  cuantosModulos,
  esHojaDeAbajo,
  esMenuDePantalla,
  filtrarGruposPorTexto,
  gruposDelCajon,
  grupoAlAbrir,
  moduloDeLaRuta,
  seDibujaElSegmentado,
} from "@/lib/navegacion/cajon-por-grupos";
import {
  ABAJO_DEL_FLOTANTE_CSS,
  DIAMETRO_FLOTANTE,
  MARGEN_FLOTANTE,
  SIN_BARRA_ARRIBA,
  campanaYLupaEnElCelular,
  corrimientoDeLaBarra,
  elLayoutPoneElTitulo,
  hayFranjaEnElCelular,
  transicionDeLaBarra,
} from "@/lib/navegacion/barra-celular";
import { useColchonDelFlotante } from "@/lib/navegacion/useColchonDelFlotante";
import { useBarraCelular } from "@/lib/navegacion/useBarraCelular";
import { ControlSegmentado } from "@/components/ventas/ControlSegmentado";
import type { ModuleGroup } from "@/lib/modules";

// Cómo se llama cada rol: UN solo lugar, `lib/roles-etiquetas.ts` (11-sep-2026).

interface AppHeaderProps {
  module: string;
  breadcrumbs?: { label: string; onClick?: () => void }[];
  hideBreadcrumbBar?: boolean;
  /**
   * El GRUPO del módulo, cuando el breadcrumb tiene que decirlo (17-sep-2026).
   *
   * 🩸 Nació por Usuarios: su breadcrumb decía «Sistema» —un grupo que dejó de
   * existir con el rediseño del home— y el clic caía en `/admin`, que hoy es un
   * redirect a **Cuentas por Cobrar**. O sea: el único módulo de Administración
   * te sacaba del módulo al tocar su propio nombre.
   *
   * Es OPCIONAL y aditivo: quien no lo pasa dibuja `Inicio › Módulo › …`,
   * exactamente como antes. Sale de `grupoDeModulo()`, nunca escrito a mano.
   */
  grupo?: AppGroup | null;
  /**
   * Acciones del MÓDULO que en el teléfono viven adentro del menú ☰ (6-sep-2026,
   * estrenado por Multifashion con «Sincronizado …» y «Actualizar ahora»).
   *
   * Es aditivo: quien no la pasa no dibuja nada nuevo, y el cajón queda
   * exactamente como estaba. En el escritorio el módulo las muestra donde
   * quiera — este cajón es SOLO móvil (`sm:hidden`, como todo el drawer).
   */
  acciones?: ReactNode;
  /**
   * 🔴 ESTA PANTALLA YA DIBUJA EL NOMBRE DEL MÓDULO EN GRANDE (24-sep-2026).
   *
   * Sin la franja de arriba, el nombre del módulo pasa a ser el título grande
   * de la página, y lo pone este layout. Pero las portadas nuevas del celular
   * —Asistencia, Cuentas por Cobrar, Multifashion, Reclamos, Marketing,
   * Catálogos— ya traen el suyo: si el layout agregara otro, el nombre se
   * leería DOS veces. Ésas pasan `tituloEnLaPantalla` y el layout se calla.
   *
   * Es OPCIONAL y aditivo: quien no lo pasa recibe el título del layout.
   */
  tituloEnLaPantalla?: boolean;
}

export default function AppHeader({ module, breadcrumbs, hideBreadcrumbBar, acciones, grupo, tituloEnLaPantalla }: AppHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [userName, setUserName] = useState("");
  const [userRole, setUserRole] = useState("");
  const [fgModules, setFgModules] = useState<string[] | null>(null);

  // El alto REAL de este bloque se publica en `--fg-altura-encabezado` para que
  // las barras pegajosas de los módulos se peguen DEBAJO y no encima
  // (11-sep-2026). Cambia solo: el breadcrumb existe en escritorio y no en
  // celular, y envuelve en dos líneas cuando la ruta es larga.
  const encabezadoRef = useRef<HTMLDivElement | null>(null);
  usePublicarAlturaEncabezado(encabezadoRef);
  // 🔴 Y en el celular se ESCONDE al deslizar hacia abajo (24-sep-2026). La
  // regla vive en `lib/navegacion/barra-celular.ts`; el gancho mira el
  // deslizamiento y, cuando la barra se va, deja `--fg-altura-encabezado` en 0
  // para que las barras pegajosas de contenido suban con ella.
  const barra = useBarraCelular(encabezadoRef);

  useEffect(() => {
    setUserName(sessionStorage.getItem("fg_user_name") || "");
    setUserRole(sessionStorage.getItem("cxc_role") || "");
    try {
      const mods = sessionStorage.getItem("fg_modules");
      if (mods) setFgModules(JSON.parse(mods));
    } catch { /* ignore */ }
  }, []);

  const visibleNav = userRole ? getVisibleGroups(userRole, fgModules) : [];
  // 🔴 «Inicio» lleva a la CASA DEL ROL (17-sep-2026). Bodega, Jennifer y David
  // tienen un solo módulo: `/home` los rebota ahí mismo, así que el botón se
  // sentía muerto (108 sesiones en 30 días). Y si ya están en su casa, el botón
  // NO se dibuja — uno que no hace nada es peor que no tenerlo.
  const casa = casaDelRol(userRole, fgModules);
  const enSuCasa = yaEstaEnSuCasa(pathname, casa);
  // Roles fuera de /api/search (ej. gerente_acs): ocultar también el botón de
  // lupa móvil — abriría un overlay vacío (SearchBar se auto-oculta).
  const canSearch = !userRole || SEARCH_ROLES.includes(userRole);
  // 🔴 QUIEN SOLO MARCA NO VE CAMPANA, LUPA NI MENÚ (24-sep-2026). Son tres
  // botones de 44×44 que no le sirven: la lupa ya se le escondía
  // (`SEARCH_ROLES`), pero la campana no le avisa de nada y el menú lleva a una
  // lista de UN ítem — su único módulo. Es por ROL, no por «tener un módulo
  // solo»: `admin` prueba esta misma pantalla y la ve completa.
  const soloMarca = MARCACION_UN_TOQUE && esRolMarcacion(userRole);

  async function handleLogout() {
    // Se ESPERA la revocación antes de navegar (3-sep-2026): la pantalla de
    // login reanuda la sesión si la cookie sigue viva, así que un DELETE
    // fire-and-forget podía perder la carrera y volver a meter al usuario.
    try { await fetch("/api/auth", { method: "DELETE" }); } catch { /* sin red: igual se sale localmente */ }
    sessionStorage.clear();
    router.push("/");
  }

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  // Lock body scroll when drawer open (hook compartido con ref-count).
  useBodyScrollLock(drawerOpen);

  // El drawer de módulos se cierra con clic fuera (sobre el fondo oscuro) y con
  // Escape, igual que el resto de los modales del sistema.
  const cerrarDrawer = useCallback(() => setDrawerOpen(false), []);
  const backdropDrawer = useBackdropDismiss(cerrarDrawer);
  useEscapeClose(drawerOpen, cerrarDrawer);

  // ── El menú del celular: una hoja de abajo con los grupos como pestañas ──
  // 🔴 24-sep-2026. La regla y el interruptor viven en
  // `lib/navegacion/cajon-por-grupos.ts`; acá solo se dibuja. Los módulos son
  // los del ROL, nunca una lista escrita a mano.
  const gruposHoja = CAJON_HOJA_ABAJO ? gruposDelCajon(userRole, fgModules) : [];
  const [grupoElegido, setGrupoElegido] = useState<ModuleGroup | null>(null);
  useEffect(() => {
    if (!CAJON_HOJA_ABAJO || !drawerOpen) return;
    setGrupoElegido(grupoAlAbrir(pathname, gruposDelCajon(userRole, fgModules)));
  }, [drawerOpen, pathname, userRole, fgModules]);
  const grupoActivo = grupoElegido ?? gruposHoja[0]?.key ?? null;
  const modulosDelGrupo = gruposHoja.find(g => g.key === grupoActivo)?.modulos ?? [];
  const moduloAqui = moduloDeLaRuta(pathname);

  // ── El menú a pantalla completa (24-sep-2026) ──
  // Lo que se escribe en su buscador solo acorta ESTA lista; la búsqueda
  // global (⌘K) es otra cosa y no se toca. Se vacía cada vez que se abre: el
  // menú nunca se abre a medio filtrar.
  const [busqueda, setBusqueda] = useState("");
  useEffect(() => { if (drawerOpen) setBusqueda(""); }, [drawerOpen]);
  const gruposFiltrados = filtrarGruposPorTexto(gruposHoja, busqueda);
  const irAlModulo = useCallback((href: string) => {
    router.push(href);
    setDrawerOpen(false);
  }, [router]);

  // 🔴 El botón redondo flotante: solo cuando la franja se fue y el rol TIENE
  // menú. Quien solo marca no lo ve —no tiene a dónde ir— y en la computadora
  // no existe (`sm:hidden`).
  const hayFlotante = SIN_BARRA_ARRIBA && !soloMarca;
  useColchonDelFlotante(hayFlotante);

  const moduleColor = getModuleColor(pathname);
  const currentNav = ALL_MODULES.find(m => moduleColor && pathname.startsWith(m.href));

  return (
    <>
      <div
        ref={encabezadoRef}
        data-encabezado
        data-barra-visible={barra.visible ? "si" : "no"}
        // 🔴 SIN FRANJA EN EL CELULAR (24-sep-2026): `hidden sm:block` la saca
        // hasta `sm` y la deja intacta en la computadora. Al estar en
        // `display:none`, `usePublicarAlturaEncabezado` la mide en 0 y las
        // barras pegajosas de contenido se pegan arriba del todo solas.
        className={`w-full border-b bg-white sticky top-0 ${hayFranjaEnElCelular() ? "" : "hidden sm:block"} ${moduleColor ? moduleColor.border : "border-gray-200"}`}
        style={{
          zIndex: Z_ENCABEZADO,
          // Se corre justo lo que mide, nunca un `-100%`: el mismo bloque lleva
          // la tira del camino de migas en la computadora.
          transform: `translateY(${corrimientoDeLaBarra(barra.visible, barra.altura)}px)`,
          transition: transicionDeLaBarra(barra.sinMovimiento),
          ...(moduleColor ? { borderBottomWidth: "2px" } : {}),
        }}
      >
        <div className="h-11 flex items-center px-4 sm:px-6 gap-3">
          <FGLogo variant="icon" theme="light" size={22} />
          <div className="w-px h-4 bg-gray-200" />
          <div className="flex items-center gap-1 text-sm text-gray-500 flex-1 min-w-0">
            {currentNav && (() => {
              const Icon = currentNav.icon;
              return <Icon size={14} strokeWidth={1.5} className={`flex-shrink-0 ${moduleColor!.text}`} />;
            })()}
            {/* El nombre del módulo solo se pinta acá en móvil. En desktop lo
                dice el breadcrumb de abajo, así que repetirlo en la barra era
                ruido (nombre 3×: chip + breadcrumb + h1). En móvil no hay
                breadcrumb, y esta barra es sticky: al hacer scroll es lo único
                que recuerda en qué módulo estás. */}
            <span className="truncate sm:hidden">{module}</span>
            {/* breadcrumbs inline removidos — fuente única: breadcrumb bar inferior */}
          </div>
          <div className="hidden sm:block">
            <SearchBar compact />
          </div>
          {!soloMarca && <div className="hidden sm:block"><NotificationCenter /></div>}
          {/* Desktop: user info */}
          {userName && (
            <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
              <div className="text-right">
                <div className="text-sm text-gray-700 font-medium leading-tight">{userName.split(" ")[0]}</div>
                <div className="text-xs text-gray-400 leading-tight">{etiquetaDeRol(userRole)}</div>
              </div>
              {/* Cambiar MI contraseña (14-sep-2026), para todos los roles. ⚠️ El
                  comentario no nombra al botón de cerrar sesión: el candado
                  `toque-44` busca su texto por la PRIMERA vez que aparece en el
                  archivo, y una mención acá lo dejaría midiendo el comentario. */}
              <BotonCambiarContrasena />
              <button onClick={handleLogout} title="Cerrar sesión" aria-label="Cerrar sesión" className="inline-flex h-11 w-11 items-center justify-center text-gray-300 hover:text-gray-600 transition">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </button>
              <div className="w-px h-4 bg-gray-200" />
            </div>
          )}
          {/* Mobile: search + notification + hamburger.
              Los tres son 44×44 reales (regla de la casa para el tacto en
              iPhone): este header sale en las 22 páginas, así que cada píxel
              que falte acá se multiplica por toda la app. La campana decide su
              propio tamaño y ya no admite uno chico — ver NotificationCenter.

              🔴 24-sep-2026: LA CAMPANA Y LA LUPA SE FUERON DEL CELULAR, para
              TODOS los roles. Daniel, textual: *«no uso ni notificaciones ni
              buscar»*. En el teléfono la barra queda con FG · el nombre del
              módulo · ☰, y nada más. En la computadora las dos siguen igual, y
              `⌘K` sigue abriendo la búsqueda. Lo decide
              `campanaYLupaEnElCelular()`, derivado del interruptor: apagarlo
              las devuelve sin tocar esta línea. */}
          {!soloMarca && campanaYLupaEnElCelular() && <div className="sm:hidden"><NotificationCenter /></div>}
          {canSearch && !soloMarca && campanaYLupaEnElCelular() && (
            <button onClick={() => setMobileSearchOpen(true)} aria-label="Buscar" className="sm:hidden min-w-[44px] min-h-[44px] flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </button>
          )}
          {/* 🔴 Con la franja retirada, las tres rayas viven en el botón
              redondo flotante de abajo. Esta hamburguesa se queda para cuando
              `SIN_BARRA_ARRIBA` esté en `false`: la barra vuelve entera. */}
          {!soloMarca && hayFranjaEnElCelular() && (
          <button onClick={() => setDrawerOpen(true)} aria-label="Abrir menú de módulos" className="sm:hidden min-w-[44px] min-h-[44px] flex items-center justify-center -mr-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          )}
        </div>
        {/* Breadcrumb bar único — desktop only, siempre visible. hideBreadcrumbBar queda como escape hatch.
            Todos los segmentos excepto el último son clicables. El último (página actual) es texto plano. */}
        {!hideBreadcrumbBar && (() => {
          // 🔴 La dirección del módulo la dice `modules.ts`, no el primer tramo
          // de la URL: recortando, Plantilla Switch apuntaba a `/productos`
          // (404) y Usuarios a `/admin` (que redirige a Cuentas por Cobrar).
          const moduleBaseHref = hrefDelModulo(pathname);
          const segments: { label: string; onClick?: () => void }[] = [
            ...(enSuCasa ? [] : [{ label: "Inicio", onClick: () => router.push(casa) }]),
            ...(grupo ? [{ label: grupo.label, onClick: () => router.push(grupo.href) }] : []),
            { label: module, onClick: () => router.push(moduleBaseHref) },
            ...(breadcrumbs ?? []).map(b => ({ label: b.label, onClick: b.onClick })),
          ];
          const lastIndex = segments.length - 1;
          return (
            <div className="hidden sm:flex flex-wrap px-6 py-1 text-xs text-gray-400 items-center gap-1">
              {segments.map((seg, i) => {
                const isLast = i === lastIndex;
                return (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <span>›</span>}
                    {isLast || !seg.onClick ? (
                      <span className="text-gray-600 font-medium cursor-default">{seg.label}</span>
                    ) : (
                      <button onClick={seg.onClick} className="-my-[13px] inline-flex min-h-[44px] min-w-[44px] items-center justify-center hover:text-gray-700 hover:underline transition cursor-pointer">{seg.label}</button>
                    )}
                  </span>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* ── EL NOMBRE DEL MÓDULO ES EL TÍTULO DE LA PÁGINA (24-sep-2026) ──
          Sin la franja de arriba, el nombre se dice acá una vez, en grande, al
          estilo de iOS: se lee al abrir y se va con el dedo al deslizar —no se
          encoge ni se pega arriba, que costaría 44 de los 46 px recuperados—.
          Queda FUERA del bloque pegajoso a propósito: es contenido, no barra.

          🔴 UNA SOLA FUENTE POR PANTALLA: si la portada ya dibuja su título,
          el layout no pone ninguno (`tituloEnLaPantalla`).

          El acento de 2 px del módulo no se pierde: se conserva como el punto
          de color al lado del título, que es la identidad del módulo en el
          celular ahora que el borde del encabezado no está. */}
      {elLayoutPoneElTitulo({ tituloEnLaPantalla: !!tituloEnLaPantalla, soloMarca }) && (
        <div data-titulo-modulo className="px-4 pb-1 pt-3 sm:hidden">
          {/* 🔑 Es un `<p>`, no un `<h1>`: cada pantalla del sistema ya tiene
              su `<h1 className="sr-only">` con el nombre del módulo, y dos
              encabezados con la MISMA palabra se leen dos veces en voz alta.
              Es el mismo patrón que ya usaba el título del celular de
              Multifashion (`data-celular="titulo"`). */}
          <p className="flex items-start gap-2.5 text-[34px] font-semibold leading-[1.08] tracking-tight text-gray-950">
            {moduleColor && (
              <span
                aria-hidden="true"
                className="mt-[15px] inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: moduleColor.hex }}
              />
            )}
            <span className="min-w-0 break-words">{module}</span>
          </p>
        </div>
      )}

      {/* «Qué cambió» — la tira de novedades del módulo (9-sep-2026).
          Va acá y no en 22 pantallas: este encabezado es lo único que todas
          comparten. Queda FUERA del bloque sticky a propósito — es un aviso, no
          una barra: se lee y se va con el scroll.
          El módulo se saca de la DIRECCIÓN (`moduloDeRuta`), no del rótulo que
          llega por prop: el rótulo es texto para leer («Cuentas por Cobrar») y
          lo que la novedad guarda es la `key` (`cxc`). */}
      <NovedadesAviso moduloKey={moduloDeRuta(pathname, ALL_MODULES)} />

      {/* Mobile search overlay */}
      {mobileSearchOpen && (
        <div className="fixed inset-0 z-50 bg-white sm:hidden">
          <SearchBar fullScreen onClose={() => setMobileSearchOpen(false)} />
        </div>
      )}

      {/* Mobile drawer — el cajón lateral de siempre. Queda EXACTAMENTE como
          estaba: con `CAJON_HOJA_ABAJO` apagado vuelve solo. */}
      {drawerOpen && !CAJON_HOJA_ABAJO && (
        <div className="fixed inset-0 z-50 sm:hidden">
          <div {...backdropDrawer} className="absolute inset-0 bg-black/40" />
          <div className="absolute right-0 top-0 bottom-0 w-72 bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            {/* "Módulos" queda `sr-only`: el cajón se abre desde el botón de
                menú y adentro está la lista de módulos, a la vista. */}
            <div className="flex items-center justify-end px-5 h-14 border-b border-gray-200">
              <span className="sr-only">Módulos</span>
              <button onClick={() => setDrawerOpen(false)} aria-label="Cerrar menú" className="min-w-[44px] min-h-[44px] flex items-center justify-center active:bg-gray-100 rounded-md transition-all">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {userName && (
              <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xs font-medium">{userName[0]}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{userName}</div>
                  <div className="text-xs text-gray-400">{etiquetaDeRol(userRole)}</div>
                </div>
                {/* El drawer es 100% móvil: acá no hay mouse, solo dedo. El -mr-2
                    recupera el aire que suma el área táctil para que el botón siga
                    alineado con el borde de la fila. */}
                <BotonCambiarContrasena variante="texto" />
                <button onClick={() => { handleLogout(); setDrawerOpen(false); }} className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center text-xs text-gray-400 hover:text-red-600 transition">Salir</button>
              </div>
            )}
            {acciones && (
              <div className="border-b border-gray-100 px-5 py-3">{acciones}</div>
            )}
            <nav className="flex-1 overflow-y-auto py-2">
              {/* Misma regla que el breadcrumb: la casa del rol, y nada si ya
                  está parado en ella. */}
              {!enSuCasa && (
                <button onClick={() => { router.push(casa); setDrawerOpen(false); }}
                  className="w-full flex items-center gap-3 px-5 py-3 text-sm text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-all">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                  </svg>
                  Inicio
                </button>
              )}
              {visibleNav.map(g => {
                const active = pathname === g.href || pathname.startsWith(g.href + "/");
                const Icon = g.icon;
                return (
                  <button key={g.key} onClick={() => { router.push(g.href); setDrawerOpen(false); }}
                    className={`w-full flex items-center gap-3 px-5 py-3 text-sm transition-all ${active ? "bg-gray-50 text-black font-medium" : "text-gray-600 hover:bg-gray-50 active:bg-gray-100"}`}>
                    <Icon size={16} strokeWidth={1.5} />
                    {g.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* ── La hoja de abajo (24-sep-2026) ──
          Sube desde donde está el pulgar, con los grupos como pestañas y los
          módulos del grupo debajo. Reusa el `BottomSheet` de la casa, que ya
          trae el agarre, el fondo oscuro, el Escape, el bloqueo del scroll y el
          `sm:hidden` — o sea que la computadora no la ve nunca. */}
      {esHojaDeAbajo() && (
        <BottomSheet open={drawerOpen} onClose={cerrarDrawer}>
          <div className="-mx-5 flex min-h-full flex-col" data-cajon-hoja>
            {acciones && (
              <div className="border-b border-gray-100 px-5 pb-3">{acciones}</div>
            )}
            {!enSuCasa && (
              <button onClick={() => { router.push(casa); setDrawerOpen(false); }}
                className="flex min-h-[44px] w-full items-center gap-3 px-5 py-3 text-sm text-gray-600 active:bg-gray-100 transition-all">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
                Inicio
              </button>
            )}
            {/* Las pestañas: el MISMO control segmentado del resto del sistema.
                El rótulo corto lo deriva el módulo puro — «Ventas y clientes»
                no entra en un tercio de 390 px. */}
            {seDibujaElSegmentado(gruposHoja) && grupoActivo && (
              <div className="px-3 pb-1 pt-1">
                <ControlSegmentado
                  options={gruposHoja.map(g => ({ value: g.key, label: g.rotuloCorto }))}
                  active={grupoActivo}
                  onChange={(v) => setGrupoElegido(v)}
                  ariaLabel="Grupos de módulos"
                />
              </div>
            )}
            <nav className="py-1">
              {modulosDelGrupo.map(m => {
                const Icon = m.icon;
                const aqui = m.key === moduloAqui;
                return (
                  <button key={m.key} onClick={() => { router.push(m.href); setDrawerOpen(false); }}
                    aria-current={aqui ? "page" : undefined}
                    className={`flex min-h-[44px] w-full items-center gap-3 px-5 py-3 text-sm transition-all ${aqui ? "bg-gray-50 font-medium text-black" : "text-gray-600 active:bg-gray-100"}`}>
                    <Icon size={16} strokeWidth={1.5} />
                    {m.label}
                  </button>
                );
              })}
            </nav>
            {userName && (
              <div className="mt-auto flex items-center gap-3 border-t border-gray-200 px-5 pt-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-800">{userName}</div>
                  <div className="text-xs text-gray-400">{etiquetaDeRol(userRole)}</div>
                </div>
                <BotonCambiarContrasena variante="texto" />
                <button onClick={() => { handleLogout(); setDrawerOpen(false); }} className="-mr-2 flex min-h-[44px] min-w-[44px] items-center justify-center text-xs text-gray-400 transition hover:text-red-600">Salir</button>
              </div>
            )}
          </div>
        </BottomSheet>
      )}

      {/* ── El menú a PANTALLA COMPLETA (24-sep-2026) ──
          Daniel vio la hoja de abajo y no le gustó: arrancaba a la mitad de la
          pantalla y mostraba 6 de sus 20 módulos. Esto es la pantalla de
          Ajustes del iPhone: título grande, un buscador que solo acorta esta
          lista, los tres grupos como encabezados de sección y sus módulos en
          tarjetas blancas sobre el gris del sistema, cada uno con su ícono a
          color y el de aquí marcado.

          🔑 Los módulos salen del ROL (`gruposDelCajon`), nunca de una lista
          escrita acá. Cierra con ✕, con Escape (`useEscapeClose`, arriba) y al
          navegar (el efecto que mira `pathname`). `sm:hidden`: la computadora
          no lo ve nunca. */}
      {/* ── LAS TRES RAYAS, EN UN BOTÓN REDONDO ABAJO A LA DERECHA (24-sep-2026) ──
          Donde ya descansa el pulgar, no en la esquina más lejana. 56 px, fijo,
          y abre el MISMO menú a pantalla completa de siempre.

          🔴 NO TAPA LOS BOTONES NEGROS FIJOS DE LAS PORTADAS. «Nuevo reclamo»,
          «Marcar cobrado» y el botón de Marcación son barras de ANCHO COMPLETO
          pegadas abajo: no hay esquina que ceder. Entonces el flotante SUBE —la
          barra publica su alto medido y el botón se apoya encima
          (`ABAJO_DEL_FLOTANTE_CSS`)—, y el botón negro, que es la acción
          principal de su pantalla, no se mueve ni un píxel.

          z-30: por encima de todo el contenido (las barras pegajosas son 9 y el
          encabezado 10), por debajo del menú, de las hojas y de los modales
          (50+), que tienen que taparlo. */}
      {hayFlotante && (
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Abrir menú"
          data-boton-flotante
          className="fixed z-30 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-gray-900 text-white shadow-lg shadow-black/25 transition active:scale-[0.97] sm:hidden"
          style={{
            width: DIAMETRO_FLOTANTE,
            height: DIAMETRO_FLOTANTE,
            right: MARGEN_FLOTANTE,
            bottom: ABAJO_DEL_FLOTANTE_CSS,
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
      )}

      {esMenuDePantalla() && drawerOpen && (
        <div
          data-menu-pantalla
          role="dialog"
          aria-modal="true"
          aria-label="Menú"
          className="fixed inset-0 z-50 flex flex-col bg-[#f2f2f7] sm:hidden"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <div className="flex items-center justify-between px-4 pt-2">
            <h2 className="text-[28px] font-bold leading-tight tracking-tight text-gray-950">Menú</h2>
            <button
              onClick={cerrarDrawer}
              aria-label="Cerrar menú"
              className="-mr-2 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-gray-500 transition active:bg-black/5"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div className="px-4 pb-1 pt-2">
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar un módulo"
              aria-label="Buscar un módulo"
              autoCapitalize="none"
              autoCorrect="off"
              className="h-11 w-full rounded-xl border border-transparent bg-white px-3.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-gray-300 focus:outline-none"
            />
          </div>

          {acciones && <div className="px-4 py-2">{acciones}</div>}

          <nav className="flex-1 overflow-y-auto px-4 pb-4">
            {/* Misma regla que el camino de migas: la casa del ROL, y nada si
                ya está parado en ella. */}
            {!enSuCasa && (
              <div className="mt-3 overflow-hidden rounded-xl bg-white">
                <button
                  onClick={() => irAlModulo(casa)}
                  className="flex min-h-[44px] w-full items-center gap-3 px-3.5 py-2.5 text-left text-[15px] text-gray-800 transition active:bg-gray-100"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-gray-500">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                  </svg>
                  <span className="min-w-0 flex-1 truncate">Inicio</span>
                  <span className="flex-shrink-0 text-sm text-gray-300">›</span>
                </button>
              </div>
            )}

            {gruposFiltrados.map(g => (
              <section key={g.key}>
                <h3 className="px-3.5 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">{g.label}</h3>
                <div className="overflow-hidden rounded-xl bg-white">
                  {g.modulos.map(m => {
                    const Icon = m.icon;
                    const aqui = m.key === moduloAqui;
                    const tono = getModuleColorByKey(m.key);
                    return (
                      <button
                        key={m.key}
                        onClick={() => irAlModulo(m.href)}
                        aria-current={aqui ? "page" : undefined}
                        className={`flex min-h-[44px] w-full items-center gap-3 border-t border-gray-100 px-3.5 py-2.5 text-left text-[15px] transition first:border-t-0 active:bg-gray-100 ${aqui ? "bg-gray-50 font-semibold text-gray-950" : "text-gray-800"}`}
                      >
                        <Icon size={18} strokeWidth={1.75} className={`flex-shrink-0 ${tono ? tono.text : "text-gray-400"}`} />
                        <span className="min-w-0 flex-1 truncate">{m.label}</span>
                        <span className={`flex-shrink-0 text-xs ${aqui ? "text-gray-500" : "text-gray-300"}`}>{aqui ? "aquí" : "›"}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}

            {cuantosModulos(gruposFiltrados) === 0 && (
              <p className="px-3.5 py-8 text-center text-sm text-gray-500">Ningún módulo se llama así.</p>
            )}
          </nav>

          {userName && (
            <div
              className="flex items-center gap-3 border-t border-gray-200 bg-white px-4 pt-2"
              style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-gray-800">{userName}</div>
                <div className="text-xs text-gray-400">{etiquetaDeRol(userRole)}</div>
              </div>
              <BotonCambiarContrasena variante="texto" />
              <button onClick={() => { handleLogout(); setDrawerOpen(false); }} className="-mr-2 flex min-h-[44px] min-w-[44px] items-center justify-center text-xs text-gray-400 transition hover:text-red-600">Salir</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
