"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders question prompts / reference answers as GitHub-flavored Markdown —
 * fenced code blocks, tables, lists, bold/italic — instead of flattening
 * everything to a single run of plain text. Styling is applied via arbitrary
 * Tailwind child selectors rather than component overrides so it stays
 * correct across react-markdown's default element choices.
 */
export default function RichText({
  children,
  className = "",
}: {
  children: string;
  className?: string;
}) {
  if (!children?.trim()) return null;

  return (
    <div
      className={`overflow-x-auto text-sm leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2 [&_li]:mb-0.5 [&_strong]:font-semibold [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:text-gray-600 [&_pre]:bg-gray-900 [&_pre]:text-gray-100 [&_pre]:text-xs [&_pre]:rounded [&_pre]:p-3 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_p_code]:bg-gray-100 [&_p_code]:px-1 [&_p_code]:py-0.5 [&_p_code]:rounded [&_p_code]:text-[0.85em] [&_li_code]:bg-gray-100 [&_li_code]:px-1 [&_li_code]:py-0.5 [&_li_code]:rounded [&_li_code]:text-[0.85em] [&_code]:font-mono [&_table]:w-full [&_table]:border-collapse [&_table]:my-2 [&_th]:border [&_th]:border-gray-200 [&_th]:bg-gray-50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_td]:border [&_td]:border-gray-200 [&_td]:px-2 [&_td]:py-1 [&_img]:block [&_img]:w-full [&_img]:max-w-md [&_img]:h-auto [&_img]:mx-auto [&_img]:my-3 [&_img]:rounded [&_img]:border [&_img]:border-gray-200 ${className}`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
