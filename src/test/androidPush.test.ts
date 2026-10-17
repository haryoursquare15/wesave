import { afterEach, describe, expect, it, vi } from "vitest";
import { isAndroidApp, readAndroidToken, requestAndroidToken, syncAndroidToken, removeAndroidToken } from "@/lib/androidPush";
import type { SupabaseClient } from "@supabase/supabase-js";
import { androidPushData, isInvalidFcmToken, pushCategoryEnabled } from "../../supabase/functions/_shared/android-push-policy";

afterEach(() => { delete window.VestaraAndroid; vi.restoreAllMocks(); vi.useRealTimers(); });

function bridge(token = "android-device-token") {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Android VestaraApp");
  window.VestaraAndroid = { requestPushPermission: vi.fn(), getFcmToken: vi.fn(() => token) };
}

describe("Android wrapper registration", () => {
  it("requires both VestaraApp user agent and bridge", () => {
    bridge(); expect(isAndroidApp()).toBe(true);
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Android Chrome");
    expect(isAndroidApp()).toBe(false);
  });
  it("silently ignores missing bridge", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("VestaraApp");
    expect(await readAndroidToken()).toBeNull();
    expect(await requestAndroidToken()).toBeNull();
  });
  it("requests permission then retries an empty token", async () => {
    vi.useFakeTimers(); bridge("");
    const getToken = vi.mocked(window.VestaraAndroid?.getFcmToken);
    getToken?.mockReturnValueOnce("").mockReturnValueOnce("ready-token");
    const pending = requestAndroidToken();
    await vi.advanceTimersByTimeAsync(500);
    expect(await pending).toBe("ready-token");
    expect(window.VestaraAndroid?.requestPushPermission).toHaveBeenCalledOnce();
  });
  it("stops waiting at ten seconds", async () => {
    vi.useFakeTimers(); bridge("");
    const pending = requestAndroidToken();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toBeNull();
    expect(window.VestaraAndroid?.getFcmToken).toHaveBeenCalledTimes(21);
  });
  it("launch sync upserts the current user's token without asking permission", async () => {
    bridge();
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const client = { from: vi.fn(() => ({ upsert })) } as unknown as SupabaseClient;
    expect(await syncAndroidToken(client, "user-one")).toBe(true);
    expect(upsert).toHaveBeenCalledWith({ user_id: "user-one", token: "android-device-token", platform: "android", last_seen: expect.any(String) }, { onConflict: "token" });
    expect(window.VestaraAndroid?.requestPushPermission).not.toHaveBeenCalled();
  });
  it("logout removes only the current user's current device", async () => {
    bridge();
    const eqToken = vi.fn().mockResolvedValue({ error: null });
    const eqUser = vi.fn(() => ({ eq: eqToken }));
    const client = { from: vi.fn(() => ({ delete: () => ({ eq: eqUser }) })) } as unknown as SupabaseClient;
    await removeAndroidToken(client, "user-one");
    expect(eqUser).toHaveBeenCalledWith("user_id", "user-one");
    expect(eqToken).toHaveBeenCalledWith("token", "android-device-token");
  });
});

describe("Android push delivery policy", () => {
  it("security always sends with transaction and marketing disabled", () => {
    expect(pushCategoryEnabled("security", { transactions: false, marketing: false })).toBe(true);
  });
  it("transactions respect opt-out", () => {
    expect(pushCategoryEnabled("transactions", { transactions: false })).toBe(false);
  });
  it("marketing requires opt-in", () => {
    expect(pushCategoryEnabled("marketing", null)).toBe(false);
    expect(pushCategoryEnabled("marketing", { marketing: true })).toBe(true);
  });
  it("Android text contains no financial details and is data-only", () => {
    expect(androidPushData("/app", "vestara-notification")).toEqual({ title: "Vestara", body: "You have a new notification. Open Vestara to view it.", url: "/app", tag: "vestara-notification" });
  });
  it("removes expired tokens but not malformed request errors", () => {
    expect(isInvalidFcmToken(404, {})).toBe(true);
    for (const errorCode of ["UNREGISTERED", "INVALID_ARGUMENT"]) {
      expect(isInvalidFcmToken(400, { error: { details: [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode }] } })).toBe(true);
    }
    expect(isInvalidFcmToken(400, { error: { status: "INVALID_ARGUMENT" } })).toBe(false);
    expect(isInvalidFcmToken(429, {})).toBe(false);
  });
});