// Feed — a consumable that crows and rats seek and eat once it's on the
// ground (GLOSSARY.md "Feed"). Data-driven by the item's `feed: true` flag
// (Bread, Sandwich, Forest Berry) so a new Feed item needs no code change here.
export function isFeed(item) {
  return item?.data?.feed === true;
}

// The Feed a crow will eat. Rats eat every Feed; `crowsRefuse` (Forest Berry)
// leaves it on the ground for them.
export function isCrowFeed(item) {
  return isFeed(item) && !item.data.crowsRefuse;
}
