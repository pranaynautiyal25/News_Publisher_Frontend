//changes

import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const LOGO_URL = import.meta.env.VITE_LOGO_URL || "/logo.png";

const CATEGORIES = [
  { id: "1", name: "Film & Animation" },
  { id: "2", name: "Autos & Vehicles" },
  { id: "10", name: "Music" },
  { id: "15", name: "Pets & Animals" },
  { id: "17", name: "Sports" },
  { id: "19", name: "Travel & Events" },
  { id: "20", name: "Gaming" },
  { id: "22", name: "People & Blogs" },
  { id: "23", name: "Comedy" },
  { id: "24", name: "Entertainment" },
  { id: "25", name: "News & Politics" },
  { id: "26", name: "Howto & Style" },
  { id: "27", name: "Education" },
  { id: "28", name: "Science & Technology" },
  { id: "29", name: "Nonprofits & Activism" },
];

function Logo() {
  return <img src={LOGO_URL} alt="Studio logo" className="logo-img" />;
}

// reads the backend's SSE stream and calls onEvent(data) for every message
async function readStream(response, onEvent) {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed (${response.status}).`);
  }

  if (!response.body) {
    throw new Error("The server returned no workflow stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop(); // keep the last, maybe-unfinished chunk for next time

    for (const chunk of chunks) {
      const line = chunk.trim();
      if (line.startsWith("data:")) {
        try {
          onEvent(JSON.parse(line.slice(5).trim()));
        } catch {
          throw new Error("Received an invalid workflow response from the server.");
        }
      }
    }
  }
}

function timeNow() {
  return new Date().toLocaleTimeString([], { hour12: false });
}

export default function Dashboard() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [notes, setNotes] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | loading | uploading | waiting | done
  const [output, setOutput] = useState([]); // newest event goes to the front
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [interrupt, setInterrupt] = useState(null);
  const [threadId, setThreadId] = useState(null);
  const [error, setError] = useState("");

  const nextLogId = useRef(0);

  useEffect(() => {
    fetch(`${API_URL}/auth/me`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(setUser)
      .catch(() => navigate("/"));
  }, [navigate]);

  // payload is the raw node/event data from the backend, shown behind the "View" toggle
  function addOutput(text, payload = null, url = "") {
    const id = nextLogId.current++;
    setOutput((prev) => [{ id, time: timeNow(), text, payload, url }, ...prev]);
  }

  function togglePayload(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleEvent(event) {
    if (event.thread_id) setThreadId(event.thread_id);

    if (event.type === "node_update") {
      if (event.node === "upload_to_youtube" && event.output?.youtube_url) {
        addOutput(`Published to YouTube: ${event.output.youtube_url}`, event, event.output.youtube_url);
        setPhase("loading");
        return;
      }

      addOutput(`${event.node} finished`, event);
      if (event.node === "upload_to_youtube") setPhase("loading"); // upload done, workflow wraps up next
      return;
    }

    if (event.type === "interrupt") {
      setInterrupt(event.payload);
      setPhase("waiting");
      addOutput("waiting on your input", event.payload ?? event);
      return;
    }

    if (event.type === "finished") {
      setPhase("done");
      addOutput(event.youtube_url ? `published - ${<a href >event.youtube_url</a>}` : "workflow finished", event);
      return;
    }

    if (event.type === "error") {
      setPhase("idle");
      setError(event.message || "The workflow failed.");
      addOutput(`error - ${event.message || "The workflow failed."}`, event);
    }
  }

  async function startWorkflow() {
    if (!notes.trim()) return;

    setPhase("loading");
    setOutput([]);
    setExpandedIds(new Set());
    setInterrupt(null);
    setError("");
    addOutput("workflow started");

    try {
      const res = await fetch(`${API_URL}/workflow/start`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initial_input: notes }),
      });

      await readStream(res, handleEvent);
    } catch (err) {
      setPhase("idle");
      setError(err.message || "Could not start the workflow.");
      addOutput(`error - ${err.message || "Could not start the workflow."}`);
    }
  }

  // nextPhase lets the prefilled-upload form show the progress bar instead of the spinner
  async function answerInterrupt(value, nextPhase = "loading") {
    setPhase(nextPhase);
    setInterrupt(null);
    setError("");
    addOutput("sent your answer");

    try {
      const res = await fetch(`${API_URL}/workflow/resume`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: threadId, resume_value: value }),
      });

      await readStream(res, handleEvent);
    } catch (err) {
      setPhase("idle");
      setError(err.message || "Could not resume the workflow.");
      addOutput(`error - ${err.message || "Could not resume the workflow."}`);
    }
  }

  async function logout() {
    await fetch(`${API_URL}/auth/logout`, { method: "POST", credentials: "include" });
    navigate("/");
  }

  function clearCompletedWorkflow() {
    setNotes("");
    setOutput([]);
    setExpandedIds(new Set());
    setInterrupt(null);
    setThreadId(null);
    setError("");
    setPhase("idle");
  }

  const busy = phase === "loading" || phase === "uploading" || phase === "waiting";

  return (
    <div className="page">
      <header className="topbar topbar-3col">
        <Logo />
        <span className="user-name">{user ? user.name : ""}</span>
        <div className="topbar-actions">
          <button
            className="btn btn-ghost"
            onClick={clearCompletedWorkflow}
            disabled={phase !== "done"}
          >
            Clear
          </button>
          <button className="btn btn-ghost" onClick={logout}>Log out</button>
        </div>
      </header>

      <main className="dashboard">
        <div className="phase-banner">
          {phase === "waiting" && <span className="phase-pill phase-waiting">Waiting for you</span>}
          {phase === "done" && <span className="phase-pill phase-done">Done</span>}
        </div>
        {error && <p className="error-message" role="alert">{error}</p>}

        <div className="panels">
          <section className="panel panel-output">
            <h2>Output</h2>
            <div className="output-stack">
              {output.length === 0 && <p className="log-empty">Nothing yet - start a run below.</p>}
              {output.map((line) => (
                <div key={line.id} className="log-line">
                  <div className="log-line-header">
                      <span className="log-line-text">
                        <span className="log-time">{line.time}</span>
                        {line.text}
                      </span>
                      {line.url && (
                        <a
                          className="youtube-link"
                          href={line.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open video
                        </a>
                      )}
                      {
                        // safely resolve the append_changes payload whether it's under `output` (node_update)
                        // or directly attached to the event payload. Use optional chaining to avoid null reads.
                        (
                          line.payload?.output?.append_changes_to_xml_save_payload
                          || line.payload?.append_changes_to_xml_save_payload
                        ) && (
                          <>
                            {(
                              line.payload?.output?.append_changes_to_xml_save_payload?.file_url
                              || line.payload?.append_changes_to_xml_save_payload?.file_url
                            ) && (
                              <a
                                className="file-download-link"
                                href={
                                  line.payload?.output?.append_changes_to_xml_save_payload?.file_url
                                  || line.payload?.append_changes_to_xml_save_payload?.file_url
                                }
                                target="_blank"
                                rel="noreferrer"
                              >
                                Download HTML
                              </a>
                            )}

                            {(
                              line.payload?.output?.append_changes_to_xml_save_payload?.xml_file_url
                              || line.payload?.append_changes_to_xml_save_payload?.xml_file_url
                            ) && (
                              <a
                                className="file-download-link"
                                href={
                                  line.payload?.output?.append_changes_to_xml_save_payload?.xml_file_url
                                  || line.payload?.append_changes_to_xml_save_payload?.xml_file_url
                                }
                                target="_blank"
                                rel="noreferrer"
                              >
                                Download XML
                              </a>
                            )}
                          </>
                        )
                      }
                      {line.payload !== null && (
                      <button
                        type="button"
                        className="log-payload-toggle"
                        onClick={() => togglePayload(line.id)}
                      >
                        {expandedIds.has(line.id) ? "Hide" : "View"}
                      </button>
                    )}
                  </div>
                  {line.payload !== null && expandedIds.has(line.id) && (
                    <pre className="log-payload">{JSON.stringify(line.payload, null, 2)}</pre>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="panel panel-interrupt">
            <h2>Needs your input</h2>
            <div className="interrupt-body">
              <InterruptPanel
                interrupt={interrupt}
                threadId={threadId}
                phase={phase}
                onAnswer={answerInterrupt}
                onError={setError}
              />
            </div>
          </section>
        </div>

        <div className="composer">
          <textarea
            className="notes-input"
            placeholder="Paste your news description here…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={busy}
          />
          <button className="btn btn-primary" onClick={startWorkflow} disabled={!notes.trim() || busy}>
            {phase === "loading" ? "Running…" : "Start"}
          </button>
        </div>
      </main>
    </div>
  );
}

function Spinner({ label }) {
  return (
    <div className="spinner-row">
      <span className="spinner" />
      <span>{label}</span>
    </div>
  );
}

function ProgressBar({ label }) {
  return (
    <div className="progress-row">
      <span>{label}</span>
      <div className="progress-track">
        <div className="progress-fill" />
      </div>
    </div>
  );
}

// shows whichever question fits the shape of the current interrupt, or the
// running / uploading indicator while the workflow is busy between interrupts
function InterruptPanel({ interrupt, threadId, phase, onAnswer, onError }) {
  if (phase === "loading") {
    return (
      <div className="box-status">
        <Spinner label="Workflow running…" />
      </div>
    );
  }

  if (phase === "uploading") {
    return (
      <div className="box-status">
        <ProgressBar label="Uploading to YouTube…" />
      </div>
    );
  }

  if (!interrupt) {
    return (
      <p className="log-empty">
        {phase === "done" ? "Run complete. Start a new one below." : "Nothing to answer right now."}
      </p>
    );
  }

  if (interrupt.channels) {
    return (
      <div className="choice-list">
        <p>{interrupt.message}</p>
        {interrupt.channels.map((c) => (
          <button key={c.id} className="btn btn-choice" onClick={() => onAnswer(c.id)}>{c.name}</button>
        ))}
      </div>
    );
  }

  if (interrupt.languages) {
    return (
      <div className="choice-list">
        <p>{interrupt.message}</p>
        {interrupt.languages.map((lang) => (
          <button key={lang} className="btn btn-choice" onClick={() => onAnswer(lang)}>{lang}</button>
        ))}
      </div>
    );
  }

  if (interrupt.options) {
    return (
      <div className="choice-list">
        <p>{interrupt.message}</p>
        {interrupt.options.map((opt) => (
          <button key={opt.value} className="btn btn-choice" onClick={() => onAnswer(opt.value)}>{opt.label}</button>
        ))}
      </div>
    );
  }

  if (interrupt.type === "file_upload") {
    return <TemplateFileForm onSubmit={onAnswer} onError={onError} threadId={threadId} />;
  }

  if (interrupt.type === "title_article_form" || interrupt.type === "correction_title_article_form") {
    return <ArticleForm payload={interrupt} onSubmit={onAnswer} />;
  }

  if (interrupt.type === "webpage_preview") {
    return <PreviewPanel html={interrupt.html} onAnswer={onAnswer} />;
  }

  if (interrupt.type === "youtube_upload_error") {
    return (
      <div className="choice-list">
        <p className="error-message">YouTube upload failed: {interrupt.message}</p>
        <button className="btn btn-choice" onClick={() => onAnswer({ action: "retry" })}>
          Retry upload
        </button>
        <button className="btn btn-choice" onClick={() => onAnswer({ action: "continue" })}>
          Continue without uploading
        </button>
      </div>
    );
  }

  if ("title" in interrupt) {
    return (
      <UploadForm
        payload={interrupt}
        threadId={threadId}
        onSubmit={(value) => onAnswer(value, "uploading")}
        onError={onError}
      />
    );
  }

  // ask_user_to_continue_interrupt
  return (
    <div className="choice-list">
      <p>{interrupt.message}</p>
      <button className="btn btn-choice" onClick={() => onAnswer("continue")}>Upload to YouTube</button>
      <button className="btn btn-choice btn-quit" onClick={() => onAnswer("quit")}>End the process</button>
    </div>
  );
}

function UploadForm({ payload, threadId, onSubmit, onError }) {
  const [form, setForm] = useState({ ...payload, tags: (payload.tags || []).join(", ") });
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingThumb, setUploadingThumb] = useState(false);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  // sends the picked file to the backend first, then stores the returned path
  async function pickFile(file, kind, field, setFlag) {
    setFlag(true);
    const body = new FormData();
    body.append("thread_id", threadId);
    body.append("kind", kind);
    body.append("file", file);

    try {
      const res = await fetch(`${API_URL}/workflow/upload-file`, { method: "POST", credentials: "include", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.path) throw new Error(data.detail || `Could not upload the ${kind}.`);
      set(field, data.path);
    } catch (err) {
      onError(err.message || `Could not upload the ${kind}.`);
    } finally {
      setFlag(false);
    }
  }

  function submit(e) {
    e.preventDefault();
    if (!form.video_path) return;

    onSubmit({
      ...form,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      made_for_kids: form.made_for_kids === true || form.made_for_kids === "true",
    });
  }

  return (
    <form className="upload-form" onSubmit={submit}>
      <label>Title
        <input value={form.title} onChange={(e) => set("title", e.target.value)} />
      </label>

      <label>Description
        <textarea value={form.description} onChange={(e) => set("description", e.target.value)} />
      </label>

      <label>Tags (comma separated)
        <input value={form.tags} onChange={(e) => set("tags", e.target.value)} />
      </label>

      <label>Privacy
        <select value={form.privacy_status} onChange={(e) => set("privacy_status", e.target.value)}>
          <option value="private">Private</option>
          <option value="public">Public</option>
        </select>
      </label>

      <label>Category
        <select value={form.category_id} onChange={(e) => set("category_id", e.target.value)}>
          {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>

      <label>Made for kids
        <select value={String(form.made_for_kids)} onChange={(e) => set("made_for_kids", e.target.value)}>
          <option value="false">No</option>
          <option value="true">Yes</option>
        </select>
      </label>

      <label>Video file
        <input type="file" accept="video/*" onChange={(e) => e.target.files[0] && pickFile(e.target.files[0], "video", "video_path", setUploadingVideo)} />
        {uploadingVideo && <span className="upload-status">Uploading…</span>}
        {!uploadingVideo && form.video_path && <span className="upload-status">Uploaded</span>}
      </label>

      <label>Thumbnail (optional)
        <input type="file" accept="image/*" onChange={(e) => e.target.files[0] && pickFile(e.target.files[0], "thumbnail", "thumbnail_path", setUploadingThumb)} />
        {uploadingThumb && <span className="upload-status">Uploading…</span>}
        {!uploadingThumb && form.thumbnail_path && <span className="upload-status">Uploaded</span>}
      </label>

      <button className="btn btn-primary" type="submit" disabled={!form.video_path || uploadingVideo || uploadingThumb}>
        Upload to YouTube
      </button>
    </form>
  );
}

function TemplateFileForm({ onSubmit, onError, threadId }) {
  const [files, setFiles] = useState({ xml_file_path: "", css_file_path: "" });
  const [uploading, setUploading] = useState("");

  async function upload(file, endpoint, field) {
    if (!file) return;
    setUploading(field);
    const body = new FormData();
    // include thread_id so the backend's Form(...) validation succeeds
    if (threadId) body.append("thread_id", threadId);
    body.append("file", file);

    try {
      const res = await fetch(`${API_URL}${endpoint}`, { method: "POST", credentials: "include", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !data.file_path) throw new Error(data.message || "File upload failed.");
      setFiles((previous) => ({ ...previous, [field]: data.file_path }));
    } catch (err) {
      onError(err.message || "File upload failed.");
    } finally {
      setUploading("");
    }
  }

  return (
    <form className="upload-form" onSubmit={(event) => { event.preventDefault(); onSubmit(files); }}>
      <p>Upload the XML template and its CSS stylesheet.</p>
      <label>XML template
        <input type="file" accept=".xml,text/xml,application/xml" onChange={(event) => upload(event.target.files[0], "/xml_file/upload", "xml_file_path")} />
        {files.xml_file_path && <span className="upload-status">Uploaded</span>}
      </label>
      <label>CSS stylesheet
        <input type="file" accept=".css,text/css" onChange={(event) => upload(event.target.files[0], "/css_file/upload", "css_file_path")} />
        {files.css_file_path && <span className="upload-status">Uploaded</span>}
      </label>
      <button className="btn btn-primary" type="submit" disabled={!files.xml_file_path || !files.css_file_path || uploading}>Continue</button>
    </form>
  );
}

function ArticleForm({ payload, onSubmit }) {
  const [form, setForm] = useState({ ...payload });
  const set = (field, value) => setForm((previous) => ({ ...previous, [field]: value }));

  return (
    <form className="upload-form" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}>
      <label>Article title
        <input value={form.title || ""} onChange={(event) => set("title", event.target.value)} />
      </label>
      <label>Article
        <textarea value={form.article || ""} onChange={(event) => set("article", event.target.value)} />
      </label>

      <label>Youtube Url
        <textarea value={form.youtube_url || ""} onChange={(event) => set("youtube_url", event.target.value)} />
      </label>
      <label>Title placeholder tag
        <TagSelect tags={form.all_tags} value={form.title_tag} onChange={(value) => set("title_tag", value)} />
      </label>
      <label>Article placeholder tag
        <TagSelect tags={form.all_tags} value={form.article_tag} onChange={(value) => set("article_tag", value)} />
      </label>
      <label>Video placeholder tag
        <TagSelect tags={form.all_tags} value={form.video_tag} onChange={(value) => set("video_tag", value)} />
      </label>
      <label>Recommendations placeholder tag
        <TagSelect tags={form.all_tags} value={form.recommendation_tag} onChange={(value) => set("recommendation_tag", value)} />
      </label>
      <button className="btn btn-primary" type="submit">Preview webpage</button>
    </form>
  );
}

function TagSelect({ tags = [], value = "", onChange }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Do not insert</option>
      {tags.map((tag) => <option key={tag} value={tag}>{`<${tag}>`}</option>)}
    </select>
  );
}

function PreviewPanel({ html, onAnswer }) {
  return (
    <div className="preview-panel">
      <p>Review the generated webpage before saving it.</p>
      <iframe className="webpage-preview" title="Generated webpage preview" srcDoc={html || ""} />
      <div className="preview-actions">
        <button className="btn btn-primary" onClick={() => onAnswer({ action: "approve" })}>Approve and save</button>
        <button className="btn btn-ghost" onClick={() => onAnswer({ action: "edit" })}>Edit content</button>
      </div>
    </div>
  );
}
