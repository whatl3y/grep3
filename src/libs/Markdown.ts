import { readFile } from "fs/promises";
import path from "path";
import hljs from "highlight.js";
import MarkdownIt from "markdown-it";

const markdown = MarkdownIt({
  highlight: function (str: string, language: string) {
    if (language && hljs.getLanguage(language)) {
      try {
        return `<pre class="hljs"><code>${
          hljs.highlight(str, { language, ignoreIllegals: true }).value
        }</code></pre>`;
      } catch (__) {}
    }
    return ""; // use external default escaping
  },
});

export default {
  async convertFileToHtml(filePath: string): Promise<string> {
    const mdRaw: string = await readFile(filePath, "utf8");
    const mdHtml = markdown.render(mdRaw, {});
    return this.createHtmlPage(mdHtml);
  },

  createHtmlPage(bodyHtml: string) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
          <title>txr - Transfer Files to Friends</title>

          <style>
            body {
              font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
            }

            a {
              color: inherit;
            }

            pre.hljs {
              border-radius: 5px;
              border: 1px solid #a0a0a0;
              background: #f5f5f5;
              overflow-x: scroll;
              padding: 5px;
            }

            .container {
              max-width: 700px;
              margin-right: auto;
              margin-left: auto;
            }

            .notice {
              border-radius: 5px;
              border: 1px solid #a0a0a0;
              background: #28a745;
              color: white;
              padding: 15px;
              margin: 25px 0px;
            }
          </style>
        </head>

        <body>
          <div class="container">
            ${bodyHtml}
          </div>
        </body>
      </html>
    `;
  },
};
