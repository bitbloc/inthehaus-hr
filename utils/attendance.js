// Minutes after the shift start before a check-in counts as late.
// Shared by the attendance summary and the daily shift card so both agree.
export const LATE_GRACE_MINUTES = 15;

// Minutes between two "HH:mm" strings (positive when `actual` is after `scheduled`).
export function minutesAfter(actual, scheduled) {
  const [aH, aM] = actual.split(':').map(Number);
  const [sH, sM] = scheduled.split(':').map(Number);
  return (aH * 60 + aM) - (sH * 60 + sM);
}
