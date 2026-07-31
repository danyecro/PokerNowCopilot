import type { PlayerStats } from '../shared/types';
import { THRESHOLDS, MIN_HANDS_FOR_STATS } from '../shared/constants';

export type BadgeColor = 'red' | 'blue' | 'yellow' | 'gray';

export function getBadgeColor(stats: PlayerStats): BadgeColor {
  if (stats.handsSeen < MIN_HANDS_FOR_STATS) return 'gray';

  const isAggressive = stats.vpip > THRESHOLDS.VPIP_LOOSE / 100 && stats.af > THRESHOLDS.AF_AGGRESSIVE;
  const isTight = stats.vpip < THRESHOLDS.VPIP_TIGHT / 100;
  const isCallingStation = stats.vpip > THRESHOLDS.VPIP_LOOSE / 100 && stats.af < THRESHOLDS.AF_PASSIVE;

  if (isAggressive) return 'red';
  if (isTight) return 'blue';
  if (isCallingStation) return 'yellow';
  return 'gray';
}

export const BADGE_COLORS: Record<BadgeColor, { bg: string; text: string; border: string }> = {
  red:    { bg: '#c0392b', text: '#fff', border: '#922b21' },
  blue:   { bg: '#2471a3', text: '#fff', border: '#1a5276' },
  yellow: { bg: '#d4ac0d', text: '#000', border: '#9a7d0a' },
  gray:   { bg: '#555', text: '#ccc', border: '#333' },
};
