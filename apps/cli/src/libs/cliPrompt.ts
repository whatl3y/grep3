import { stdin as input } from "node:process";
import inquirer from "inquirer";
("inquirer");

export async function promptForValue(
  label: string,
  defaultValue?: string
): Promise<string> {
  if (!input.isTTY) {
    throw new Error(`Missing required ${label} and no TTY available.`);
  }

  const { value } = await inquirer.prompt([
    {
      type: "input",
      name: "value",
      message: label,
      default: defaultValue,
    },
  ]);
  return String(value || "").trim();
}

export async function promptForSelect(
  label: string,
  choices: string[] | { name: string; value: string }[],
  defaultValue?: string
): Promise<string> {
  if (!input.isTTY) {
    throw new Error(`Missing required ${label} and no TTY available.`);
  }

  if (choices.length === 0) {
    throw new Error(`No available ${label} options found.`);
  }

  const { value } = await inquirer.prompt([
    {
      type: "list",
      name: "value",
      message: label,
      choices,
      default: defaultValue,
    },
  ]);

  return String(value || "").trim();
}

export async function requireValue(
  value: string | undefined,
  label: string,
  defaultValue?: string
): Promise<string> {
  if (value && value.trim().length > 0) {
    return value.trim();
  }

  const answer = await promptForValue(label, defaultValue);
  if (!answer) {
    throw new Error(`Missing required ${label}.`);
  }

  return answer;
}

export async function requireValueFromList(
  value: string | undefined,
  label: string,
  choices: string[] | { name: string; value: string }[],
  defaultValue?: string
): Promise<string> {
  const values: string[] =
    typeof choices[0] === "string"
      ? (choices as string[])
      : ((choices as { name: string; value: string }[]).map(
          ({ value }) => value
        ) as string[]);
  if (value && value.trim().length > 0) {
    const trimmed = value.trim();
    if (!values.includes(trimmed)) {
      throw new Error(
        `Invalid ${label}. Expected one of: ${values.join(", ")}.`
      );
    }
    return trimmed;
  }

  const answer = await promptForSelect(label, choices, defaultValue);
  if (!answer) {
    throw new Error(`Missing required ${label}.`);
  }

  return answer;
}
