#!/usr/bin/env python3
"""Fetch 42's official certifications into src/data/certifications.json.

  - Credly: every public badge of the 42 organisation (level badges 9 → 21+, the RNCP title
    badges, alumni ambassador) with image, link, skills and what earns it.
  - France Compétences: the two RNCP fiches 42 delivers — RNCP 39783 (level 6, "Concepteur
    développeur de solutions informatiques") and RNCP 39774 (level 7, "Expert en architecture
    informatique") — with their official competence blocks, the rule to obtain them, the jobs
    they lead to, ROME codes and yearly statistics.

    python3 scripts/fetch_certifications.py      # or: make certifications
"""
import html as htmllib
import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src/data/certifications.json"
CREDLY = "https://www.credly.com/organizations/42/badges.json"
FICHES = ["39783", "39774"]
UA = {"User-Agent": "Mozilla/5.0 (37-companion open-source 42 tracker)", "Accept": "application/json, text/html"}


def get(url: str) -> str:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return r.read().decode("utf-8", "replace")


# --- Credly ---------------------------------------------------------------------------------
def badge_kind(name: str):
    m = re.search(r"Level (\d+)(\+?)", name)
    if name.startswith("42 Cursus") and m:
        return "level", int(m.group(1)), bool(m.group(2))
    if name.startswith("RNCP"):
        return "rncp", None, False
    return "other", None, False


def credly():
    badges, url = [], CREDLY
    while url:
        page = json.loads(get(url))
        for b in page["data"]:
            kind, level, plus = badge_kind(b["name"])
            code = re.search(r"\((\d{5})\)", b["name"])
            badges.append({
                "id": b["id"], "name": b["name"].strip(), "kind": kind, "level": level, "plus": plus,
                "rank": re.sub(r"^42 Cursus - | - Level.*$", "", b["name"]) if kind == "level" else None,
                "rncp_code": code.group(1) if code else None,
                "rncp_level": int(re.search(r"RNCP (?:Niveau )?(\d)", b["name"]).group(1)) if kind == "rncp" else None,
                "current": bool(code) if kind == "rncp" else None,  # "(39774)" = the version registered in 2024
                "description": b.get("description") or "",
                "image": b.get("image_url"), "url": b.get("url"),
                "skills": [s["name"] for s in b.get("skills") or []],
                "earn": [a["title"] for a in b.get("badge_template_activities") or []],
                "level_label": b.get("level"), "time_to_earn": b.get("time_to_earn"),
                "updated_at": b.get("updated_at"),
            })
        url = (page.get("metadata") or {}).get("next_page_url")
    badges.sort(key=lambda b: ({"level": 0, "rncp": 1, "other": 2}[b["kind"]], b["level"] or 0, b["plus"], b["name"]))
    return badges


# --- France Compétences --------------------------------------------------------------------
def lines_of(page: str) -> list[str]:
    page = re.sub(r"<script.*?</script>|<style.*?</style>", "", page, flags=re.S)
    page = re.sub(r"<br\s*/?>|</(p|div|li|h\d|tr|td|th|dt|dd)>", "\n", page)
    text = htmllib.unescape(re.sub(r"<[^>]+>", " ", page)).replace("''", "'")
    return [re.sub(r"\s+", " ", l).strip() for l in text.split("\n") if l.strip()]


def after(L, label, start=0):
    return next(i for i in range(start, len(L)) if L[i].startswith(label))


def until(L, start, *stops):
    out = []
    for l in L[start:]:
        if any(l.startswith(s) for s in stops):
            break
        out.append(l)
    return out


