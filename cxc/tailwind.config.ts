import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: {
    colors: {
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
      // Misma corrección para la rampa stone (Ventas/Multifashion usan stone),
      // para no dejar la mitad del sistema sin mejorar.
      //   stone-400 #a8a29e → #78716c (AA)   stone-500 #78716c → #57534e (AAA)
      stone: {
        400: '#78716c',
        500: '#57534e',
      },
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
