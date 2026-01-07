# Website Remix

Transform any website into different stylized versions powered by OpenAI's GPT models.

## Overview

This application takes a URL of any website and remixes it into a complete, self-contained HTML document with your chosen style. The remix maintains the structure and content of the original site while reimagining it with creative aesthetics.

## Features

- **Automatic Remix**: Simply provide a URL and get a fully styled version
- **Multiple Styles**: Support for different styles including retro 8-bit (default), with more coming soon
- **Comprehensive System Prompts**: Highly detailed instructions to GPT ensure consistent, high-quality conversions
- **Self-Contained Output**: All CSS and styling embedded in the generated HTML
- **Creative Aesthetics**: Depending on the style - pixel fonts, vibrant color palettes, modern designs, and more
- **Preserves Functionality**: Maintains the original site's structure and content hierarchy

## Usage

### Starting the Server

```bash
npm run build
npm start
```

The server will start on the port specified in your `.env` file (default: 8088).

### Remixing a Website

Visit the following URL pattern in your browser:

```
http://localhost:8088/<target-url>
```

**Examples:**

- `http://localhost:8088/example.com`
- `http://localhost:8088/https://github.com`
- `http://localhost:8088/news.ycombinator.com`

The app will:
1. Launch a headless browser (Playwright/Chromium) to fetch the target URL
2. Wait for all JavaScript to execute and the page to fully render
3. Extract the final HTML after all client-side rendering is complete
4. Send the rendered HTML to OpenAI's API with comprehensive styling instructions
5. Return a complete, styled HTML document that renders the site in your chosen style (default: 8-bit retro)

## Configuration

Create a `.env` file in the `apps/remix` directory with the following variables:

```env
# Required
OPENAI_API_KEY=your-openai-api-key-here

# Optional
PORT=8088
HOST=http://localhost:8088
OPENAI_MODEL=gpt-4o
```

### Environment Variables

- `OPENAI_API_KEY` (required): Your OpenAI API key
- `PORT` (optional): Server port (default: 8088)
- `HOST` (optional): Server host (default: http://localhost:8088)
- `OPENAI_MODEL` (optional): OpenAI model to use (default: gpt-4o)

## How It Works

1. **URL Processing**: The wildcard route captures any URL path provided by the user
2. **Headless Browser Rendering**:
   - Launches Playwright (headless Chromium browser)
   - Navigates to the target URL
   - Waits for all JavaScript to execute (`networkidle`)
   - Allows React, Vue, Angular, and other client-side frameworks to fully render
   - Removes cookie banners, scripts, and styles to reduce noise
   - Extracts the final, fully-rendered HTML DOM
3. **AI Remix**: The rendered content is sent to OpenAI with a comprehensive system prompt that includes:
   - Detailed styling requirements based on the selected style
   - Color palette guidelines (e.g., for 8-bit: NES, Game Boy, arcade styles)
   - Typography instructions appropriate for the style
   - Layout preservation rules
   - Creative styling techniques (e.g., CSS-based pixel art for 8-bit)
   - Style-specific UI element suggestions
4. **HTML Response**: The generated styled HTML is sent directly to the browser

### Why Headless Browser?

Modern websites heavily rely on client-side JavaScript frameworks. A simple `fetch()` would only retrieve the initial HTML skeleton, missing all dynamically rendered content. Playwright ensures we capture the complete, final state of the page after all JavaScript has executed.

## System Prompt Highlights

The system prompts ensure high-quality remixes by specifying:

- Complete HTML5 document structure
- Self-contained styling (no external dependencies)
- Authentic aesthetics for the chosen style (e.g., for 8-bit: pixel fonts, retro colors, CRT effects)
- Functional layout preservation
- Creative interpretation with style-appropriate metaphors
- Responsive and accessible design

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Start the server
npm start

# Run tests
npm test
```

## Architecture

```
apps/remix/
├── src/
│   ├── config.ts          # Configuration and environment variables
│   ├── logger.ts          # Bunyan logger instance
│   ├── webServer.ts       # Express server setup
│   ├── libs/
│   │   ├── openai.ts      # OpenAI client factory and remix logic
│   │   └── Browser.ts     # Playwright headless browser utilities
│   └── routes/
│       ├── index.ts       # Route binding
│       └── convert.ts     # Wildcard route for URL remixing
├── Dockerfile
├── LICENSE
├── README.md
├── package.json
└── tsconfig.json
```

## Dependencies

- `express`: Web server
- `playwright`: Headless browser for JavaScript rendering
- `openai`: OpenAI API client
- `dotenv`: Environment variable management
- `bunyan`: Structured logging
- `@grep3/core`: Core utilities (Markdown conversion)

## Limitations

- The quality of the remix depends on the target website's structure
- Large or complex websites may require higher token limits
- The AI may occasionally need refinement for optimal styling
- Some websites may block automated browsers or require authentication
- Heavy websites may take 10-30 seconds to fully render before remixing
- Token limits may truncate very large websites (use OPENAI_MODEL with higher limits if needed)

## Future Enhancements

- Caching of remixed websites
- User-customizable color palettes and style parameters
- Additional style options (modern/sleek, minimalist, brutalist, etc.)
- Style selection via URL parameter or query string
- Preview mode before full remix
- Support for saving/sharing remixed sites

## License

MIT
