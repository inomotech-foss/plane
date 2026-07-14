/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

const hueFromSeed = (seed: string): number => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash << 5) - hash + seed.charCodeAt(i);
  return Math.abs(hash) % 360;
};

/** Deterministic pastel background + same-hue dark text for a fallback avatar. */
export const getFallbackAvatarColors = (seed: string): { backgroundColor: string; color: string } => {
  if (!seed) return { backgroundColor: "hsl(0, 0%, 90%)", color: "hsl(0, 0%, 35%)" };
  const h = hueFromSeed(seed);
  return { backgroundColor: `hsl(${h}, 65%, 90%)`, color: `hsl(${h}, 60%, 30%)` };
};

/** Up to two initials: first letters of the first two words, else the first two characters. */
export const getFallbackAvatarInitials = (name?: string): string => {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
};
