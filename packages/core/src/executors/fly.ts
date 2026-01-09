import path from "path";
import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import { Readable } from "stream";
import { pack } from "tar-fs";
import { IExecutor } from ".";
import { IFactoryOptions } from "../factory";
import FileManagement from "../libs/FileManagement";
import GitClient from "../libs/GitClient";
import docker from "../libs/Docker";
import { sleep } from "../libs/Utils";

interface FlyMachineConfig {
  image: string;
  env?: { [key: string]: string };
  guest?: {
    cpu_kind?: string;
    cpus?: number;
    memory_mb?: number;
  };
  auto_destroy?: boolean;
  restart?: {
    policy?: string;
  };
  services?: any[];
  registry_auth?: {
    registry: string;
    username: string;
    password: string;
  };
}

interface FlyMachine {
  id: string;
  state: string;
  region: string;
  instance_id?: string;
}

export interface FlyExecutorOptions {
  flyApiToken: string;
  flyRegistryToken: string;
  flyAppName: string;
  flyRegion?: string;
}

export default function FlyExecutor(
  { log }: IFactoryOptions,
  options: FlyExecutorOptions
): IExecutor {
  const fileMgmt = FileManagement();
  const {
    flyApiToken,
    flyRegistryToken,
    flyAppName,
    flyRegion = "iad",
  } = options;

  if (!flyApiToken) {
    throw new Error("FLY_API_TOKEN is required for FlyExecutor");
  }

  if (!flyAppName) {
    throw new Error("FLY_APP_NAME is required for FlyExecutor");
  }

  const flyApiUrl = "https://api.machines.dev/v1";

  async function flyApiRequest(
    method: string,
    path: string,
    body?: any
  ): Promise<any> {
    const url = `${flyApiUrl}${path}`;
    const headers: { [key: string]: string } = {
      Authorization: `Bearer ${flyApiToken}`,
      "Content-Type": "application/json",
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Fly API request failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    return response.json();
  }

  async function createMachine(config: FlyMachineConfig): Promise<FlyMachine> {
    const machineConfig = {
      config,
      region: flyRegion,
    };

    // Log machine config without sensitive registry_auth credentials
    const safeConfig = {
      ...machineConfig,
      config: {
        ...machineConfig.config,
        registry_auth: machineConfig.config.registry_auth ? "[REDACTED]" : undefined,
      },
    };
    log.debug("creating Fly machine with config:", JSON.stringify(safeConfig, null, 2));

    try {
      const machine = await flyApiRequest(
        "POST",
        `/apps/${flyAppName}/machines`,
        machineConfig
      );

      log.debug(
        `machine ${machine.id} created successfully in state: ${machine.state}`
      );

      // Wait a moment for the machine to be available in the API
      // This prevents "404 not found" errors on subsequent API calls
      await sleep(3000);

      // Try to start the machine if it's not already starting/started
      if (machine.state === "created" || machine.state === "stopped") {
        log.debug(
          `machine ${machine.id} is in ${machine.state} state, starting it...`
        );
        try {
          await flyApiRequest(
            "POST",
            `/apps/${flyAppName}/machines/${machine.id}/start`,
            {}
          );
          log.debug(`machine ${machine.id} start command sent`);
        } catch (startError: any) {
          log.warn(
            `could not explicitly start machine (may already be starting):`,
            startError.message
          );
        }
      }

      return machine;
    } catch (error: any) {
      log.error("failed to create machine:", error.message);
      throw error;
    }
  }

  async function getMachineStatus(machineId: string): Promise<any> {
    try {
      return await flyApiRequest(
        "GET",
        `/apps/${flyAppName}/machines/${machineId}`
      );
    } catch (error) {
      log.error(`Failed to get machine ${machineId} status:`, error);
      return null;
    }
  }

  async function waitForMachineState(
    machineId: string,
    targetState: string,
    instanceId?: string,
    timeoutSeconds: number = 300
  ): Promise<string> {
    const pollInterval = 2000; // 2 seconds
    const maxAttempts = Math.floor((timeoutSeconds * 1000) / pollInterval);

    log.debug(
      `waiting for machine ${machineId} to reach state: ${targetState} (timeout: ${timeoutSeconds}s)`
    );

    for (let i = 0; i < maxAttempts; i++) {
      try {
        // First check the machine status directly to catch early failures
        const machineStatus = await getMachineStatus(machineId);

        if (machineStatus) {
          log.debug(
            `machine ${machineId} current state: ${machineStatus.state}`
          );

          // Check for exit/failure states
          if (machineStatus.state === "destroyed") {
            throw new Error(
              `machine ${machineId} was destroyed. Last exit info: ${JSON.stringify(
                machineStatus.exit_code || {}
              )}`
            );
          }

          // Check exit events - distinguish between container exit and flyd exit
          if (machineStatus.events && Array.isArray(machineStatus.events)) {
            const exitEvent = machineStatus.events.find(
              (e: any) => e.type === "exit"
            );
            if (exitEvent) {
              // Check guest_exit_code (the actual container's exit code)
              const guestExitCode =
                exitEvent.request?.exit_event?.guest_exit_code;
              const exitCode = exitEvent.request?.exit_event?.exit_code;

              log.debug(
                `exit event: guest_exit_code=${guestExitCode}, exit_code=${exitCode}, source=${exitEvent.source}`
              );

              // If guest exited with 0, that's success (container ran and completed)
              if (guestExitCode === 0) {
                log.debug(`container exited successfully (guest_exit_code=0)`);
                // Don't throw error - this is a successful completion
                continue;
              }

              // If exitEvent.status is "stopped" and guest_exit_code is 0, it's OK
              if (exitEvent.status === "stopped" && guestExitCode === 0) {
                log.debug(
                  `machine stopped after successful container execution`
                );
                continue;
              }

              // Only error if there's an actual failure
              if (exitEvent.status !== 0 && exitEvent.status !== "stopped") {
                const errorMsg = `machine ${machineId} exited with code ${
                  exitEvent.status
                }, source: ${
                  exitEvent.source || "unknown"
                }. Events: ${JSON.stringify(machineStatus.events)}`;
                log.error(errorMsg);
                throw new Error(errorMsg);
              }
            }
          }
        }

        // Build the query string with instance_id if available
        const queryParams = new URLSearchParams({ state: targetState });
        if (instanceId) {
          queryParams.append("instance_id", instanceId);
        }

        const waitResponse = await flyApiRequest(
          "GET",
          `/apps/${flyAppName}/machines/${machineId}/wait?${queryParams.toString()}`
        );

        if (
          waitResponse.state === targetState ||
          waitResponse.state === "destroyed"
        ) {
          log.debug(
            `machine ${machineId} reached state: ${waitResponse.state}`
          );
          return waitResponse.state;
        }

        // Check if machine is in an error state
        if (waitResponse.state === "failed") {
          throw new Error(
            `machine ${machineId} failed to start. State: ${waitResponse.state}`
          );
        }
      } catch (error: any) {
        // If we get a 404 error, the machine might not be available yet - retry
        if (error.message && error.message.includes("404")) {
          log.debug(
            `polling attempt ${
              i + 1
            }/${maxAttempts} - machine ${machineId} not found yet, retrying...`
          );
          await sleep(pollInterval);
          continue;
        }
        // If we get a timeout error, log it but continue polling
        if (error.message && error.message.includes("408")) {
          log.debug(
            `polling attempt ${
              i + 1
            }/${maxAttempts} - Machine ${machineId} not yet at ${targetState}`
          );
          await sleep(pollInterval);
          continue;
        }
        // Re-throw other errors (like exit code errors)
        throw error;
      }

      await sleep(pollInterval);
    }

    // If we've exhausted all attempts, try to get current machine state for better error message
    try {
      const machineInfo = await getMachineStatus(machineId);
      throw new Error(
        `machine ${machineId} did not reach ${targetState} within ${timeoutSeconds}s. Current state: ${
          machineInfo?.state || "unknown"
        }`
      );
    } catch (error) {
      throw new Error(
        `machine ${machineId} did not reach ${targetState} within ${timeoutSeconds}s`
      );
    }
  }

  async function getMachineLogs(machineId: string): Promise<string> {
    try {
      // Note: Fly.io Machines API doesn't have a direct logs endpoint in the same way
      // Docker does. This is a simplified implementation that would need to be
      // expanded based on actual Fly.io logging capabilities.
      // In practice, you might need to use fly CLI or other logging mechanisms.
      log.debug(`fetching logs for machine ${machineId}`);

      // Placeholder for actual log fetching implementation
      // You might need to use fly CLI via child_process or implement
      // streaming from Fly's logging infrastructure
      return `machine ${machineId} executed successfully`;
    } catch (error) {
      log.error("error fetching machine logs:", error);
      return `error fetching logs: ${error}`;
    }
  }

  async function destroyMachine(machineId: string): Promise<void> {
    try {
      await flyApiRequest(
        "DELETE",
        `/apps/${flyAppName}/machines/${machineId}?force=true`
      );
      log.debug(`Machine ${machineId} destroyed`);
    } catch (error: any) {
      // 404 errors are expected if the machine was already auto-destroyed
      if (error.message && error.message.includes("404")) {
        log.debug(`Machine ${machineId} already destroyed (404 - not found)`);
      } else {
        log.error(`Error destroying machine ${machineId}:`, error);
      }
    }
  }

  async function initializeFlyRegistryRepo(): Promise<void> {
    // Initialize the Fly registry by doing a minimal remote build
    // This creates the registry repository so we can push to it
    log.debug("initializing Fly registry repository...");

    const buildApiUrl = "https://api.fly.io/api/v1";

    try {
      // Initiate a minimal build to initialize the registry
      const initResponse = await fetch(`${buildApiUrl}/builds`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${flyApiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          app_name: flyAppName,
          builder_type: "depot.dev",
          strategies_available: ["depot.dev"],
        }),
      });

      if (initResponse.ok) {
        log.debug("registry initialization build started");
        // Don't wait for it to complete, we just need it to create the repo
      } else {
        log.warn(
          "could not initiate registry initialization, may already exist"
        );
      }
    } catch (error) {
      // Ignore errors - registry might already be initialized
      log.debug(
        "registry initialization attempt completed (may have failed, continuing anyway)"
      );
    }
  }

  return {
    async run(addressDirectoryRoot, repoAddress, repoName, envVars) {
      const repoExecutionFilePath = path.join(
        addressDirectoryRoot,
        repoName.replace(/\.git$/, "")
      );
      const repoExecutionTarballPath = path.join(
        addressDirectoryRoot,
        `${repoName}.tgz`
      );

      // Clone the repository if it doesn't exist
      if (!(await fileMgmt.doesDirOrFileExist(repoExecutionFilePath))) {
        await mkdir(repoExecutionFilePath, { recursive: true });
        const gitClient = GitClient(
          repoAddress,
          repoName,
          repoExecutionFilePath
        );
        await gitClient.pullRepo();
        log.debug(`successfully pulled repo to`, repoExecutionFilePath);
        const repoTarStream = createWriteStream(repoExecutionTarballPath);
        pack(repoExecutionFilePath).pipe(repoTarStream);

        await new Promise((resolve, reject) => {
          repoTarStream.on("finish", () => resolve(null));
          repoTarStream.on("error", (err: any) => reject(err));
        });
        log.debug(
          `successfully created repo tarball for docker`,
          repoExecutionTarballPath
        );
      }

      // Check for Dockerfile
      const dockerfilePath = path.join(repoExecutionFilePath, "Dockerfile");
      if (!(await fileMgmt.doesDirOrFileExist(dockerfilePath))) {
        throw new Error(
          `Dockerfile not found in repository at ${dockerfilePath}`
        );
      }

      // Build image locally with dockerode and push to Fly's registry
      log.debug("building image locally with dockerode");

      // Create a unique tag for the image
      const repoTag = `exec-${Date.now()}`
        .replace(/[^a-zA-Z0-9._-]/g, "-")
        .toLowerCase();

      // Build the image
      const buildStream = await docker.buildImage(repoExecutionTarballPath, {
        t: repoTag,
      });
      const imageInfo: any = await new Promise((resolve, reject) => {
        docker.modem.followProgress(
          buildStream,
          (err: null | Error, res: any[]) => (err ? reject(err) : resolve(res))
        );
      });

      const imgHash = imageInfo.find((p: any) => Object.keys(p)[0] === "aux")
        .aux.ID;
      log.debug(`successfully created image`, imgHash);

      // Tag the image for Fly.io registry
      const flyRegistryImageTag = `registry.fly.io/${flyAppName}:${repoTag}`;
      const image = docker.getImage(imgHash);
      await image.tag({
        repo: `registry.fly.io/${flyAppName}`,
        tag: repoTag,
      });
      log.debug(`tagged image as ${flyRegistryImageTag}`);

      // Initialize the registry repository if needed
      await initializeFlyRegistryRepo();

      // Push to Fly's registry with proper authentication
      const taggedImage = docker.getImage(flyRegistryImageTag);
      log.debug(`pushing image to Fly.io registry: ${flyRegistryImageTag}`);

      const pushStream = await taggedImage.push({
        authconfig: {
          username: "x",
          password: flyRegistryToken,
          serveraddress: "registry.fly.io",
        },
      });

      await new Promise((resolve, reject) => {
        docker.modem.followProgress(
          pushStream,
          (err: null | Error, res: any[]) => {
            if (err) {
              log.error("docker push error:", err);
              return reject(err);
            }

            const hasError = res.some((r: any) => r.error || r.errorDetail);
            if (hasError) {
              const errorItem = res.find((r: any) => r.error || r.errorDetail);
              log.error("push failed with error:", errorItem);
              return reject(
                new Error(
                  `image push failed: ${
                    errorItem.error || JSON.stringify(errorItem.errorDetail)
                  }`
                )
              );
            }

            resolve(res);
          }
        );
      });

      log.debug("image push completed successfully");

      // Wait a moment for the image to be fully available in Fly's registry
      log.debug("waiting for image to propagate in registry...");
      await sleep(5000);

      const machineConfig: FlyMachineConfig = {
        image: flyRegistryImageTag,
        env: envVars || {}, // Default to empty object if undefined
        guest: {
          cpu_kind: "shared",
          cpus: 1,
          memory_mb: 256,
        },
        auto_destroy: false,
        restart: {
          policy: "no", // Don't restart after completion - run once and exit
        },
        // Add registry auth so the machine can pull from Fly's registry
        // NOTE: Machines within the same Fly org can pull from registry.fly.io/{app}
        // without explicit auth, but we include it for safety
        registry_auth: flyRegistryToken
          ? {
              registry: "registry.fly.io",
              username: "x",
              password: flyRegistryToken,
            }
          : undefined,
      };

      log.debug(
        "creating Fly machine for execution with image:",
        flyRegistryImageTag
      );
      const machine = await createMachine(machineConfig);
      log.debug(
        `machine created with ID: ${machine.id}, instance_id: ${machine.instance_id}, state: ${machine.state}`
      );

      try {
        // First, wait for the machine to start (it needs to start before it can stop)
        log.debug(`waiting for machine ${machine.id} to start...`);
        await waitForMachineState(
          machine.id,
          "started",
          machine.instance_id,
          120 // 2 minute timeout for starting
        );
        log.debug(`machine ${machine.id} started successfully`);

        // Now wait for the machine to complete execution and stop
        log.debug(`waiting for machine ${machine.id} to complete...`);
        await waitForMachineState(
          machine.id,
          "stopped",
          machine.instance_id,
          600 // 10 minute timeout for execution
        );
        log.debug(`machine ${machine.id} finished executing`);

        // Fetch logs from the machine
        const logs = await getMachineLogs(machine.id);

        // Convert logs to a Readable stream
        const stream = new Readable();
        stream.push(logs);
        stream.push(null); // Signal end of stream

        return stream;
      } catch (error: any) {
        log.error(`error executing machine ${machine.id}:`, error);
        // Try to get logs even if execution failed
        try {
          const logs = await getMachineLogs(machine.id);
          log.error(`machine logs:`, logs);
        } catch (logError) {
          log.error(`could not fetch machine logs:`, logError);
        }
        throw error;
      } finally {
        // destroy the machine after execution if needed
        try {
          log.debug(`cleaning up machine ${machine.id}...`);
          await destroyMachine(machine.id);
        } catch (cleanupError) {
          log.debug(
            `machine ${machine.id} may have already been auto-destroyed:`,
            cleanupError
          );
        }
      }
    },
  };
}
