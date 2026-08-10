import { createClient } from "@/lib/supabase/server";
import { CURRENT_INSTRUCTOR_ID } from "@/lib/instructor/data/current-instructor";
import type {
  InstructorCourse,
  Unit,
  LessonItem,
  LessonType,
  Attachment,
} from "@/lib/instructor/mock-data";

type AttachmentRow = {
  id: string;
  name: string;
  url: string | null;
};

type LessonRow = {
  id: string;
  code: string;
  title: string;
  type: string;
  position: number;
  content_html: string;
  is_published: boolean;
  updated_at: string;
  attachments: AttachmentRow[];
};

type UnitRow = {
  id: string;
  code: string;
  title: string;
  position: number;
  lessons: LessonRow[];
};

type CourseRow = {
  code: string;
  title: string;
  department: string;
  track: string;
  student_count: number;
  units: UnitRow[];
};

function toAttachment(row: AttachmentRow): Attachment {
  return { id: row.id, name: row.name, url: row.url ?? "" };
}

function toLessonItem(row: LessonRow): LessonItem {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    type: row.type as LessonType,
    contentHtml: row.content_html,
    isPublished: row.is_published,
    updatedAt: row.updated_at,
    attachments: row.attachments.map(toAttachment),
  };
}

function toUnit(row: UnitRow): Unit {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    lessons: [...row.lessons].sort((a, b) => a.position - b.position).map(toLessonItem),
  };
}

function toInstructorCourse(row: CourseRow): InstructorCourse {
  return {
    code: row.code,
    title: row.title,
    department: row.department,
    track: row.track,
    studentCount: row.student_count,
    units: [...row.units].sort((a, b) => a.position - b.position).map(toUnit),
  };
}

const COURSE_WITH_CONTENT_SELECT =
  "code, title, department, track, student_count, units(id, code, title, position, lessons(id, code, title, type, position, content_html, is_published, updated_at, attachments(id, name, url)))";

export async function getInstructorCourseList(): Promise<InstructorCourse[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courses")
    .select(COURSE_WITH_CONTENT_SELECT)
    .eq("instructor_id", CURRENT_INSTRUCTOR_ID)
    .order("code");
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => toInstructorCourse(row as unknown as CourseRow));
}

export async function getCourseWithContent(courseCode: string): Promise<InstructorCourse | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courses")
    .select(COURSE_WITH_CONTENT_SELECT)
    .eq("code", courseCode)
    .eq("instructor_id", CURRENT_INSTRUCTOR_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  return toInstructorCourse(data as unknown as CourseRow);
}
