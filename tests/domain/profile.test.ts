import { describe, expect, it } from "vitest";
import { AVATARS, DEFAULT_PROFILE, normalizeProfile } from "@/domain/profile";
describe("local profile validation",()=>{
  it("accepts the six bundled avatars and trims the name",()=>{
    for(const avatar of AVATARS)expect(normalizeProfile({name:"  我的日程  ",avatar})).toEqual({name:"我的日程",avatar});
  });
  it("rejects remote, script and SVG avatar sources",()=>{
    for(const avatar of ["https://example.com/tracker.jpg","javascript:alert(1)","data:image/svg+xml;base64,PHN2Zz4="])expect(normalizeProfile({avatar}).avatar).toBe(DEFAULT_PROFILE.avatar);
  });
  it("accepts a local raster data URL but rejects oversized storage",()=>{
    const avatar="data:image/jpeg;base64,aGVsbG8=";expect(normalizeProfile({avatar}).avatar).toBe(avatar);
    expect(normalizeProfile({avatar:"data:image/jpeg;base64,"+"A".repeat(500001)}).avatar).toBe(DEFAULT_PROFILE.avatar);
  });
  it("falls back safely from missing or malformed profile records",()=>{
    for(const value of [null,42,"name",{name:"  ",avatar:false}])expect(normalizeProfile(value)).toEqual(DEFAULT_PROFILE);
    expect(normalizeProfile({name:"a".repeat(100)}).name.length).toBe(24);
  });
});
