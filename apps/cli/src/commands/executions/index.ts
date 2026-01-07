import { Command } from "commander";
import listExecutions from "./list";
import getExecution from "./get";
import stdoutExecution from "./stdout";

export default function createExecutionsNamespace(): Command {
  const executions = new Command("executions");
  executions.description("Commands for viewing execution records and output");

  executions
    .command("list")
    .description(listExecutions.description)
    .argument("<repoId>", "Repository ID to list executions for")
    .action(listExecutions.action);

  executions
    .command("get")
    .description(getExecution.description)
    .argument("<id>", "Execution ID")
    .action(getExecution.action);

  executions
    .command("stdout")
    .description(stdoutExecution.description)
    .argument("<id>", "Execution ID to stream stdout from")
    .action(stdoutExecution.action);

  return executions;
}
