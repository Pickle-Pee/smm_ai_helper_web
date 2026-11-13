export type ResourceStatus = "loading" | "ready" | "error";

/**
 * Demo view override, set in Settings → «Демо-состояния».
 * Lets reviewers see loading / empty / error states without a backend.
 */
export type DemoView = "live" | "loading" | "empty" | "error";

export interface ResourceView<T> {
  status: ResourceStatus;
  items: T[];
}

export function applyDemoView<T>(demo: DemoView, status: ResourceStatus, items: T[]): ResourceView<T> {
  switch (demo) {
    case "loading":
      return { status: "loading", items: [] };
    case "error":
      return { status: "error", items: [] };
    case "empty":
      return { status: status === "ready" ? "ready" : status, items: [] };
    default:
      return { status, items };
  }
}
