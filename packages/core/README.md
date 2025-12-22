# @grep3/core

Core package for grep3 - Execute code in isolated environments using Docker or Fly.io.

## Executors

This package provides multiple execution strategies for running containerized workloads:

### DockerExecutor

Executes code directly against a Docker server using the Docker API.

**Usage:**

```typescript
import { DockerExecutor } from "@grep3/core/executors";
import { IFactoryOptions } from "@grep3/core/factory";

const factoryOptions: IFactoryOptions = { log: yourLogger };
const executor = DockerExecutor(factoryOptions);

const stream = await executor.run(
  "/path/to/work/dir",
  "https://github.com/user/repo.git",
  "repo.git",
  { ENV_VAR: "value" }
);
```

### FlyExecutor

Executes code by spinning up ephemeral Fly.io machines that build and run Docker containers remotely.

**Usage:**

```typescript
import { FlyExecutor } from "@grep3/core/executors";
import { IFactoryOptions } from "@grep3/core/factory";

const factoryOptions: IFactoryOptions = { log: yourLogger };
const executor = FlyExecutor(factoryOptions, {
  flyApiToken: process.env.FLY_API_TOKEN,
  flyAppName: "my-fly-app",
  flyRegion: "iad", // optional, defaults to "iad"
});

const stream = await executor.run(
  "/path/to/work/dir",
  "https://github.com/user/repo.git",
  "repo.git",
  { ENV_VAR: "value" }
);
```

**Configuration:**

- `flyApiToken`: Your Fly.io API token (required)
- `flyAppName`: The name of your Fly.io app (required)
- `flyRegion`: The Fly.io region to deploy to (optional, defaults to "iad")

**Requirements:**

- A Dockerfile must exist in the root of the repository
- The Fly.io app must be created beforehand (`fly apps create <app-name>`)
- A valid Fly.io API token with permissions to create machines

**Note:** The current implementation is a minimal working version. For production use, you should:

1. Implement proper image building and registry push workflows
2. Add support for streaming logs from Fly.io machines
3. Handle machine lifecycle events more robustly
4. Consider using Fly's remote builder for image creation

## Interface

All executors implement the `IExecutor` interface:

```typescript
interface IExecutor {
  run(
    addressDirectoryRoot: string,
    repoAddress: string,
    repoName: string,
    envVars?: IEnvVars
  ): Promise<Readable>;
}
```

The `run` method:

- Clones the repository if needed
- Builds and executes the container
- Returns a Readable stream of the execution output
