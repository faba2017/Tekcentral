import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { applySecurityHeaders } from "./backend/httpSecurity.js";

const browserSecurityHeaders = (): Plugin => ({
  name: "tekcentral-browser-security-headers",
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      applySecurityHeaders(response, new URL(request.url ?? "/", "http://localhost").pathname, "development");
      next();
    });
  },
  configurePreviewServer(server) {
    server.middlewares.use((request, response, next) => {
      applySecurityHeaders(response, new URL(request.url ?? "/", "http://localhost").pathname, "production");
      next();
    });
  },
});

export default defineConfig({
  plugins: [browserSecurityHeaders(), react()],
  build: { sourcemap: false },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
