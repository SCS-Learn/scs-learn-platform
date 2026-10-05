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
    <div className="h-full flex flex-col min-h-0 p-5">
      <div className="flex items-center justify-between mb-5 shrink-0">
        <h3 className="font-serif text-lg font-semibold">Announcements</h3>
      </div>

      <div className="mb-6 shrink-0">
        <select
          value={targetCourseCode}
          onChange={(e) => setTargetCourseCode(e.target.value)}
          className="w-full rounded-lg text-sm font-semibold text-gray-700 border border-gray-300 px-3 py-2.5 mb-3 bg-white"
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
          rows={3}
          className="w-full rounded-lg text-sm border border-gray-300 px-3 py-2.5 resize-none focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
        <button
          type="button"
          onClick={post}
          disabled={!draft.trim() || !targetCourseCode || isPending}
          className="mt-3 w-full flex items-center justify-center gap-2 rounded-lg text-sm font-semibold bg-primary text-white py-2.5 transition-colors hover:bg-primary-dark disabled:opacity-40"
        >
          <Send size={15} />
          Post announcement
        </button>
      </div>

      <div className={`flex flex-col gap-5 flex-1 min-h-0 overflow-y-auto pr-1 ${isPending ? "opacity-60" : ""}`}>
        {announcements.map((announcement) => (
          <div key={announcement.id} className="group flex gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 text-xs font-bold text-primary flex items-center justify-center shrink-0">
              {announcement.authorInitials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold">{announcement.authorName}</span>
                <span className="text-xs font-bold text-iron-gray">
                  {announcement.courseCode}
                </span>
                <span className="text-xs text-gray-400">{announcement.timestamp}</span>
              </div>
              <p className="text-base text-gray-700 mt-1 leading-relaxed">{announcement.message}</p>
            </div>
            <button
              type="button"
              aria-label="Delete announcement"
              onClick={() => remove(announcement.id)}
              className="shrink-0 text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500 self-start"
            >
              <X size={15} />
            </button>
          </div>
        ))}
        {announcements.length === 0 && (
          <p className="text-sm text-gray-400">No announcements yet.</p>
        )}
      </div>
    </div>
  );
}
