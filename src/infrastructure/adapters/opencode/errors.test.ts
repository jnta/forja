// @vitest-environment node
import { describe, expect, it } from "vitest";

import { describeAssistantError } from "./errors";

describe("describeAssistantError", () => {
  it("returns undefined when there is no error", () => {
    expect(describeAssistantError(undefined)).toBeUndefined();
  });

  it("includes the message for API errors", () => {
    expect(
      describeAssistantError({
        name: "APIError",
        data: { message: "Insufficient balance", isRetryable: false },
      }),
    ).toBe("APIError: Insufficient balance");
  });

  it("falls back to the error name when there is no message", () => {
    expect(
      describeAssistantError({
        name: "MessageOutputLengthError",
        data: {},
      }),
    ).toBe("MessageOutputLengthError");
  });
});
