import { memo } from "react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const SigmaIcon = memo(({ className, ...props }: SvgProps) => {
  return (
    <svg
      width="24"
      height="24"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M18 7V5H6l6 7-6 7h12v-2" />
    </svg>
  )
})

SigmaIcon.displayName = "SigmaIcon"
