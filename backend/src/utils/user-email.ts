export function looksLikeIeeeMemberId(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === "") return false;
  return /^\d{5,}$/.test(trimmed);
}

export function isStoredUserEmail(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === "" || looksLikeIeeeMemberId(trimmed)) return false;
  return trimmed.includes("@");
}

export function getAdminDisplayEmail(user: {
  email?: string;
  uid: string;
}): string | undefined {
  const email = user.email?.trim();
  if (email === undefined || email === "") return undefined;
  if (email === user.uid.trim()) return undefined;
  if (!isStoredUserEmail(email)) return undefined;
  return email;
}
