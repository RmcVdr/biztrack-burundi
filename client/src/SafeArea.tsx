// Protection haute pour l'encoche / la barre de gestes des téléphones.
// Remplace SafeAreaTopScrim de @hatch/space-sdk/client par une implémentation
// standard : un bandeau fixe dont la hauteur suit env(safe-area-inset-top),
// avec un léger fondu (variante "gradient", valeur par défaut).
import type { CSSProperties, ReactNode } from "react";

export interface SafeAreaTopScrimProps {
  variant?: "gradient" | "inset" | "blur";
  backgroundColor?: string;
  zIndex?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

const GRADIENT_MASK =
  "linear-gradient(to bottom, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.99) 10%, rgba(0, 0, 0, 0.96) 20%, rgba(0, 0, 0, 0.90) 30%, rgba(0, 0, 0, 0.80) 40%, rgba(0, 0, 0, 0.67) 50%, rgba(0, 0, 0, 0.52) 60%, rgba(0, 0, 0, 0.36) 70%, rgba(0, 0, 0, 0.20) 80%, rgba(0, 0, 0, 0.08) 90%, rgba(0, 0, 0, 0) 100%)";

export function SafeAreaTopScrim({
  variant = "gradient",
  backgroundColor = "var(--bg)",
  zIndex = 40,
  className,
  style,
}: SafeAreaTopScrimProps) {
  const managedStyle: CSSProperties = {
    ...style,
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex,
    pointerEvents: "none",
    height:
      variant === "gradient"
        ? "calc(env(safe-area-inset-top) + min(2rem, env(safe-area-inset-top)))"
        : "env(safe-area-inset-top)",
    backgroundColor,
  };
  if (variant === "gradient") {
    managedStyle.maskImage = GRADIENT_MASK;
    managedStyle.WebkitMaskImage = GRADIENT_MASK;
  } else if (variant === "blur") {
    managedStyle.backdropFilter = style?.backdropFilter ?? "blur(12px)";
    managedStyle.WebkitBackdropFilter = style?.WebkitBackdropFilter ?? "blur(12px)";
  }
  return <div aria-hidden className={className} style={managedStyle} />;
}
