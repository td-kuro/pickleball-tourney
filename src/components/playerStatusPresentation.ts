import type { PlayerAvailabilityStatus } from '../types';

// Shared presentation constants for PlayerAvailabilityControls and
// PlayerActionMenu (the persistent list and the click-a-name-in-Current-
// Round menu both need identical badge styling/confirmation copy — a
// non-component file so Fast Refresh doesn't warn about mixed exports).
export const STATUS_BADGE_CLASS: Record<PlayerAvailabilityStatus, string> = {
  available: 'status-badge status-badge-current',
  'resting-this-round': 'status-badge status-badge-warning',
  late: 'status-badge status-badge-warning',
  'left-early': 'status-badge status-badge-danger',
  injured: 'status-badge status-badge-danger',
  unavailable: 'status-badge',
};

export const DESTRUCTIVE_CONFIRMATIONS: Partial<Record<PlayerAvailabilityStatus, (name: string) => string>> = {
  'left-early': (name) => `Mark ${name} as left early? They'll be removed from future rounds, but completed results stay unchanged.`,
  injured: (name) => `Mark ${name} as injured? They'll be removed from future rounds, but completed results stay unchanged.`,
  unavailable: (name) => `Mark ${name} as unavailable? They'll be removed from future rounds until you set them back to available.`,
};
