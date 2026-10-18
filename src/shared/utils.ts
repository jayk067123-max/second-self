import { clsx, type ClassValue } from "clsx";

/** 合并 className（无副作用纯函数，可单测） */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
