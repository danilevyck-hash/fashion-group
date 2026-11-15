import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: {
    colors: {
      // Los grises del iPhone en las pantallas de celular (antes hex sueltos):
      // fondo de la página, campo/control y la pista del control segmentado.
      "fondo-celular": "#F2F2F7",
      "control-celular": "#E9E9EB",
      "pista-celular": "#E3E3E8",
      // El borde de todo campo (nov-2026): el gris del iPhone, 3.3:1 sobre
      // blanco. El gray-200 de antes (1.2:1) hacía invisibles los buscadores.
      campo: "#8e8e93",
      reebok: {
        red: '#CC0000',
        dark: '#1a1a1a',
        grey: '#f5f5f5',
      },
      // Legibilidad (Capa 1A): subir el contraste de los grises secundarios
      // sin tocar .tsx. Se desplaza la rampa un paso más oscuro en 400/500,
      // los tonos que se usan como "gris principal" y fallan WCAG AA.
      //   gray-400 #9ca3af (≈2.8:1, falla) → #6b7280 (≈4.8:1, AA)
      //   gray-500 #6b7280               → #4b5563 (≈7:1, AAA)
      // (extend hace deep-merge → el resto de la rampa gray queda intacto.)
      gray: {
        400: '#6b7280',
        500: '#4b5563',
      },
      // Accesibilidad (15-nov-2026): lo mismo con los colores de aviso. Ámbar,
      // verde y rojo bajan UN paso, así el texto llega a 4.5:1 y la UI a 3:1
      // sobre blanco y sobre el gris de las pistas. Global, sin interruptor.
      //   amber-600   #d97706 (3.2:1) → #b45309 (5.0:1)
      //   emerald-600 #059669 (3.8:1) → #047857 (5.5:1)
      //   green-600   #16a34a (3.3:1) → #15803d (5.0:1)
      //   red-500     #ef4444 (3.8:1) → #dc2626 (4.8:1)
      //   red-600     #dc2626 (4.8:1, 4.3 sobre gris) → #b91c1c (6.5:1)
      amber: { 600: '#b45309' },
      emerald: { 600: '#047857' },
      green: { 600: '#15803d' },
      red: { 500: '#dc2626', 600: '#b91c1c' },
    },
    fontFamily: {
      display: ['var(--font-playfair)', 'Georgia', 'serif'],
      mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
    },
    // Legibilidad (Capa 1B): sube el piso de la escala tipográfica + leading más
    // cómodo. Mueve los ~700 text-xs y ~980 text-sm de un golpe.
    //   xs: 12px → 13px (leading 16px → 18px)
    //   sm: 14px (sin cambio de tamaño — 14.5px desbordaba tablas densas) con
    //       leading 20px → 21px para un poco de aire.
    // El resto de la escala (base/lg/…) queda en los defaults de Tailwind.
    fontSize: {
      xs: ['0.8125rem', { lineHeight: '1.125rem' }],
      sm: ['0.875rem', { lineHeight: '1.3125rem' }],
    },
    keyframes: {
      'save-flash': {
        '0%': { backgroundColor: 'rgb(220 252 231)', borderRadius: '4px', padding: '0 4px' },
        '100%': { backgroundColor: 'transparent', borderRadius: '4px', padding: '0 4px' },
      },
    },
    animation: {
      'save-flash': 'save-flash 1.5s ease-out',
    },
  } },
  plugins: [],
};
export default config;
