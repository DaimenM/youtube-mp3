import { NextResponse } from "next/server"
import { workerJsonResponse, workerRequest } from "@/lib/worker-client"

export const runtime = "nodejs"

interface RouteContext {
  params: Promise<{ id: string }>
}

function validJobId(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
}

async function proxyJob(method: "GET" | "DELETE", context: RouteContext) {
  const { id } = await context.params
  if (!validJobId(id)) {
    return NextResponse.json({ error: "Invalid job ID" }, { status: 400 })
  }

  try {
    const response = await workerRequest(`/jobs/${encodeURIComponent(id)}`, { method })
    const result = await workerJsonResponse(response)
    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    console.error("Job status request failed", { id, error })
    return NextResponse.json({
      error: "The conversion worker is unavailable.",
      code: "WORKER_UNAVAILABLE",
      suggestion: "Try again shortly or check the worker service.",
    }, { status: 503 })
  }
}

export async function GET(_request: Request, context: RouteContext) {
  return proxyJob("GET", context)
}

export async function DELETE(_request: Request, context: RouteContext) {
  return proxyJob("DELETE", context)
}
