import { ReactNode } from "react";

type Variant = "primary" | "outline" | "outlineInverse";

const BASE =
  "inline-flex items-center justify-center gap-2 font-medium text-sm px-6 py-3 transition-colors";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-dark",
  outline: "border border-primary text-primary hover:bg-primary hover:text-white",
  outlineInverse: "border border-white text-white hover:bg-white hover:text-primary",
};

type ButtonProps = {
  children: ReactNode;
  variant?: Variant;
  className?: string;
};

export default function Button({
  children,
  variant = "primary",
  className = "",
  href,
  ...rest
}: ButtonProps & ({ href: string } | { href?: undefined; onClick?: () => void; type?: "button" | "submit" })) {
  const classes = `${BASE} ${VARIANTS[variant]} ${className}`;

  if (href) {
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    );
  }

  const { type = "button", onClick } = rest as { type?: "button" | "submit"; onClick?: () => void };
  return (
    <button type={type} onClick={onClick} className={classes}>
      {children}
    </button>
  );
}

export function TextLink({
  href,
  children,
  tone = "primary",
  className = "",
}: {
  href: string;
  children: ReactNode;
  tone?: "primary" | "light";
  className?: string;
}) {
  const toneClass = tone === "light" ? "text-white" : "text-primary";
  return (
    <a
      href={href}
      className={`${toneClass} text-sm font-semibold hover:underline underline-offset-4 ${className}`}
    >
      {children}
    </a>
  );
}
