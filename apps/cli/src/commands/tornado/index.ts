import { Command } from "commander";
import noteGenerate from "./note-generate";
import noteCheck from "./note-check";
import withdraw from "./withdraw";
import withdrawExecute from "./withdraw-execute";
import currencies from "./currencies";
import amounts from "./amounts";
import deposit from "./deposit";

export default function createTornadoNamespace(): Command {
  const tornado = new Command("tornado");
  tornado.description("Commands for Tornado Cash operations");

  const api = new Command("api");
  api.description("Call tornado-api endpoints");

  api
    .command("note-generate")
    .description(noteGenerate.description)
    .argument("[currency]", "Currency (e.g. eth, dai)")
    .argument("[amount]", "Deposit amount")
    .option("-n, --network-id <id>", "Network ID")
    .option("--rpc-url <url>", "RPC URL override")
    .option("--rpc-urls <urls>", "Comma-separated RPC URL list")
    .action(noteGenerate.action);

  api
    .command("note-check")
    .description(noteCheck.description)
    .argument("[depositNote]", "Deposit note to check")
    .option("-n, --network-id <id>", "Network ID")
    .option("--rpc-url <url>", "RPC URL override")
    .option("--rpc-urls <urls>", "Comma-separated RPC URL list")
    .action(noteCheck.action);

  api
    .command("withdraw")
    .description(withdraw.description)
    .argument("[depositNote]", "Deposit note to withdraw")
    .argument("[destinationAddress]", "Destination address")
    .option("-n, --network-id <id>", "Network ID")
    .action(withdraw.action);

  api
    .command("withdraw-execute")
    .description(withdrawExecute.description)
    .argument(
      "[tornadoInstanceAddress]",
      "Tornado instance contract address"
    )
    .option("--proof <proof>", "Withdrawal proof")
    .option(
      "--args <args>",
      "Proof args as JSON array or comma-separated list"
    )
    .option("-n, --network-id <id>", "Network ID")
    .action(withdrawExecute.action);

  api
    .command("currencies")
    .description(currencies.description)
    .option("-n, --network-id <id>", "Network ID")
    .action(currencies.action);

  api
    .command("amounts")
    .description(amounts.description)
    .argument("[currency]", "Currency to list amounts for")
    .option("-n, --network-id <id>", "Network ID")
    .action(amounts.action);

  tornado.addCommand(api);

  tornado
    .command("deposit")
    .description(deposit.description)
    .argument("[currency]", "Currency (e.g. eth, dai)")
    .argument("[amount]", "Deposit amount")
    .option("-n, --network-id <id>", "Network ID")
    .option("--rpc-url <url>", "RPC URL override")
    .option("--rpc-urls <urls>", "Comma-separated RPC URL list")
    .action(deposit.action);

  return tornado;
}
