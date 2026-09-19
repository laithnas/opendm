import { NextResponse } from "next/server";

// Public, unauthenticated: reports whether demo mode is enabled so the
// login screen can offer the one-click demo entry point.
export const GET = () =>
  NextResponse.json({ demoMode: process.env.DEMO_MODE === "true" });