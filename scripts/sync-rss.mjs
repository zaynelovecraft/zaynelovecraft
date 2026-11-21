#!/usr/bin/env node
/**
 * Fetches the latest articles from https://www.zaynelovecraft.com/articles/rss.xml
 * and updates the <!-- BLOG-POST-LIST:START --> ... <!-- BLOG-POST-LIST:END -->
 * block in README.md. Zero external dependencies (Node 20+ native fetch).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const RSS_URL = process.env.RSS_URL || "https://www.zaynelovecraft.com/articles/rss.xml";
const MAX_POSTS = Number(process.env.MAX_POSTS || 5);
const README_PATH = resolve(process.cwd(), "README.md");

const START_MARKER = "<!-- BLOG-POST-LIST:START -->";
const END_MARKER = "<!-- BLOG-POST-LIST:END -->";

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

async function main() {
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

  const posts = itemMatches.slice(0, MAX_POSTS).map((match) => {
    const raw = match[1];
    const title = extractTag(raw, "title");
    const link = extractTag(raw, "link");
    const category = extractTag(raw, "category");
    const date = formatDate(extractTag(raw, "pubDate"));
    return { title, link, category, date };
  });

  const renderedLines = posts.map(({ title, link, category, date }) => {
    const meta = [category ? `\`${category}\`` : "", date].filter(Boolean).join(" · ");
    return meta ? `- **[${title}](${link})** — ${meta}` : `- **[${title}](${link})**`;
  });

  const readme = readFileSync(README_PATH, "utf8");
  const startIndex = readme.indexOf(START_MARKER);
  const endIndex = readme.indexOf(END_MARKER);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error(`Could not find ${START_MARKER} ... ${END_MARKER} markers in README.md`);
  }

  const updated =
    readme.slice(0, startIndex + START_MARKER.length) +
    "\n" +
    renderedLines.join("\n") +
    "\n" +
    readme.slice(endIndex);

  if (updated === readme) {
    console.log("README.md is already up to date.");
    return;
  }

  writeFileSync(README_PATH, updated, "utf8");
  console.log(`Updated README.md with ${posts.length} latest articles.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
