// Cloudflare Workers entry point.
//
// Why this exists: iOS Shortcuts' "Run JavaScript on Web Page" action only
// accepts Safari Web Page input. When the SendToClaude shortcut is invoked
// from the X app's share sheet, iOS hands it a URL — not a Safari Web Page —
// and the action fails type conversion before any of our JS can run. This
// Worker fills that gap: a Shortcut for URL input fetches this endpoint
// instead, and we hit X's public syndication API server-side, returning
// already-formatted markdown.
//
// What this Worker does NOT touch: user cookies, user session, any private
// data. Syndication is the public read-only API X provides for embed widgets.
//
// Free tier: 100K requests/day, well above personal use.

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const reqUrl = new URL(request.url);
    const tweetUrl = reqUrl.searchParams.get("url");
    const id =
      reqUrl.searchParams.get("id") ||
      tweetUrl?.match(/\/status\/(\d+)/)?.[1];

    if (!id || !/^\d+$/.test(id)) {
      return text(
        "Missing ?id=<numeric-tweet-id> or ?url=<tweet-url-with-/status/>",
        400,
      );
    }

    const token = ((Number(id) / 1e15) * Math.PI)
      .toString(36)
      .replace(/(0+|\.)/g, "");
    const syndUrl =
      "https://cdn.syndication.twimg.com/tweet-result?" +
      `id=${id}&token=${token}&lang=en`;

    let r;
    try {
      r = await fetch(syndUrl, {
        cf: { cacheTtl: 300, cacheEverything: true },
      });
    } catch (e) {
      return text(`syndication network error: ${e.message}`, 502);
    }
    if (!r.ok) {
      return text(
        `syndication status=${r.status}. ` +
          "Tweet may be deleted, private, age-restricted, or X-only.",
        502,
      );
    }
    const json = await r.json();
    return text(formatMarkdown(json, id), 200);
  },
};

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "*",
  };
}

function text(body, status) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=300",
      ...corsHeaders(),
    },
  });
}

function formatMarkdown(json, focalId) {
  const author = json.user?.screen_name || "unknown";
  const focalText = json.text || "";
  const time = json.created_at || "";

  const before = [];
  if (json.parent) {
    before.push({
      handle: json.parent.user?.screen_name || "unknown",
      text: json.parent.text || "",
    });
  }

  const after = [];
  if (Array.isArray(json.conversation)) {
    for (const item of json.conversation) {
      if (!item || item.id_str === focalId) continue;
      after.push({
        handle: item.user?.screen_name || "unknown",
        text: item.text || "",
      });
    }
  }

  const lines = [];
  const firstLine = focalText.split("\n")[0].slice(0, 80);
  lines.push(`# @${author}: ${firstLine}`);
  lines.push("");
  lines.push(`> Source: https://x.com/${author}/status/${focalId}`);
  if (time) lines.push(`> Posted: ${time}`);
  lines.push(
    "> Captured via: syndication API (limited; share from Safari for full thread)",
  );
  lines.push("");
  lines.push(focalText);
  lines.push("");

  if (before.length > 0) {
    lines.push("## In reply to / parent thread");
    lines.push("");
    for (const t of before) {
      lines.push(`### @${t.handle}`);
      lines.push(t.text);
      lines.push("");
    }
  }

  if (after.length > 0) {
    lines.push("## Replies");
    lines.push("");
    for (const t of after) {
      lines.push(`### @${t.handle}`);
      lines.push(t.text);
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}
