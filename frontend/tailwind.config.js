/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        // Background hierarchy
        'bg-primary': '#FAF9F7',
        'bg-secondary': '#FFFFFF',
        'bg-tertiary': '#F5F4F2',
        'bg-elevated': '#FFFFFF',
        // Text hierarchy
        'text-primary': '#1A1A1A',
        'text-secondary': '#3A3A3A',
        'text-tertiary': '#5A5A5A',
        'text-muted': '#7A7A7A',
        'text-placeholder': '#9A9A9A',
        // Borders
        'border-subtle': 'rgba(0,0,0,0.05)',
        'border-muted': 'rgba(0,0,0,0.03)',
        'border-faint': 'rgba(0,0,0,0.02)',
        'border-light': '#F1F5F9',
        'border': '#E2E8F0',
        // Interaction states
        'hover-bg': 'rgba(0,0,0,0.04)',
        'hover-bg-strong': 'rgba(0,0,0,0.06)',
        'selected-bg': 'rgba(0,0,0,0.05)',
        'active-bg': 'rgba(0,0,0,0.08)',
        // Semantic colors
        'color-success': '#22C55E',
        'color-success-bg': 'rgba(34,197,94,0.10)',
        'color-warning': '#F59E0B',
        'color-warning-bg': 'rgba(245,158,11,0.10)',
        'color-error': '#EF4444',
        'color-error-bg': 'rgba(239,68,68,0.10)',
        'color-info': '#3B82F6',
        'color-info-bg': 'rgba(59,130,246,0.10)',
        // Primary action inverted
        'primary-fill': '#1A1A1A',
        'primary-text': '#FAFAFA',
        'primary-hover': '#1D4ED8',
        'primary-light': '#DBEAFE',
        // Legacy aliases
        'success': '#10B981',
        'success-light': '#D1FAE5',
        'warning': '#F59E0B',
        'warning-light': '#FEF3C7',
        'danger': '#EF4444',
        'danger-light': '#FEE2E2',
        'info': '#3B82F6',
        'info-light': '#DBEAFE',
        'secondary-teal': '#0F766E',
        // Load colors
        'load-low': '#10B981',
        'load-medium': '#F59E0B',
        'load-high': '#F97316',
        'load-over': '#EF4444',
        'load-blocked': '#94A3B8',
      },
      spacing: {
        '1': '4px',
        '2': '6px',
        '3': '8px',
        '4': '10px',
        '5': '12px',
        '6': '14px',
        '7': '16px',
        '8': '20px',
        '9': '24px',
        '10': '32px',
      },
      borderRadius: {
        sm: '6px',
        md: '8px',
        lg: '10px',
        xl: '12px',
        '2xl': '16px',
      },
      fontSize: {
        xs: ['11px', { lineHeight: '1.4' }],
        sm: ['12px', { lineHeight: '1.4' }],
        base: ['13px', { lineHeight: '1.5' }],
        lg: ['14px', { lineHeight: '1.5' }],
        xl: ['15px', { lineHeight: '1.5' }],
        '2xl': ['17px', { lineHeight: '1.4' }],
        '3xl': ['20px', { lineHeight: '1.3' }],
        stat: ['26px', { lineHeight: '1.2' }],
      },
      boxShadow: {
        dropdown: '0 8px 24px rgba(0,0,0,0.08)',
        modal: '0 16px 48px rgba(0,0,0,0.16)',
      },
      transitionDuration: {
        fast: '150ms',
        normal: '200ms',
        slow: '300ms',
      },
    },
  },
  plugins: [],
}
