"use client";
import { useEffect, useRef, useState, type DragEvent } from "react";
export function ImageIntake({busy,onSubmit}:{busy:boolean;onSubmit:(file:File,hint:string)=>void}) {
  const [file,setFile]=useState<File|null>(null),[url,setUrl]=useState<string|null>(null),[hint,setHint]=useState(""),[error,setError]=useState("");
  const input=useRef<HTMLInputElement>(null);
  useEffect(()=>()=>{if(url)URL.revokeObjectURL(url);},[url]);
  function pick(next?:File){
    if(!next||busy)return;
    if(!["image/png","image/jpeg","image/webp"].includes(next.type)){setError("请选择 JPG、PNG 或 WebP 图片");return;}
    if(next.size>20_000_000){setError("图片请小于 20 MB");return;}
    setError("");setFile(next);setUrl(URL.createObjectURL(next));
  }
  function drop(e:DragEvent<HTMLDivElement>){e.preventDefault();pick(e.dataTransfer.files[0]);}
  return <div className="image-intake"><div className="image-drop" onDragOver={e=>e.preventDefault()} onDrop={drop}>
    {url?<>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="待识别的图片预览" />
      <span className="image-filename">{file?.name}</span>
    </>:<><span className="image-upload-symbol" aria-hidden="true">＋</span><p>放一张通知或课表截图</p></>}
    <div className="settings-actions"><button className="btn btn-green" onClick={()=>input.current?.click()} disabled={busy}>{file?"更换图片":"选择图片"}</button>{file&&<button className="btn" onClick={()=>{setFile(null);setUrl(null);if(input.current)input.current.value="";}} disabled={busy}>移除</button>}</div>
    <input ref={input} type="file" hidden accept="image/png,image/jpeg,image/webp" aria-label="选择日程图片" onChange={e=>pick(e.target.files?.[0])}/>
    </div><label className="image-hint">补充信息<input aria-label="图片补充信息" placeholder="可选" value={hint} maxLength={500} onChange={e=>setHint(e.target.value)} disabled={busy}/></label>
    {error&&<p className="form-error" role="alert">{error}</p>}<button className="btn btn-green" disabled={!file||busy} onClick={()=>file&&onSubmit(file,hint)}>{busy?"识别中…":"识别这张图"}</button>
  </div>;
}
