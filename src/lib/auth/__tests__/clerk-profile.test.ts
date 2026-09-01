import { describe, expect, it } from "vitest";

import {
  clerkProfileEmail,
  clerkProfileImageUrl,
  clerkProfileName,
  displayInitials,
  type ClerkProfileSource,
} from "@/lib/auth/clerk-profile";

const clerk: ClerkProfileSource = {
  fullName: "Giorno Giovanna",
  firstName: "Giorno",
  lastName: "Giovanna",
  username: "giorno",
  imageUrl: "https://img.clerk.com/giorno.png",
  primaryEmailAddress: { emailAddress: "giornogiovanna0990@gmail.com" },
};

describe("clerkProfileName", () => {
  it("prefers the Clerk full name over the portal API name", () => {
    expect(clerkProfileName(clerk, "Operations Lead")).toBe("Giorno Giovanna");
  });

  it("joins first and last when full name is empty", () => {
    expect(
      clerkProfileName(
        { ...clerk, fullName: "  ", firstName: "Ada", lastName: "Admin" },
        "Account",
      ),
    ).toBe("Ada Admin");
  });

  it("falls back to the portal name when Clerk has not loaded", () => {
    expect(clerkProfileName(null, "Operations Lead")).toBe("Operations Lead");
    expect(clerkProfileName({}, "Account")).toBe("Account");
  });
});

describe("clerkProfileEmail", () => {
  it("uses the Clerk primary email when present", () => {
    expect(clerkProfileEmail(clerk, "ops@example.com")).toBe(
      "giornogiovanna0990@gmail.com",
    );
  });

  it("falls back to the portal email", () => {
    expect(clerkProfileEmail(null, "ops@example.com")).toBe("ops@example.com");
  });
});

describe("clerkProfileImageUrl", () => {
  it("returns the Clerk photo URL", () => {
    expect(clerkProfileImageUrl(clerk)).toBe("https://img.clerk.com/giorno.png");
  });

  it("omits a missing photo so initials can show", () => {
    expect(clerkProfileImageUrl({ ...clerk, imageUrl: "  " })).toBeUndefined();
    expect(clerkProfileImageUrl(null)).toBeUndefined();
  });
});

describe("displayInitials", () => {
  it("uses first and last letters of a two-word name", () => {
    expect(displayInitials("Operations Lead")).toBe("OL");
    expect(displayInitials("Giorno Giovanna")).toBe("GG");
  });

  it("uses the first two letters of a single word", () => {
    expect(displayInitials("Neo")).toBe("NE");
  });

  it("returns a placeholder when there is no name", () => {
    expect(displayInitials("")).toBe("?");
    expect(displayInitials(undefined)).toBe("?");
  });
});
