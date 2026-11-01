/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a0b10',
        surface: '#12141f',
        'surface-highlight': '#1b1e2e',
        accent: {
          violet: '#8b5cf6',
          cyan: '#06b6d4',
          coral: '#f43f5e',
          amber: '#f59e0b',
          emerald: '#10b981',
        },
      },
      animation: {
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'ping-slow': 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
      },
    },
  },
  plugins: [],
}
