import { LogWatcherPlugin } from "../src/logger.js"
import { spawn } from "node:child_process"
import { createWriteStream, rmSync } from "node:fs"
import { join } from "node:path"

const projectDir = "F:\\Uni\\s\\2026_1春\\Project\\learn-hermes\\agent-app"
const logFile = join(projectDir, "_test_demo.log")
const cmdFile = join(projectDir, "_test_commands.txt")

async function main() {
  const p = await LogWatcherPlugin()

  // Step 1: Start the software in background, pipe output to file
  console.log("=== Step 1: Start agent-app --help ===")
  const proc = spawn("uv", ["run", "python", "main.py", "--help"], {
    cwd: projectDir,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  })
  const ws = createWriteStream(logFile)
  proc.stdout.pipe(ws)
  proc.stderr.pipe(ws)
  await new Promise(r => proc.on("exit", r))
  ws.end()
  console.log("Process exited. Output written to:", logFile)

  // Step 2: opencode reads the output
  console.log("\n=== Step 2: tail ===")
  const r1 = await p.tool.tail.execute({ filepath: logFile, lines: 10 })
  console.log(r1)

  // Step 3: opencode writes a command file (simulating injecting input)
  console.log("\n=== Step 3: file_write ===")
  const r2 = await p.tool.file_write.execute({
    filepath: cmdFile,
    text: "# Commands from opencode\n--model deepseek-chat\n--query \"test this\"\n",
  })
  console.log(r2)

  // Step 4: read the command file to verify
  console.log("\n=== Step 4: tail the command file ===")
  const r3 = await p.tool.tail.execute({ filepath: cmdFile, lines: 10 })
  console.log(r3)

  // Step 5: tail_follow (incremental) — write more, then follow
  console.log("\n=== Step 5: append + tail_follow ===")
  await p.tool.file_write.execute({ filepath: cmdFile, text: "--mode cli\n" })
  const r4 = await p.tool.tail_follow.execute({ filepath: logFile })
  console.log("Follow result:", r4?.slice(0, 300))

  // Step 6: second follow — no new data
  const r5 = await p.tool.tail_follow.execute({ filepath: logFile })
  console.log("Second follow:", r5?.slice(0, 200))

  // Cleanup
  try { rmSync(logFile) } catch {}
  try { rmSync(cmdFile) } catch {}
  console.log("\n=== Demo complete ===")
}

main().catch(console.error)
