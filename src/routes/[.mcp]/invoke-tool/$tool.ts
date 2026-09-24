// MCP dependencies are loaded only when this endpoint is called. Eager imports
// initialize Node-oriented buffer helpers and can crash ordinary Worker SSR.
// To take ownership, delete this banner line; the plugin then leaves the file alone.
// route: /.mcp/invoke-tool/$tool
// emitted to: src/routes/[.mcp]/invoke-tool/$tool.ts

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/.mcp/invoke-tool/$tool")({
  server: {
    handlers: {
      // ANY: TanStack returns SPA HTML for methods not in `handlers`; the SDK 405s instead.
      ANY: async (context) => {
        const [{ createTanStackInvokeToolHandler }, { default: mcp }] = await Promise.all([
          import("@lovable.dev/mcp-js/stacks/tanstack"),
          import("../../../lib/mcp/index"),
        ]);
        return createTanStackInvokeToolHandler(mcp, {
          resourcePath: "/mcp",
          metadataPath: "/.well-known/oauth-protected-resource",
          trustForwardedHost: true,
        })(context);
      },
    },
  },
});
