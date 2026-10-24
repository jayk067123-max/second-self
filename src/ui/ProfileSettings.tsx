"use client";
import { useRef, useState } from "react";
import { AVATARS, type Profile } from "@/domain/profile";
import { prepareAvatar } from "@/data/profile";
import { usePlannerStore } from "@/data/store";
import { DataPortability } from "./composites/DataPortability";
import { Sheet } from "./Sheet";

export function ProfileSettings({ profile, onSave, onClose, onDemo, onClear }: {
  profile: Profile; onSave: (profile: Profile) => boolean; onClose: () => void; onDemo: () => void; onClear: () => void;
}) {
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const tasks = usePlannerStore(s => s.tasks.length);
  const term = usePlannerStore(s => s.termStartDayKey);
  const setTerm = usePlannerStore(s => s.setTermStart);
  const [termDraft, setTermDraft] = useState(term ?? "");
  const custom = !AVATARS.includes(avatar);
  async function upload(file?: File) {
    if (!file) return; setUploading(true); setError("");
    try { setAvatar(await prepareAvatar(file)); }
    catch (error) { setError(error instanceof Error ? error.message : "上传失败"); }
    finally { setUploading(false); if (input.current) input.current.value = ""; }
  }
  function save() {
    if (!name.trim()) { setError("给自己起个名字吧"); return; }
    if (!onSave({ name: name.trim(), avatar })) { setError("浏览器无法保存，请检查存储空间"); return; }
    setTerm(termDraft || null);
    onClose();
  }
  return <Sheet title="我的设置" onBack={onClose} onClose={onClose} footer={<button className="btn btn-green" disabled={uploading} onClick={save}>保存设置</button>}>
    <section className="profile-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="profile-preview" src={avatar} alt="当前头像预览" />
      <label className="profile-name">用户名<input aria-label="用户名" value={name} maxLength={24} onChange={e => setName(e.target.value)} /></label>
    </section>
    <section className="settings-section"><h3>选个喜欢的自己</h3><div className="avatar-grid">
      {AVATARS.map((src, i) => <button key={src} className="avatar-choice" aria-label={"头像 " + (i+1)} aria-pressed={avatar === src} onClick={() => { setAvatar(src); setError(""); }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" />{avatar === src && <span aria-hidden="true">✓</span>}
      </button>)}
    </div><button className={"upload-avatar" + (custom ? " is-custom" : "")} onClick={() => input.current?.click()} disabled={uploading}>{uploading ? "处理图片…" : custom ? "✓ 已选自定义头像 · 更换" : "＋ 上传自己的图片"}</button>
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label="上传头像" onChange={e => void upload(e.target.files?.[0])} />
    {error && <p className="form-error" role="alert">{error}</p>}</section>
    <section className="settings-section"><h3>日程数据</h3><DataPortability /><div className="settings-actions"><button className="btn btn-green" onClick={onDemo}>载入演示数据</button><button className="btn btn-coral" disabled={!tasks} onClick={onClear}>清空任务</button></div></section>
    <section className="settings-section term-setting"><label htmlFor="term-start">学期开始日</label><input id="term-start" type="date" value={termDraft} onChange={e => setTermDraft(e.target.value)} /></section>
    <p className="settings-footnote">个人资料与日程仅保存在当前浏览器。</p>
  </Sheet>;
}
