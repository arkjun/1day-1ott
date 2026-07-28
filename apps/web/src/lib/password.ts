export type PasswordValidationError =
  | "currentRequired"
  | "minLength"
  | "mismatch"
  | "sameAsCurrent";

export function validatePasswordChange(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
): PasswordValidationError | null {
  if (!currentPassword) return "currentRequired";
  if (newPassword.length < 8) return "minLength";
  if (newPassword !== confirmPassword) return "mismatch";
  if (newPassword === currentPassword) return "sameAsCurrent";
  return null;
}
