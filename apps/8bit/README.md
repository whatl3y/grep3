# 8-Bit Website Converter

Transform any website into a sleek, sexy, retro 8-bit version powered by OpenAI's GPT models.

## Overview

This application takes a URL of any website and converts it into a complete, self-contained HTML document with authentic 8-bit graphics and styling. The conversion maintains the structure and content of the original site while reimagining it with retro gaming aesthetics.

## Features

- **Automatic Conversion**: Simply provide a URL and get a fully styled 8-bit version
- **Comprehensive System Prompt**: Highly detailed instructions to GPT ensure consistent, high-quality 8-bit conversions
- **Self-Contained Output**: All CSS and styling embedded in the generated HTML
- **Retro Aesthetics**: Pixel fonts, vibrant retro color palettes, CRT screen effects, and pixel art styling
- **Preserves Functionality**: Maintains the original site's structure and content hierarchy

## Usage

### Starting the Server

```bash
npm run build
npm start
```

The server will start on the port specified in your `.env` file (default: 8088).

### Converting a Website

Visit the following URL pattern in your browser:

```
http://localhost:8088/<target-url>
```

**Examples:**

- `http://localhost:8088/example.com`
- `http://localhost:8088/https://github.com`
- `http://localhost:8088/news.ycombinator.com`

The app will:
1. Launch a headless browser (Puppeteer/Chromium) to fetch the target URL
2. Wait for all JavaScript to execute and the page to fully render
3. Extract the final HTML after all client-side rendering is complete
4. Send the rendered HTML to OpenAI's API with comprehensive 8-bit conversion instructions
5. Return a complete, styled HTML document that renders the site in 8-bit style

## Configuration

Create a `.env` file in the `apps/8bit` directory with the following variables:

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
   - Launches Puppeteer (headless Chromium browser)
   - Navigates to the target URL
   - Waits for all JavaScript to execute (`networkidle2`)
   - Allows React, Vue, Angular, and other client-side frameworks to fully render
   - Removes cookie banners, scripts, and styles to reduce noise
   - Extracts the final, fully-rendered HTML DOM
3. **AI Conversion**: The rendered content is sent to OpenAI with a comprehensive system prompt that includes:
   - Detailed 8-bit styling requirements
   - Color palette guidelines (NES, Game Boy, arcade styles)
   - Typography instructions (pixel fonts, retro styling)
   - Layout preservation rules
   - CSS-based pixel art techniques
   - Retro gaming UI element suggestions
4. **HTML Response**: The generated 8-bit HTML is sent directly to the browser

### Why Headless Browser?

Modern websites heavily rely on client-side JavaScript frameworks. A simple `fetch()` would only retrieve the initial HTML skeleton, missing all dynamically rendered content. Puppeteer ensures we capture the complete, final state of the page after all JavaScript has executed.

## System Prompt Highlights

The system prompt ensures high-quality conversions by specifying:

- Complete HTML5 document structure
- Self-contained styling (no external dependencies)
- Authentic 8-bit aesthetics (pixel fonts, retro colors, CRT effects)
- Functional layout preservation
- Creative interpretation with gaming metaphors
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
apps/8bit/
├── src/
│   ├── config.ts          # Configuration and environment variables
│   ├── logger.ts          # Bunyan logger instance
│   ├── webServer.ts       # Express server setup
│   ├── libs/
│   │   ├── openai.ts      # OpenAI client factory and conversion logic
│   │   └── Browser.ts     # Puppeteer headless browser utilities
│   └── routes/
│       ├── index.ts       # Route binding
│       └── convert.ts     # Wildcard route for URL conversion
├── Dockerfile
├── LICENSE
├── README.md
├── package.json
└── tsconfig.json
```

## Dependencies

- `express`: Web server
- `puppeteer`: Headless browser for JavaScript rendering
- `openai`: OpenAI API client
- `dotenv`: Environment variable management
- `bunyan`: Structured logging
- `@grep3/core`: Core utilities (Markdown conversion)

## Limitations

- The quality of the conversion depends on the target website's structure
- Large or complex websites may require higher token limits
- The AI may occasionally need refinement for optimal 8-bit styling
- Some websites may block automated browsers or require authentication
- Heavy websites may take 10-30 seconds to fully render before conversion
- Token limits may truncate very large websites (use OPENAI_MODEL with higher limits if needed)

## Future Enhancements

- Caching of converted websites
- User-customizable color palettes
- Multiple retro style options (NES, Game Boy, CGA, etc.)
- Preview mode before full conversion
- Support for saving/sharing converted sites

## License

MIT
