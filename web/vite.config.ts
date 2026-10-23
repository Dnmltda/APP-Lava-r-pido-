import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icone-192.png", "apple-touch-icon.png", "coroa-dnm.webp", "logo-dnm-marca.webp"],
      manifest: {
        name: "DNM&LTDA Lava Rápido",
        short_name: "Lava Rápido",
        description: "Fila, reservas, vendas e equipe do lava rápido no celular.",
        lang: "pt-BR",
        start_url: "/",
        display: "standalone",
        background_color: "#0A1F4D",
        theme_color: "#0A1F4D",
        icons: [
          { src: "icone-192.png", sizes: "192x192", type: "image/png" },
          { src: "icone-512.png", sizes: "512x512", type: "image/png" },
          { src: "icone-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // A API do PocketBase nunca vai para o cache: dados sempre frescos.
        navigateFallbackDenylist: [/^\/api\//, /^\/_\//],
        // Notificações (Web Push): public/push-sw.js
        importScripts: ["push-sw.js"],
        // O player de vídeo das câmeras (hls.js) só baixa quando o patrão abre a tela.
        globIgnores: ["**/hls-*.js"],
      },
    }),
  ],
});
