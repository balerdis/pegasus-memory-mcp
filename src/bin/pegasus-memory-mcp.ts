#!/usr/bin/env node
import { packageName, productName } from "../index.js";

export function runCli(args: string[] = process.argv.slice(2)): number {
  if (args.includes("--version")) {
    console.log(packageName);
    return 0;
  }

  if (args.includes("--help")) {
    console.log(`${productName} (${packageName})`);
    return 0;
  }

  console.error(`${productName} runtime is not implemented in this foundation slice.`);
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = runCli();
}
