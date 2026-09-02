import { CircleHelp } from "lucide-react";
import type { StudentLesson, StudentLessonBlock } from "@/lib/student/types";
import QuizBlock from "@/components/student/QuizBlock";
import AutogradedAssignmentCard from "@/components/student/AutogradedAssignmentCard";

function youtubeEmbedUrl(url: string): string | null {
  const watch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  return watch ? `https://www.youtube.com/embed/${watch[1]}` : null;
}

function VideoBlock({ block }: { block: StudentLessonBlock }) {
  if (!block.videoUrl) return null;
  const embedUrl = youtubeEmbedUrl(block.videoUrl);
  return (
    <div className="px-8 py-6">
      {block.title && <h3 className="text-lg font-bold mb-3">{block.title}</h3>}
      {embedUrl ? (
        <iframe src={embedUrl} className="w-full aspect-video rounded-md border border-gray-200" allowFullScreen />
      ) : (
        <a href={block.videoUrl} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
          Watch video
        </a>
      )}
    </div>
  );
}

function SlideFileBlock({ block }: { block: StudentLessonBlock }) {
  return (
    <div className="px-8 py-6">
      {block.title && <h3 className="text-lg font-bold mb-3">{block.title}</h3>}
      {block.renderMode === "pdf_embed" && block.pdfUrl && (
        <iframe src={block.pdfUrl} className="w-full h-[70vh] rounded-md border border-gray-200" />
      )}
      {block.renderMode === "slide_card_images" && block.bodyHtml && (
        <div
          className="lesson-content-editor prose prose-sm max-w-none [&_.slide-card]:border [&_.slide-card]:border-gray-200 [&_.slide-card]:rounded-md [&_.slide-card]:p-4 [&_.slide-card]:mb-4"
          dangerouslySetInnerHTML={{ __html: block.bodyHtml }}
        />
      )}
      {block.renderMode === "slide_rendered_images" && block.renderedImageUrls && (
        <div className="flex flex-col gap-4">
          {block.renderedImageUrls.map((url, index) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={url} src={url} alt={`Slide ${index + 1}`} className="w-full rounded-md border border-gray-200" />
          ))}
        </div>
      )}
    </div>
  );
}

function QuestionGroupBlock({ block }: { block: StudentLessonBlock }) {
  return (
    <div className="px-8 py-6">
      {block.title && <h3 className="text-lg font-bold mb-3">{block.title}</h3>}
      {block.questions && block.questions.length > 0 ? (
        <QuizBlock questions={block.questions} />
      ) : (
        <p className="text-sm text-gray-400">No questions in this assignment yet.</p>
      )}
    </div>
  );
}

export default function StudentLessonViewer({ lesson }: { lesson: StudentLesson }) {
  return (
    <div className="flex-1 min-w-0 border border-gray-200 rounded-md overflow-hidden bg-white flex flex-col">
      {lesson.type === "quiz" && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-100 text-amber-800 text-xs font-bold uppercase tracking-wide">
          <CircleHelp size={14} />
          Quiz / Homework
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-gray-100">
        {lesson.autolab && (
          <AutogradedAssignmentCard lessonId={lesson.id} autolab={lesson.autolab} />
        )}

        {lesson.contentSource === "blocks" ? (
          lesson.blocks.length === 0 ? (
            <p className="px-8 py-6 text-sm text-gray-400">This lesson has no content yet.</p>
          ) : (
            lesson.blocks.map((block) => {
              if (block.kind === "video") return <VideoBlock key={block.id} block={block} />;
              if (block.kind === "slide_file") return <SlideFileBlock key={block.id} block={block} />;
              return <QuestionGroupBlock key={block.id} block={block} />;
            })
          )
        ) : (
          <div
            className="lesson-content-editor prose prose-sm max-w-none px-8 py-6"
            dangerouslySetInnerHTML={{ __html: lesson.contentHtml }}
          />
        )}
      </div>
    </div>
  );
}
