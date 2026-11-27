import type { SupabaseClient } from "@supabase/supabase-js";
import type { CodeTask } from "@/lib/code-task/types";

/**
 * Loads lesson_blocks.code_task for just the code_task blocks of a course.
 * Kept out of the main course select on purpose: until
 * add-code-task-block.sql has run, that column doesn't exist, and naming it
 * there would break every course page. This query only runs when a
 * code_task block exists, which itself requires the migration.
 */
export async function fetchCodeTasksByBlockId(
  supabase: SupabaseClient,
  blockIds: string[]
): Promise<Map<string, CodeTask>> {
  if (blockIds.length === 0) return new Map();
  const { data, error } = await supabase.from("lesson_blocks").select("id, code_task").in("id", blockIds);
  if (error) {
    console.error("fetchCodeTasksByBlockId:", error.message);
    return new Map();
  }
  return new Map(
    (data ?? [])
      .filter((row) => row.code_task)
      .map((row) => [row.id as string, row.code_task as CodeTask])
  );
}

/** Gives every code_task block in a course tree its CodeTask, in place of the null the main query leaves. */
export async function attachCodeTasks<
  B extends { id: string; kind: string; codeTask?: CodeTask | null },
  L extends { blocks: B[] },
  U extends { lessons: L[] },
>(supabase: SupabaseClient, units: U[]): Promise<U[]> {
  const ids = units.flatMap((u) => u.lessons.flatMap((l) => l.blocks.filter((b) => b.kind === "code_task").map((b) => b.id)));
  if (ids.length === 0) return units;
  const tasks = await fetchCodeTasksByBlockId(supabase, ids);
  return units.map((unit) => ({
    ...unit,
    lessons: unit.lessons.map((lesson) => ({
      ...lesson,
      blocks: lesson.blocks.map((block) =>
        block.kind === "code_task" ? { ...block, codeTask: tasks.get(block.id) ?? null } : block
      ),
    })),
  }));
}
