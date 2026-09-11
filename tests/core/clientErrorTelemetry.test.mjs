import test from "node:test";
import assert from "node:assert/strict";

const {
  shouldDropClientTelemetry,
  EXPECTED_CLIENT_UX_CODES,
} = await import("../../client/src/shared/utils/clientErrorTelemetry.ts");

test("drops INVALID_STATE inventory validation as expected UX", () => {
  assert.equal(EXPECTED_CLIENT_UX_CODES.has("INVALID_STATE"), true);
  assert.equal(
    shouldDropClientTelemetry({
      category: "api_failure",
      message: "Invalid slotIndex.",
      statusCode: 400,
      code: "INVALID_STATE",
      operation: "axios_post",
    }),
    true,
  );
});

test("keeps unexpected 500 without known code", () => {
  assert.equal(
    shouldDropClientTelemetry({
      category: "api_failure",
      message: "Internal Server Error",
      statusCode: 500,
      operation: "axios_get",
    }),
    false,
  );
});

test("drops self-report track URL", () => {
  assert.equal(
    shouldDropClientTelemetry({
      category: "api_failure",
      message: "fail",
      statusCode: 500,
      _apiUrl: "/api/track/client-error",
    }),
    true,
  );
});
