import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { applySecurityHeaders } from "./backend/httpSecurity.js";
const browserSecurityHeaders = () => ({
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
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
});
