"use client";

import { useEffect, useState, type ClipboardEvent } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Loader2, Plus, X } from "lucide-react";
import { getDriveImportPreview, getDriveShareEmail } from "@/lib/instructor/data/google-drive";
import { runDriveImportOrganize } from "@/lib/instructor/data/google-drive-organize";
import { getGoogleOAuthConnectionStatus } from "@/lib/instructor/data/google-oauth";
import { getCogniterraOAuthConnectionStatus } from "@/lib/instructor/data/cogniterra-oauth";
import {
  getCogniterraCourseConfig,
  getCogniterraEnvDefaults,
} from "@/lib/instructor/data/cogniterra";
import CogniterraSetupFields from "@/components/instructor/CogniterraSetupFields";

type Status = "input" | "scanning" | "confirm" | "importing" | "error";

/** "ai": AI invents the unit list. "scaffold": the instructor names the units; AI only sorts files into them. */
type StructureMode = "ai" | "scaffold";

function UnitOutlineEditor({
  unitNames,
  onChange,
  folderNames,
}: {
  unitNames: string[];
  onChange: (next: string[]) => void;
  folderNames: string[];
}) {
  const update = (index: number, value: string) => onChange(unitNames.map((n, i) => (i === index ? value : n)));
  const remove = (index: number) => {
    const next = unitNames.filter((_, i) => i !== index);
    onChange(next.length > 0 ? next : [""]);
  };
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= unitNames.length) return;
    const next = [...unitNames];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  };
  // Pasting a multi-line list (from a syllabus, say) into one field becomes
  // one unit per line, inserted where the paste happened.
  const handlePaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    const lines = event.clipboardData
      .getData("text")
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)]|unit\s+\d+\s*[:.-])\s*/i, "").trim())
      .filter(Boolean);
    if (lines.length < 2) return;
    event.preventDefault();
    const before = unitNames.slice(0, index);
    const after = unitNames.slice(index + 1);
    const current = unitNames[index]?.trim() ? [unitNames[index]!] : [];
    onChange([...before, ...current, ...lines, ...after]);
  };

  return (
    <div className="mt-3">
      <ol className="flex flex-col gap-2">
        {unitNames.map((name, index) => (
          <li key={index} className="flex items-center gap-1.5">
            <span className="w-6 shrink-0 text-right text-xs font-bold text-gray-400 tabular-nums">{index + 1}.</span>
            <input
              type="text"
              value={name}
              aria-label={`Unit ${index + 1} name`}
              placeholder={index === 0 ? "e.g. Introduction to Python" : "Unit name"}
              onChange={(e) => update(index, e.target.value)}
              onPaste={(e) => handlePaste(index, e)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onChange([...unitNames.slice(0, index + 1), "", ...unitNames.slice(index + 1)]);
                }
              }}
              className="min-w-0 flex-1 border border-gray-300 rounded px-2.5 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={() => move(index, -1)}
              disabled={index === 0}
              aria-label={`Move unit ${index + 1} up`}
              className="grid size-7 place-items-center rounded text-gray-500 btn-fill-gray-50 disabled:opacity-30"
            >
              <ArrowUp size={14} />
            </button>
            <button
              type="button"
              onClick={() => move(index, 1)}
              disabled={index === unitNames.length - 1}
              aria-label={`Move unit ${index + 1} down`}
              className="grid size-7 place-items-center rounded text-gray-500 btn-fill-gray-50 disabled:opacity-30"
            >
              <ArrowDown size={14} />
            </button>
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label={`Remove unit ${index + 1}`}
              className="grid size-7 place-items-center rounded text-gray-500 btn-fill-gray-50"
            >
              <X size={14} />
            </button>
          </li>
        ))}
      </ol>
      <div className="mt-2 flex flex-wrap items-center gap-3 pl-7">
        <button
          type="button"
          onClick={() => onChange([...unitNames, ""])}
          className="inline-flex items-center gap-1 text-xs font-bold text-black underline-offset-2 hover:underline"
        >
          <Plus size={13} /> Add unit
        </button>
        {folderNames.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([...folderNames])}
            className="text-xs font-bold text-gray-600 underline-offset-2 hover:underline"
          >
            Use the folder&apos;s {folderNames.length} subfolder names
          </button>
        )}
      </div>
      <p className="mt-2 pl-7 text-xs text-gray-500">
        Units are created in this order. AI puts each file in the best-fitting unit and builds the lessons
        inside it. A name that matches an existing unit adds to that unit. Tip: paste a list to add one unit
        per line.
      </p>
    </div>
  );
}

