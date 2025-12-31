# Local Development Guide

This guide explains how to set up and work with the grep3 CLI locally.

## Initial Setup

1. **Install dependencies:**
   ```bash
   cd apps/cli
   npm install
   ```

2. **Build the project:**
   ```bash
   npm run build
   ```

3. **Link globally for local testing:**
   ```bash
   npm link
   ```

   This creates a symlink from your global npm bin directory to `dist/index.js`. Now you can run `grep3` from anywhere on your system, and it will use your local development version.

4. **Verify the link:**
   ```bash
   grep3 --version
   grep3 --help
   ```

## Development Workflow

### Option 1: Watch Mode (Recommended)

Run TypeScript in watch mode to automatically rebuild on file changes:

```bash
npm run watch
```

Keep this running in a terminal. Now whenever you edit TypeScript files in `src/`, they'll automatically be compiled to `dist/`. Since the global `grep3` command is symlinked to your local `dist/index.js`, your changes are immediately available.

**Test your changes:**
```bash
# In another terminal
grep3 merkletree --help
grep3 merkletree generate-raw '[[1,2],[3,4]]'
```

### Option 2: Manual Build

After making changes:

```bash
npm run build
grep3 --help  # Test your changes
```

## Testing Changes

1. Make changes to TypeScript files in `src/`
2. Build (automatic if using watch mode)
3. Run `grep3` commands to test
4. Repeat

Example workflow:
```bash
# Terminal 1: Watch mode
npm run watch

# Terminal 2: Test commands
grep3 --version
grep3 merkletree status abc-123
```

## Unlinking (Cleanup)

When you're done with local development and want to remove the global link:

```bash
npm unlink -g grep3
```

Or from the apps/cli directory:
```bash
npm unlink
```

## Project Structure

```
apps/cli/
├── src/
│   ├── index.ts              # Main entry point
│   ├── commands/
│   │   ├── index.ts          # Command registration
│   │   └── merkletree/       # Merkletree commands
│   ├── config.ts             # Configuration
│   └── types.ts              # TypeScript types
├── dist/                     # Compiled JavaScript (generated)
├── package.json
└── tsconfig.json
```

## Debugging

### Check if link exists:
```bash
which grep3
# Should show: /Users/YOUR_USER/.nvm/versions/node/vX.X.X/bin/grep3
```

### Check symlink target:
```bash
ls -la $(which grep3)
# Should show: grep3 -> ../lib/node_modules/grep3/dist/index.js
```

### View the actual file being executed:
```bash
readlink -f $(which grep3)
# Should point to your local dist/index.js
```

### If grep3 command not found:

1. Ensure npm link ran successfully from apps/cli directory
2. Check that your PATH includes npm's global bin directory:
   ```bash
   echo $PATH | grep -o '[^:]*npm[^:]*'
   ```
3. Re-run npm link:
   ```bash
   cd apps/cli
   npm link
   ```

## Adding New Commands

1. Create a new file in `src/commands/` (or subdirectory)
2. Export a function that registers the command with Commander.js
3. Import and call it in `src/commands/index.ts`
4. Build and test:
   ```bash
   npm run build
   grep3 your-new-command --help
   ```

Example:
```typescript
// src/commands/example.ts
import { Command } from "commander";

export default function registerExampleCommand(program: Command) {
  program
    .command("example")
    .description("Example command")
    .action(async () => {
      console.log("Hello from example command!");
    });
}
```

```typescript
// src/commands/index.ts
import registerExampleCommand from "./example";

export default function registerCommands(program: Command) {
  // ... existing commands
  registerExampleCommand(program);
}
```

## Tips

- **Use watch mode** during active development for instant feedback
- **Test thoroughly** before publishing to npm
- **Commit your changes** regularly
- **Update version** in package.json before publishing
- The `prepublishOnly` script ensures the project is built before publishing
