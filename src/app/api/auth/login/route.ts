import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

/** Start the 42 OAuth flow. Built at request time so the Docker image needs no credentials baked in. */
export const GET = () => {
  const uid = process.env.INTRA_UID;
  const redirect = process.env.INTRA_REDIRECT_URI;
  if (!uid || !redirect) {
    return NextResponse.json({ error: "Set INTRA_UID and INTRA_REDIRECT_URI in .env.local" }, { status: 500 });
  }
  // `state` ties the callback to this browser, so nobody can log you in to their account (login CSRF).
  const state = randomBytes(16).toString("hex");
  const url = new URL("https://api.intra.42.fr/oauth/authorize");
  url.search = new URLSearchParams({ client_id: uid, redirect_uri: redirect, response_type: "code", scope: "public", state }).toString();
  const response = NextResponse.redirect(url);
  response.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: redirect.startsWith("https://"),
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 10 * 60,
  });
  return response;
};
