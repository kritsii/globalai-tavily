const blocklistedDomains = [
  "instagram.com",
  "facebook.com",
  "tiktok.com",
  "youtube.com",
  "pinterest.com",
  "reddit.com",
  "quora.com",
] as const;

function normalizeDomain(domain: string): string {
  return domain.toLowerCase().replace(/^www\./, "");
}

export function matchesDomain(domain: string, knownDomain: string): boolean {
  const normalizedDomain = normalizeDomain(domain);
  const normalizedKnownDomain = normalizeDomain(knownDomain);
  return (
    normalizedDomain === normalizedKnownDomain ||
    normalizedDomain.endsWith(`.${normalizedKnownDomain}`)
  );
}

export function isBlocklistedDomain(domain: string): boolean {
  return blocklistedDomains.some((blocked) => matchesDomain(domain, blocked));
}

export function getDateWindow(meetingAt: string, windowDays = 30) {
  const timestamp = Date.parse(meetingAt);
  if (Number.isNaN(timestamp)) {
    throw new Error("meetingAt must be a valid date.");
  }
  if (!Number.isInteger(windowDays) || windowDays < 0) {
    throw new Error("windowDays must be a non-negative integer.");
  }

  const end = new Date(timestamp);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - windowDays);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export function isWithinDateRange(
  date: string,
  startDate: string,
  endDate: string,
): boolean {
  return date >= startDate && date <= endDate;
}

export function getTwelveMonthCutoff(meetingAt: string): string {
  const timestamp = Date.parse(meetingAt);
  if (Number.isNaN(timestamp)) {
    throw new Error("meetingAt must be a valid date.");
  }
  const cutoff = new Date(timestamp);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  return cutoff.toISOString().slice(0, 10);
}
