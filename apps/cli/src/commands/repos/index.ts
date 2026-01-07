import { Command } from "commander";
import listRepos from "./list";
import getRepo from "./get";
import executeRepo from "./execute";
import streamRepo from "./stream";

export default function createReposNamespace(): Command {
  const repos = new Command("repos");
  repos.description("Commands for managing and executing repositories");

  repos
    .command("list")
    .description(listRepos.description)
    .argument("<address>", "Address to list repos for")
    .action(listRepos.action);

  repos
    .command("get")
    .description(getRepo.description)
    .argument("<id>", "Repository ID")
    .action(getRepo.action);

  repos
    .command("execute")
    .description(executeRepo.description)
    .argument("<id>", "Repository ID to execute")
    .action(executeRepo.action);

  repos
    .command("stream")
    .description(streamRepo.description)
    .argument("<address>", "Repository address")
    .argument("<repoName>", "Repository name")
    .action(streamRepo.action);

  return repos;
}
