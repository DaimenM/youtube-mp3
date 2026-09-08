const WORKER_REQUEST_TIMEOUT_MS = 15_000

export class WorkerConfigurationError extends Error {}

function getWorkerConfiguration() {
  const rawUrl = process.env.CONVERSION_WORKER_URL
  const secret = process.env.WORKER_API_SECRET

  if (!rawUrl || !secret) {
    throw new WorkerConfigurationError(
      "CONVERSION_WORKER_URL and WORKER_API_SECRET must be configured.",
    )
  }

  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new WorkerConfigurationError("CONVERSION_WORKER_URL is not a valid URL.")
  }

  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1"
  if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && isLocal)) {
    throw new WorkerConfigurationError("CONVERSION_WORKER_URL must use HTTPS in production.")
  }

  return { baseUrl: url.toString().replace(/\/$/, ""), secret }
}

export async function workerRequest(pathname: string, init: RequestInit = {}) {
  const { baseUrl, secret } = getWorkerConfiguration()
  const timeoutSignal = AbortSignal.timeout(WORKER_REQUEST_TIMEOUT_MS)

  try {
    return await fetch(`${baseUrl}${pathname}`, {
      ...init,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${secret}`,
        ...init.headers,
      },
      signal: init.signal
        ? AbortSignal.any([init.signal, timeoutSignal])
        : timeoutSignal,
    })
  } catch (error) {
    throw new Error(
      `The conversion worker could not be reached: ${error instanceof Error ? error.message : "network error"}`,
    )
  }
}

export async function workerJsonResponse(response: Response) {
  const contentType = response.headers.get("content-type") || ""
  if (!contentType.includes("application/json")) {
    return {
      status: 502,
      body: {
        error: "The conversion worker returned an unreadable response.",
        code: "WORKER_INVALID_RESPONSE",
      },
    }
  }

  return { status: response.status, body: await response.json() }
}
