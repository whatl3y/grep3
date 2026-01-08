import path from "path";
import { Request, Response } from "express";
import { getAddress, isAddress } from "ethers";
import { mkdir, readFile, readdir, stat } from "fs/promises";
import { GitClient, defaultRootDir, FileManagement } from "@grep3/core";
import { IRoute } from "./index";
import log from "../logger";

const fileMgmt = FileManagement();

// File browser utilities
const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".markdown", ".json", ".js", ".ts", ".jsx", ".tsx", ".css", ".scss", ".sass", ".less",
  ".html", ".htm", ".xml", ".svg", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf", ".env",
  ".sh", ".bash", ".zsh", ".fish", ".ps1", ".bat", ".cmd",
  ".py", ".rb", ".php", ".java", ".c", ".cpp", ".h", ".hpp", ".cs", ".go", ".rs", ".swift", ".kt", ".scala",
  ".sql", ".graphql", ".prisma", ".vue", ".svelte", ".astro",
  ".gitignore", ".gitattributes", ".editorconfig", ".prettierrc", ".eslintrc", ".babelrc",
  ".dockerfile", ".makefile", ".gradle", ".lock", ".log",
]);

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".svg"]);

function getFileType(filename: string): "text" | "image" | "binary" {
  const ext = path.extname(filename).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (TEXT_EXTENSIONS.has(ext) || !ext) return "text";
  return "binary";
}

function getLanguageFromFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const langMap: { [key: string]: string } = {
    ".js": "javascript", ".jsx": "javascript", ".ts": "typescript", ".tsx": "typescript",
    ".py": "python", ".rb": "ruby", ".php": "php", ".java": "java",
    ".c": "c", ".cpp": "cpp", ".h": "c", ".hpp": "cpp", ".cs": "csharp",
    ".go": "go", ".rs": "rust", ".swift": "swift", ".kt": "kotlin", ".scala": "scala",
    ".html": "html", ".htm": "html", ".xml": "xml", ".svg": "xml",
    ".css": "css", ".scss": "scss", ".sass": "sass", ".less": "less",
    ".json": "json", ".yaml": "yaml", ".yml": "yaml", ".toml": "toml",
    ".md": "markdown", ".markdown": "markdown",
    ".sh": "bash", ".bash": "bash", ".zsh": "bash",
    ".sql": "sql", ".graphql": "graphql",
    ".dockerfile": "dockerfile", ".makefile": "makefile",
  };
  return langMap[ext] || "plaintext";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// HTML generators for file browser UI
function renderImageViewer(filename: string, fileSize: number, mimeType: string, base64Content: string): string {
  return `
    <div class="file-viewer">
      <div class="file-viewer-header">
        <div class="file-viewer-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          ${escapeHtml(filename)}
        </div>
        <div class="file-viewer-meta">${formatFileSize(fileSize)}</div>
      </div>
      <div class="file-viewer-content">
        <div class="image-preview">
          <img src="data:${mimeType};base64,${base64Content}" alt="${escapeHtml(filename)}" />
        </div>
      </div>
    </div>
  `;
}

function renderBinaryViewer(filename: string, fileSize: number): string {
  return `
    <div class="file-viewer">
      <div class="file-viewer-header">
        <div class="file-viewer-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          ${escapeHtml(filename)}
        </div>
        <div class="file-viewer-meta">${formatFileSize(fileSize)}</div>
      </div>
      <div class="file-viewer-content">
        <div class="binary-notice">
          <svg class="binary-notice-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <div class="binary-notice-title">Binary file</div>
          <div class="binary-notice-text">This file cannot be displayed as text.</div>
        </div>
      </div>
    </div>
  `;
}

