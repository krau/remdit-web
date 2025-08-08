import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
  base: "",
  plugins: [topLevelAwait(), react()],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:30808",
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
});
