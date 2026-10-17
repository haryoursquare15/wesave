import { beforeEach, describe, expect, it } from "vitest";
import { readRememberedUsername, rememberUsername } from "@/lib/rememberUsername";

describe("remembered sign-in username", () => {
  beforeEach(() => localStorage.clear());

  it("restores the opted-in username without storing a password", () => {
    rememberUsername(" user@example.com ", true);
    expect(readRememberedUsername()).toBe("user@example.com");
    expect(localStorage.getItem("vestara_remembered_username")).toBe("user@example.com");
    expect(localStorage.length).toBe(1);
  });

  it("clears the saved username when remembering is turned off", () => {
    rememberUsername("user@example.com", true);
    rememberUsername("user@example.com", false);
    expect(readRememberedUsername()).toBe("");
    expect(localStorage.length).toBe(0);
  });
});