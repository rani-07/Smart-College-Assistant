// src/lib/location-search.ts
import { locations, type LocationEntry } from "./locations-data";

/**
 * Finds the best-matching location entry for a free-text query, using
 * simple keyword matching. Returns null if nothing matches well enough.
 */
export function searchLocation(query: string): LocationEntry | null {
  const normalizedQuery = query.toLowerCase();

  let bestMatch: LocationEntry | null = null;
  let bestScore = 0;

  for (const location of locations) {
    let score = 0;
    for (const keyword of location.keywords) {
      if (normalizedQuery.includes(keyword.toLowerCase())) {
        // Longer/more specific keyword matches score higher
        score += keyword.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = location;
    }
  }

  return bestMatch;
}