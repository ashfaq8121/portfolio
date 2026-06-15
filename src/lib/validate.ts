/**
 * validate.ts
 *
 * Pure validation functions shared between the contact form client script
 * and the Worker API handler. No browser or Cloudflare APIs — plain TS.
 */

export interface ContactFormData {
  name: string;
  email: string;
  message: string;
}

export type ValidationErrors = Partial<Record<keyof ContactFormData, string>>;

// General email validation (RFC 5322 simplified)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate a contact form submission.
 * Returns an object of field -> error message.
 * An empty object means the data is valid.
 */
export function validateContactForm(data: ContactFormData): ValidationErrors {
  const errors: ValidationErrors = {};

  const name = data.name?.trim() ?? "";
  if (!name) {
    errors.name = "Name is required.";
  } else if (name.length < 2) {
    errors.name = "Name must be at least 2 characters.";
  } else if (name.length > 100) {
    errors.name = "Name must be 100 characters or fewer.";
  }

  const email = data.email?.trim() ?? "";
  if (!email) {
    errors.email = "Email is required.";
  } else if (email.length > 254) {
    errors.email = "Email address is too long.";
  } else if (!EMAIL_RE.test(email)) {
    errors.email = "Please enter a valid email address.";
  }

  const message = data.message?.trim() ?? "";
  if (!message) {
    errors.message = "Message is required.";
  } else if (message.length < 10) {
    errors.message = "Message must be at least 10 characters.";
  } else if (message.length > 4000) {
    errors.message = "Message must be 4,000 characters or fewer.";
  }

  return errors;
}

/**
 * Returns true if all fields are present and non-empty strings.
 * Useful for a quick pre-check before running full validation.
 */
export function hasRequiredFields(data: unknown): data is ContactFormData {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;

  return (
    typeof d.name === "string" &&
    typeof d.email === "string" &&
    typeof d.message === "string"
  );
}