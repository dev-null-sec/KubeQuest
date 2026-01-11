/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                terminal: {
                    bg: '#1e1e1e',
                    text: '#d4d4d4',
                    green: '#4af626',
                    blue: '#3b8eea',
                }
            },
            fontFamily: {
                mono: ['"JetBrains Mono"', 'Consolas', 'Monaco', 'monospace'],
            }
        },
    },
    plugins: [],
}
