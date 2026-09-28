import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  envPrefix: ["VITE_", "NEXT_"],
  plugins: [react()],
  server: {
    port: 5173,
  },
});
