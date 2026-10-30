import type { BellEvent } from './schedule';
/** Read explicit rotation labels; never calculate a school day from the weekday. */
export function getRotationDay(events: Pick<BellEvent, 'title' | 'allDay'>[]) {
  const letters = new Set<string>();
  for (const event of events) {
    if (!event.allDay) continue;
    const title = event.title.trim().replace(/[–—]/g, '-');
    // Dedicated calendar titles: “A Schedule”, “A Day”, “Day B”, “C-day (alt)”, or “D”.
    // Restrict prefixes so ordinary event titles like “Have a day off” do not match.
    const content = title.replace(/^(?:(?:upper school|lower school|US|LS|bell|rotation|cycle|schedule)\s*[:\-]?\s*)+/i, '');
    const match = content.match(/^([A-Z])\d*\s*[- ]?\s*(?:day|schedule)\b/i)
      || content.match(/^day\s*[:\-]?\s*([A-Z])\b/i)
      || content.match(/^([A-Z])(?:\s*\((?:alt|alternate|modified|special)[^)]*\))?$/i);
    if (match) letters.add(match[1].toUpperCase());
  }
  const conflict = letters.size > 1;
  const letter = letters.size === 1 ? [...letters][0] : null;
  return { letter, label: letter ? `${letter} DAY` : null, conflict };
}
