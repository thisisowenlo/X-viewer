// Pure: GraphQL TweetDetail JSON -> markdown string.
// Kept dependency-free so it bundles cleanly and is easy to unit test later.

export function extractMarkdown(json, { focalTweetId } = {}) {
  const instructions =
    json?.data?.threaded_conversation_with_injections_v2?.instructions ?? [];

  const entries = instructions
    .filter((i) => i?.type === "TimelineAddEntries")
    .flatMap((i) => i?.entries ?? []);

  const focal = findFocalTweet(entries, focalTweetId);
  if (!focal) {
    throw new Error("Focal tweet not found in TweetDetail response");
  }

  const replies = collectReplies(entries, focal.id);

  return renderMarkdown(focal, replies);
}

function findFocalTweet(entries, focalTweetId) {
  for (const entry of entries) {
    if (!entry?.entryId?.startsWith("tweet-")) continue;
    const tweet = readTweet(
      entry?.content?.itemContent?.tweet_results?.result,
    );
    if (!tweet) continue;
    if (focalTweetId && tweet.id !== focalTweetId) continue;
    return tweet;
  }
  return null;
}

function collectReplies(entries, focalId) {
  const replies = [];
  for (const entry of entries) {
    if (!entry?.entryId?.startsWith("conversationthread-")) continue;
    const items = entry?.content?.items ?? [];
    for (const item of items) {
      const tweet = readTweet(
        item?.item?.itemContent?.tweet_results?.result,
      );
      if (!tweet) continue;
      if (tweet.id === focalId) continue;
      replies.push(tweet);
    }
  }
  return replies;
}

function readTweet(result) {
  if (!result) return null;
  // TweetWithVisibilityResults wraps the actual tweet under `.tweet`.
  const t = result.__typename === "TweetWithVisibilityResults"
    ? result.tweet
    : result;
  if (!t || t.__typename === "TweetTombstone") return null;

  const id = t.rest_id ?? t.legacy?.id_str;
  const legacy = t.legacy ?? {};
  const user = t.core?.user_results?.result?.legacy ?? {};
  const author = user.screen_name ?? "unknown";
  const text = legacy.full_text ?? "";
  const createdAt = legacy.created_at ?? "";
  if (!id) return null;
  return { id, author, text, createdAt };
}

function renderMarkdown(focal, replies) {
  const lines = [];
  const firstLine = focal.text.split("\n")[0].slice(0, 80);
  lines.push(`# @${focal.author}: ${firstLine}`);
  lines.push("");
  lines.push(`> Source: https://x.com/${focal.author}/status/${focal.id}`);
  if (focal.createdAt) lines.push(`> Posted: ${focal.createdAt}`);
  lines.push("");
  lines.push(focal.text);
  lines.push("");

  if (replies.length > 0) {
    lines.push("## Replies");
    lines.push("");
    for (const r of replies) {
      lines.push(`### @${r.author}`);
      lines.push(r.text);
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}
