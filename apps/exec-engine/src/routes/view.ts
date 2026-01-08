import path from "path";
import { Request, Response } from "express";
import { getAddress, isAddress } from "ethers";
import { mkdir, readFile, readdir, stat, rm } from "fs/promises";
import { GitClient, FileManagement, untarRepoFromAws, Markdown } from "@grep3/core";
import config from "../config";
import { IRoute } from "./index";
import log from "../logger";

const fileMgmt = FileManagement();

// File browser utilities
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp"]);

// SVG is technically XML text, so we handle it specially
function isImageExtension(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

function isSvgFile(filename: string): boolean {
  return path.extname(filename).toLowerCase() === ".svg";
}

/**
 * Check if a buffer contains valid UTF-8 text content.
 * Returns true if the content appears to be readable text.
 */
function isTextContent(buffer: Buffer): boolean {
  // Empty files are considered text
  if (buffer.length === 0) return true;

  // Check a sample of the file (first 8KB should be enough)
  const sampleSize = Math.min(buffer.length, 8192);
  const sample = buffer.subarray(0, sampleSize);

  // Check for null bytes - binary files often have these
  // Text files almost never do (except for UTF-16/32 which we're not supporting here)
  let nullCount = 0;
  let controlCount = 0;

  for (let i = 0; i < sample.length; i++) {
    const byte = sample[i];

    // Null byte is a strong indicator of binary
    if (byte === 0) {
      nullCount++;
      // If we find more than a couple null bytes, it's likely binary
      if (nullCount > 2) return false;
    }

    // Count control characters (except common whitespace: tab, newline, carriage return)
    if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
      controlCount++;
    }
  }

  // If more than 10% of the sample is control characters, likely binary
  if (controlCount > sampleSize * 0.1) return false;

  // Try to decode as UTF-8 and check for replacement characters
  try {
    const decoded = sample.toString("utf-8");
    // Count replacement characters (U+FFFD) which indicate invalid UTF-8 sequences
    const replacementCount = (decoded.match(/\uFFFD/g) || []).length;
    // If more than 1% are replacement characters, probably not valid UTF-8 text
    if (replacementCount > decoded.length * 0.01) return false;
  } catch {
    return false;
  }

  return true;
}

function getLanguageFromFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const basename = path.basename(filename).toLowerCase();

  // Handle files without extensions by basename
  const basenameMap: { [key: string]: string } = {
    "dockerfile": "dockerfile",
    "makefile": "makefile",
    ".gitignore": "gitignore",
    ".gitattributes": "gitignore",
    ".editorconfig": "ini",
    ".prettierrc": "json",
    ".eslintrc": "json",
    ".babelrc": "json",
  };

  if (basenameMap[basename]) {
    return basenameMap[basename];
  }

  const langMap: { [key: string]: string } = {
    ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
    ".ts": "typescript", ".tsx": "typescript", ".mts": "typescript", ".cts": "typescript",
    ".py": "python", ".rb": "ruby", ".php": "php", ".java": "java",
    ".c": "c", ".cpp": "cpp", ".h": "c", ".hpp": "cpp", ".cs": "csharp",
    ".go": "go", ".rs": "rust", ".swift": "swift", ".kt": "kotlin", ".scala": "scala",
    ".sol": "solidity",
    ".html": "html", ".htm": "html", ".xml": "xml", ".svg": "xml",
    ".css": "css", ".scss": "scss", ".sass": "scss", ".less": "less",
    ".json": "json", ".yaml": "yaml", ".yml": "yaml", ".toml": "ini",
    ".md": "markdown", ".markdown": "markdown",
    ".sh": "bash", ".bash": "bash", ".zsh": "bash",
    ".sql": "sql", ".graphql": "graphql", ".gql": "graphql",
    ".dockerfile": "dockerfile", ".makefile": "makefile",
    ".vue": "xml", ".svelte": "xml",
    ".prisma": "plaintext",
    ".env": "properties",
    ".ini": "ini", ".cfg": "ini", ".conf": "ini",
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

function renderReadme(readmeHtml: string): string {
  return `
    <div class="readme-section">
      <div class="readme-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
        <span>README.md</span>
      </div>
      <div class="readme-content">
        ${readmeHtml}
      </div>
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

/**
 * Check if a working directory has actual git content (not just empty or .git only)
 */
async function isWorkingDirPopulated(workingDir: string): Promise<boolean> {
  try {
    const entries = await readdir(workingDir);
    // Filter out .git directory - we want to see if there are actual files
    const nonGitEntries = entries.filter((e) => e !== ".git");
    return nonGitEntries.length > 0;
  } catch {
    return false;
  }
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
    const workingDir = path.join(config.gitRootDir, checksumAddress, `${repoNameClean}-working`);
    const bareRepoDir = path.join(config.gitRootDir, checksumAddress, repoName);

    // Check if working directory exists AND has content
    const workingDirExists = await fileMgmt.doesDirOrFileExist(workingDir);
    const workingDirPopulated = workingDirExists && (await isWorkingDirPopulated(workingDir));

    // Ensure the bare repo exists first (fetch from AWS if needed for ephemeral filesystems)
    const bareRepoExists = await fileMgmt.doesDirOrFileExist(bareRepoDir);
    if (!bareRepoExists) {
      // Ensure parent directory exists
      const userDir = path.join(config.gitRootDir, checksumAddress);
      if (!(await fileMgmt.doesDirOrFileExist(userDir))) {
        await mkdir(userDir, { recursive: true });
      }

      // Try to fetch bare repo from AWS (this checks DB first)
      const fetchedFromAws = await untarRepoFromAws(log, config.gitRootDir, checksumAddress, repoName);
      if (!fetchedFromAws) {
        log.info("Repository not found in DB/AWS", checksumAddress, repoName);
        return res.status(404).send("Repository not found");
      }
      log.info("Fetched bare repo from AWS", checksumAddress, repoName);
    }

    if (!workingDirPopulated) {
      // Clean up empty/broken working directory if it exists
      if (workingDirExists && !workingDirPopulated) {
        log.info("Removing empty working directory", workingDir);
        await rm(workingDir, { recursive: true, force: true });
      }

      // Create fresh working directory and clone
      await mkdir(workingDir, { recursive: true });
      const gitClient = GitClient(checksumAddress, repoName, workingDir);
      try {
        await gitClient.pullRepo();
      } catch (err) {
        log.error("Failed to clone repo", err);
        // Clean up failed working directory
        await rm(workingDir, { recursive: true, force: true }).catch(() => {});
        return res.status(404).send("Repository not found or empty");
      }

      // Verify we actually got content
      if (!(await isWorkingDirPopulated(workingDir))) {
        log.error("Working directory still empty after pull", workingDir);
        return res.status(404).send("Repository appears to be empty");
      }
    } else {
      // Working directory exists - pull latest changes to ensure we have the most recent commit
      const gitClient = GitClient(checksumAddress, repoName, workingDir);
      try {
        await gitClient.pullRepo();
      } catch (err) {
        // Log but don't fail - we can still show the existing content
        log.warn("Failed to pull latest changes, showing cached content", err);
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
        const fileSize = stats.size;

        try {
          // Read file as buffer first to determine type
          const fileBuffer = await readFile(targetPath);

          if (isImageExtension(filename)) {
            // Known image extension - display as image
            const base64Content = fileBuffer.toString("base64");
            const mimeType = getMimeType(filename);
            contentHtml = renderImageViewer(filename, fileSize, mimeType, base64Content);
          } else if (isSvgFile(filename)) {
            // SVG is XML text, show as code
            const fileContent = fileBuffer.toString("utf-8");
            contentHtml = renderCodeViewer(filename, fileSize, "xml", fileContent);
          } else if (isTextContent(fileBuffer)) {
            // Content-based detection determined this is text
            const fileContent = fileBuffer.toString("utf-8");
            const language = getLanguageFromFilename(filename);
            contentHtml = renderCodeViewer(filename, fileSize, language, fileContent);
          } else {
            // Binary file
            contentHtml = renderBinaryViewer(filename, fileSize);
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

          // At root level, check for README.md and render it below the file list
          if (!filePath) {
            const readmeEntry = entries.find(
              (e) => !e.isDir && e.name.toLowerCase() === "readme.md"
            );
            if (readmeEntry) {
              try {
                const readmePath = path.join(targetPath, readmeEntry.name);
                const readmeContent = await readFile(readmePath, "utf-8");
                const readmeHtml = Markdown.render(readmeContent);
                contentHtml += renderReadme(readmeHtml);
              } catch (readmeErr) {
                log.warn("Failed to render README.md", readmeErr);
              }
            }
          }
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
      .replace(/\{\{ADDRESS\}\}/g, checksumAddress)
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