function renderCodeViewer(filename: string, fileSize: number, language: string, content: string): string {
  const lines = content.split("\n");
  const lineNumbersHtml = lines.map((_: string, i: number) => `<span class="line-number">${i + 1}</span>`).join("\n");

  return `
    <div class="file-viewer">
      <div class="file-viewer-header">
        <div class="file-viewer-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          ${escapeHtml(filename)}
        </div>
        <div class="file-viewer-meta">${lines.length} lines · ${formatFileSize(fileSize)}</div>
      </div>
      <div class="file-viewer-content">
        <div class="code-container code-with-lines">
          <div class="line-numbers">${lineNumbersHtml}</div>
          <div class="code-wrapper">
            <pre><code class="language-${language}">${escapeHtml(content)}</code></pre>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderErrorState(title: string, message: string): string {
  return `
    <div class="file-viewer">
      <div class="error-state">
        <svg class="error-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <div class="error-state-title">${escapeHtml(title)}</div>
        <div class="error-state-text">${escapeHtml(message)}</div>
      </div>
    </div>
  `;
}

function renderEmptyState(): string {
  return `
    <div class="file-list">
      <div class="empty-state">
        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <div class="empty-state-title">Empty directory</div>
        <div class="empty-state-text">This directory has no files.</div>
      </div>
    </div>
  `;
}

function renderFileList(entries: Array<{ name: string; isDir: boolean; size?: number }>, basePath: string): string {
  let itemsHtml = "";
  entries.forEach((entry, index) => {
    const icon = entry.isDir
      ? `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;

    const href = entry.isDir ? `${basePath}/${entry.name}/` : `${basePath}/${entry.name}`;
    const sizeDisplay = entry.size !== undefined ? formatFileSize(entry.size) : "";

    itemsHtml += `
      <a href="${href}" class="file-item" style="animation-delay: ${index * 0.02}s">
        <div class="file-info">
          <span class="file-icon ${entry.isDir ? "folder" : "file"}">${icon}</span>
          <span class="file-name">${escapeHtml(entry.name)}</span>
        </div>
        <span class="file-size">${sizeDisplay}</span>
      </a>
    `;
  });

  return `
    <div class="file-list">
      <div class="file-list-header">
        <span>Name</span>
        <span>Size</span>
      </div>
      ${itemsHtml}
    </div>
  `;
}

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes: { [key: string]: string } = {
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".bmp": "image/bmp",
  };
  return mimeTypes[ext] || "image/jpeg";
}

