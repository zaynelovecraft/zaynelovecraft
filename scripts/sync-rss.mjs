#!/usr/bin/env node
/**
 * Syncs both:
 * 1) Latest articles from https://www.zaynelovecraft.com/articles/rss.xml
 * 2) Recent engineering TILs from https://raw.githubusercontent.com/zaynelovecraft/til/main/README.md
 * into README.md. Zero external dependencies (Node 20+ native fetch).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const RSS_URL = process.env.RSS_URL || "https://www.zaynelovecraft.com/articles/rss.xml";
const TIL_README_URL =
  process.env.TIL_README_URL || "https://raw.githubusercontent.com/zaynelovecraft/til/main/README.md";
const MAX_POSTS = Number(process.env.MAX_POSTS || 5);
const MAX_TILS = Number(process.env.MAX_TILS || 5);
const README_PATH = resolve(process.cwd(), "README.md");

const BLOG_START = "<!-- BLOG-POST-LIST:START -->";
const BLOG_END = "<!-- BLOG-POST-LIST:END -->";
const TIL_START = "<!-- RECENT-TILS:START -->";
const TIL_END = "<!-- RECENT-TILS:END -->";

function decodeXml(str = "") {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

function extractTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function formatDate(pubDate) {
  if (!pubDate) return "";
  const parsed = new Date(pubDate);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function replaceBetweenMarkers(source, startMarker, endMarker, lines) {
  const startIndex = source.indexOf(startMarker);
  const endIndex = source.indexOf(endMarker);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error(`Could not find ${startMarker} ... ${endMarker} in README.md`);
  }
  return (
    source.slice(0, startIndex + startMarker.length) +
    "\n" +
    lines.join("\n") +
    "\n" +
    source.slice(endIndex)
  );
}

async function fetchBlogLines() {
  const response = await fetch(RSS_URL, {
    headers: {
      "User-Agent": "zaynelovecraft-profile-rss-sync/1.0 (+https://github.com/zaynelovecraft)",
      Accept: "application/rss+xml, application/xml, text/xml",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch RSS feed (${response.status} ${response.statusText}) from ${RSS_URL}`);
  }

  const xml = await response.text();
  const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];

  if (itemMatches.length === 0) {
    throw new Error(`No <item> entries found in RSS feed: ${RSS_URL}`);
  }

  return itemMatches.slice(0, MAX_POSTS).map((match) => {
    const raw = match[1];
    const title = extractTag(raw, "title");
    const link = extractTag(raw, "link");
    const category = extractTag(raw, "category");
    const date = formatDate(extractTag(raw, "pubDate"));
    const meta = [category ? `\`${category}\`` : "", date].filter(Boolean).join(" · ");
    return meta ? `- **[${title}](${link})** — ${meta}` : `- **[${title}](${link})**`;
  });
}

async function fetchTilLines() {
  const response = await fetch(TIL_README_URL, {
    headers: { "User-Agent": "zaynelovecraft-profile-rss-sync/1.0 (+https://github.com/zaynelovecraft)" },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch TIL README (${response.status} ${response.statusText})`);
  }
  const md = await response.text();
  const startIndex = md.indexOf(TIL_START);
  const endIndex = md.indexOf(TIL_END);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error("Could not find RECENT-TILS markers in til/README.md");
  }
  return md
    .slice(startIndex + TIL_START.length, endIndex)
    .trim()
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .slice(0, MAX_TILS)
    .map((line) =>
      line.replace(
        /\]\((?!https?:\/\/)([^)]+)\)/g,
        "](https://github.com/zaynelovecraft/til/blob/main/$1)",
      ),
    );
}

async function main() {
  const [blogLines, tilLines] = await Promise.all([fetchBlogLines(), fetchTilLines()]);

  const readme = readFileSync(README_PATH, "utf8");
  let updated = replaceBetweenMarkers(readme, BLOG_START, BLOG_END, blogLines);
  updated = replaceBetweenMarkers(updated, TIL_START, TIL_END, tilLines);

  if (updated === readme) {
    console.log("README.md is already up to date.");
    return;
  }

  writeFileSync(README_PATH, updated, "utf8");
  console.log(`Updated README.md with ${blogLines.length} articles and ${tilLines.length} TILs.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
