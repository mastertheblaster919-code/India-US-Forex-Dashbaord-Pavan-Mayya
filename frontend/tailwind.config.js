/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                background: '#0a0a0f',
                panel: '#15151e',
                border: '#2e2e42',
                primary: '#4f46e5',
                success: '#10b981',
                danger: '#ef4444',
            }
        },
    },
    plugins: [],
}
