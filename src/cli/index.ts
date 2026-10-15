#!/usr/bin/env node
import { runCli } from "./main";

runCli()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    // `runCli` handles expected failures; this is a last-resort guard.
    console.error(error);
    process.exitCode = 1;
  });
