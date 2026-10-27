import { NextRequest, NextResponse } from "next/server";
import { AuthResponse } from "./type.auth";
import * as jose from "jose";
import { rateLimit, RateLimitPresets } from "@/utils/rateLimit";

import { EncryptionFunction } from "./type.auth";

export const GET = async (request: NextRequest) => {
  // Rate limiting: 5 requests per minute (auth endpoint)
  const rateLimitResult = await rateLimit(request, RateLimitPresets.AUTH);
  if (rateLimitResult) return rateLimitResult;

  try {
    if ((process.env.SECRET_KEY ?? "").length < 32) {
      console.error("auth: SECRET_KEY is missing or shorter than 32 characters (openssl rand -hex 32)");
      return NextResponse.json({ error: "Server misconfigured." }, { status: 500 });
    }
    const code: string = request.nextUrl.searchParams.get("code") as string;
    if (!code) {
      return NextResponse.json(
        { error: "Authorization code is missing." },
        { status: 400 }
      );
    }
    const state = request.nextUrl.searchParams.get("state");
    const expected = request.cookies.get("oauth_state")?.value;
    if (!state || !expected || state !== expected) {
      return NextResponse.json({ error: "Login expired or invalid — start again from the home page." }, { status: 400 });
    }

    const ClientQuery: URLSearchParams = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.INTRA_UID as string,
      client_secret: process.env.INTRA_SECRET_KEY as string,
      code: code,
      redirect_uri: process.env.INTRA_REDIRECT_URI as string,
    });

    const tokenUrl = (process.env.INTRA_TOKEN || "https://api.intra.42.fr") + "/oauth/token";
    
    const fetchToken = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: ClientQuery.toString(),
      signal: AbortSignal.timeout(10000),
    });
    
    if (!fetchToken.ok) {
      throw new Error(`Failed to fetch token: ${fetchToken.status} ${await fetchToken.text()}`);
    }
    
    const Tok: AuthResponse = await fetchToken.json();
    
    // Fetch user info to get username (only once during login)
    const userInfoResponse = await fetch((process.env.INTRA_TOKEN || "https://api.intra.42.fr") + "/v2/me", {
      headers: {
        Authorization: `Bearer ${Tok.access_token}`,
      },
    });
    
    let username = "unknown";
    let userId = null;
    let campusId = null;
    
    if (userInfoResponse.ok) {
      const userData = await userInfoResponse.json();
      username = userData.login || "unknown";
      userId = userData.id || null;
      const primaryCampus = userData.campus_users?.find((cu: { is_primary?: boolean }) => cu.is_primary);
      campusId = primaryCampus?.campus_id ?? userData.campus_users?.[0]?.campus_id ?? null;
    }
    
    const token = new TextEncoder().encode(process.env.SECRET_KEY as string);
    const Signature = new jose.SignJWT({
      token: EncryptionFunction(Tok.access_token),
      login: username,
      userId: userId,
      campusId: campusId,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(token);
    const signedToken = await Signature;

    // The app's public origin is the one 42 redirects back to (request.url can be the container's address).
    const appOrigin = new URL(process.env.INTRA_REDIRECT_URI as string).origin;
    console.log(`auth: logged in ${username} (campus ${campusId})`);

    const response = NextResponse.redirect(new URL("/dashboard", appOrigin));
    response.cookies.set("auth_code", signedToken, {
      httpOnly: true,
      // Secure cookies are dropped on plain-http localhost by some browsers (Safari), which loops the login.
      secure: appOrigin.startsWith("https://"),
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // same as the JWT expiry
    });
    response.cookies.set("oauth_state", "", { path: "/api/auth", maxAge: 0 });
    return response;
  } catch (error) {
    console.error("Authentication error:", error);
    return NextResponse.json(
      {
        error: "An error occurred while processing your request.",
      },
      { status: 500 }
    );
  }
};
