"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { getDriveImportPreview, getDriveShareEmail } from "@/lib/instructor/data/google-drive";
import { runDriveImportOrganize } from "@/lib/instructor/data/google-drive-organize";
import { getGoogleOAuthConnectionStatus } from "@/lib/instructor/data/google-oauth";

type Status = "input" | "scanning" | "confirm" | "importing" | "error";

export default function GoogleDriveImportModal({
  courseCode,
  onClose,
  onImportComplete,
}: {
  courseCode: string;
  onClose: () => void;
  onImportComplete: (result: { unitIds: string[]; lessonIds: string[] }) => void;
}) {
  const [status, setStatus] = useState<Status>("input");
  const [folderUrl, setFolderUrl] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [preview, setPreview] = useState<{ unitCount: number; lessonCount: number; isFlat: boolean } | null>(
    null
  );
  const [shareEmail, setShareEmail] = useState<string | null>(null);
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);

  useEffect(() => {
    void getDriveShareEmail().then(setShareEmail);
    void getGoogleOAuthConnectionStatus().then(setGoogleConnected);
  }, []);

  const scanFolder = async () => {
    if (!folderUrl.trim()) return;
    setStatus("scanning");
    try {
      const result = await getDriveImportPreview(folderUrl);
      setPreview(result);
      setStatus("confirm");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Couldn't scan that folder.");
      setStatus("error");
    }
  };

  const confirmImport = async () => {
    setStatus("importing");
    try {
      const result = await runDriveImportOrganize(courseCode, folderUrl);
      onImportComplete(result);
      onClose();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Import failed partway through. Check the course editor for what came through."
      );
      setStatus("error");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="bg-white text-black rounded-md shadow-xl w-full max-w-lg p-6 flex flex-col"
      >
        <h2 className="text-lg font-bold mb-1">Import from Google Drive</h2>

        {(status === "input" || status === "scanning") && (
          <div className="py-4">
            <p className="text-sm text-gray-500 mb-4">
              Paste a link to the Drive folder for this course. Each subfolder becomes a unit and each
              file inside it becomes a lesson - or, if the folder just has files with no subfolders,
              they all become lessons in one unit. Claude will classify each one as a lecture or a quiz.
            </p>
            {googleConnected === false && (
              <div className="bg-blue-50 border border-blue-100 rounded-md px-3 py-2 mb-4 flex items-center justify-between gap-3">
                <p className="text-xs text-blue-700">
                  Connect your Google account to import a folder you haven&rsquo;t shared anywhere, and get
                  true per-slide rendering for PowerPoint files.
                </p>
                <a
                  href={`/api/google/oauth/start?return_to=${encodeURIComponent(`/instructor/${courseCode}`)}`}
                  className="shrink-0 text-xs font-bold bg-primary text-white px-3 py-1.5 rounded hover:opacity-90"
                >
                  Connect Google Drive
                </a>
              </div>
            )}
            {googleConnected === true && (
              <p className="text-xs text-green-700 mb-4 flex items-center justify-between gap-3">
                <span>Google Drive connected - private folders and true slide rendering are available.</span>
                <a
                  href={`/api/google/oauth/start?return_to=${encodeURIComponent(`/instructor/${courseCode}`)}`}
                  className="shrink-0 underline hover:no-underline"
                >
                  Switch account
                </a>
              </p>
            )}
            {googleConnected ? (
              <p className="text-xs text-gray-400 mb-4">Paste a link to any folder your connected account can see.</p>
            ) : (
              <p className="text-xs text-gray-400 mb-4">
                Or, without connecting: share the folder as &ldquo;Anyone with the link&rdquo;
                {shareEmail && (
                  <>
                    , or keep it private by sharing it directly with{" "}
                    <span className="font-mono text-gray-500">{shareEmail}</span>
                  </>
                )}
                .
              </p>
            )}
            <input
              type="url"
              value={folderUrl}
              onChange={(e) => setFolderUrl(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/..."
              disabled={status === "scanning"}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-4 disabled:opacity-60"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={status === "scanning"}
                className="text-sm font-bold text-gray-500 px-4 py-2 hover:bg-gray-50 rounded disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={scanFolder}
                disabled={!folderUrl.trim() || status === "scanning"}
                className="text-sm font-bold bg-primary text-white px-4 py-2 rounded hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-2"
              >
                {status === "scanning" && <Loader2 size={14} className="animate-spin" />}
                Scan folder
              </button>
            </div>
          </div>
        )}

        {status === "confirm" && preview && (
          <div className="py-6">
            <p className="text-sm text-gray-600 mb-4">
              {preview.isFlat ? (
                <>
                  Found <span className="font-bold">{preview.lessonCount}</span> file
                  {preview.lessonCount === 1 ? "" : "s"} with no folder structure. Claude will group them
                  into units, classify each as a lecture or a quiz, and add them to this course - you can
                  review and edit everything afterward.
                </>
              ) : (
                <>
                  Found <span className="font-bold">{preview.unitCount}</span> unit
                  {preview.unitCount === 1 ? "" : "s"} and{" "}
                  <span className="font-bold">{preview.lessonCount}</span> lesson
                  {preview.lessonCount === 1 ? "" : "s"}. Claude will classify each file as a lecture or a
                  quiz and add them to this course - you can review and edit everything afterward.
                </>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStatus("input")}
                className="text-sm font-bold text-gray-500 px-4 py-2 hover:bg-gray-50 rounded"
              >
                Back
              </button>
              <button
                type="button"
                onClick={confirmImport}
                disabled={preview.lessonCount === 0}
                className="text-sm font-bold bg-primary text-white px-4 py-2 rounded hover:opacity-90 disabled:opacity-40"
              >
                Import
              </button>
            </div>
          </div>
        )}

        {status === "importing" && (
          <div className="flex flex-col items-center gap-2 text-sm text-gray-500 py-10">
            <Loader2 size={20} className="animate-spin" />
            Reading each file and porting its slides, videos, and questions - this can take a bit for larger folders...
          </div>
        )}

        {status === "error" && (
          <div className="py-6">
            <p className="text-sm text-red-500 mb-4">{errorMessage}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStatus("input")}
                className="text-sm font-bold text-gray-500 px-4 py-2 hover:bg-gray-50 rounded"
              >
                <ArrowLeft size={14} className="inline mr-1" />
                Try again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
