interface IStringMap {
  [key: string]: any;
}

interface IGitAuthOptions {
  type: string;
  repo: string;
  user(
    check: (username: string, password: string) => Promise<void>
  ): Promise<void>;
}
