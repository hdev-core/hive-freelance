import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const rootEnv = loadEnv(mode, "../../", "");
  const port = Number(rootEnv.WEB_PORT || env.WEB_PORT || 5173);

  return {
    plugins: [react()],
    server: {
      port,
      proxy: {
        "/health": rootEnv.VITE_API_BASE_URL || "http://localhost:4000",
        "/api": rootEnv.VITE_API_BASE_URL || "http://localhost:4000",
      },
    },
  };
});
