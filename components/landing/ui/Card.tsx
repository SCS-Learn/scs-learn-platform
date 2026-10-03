import { ReactNode } from "react";

export default function Card({
  children,
  className = "",
  hoverable = false,
}: {
  children: ReactNode;
  className?: string;
  hoverable?: boolean;
}) {
  return (
    <div
      className={`bg-white border border-steel-gray ${
        hoverable ? "transition-shadow duration-200 hover:shadow-md" : "shadow-sm"
      } ${className}`}
    >
      {children}
    </div>
  );
}
