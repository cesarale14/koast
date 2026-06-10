import { blockCompletionForMissingPhotos } from "../completion-gate";

describe("blockCompletionForMissingPhotos (S3b)", () => {
  test("blocks completing with no photos when the property requires them", () => {
    expect(blockCompletionForMissingPhotos("completed", true, 0)).toBe(true);
  });

  test("allows completing once at least one photo exists", () => {
    expect(blockCompletionForMissingPhotos("completed", true, 1)).toBe(false);
  });

  test("does not gate when the property doesn't require photos", () => {
    expect(blockCompletionForMissingPhotos("completed", false, 0)).toBe(false);
  });

  test("only gates the completed transition (not start/issue)", () => {
    expect(blockCompletionForMissingPhotos("in_progress", true, 0)).toBe(false);
    expect(blockCompletionForMissingPhotos("issue", true, 0)).toBe(false);
    expect(blockCompletionForMissingPhotos(undefined, true, 0)).toBe(false);
  });
});
