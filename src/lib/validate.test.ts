import { describe, it, expect } from "vitest";
import { validateContactForm, hasRequiredFields } from "../src/lib/validate";

const valid = {
  name: "Ashfaq Ur Rahman",
  email: "ashfaq@gmail.com",
  message: "Hello, this is a test message.",
};

const base = {
  name: "Ashfaq Ur Rahman",
  email: "ashfaq@gmail.com",
  message: "Hello, this is a test message.",
};

// ─── validateContactForm — valid data ────────────────────────────────────────

describe("validateContactForm — valid data", () => {
  it("returns no errors for valid data", () => {
    expect(validateContactForm(valid)).toEqual({});
  });

  it("accepts a name of exactly 2 characters", () => {
    expect(validateContactForm({ ...valid, name: "Al" })).toEqual({});
  });

  it("accepts a name of exactly 100 characters", () => {
    expect(validateContactForm({ ...valid, name: "A".repeat(100) })).toEqual({});
  });

  it("accepts a message of exactly 10 characters", () => {
    expect(validateContactForm({ ...valid, message: "1234567890" })).toEqual({});
  });

  it("accepts a message of exactly 4000 characters", () => {
    expect(validateContactForm({ ...valid, message: "x".repeat(4000) })).toEqual({});
  });
});

// ─── validateContactForm — name errors ───────────────────────────────────────

describe("validateContactForm — name errors", () => {
  it("requires name", () => {
    const result = validateContactForm({ ...base, name: "" });
    expect(result.name).toBe("Name is required.");
  });

  it("rejects a name shorter than 2 characters", () => {
    const result = validateContactForm({ ...base, name: "A" });
    expect(result.name).toBe("Name must be at least 2 characters.");
  });

  it("rejects a name longer than 100 characters", () => {
    const result = validateContactForm({ ...base, name: "A".repeat(101) });
    expect(result.name).toBe("Name must be 100 characters or fewer.");
  });

  it("does not set an error for other fields when only name is invalid", () => {
    const result = validateContactForm({ ...base, name: "" });
    expect(result.email).toBeUndefined();
    expect(result.message).toBeUndefined();
  });
});

// ─── validateContactForm — email errors ──────────────────────────────────────

describe("validateContactForm — email errors", () => {
  it("requires email", () => {
    const result = validateContactForm({ ...base, email: "" });
    expect(result.email).toBe("Email is required.");
  });

  it("rejects an email longer than 254 characters", () => {
    const result = validateContactForm({ ...base, email: "a".repeat(250) + "@gmail.com" });
    expect(result.email).toBe("Email address is too long.");
  });

  it("rejects an email without @", () => {
    const result = validateContactForm({ ...base, email: "notanemail" });
    expect(result.email).toBe("Please enter a valid email address.");
  });

  it("rejects a non-Gmail email", () => {
    const result = validateContactForm({ ...base, email: "alice@yahoo.com" });
    expect(result.email).toBe("Only Gmail addresses are accepted (e.g. yourname@gmail.com).");
  });

  it("accepts a valid gmail address", () => {
    const result = validateContactForm({ ...base, email: "user@gmail.com" });
    expect(result.email).toBeUndefined();
  });

  it("accepts gmail address case-insensitively", () => {
    const result = validateContactForm({ ...base, email: "User@Gmail.COM" });
    expect(result.email).toBeUndefined();
  });
});

// ─── validateContactForm — message errors ────────────────────────────────────

describe("validateContactForm — message errors", () => {
  it("requires message", () => {
    const result = validateContactForm({ ...base, message: "" });
    expect(result.message).toBe("Message is required.");
  });

  it("rejects a message shorter than 10 characters", () => {
    const result = validateContactForm({ ...base, message: "Hi" });
    expect(result.message).toBe("Message must be at least 10 characters.");
  });

  it("rejects a message longer than 4000 characters", () => {
    const result = validateContactForm({ ...base, message: "x".repeat(4001) });
    expect(result.message).toBe("Message must be 4,000 characters or fewer.");
  });
});

// ─── hasRequiredFields ────────────────────────────────────────────────────────

describe("hasRequiredFields", () => {
  it("returns true for a valid object", () => {
    expect(hasRequiredFields(valid)).toBe(true);
  });

  it("returns false for null", () => {
    expect(hasRequiredFields(null)).toBe(false);
  });

  it("returns false for a non-object", () => {
    expect(hasRequiredFields("string")).toBe(false);
  });

  it("returns false when name is missing", () => {
    expect(hasRequiredFields({ email: "a@gmail.com", message: "hello" })).toBe(false);
  });

  it("returns false when email is missing", () => {
    expect(hasRequiredFields({ name: "Test", message: "hello" })).toBe(false);
  });

  it("returns false when message is missing", () => {
    expect(hasRequiredFields({ name: "Test", email: "a@gmail.com" })).toBe(false);
  });
});