// Main file browser handler - shared logic for both routes
async function handleViewRepo(req: Request, res: Response, filePath: string) {
  try {
    const { address, repo } = req.params;

    // Validate address
    if (!isAddress(address)) {
      return res.status(404).send("Invalid address");
    }
    const checksumAddress = getAddress(address);

    // Working directory for cloned repos (separate from bare repos)
    const repoNameClean = repo.replace(/\.git$/, "");
    const repoName = `${repoNameClean}.git`;
    const workingDir = path.join(defaultRootDir, checksumAddress, `${repoNameClean}-working`);

    // Clone/pull the repo if needed
    if (!(await fileMgmt.doesDirOrFileExist(workingDir))) {
      await mkdir(workingDir, { recursive: true });
      const gitClient = GitClient(checksumAddress, repoName, workingDir);
      try {
        await gitClient.pullRepo();
      } catch (err) {
        log.error("Failed to clone repo", err);
        return res.status(404).send("Repository not found");
      }
    }

    // Read the template (templates are at app root level, not in dist)
    const template = await readFile(
      path.join(__dirname, "..", "..", "templates", "file-browser.html"),
      "utf-8"
    );

    // Build breadcrumb
    const pathParts = filePath.split("/").filter(Boolean);
    let breadcrumbHtml = `<a href="/view/${checksumAddress}/${repoNameClean}/" class="breadcrumb-item">${repoNameClean}</a>`;

    let currentPath = "";
    for (let i = 0; i < pathParts.length; i++) {
      currentPath += "/" + pathParts[i];
      const isLast = i === pathParts.length - 1;
      breadcrumbHtml += `<span class="breadcrumb-sep">/</span>`;
      if (isLast) {
        breadcrumbHtml += `<span class="breadcrumb-item active">${escapeHtml(pathParts[i])}</span>`;
      } else {
        breadcrumbHtml += `<a href="/view/${checksumAddress}/${repoNameClean}${currentPath}/" class="breadcrumb-item">${escapeHtml(pathParts[i])}</a>`;
      }
    }

    // Use filesystem to read files from cloned repository
    const targetPath = path.join(workingDir, filePath);
    let contentHtml = "";

    try {
      const stats = await stat(targetPath);

      if (stats.isFile()) {
        // It's a file - show file contents
        const filename = path.basename(filePath);
        const fileType = getFileType(filename);
        const fileSize = stats.size;

        try {
          if (fileType === "image") {
            const fileContent = await readFile(targetPath);
            const base64Content = fileContent.toString("base64");
            const mimeType = getMimeType(filename);
            contentHtml = renderImageViewer(filename, fileSize, mimeType, base64Content);
          } else if (fileType === "binary") {
            contentHtml = renderBinaryViewer(filename, fileSize);
          } else {
            const fileContent = await readFile(targetPath, "utf-8");
            const language = getLanguageFromFilename(filename);
            contentHtml = renderCodeViewer(filename, fileSize, language, fileContent);
          }
        } catch {
          contentHtml = renderErrorState("Unable to read file", "This file could not be read from the repository.");
        }
      } else if (stats.isDirectory()) {
        // It's a directory - list contents
        const entries: Array<{ name: string; isDir: boolean; size?: number }> = [];

        try {
          const dirContents = await readdir(targetPath, { withFileTypes: true });

          for (const dirent of dirContents) {
            // Skip hidden files and .git directory
            if (dirent.name.startsWith(".")) continue;

            const isDir = dirent.isDirectory();
            let size: number | undefined;

            if (!isDir) {
              try {
                const fileStat = await stat(path.join(targetPath, dirent.name));
                size = fileStat.size;
              } catch {
                // Ignore size errors
              }
            }

            entries.push({ name: dirent.name, isDir, size });
          }
        } catch {
          // Empty directory or error
        }

        // Sort: directories first, then files, alphabetically
        entries.sort((a, b) => {
          if (a.isDir && !b.isDir) return -1;
          if (!a.isDir && b.isDir) return 1;
          return a.name.localeCompare(b.name);
        });

        if (entries.length === 0) {
          contentHtml = renderEmptyState();
        } else {
          const basePath = `/view/${checksumAddress}/${repoNameClean}${filePath ? "/" + filePath : ""}`;
          contentHtml = renderFileList(entries, basePath);
        }
      }
    } catch (fsErr: unknown) {
      log.error("Filesystem error in file browser", fsErr);
      contentHtml = renderErrorState("Path not found", "The requested path does not exist in this repository.");
    }

    // Render template
    const addressShort = `${checksumAddress.slice(0, 6)}...${checksumAddress.slice(-4)}`;
    const html = template
      .replace(/\{\{REPO_NAME\}\}/g, escapeHtml(repoNameClean))
      .replace(/\{\{ADDRESS_SHORT\}\}/g, addressShort)
      .replace(/\{\{BREADCRUMB\}\}/g, breadcrumbHtml)
      .replace(/\{\{CONTENT\}\}/g, contentHtml)
      .replace(/\{\{FILE_ITEM_DELAYS\}\}/g, "");

    res.type("html").send(html);
  } catch (err: unknown) {
    log.error("File browser error", err);
    const message = err instanceof Error ? err.stack || err.message : "Unknown error";
    res.status(500).send(message);
  }
}

// Route for repo root without trailing slash: /view/:address/:repo
export const viewRepoRoot: IRoute = {
  method: "get",
  path: "/view/:address/:repo",
  async handler(req: Request, res: Response) {
    return handleViewRepo(req, res, "");
  },
};

// Route for paths within repo: /view/:address/:repo/anything/here
export const viewRepoPath: IRoute = {
  method: "get",
  path: "/view/:address/:repo/*path",
  async handler(req: Request, res: Response) {
    // In Express 5, wildcard params are arrays
    const pathParam = (req.params as Record<string, string | string[]>).path;
    const filePath = Array.isArray(pathParam) ? pathParam.join("/") : (pathParam || "");
    return handleViewRepo(req, res, filePath);
  },
};
