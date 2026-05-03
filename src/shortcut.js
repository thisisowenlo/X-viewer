// iOS Shortcut entry: DOM-scrape version.
//
// Background: iOS Shortcuts "Run JavaScript on Web Page" runs in a WebView
// whose cookie jar lacks HttpOnly cookies (auth_token), so authenticated
// fetches to X return 401. Workaround: skip the network entirely and read
// the already-rendered DOM. Trade-off: only replies that have scrolled into
// view are present, and selectors are fragile vs X redesigns.

(async () => {
  try {
    // Brief wait so React has a chance to paint late-arriving content.
    await new Promise((r) => setTimeout(r, 250));

    const articles = [
      ...document.querySelectorAll('article[data-testid="tweet"]'),
    ];
    if (articles.length === 0) {
      completion(
        "ERROR: no tweet articles in DOM. Open the tweet detail page and try again.",
      );
      return;
    }

    const focalId = location.pathname.match(/\/status\/(\d+)/)?.[1];
    const focalIdx = focalId
      ? articles.findIndex((a) =>
          [...a.querySelectorAll('a[href*="/status/"]')].some((l) =>
            (l.getAttribute("href") || "").includes("/status/" + focalId),
          ),
        )
      : 0;

    const tweets = articles.map(readArticle).filter((t) => t.text || t.handle);
    if (tweets.length === 0) {
      completion(
        "ERROR: found articles but no readable text. X DOM may have changed.",
      );
      return;
    }

    const focal = tweets[focalIdx >= 0 ? focalIdx : 0];
    const before = tweets.slice(0, focalIdx >= 0 ? focalIdx : 0);
    const after = tweets.slice((focalIdx >= 0 ? focalIdx : 0) + 1);

    completion(render(focal, before, after, location.href.split("?")[0]));
  } catch (e) {
    completion("ERROR: " + (e?.message ?? String(e)));
  }
})();

function readArticle(article) {
  const textEl = article.querySelector('[data-testid="tweetText"]');
  const text = textEl ? textEl.innerText.trim() : "";

  let handle = "";
  const userNameEl = article.querySelector('[data-testid="User-Name"]');
  if (userNameEl) {
    const handleSpan = [...userNameEl.querySelectorAll("span")].find((s) =>
      s.textContent.trim().startsWith("@"),
    );
    if (handleSpan) {
      handle = handleSpan.textContent.trim().replace(/^@/, "");
    } else {
      const link = userNameEl.querySelector('a[href^="/"][role="link"]');
      const m = link?.getAttribute("href")?.match(/^\/([^/]+)/);
      if (m) handle = m[1];
    }
  }

  const time = article.querySelector("time[datetime]")?.getAttribute("datetime") || "";
  return { handle, text, time };
}

function render(focal, before, after, sourceUrl) {
  const lines = [];
  const firstLine = (focal.text || "").split("\n")[0].slice(0, 80);
  lines.push(`# @${focal.handle || "unknown"}: ${firstLine}`);
  lines.push("");
  lines.push(`> Source: ${sourceUrl}`);
  if (focal.time) lines.push(`> Posted: ${focal.time}`);
  lines.push("");
  lines.push(focal.text);
  lines.push("");

  if (before.length > 0) {
    lines.push("## Parent thread (above the focal tweet)");
    lines.push("");
    for (const t of before) {
      lines.push(`### @${t.handle || "unknown"}`);
      lines.push(t.text);
      lines.push("");
    }
  }

  if (after.length > 0) {
    lines.push("## Replies (only the ones already scrolled into view)");
    lines.push("");
    for (const t of after) {
      lines.push(`### @${t.handle || "unknown"}`);
      lines.push(t.text);
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}
