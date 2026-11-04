import { defineConfig, loadEnv } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import * as path from "path";

const envPath = path.resolve(process.cwd(), "..", "..");

function communityBuildAudit(): Plugin {
  return {
    name: "community-build-audit",
    apply: "build",
    generateBundle(_options, bundle) {
      const eeModules = new Set<string>();
      let moduleCount = 0;

      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;

        for (const id of Object.keys(output.modules)) {
          moduleCount += 1;
          const normalizedId = id.replace(/\\/g, "/");
          if (
            normalizedId.includes("/src/ee/") ||
            normalizedId.includes("/packages/ee/") ||
            normalizedId.includes("/packages/base-formula/")
          ) {
            eeModules.add(normalizedId);
          }
        }
      }

      if (eeModules.size > 0) {
        this.error(
          `Community build contains ${eeModules.size} EE modules:\n${[...eeModules].join("\n")}`,
        );
      }

      this.emitFile({
        type: "asset",
        fileName: "community-build-audit.json",
        source: `${JSON.stringify({ communityBuild: true, eeModuleCount: 0, moduleCount }, null, 2)}\n`,
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const {
    APP_URL,
    FILE_UPLOAD_SIZE_LIMIT,
    FILE_IMPORT_SIZE_LIMIT,
    DRAWIO_URL,
    CLOUD,
    SUBDOMAIN_HOST,
    COLLAB_URL,
    BILLING_TRIAL_DAYS,
    POSTHOG_HOST,
    POSTHOG_KEY,
    AI_VECTOR_DRIVER,
    BETA_PUBLIC_SPACES,
  } = loadEnv(mode, envPath, "");

  return {
    define: {
      "process.env": {
        APP_URL,
        FILE_UPLOAD_SIZE_LIMIT,
        FILE_IMPORT_SIZE_LIMIT,
        DRAWIO_URL,
        CLOUD,
        SUBDOMAIN_HOST,
        COLLAB_URL,
        BILLING_TRIAL_DAYS,
        POSTHOG_HOST,
        POSTHOG_KEY,
        AI_VECTOR_DRIVER,
        BETA_PUBLIC_SPACES,
      },
      APP_VERSION: JSON.stringify(process.env.npm_package_version),
    },
    plugins: [react(), communityBuildAudit()],
    build: {
      rolldownOptions: {
        output: {
          advancedChunks: {
            groups: [
              {
                name: "vendor-mantine",
                test: /[\\/]node_modules[\\/]@mantine[\\/]/,
              },
            ],
          },
        },
      },
    },
    resolve: {
      alias: {
        "@": "/src",
      },
    },
    server: {
      proxy: {
        "/api": {
          target: APP_URL,
          changeOrigin: false,
        },
        "/socket.io": {
          target: APP_URL,
          ws: true,
          rewriteWsOrigin: true,
        },
        "/collab": {
          target: APP_URL,
          ws: true,
          rewriteWsOrigin: true,
        },
      },
    },
  };
});
