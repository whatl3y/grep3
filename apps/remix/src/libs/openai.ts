import OpenAI from "openai";

export interface IOpenAIClientOptions {
  apiKey: string;
  model?: string;
}

export interface IRemixConversionRequest {
  targetUrl: string;
  style?: "8bit" | "modern" | "sleek";
  maxTokens?: number;
}

// const SYSTEM_PROMPT = `You are an expert web developer and designer specializing in converting modern websites into retro 8-bit styled versions. Your task is to take a description or content of a target website and create a complete, functional HTML document that reimagines the website with sleek, sexy, retro 8-bit graphics and styling.

// **CRITICAL REQUIREMENTS:**

// 1. **Complete HTML Document**: Your output MUST be a single, complete, valid HTML5 document that can be rendered directly in a browser. Include ALL necessary HTML structure: <!DOCTYPE html>, <html>, <head>, <body>, etc.

// 2. **Self-Contained Styling**: All CSS must be embedded within a <style> tag in the <head>. NO external stylesheets. The styling should create an authentic 8-bit aesthetic:
//    - Use pixel/monospace fonts (e.g., 'Press Start 2P', 'VT323', 'Courier New', monospace)
//    - Implement pixelated borders and box-shadow effects
//    - Use a retro color palette (think NES, Game Boy, or arcade games)
//    - Create pixel art effects using CSS (borders, gradients, box-shadows)
//    - Add CRT screen effects, scanlines, or screen glow if appropriate
//    - Ensure text is readable while maintaining the 8-bit aesthetic

// 3. **8-Bit Visual Design**:
//    - Convert all images conceptually into pixel art descriptions or CSS-based pixel art
//    - Use block elements with borders to simulate sprites and pixel graphics
//    - Implement retro UI elements (buttons, inputs, containers) with pixelated styling
//    - Add retro gaming UI elements like health bars, score counters, or pixel borders
//    - Consider adding subtle animations (blinking text, floating sprites) using CSS keyframes

// 4. **Functional Layout**: Preserve the core structure and functionality of the original site:
//    - Maintain navigation hierarchy
//    - Keep all important content sections
//    - Preserve the general layout (header, main content, footer, sidebars, etc.)
//    - Make forms and interactive elements visually 8-bit but functionally intact

// 5. **Retro Typography**:
//    - Use ALL CAPS or mixed case strategically for that retro feel
//    - Implement text shadows and outlines to simulate pixel font effects
//    - Consider using ASCII art for decorative elements

// 6. **Color Scheme**: Use a limited, vibrant color palette inspired by retro gaming consoles:
//    - Classic NES palette (reds, blues, oranges, blacks)
//    - Game Boy green monochrome
//    - Arcade bright neons (hot pink, cyan, yellow)
//    - Or a custom retro palette that fits the original site's theme

// 7. **Responsive & Accessible**: While maintaining 8-bit aesthetics, ensure:
//    - The layout is responsive (use media queries if needed)
//    - Text contrast meets readability standards
//    - Interactive elements are clearly identifiable

// 8. **No External Dependencies**:
//    - NO external JavaScript libraries (but simple vanilla JS in <script> tags is fine for enhancements)
//    - NO CDN links for fonts (use web-safe pixel-style fonts or define font-face if absolutely needed, but prefer using fallbacks)
//    - ALL resources must be embedded or use data URIs

// 9. **Creative Interpretation**:
//    - Be creative! Add 8-bit flourishes like pixel art borders, "press start" buttons, life bars, coin counters
//    - Transform modern UI paradigms into retro gaming metaphors
//    - Add character and personality with retro gaming references

// 10. **Output Format**: Return ONLY the complete HTML document. No explanations, no markdown code blocks, no preamble. Just pure HTML that can be sent directly to a browser.

// **Example Structure:**

// <!DOCTYPE html>
// <html lang="en">
// <head>
//   <meta charset="UTF-8">
//   <meta name="viewport" content="width=device-width, initial-scale=1.0">
//   <title>8-Bit [Original Site Name]</title>
//   <style>
//     /* All CSS here - create comprehensive 8-bit styling */
//     * { box-sizing: border-box; margin: 0; padding: 0; }
//     body { font-family: 'Courier New', monospace; background: #000; color: #0f0; }
//     /* ... extensive 8-bit styling ... */
//   </style>
// </head>
// <body>
//   <!-- Complete 8-bit version of the target website -->
//   <!-- Include all content sections, navigation, etc. -->
// </body>
// </html>

