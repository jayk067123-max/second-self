export const AVATARS = Array.from({ length: 6 }, (_, i) => `/avatars/avatar-${i + 1}.webp`);
export interface Profile { name: string; avatar: string }
export const DEFAULT_PROFILE: Profile = { name: "今天的我", avatar: AVATARS[0]! };

export function normalizeProfile(value: unknown): Profile {
  const saved = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const name = typeof saved.name === "string" ? saved.name.trim().slice(0, 24) : "";
  const avatar = typeof saved.avatar === "string" && (AVATARS.includes(saved.avatar) ||
    (saved.avatar.length <= 500_000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(saved.avatar)))
    ? saved.avatar : DEFAULT_PROFILE.avatar;
  return { name: name || DEFAULT_PROFILE.name, avatar };
}
