"use client";
import { useEffect, useState } from "react";
import { DEFAULT_PROFILE, normalizeProfile, type Profile } from "@/domain/profile";

const KEY = "second-self/profile";
export function useProfile() {
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  useEffect(() => {
    function read() {
      try { setProfile(normalizeProfile(JSON.parse(localStorage.getItem(KEY) ?? "null"))); }
      catch { setProfile(DEFAULT_PROFILE); }
    }
    queueMicrotask(read);
    const sync = (event: StorageEvent) => { if (event.key === KEY || event.key === null) read(); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  function save(next: Profile): boolean {
    const normalized = normalizeProfile(next);
    try { localStorage.setItem(KEY, JSON.stringify(normalized)); setProfile(normalized); return true; }
    catch { return false; }
  }
  return { profile, save };
}

export async function prepareAvatar(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("请选择 JPG、PNG 或 WebP 图片");
  if (file.size > 10_000_000) throw new Error("图片请小于 10 MB");
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error("图片无法读取，请换一张")); img.src = url;
    });
    const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 256;
    const context = canvas.getContext("2d"); if (!context) throw new Error("图片处理失败");
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    context.fillStyle = "white"; context.fillRect(0, 0, 256, 256);
    context.drawImage(image, (image.naturalWidth-side)/2, (image.naturalHeight-side)/2, side, side, 0, 0, 256, 256);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally { URL.revokeObjectURL(url); }
}
