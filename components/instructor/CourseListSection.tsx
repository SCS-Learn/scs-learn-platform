"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import CourseCard from "@/components/instructor/CourseCard";
import { createCourse, deleteCourse } from "@/lib/instructor/data/courses";
import { getDriveShareEmail } from "@/lib/instructor/data/google-drive";
import { runDriveImportOrganize } from "@/lib/instructor/data/google-drive-organize";
import { getGoogleOAuthConnectionStatus } from "@/lib/instructor/data/google-oauth";
import type { InstructorCourse } from "@/lib/instructor/mock-data";

type CreateStatus = "idle" | "creating" | "importing";

function CreateCourseModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (code: string, importResult?: { unitIds: string[]; lessonIds: string[] }) => void;
}) {
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [folderUrl, setFolderUrl] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState<CreateStatus>("idle");
  const [shareEmail, setShareEmail] = useState<string | null>(null);
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    void getDriveShareEmail().then(setShareEmail);
    void getGoogleOAuthConnectionStatus().then(setGoogleConnected);
  }, []);

  const isPending = status !== "idle";

  const submit = () => {
    setError("");
    startTransition(async () => {
      try {
        setStatus("creating");
        const result = await createCourse({ code, title });

        const trimmedFolderUrl = folderUrl.trim();
        if (trimmedFolderUrl) {
          setStatus("importing");
          try {
            const importResult = await runDriveImportOrganize(result.code, trimmedFolderUrl);
            onCreated(result.code, importResult);
          } catch (importErr) {
            const message =
              importErr instanceof Error ? importErr.message : "Drive import failed.";
            window.alert(
              `Course "${result.code}" was created, but the Drive import failed: ${message}. You can retry from the course editor.`
            );
            onCreated(result.code);
          }
          return;
        }

        onCreated(result.code);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create course.");
        setStatus("idle");
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4"
      onClick={isPending ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-course-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-white text-black rounded-md shadow-xl w-full max-w-lg p-6"
      >
        <h2 id="create-course-title" className="text-lg font-bold mb-4">
          Create a new course
        </h2>

        {status === "importing" ? (
          <div className="flex flex-col items-center gap-2 text-sm text-gray-500 py-10">
            <Loader2 size={20} className="animate-spin" />
            Importing from Google Drive — this can take a bit for larger folders...
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 mb-4">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-gray-600">Course code</span>
                <input
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. 02-251"
                  disabled={isPending}
                  className="text-sm border border-gray-200 rounded px-3 py-2 outline-none focus:border-primary/50 disabled:opacity-60"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-gray-600">Title</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Introduction to Bioinformatics"
                  disabled={isPending}
                  className="text-sm border border-gray-200 rounded px-3 py-2 outline-none focus:border-primary/50 disabled:opacity-60"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-gray-600">
                  Google Drive folder <span className="font-normal text-gray-400">(optional)</span>
                </span>
                <input
                  type="url"
                  value={folderUrl}
                  onChange={(e) => setFolderUrl(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/..."
                  disabled={isPending}
                  className="text-sm border border-gray-200 rounded px-3 py-2 outline-none focus:border-primary/50 disabled:opacity-60"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Paste a link to import units and lessons when the course is created. Folder layout
                  is ignored — AI reads the files and builds the course structure.
                </p>
              </label>
            </div>

            {googleConnected === false && (
              <div className="bg-blue-50 border border-blue-100 rounded-md px-3 py-2 mb-4 flex items-center justify-between gap-3">
                <p className="text-xs text-blue-700">
                  Connect your Google account to import private folders and render PowerPoint files exactly as Google
                  Slides sees them.
                </p>
                <a
                  href={`/api/google/oauth/start?return_to=${encodeURIComponent("/instructor")}`}
                  className="shrink-0 text-xs font-bold bg-primary text-white px-3 py-1.5 rounded hover:opacity-90"
                >
                  Connect Google Drive
                </a>
              </div>
            )}
            {googleConnected === true && (
              <p className="text-xs text-green-700 mb-4">
                Google Drive connected — paste a link to any folder your account can see.
              </p>
            )}
            {googleConnected === false && (
              <p className="text-xs text-gray-400 mb-4">
                Without connecting, share the folder as &ldquo;Anyone with the link&rdquo;
                {shareEmail && (
                  <>
                    , or keep it private by sharing it directly with{" "}
                    <span className="font-mono text-gray-500">{shareEmail}</span>
                  </>
                )}
                .
              </p>
            )}

            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="text-sm font-bold text-gray-500 px-4 py-2 hover:bg-gray-50 rounded disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={isPending || !code.trim() || !title.trim()}
                className="text-sm font-bold bg-primary text-white px-4 py-2 rounded hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-2"
              >
                {status === "creating" && <Loader2 size={14} className="animate-spin" />}
                {status === "creating"
                  ? "Creating…"
                  : folderUrl.trim()
                    ? "Create & import"
                    : "Create course"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function CourseListSection({ courses: initialCourses }: { courses: InstructorCourse[] }) {
  const [courses, setCourses] = useState(initialCourses);
  const [showModal, setShowModal] = useState(false);
  const router = useRouter();
  const [, startTransition] = useTransition();

  const handleCreated = (
    code: string,
    importResult?: { unitIds: string[]; lessonIds: string[] }
  ) => {
    setShowModal(false);
    if (importResult) {
      window.alert(
        `Imported ${importResult.unitIds.length} unit${importResult.unitIds.length === 1 ? "" : "s"} and ${importResult.lessonIds.length} lesson${importResult.lessonIds.length === 1 ? "" : "s"} from Google Drive. Review titles and types before publishing.`
      );
    }
    router.push(`/instructor/${code}`);
  };

  const handleDelete = (course: InstructorCourse) => {
    const lessonCount = course.units.reduce((sum, u) => sum + u.lessons.length, 0);
    const message =
      lessonCount > 0
        ? `Delete "${course.title}" (${course.code}) and all ${lessonCount} lessons? This cannot be undone.`
        : `Delete "${course.title}" (${course.code})? This cannot be undone.`;
    if (!window.confirm(message)) return;

    setCourses((prev) => prev.filter((c) => c.code !== course.code));
    startTransition(async () => {
      await deleteCourse(course.code);
    });
  };

  return (
    <>
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="text-sm font-bold">Your courses</h2>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="inline-flex items-center justify-center gap-2 text-sm font-bold bg-primary text-white px-5 py-2.5 hover:bg-primary/90 transition shrink-0"
        >
          <Plus size={16} />
          New course
        </button>
      </div>

      {courses.length === 0 ? (
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="w-full border-2 border-dashed border-gray-200 rounded-md p-10 text-center hover:border-primary/40 hover:bg-white transition"
        >
          <Plus size={24} className="mx-auto mb-2 text-gray-400" />
          <p className="text-sm font-bold mb-1">Create your first course</p>
          <p className="text-xs text-gray-500">Add a course code and title, or paste a Google Drive folder link to import content.</p>
        </button>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {courses.map((course) => (
            <CourseCard key={course.code} course={course} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {showModal && (
        <CreateCourseModal onClose={() => setShowModal(false)} onCreated={handleCreated} />
      )}
    </>
  );
}
