import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite configuration for the Squad Up app.  This config uses the
// official React plugin to enable JSX and TypeScript support and
// leaves most of the defaults in place.  See
// https://vitejs.dev/config/ for details on additional options.
export default defineConfig({
  plugins: [react()],
});