// **When you receive information about a target website, you will:**
// 1. Analyze its structure, content, and purpose
// 2. Design an 8-bit aesthetic that complements the content
// 3. Generate a complete, self-contained HTML document
// 4. Ensure all styling creates an authentic retro gaming experience
// 5. Return ONLY the HTML - nothing else`;
const SYSTEM_PROMPT = `You are a senior front-end engineer performing a CONSERVATIVE visual refinement.

Goal:
Improve polish, spacing, typography, and responsiveness while PRESERVING the original visual identity, layout structure, and design intent.

DO NOT redesign from scratch.

Hard requirements:
- Preserve all visible text verbatim.
- Preserve all DOM structure, element order, and hierarchy unless absolutely necessary.
- Preserve all IDs, data-* attributes, ARIA attributes, and JS hooks.
- Preserve scripts exactly.
- Do NOT remove or rename existing classes.
- Prefer ADDITIVE CSS over overrides.
- Do not introduce external dependencies or frameworks.
- Output a single valid HTML5 document.

Styling rules:
- Keep existing layout and proportions recognizable.
- If colors exist, reuse them; only adjust contrast subtly if needed.
- Improve spacing using margin/padding refinements, not layout rewrites.
- Improve typography using font stacks, line-height, and font-weight—not font changes unless already generic.
- Use CSS variables ONLY if they already exist, otherwise define a minimal set derived from existing colors.

Allowed changes:
- Add a small number of utility classes.
- Add a limited <style> block that enhances the existing design.
- Add responsive tweaks (media queries) that respect the original layout.

Explicitly forbidden:
- Flat “card UI” redesigns.
- Generic SaaS landing-page styling.
- Replacing layout systems.
- Introducing large new wrappers.

Return ONLY the modified HTML.`;

export function createOpenAIClient(options: IOpenAIClientOptions): OpenAI {
  const client = new OpenAI({
    apiKey: options.apiKey,
  });

  return client;
}

/**
 * Compress HTML by removing unnecessary whitespace and attributes
 * while preserving all visible content and structure
 */
function compressHtml(html: string): string {
  let compressed = html;

  // Remove excessive whitespace between tags
  compressed = compressed.replace(/>\s+</g, "><");

  // Remove whitespace at start/end of lines
  compressed = compressed.replace(/^\s+/gm, "");
  compressed = compressed.replace(/\s+$/gm, "");

  // Collapse multiple spaces into one
  compressed = compressed.replace(/\s{2,}/g, " ");

  // Remove empty lines
  compressed = compressed.replace(/\n\s*\n/g, "\n");

  // Remove data attributes (data-*)
  compressed = compressed.replace(/\s+data-[a-zA-Z0-9-]+="[^"]*"/g, "");
  compressed = compressed.replace(/\s+data-[a-zA-Z0-9-]+='[^']*'/g, "");

  // Remove aria-* attributes (accessibility - not needed for visual conversion)
  compressed = compressed.replace(/\s+aria-[a-zA-Z0-9-]+="[^"]*"/g, "");

  // Remove role attributes
  compressed = compressed.replace(/\s+role="[^"]*"/g, "");

  return compressed.trim();
}

/**
 * Intelligently truncate HTML if it still exceeds limits
 */
function smartTruncateHtml(
  html: string,
  maxChars: number
): { html: string; truncated: boolean } {
  if (html.length <= maxChars) {
    return { html, truncated: false };
  }

  // Try to find a good breaking point (closing body tag)
  const bodyEndIndex = html.lastIndexOf("</body>", maxChars);
  if (bodyEndIndex > maxChars * 0.7) {
    return {
      html: html.substring(0, bodyEndIndex) + "</body></html>",
      truncated: true,
    };
  }

  // Try to break at a closing div
  const divEndIndex = html.lastIndexOf("</div>", maxChars);
  if (divEndIndex > maxChars * 0.8) {
    return {
      html: html.substring(0, divEndIndex) + "</div></body></html>",
      truncated: true,
    };
  }

  // Last resort: hard truncate with closing tags
  return {
    html:
      html.substring(0, maxChars) +
      "\n<!-- Content truncated --></body></html>",
    truncated: true,
  };
}

