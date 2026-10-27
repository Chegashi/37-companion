"use client";
import React, { useState } from "react";
import { FiCode, FiCopy, FiFileText, FiPlus } from "react-icons/fi";
import { ago, copyPath, subjectUrl, vscodeUrl, workspaceAction, type useWorkspace } from "./useWorkspace";
import { Badge } from "./ui";

/** Internships and long-form projects aren't code folders. */
const NO_FOLDER = /^(work-experience|startup-experience|part[-_]time|open-project)/;

/** Folder actions: open in VS Code, copy the Mac path, open the subject. */
export function FolderActions({ hostPath, subject }: { hostPath?: string; subject?: string }) {
  return (
    <span className="cg-actions">
      {hostPath && <a className="cg-icon-btn" href={vscodeUrl(hostPath)} title="Open in VS Code" aria-label="Open in VS Code"><FiCode /></a>}
      {hostPath && <button className="cg-icon-btn" onClick={() => copyPath(hostPath)} title={`Copy ${hostPath}`} aria-label="Copy path"><FiCopy /></button>}
      {subject && <a className="cg-icon-btn" href={subjectUrl(subject)} target="_blank" rel="noopener noreferrer" title={`Subject: ${subject}`} aria-label="Open subject"><FiFileText /></a>}
    </span>
  );
}

/** Local folder + subject PDF for one project, with open / start actions. */
export function LocalCell({ slug, ws, allowStart = false }: { slug: string; ws: ReturnType<typeof useWorkspace>; allowStart?: boolean }) {
  const [busy, setBusy] = useState(false);
  const folder = ws.folderOf(slug);
  const subject = ws.subjectOf(slug);
  if (!ws.enabled) return null;

  const start = async () => {
    setBusy(true);
    try { await workspaceAction({ action: "start", slug }); ws.refresh(); }
    catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <span className="cg-actions">
      {folder && <Badge tone="plan" title={folder.hostPath}>{folder.name} · {ago(folder.git?.lastCommitAt ?? folder.lastModified)}</Badge>}
      {!folder && allowStart && !NO_FOLDER.test(slug) && (
        <button className="cg-icon-btn" disabled={busy} onClick={start} title="Start locally: create the folder with its subject" aria-label="Start locally"><FiPlus /></button>
      )}
      <FolderActions hostPath={folder?.hostPath} subject={subject} />
    </span>
  );
}
