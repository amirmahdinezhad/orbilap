import { ErrorToast } from "./Toast";
import { useEffect, useRef, useState, type RefObject } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { FileIcon, KeyIcon, RefreshIcon, TickIcon, TrashIcon } from "../icons";
import { Button } from "./ui/button";

export type AuthFileSelection = { name: string; credentials: string } | { name: string; path: string };

export type AuthFileCandidate = { name: string; file: AuthFileSelection | null; error?: string };

interface Props {
  onFiles?: (files: AuthFileCandidate[]) => void;
  dropTargetRef?: RefObject<HTMLElement | null>;
  value: AuthFileSelection | null;
  fileLabel?: string;
  disabled: boolean;
  onChange: (file: AuthFileSelection | null) => void;
  onReadingChange: (reading: boolean) => void;
}

// Serialize mount/cleanup notifications, including StrictMode and rapid tab changes.
let panelUpdates: Promise<unknown> = Promise.resolve();
function setPanelFileImport(active: boolean): Promise<unknown> {
  panelUpdates = panelUpdates.catch(() => {}).then(() => invoke("set_panel_file_import", { active }));
  return panelUpdates;
}

/** Select a local JSON file, including Finder drops intercepted by Tauri's webview. */
export function AuthFileInput({ value, disabled, onChange, onReadingChange, fileLabel = "auth.json", onFiles, dropTargetRef }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const zone = useRef<HTMLDivElement>(null);
  const reader = useRef<FileReader | null>(null);
  const reading = useRef(false);
  const latest = useRef({ disabled, onChange, onReadingChange, fileLabel, onFiles, dropTargetRef });
  latest.current = { disabled, onChange, onReadingChange, fileLabel, onFiles, dropTargetRef };
  const [dragging, setDragging] = useState(false);
  const [dragCount, setDragCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    let mounted = true;
    void setPanelFileImport(true).catch(() => {
      if (mounted) setError("Couldn't keep the import panel open. Close it and choose Import auth.json to try again.");
    });
    return () => { mounted = false; void setPanelFileImport(false).catch(() => {}); };
  }, []);

  useEffect(() => () => {
    const pending = reader.current;
    if (pending) {
      pending.onload = pending.onerror = pending.onloadend = null;
      pending.abort();
    }
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    let unlisten: (() => void) | undefined;
    // Wry 0.57's macOS draggingLocation is already in logical AppKit points.
    // Other platforms report physical pixels through this same Tauri payload.
    void getCurrentWebview().onDragDropEvent(({ payload }) => {
      if (!active) return;
      if (payload.type === "leave" || latest.current.disabled || reading.current) {
        setDragging(false); setDragCount(0);
        return;
      }
      if ("paths" in payload && payload.paths.length) setDragCount(payload.paths.length);
      const bounds = (latest.current.dropTargetRef?.current ?? zone.current)?.getBoundingClientRect();
      const scale = /Macintosh|Mac OS X/.test(navigator.userAgent) ? 1 : window.devicePixelRatio;
      const x = payload.position.x / scale;
      const y = payload.position.y / scale;
      const inside = !!bounds && x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
      setDragging(inside && payload.type !== "drop");
      if (payload.type !== "drop" || !inside) return;
      setDragCount(0);
      if (latest.current.onFiles) {
        setError(payload.paths.length > 20 ? "Choose up to 20 files at a time." : null);
        latest.current.onFiles(payload.paths.slice(0, 20).map(path => {
          const name = path.split(/[\\/]/).pop() ?? "";
          return /\.json$/i.test(name) ? { name, file: { name, path } } : { name, file: null, error: "Choose a JSON file." };
        }));
        return;
      }
      latest.current.onChange(null);
      if (payload.paths.length !== 1) {
        setError(`Choose one ${latest.current.fileLabel} file at a time.`);
        return;
      }
      const path = payload.paths[0];
      const name = path.split(/[\\/]/).pop() ?? "";
      if (!/\.json$/i.test(name)) {
        setError("Choose a JSON file containing your account login.");
        return;
      }
      setError(null);
      latest.current.onChange({ name, path });
    }).then((stop) => { if (active) unlisten = stop; else stop(); })
      .catch(() => { if (active) setError("Drag and drop is unavailable. Use Choose file instead."); });
    return () => { active = false; unlisten?.(); };
  }, []);

  const readMultiple = async (files: FileList | File[]) => {
    if (latest.current.disabled || reading.current) return;
    setDragging(false); setError(files.length > 20 ? "Choose up to 20 files at a time." : null);
    reading.current = true; setLoading(true); latest.current.onReadingChange(true);
    const candidates: AuthFileCandidate[] = [];
    for (const file of Array.from(files).slice(0, 20)) {
      if (!/\.json$/i.test(file.name)) { candidates.push({ name: file.name, file: null, error: "Choose a JSON file." }); continue; }
      if (file.size > 256 * 1024) { candidates.push({ name: file.name, file: null, error: "Use a file smaller than 256 KB." }); continue; }
      const result = await new Promise<AuthFileCandidate>(resolve => {
        const next = new FileReader(); reader.current = next;
        next.onload = () => {
          const credentials = String(next.result ?? "");
          try { JSON.parse(credentials); resolve({ name: file.name, file: { name: file.name, credentials } }); }
          catch { resolve({ name: file.name, file: null, error: "This is not valid JSON." }); }
        };
        next.onerror = () => resolve({ name: file.name, file: null, error: "Couldn’t read this file." });
        next.readAsText(file);
      });
      candidates.push(result);
    }
    reader.current = null; reading.current = false; setLoading(false);
    latest.current.onReadingChange(false); latest.current.onFiles?.(candidates);
  };

  const readFiles = (files: FileList | File[]) => {
    if (disabled || reading.current) return;
    if (onFiles) { void readMultiple(files); return; }
    setDragging(false);
    setError(null);
    onChange(null);
    if (files.length !== 1) {
      setError(`Choose one ${fileLabel} file at a time.`);
      return;
    }
    const file = files[0];
    if (!/\.json$/i.test(file.name)) {
      setError("Choose a JSON file containing your account login.");
      return;
    }
    if (file.size > 256 * 1024) {
      setError(`Use a ${fileLabel} smaller than 256 KB.`);
      return;
    }
    const next = new FileReader();
    reader.current = next;
    reading.current = true;
    setLoading(true);
    onReadingChange(true);
    next.onload = () => {
      const credentials = String(next.result ?? "");
      try { JSON.parse(credentials); }
      catch { setError(`This is not valid ${latest.current.fileLabel} JSON.`); return; }
      latest.current.onChange({ name: file.name, credentials });
    };
    next.onerror = () => setError("Couldn't read this file. Choose it again.");
    next.onloadend = () => {
      reading.current = false;
      reader.current = null;
      setLoading(false);
      latest.current.onReadingChange(false);
    };
    next.readAsText(file);
  };

  return <div className="auth-file-input">
    <input ref={input} type="file" multiple={!!onFiles} accept=".json,application/json" hidden aria-label={`Choose ${fileLabel} file`} disabled={disabled || loading}
      onChange={(event) => { if (event.target.files?.length) readFiles(event.target.files); event.target.value = ""; }} />
    <div ref={zone} role="group" aria-label="Auth file upload" aria-disabled={disabled || loading} aria-busy={loading}
      className={`auth-file-drop${dragging ? " is-dragging" : ""}${value ? " is-filled" : ""}${error ? " has-error" : ""}`}
      onDragEnter={(event) => { event.preventDefault(); if (!disabled && !reading.current && event.dataTransfer.types.includes("Files")) { setDragging(true); setDragCount(event.dataTransfer.items?.length || event.dataTransfer.files?.length || 0); } }}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = disabled || reading.current ? "none" : "copy"; if (!disabled && !reading.current && event.dataTransfer.types.includes("Files")) { setDragging(true); setDragCount(event.dataTransfer.items?.length || event.dataTransfer.files?.length || 0); } }}
      onDragLeave={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
      onDrop={(event) => { event.preventDefault(); if (isTauri()) return; readFiles(event.dataTransfer.files); }}>
      <span className="auth-file-symbol" aria-hidden="true">{value && !dragging ? <TickIcon size={24} /> : <KeyIcon size={24} />}</span>
      <div className="auth-file-caption" role="status">
        <strong>{loading ? "Reading file…" : dragging ? onFiles ? dragCount ? `Drop ${dragCount} ${dragCount === 1 ? "file" : "files"} to add` : "Drop files to add" : "Drop to select this file" : value ? value.name : onFiles ? "Drop login files here" : `Drop ${fileLabel} here`}</strong>
        <span>{dragging ? onFiles ? "Release to add them to your list" : "Release to select your login" : value ? "Ready to verify" : onFiles ? "Select up to 20 JSON files from your Mac" : "or choose a JSON file from your Mac"}</span>
      </div>
      <div className="auth-file-actions">
        <Button size={value ? "icon" : "sm"} variant={value ? "ghost" : "default"} aria-label={value ? "Choose another file" : onFiles ? "Add files" : "Choose file"} disabled={disabled || loading} onClick={() => input.current?.click()}>{value ? <RefreshIcon size={17} /> : <><FileIcon size={16} />{onFiles ? "Add files" : "Choose file"}</>}</Button>
        {value ? <Button className="auth-file-remove" size="icon" variant="destructive" aria-label="Remove file" title="Remove file" disabled={disabled || loading} onClick={() => { onChange(null); setError(null); }}><TrashIcon size={17} /></Button> : null}
      </div>
    </div>
    {error ? <ErrorToast message={error} /> : null}
  </div>;
}
