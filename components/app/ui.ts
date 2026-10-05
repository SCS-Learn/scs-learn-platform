// Shared class strings for the signed-in app (student + instructor). The app
// borrows the landing page's CMU identity - Carnegie Red, Source Serif
// headings, Open Sans - but softens it for daily use the way learning apps
// (Coursera et al.) do: rounded cards, light shadows, roomier spacing.

export const card = "rounded-xl border border-gray-200 bg-white shadow-sm";

export const cardHover = "transition-shadow hover:shadow-md hover:border-gray-300";

export const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60";

export const btnSecondary =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 transition-colors hover:border-gray-400 hover:bg-gray-50 disabled:opacity-60";

export const btnGhost =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100 hover:text-black";

export const eyebrow = "text-xs font-bold uppercase tracking-[0.08em] text-primary";

export const pageTitle = "font-serif text-3xl font-semibold leading-tight md:text-4xl";

export const sectionTitle = "font-serif text-xl font-semibold";
