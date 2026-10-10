// Feed — a consumable that crows and rats seek and eat once it's on the
// ground (GLOSSARY.md "Feed"). Data-driven by the item's `feed: true` flag
// (Bread, Sandwich) so a new Feed item needs no code change here.
export function isFeed(item) {
  return item?.data?.feed === true;
}
