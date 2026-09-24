// MCP dependencies are loaded only when this endpoint is called. Eager imports
// initialize Node-oriented buffer helpers and can crash ordinary Worker SSR.
// To take ownership, delete this banner line; the plugin then leaves the file alone.
// route: /.well-known/oauth-protected-resource
// emitted to: src/routes/[.well-known]/oauth-protected-resource.ts

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/.well-known/oauth-protected-resource")({
  server: {
    handlers: {
      ANY: async (context) => {
        const [{ createTanStackOAuthProtectedResourceMetadataHandler }, { default: mcp }] = await Promise.all([
          import("@lovable.dev/mcp-js/stacks/tanstack"),
          import("../../lib/mcp/index"),
        ]);
        return createTanStackOAuthProtectedResourceMetadataHandler(mcp, {
          resourcePath: "/mcp",
          metadataPath: "/.well-known/oauth-protected-resource",
          trustForwardedHost: true,
        })(context);
      },
    },
  },
});
