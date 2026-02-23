import { defineConfig } from 'vite'
import { resolve } from 'path'

// Configuration de Vite pour la gestion du build multi-pages
export default defineConfig({
    base: '/Booking/', // Requis pour le déploiement sur GitHub Pages (nom du dépôt)
    build: {
        rollupOptions: {
            input: {
                // Définition des points d'entrée HTML pour le bundle final
                main: resolve(__dirname, 'index.html'),
                admin: resolve(__dirname, 'admin.html'),
            },
        },
    },
})
