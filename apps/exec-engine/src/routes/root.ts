import path from "path";
import { Request, Response } from "express";
import { readFile } from "fs/promises";
import RecentPushes, { RecentPush } from "../libs/RecentPushes";
import redis from "../redis";
import { IRoute } from "./index";

const recentPushes = RecentPushes(redis);

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function generateRecentPushesHtml(
  pushes: RecentPush[],
  page: number,
  totalPages: number
): string {
  if (pushes.length === 0) {
    return `
      <div class="empty-state">
        <p>No recent pushes yet. Be the first to push a repository!</p>
      </div>
    `;
  }

  const rows = pushes
    .map(
      (push) => {
        const viewUrl = `/view/${push.address}/${push.repo.replace(/\.git$/, "")}`;
        return `
      <tr class="clickable-row" onclick="window.location='${viewUrl}'">
        <td class="col-repo">
          <span class="repo-name">${push.repo.replace(/\.git$/, "")}</span>
        </td>
        <td class="col-address">
          <span class="address" title="${push.address}">${truncateAddress(push.address)}</span>
        </td>
        <td class="col-branch">${push.branch}</td>
        <td class="col-time">${formatTimestamp(push.timestamp)}</td>
      </tr>
    `;
      }
    )
    .join("");

  const pagination =
    totalPages > 1
      ? `
      <div class="pagination">
        ${page > 1 ? `<a href="/?page=${page - 1}" class="page-link">← Previous</a>` : '<span class="page-link disabled">← Previous</span>'}
        <span class="page-info">Page ${page} of ${totalPages}</span>
        ${page < totalPages ? `<a href="/?page=${page + 1}" class="page-link">Next →</a>` : '<span class="page-link disabled">Next →</span>'}
      </div>
    `
      : "";

  return `
    <table class="pushes-table">
      <thead>
        <tr>
          <th class="col-repo">Repository</th>
          <th class="col-address">Address</th>
          <th class="col-branch">Branch</th>
          <th class="col-time">Pushed</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    ${pagination}
  `;
}

export const home: IRoute = {
  method: "get",
  path: "/",
  async handler(req: Request, res: Response) {
    try {
      const page = Math.max(1, Math.min(20, parseInt(req.query.page as string) || 1));
      const { pushes, totalPages } = await recentPushes.getPushes(page, 5);

      // Templates are at app root level (/app/templates), not in dist
      let html = await readFile(
        path.join(__dirname, "..", "..", "templates", "index.html"),
        "utf-8"
      );

      // Inject recent pushes HTML
      const recentPushesHtml = generateRecentPushesHtml(pushes, page, totalPages);
      html = html.replace("{{RECENT_PUSHES}}", recentPushesHtml);

      res.type("html").send(html);
    } catch (err: any) {
      res.status(500).send(err.stack);
    }
  },
};

export const favicon: IRoute = {
  method: "get",
  path: "/favicon.ico",
  handler(_req: Request, res: Response) {
    res.status(204).end();
  },
};

export const robots: IRoute = {
  method: "get",
  path: "/robots.txt",
  handler(_req: Request, res: Response) {
    res.type("text").send("User-agent: *\nDisallow:");
  },
};