export async function remixWebsite(
  client: OpenAI,
  request: IRemixConversionRequest,
  websiteContent: string,
  model: string = "gpt-4o"
): Promise<string> {
  // Default to 8bit style if not specified
  const style = request.style || "8bit";
  // Model context limits and pricing (as of January 2025)
  const modelLimits: Record<
    string,
    {
      contextLimit: number;
      inputPricePerMillion: number;
      outputPricePerMillion: number;
    }
  > = {
    "gpt-4o": {
      contextLimit: 128000,
      inputPricePerMillion: 2.5,
      outputPricePerMillion: 10.0,
    },
    "gpt-4o-mini": {
      contextLimit: 128000,
      inputPricePerMillion: 0.15,
      outputPricePerMillion: 0.6,
    },
    "gpt-4-turbo": {
      contextLimit: 128000,
      inputPricePerMillion: 10.0,
      outputPricePerMillion: 30.0,
    },
    "o1-preview": {
      contextLimit: 128000,
      inputPricePerMillion: 15.0,
      outputPricePerMillion: 60.0,
    },
    "o1-mini": {
      contextLimit: 128000,
      inputPricePerMillion: 3.0,
      outputPricePerMillion: 12.0,
    },
  };

  const modelConfig = modelLimits[model] || modelLimits["gpt-4o"];

  // Compress HTML to reduce token usage
  console.log(
    `Original HTML size: ${websiteContent.length.toLocaleString()} chars`
  );
  let processedHtml = compressHtml(websiteContent);
  console.log(
    `After compression: ${processedHtml.length.toLocaleString()} chars (${Math.round(
      (1 - processedHtml.length / websiteContent.length) * 100
    )}% reduction)`
  );

  // Calculate max chars for HTML content
  // Reserve: system prompt (~2K tokens = 8K chars), user prompt structure (~500 chars), output (16K tokens = 64K chars)
  // Rough estimate: 1 token ≈ 4 characters
  const maxHtmlChars = (modelConfig.contextLimit - 18000) * 4;

  // TODO: decide if we should add that back
  // const { html: finalHtml, truncated } = smartTruncateHtml(
  //   processedHtml,
  //   maxHtmlChars
  // );
  const finalHtml = processedHtml;
  const truncated = processedHtml;
  console.log(
    `Final HTML size: ${finalHtml.length.toLocaleString()} chars${
      truncated ? " (truncated)" : ""
    }`
  );

  const styleNote = style === "8bit" ? "8-bit styled" : `${style} styled`;
  const userPrompt = `Convert the following website into a complete, self-contained ${styleNote} HTML document.

Target URL: ${request.targetUrl}

Website Content (scripts, styles, and comments already removed):
${finalHtml}

${
  truncated
    ? "\n⚠️ Note: Content was truncated to fit token limits. Focus on converting the main structure and key visible elements.\n"
    : ""
}
Remember: Return ONLY the complete HTML document. No explanations, no markdown, just the raw HTML.`;

  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
    max_tokens: request.maxTokens || 16000,
    temperature: 0.7,
  });

  // Calculate and log costs
  const usage = completion.usage;
  if (usage) {
    const inputCost =
      (usage.prompt_tokens / 1_000_000) * modelConfig.inputPricePerMillion;
    const outputCost =
      (usage.completion_tokens / 1_000_000) * modelConfig.outputPricePerMillion;
    const totalCost = inputCost + outputCost;

    console.log(`\n💰 OpenAI API Cost Breakdown:`);
    console.log(`   Model: ${model}`);
    console.log(
      `   Input tokens: ${usage.prompt_tokens.toLocaleString()} ($${inputCost.toFixed(
        4
      )})`
    );
    console.log(
      `   Output tokens: ${usage.completion_tokens.toLocaleString()} ($${outputCost.toFixed(
        4
      )})`
    );
    console.log(`   Total tokens: ${usage.total_tokens.toLocaleString()}`);
    console.log(`   💵 Total cost: $${totalCost.toFixed(4)} USD\n`);
  }

  const htmlContent = completion.choices[0]?.message?.content || "";

  // Remove markdown code blocks if present (defensive)
  let cleanHtml = htmlContent.trim();
  if (cleanHtml.startsWith("```html")) {
    cleanHtml = cleanHtml.replace(/^```html\n/, "").replace(/\n```$/, "");
  } else if (cleanHtml.startsWith("```")) {
    cleanHtml = cleanHtml.replace(/^```\n/, "").replace(/\n```$/, "");
  }

  return cleanHtml;
}
