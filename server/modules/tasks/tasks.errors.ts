/** Domain error codes for the tasks (daily missions) module. */
export class TasksHttpError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "TasksHttpError";
  }
}

export const TASKS_ERROR = {
  NOT_FOUND: "not_found",
  NOT_COMPLETED: "not_completed",
  ALREADY_CLAIMED: "already_claimed",
  FORBIDDEN: "forbidden",
  INVALID_TASK: "invalid_task",
  LIST_FAILED: "TASKS_LIST_FAILED",
  CLAIM_FAILED: "TASKS_CLAIM_FAILED",
} as const;
