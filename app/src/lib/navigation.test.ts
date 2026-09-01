import { describe, expect, it } from "vitest";

import { shouldShowContactLauncher } from "./navigation";

describe("shouldShowContactLauncher", () => {
  it("shows the contact launcher on home and contact tabs", () => {
    expect(shouldShowContactLauncher("home")).toBe(true);
    expect(shouldShowContactLauncher("contact")).toBe(true);
  });

  it("hides the contact launcher on the profile tab", () => {
    expect(shouldShowContactLauncher("profile")).toBe(false);
  });
});
