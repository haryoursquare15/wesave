import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { invokeSecurityControls } from "../lib/securityControls";

function fixture() {
  const session = { access_token: "test-token", expires_at: Date.now() / 1000 + 3600 };
  const client = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
      refreshSession: vi.fn().mockResolvedValue({ data: { session: { ...session, access_token: "renewed-token" } }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    functions: { invoke: vi.fn().mockResolvedValue({ data: { devices: [] }, error: null }) },
  };
  return { client, typed: client as unknown as SupabaseClient<Database> };
}

describe("security session recovery", () => {
  it("does not send a signed-out request", async () => {
    const { client, typed } = fixture();
    client.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const result = await invokeSecurityControls(typed, { body: { action: "get_devices" } });
    expect(client.functions.invoke).not.toHaveBeenCalled();
    expect(result.error?.message).toContain("Please sign in again");
  });
  it("retries an authentication rejection using the renewed token", async () => {
    const { client, typed } = fixture();
    client.functions.invoke.mockResolvedValueOnce({ data: null, error: { context: { status: 401 } } });
    await invokeSecurityControls(typed, { body: { action: "get_devices" } });
    expect(client.functions.invoke).toHaveBeenCalledTimes(2);
    expect(client.functions.invoke.mock.calls[1][1].headers.Authorization).toBe("Bearer renewed-token");
  });
  it("clears an unrecoverable session locally without throwing", async () => {
    const { client, typed } = fixture();
    client.functions.invoke.mockResolvedValue({ data: null, error: { context: { status: 401 } } });
    const result = await invokeSecurityControls(typed, { body: { action: "get_devices" } });
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(result.error?.message).toContain("Please sign in again");
  });
  it("does not replay an uncertain network failure", async () => {
    const { client, typed } = fixture();
    client.functions.invoke.mockRejectedValue(new Error("Failed to fetch"));
    const result = await invokeSecurityControls(typed, { body: { action: "remove_device" } });
    expect(client.functions.invoke).toHaveBeenCalledTimes(1);
    expect(result.error?.message).toContain("Please try again");
  });
});