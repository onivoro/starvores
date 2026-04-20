/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        panel: 'var(--color-panel)',
        muted: 'var(--color-muted)',
        raised: 'var(--color-raised)',
        border: 'var(--color-border)',
        'border-subtle': 'var(--color-border-subtle)',
        text: 'var(--color-text)',
        subtle: 'var(--color-subtle)',
        faint: 'var(--color-faint)',
        accent: 'var(--color-accent)',
        'accent-muted': 'var(--color-accent-muted)',
        'accent-hover': 'var(--color-accent-hover)',
        danger: 'var(--color-danger)',
        'danger-muted': 'var(--color-danger-muted)',
        success: 'var(--color-success)',
        'success-muted': 'var(--color-success-muted)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
      },
      spacing: {
        18: 'var(--space-18)',
      },
      boxShadow: {
        panel: 'var(--shadow-panel)',
        popover: 'var(--shadow-popover)',
        glow: 'var(--shadow-glow)',
      },
      fontFamily: {
        ui: ['var(--font-ui)'],
        mono: ['var(--font-mono)'],
      },
    },
  },
  plugins: [],
};
