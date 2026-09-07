import { NextResponse } from "next/server";
import {
  applyWebAction,
  type WebAction,
} from "@smartvibe/demo/sessionEngine.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      session_id?: string;
      action?: WebAction;
    };
    if (!body.session_id || !body.action) {
      return NextResponse.json(
        { error: "session_id and action required" },
        { status: 400 },
      );
    }
    const view = applyWebAction(body.session_id, body.action);
    return NextResponse.json(view);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Action failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
