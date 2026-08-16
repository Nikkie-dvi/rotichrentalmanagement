import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Sticky top bar for tenant portal pages so users always have a way back
 * (browser history) and a link to the portal home, on mobile and desktop.
 */
export function TenantBackBar({ title, homeTo = "/tenant" }: { title?: string; homeTo?: string }) {
  const router = useRouter();

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
    } else {
      router.navigate({ to: homeTo });
    }
  };

  return (
    <div className="sticky top-0 z-30 -mx-4 mb-4 flex items-center gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur md:-mx-6 md:px-6">
      <Button
        variant="outline"
        size="sm"
        onClick={goBack}
        aria-label="Go back"
        className="border-primary/30 bg-card font-medium text-foreground shadow-sm"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>
      {title && <span className="truncate text-sm font-medium">{title}</span>}
      <Button asChild variant="outline" size="sm" className="ml-auto border-primary/30 bg-card font-medium text-foreground shadow-sm">
        <Link to={homeTo}>
          <Home className="h-4 w-4" /> Portal home
        </Link>
      </Button>
    </div>
  );
}
