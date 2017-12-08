import { ArgumentParser, SubParser } from "argparse"
import * as nodeCleanup from "node-cleanup"
import * as getSTDIN from "get-stdin"
import * as chalk from "chalk"

import { contextForDanger } from "../runner/Dangerfile"
import inline from "../runner/runners/inline"
import { dangerfilePath } from "./utils/file-utils"
import { DangerDSLJSONType } from "../dsl/DangerDSL"
import { jsonToDSL } from "../runner/jsonToDSL"

// Given the nature of this command, it can be tricky to test, so I use a command like this:
//
// tslint:disable-next-line:max-line-length
// yarn build; cat source/_tests/fixtures/danger-js-pr-395.json | env DANGER_FAKE_CI="YEP" DANGER_TEST_REPO='danger/danger-js' DANGER_TEST_PR='395' node distribution/commands/danger-runner.js --text-only
//
// Which will build danger, then run just the dangerfile runner with a fixtured version of the JSON

export interface App {
  dangerfile: string
}

export function createParser(subparsers: SubParser): ArgumentParser {
  const parser = subparsers.addParser("runner", {
    help: "Runs a dangerfile against a DSL passed in via STDIN",
    epilog: "Should be passed from `danger run`",
  })
  parser.addArgument(["dangerfile"], {
    metavar: "DANGERFILE",
    help: "Path to the dangerfile.",
  })
  return parser
}
let foundDSL = false
let runtimeEnv = {} as any

export async function main(app: App) {
  // Start waiting on STDIN for the DSL
  getSTDIN().then(async jsonString => {
    foundDSL = true
    const dslJSON = JSON.parse(jsonString) as { danger: DangerDSLJSONType }
    const dsl = await jsonToDSL(dslJSON.danger)
    const dangerFile = dangerfilePath(app)

    // Set up the runtime env
    const context = contextForDanger(dsl)
    runtimeEnv = await inline.createDangerfileRuntimeEnvironment(context)
    await inline.runDangerfileEnvironment(dangerFile, undefined, runtimeEnv)
  })

  // Wait till the end of the process to print out the results
  nodeCleanup(() => {
    if (foundDSL) {
      process.stdout.write(JSON.stringify(runtimeEnv.results, null, 2))
    }
  })

  // Add a timeout so that CI doesn't run forever if something has broken.
  setTimeout(() => {
    if (!foundDSL) {
      console.error(chalk.red("Timeout: Failed to get the Danger DSL after 1 second"))
      process.exitCode = 1
      process.exit(1)
    }
  }, 1000)
}
