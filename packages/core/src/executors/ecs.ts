import path from "path";
import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import { Readable } from "stream";
import { pack } from "tar-fs";
import {
  ECSClient,
  RunTaskCommand,
  DescribeTasksCommand,
  RegisterTaskDefinitionCommand,
  DeregisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";
import {
  ECRClient,
  GetAuthorizationTokenCommand,
  CreateRepositoryCommand,
  DescribeRepositoriesCommand,
} from "@aws-sdk/client-ecr";
import {
  CloudWatchLogsClient,
  GetLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { IExecutor } from ".";
import { IFactoryOptions } from "../factory";
import FileManagement from "../libs/FileManagement";
import GitClient from "../libs/GitClient";
import docker from "../libs/Docker";
import { sleep } from "../libs/Utils";

export interface ECSExecutorOptions {
  accessKey?: string;
  secretAccessKey?: string;
  region?: string;
  cluster?: string;
  subnets: string[];
  securityGroups?: string[];
  assignPublicIp?: boolean;
  cpu?: string;
  memory?: string;
  logGroup?: string;
  taskRoleArn?: string;
  executionRoleArn: string;
}

export default function ECSExecutor(
  { log }: IFactoryOptions,
  options: ECSExecutorOptions
): IExecutor {
  const fileMgmt = FileManagement();
  const {
    accessKey,
    secretAccessKey,
    region = "us-east-1",
    cluster = "default",
    subnets,
    securityGroups = [],
    assignPublicIp = true,
    cpu = "256",
    memory = "512",
    logGroup = "/ecs/grep3",
    taskRoleArn,
    executionRoleArn,
  } = options;

  if (!subnets || subnets.length === 0) {
    throw new Error("ECS_SUBNETS is required for ECSExecutor");
  }

  if (!executionRoleArn) {
    throw new Error("ECS_EXECUTION_ROLE_ARN is required for ECSExecutor");
  }

  const credentials =
    accessKey && secretAccessKey
      ? {
          accessKeyId: accessKey,
          secretAccessKey,
        }
      : undefined;

  const ecsClient = new ECSClient({ region, credentials });
  const ecrClient = new ECRClient({ region, credentials });
  const logsClient = new CloudWatchLogsClient({ region, credentials });

  async function getECRAuthToken(): Promise<{
    token: string;
    endpoint: string;
  }> {
    const response = await ecrClient.send(new GetAuthorizationTokenCommand({}));
    const authData = response.authorizationData?.[0];
    if (!authData?.authorizationToken || !authData.proxyEndpoint) {
      throw new Error("Failed to get ECR authorization token");
    }

    return {
      token: authData.authorizationToken,
      endpoint: authData.proxyEndpoint,
    };
  }

  async function ensureECRRepository(repositoryName: string): Promise<string> {
    try {
      const response = await ecrClient.send(
        new DescribeRepositoriesCommand({
          repositoryNames: [repositoryName],
        })
      );
      const repoUri = response.repositories?.[0]?.repositoryUri;
      if (!repoUri) {
        throw new Error("Repository URI not found");
      }
      log.debug(`ECR repository ${repositoryName} already exists: ${repoUri}`);
      return repoUri;
    } catch (error: any) {
      if (error.name === "RepositoryNotFoundException") {
        log.debug(`Creating ECR repository: ${repositoryName}`);
        const response = await ecrClient.send(
          new CreateRepositoryCommand({
            repositoryName,
          })
        );
        const repoUri = response.repository?.repositoryUri;
        if (!repoUri) {
          throw new Error("Failed to create ECR repository");
        }
        log.debug(`ECR repository created: ${repoUri}`);
        return repoUri;
      }
      throw error;
    }
  }

  async function registerTaskDefinition(
    family: string,
    imageUri: string,
    envVars?: { [key: string]: string }
  ): Promise<string> {
    const environment = envVars
      ? Object.keys(envVars).map((key) => ({
          name: key,
          value: envVars[key],
        }))
      : [];

    const logStreamPrefix = `task-${Date.now()}`;

    const response = await ecsClient.send(
      new RegisterTaskDefinitionCommand({
        family,
        networkMode: "awsvpc",
        requiresCompatibilities: ["FARGATE"],
        cpu,
        memory,
        executionRoleArn,
        taskRoleArn,
        containerDefinitions: [
          {
            name: "main",
            image: imageUri,
            essential: true,
            environment,
            logConfiguration: {
              logDriver: "awslogs",
              options: {
                "awslogs-group": logGroup,
                "awslogs-region": region,
                "awslogs-stream-prefix": logStreamPrefix,
              },
            },
          },
        ],
      })
    );

    const taskDefArn = response.taskDefinition?.taskDefinitionArn;
    if (!taskDefArn) {
      throw new Error("Failed to register task definition");
    }

    log.debug(`Registered task definition: ${taskDefArn}`);
    return taskDefArn;
  }

  async function runTask(
    taskDefinitionArn: string
  ): Promise<{ taskArn: string; logStreamName: string }> {
    const response = await ecsClient.send(
      new RunTaskCommand({
        cluster,
        taskDefinition: taskDefinitionArn,
        launchType: "FARGATE",
        networkConfiguration: {
          awsvpcConfiguration: {
            subnets,
            securityGroups,
            assignPublicIp: assignPublicIp ? "ENABLED" : "DISABLED",
          },
        },
      })
    );

    const task = response.tasks?.[0];
    if (!task?.taskArn) {
      const failures = response.failures || [];
      throw new Error(
        `Failed to run task: ${JSON.stringify(failures, null, 2)}`
      );
    }

    const taskArn = task.taskArn;
    const taskId = taskArn.split("/").pop() || "";
    const logStreamName = `task-${Date.now()}/main/${taskId}`;

    log.debug(`Started ECS task: ${taskArn}`);
    return { taskArn, logStreamName };
  }

  async function waitForTaskCompletion(
    taskArn: string,
    timeoutSeconds: number = 600
  ): Promise<void> {
    const pollInterval = 5000; // 5 seconds
    const maxAttempts = Math.floor((timeoutSeconds * 1000) / pollInterval);

    log.debug(`Waiting for task ${taskArn} to complete...`);

    for (let i = 0; i < maxAttempts; i++) {
      const response = await ecsClient.send(
        new DescribeTasksCommand({
          cluster,
          tasks: [taskArn],
        })
      );

      const task = response.tasks?.[0];
      if (!task) {
        throw new Error(`Task ${taskArn} not found`);
      }

      const status = task.lastStatus;
      log.debug(`Task ${taskArn} status: ${status}`);

      if (status === "STOPPED") {
        const exitCode = task.containers?.[0]?.exitCode;
        const reason = task.stoppedReason || "Unknown";

        log.debug(
          `Task stopped with exit code: ${exitCode}, reason: ${reason}`
        );

        if (exitCode !== 0) {
          throw new Error(`Task failed with exit code ${exitCode}: ${reason}`);
        }

        return;
      }

      await sleep(pollInterval);
    }

    throw new Error(
      `Task ${taskArn} did not complete within ${timeoutSeconds} seconds`
    );
  }

  async function getTaskLogs(logStreamName: string): Promise<string> {
    log.debug(`Fetching logs from stream: ${logStreamName}`);

    try {
      // Wait a moment for logs to be available
      await sleep(2000);

      const response = await logsClient.send(
        new GetLogEventsCommand({
          logGroupName: logGroup,
          logStreamName,
          startFromHead: true,
        })
      );

      const events = response.events || [];
      const logs = events.map((event) => event.message || "").join("");

      log.debug(`Retrieved ${events.length} log events`);
      return logs;
    } catch (error: any) {
      log.error(`Error fetching logs: ${error.message}`);
      // Return empty string if logs aren't available yet
      return `Error fetching logs: ${error.message}`;
    }
  }

  async function deregisterTaskDef(taskDefinitionArn: string): Promise<void> {
    try {
      await ecsClient.send(
        new DeregisterTaskDefinitionCommand({
          taskDefinition: taskDefinitionArn,
        })
      );
      log.debug(`Deregistered task definition: ${taskDefinitionArn}`);
    } catch (error: any) {
      log.error(`Error deregistering task definition: ${error.message}`);
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
        log.debug(`Successfully pulled repo to ${repoExecutionFilePath}`);

        const repoTarStream = createWriteStream(repoExecutionTarballPath);
        pack(repoExecutionFilePath).pipe(repoTarStream);

        await new Promise((resolve, reject) => {
          repoTarStream.on("finish", () => resolve(null));
          repoTarStream.on("error", (err: any) => reject(err));
        });
        log.debug(
          `Successfully created repo tarball: ${repoExecutionTarballPath}`
        );
      }

      // Check for Dockerfile
      const dockerfilePath = path.join(repoExecutionFilePath, "Dockerfile");
      if (!(await fileMgmt.doesDirOrFileExist(dockerfilePath))) {
        throw new Error(
          `Dockerfile not found in repository at ${dockerfilePath}`
        );
      }

      // Build image locally
      log.debug("Building Docker image locally...");
      const buildStream = await docker.buildImage(repoExecutionTarballPath);
      const imageInfo: any = await new Promise((resolve, reject) => {
        docker.modem.followProgress(
          buildStream,
          (err: null | Error, res: any[]) => (err ? reject(err) : resolve(res))
        );
      });

      const imgHash = imageInfo.find((p: any) => Object.keys(p)[0] === "aux")
        .aux.ID;
      log.debug(`Successfully created image: ${imgHash}`);

      // Prepare ECR repository
      const repoNameClean = repoName
        .replace(/\.git$/, "")
        .replace(/[^a-zA-Z0-9._-]/g, "-")
        .toLowerCase();
      const ecrRepoName = `grep3/${repoNameClean}`;
      const repoUri = await ensureECRRepository(ecrRepoName);

      // Get ECR auth token
      const { token: authToken, endpoint: ecrEndpoint } =
        await getECRAuthToken();
      const [username, password] = Buffer.from(authToken, "base64")
        .toString()
        .split(":");

      // Tag image for ECR
      const imageTag = `exec-${Date.now()}`;
      const ecrImageUri = `${repoUri}:${imageTag}`;
      const image = docker.getImage(imgHash);
      await image.tag({
        repo: repoUri,
        tag: imageTag,
      });
      log.debug(`Tagged image as ${ecrImageUri}`);

      // Push to ECR
      log.debug(`Pushing image to ECR: ${ecrImageUri}`);
      const taggedImage = docker.getImage(ecrImageUri);
      const pushStream = await taggedImage.push({
        authconfig: {
          username,
          password,
          serveraddress: ecrEndpoint,
        },
      });

      await new Promise((resolve, reject) => {
        docker.modem.followProgress(
          pushStream,
          (err: null | Error, res: any[]) => {
            if (err) {
              log.error("Docker push error:", err);
              return reject(err);
            }

            const hasError = res.some((r: any) => r.error || r.errorDetail);
            if (hasError) {
              const errorItem = res.find((r: any) => r.error || r.errorDetail);
              log.error("Push failed with error:", errorItem);
              return reject(
                new Error(
                  `Image push failed: ${
                    errorItem.error || JSON.stringify(errorItem.errorDetail)
                  }`
                )
              );
            }

            resolve(res);
          }
        );
      });

      log.debug("Image push completed successfully");

      // Register task definition
      const taskFamily = `grep3-${repoNameClean}`;
      const taskDefinitionArn = await registerTaskDefinition(
        taskFamily,
        ecrImageUri,
        envVars
      );

      let taskArn: string | undefined;
      let logStreamName: string | undefined;

      try {
        // Run task
        const taskInfo = await runTask(taskDefinitionArn);
        taskArn = taskInfo.taskArn;
        logStreamName = taskInfo.logStreamName;

        // Wait for task to complete
        await waitForTaskCompletion(taskArn);

        // Fetch logs
        const logs = await getTaskLogs(logStreamName);

        // Convert logs to Readable stream
        const stream = new Readable();
        stream.push(logs);
        stream.push(null); // Signal end of stream

        return stream;
      } catch (error: any) {
        log.error(`Error executing ECS task: ${error.message}`);

        // Try to get logs even if execution failed
        if (logStreamName) {
          try {
            const logs = await getTaskLogs(logStreamName);
            log.error(`Task logs:`, logs);
          } catch (logError) {
            log.error(`Could not fetch task logs:`, logError);
          }
        }

        throw error;
      } finally {
        // Clean up task definition
        await deregisterTaskDef(taskDefinitionArn);
      }
    },
  };
}
