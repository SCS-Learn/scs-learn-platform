"use client";

import { useState, useTransition } from "react";
import { Send, X } from "lucide-react";
import type { Announcement } from "@/lib/instructor/mock-data";
import { postAnnouncement, deleteAnnouncement } from "@/lib/instructor/data/announcements";

export default function AnnouncementsPanel({
  courses,
  announcements,
}: {
  courses: { code: string; title: string }[];
  announcements: Announcement[];
}) {
  const [draft, setDraft] = useState("");
  const [targetCourseCode, setTargetCourseCode] = useState(courses[0]?.code ?? "");
  const [isPending, startTransition] = useTransition();

  const post = () => {
    const message = draft.trim();
    if (!message || !targetCourseCode) return;
    setDraft("");
    startTransition(async () => {
      await postAnnouncement({ courseCode: targetCourseCode, message });
    });
  };

  const remove = (id: string) => {
    startTransition(async () => {
      await deleteAnnouncement(id);
    });
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h3 className="text-sm font-bold">Announcements</h3>
      </div>

      <div className="mb-4 shrink-0">
        <select
          value={targetCourseCode}
          onChange={(e) => setTargetCourseCode(e.target.value)}
          className="w-full text-xs font-bold text-gray-600 border border-gray-200 rounded px-2 py-1.5 mb-2 bg-white"
        >
          {courses.map((course) => (
            <option key={course.code} value={course.code}>
              {course.code} — {course.title}
            </option>
          ))}
        </select>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Post an update to your students…"
          rows={2}
          className="w-full text-sm border border-gray-200 rounded px-2.5 py-2 resize-none focus:outline-none focus:border-primary/50"
        />
        <button
          type="button"
          onClick={post}
          disabled={!draft.trim() || !targetCourseCode || isPending}
          className="mt-1.5 w-full flex items-center justify-center gap-1.5 text-xs font-bold bg-primary text-white rounded py-1.5 disabled:opacity-40"
        >
          <Send size={13} />
          Post announcement
        </button>
      </div>

      <div className={`flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto ${isPending ? "opacity-60" : ""}`}>
        {announcements.map((announcement) => (
          <div key={announcement.id} className="group flex gap-2.5">
            <div className="w-7 h-7 rounded-full bg-gray-100 text-[10px] font-bold text-gray-500 flex items-center justify-center shrink-0">
              {announcement.authorInitials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold">{announcement.authorName}</span>
                <span className="text-[10px] font-bold text-primary">
                  {announcement.courseCode}
                </span>
                <span className="text-[10px] text-gray-400">{announcement.timestamp}</span>
              </div>
              <p className="text-xs text-gray-600 mt-0.5">{announcement.message}</p>
            </div>
            <button
              type="button"
              aria-label="Delete announcement"
              onClick={() => remove(announcement.id)}
              className="shrink-0 text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500 self-start"
            >
              <X size={13} />
            </button>
          </div>
        ))}
        {announcements.length === 0 && (
          <p className="text-xs text-gray-400">No announcements yet.</p>
        )}
      </div>
    </div>
  );
}
