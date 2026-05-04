import { SubscriptionTier } from "@prisma/client";

type ParsedBoostyItem = {
  externalId: string;
  title: string;
  url: string;
  excerpt: string;
  descriptionHtml: string;
  imageUrl?: string;
  publishedAt: Date;
  categories: string[];
  rawPayload: {
    guid?: string;
    title: string;
    link: string;
    description?: string;
    pubDate?: string;
    categories: string[];
    imageUrl?: string;
  };
};

export function parseBoostyRss(xml: string): ParsedBoostyItem[] {
  const items = matchAllBlocks(xml, "item");

  return items
    .map((itemXml) => {
      const title = decodeXml(readTag(itemXml, "title") ?? "").trim();
      const url = decodeXml(readTag(itemXml, "link") ?? "").trim();
      const guid = decodeXml(readTag(itemXml, "guid") ?? "").trim();
      const description = decodeXml(readTag(itemXml, "description") ?? "").trim();
      const pubDate = decodeXml(readTag(itemXml, "pubDate") ?? "").trim();
      const categories = matchAllTags(itemXml, "category").map((value) => decodeXml(value).trim()).filter(Boolean);
      const enclosureUrl = readEnclosureUrl(itemXml) ?? readMediaContentUrl(itemXml);
      const externalId = guid || url || `${title}:${pubDate}`;

      if (!title || !url || !externalId) {
        return null;
      }

      return {
        externalId,
        title,
        url,
        excerpt: toExcerpt(stripHtml(description)),
        descriptionHtml: description,
        ...(enclosureUrl ? { imageUrl: enclosureUrl } : {}),
        publishedAt: pubDate ? new Date(pubDate) : new Date(0),
        categories,
        rawPayload: {
          ...(guid ? { guid } : {}),
          title,
          link: url,
          ...(description ? { description } : {}),
          ...(pubDate ? { pubDate } : {}),
          categories,
          ...(enclosureUrl ? { imageUrl: enclosureUrl } : {})
        }
      };
    })
    .filter((item): item is ParsedBoostyItem => item !== null);
}

export function detectBoostyTier(
  title: string,
  categories: string[],
  defaultTier: SubscriptionTier
): SubscriptionTier {
  const haystack = [title, ...categories].join(" ").toLowerCase();

  if (haystack.includes("[vip]")) {
    return SubscriptionTier.vip;
  }

  if (haystack.includes("[premium]")) {
    return SubscriptionTier.premium;
  }

  if (haystack.includes("[basic]")) {
    return SubscriptionTier.basic;
  }

  return defaultTier;
}

function matchAllBlocks(xml: string, tag: string) {
  const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  return [...xml.matchAll(regex)].map((match) => match[1] ?? "");
}

function matchAllTags(xml: string, tag: string) {
  const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  return [...xml.matchAll(regex)].map((match) => match[1] ?? "");
}

function readTag(xml: string, tag: string) {
  return matchAllTags(xml, tag)[0];
}

function readEnclosureUrl(xml: string) {
  const match = xml.match(/<enclosure\b[^>]*url="([^"]+)"[^>]*>/i);
  return match?.[1];
}

function readMediaContentUrl(xml: string) {
  const match = xml.match(/<media:content\b[^>]*url="([^"]+)"[^>]*>/i);
  return match?.[1];
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function toExcerpt(value: string) {
  return value.length <= 280 ? value : `${value.slice(0, 277).trimEnd()}...`;
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}
