import { NextResponse } from "next/server";
import { createWebSession, getWebSession } from "@smartvibe/demo/sessionEngine.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const view = createWebSession({ loopScenarioId: "rapid_pump" });
  return NextResponse.json(view);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }
  const view = getWebSession(sessionId);
  if (!view) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  return NextResponse.json(view);
}
