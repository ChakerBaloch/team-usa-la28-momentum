export const TRUSTED_SOURCES = [
  // Official
  { name: 'USOPC', domain: 'usopc.org', priority: 'high' },
  { name: 'Team USA', domain: 'teamusa.org', priority: 'high' },
  { name: 'LA28', domain: 'la28.org', priority: 'high' },
  { name: 'World Athletics', domain: 'worldathletics.org', priority: 'high' },
  { name: 'World Aquatics', domain: 'worldaquatics.com', priority: 'high' },
  { name: 'IPC', domain: 'paralympic.org', priority: 'high' },

  // Major wire services
  { name: 'Associated Press', domain: 'apnews.com', priority: 'high' },
  { name: 'Reuters', domain: 'reuters.com', priority: 'high' },

  // Major sports outlets
  { name: 'ESPN', domain: 'espn.com', priority: 'medium' },
  { name: 'Sports Illustrated', domain: 'si.com', priority: 'medium' },
  { name: 'NBC Sports', domain: 'nbcsports.com', priority: 'medium' },
  { name: 'USA Today Sports', domain: 'usatoday.com', priority: 'medium' },
  { name: 'Washington Post Sports', domain: 'washingtonpost.com', priority: 'medium' },
  { name: 'New York Times Sports', domain: 'nytimes.com', priority: 'medium' },
  { name: 'The Athletic', domain: 'theathletic.com', priority: 'medium' },
  { name: 'CBS Sports', domain: 'cbssports.com', priority: 'medium' },

  // Sport-specific federation sites
  { name: 'USA Swimming', domain: 'usaswimming.org', priority: 'high' },
  { name: 'USATF', domain: 'usatf.org', priority: 'high' },
  { name: 'USA Gymnastics', domain: 'usagym.org', priority: 'high' },
  { name: 'US Soccer', domain: 'ussoccer.com', priority: 'high' },
  { name: 'USA Basketball', domain: 'usab.com', priority: 'high' },
  { name: 'US Lacrosse', domain: 'uslacrosse.org', priority: 'high' },
  { name: 'USA Shooting', domain: 'usashooting.org', priority: 'high' },
];

export function isTrustedSource(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return TRUSTED_SOURCES.some((source) => hostname.includes(source.domain));
  } catch {
    return false;
  }
}

export function getSourcePriority(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    const match = TRUSTED_SOURCES.find((source) => hostname.includes(source.domain));
    return match?.priority || 'low';
  } catch {
    return 'low';
  }
}
