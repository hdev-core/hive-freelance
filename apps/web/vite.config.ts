import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig(({ mode }) => {
  // Load env from monorepo root so VITE_* / WEB_PORT match `.env`
  const root = resolve(__dirname, "../..");
  const env = loadEnv(mode, root, "");
  const port = Number(env.WEB_PORT || 5173);
  // Prefer empty base URL in the browser (same-origin → Vite proxy).
  // Absolute VITE_API_BASE_URL still works via CORS when set.
  const apiTarget = env.API_PROXY_TARGET || "http://127.0.0.1:4000";

  return {
    envDir: root,
    plugins: [react()],
    server: {
      port,
      proxy: {
        "/health": { target: apiTarget, changeOrigin: true },
        "/api": { target: apiTarget, changeOrigin: true },
      },
    },
  };
});
