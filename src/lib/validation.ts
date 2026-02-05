import { z } from "zod";

// Profile validation schemas
export const usernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be at most 20 characters")
  .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores")
  .transform((val) => val.toLowerCase());

export const fullNameSchema = z
  .string()
  .min(2, "Full name must be at least 2 characters")
  .max(100, "Full name must be at most 100 characters")
  .regex(/^[a-zA-Z\s'-]+$/, "Name can only contain letters, spaces, hyphens, and apostrophes")
  .transform((val) => val.trim());

export const bvnSchema = z
  .string()
  .length(11, "BVN must be exactly 11 digits")
  .regex(/^\d{11}$/, "BVN must contain only digits")
  .optional()
  .or(z.literal(""));

export const bankAccountSchema = z
  .string()
  .length(10, "Account number must be exactly 10 digits")
  .regex(/^\d{10}$/, "Account number must contain only digits")
  .optional()
  .or(z.literal(""));

export const bankNameSchema = z
  .string()
  .min(1, "Please select a bank")
  .max(100, "Bank name is too long")
  .optional()
  .or(z.literal(""));

// Support ticket validation
export const supportTicketSchema = z.object({
  subject: z
    .string()
    .min(5, "Subject must be at least 5 characters")
    .max(200, "Subject must be at most 200 characters")
    .transform((val) => val.trim()),
  category: z
    .string()
    .min(1, "Please select a category")
    .max(50, "Invalid category"),
  description: z
    .string()
    .min(20, "Description must be at least 20 characters")
    .max(2000, "Description must be at most 2000 characters")
    .transform((val) => val.trim()),
});

// Admin action validation
export const adminActionReasonSchema = z
  .string()
  .min(5, "Reason must be at least 5 characters")
  .max(500, "Reason must be at most 500 characters")
  .transform((val) => val.trim());

// Onboarding profile update schema
export const onboardingProfileSchema = z.object({
  fullName: fullNameSchema,
  username: usernameSchema,
  bvn: bvnSchema,
  bankName: bankNameSchema,
  accountNumber: bankAccountSchema,
});

// Profile username update schema
export const usernameUpdateSchema = z.object({
  username: usernameSchema,
});

// Validation result type with discriminated union
type ValidationSuccess<T> = { success: true; data: T };
type ValidationError = { success: false; error: string };
type ValidationResult<T> = ValidationSuccess<T> | ValidationError;

// Validation helper function
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): ValidationResult<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error.errors[0]?.message || "Validation failed" };
}
