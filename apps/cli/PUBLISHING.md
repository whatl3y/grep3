# Publishing Guide for grep3 CLI

This guide explains how to publish the `grep3` CLI package to NPM.

## Prerequisites

1. You must have an NPM account. Create one at https://www.npmjs.com/signup if needed.
2. Login to NPM on your local machine:
   ```bash
   npm login
   ```
3. Verify you're logged in:
   ```bash
   npm whoami
   ```

## Publishing Steps

### 1. Update Version

Before publishing, update the version number in `package.json` following [Semantic Versioning](https://semver.org/):

- **Patch release** (bug fixes): `0.0.1` → `0.0.2`
  ```bash
  npm version patch
  ```

- **Minor release** (new features, backward compatible): `0.0.1` → `0.1.0`
  ```bash
  npm version minor
  ```

- **Major release** (breaking changes): `0.0.1` → `1.0.0`
  ```bash
  npm version major
  ```

The `npm version` command will:
- Update the version in `package.json`
- Create a git commit with the new version
- Create a git tag for the release

### 2. Build the Project

The build will run automatically during publish due to the `prepublishOnly` script, but you can test it manually:

```bash
npm run build
```

### 3. Test the Package Locally (Optional but Recommended)

Before publishing, test what will be included in the package:

```bash
npm pack --dry-run
```

This shows all files that will be included in the published package.

To test the package locally before publishing:

```bash
# Create a tarball
npm pack

# Install it globally from the tarball
npm install -g ./grep3-0.0.1.tgz

# Test the CLI
grep3 --help
grep3 merkletree --help

# Uninstall when done testing
npm uninstall -g grep3
```

### 4. Publish to NPM

When you're ready to publish:

```bash
npm publish
```

The `prepublishOnly` script will automatically:
1. Run `npm run build` to compile TypeScript
2. Create the `dist` folder with compiled files

### 5. Push Git Changes

After publishing, push your version commit and tag to GitHub:

```bash
git push origin main
git push origin --tags
```

## What Gets Published

The `files` field in `package.json` controls what gets published:
- `dist/` - Compiled JavaScript and TypeScript declarations
- `LICENSE` - MIT license file
- `README.md` - Documentation

The `.npmignore` file excludes:
- Source TypeScript files (`src/`)
- Configuration files (`.env`, `tsconfig.json`)
- Development files (`node_modules/`, `.git/`)

## Verifying Publication

After publishing, verify the package:

1. View on NPM: https://www.npmjs.com/package/grep3
2. Install globally to test:
   ```bash
   npm install -g grep3
   grep3 --version
   grep3 --help
   ```

## Unpublishing (Use with Caution)

If you need to unpublish a version (only within 72 hours of publishing):

```bash
npm unpublish grep3@0.0.1
```

**Warning:** Unpublishing is discouraged and can break other projects that depend on your package.

## Quick Reference

```bash
# Update version and publish
npm version patch              # or minor, or major
npm publish
git push origin main --tags

# Test before publishing
npm pack --dry-run
npm pack && npm install -g ./grep3-*.tgz
grep3 --help

# Check what version is currently published
npm view grep3 version
npm view grep3 versions  # All versions
```

## Troubleshooting

### Error: Package name already taken
If `grep3` is already taken on NPM, you'll need to:
1. Choose a different name (e.g., `@yourusername/grep3` or `grep3-cli`)
2. Update the `name` field in `package.json`
3. Update the README

### Error: You must be logged in
Run `npm login` and authenticate with your NPM account.

### Error: You do not have permission to publish
Make sure the `publishConfig.access` is set to `"public"` in `package.json` (already configured).

### Build fails during publish
The `prepublishOnly` script runs TypeScript compilation. Check for TypeScript errors:
```bash
npm run build
```
