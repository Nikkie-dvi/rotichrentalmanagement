import { useAppLogo } from "@/hooks/use-branding";

export function AppLogo({ className = "h-8 w-8" }: { className?: string }) {
  const src = useAppLogo();
  return (
    <img
      src={src}
      alt="Rotich Rental Management Systems logo"
      className={`${className} rounded-lg object-cover shadow-sm`}
      loading="lazy"
      decoding="async"
    />
  );
}
