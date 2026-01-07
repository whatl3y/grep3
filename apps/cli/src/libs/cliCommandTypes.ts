export interface ICommand {
  name: string;
  description: string;
  action: (...args: any[]) => Promise<void>;
}

export interface INamespace {
  name: string;
  description: string;
  commands: ICommand[];
}
