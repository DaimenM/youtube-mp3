export interface JobFailurePayload {
  code?: string
  stage?: string
  message?: string
  detail?: string
  suggestion?: string
}

interface JobStatusPayload {
  status?: "queued" | "running" | "succeeded" | "failed" | "cancelled"
  stage?: string
  message?: string
  result?: unknown
  failure?: JobFailurePayload
}

export class JobClientError extends Error {
  payload: JobFailurePayload

  constructor(payload: JobFailurePayload) {
    super(payload.message || "The background job failed.")
    this.payload = payload
  }
}

function abortableDelay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("The operation was aborted.", "AbortError"))
      return
    }
    const onAbort = () => {
      window.clearTimeout(timeout)
      reject(new DOMException("The operation was aborted.", "AbortError"))
    }
    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve()
    }, milliseconds)
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

export async function waitForJob<T>(
  jobId: string,
  signal: AbortSignal,
  onProgress?: (message: string, stage?: string) => void,
): Promise<T> {
  while (true) {
    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
      cache: "no-store",
      signal,
    })
    const data = await response.json() as JobStatusPayload & { error?: string; code?: string }

    if (!response.ok) {
      throw new JobClientError({
        code: data.code,
        message: data.error || "The job status could not be loaded.",
      })
    }

    onProgress?.(data.message || "Processing…", data.stage)
    if (data.status === "succeeded") return data.result as T
    if (data.status === "failed") throw new JobClientError(data.failure || {})
    if (data.status === "cancelled") {
      throw new DOMException("The job was cancelled.", "AbortError")
    }

    await abortableDelay(1_500, signal)
  }
}