export default function GoogleDriveImportModal({
  courseCode,
  onClose,
  onImportComplete,
}: {
  courseCode: string;
  onClose: () => void;
  onImportComplete: (result: {
    unitIds: string[];
    lessonIds: string[];
    youtubePlaylistWarning?: string | null;
    cogniterraWired: number;
    skippedAlreadyImportedCount: number;
    failedUnitTitles: string[];
    emptyUnitTitles?: string[];
  }) => void;
}) {
  const [status, setStatus] = useState<Status>("input");
  const [folderUrl, setFolderUrl] = useState("");
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [preview, setPreview] = useState<{
    unitCount: number;
    lessonCount: number;
    isFlat: boolean;
    fileCount: number;
    folderNames?: string[];
  } | null>(null);
  const [structureMode, setStructureMode] = useState<StructureMode>("ai");
  const [unitNames, setUnitNames] = useState<string[]>([""]);
  const cleanUnitNames = unitNames.map((n) => n.trim()).filter(Boolean);
  const [shareEmail, setShareEmail] = useState<string | null>(null);
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [cogniterraOAuthConnected, setCogniterraOAuthConnected] = useState<boolean | null>(null);
  const [cogniterraCourseId, setCogniterraCourseId] = useState("");
  const [cogniterraConsumerKey, setCogniterraConsumerKey] = useState("");
  const [cogniterraSharedSecret, setCogniterraSharedSecret] = useState("");
  const [existingCogniterra, setExistingCogniterra] = useState<string | null>(null);

  useEffect(() => {
    void getDriveShareEmail().then(setShareEmail);
    void getGoogleOAuthConnectionStatus().then(setGoogleConnected);
    void getCogniterraOAuthConnectionStatus().then(setCogniterraOAuthConnected);
    void getCogniterraCourseConfig(courseCode).then((config) => {
      if (config) {
        setExistingCogniterra(config.cogniterraCourseId);
        setCogniterraCourseId(config.cogniterraCourseId);
        setCogniterraConsumerKey(config.consumerKey);
      } else {
        void getCogniterraEnvDefaults().then((defaults) => {
          if (defaults.cogniterraCourseId) setCogniterraCourseId(defaults.cogniterraCourseId);
          if (defaults.consumerKey) setCogniterraConsumerKey(defaults.consumerKey);
          if (defaults.sharedSecret) setCogniterraSharedSecret(defaults.sharedSecret);
        });
      }
    });
  }, [courseCode]);

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

  const cogniterraReady =
    Boolean(cogniterraCourseId.trim()) &&
    Boolean(cogniterraConsumerKey.trim()) &&
    Boolean(cogniterraSharedSecret.trim() || existingCogniterra);

  const confirmImport = async () => {
    setStatus("importing");
    try {
      const shouldSaveCogniterra =
        cogniterraCourseId.trim() &&
        cogniterraConsumerKey.trim() &&
        (cogniterraSharedSecret.trim() || existingCogniterra);

      const cogniterra = shouldSaveCogniterra
        ? {
            cogniterraCourseId: cogniterraCourseId.trim(),
            consumerKey: cogniterraConsumerKey.trim(),
            sharedSecret: cogniterraSharedSecret.trim(),
          }
        : undefined;

      const result = await runDriveImportOrganize(
        courseCode,
        folderUrl,
        playlistUrl.trim() || undefined,
        { cogniterra, unitOutline: structureMode === "scaffold" ? cleanUnitNames : undefined }
      );
      onImportComplete(result);
      onClose();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Import failed partway through. Check the courseware editor for what came through."
      );
      setStatus("error");
    }
  };

  // Once a scan/import request is in flight, it keeps running server-side
  // regardless of whether this dialog is still on screen - dismissing it here
  // (via a backdrop click) doesn't cancel anything, it just hides the only
  // feedback the run is still happening. Block dismissal during those two
  // statuses so a stray click can't produce the false impression that the
  // import stopped when it's actually still writing to the course.
  const isBusy = status === "scanning" || status === "importing";

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4"
      onClick={isBusy ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="drive-import-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-white text-black rounded-md shadow-xl w-full max-w-lg p-6 flex flex-col max-h-[90vh] overflow-y-auto"
      >
        <h2 id="drive-import-title" className="text-lg font-bold mb-1">Import from Google Drive</h2>

        {(status === "input" || status === "scanning") && (
          <div className="py-4">
            <p className="text-sm text-gray-500 mb-4">
              Paste a link to the Drive folder for this courseware. All files are collected regardless of
              folder layout — AI reads each file and builds units, content lessons, and quizzes
              automatically.
            </p>
            {googleConnected === false && (
              <div className="bg-blue-50 border border-blue-100 rounded-md px-3 py-2 mb-4 flex items-center justify-between gap-3">
                <p className="text-xs text-blue-700">
                  Connect your Google account to import private folders and render PowerPoint files
                  exactly as Google Slides sees them (backgrounds, layout, and all).
                </p>
                <a
                  href={`/api/google/oauth/start?return_to=${encodeURIComponent(`/instructor/${courseCode}/edit`)}`}
                  className="shrink-0 text-xs font-bold text-black border border-black px-3 py-1.5 rounded btn-fill-gray-50"
                >
                  Connect Google Drive
                </a>
              </div>
            )}
            {googleConnected === true && (
              <p className="text-xs text-green-700 mb-4 flex items-center justify-between gap-3">
                <span>Google Drive connected — private folders and pixel-accurate slide rendering are available.</span>
                <a
                  href={`/api/google/oauth/start?return_to=${encodeURIComponent(`/instructor/${courseCode}/edit`)}`}
                  className="shrink-0 underline hover:no-underline"
                >
                  Switch account
                </a>
              </p>
            )}
            {googleConnected ? (
              <p className="text-xs text-gray-500 mb-4">Paste a link to any folder your connected account can see.</p>
            ) : (
              <p className="text-xs text-gray-500 mb-4">
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
              aria-label="Google Drive folder link"
              value={folderUrl}
              onChange={(e) => setFolderUrl(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/..."
              disabled={status === "scanning"}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-4 disabled:opacity-60"
            />

            <label className="flex flex-col gap-1 mb-4">
              <span className="text-xs font-bold text-gray-600">
                YouTube playlist or channel link (optional)
              </span>
              <input
                type="url"
                value={playlistUrl}
                onChange={(e) => setPlaylistUrl(e.target.value)}
                placeholder="https://www.youtube.com/playlist?list=... or a channel/@handle link"
                disabled={status === "scanning"}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm disabled:opacity-60"
              />
              <span className="text-xs text-gray-500">
                If lectures live on YouTube instead of Drive, paste a playlist link here — or, if
                lectures are split across one playlist per unit, paste the channel link instead
                and AI checks all of its playlists. Either way, it matches each video to the
                lecture topic it belongs to.
              </span>
            </label>

            {cogniterraOAuthConnected === false && (
              <div className="bg-blue-50 border border-blue-100 rounded-md px-3 py-2 mb-3 flex items-center justify-between gap-3">
                <p className="text-xs text-blue-700">
                  Connect your Cogniterra account so a private courseware&apos;s assignments can be listed
                  and matched automatically.
                </p>
                <a
                  href={`/api/cogniterra/oauth/start?return_to=${encodeURIComponent(`/instructor/${courseCode}/edit`)}`}
                  className="shrink-0 text-xs font-bold text-black border border-black px-3 py-1.5 rounded btn-fill-gray-50"
                >
                  Connect Cogniterra
                </a>
              </div>
            )}

            <div className="mb-4">
              <CogniterraSetupFields
                cogniterraCourseId={cogniterraCourseId}
                consumerKey={cogniterraConsumerKey}
                sharedSecret={cogniterraSharedSecret}
                existingCourseId={existingCogniterra}
                onCogniterraCourseIdChange={setCogniterraCourseId}
                onConsumerKeyChange={setCogniterraConsumerKey}
                onSharedSecretChange={setCogniterraSharedSecret}
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={status === "scanning"}
                className="text-sm font-bold text-gray-500 px-4 py-2 btn-fill-gray-50 rounded disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={scanFolder}
                disabled={!folderUrl.trim() || status === "scanning"}
                className="text-sm font-bold text-black border border-black px-4 py-2 rounded btn-fill-gray-50 disabled:opacity-40 inline-flex items-center gap-2"
              >
                {status === "scanning" && <Loader2 size={14} className="animate-spin" />}
                Scan folder
              </button>
            </div>
          </div>
        )}

        {status === "confirm" && preview && (
          <div className="py-4">
            <p className="text-sm text-gray-600 mb-4">
              Found <span className="font-bold">{preview.fileCount ?? preview.lessonCount}</span> file
              {(preview.fileCount ?? preview.lessonCount) === 1 ? "" : "s"}.
              {cogniterraReady ? " Cogniterra assignments will be linked automatically." : ""}
            </p>

            <fieldset className="mb-5">
              <legend className="text-xs font-bold text-gray-600 mb-2">Units</legend>
              <div className="flex flex-col gap-2">
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="structure-mode"
                    checked={structureMode === "ai"}
                    onChange={() => setStructureMode("ai")}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-bold">Let AI choose the units</span>
                    <span className="block text-xs text-gray-500">
                      AI reads every file, then decides the units, their order, and the lessons.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="structure-mode"
                    checked={structureMode === "scaffold"}
                    onChange={() => {
                      setStructureMode("scaffold");
                      // Start from the Drive subfolders when the outline is still blank.
                      if (cleanUnitNames.length === 0 && preview.folderNames?.length) {
                        setUnitNames([...preview.folderNames]);
                      }
                    }}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-bold">I&apos;ll name the units</span>
                    <span className="block text-xs text-gray-500">
                      You set the unit names and order. AI sorts files into them and builds the lessons.
                    </span>
                  </span>
                </label>
              </div>
              {structureMode === "scaffold" && (
                <UnitOutlineEditor
                  unitNames={unitNames}
                  onChange={setUnitNames}
                  folderNames={preview.folderNames ?? []}
                />
              )}
            </fieldset>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStatus("input")}
                className="text-sm font-bold text-gray-500 px-4 py-2 btn-fill-gray-50 rounded"
              >
                Back
              </button>
              <button
                type="button"
                onClick={confirmImport}
                disabled={
                  structureMode === "scaffold"
                    ? cleanUnitNames.length === 0
                    : (preview.fileCount ?? preview.lessonCount) === 0
                }
                className="text-sm font-bold text-black border border-black px-4 py-2 rounded btn-fill-gray-50 disabled:opacity-40"
              >
                {structureMode === "scaffold"
                  ? `Import into ${cleanUnitNames.length} unit${cleanUnitNames.length === 1 ? "" : "s"}`
                  : "Import"}
                {cogniterraReady ? " & link Cogniterra" : ""}
              </button>
            </div>
          </div>
        )}

        {status === "importing" && (
          <div className="flex flex-col items-center gap-2 text-sm text-gray-500 py-10" role="status">
            <Loader2 size={20} className="animate-spin" aria-hidden />
            {structureMode === "scaffold"
              ? "Rendering slides, sorting files into your units, and matching Cogniterra assignments..."
              : "Rendering slides, structuring the courseware, and matching Cogniterra assignments..."}
          </div>
        )}

        {status === "error" && (
          <div className="py-6">
            <p className="text-sm text-red-600 mb-4" role="alert">{errorMessage}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStatus("input")}
                className="text-sm font-bold text-gray-500 px-4 py-2 btn-fill-gray-50 rounded"
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
