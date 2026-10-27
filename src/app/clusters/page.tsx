"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import clustersJson from "@/data/clusters.json";
import { useStoredState, useTracker } from "@/component/tracker/useTracker";
import { PageState } from "@/component/tracker/ui";

interface Cluster { id: number; name: string; cdn_link: string; campus: { id: number; name: string } }
interface Seat { host: string; login: string; image: string }

const clusters = (clustersJson as Cluster[]).slice().sort((a, b) =>
  `${a.campus.name} ${a.name}`.localeCompare(`${b.campus.name} ${b.name}`));

// Port of 42evaluators' live cluster map: seats are <image id="host"> elements in the intra SVG.
export default function ClustersPage() {
  const { me } = useTracker();
  const [clusterId, setClusterId] = useStoredState<number | null>("37c-cluster", null);
  const [svg, setSvg] = useState<string>("");
  const [seats, setSeats] = useState<Seat[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<{ seat: Seat; x: number; y: number } | null>(null);
  const [search, setSearch] = useState("");
  const mapRef = useRef<HTMLDivElement>(null);

  const cluster = clusters.find((c) => c.id === clusterId)
    ?? clusters.find((c) => c.campus.id === me?.campusId) ?? clusters[0];
  const campusClusters = useMemo(() => clusters.filter((c) => c.campus.id === cluster.campus.id), [cluster]);

  useEffect(() => {
    setSvg("");
    fetch(`/api/clusters?svg=${cluster.id}`).then(async (r) => {
      if (!r.ok) throw new Error((await r.json()).error);
      setSvg(await r.text());
    }).catch((e: Error) => setError(e.message));
  }, [cluster.id]);

  useEffect(() => {
    let stop = false;
    const load = () => fetch(`/api/clusters?campus=${cluster.campus.id}`).then(async (r) => {
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      if (!stop) { setSeats(body); setError(null); }
    }).catch((e: Error) => !stop && setError(e.message));
    load();
    const id = setInterval(load, 60_000);
    return () => { stop = true; clearInterval(id); };
  }, [cluster.campus.id]);

  const byHost = useMemo(() => new Map(seats.map((s) => [s.host, s])), [seats]);

  useEffect(() => {
    const root = mapRef.current;
    if (!root || !svg) return;
    root.querySelectorAll<SVGImageElement>("image[id]").forEach((img) => {
      const seat = byHost.get(img.id);
      const href = seat?.image ?? "";
      img.setAttribute("href", href);
      img.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", href);
      img.style.outline = seat && search && seat.login.includes(search.toLowerCase()) ? "3px solid #e74c3c" : "";
    });
  }, [svg, byHost, search]);

  const onMove = (e: React.MouseEvent) => {
    const target = e.target as Element;
    const seat = target.tagName === "image" ? byHost.get(target.id) : undefined;
    setHover(seat ? { seat, x: e.clientX, y: e.clientY } : null);
  };

  const inCluster = seats.filter((s) => campusClusters.length === 1 || s.host.startsWith(cluster.name.toLowerCase()));

  return (
    <div className="cg-page">
      <div className="cg-toolbar">
        <select aria-label="Cluster" value={cluster.id} onChange={(e) => setClusterId(Number(e.target.value))}>
          {clusters.map((c) => <option key={c.id} value={c.id}>{c.campus.name} — {c.name}</option>)}
        </select>
        <div className="cg-tabs">
          {campusClusters.map((c) => <button key={c.id} className="cg-tab" aria-pressed={c.id === cluster.id} onClick={() => setClusterId(c.id)}>{c.name}</button>)}
        </div>
        <input aria-label="Find a login" placeholder="Find a login…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="cg-muted">{seats.length} logged in at {cluster.campus.name} · {inCluster.length} in {cluster.name} · refreshes every minute</span>
      </div>
      <PageState loading={!svg && !error} error={error} />
      <div ref={mapRef} onMouseMove={onMove} onMouseLeave={() => setHover(null)}
        className="cg-panel" style={{ padding: 12, minHeight: 400 }}
        // Map SVG comes from the intra CDN via /api/clusters, with scripts and event handlers stripped.
        dangerouslySetInnerHTML={{ __html: svg.replace("<svg", '<svg width="100%" style="max-height:75vh"') }} />
      {hover && (
        <div className="cg-panel" style={{ position: "fixed", left: hover.x + 14, top: hover.y + 14, zIndex: 200, pointerEvents: "none" }}>
          <div className="cg-panel-body" style={{ flexDirection: "row", alignItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={hover.seat.image} alt="" width={48} height={48} style={{ objectFit: "cover" }} />
            <div><b>{hover.seat.login}</b><div className="cg-muted">{hover.seat.host}</div></div>
          </div>
        </div>
      )}
    </div>
  );
}
