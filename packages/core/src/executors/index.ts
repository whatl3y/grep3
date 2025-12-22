import { Readable } from "stream";
import DockerExecutor from "./docker";
import FlyExecutor from "./fly";
import { IFactoryOptions } from "../factory";
import config from "../config";

export default { DockerExecutor, FlyExecutor };

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
  if (config.fly.flyApiToken && config.fly.flyRegistryToken) {
    return FlyExecutor(opts, {
      flyApiToken: config.fly.flyApiToken,
      flyRegistryToken: config.fly.flyRegistryToken,
      flyAppName: config.fly.flyAppName,
    });
  } else {
    return DockerExecutor(opts);
  }
}