def fiche(code: str):
    url = f"https://www.francecompetences.fr/recherche/rncp/{code}/"
    L = lines_of(get(url))
    i_code = L.index("Code de la fiche :")
    title = L[i_code - 1]
    level = int(re.search(r"\d", L[after(L, "Niveau ")]).group(0))
    expiry = next(L[i + 2] for i, l in enumerate(L) if l == "Date d’échéance" and re.match(r"\d\d-\d\d-\d{4}", L[i + 2]))

    i_sum = after(L, "Objectifs et contexte de la certification")
    summary = " ".join(until(L, i_sum + 1, "Activités visées"))
    i_act = after(L, "Activités visées", i_sum)
    activities = until(L, i_act + 1, "Compétences attestées")

    blocks = []
    starts = [i for i, l in enumerate(L) if re.match(rf"RNCP{code}BC\d\d - ", l)]
    i_rule = after(L, "Description des modalités d'acquisition")
    for k, i in enumerate(starts):
        if i > i_rule:
            break  # the "Liens avec…" section repeats block names further down
        end = starts[k + 1] if k + 1 < len(starts) and starts[k + 1] < i_rule else i_rule
        body = [l for l in L[i + 1:end] if l not in ("Liste de compétences", "Modalités d'évaluation")]
        head = L[i]
        option = re.search(r"\(option (\d)\)", head)
        blocks.append({
            "code": head.split(" - ")[0],
            "title": re.sub(r"\s*\(option \d\)\s*$", "", head.split(" - ", 1)[1]),
            "option": int(option.group(1)) if option else None,
            "competences": body[:-1], "evaluation": body[-1] if body else "",
        })
    rule = until(L, i_rule + 1, "Secteur d’activité")

    i_jobs = after(L, "Type d'emplois accessibles")
    jobs = until(L, i_jobs + 1, "Code(s) ROME")
    i_rome = after(L, "Code(s) ROME", i_jobs)
    rome_lines = until(L, i_rome + 1, "Références juridiques")
    rome = [{"code": rome_lines[j].rstrip(" -"), "label": rome_lines[j + 1]} for j in range(0, len(rome_lines) - 1, 2)]
    sectors = " ".join(until(L, after(L, "Secteurs d’activités") + 1, "Type d'emplois"))
    i_pre = after(L, "Le cas échant, prérequis à l’entrée en formation")
    prerequisites = until(L, i_pre + 1, "Le cas échant, prérequis à la validation")

    stats = []
    i_stats = after(L, "Taux d'insertion dans le métier visé à 2 ans")
    cells = until(L, i_stats + 1, "Lien internet")
    num = lambda v: None if v in ("-", "") else int(v)
    for j in range(0, len(cells) - 5, 6):
        if re.fullmatch(r"\d{4}", cells[j]):
            stats.append({"year": int(cells[j]), "certified": num(cells[j + 1]), "by_vae": num(cells[j + 2]),
                          "insertion_6m": num(cells[j + 3]), "in_job_6m": num(cells[j + 4]), "in_job_2y": num(cells[j + 5])})
    i_link = after(L, "Lien internet vers le descriptif")
    return {
        "code": code, "title": title, "level": level, "eqf": "master's degree level" if level == 7 else "bachelor's degree level",
        "expiry": expiry, "url": url, "info_url": L[i_link + 1] if L[i_link + 1].startswith("http") else None,
        "summary": summary, "activities": activities, "blocks": blocks, "rule": rule,
        "sectors": sectors, "jobs": jobs, "rome": rome, "prerequisites": prerequisites, "stats": stats,
    }


def main():
    data = {
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sources": {"credly": "https://www.credly.com/organizations/42/badges",
                    "rncp": [f"https://www.francecompetences.fr/recherche/rncp/{c}/" for c in FICHES]},
        "badges": credly(),
        "fiches": {c: fiche(c) for c in FICHES},
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
    for c, f in data["fiches"].items():
        print(f"  RNCP {c} · level {f['level']} · {f['title']} · {len(f['blocks'])} blocks · {len(f['jobs'])} jobs · until {f['expiry']}")
    print(f"  Credly · {len(data['badges'])} badges ({sum(b['kind'] == 'level' for b in data['badges'])} level, {sum(b['kind'] == 'rncp' for b in data['badges'])} RNCP)")
    print(f"✓ {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
