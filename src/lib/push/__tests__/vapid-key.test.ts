import { urlBase64ToUint8Array, isValidVapidPublicKey } from "../vapid-key";

// A real, valid VAPID application-server public key (87 base64url chars → 65 bytes,
// 0x04 uncompressed-P-256 prefix).
const VALID_KEY = "BG_EQSo7Hp8pZLPuEw2-UtIFGLEObSAH6k1h_9runvFWT-4fuVgC-Xh-lpKB6oXO6czFmcmOuwgw7Rmrs-TOl7k";

// The EXACT key prod was serving when A1-5 fired: 86 chars → 64 bytes (truncated by
// one base64url char). It decodes fine but is NOT a valid P-256 point, so
// pushManager.subscribe rejected it. Pinned here as the regression case.
const TRUNCATED_PROD_KEY = "BDmvNG91bGzcmBRm8H8Z5ucsCB5yKewVZW3Ex8GMEV25AxY0O8dD1mmurzW77EtYsd9fRoDItIS80uDHc2g1y7";

describe("urlBase64ToUint8Array", () => {
  test("decodes a valid VAPID key to 65 bytes starting 0x04", () => {
    const bytes = urlBase64ToUint8Array(VALID_KEY);
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(0x04);
  });

  test("the truncated prod key decodes to 64 bytes (the bug)", () => {
    expect(urlBase64ToUint8Array(TRUNCATED_PROD_KEY).length).toBe(64);
  });
});

describe("isValidVapidPublicKey (A1-5 — key-shape guard)", () => {
  test("a well-formed 65-byte key is valid", () => {
    expect(isValidVapidPublicKey(VALID_KEY)).toBe(true);
  });

  test("the truncated prod key (64 bytes) is REJECTED", () => {
    expect(isValidVapidPublicKey(TRUNCATED_PROD_KEY)).toBe(false);
  });

  test("null / undefined / empty / whitespace → false", () => {
    expect(isValidVapidPublicKey(null)).toBe(false);
    expect(isValidVapidPublicKey(undefined)).toBe(false);
    expect(isValidVapidPublicKey("")).toBe(false);
    expect(isValidVapidPublicKey("   ")).toBe(false);
  });

  test("standard-base64 (contains + / =) is rejected — must be base64url", () => {
    expect(isValidVapidPublicKey("ab+cd/ef==")).toBe(false);
  });

  test("surrounding whitespace is tolerated (trimmed — a trailing env newline still works)", () => {
    expect(isValidVapidPublicKey(`\n  ${VALID_KEY}  \n`)).toBe(true);
  });

  test("INTERNAL whitespace is rejected (a corrupt/wrapped paste)", () => {
    const corrupt = VALID_KEY.slice(0, 40) + "\n" + VALID_KEY.slice(40);
    expect(isValidVapidPublicKey(corrupt)).toBe(false);
  });

  test("the 32-byte private key is not a valid public key", () => {
    expect(isValidVapidPublicKey("XVfdgymNvwLc1QDU9E5QJ_jOrQRT-61g1E_6-adAs8w")).toBe(false);
  });
});
