import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { errorStatus, userToken } from "@/utils/intra";
import { SUBJECTS_DIR, WORKSPACE_DIR, WORKSPACE_ENABLED, insideWorkspace, matchSlug, scanWorkspace } from "@/utils/workspace";

export const runtime = "nodejs";

/**
 * GET  /api/workspace                    → folders, git state and subject PDFs of the local 1337 workspace
 * GET  /api/workspace?subject=<file>     → that subject PDF
 * POST /api/workspace { action: "start", slug, name }         → create <workspace>/<name> with its subject + README
 * Disabled (GET → { enabled: false }, POST → 404) unless WORKSPACE_DIR is set.
 */
export const GET = async (request: NextRequest) => {
  try {
    await userToken(request);
    if (!WORKSPACE_ENABLED) return NextResponse.json({ enabled: false, dir: "", hostDir: "", folders: [], subjects: [] });
    const subject = request.nextUrl.searchParams.get("subject");
    if (subject) {
      const file = path.basename(subject);
      if (!file.toLowerCase().endsWith(".pdf")) return NextResponse.json({ error: "Not a PDF" }, { status: 400 });
      const data = await fs.readFile(path.join(SUBJECTS_DIR, file));
      return new NextResponse(new Uint8Array(data), {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${encodeURIComponent(file)}"` },
      });
    }
    return NextResponse.json(await scanWorkspace());
  } catch (error) {
    console.error("workspace:", error);
    const missing = (error as NodeJS.ErrnoException)?.code === "ENOENT";
    return NextResponse.json({ error: missing ? `Not found in ${WORKSPACE_DIR}` : error instanceof Error ? error.message : "Failed" },
      { status: missing ? 404 : errorStatus(error) });
  }
};

export const POST = async (request: NextRequest) => {
  try {
    await userToken(request);
    if (!WORKSPACE_ENABLED) return NextResponse.json({ error: "Workspace is disabled" }, { status: 404 });
    const body = (await request.json()) as { action: string; slug?: string; name?: string };

    if (body.action === "start" && body.slug) {
      const name = (body.name || body.slug).replace(/[^\w.-]+/g, "_");
      const target = insideWorkspace(name);
      if (!target) return NextResponse.json({ error: "Invalid folder name" }, { status: 400 });
      try {
        await fs.mkdir(target);
      } catch {
        return NextResponse.json({ error: `${name} already exists` }, { status: 409 });
      }
      const subject = (await fs.readdir(SUBJECTS_DIR).catch(() => [] as string[])).find((f) => f.toLowerCase().endsWith(".pdf") && matchSlug(f) === body.slug);
      if (subject) await fs.copyFile(path.join(SUBJECTS_DIR, subject), path.join(target, "en.subject.pdf"));
      await fs.writeFile(path.join(target, "README.md"), `# ${name}\n\n42 project \`${body.slug}\` — https://projects.intra.42.fr/projects/${body.slug}\n`);
      return NextResponse.json({ ok: true, path: target, subject: subject ?? null });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("workspace:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: errorStatus(error) });
  }
};
