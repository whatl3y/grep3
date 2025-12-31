import { Readable } from "stream";
import DockerExecutor from "./docker";
import FlyExecutor from "./fly";
import ECSExecutor from "./ecs";
import { IFactoryOptions } from "../factory";
import config from "../config";

export default { DockerExecutor, FlyExecutor, ECSExecutor };

export interface IEnvVars {
  [key: string]: string;
}

export interface IExecutor {
  run(
    addressDirectoryRoot: string,
    repoAddress: string,
    repoName: string,
    envVars?: IEnvVars
  ): Promise<Readable>;
}

export function getExecutor(opts: IFactoryOptions): IExecutor {
  if (config.aws.ecs.subnets.length > 0 && config.aws.ecs.executionRoleArn) {
    return ECSExecutor(opts, {
      accessKey: config.aws.accessKey,
      secretAccessKey: config.aws.secretAccessKey,
      region: config.aws.ecs.region,
      cluster: config.aws.ecs.cluster,
      subnets: config.aws.ecs.subnets,
      securityGroups: config.aws.ecs.securityGroups,
      assignPublicIp: config.aws.ecs.assignPublicIp,
      cpu: config.aws.ecs.cpu,
      memory: config.aws.ecs.memory,
      logGroup: config.aws.ecs.logGroup,
      taskRoleArn: config.aws.ecs.taskRoleArn,
      executionRoleArn: config.aws.ecs.executionRoleArn,
    });
  } else if (config.fly.flyApiToken && config.fly.flyRegistryToken) {
    return FlyExecutor(opts, {
      flyApiToken: config.fly.flyApiToken,
      flyRegistryToken: config.fly.flyRegistryToken,
      flyAppName: config.fly.flyAppName,
    });
  } else {
    return DockerExecutor(opts);
  }
}
