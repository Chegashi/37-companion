import { NextRequest, NextResponse } from "next/server";
import clusters from "@/data/clusters.json";
import { rateLimit, RateLimitPresets } from "@/utils/rateLimit";
import { cached, errorStatus, intraGetAll, userToken } from "@/utils/intra";

interface Cluster { id: number; name: string; cdn_link: string; campus: { id: number; name: string } }
interface Location { host: string; user: { login: string; image?: { versions?: { small?: string }; link?: string } } }

/**
 * GET /api/clusters                 → cluster list
 * GET /api/clusters?svg=<id>        → that cluster's map (fetched from the intra CDN, scripts stripped)
 * GET /api/clusters?campus=<id>     → active seats on that campus: [{ host, login, image }]
 */
export const GET = async (request: NextRequest) => {
  const limited = await rateLimit(request, RateLimitPresets.RELAXED);
  if (limited) return limited;
  const params = request.nextUrl.searchParams;
  try {
    const token = await userToken(request);

    const svgId = params.get("svg");
    if (svgId) {
      const cluster = (clusters as Cluster[]).find((c) => c.id === Number(svgId));
      if (!cluster) return NextResponse.json({ error: "Unknown cluster" }, { status: 404 });
      const svg = await cached(`svg:${cluster.id}`, 24 * 3600_000, async () => {
        const res = await fetch(cluster.cdn_link);
        if (!res.ok) throw new Error(`42 no longer serves the ${cluster.campus.name} ${cluster.name} map (its staff probably replaced it) — pick another cluster`);
        return (await res.text())
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/\son\w+="[^"]*"/gi, "");
      });
      return new NextResponse(svg, { headers: { "Content-Type": "image/svg+xml; charset=utf-8" } });
    }

    const campus = Number(params.get("campus"));
    if (campus) {
      const seats = await cached(`locations:${campus}`, 30_000, async () => {
        const locations = await intraGetAll<Location>(token, `/v2/campus/${campus}/locations`, { "filter[active]": "true" }, 20);
        return locations.map((l) => ({
          host: l.host,
          login: l.user.login,
          image: l.user.image?.versions?.small || l.user.image?.link || "/nopic.svg",
        }));
      });
      return NextResponse.json(seats);
    }

    return NextResponse.json(clusters);
  } catch (error) {
    console.error("clusters:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: errorStatus(error) });
  }
};
