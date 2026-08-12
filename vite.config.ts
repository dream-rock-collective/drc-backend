import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/auth": "http://localhost:6942",
      "/health": "http://localhost:6942",
      "/register": "http://localhost:6942",
      "/registrations": "http://localhost:6942",
      "/modify-registration": "http://localhost:6942",
    },
  },
});
