"use client";
import { createContext, useContext } from "react";
import type { AccountSnapshot } from "@/domain/account";
import type { AccountSync, SyncStatus } from "@/data/account-sync";
export interface AccountContextValue { snapshot: AccountSnapshot; sync: AccountSync; status: SyncStatus; error: string; logout: () => void }
export const AccountContext = createContext<AccountContextValue | null>(null);
export function useAccount() { const value = useContext(AccountContext); if (!value) throw new Error("账号尚未加载"); return value; }
