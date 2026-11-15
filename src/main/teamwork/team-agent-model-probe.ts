import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
export const MODEL_QUERY_TIMEOUT_MS = 2_500
const MAX_PARSED_MODELS = 80

export function stripAnsiCodes(text: string): string {
  const esc = String.fromCharCode(0x1b)
  const ansiPattern = new RegExp(`${esc}\\[[0-9;]*[A-Za-z]`, 'g')
  return text.replace(ansiPattern, '')
}

export function parseModelListingOutput(stdout: string): string[] {
  const cleaned = stripAnsiCodes(stdout)
  const models: string[] = []
  const seen = new Set<string>()
  for (const rawLine of cleaned.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('-') || line.startsWith('#') || /^available\b/i.test(line)) {
      continue
    }
    const token = line.split(/[\t\s]+/)[0]?.trim()
    if (!token || token.length < 2 || seen.has(token)) {
      continue
    }
    seen.add(token)
    models.push(token)
    if (models.length >= MAX_PARSED_MODELS) {
      break
    }
  }
  return models
}

export async function defaultQueryModels(
  binaryPath: string,
  args: string[],
  timeoutMs: number
): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(binaryPath, args, {
      encoding: 'utf8',
      timeout: timeoutMs,
      windowsHide: true
    })
    return parseModelListingOutput(stdout)
  } catch {
    return []
  }
}
