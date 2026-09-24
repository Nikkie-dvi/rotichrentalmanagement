// MCP dependencies are loaded only when this endpoint is called. Eager imports
// initialize Node-oriented buffer helpers and can crash ordinary Worker SSR.
// To take ownership, delete this banner line; the plugin then leaves the file alone.
// route: /mcp
// emitted to: src/routes/mcp.ts

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      ANY: async (context) => {
        const [{ createTanStackMcpHandler }, { default: mcp }] = await Promise.all([
          import("@lovable.dev/mcp-js/stacks/tanstack"),
          import("../lib/mcp/index"),
        ]);
        return createTanStackMcpHandler(mcp, {
          resourcePath: "/mcp",
          metadataPath: "/.well-known/oauth-protected-resource",
          trustForwardedHost: true,
        })(context);
      },
    },
  },
});
