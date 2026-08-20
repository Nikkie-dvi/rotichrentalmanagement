import logoAsset from "@/assets/rotich-logo-v2.png.asset.json";

export function AppLogo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <img
      src={logoAsset.url}
      alt="Rotich Rental Management Systems logo"
      className={`${className} rounded-lg object-cover shadow-sm`}
      loading="lazy"
      decoding="async"
    />
  );
}
