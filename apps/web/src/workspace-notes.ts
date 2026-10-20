export interface WorkspaceNotes {
  project: string;
  tasks: Array<{ id: string; text: string; done: boolean }>;
}
const KEY = "od-workspace-notes-v1";
export function parseWorkspace(raw: string | null): WorkspaceNotes {
  try {
    const v = JSON.parse(raw ?? "null");
    return {
      project: typeof v?.project === "string" ? v.project.slice(0, 4000) : "",
      tasks: Array.isArray(v?.tasks)
        ? v.tasks
            .filter((t: any) => typeof t?.id === "string" && typeof t.text === "string" && typeof t.done === "boolean")
            .slice(0, 50)
            .map((t: any) => ({ id: t.id, text: t.text.slice(0, 300), done: t.done }))
        : [],
    };
  } catch {
    return { project: "", tasks: [] };
  }
}
export function readWorkspace(): WorkspaceNotes {
  try {
    return parseWorkspace(localStorage.getItem(KEY));
  } catch {
    return parseWorkspace(null);
  }
}
export function saveWorkspace(notes: WorkspaceNotes): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(notes));
    return true;
  } catch {
    return false;
  }
}
