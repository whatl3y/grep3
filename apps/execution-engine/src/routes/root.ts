import { Request, Response } from "express";
import { getAddress } from "ethers";
import {
  findExecutionsByRepoId,
  Aws,
  findRepoByAddressAndName,
} from "@grep3/core";
import { IRoute } from "./index";
import log from "../logger";
import config from "../config";

const aws = Aws();

export const home: IRoute = {
  method: "get",
  path: "/",
  async handler(_req: Request, res: Response) {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Execution Engine API — grep3</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #f7f7f5;
      --bg-elevated: #ffffff;
      --text-primary: #1c1c1c;
      --text-secondary: #6b6b6b;
      --text-tertiary: #999999;
      --border: #e3e3e0;
      --border-subtle: #ececea;
      --accent: #2d2d2d;
      --accent-hover: #1a1a1a;
      --method-get: #059669;
      --method-get-bg: #ecfdf5;
      --method-post: #2563eb;
      --method-post-bg: #eff6ff;
      --method-all: #7c3aed;
      --method-all-bg: #f5f3ff;
      --terminal-bg: #1a1a1a;
      --terminal-text: #e8e8e8;
      --terminal-comment: #707070;
      --terminal-cmd: #a8d4a8;
      --terminal-url: #8cb4d4;
      --terminal-param: #d4c48c;
      --terminal-string: #d4a88c;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    html {
      font-size: 16px;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    body {
      font-family: 'Bricolage Grotesque', Georgia, serif;
      background: var(--bg);
      color: var(--text-primary);
      line-height: 1.6;
      min-height: 100vh;
    }

    body::before {
      content: '';
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      opacity: 0.03;
      pointer-events: none;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 0 32px;
      position: relative;
    }

    /* Header */
    header {
      padding: 64px 0 48px;
      border-bottom: 1px solid var(--border);
    }

    .header-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 11px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: var(--text-tertiary);
      margin-bottom: 20px;
    }

    .header-badge::before {
      content: '';
      width: 8px;
      height: 8px;
      background: #10b981;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .page-title {
      font-size: 42px;
      font-weight: 700;
      letter-spacing: -1.5px;
      color: var(--text-primary);
      margin-bottom: 16px;
      line-height: 1.1;
    }

    .page-subtitle {
      font-size: 18px;
      color: var(--text-secondary);
      font-weight: 400;
      max-width: 600px;
      line-height: 1.6;
    }

    /* Section */
    section {
      padding: 48px 0;
      border-bottom: 1px solid var(--border);
    }

    section:last-of-type {
      border-bottom: none;
    }

    .section-label {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 11px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: var(--text-tertiary);
      margin-bottom: 28px;
    }

    /* Intro list */
    .intro-list {
      list-style: none;
      display: grid;
      gap: 14px;
    }

    .intro-list li {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      font-size: 16px;
      color: var(--text-secondary);
      line-height: 1.6;
    }

    .intro-list li::before {
      content: '';
      width: 8px;
      height: 8px;
      background: var(--border);
      border-radius: 50%;
      margin-top: 8px;
      flex-shrink: 0;
    }

    /* Base URL box */
    .base-url-box {
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      margin-top: 28px;
    }

    .base-url-label {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 11px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--text-tertiary);
      margin-bottom: 10px;
    }

    .base-url-value {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 15px;
      color: var(--text-primary);
      background: var(--bg);
      padding: 12px 16px;
      border-radius: 8px;
      border: 1px solid var(--border-subtle);
    }

    /* Endpoint cards */
    .endpoints-grid {
      display: grid;
      gap: 20px;
    }

    .endpoint-card {
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      transition: box-shadow 0.2s ease, border-color 0.2s ease;
    }

    .endpoint-card:hover {
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
      border-color: #d4d4d0;
    }

    .endpoint-header {
      padding: 20px 24px;
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
    }

    .method-badge {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 11px;
      font-weight: 500;
      padding: 5px 10px;
      border-radius: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .method-badge.get {
      background: var(--method-get-bg);
      color: var(--method-get);
    }

    .method-badge.post {
      background: var(--method-post-bg);
      color: var(--method-post);
    }

    .method-badge.all {
      background: var(--method-all-bg);
      color: var(--method-all);
    }

    .endpoint-path {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 14px;
      color: var(--text-primary);
      font-weight: 500;
    }

    .endpoint-path .param {
      color: var(--method-post);
    }

    .endpoint-body {
      padding: 20px 24px;
    }

    .endpoint-desc {
      font-size: 15px;
      color: var(--text-secondary);
      line-height: 1.6;
      margin-bottom: 20px;
    }

    .endpoint-details {
      display: grid;
      gap: 16px;
    }

    .detail-group {
      display: grid;
      gap: 8px;
    }

    .detail-label {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 10px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--text-tertiary);
    }

    .detail-value {
      font-size: 14px;
      color: var(--text-secondary);
    }

    .detail-value code {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 12px;
      background: var(--bg);
      padding: 2px 6px;
      border-radius: 4px;
      color: var(--text-primary);
    }

    /* Terminal */
    .terminal {
      background: var(--terminal-bg);
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
      margin-top: 16px;
    }

    .terminal-header {
      background: #2a2a2a;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .terminal-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #3a3a3a;
    }

    .terminal-label {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 11px;
      color: #666;
      margin-left: auto;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .terminal-body {
      padding: 20px 24px;
      overflow-x: auto;
    }

    .terminal-body code {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 13px;
      line-height: 1.8;
      color: var(--terminal-text);
      display: block;
      white-space: pre;
    }

    .terminal-body .comment { color: var(--terminal-comment); }
    .terminal-body .cmd { color: var(--terminal-cmd); }
    .terminal-body .url { color: var(--terminal-url); }
    .terminal-body .param { color: var(--terminal-param); }
    .terminal-body .string { color: var(--terminal-string); }

    /* Response format */
    .response-box {
      background: var(--bg);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 16px;
      margin-top: 12px;
    }

    .response-box pre {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 12px;
      color: var(--text-secondary);
      white-space: pre-wrap;
      word-break: break-word;
    }

    /* Architecture section */
    .arch-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
    }

    .arch-card {
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      text-align: center;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .arch-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.06);
    }

    .arch-icon {
      width: 48px;
      height: 48px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px;
    }

    .arch-icon svg {
      width: 24px;
      height: 24px;
      stroke: var(--text-secondary);
      stroke-width: 1.5;
      fill: none;
    }

    .arch-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 8px;
    }

    .arch-desc {
      font-size: 14px;
      color: var(--text-secondary);
      line-height: 1.5;
    }

    /* Footer */
    footer {
      padding: 48px 0;
      text-align: center;
    }

    .footer-links {
      display: flex;
      justify-content: center;
      gap: 32px;
      margin-bottom: 24px;
    }

    .footer-links a {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 13px;
      color: var(--text-secondary);
      text-decoration: none;
      transition: color 0.2s ease;
    }

    .footer-links a:hover {
      color: var(--text-primary);
    }

    .footer-brand {
      font-size: 13px;
      color: var(--text-tertiary);
    }

    /* Responsive */
    @media (max-width: 768px) {
      .container { padding: 0 20px; }
      header { padding: 48px 0 36px; }
      .page-title { font-size: 32px; }
      .page-subtitle { font-size: 16px; }
      section { padding: 36px 0; }
      .arch-grid { grid-template-columns: 1fr; }
      .terminal-body { padding: 16px; }
      .terminal-body code { font-size: 11px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="header-badge">Execution Engine API</div>
      <h1 class="page-title">Code Execution Infrastructure</h1>
      <p class="page-subtitle">Execute containerized code from your git repositories. Queue jobs, monitor executions, and stream output logs via REST API.</p>
    </header>

    <section>
      <div class="section-label">Overview</div>
      <ul class="intro-list">
        <li>Execute code from git repositories in isolated Docker containers</li>
        <li>Queue-based execution with background workers for reliability</li>
        <li>Stream execution output from S3-backed log storage</li>
        <li>Ethereum address-based repository ownership</li>
        <li>RESTful JSON API for programmatic access</li>
      </ul>

      <div class="base-url-box">
        <div class="base-url-label">Base URL</div>
        <div class="base-url-value">${config.server.host}</div>
      </div>
    </section>

    <section>
      <div class="section-label">Architecture</div>
      <div class="arch-grid">
        <div class="arch-card">
          <div class="arch-icon">
            <svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          </div>
          <h3 class="arch-title">Web API</h3>
          <p class="arch-desc">Express server handling REST endpoints for repos and executions</p>
        </div>
        <div class="arch-card">
          <div class="arch-icon">
            <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          </div>
          <h3 class="arch-title">Workers</h3>
          <p class="arch-desc">Background job processors executing Docker containers</p>
        </div>
        <div class="arch-card">
          <div class="arch-icon">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <h3 class="arch-title">Scheduler</h3>
          <p class="arch-desc">Job orchestration and queue management via Redis</p>
        </div>
      </div>
    </section>

    <section>
      <div class="section-label">Repositories</div>
      <div class="endpoints-grid">
        <div class="endpoint-card">
          <div class="endpoint-header">
            <span class="method-badge get">GET</span>
            <span class="endpoint-path">/repos/<span class="param">:address</span>/all</span>
          </div>
          <div class="endpoint-body">
            <p class="endpoint-desc">List all repositories owned by an Ethereum address.</p>
            <div class="endpoint-details">
              <div class="detail-group">
                <span class="detail-label">Parameters</span>
                <span class="detail-value"><code>:address</code> — Ethereum address (checksummed or lowercase)</span>
              </div>
              <div class="detail-group">
                <span class="detail-label">Response</span>
                <span class="detail-value">Array of repository objects with id, name, address, created_at</span>
              </div>
            </div>
            <div class="terminal">
              <div class="terminal-header">
                <span class="terminal-dot"></span>
                <span class="terminal-dot"></span>
                <span class="terminal-dot"></span>
                <span class="terminal-label">Example</span>
              </div>
              <div class="terminal-body">
                <code><span class="cmd">curl</span> <span class="url">${config.server.host}/repos/0xYourAddress/all</span></code>
              </div>
            </div>
          </div>
        </div>

        <div class="endpoint-card">
          <div class="endpoint-header">
            <span class="method-badge get">GET</span>
            <span class="endpoint-path">/repos/<span class="param">:id</span>/get</span>
          </div>
          <div class="endpoint-body">
            <p class="endpoint-desc">Get details for a specific repository by ID.</p>
            <div class="endpoint-details">
              <div class="detail-group">
                <span class="detail-label">Parameters</span>
                <span class="detail-value"><code>:id</code> — Repository ID (integer)</span>
              </div>
              <div class="detail-group">
                <span class="detail-label">Response</span>
                <span class="detail-value">Repository object with full details</span>
              </div>
            </div>
          </div>
        </div>

        <div class="endpoint-card">
          <div class="endpoint-header">
            <span class="method-badge all">ALL</span>
            <span class="endpoint-path">/repos/<span class="param">:id</span>/execute</span>
          </div>
          <div class="endpoint-body">
            <p class="endpoint-desc">Trigger execution of a repository. Creates an execution record and queues a Docker job.</p>
            <div class="endpoint-details">
              <div class="detail-group">
                <span class="detail-label">Parameters</span>
                <span class="detail-value"><code>:id</code> — Repository ID (integer)</span>
              </div>
              <div class="detail-group">
                <span class="detail-label">Response</span>
                <span class="detail-value">Execution object with id, status, created_at</span>
              </div>
            </div>
            <div class="terminal">
              <div class="terminal-header">
                <span class="terminal-dot"></span>
                <span class="terminal-dot"></span>
                <span class="terminal-dot"></span>
                <span class="terminal-label">Example</span>
              </div>
              <div class="terminal-body">
                <code><span class="cmd">curl</span> <span class="param">-X POST</span> <span class="url">${config.server.host}/repos/123/execute</span></code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section>
      <div class="section-label">Executions</div>
      <div class="endpoints-grid">
        <div class="endpoint-card">
          <div class="endpoint-header">
            <span class="method-badge get">GET</span>
            <span class="endpoint-path">/executions/<span class="param">:repoId</span>/all</span>
          </div>
          <div class="endpoint-body">
            <p class="endpoint-desc">List all executions for a repository.</p>
            <div class="endpoint-details">
              <div class="detail-group">
                <span class="detail-label">Parameters</span>
                <span class="detail-value"><code>:repoId</code> — Repository ID (integer)</span>
              </div>
              <div class="detail-group">
                <span class="detail-label">Response</span>
                <span class="detail-value">Array of execution objects with status, timestamps, stdout_file</span>
              </div>
            </div>
          </div>
        </div>

        <div class="endpoint-card">
          <div class="endpoint-header">
            <span class="method-badge get">GET</span>
            <span class="endpoint-path">/executions/<span class="param">:id</span>/get</span>
          </div>
          <div class="endpoint-body">
            <p class="endpoint-desc">Get details for a specific execution.</p>
            <div class="endpoint-details">
              <div class="detail-group">
                <span class="detail-label">Parameters</span>
                <span class="detail-value"><code>:id</code> — Execution ID (integer)</span>
              </div>
              <div class="detail-group">
                <span class="detail-label">Response</span>
                <span class="detail-value">Execution object with full details including status and output file reference</span>
              </div>
            </div>
          </div>
        </div>

        <div class="endpoint-card">
          <div class="endpoint-header">
            <span class="method-badge get">GET</span>
            <span class="endpoint-path">/executions/<span class="param">:id</span>/stdout</span>
          </div>
          <div class="endpoint-body">
            <p class="endpoint-desc">Stream the stdout output of an execution. Returns the raw text output from the container.</p>
            <div class="endpoint-details">
              <div class="detail-group">
                <span class="detail-label">Parameters</span>
                <span class="detail-value"><code>:id</code> — Execution ID (integer)</span>
              </div>
              <div class="detail-group">
                <span class="detail-label">Response</span>
                <span class="detail-value">Plain text stream of execution output (Content-Type: text/plain)</span>
              </div>
            </div>
            <div class="terminal">
              <div class="terminal-header">
                <span class="terminal-dot"></span>
                <span class="terminal-dot"></span>
                <span class="terminal-dot"></span>
                <span class="terminal-label">Example</span>
              </div>
              <div class="terminal-body">
                <code><span class="cmd">curl</span> <span class="url">${config.server.host}/executions/456/stdout</span>

<span class="comment"># Output:</span>
<span class="string">Building container...</span>
<span class="string">Running script...</span>
<span class="string">Hello from Docker!</span>
<span class="string">Execution complete.</span></code>
              </div>
            </div>
          </div>
        </div>

        <div class="endpoint-card">
          <div class="endpoint-header">
            <span class="method-badge get">GET</span>
            <span class="endpoint-path">/<span class="param">:address</span>/<span class="param">:repoName</span></span>
          </div>
          <div class="endpoint-body">
            <p class="endpoint-desc">Shortcut to stream the latest execution output for a repository by address and name.</p>
            <div class="endpoint-details">
              <div class="detail-group">
                <span class="detail-label">Parameters</span>
                <span class="detail-value"><code>:address</code> — Ethereum address, <code>:repoName</code> — Repository name (with or without .git)</span>
              </div>
              <div class="detail-group">
                <span class="detail-label">Response</span>
                <span class="detail-value">Plain text stream of latest execution output</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section>
      <div class="section-label">Health</div>
      <div class="endpoints-grid">
        <div class="endpoint-card">
          <div class="endpoint-header">
            <span class="method-badge get">GET</span>
            <span class="endpoint-path">/health/check</span>
          </div>
          <div class="endpoint-body">
            <p class="endpoint-desc">Health check endpoint for load balancers and monitoring.</p>
            <div class="endpoint-details">
              <div class="detail-group">
                <span class="detail-label">Response</span>
                <span class="detail-value">204 No Content on success</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <footer>
      <div class="footer-links">
        <a href="https://grep3.com">grep3.com</a>
        <a href="https://git.grep3.com">Git Server</a>
        <a href="https://github.com/whatl3y/grep3">GitHub</a>
      </div>
      <div class="footer-brand">grep3 — decentralized execution</div>
    </footer>
  </div>
</body>
</html>`;
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  },
};

export const repos: IRoute = {
  method: "get",
  path: "/:address/:repoName",
  async handler(req: Request, res: Response) {
    try {
      const address = getAddress(req.params.address);
      let repoName = req.params.repoName;

      // Handle .git suffix - add it if not present
      if (!repoName.endsWith(".git")) {
        repoName = `${repoName}.git`;
      }

      // Find the repo by name
      const repo = await findRepoByAddressAndName(address, repoName);
      if (!repo) {
        return res.status(404).send(`repository not found: ${repoName}`);
      }

      log.debug(`Found repo:`, repo);

      // Find executions for this repo
      const executions = await findExecutionsByRepoId(repo.id);
      if (!executions || executions.length === 0) {
        return res
          .status(404)
          .send(`no executions for repository: ${repoName}`);
      }

      // Get the latest execution (sort by created_at descending)
      const latestExecution = executions.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];

      log.debug(`Latest execution:`, latestExecution);

      if (!latestExecution.stdout_file) {
        return res
          .status(404)
          .send(
            `no stdout file found for latest execution of repository: ${repoName}`
          );
      }

      // stream stdout to the response
      await aws.getFileStreamWithBackoff(res, {
        filename: latestExecution.stdout_file,
      });
    } catch (err: any) {
      log.error("error in repo route:", err);
      res.status(err.statusCode || 500).json({ error: "Failed to get execution output" });
    }
  },
};
