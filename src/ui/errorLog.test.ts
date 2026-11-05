import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CommandError } from "../ipc/vault";
import { clearErrors, ERROR_LOG_LIMIT, noteError, onErrorsChanged, shownErrors } from "./errorLog";

function failure(code: string): CommandError {
  return { code, remediation: "Try again." };
}

beforeEach(() => {
  clearErrors();
});

describe("the errors shown", () => {
  it("lists the newest first", () => {
    noteError(failure("ERR_FIRST"));
    noteError(failure("ERR_SECOND"));

    expect(shownErrors().map((entry) => entry.error.code)).toEqual(["ERR_SECOND", "ERR_FIRST"]);
  });

  it("records one error once, however often its card is drawn", () => {
    const shown = failure("ERR_ONCE");

    noteError(shown);
    noteError(shown);

    expect(shownErrors()).toHaveLength(1);
  });

  it("records the same code twice when it happened twice", () => {
    noteError(failure("ERR_AGAIN"));
    noteError(failure("ERR_AGAIN"));

    expect(shownErrors()).toHaveLength(2);
  });

  it("keeps a bounded number, dropping the oldest", () => {
    for (let index = 0; index <= ERROR_LOG_LIMIT; index += 1) {
      noteError(failure(`ERR_${String(index)}`));
    }

    expect(shownErrors()).toHaveLength(ERROR_LOG_LIMIT);
    expect(shownErrors().at(-1)?.error.code).toBe("ERR_1");
  });

  it("tells whoever is listening, and stops when asked", () => {
    const listener = vi.fn();
    const stop = onErrorsChanged(listener);

    noteError(failure("ERR_HEARD"));
    stop();
    noteError(failure("ERR_UNHEARD"));

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("can be emptied, after which an error shown again is recorded again", () => {
    const shown = failure("ERR_BACK");
    noteError(shown);

    clearErrors();
    expect(shownErrors()).toEqual([]);

    noteError(shown);
    expect(shownErrors()).toHaveLength(1);
  });
});
