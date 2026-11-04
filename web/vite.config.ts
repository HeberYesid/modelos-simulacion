import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const webRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const publicDemo = loadEnv(mode, webRoot).VITE_PUBLIC_DEMO === "true";

  return {
    server: {
      host: "127.0.0.1",
      proxy: {
        "/api": {
          target: "http://127.0.0.1:8000",
          changeOrigin: false,
        },
      },
    },
    ...(publicDemo ? {
      resolve: {
        alias: [
          {
            find: /^.*[/\\]components[/\\]observed-replay(?:\.ts)?$/,
            replacement: path.resolve(webRoot, "src/components/observed-replay.public.ts"),
          },
          {
            find: /^.*[/\\]observed-visits\.json$/,
            replacement: path.resolve(webRoot, "src/replay/observed-visits.public-empty.json"),
          },
        ],
      },
    } : {}),
    build: {
      assetsDir: "assets",
    },
  };
});
