import { describe, it, expect } from "vitest";
import {
  validateContactForm,
  hasRequiredFields,
  type ContactFormData,
} from "../src/lib/validate";

// ── hasRequiredFields ──────────────────────────────────────────────────────

describe("hasRequiredFields", () => {
  it("returns true when all fields are present strings", () => {
    expect(
      hasRequiredFields({ name: "Alice", email: "a@b.com", message: "Hello" })
    ).toBe(true);
  });

  it("returns false for null", () => {
    expect(hasRequiredFields(null)).toBe(false);
  });

  it("returns false for a non-object primitive", () => {
    expect(hasRequiredFields("string")).toBe(false);
  });

  it("returns false when a required field is missing", () => {
    expect(hasRequiredFields({ name: "Alice", email: "a@b.com" })).toBe(false);
  });

  it("returns false when a field is the wrong type", () => {
    expect(
      hasRequiredFields({ name: 123, email: "a@b.com", message: "Hello" })
    ).toBe(false);
  });
});

// ── validateContactForm — valid data ───────────────────────────────────────

describe("validateContactForm — valid data", () => {
  const valid: ContactFormData = {
    name: "Alice Smith",
    email: "alice@example.com",
    message: "Hi there, I'd love to chat.",
  };

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

// ── validateContactForm — name errors ─────────────────────────────────────

describe("validateContactForm — name errors", () => {
  const base: ContactFormData = {
    name: "Alice",
    email: "alice@example.com",
    message: "Hello there, world.",
  };

  it("errors when name is empty", () => {
    const result = validateContactForm({ ...base, name: "" });
    expect(result.name).toBe("Name is required.");
  });

  it("errors when name is only whitespace", () => {
    const result = validateContactForm({ ...base, name: "   " });
    expect(result.name).toBe("Name is required.");
  });

  it("errors when name is 1 character", () => {
    const result = validateContactForm({ ...base, name: "A" });
    expect(result.name).toBe("Name must be at least 2 characters.");
  });

  it("errors when name exceeds 100 characters", () => {
    const result = validateContactForm({ ...base, name: "A".repeat(101) });
    expect(result.name).toBe("Name must be 100 characters or fewer.");
  });

  it("does not set an error for other fields when only name is invalid", () => {
    const result = validateContactForm({ ...base, name: "" });
    expect(result.email).toBeUndefined();
    expect(result.message).toBeUndefined();
  });
});

// ── validateContactForm — email errors ────────────────────────────────────

describe("validateContactForm — email errors", () => {
  const base: ContactFormData = {
    name: "Alice",
    email: "alice@example.com",
    message: "Hello there, world.",
  };

  it("errors when email is empty", () => {
    const result = validateContactForm({ ...base, email: "" });
    expect(result.email).toBe("Email is required.");
  });

  it("errors for an email with no @", () => {
    const result = validateContactForm({ ...base, email: "notanemail" });
    expect(result.email).toBe("Please enter a valid email address.");
  });

  it("errors for an email with no domain", () => {
    const result = validateContactForm({ ...base, email: "alice@" });
    expect(result.email).toBe("Please enter a valid email address.");
  });

  it("errors for an email with single-char TLD", () => {
    const result = validateContactForm({ ...base, email: "alice@b.c" });
    expect(result.email).toBe("Please enter a valid email address.");
  });

  it("accepts a subdomain email", () => {
    const result = validateContactForm({ ...base, email: "alice@mail.example.co.uk" });
    expect(result.email).toBeUndefined();
  });

  it("errors when email exceeds 254 characters", () => {
    const long = "a".repeat(244) + "@example.com"; // 256 chars
    const result = validateContactForm({ ...base, email: long });
    expect(result.email).toBe("Email address is too long.");
  });
});

// ── validateContactForm — message errors ──────────────────────────────────

describe("validateContactForm — message errors", () => {
  const base: ContactFormData = {
    name: "Alice",
    email: "alice@example.com",
    message: "Hello there, world.",
  };

  it("errors when message is empty", () => {
    const result = validateContactForm({ ...base, message: "" });
    expect(result.message).toBe("Message is required.");
  });

  it("errors when message is only whitespace", () => {
    const result = validateContactForm({ ...base, message: "   " });
    expect(result.message).toBe("Message is required.");
  });

  it("errors when message is fewer than 10 characters", () => {
    const result = validateContactForm({ ...base, message: "Hi" });
    expect(result.message).toBe("Message must be at least 10 characters.");
  });

  it("errors when message exceeds 4000 characters", () => {
    const result = validateContactForm({ ...base, message: "x".repeat(4001) });
    expect(result.message).toBe("Message must be 4,000 characters or fewer.");
  });
});

// ── validateContactForm — multiple errors ─────────────────────────────────

describe("validateContactForm — multiple errors at once", () => {
  it("returns errors for all invalid fields simultaneously", () => {
    const result = validateContactForm({ name: "", email: "bad", message: "" });
    expect(result.name).toBeDefined();
    expect(result.email).toBeDefined();
    expect(result.message).toBeDefined();
  });
});
