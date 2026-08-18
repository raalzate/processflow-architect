import type {Config} from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    // El registro de notaciones (paleta/colores por grupo) vive aquí: debe
    // escanearse para que Tailwind genere sus clases fill-*/border-*/text-*.
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  safelist: [
    'bg-blue-500',
    'bg-orange-500',
    'bg-emerald-500',
    'bg-cyan-500',
    'bg-yellow-500',
    'bg-indigo-500',
    'bg-pink-500',
    'bg-purple-500',
    'bg-gray-400', // No olvides el color de fallback
    // Fondos pastel de los chips de la paleta: se derivan en runtime de los
    // colores de notación (`fill-*-{50,100}` → `bg-*-{50,100}`), así que no
    // aparecen literales en el código y hay que safelistarlos por patrón.
    {
      pattern:
        /^bg-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|stone)-(50|100)$/,
    },
  ],
  theme: {
    extend: {
      fontSize: {
        // Micro-tipografía del sistema. Existía como 9, 10 y 11 px sueltos en 45
        // sitios: tres tamaños indistinguibles entre sí eligiendo cada archivo
        // el suyo. Uno solo, con nombre, y deja de ser una decisión por archivo.
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      fontFamily: {
        body: ['Inter', 'sans-serif'],
        headline: ['Inter', 'sans-serif'],
        code: ['monospace'],
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        // Estado semántico: lo consume toda la app en vez de elegir un verde
        // por archivo (spec 003, FR-003).
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
          surface: 'hsl(var(--success-surface))',
          border: 'hsl(var(--success-border))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
          surface: 'hsl(var(--warning-surface))',
          border: 'hsl(var(--warning-border))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
          surface: 'hsl(var(--info-surface))',
          border: 'hsl(var(--info-border))',
        },
        code: {
          DEFAULT: 'hsl(var(--code))',
          foreground: 'hsl(var(--code-foreground))',
        },
        canvas: 'hsl(var(--canvas))',
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;
