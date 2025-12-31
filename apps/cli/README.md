# grep3

CLI for interacting with grep3 APIs.

## Installation

### Global Installation (Recommended)

```bash
npm install -g grep3
```

After global installation, you can use the `grep3` command from anywhere:

```bash
grep3 --help
```

### Local Development

First, install dependencies and build:

```bash
npm install
npm run build
```

To link the CLI globally for local testing (so you can run `grep3` command):

```bash
npm link
```

Now you can use the `grep3` command anywhere on your system, and it will use your local development version.

To automatically rebuild on file changes:

```bash
npm run watch
```

This will watch for TypeScript changes and automatically recompile. Since the global `grep3` command is symlinked to your local `dist/index.js`, changes will be immediately available.

## Usage

### General

```bash
grep3 --help
```

### Merkletree Commands

The CLI provides a `merkletree` namespace for interacting with the merkletree API.

#### Generate Merkle Tree from Raw Data

```bash
grep3 merkletree generate-raw '[["value1", "value2"], ["value3", "value4"]]'
```

This command takes a JSON array of arrays and submits it to the merkletree API for processing.

#### Generate Merkle Tree from CSV File

```bash
grep3 merkletree generate-file path/to/file.csv
```

This command uploads a CSV file to the merkletree API for processing.

#### Check Job Status

```bash
grep3 merkletree status <job-uuid>
```

Check the status of a merkle tree generation job using its UUID.

#### Get Proof for a Leaf

```bash
grep3 merkletree proof <root-hash> <unique-id>
```

Retrieve the merkle proof for a specific leaf in a generated tree.

## Configuration

Set the merkletree API URL via environment variable:

```bash
export MERKLETREE_API_URL=http://localhost:8002
```

Default: `http://localhost:8002`

## Development

Build the project:

```bash
npm run build
```

Run directly:

```bash
node dist/index.js --help
```

## Publishing to NPM

See [PUBLISHING.md](PUBLISHING.md) for detailed instructions.

```bash
npm version patch  # or minor/major
npm publish
git push origin main --tags
```
