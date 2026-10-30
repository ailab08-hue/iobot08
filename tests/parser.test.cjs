"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const lunch_1 = require("../.build/lib/lunch");
const schedule_1 = require("../.build/lib/schedule");
const wrap = (events) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events}\r\nEND:VCALENDAR`;
const event = (body) => `BEGIN:VEVENT\n${body}\nEND:VEVENT`;
const from = new Date('2026-10-01T00:00:00-10:00');
const to = new Date('2026-11-01T00:00:00-10:00');
const parse = (body) => (0, schedule_1.parseCalendar)(wrap(body), from, to);
const bulletin = `DAILY BULLETIN: Wednesday, October 28, 2026
US SCHEDULE: A Periods: 1,2,3,4,5,6
Weinberg Snack Bar: Garlic Chicken
One Team Wagon: Baked Potato w/Puerto Rican Chili
ASC Dining Hall: Rosemary Garlic Chicken, Buffalo Chicken Sandwich,
Cheeseburger Pizza
---------------------------------------------------
TODAY'S SCHEDULE
Weinberg Snack Bar: This announcement is not a menu`;
(0, node_test_1.test)('bulletin parser reads only dated first-page food listings, including wrapped text', () => {
    const menu = (0, lunch_1.parseBulletinMenu)(bulletin);
    strict_1.default.equal(menu.date, '2026-10-28');
    strict_1.default.equal(menu.items.length, 3);
    strict_1.default.equal(menu.items[0].food, 'Garlic Chicken');
    strict_1.default.equal(menu.items[2].food, 'Rosemary Garlic Chicken, Buffalo Chicken Sandwich, Cheeseburger Pizza');
    strict_1.default.deepEqual((0, lunch_1.parseBulletinMenu)('DAILY BULLETIN: October 28, 2026\nTODAY’S SCHEDULE\nASC Dining Hall: announcement').items, []);
    strict_1.default.throws(() => (0, lunch_1.parseBulletinMenu)('No date or food'), /date/);
    strict_1.default.throws(() => (0, lunch_1.parseBulletinMenu)(bulletin.replace('October 28', 'February 31')), /date/);
});
(0, node_test_1.test)('lunch output has only the three requested venues, once each', () => {
    const text = `DAILY BULLETIN: October 29, 2026
ASC Dining Hall: Meal C
One Team Wagon: Meal B
Weinberg Snack Bar: Meal A
Weinberg Snack Bar: Repeated entry
TODAY'S SCHEDULE
Other food locations: Not lunch`;
    strict_1.default.deepEqual((0, lunch_1.parseBulletinMenu)(text).items, [
        { location: 'Weinberg Snack Bar', food: 'Meal A' },
        { location: 'One Team Wagon', food: 'Meal B' },
        { location: 'ASC Dining Hall', food: 'Meal C' }
    ]);
});
(0, node_test_1.test)('folded/escaped descriptions, HTML, all-day exclusive end and special schedules', () => {
    const rows = parse(event('UID:chapel\nDTSTART;VALUE=DATE:20261026\nDTEND;VALUE=DATE:20261027\nSUMMARY:Chapel Day\nDESCRIPTION:Block A 8:00-9:00 am\\nChapel 9:15-9:45 am\\nBlock B 10:00-11:00 am\\nNote\\, hello\n  world'));
    strict_1.default.equal(rows.length, 4);
    strict_1.default.equal(rows[0].allDay, true);
    strict_1.default.equal(rows[0].special, true);
    strict_1.default.equal(rows[0].endDate, '2026-10-27');
    strict_1.default.match(rows[0].description, /hello world/);
    strict_1.default.equal(rows[1].start, '2026-10-26T08:00:00-10:00');
});
(0, node_test_1.test)('UTC and floating timestamps resolve to the same Honolulu bell time', () => {
    const rows = parse(event('UID:a\nDTSTART:20261026T180000Z\nDTEND:20261026T190000Z\nSUMMARY:Block A') + '\n' + event('UID:b\nDTSTART:20261026T080000\nDTEND:20261026T090000\nSUMMARY:Block B'));
    strict_1.default.equal(rows[0].start, rows[1].start);
    strict_1.default.equal(rows[0].date, '2026-10-26');
});
(0, node_test_1.test)('weekly rotation honors interval, EXDATE and RDATE', () => {
    const rows = parse(event('UID:rotate\nDTSTART;TZID=Pacific/Honolulu:20260928T080000\nDURATION:PT1H\nRRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=8\nEXDATE;TZID=Pacific/Honolulu:20261012T080000\nRDATE;TZID=Pacific/Honolulu:20261016T080000\nSUMMARY:Block A'));
    strict_1.default.deepEqual(rows.map(e => e.date), ['2026-10-14', '2026-10-16', '2026-10-26', '2026-10-28']);
});
(0, node_test_1.test)('modified instance replaces original; cancelled instance is removed', () => {
    const master = event('UID:rotation\nDTSTART:20261005T080000\nDTEND:20261005T090000\nRRULE:FREQ=WEEKLY;COUNT=4\nSUMMARY:Normal block');
    const override = event('UID:rotation\nRECURRENCE-ID:20261012T080000\nDTSTART:20261013T100000\nDTEND:20261013T110000\nSUMMARY:Assembly alternate');
    const cancelled = event('UID:rotation\nRECURRENCE-ID:20261019T080000\nSTATUS:CANCELLED');
    const rows = parse(master + '\n' + override + '\n' + cancelled);
    strict_1.default.deepEqual(rows.map(e => e.date), ['2026-10-05', '2026-10-13', '2026-10-26']);
    strict_1.default.equal(rows[1].special, true);
});
(0, node_test_1.test)('recurrence override moved in from outside requested month is retained', () => {
    const rows = parse(event('UID:moved\nDTSTART:20260901T080000\nDURATION:PT1H\nRRULE:FREQ=DAILY;COUNT=2\nSUMMARY:Block A') + '\n' + event('UID:moved\nRECURRENCE-ID:20260902T080000\nDTSTART:20261008T080000\nSUMMARY:Modified Block A'));
    strict_1.default.equal(rows.length, 1);
    strict_1.default.equal(rows[0].end, '2026-10-08T19:00:00.000Z');
});
(0, node_test_1.test)('monthly BYDAY/BYSETPOS supports last weekday', () => {
    const rows = parse(event('UID:last\nDTSTART;VALUE=DATE:20260930\nRRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1\nSUMMARY:Community time'));
    strict_1.default.deepEqual(rows.map(e => e.date), ['2026-10-30']);
});
(0, node_test_1.test)('yearly ordinal BYDAY and inclusive UNTIL are respected', () => {
    const rows = parse(event('UID:yearly\nDTSTART;VALUE=DATE:20251013\nRRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=2MO;UNTIL=20261012\nSUMMARY:Special day'));
    strict_1.default.deepEqual(rows.map(e => e.date), ['2026-10-12']);
});
(0, node_test_1.test)('negative month days and multi-day holiday are supported', () => {
    const rows = parse(event('UID:holiday\nDTSTART;VALUE=DATE:20261029\nDTEND;VALUE=DATE:20261102\nSUMMARY:Fall Break') + '\n' + event('UID:lastday\nDTSTART;VALUE=DATE:20260930\nRRULE:FREQ=MONTHLY;BYMONTHDAY=-1\nSUMMARY:Month end'));
    strict_1.default.equal(rows[0].endDate, '2026-11-02');
    strict_1.default.equal(rows[1].date, '2026-10-31');
});
(0, node_test_1.test)('unknown recurrences fail visibly instead of guessing', () => { strict_1.default.throws(() => parse(event('UID:unknown\nDTSTART:20261001T080000\nRRULE:FREQ=HOURLY\nSUMMARY:Test')), /cannot safely expand/); });
(0, node_test_1.test)('latest revision wins and cancelled master suppresses all instances', () => {
    const rows = parse(event('UID:rev\nSEQUENCE:1\nDTSTART:20261001T080000\nSUMMARY:Old') + '\n' + event('UID:rev\nSEQUENCE:2\nDTSTART:20261001T100000\nSUMMARY:New'));
    strict_1.default.equal(rows.length, 1);
    strict_1.default.equal(rows[0].title, 'New');
    strict_1.default.deepEqual(parse(event('UID:cancel\nDTSTART:20261001T080000\nRRULE:FREQ=DAILY;COUNT=2\nSTATUS:CANCELLED')), []);
});
(0, node_test_1.test)('America/Los_Angeles timestamps honor daylight saving transitions', () => {
    const rows = (0, schedule_1.parseCalendar)(wrap(event('UID:dst\nDTSTART;TZID=America/Los_Angeles:20261031T080000\nDURATION:PT1H\nRRULE:FREQ=DAILY;COUNT=3\nSUMMARY:Event')), new Date('2026-10-30'), new Date('2026-11-04'));
    strict_1.default.equal(rows[0].start, '2026-10-31T15:00:00.000Z');
    strict_1.default.equal(rows[1].start, '2026-11-01T16:00:00.000Z');
});
(0, node_test_1.test)('timeless rotating day labels produce no invented bells', () => {
    const rows = parse(event('UID:no-times\nDTSTART;VALUE=DATE:20261001\nSUMMARY:Day 3 alt\nDESCRIPTION:Assembly schedule; see school notice.'));
    strict_1.default.equal(rows.length, 1);
    strict_1.default.equal(rows[0].allDay, true);
});
(0, node_test_1.test)('cross-noon bell ranges and malformed ranges', () => {
    const row = { id: 'x', date: '2026-10-26', description: 'Lunch 11:30–1:00 pm\nBlock A 1:00-2:15\nInvalid 15:90-16:00', title: 'Special schedule' };
    const bells = (0, schedule_1.descriptionBells)(row);
    strict_1.default.equal(bells.length, 2);
    strict_1.default.equal(bells[0].start, '2026-10-26T11:30:00-10:00');
    strict_1.default.equal(bells[0].end, '2026-10-26T13:00:00-10:00');
    strict_1.default.equal(bells[1].start, '2026-10-26T13:00:00-10:00');
});
(0, node_test_1.test)('rejects non-calendar responses, incomplete feeds and unknown time zones', () => {
    strict_1.default.throws(() => (0, schedule_1.parseCalendar)('<html>Forbidden</html>', from, to), /complete iCalendar/);
    strict_1.default.throws(() => parse(event('UID:zone\nDTSTART;TZID=Unknown/Zone:20261001T080000\nSUMMARY:Test')), /Unsupported calendar time zone/);
});
const countdown_1 = require("../.build/lib/countdown");
(0, node_test_1.test)('period countdown uses seconds and reaches zero exactly at a bell', () => {
    const end = '2026-10-26T09:00:00-10:00';
    strict_1.default.equal((0, countdown_1.timerText)((0, countdown_1.secondsUntil)(end, new Date('2026-10-26T08:45:01-10:00'))), '00:14:59');
    strict_1.default.equal((0, countdown_1.timerText)((0, countdown_1.secondsUntil)(end, new Date(end))), '00:00:00');
    strict_1.default.equal((0, countdown_1.secondsUntil)(end, new Date('2026-10-26T09:00:01-10:00')), 0);
});
(0, node_test_1.test)('countdown handles fractional seconds, hour boundaries and invalid input', () => {
    strict_1.default.equal((0, countdown_1.secondsUntil)('2026-10-26T19:00:00.000Z', new Date('2026-10-26T18:59:59.100Z')), 1);
    strict_1.default.equal((0, countdown_1.timerText)(3601), '01:00:01');
    strict_1.default.equal((0, countdown_1.timerText)(90), '00:01:30');
    strict_1.default.equal((0, countdown_1.timerText)(-5), '00:00:00');
    strict_1.default.equal((0, countdown_1.timerText)(NaN), '00:00:00');
    strict_1.default.equal((0, countdown_1.secondsUntil)('bad', new Date()), 0);
});
const ical_1 = require("../.build/lib/ical");
(0, node_test_1.test)('large historical calendar is processed without repeated full-calendar scans', () => {
    const history = Array.from({ length: 12000 }, (_, i) => event(`UID:historic-${i}\nDTSTART:20101005T080000\nDTEND:20101005T090000\nSUMMARY:Historical period ${i}`));
    const active = event('UID:visible\nDTSTART:20261026T080000\nDURATION:PT1H\nSUMMARY:Current month');
    const begin = performance.now();
    const rows = parse([...history, active].join('\n'));
    const elapsed = performance.now() - begin;
    strict_1.default.deepEqual(rows.map(e => e.title), ['Current month']);
    strict_1.default.ok(elapsed < 5000, `12,001-event history took ${elapsed.toFixed(0)} ms; expected less than five seconds`);
    console.info(`Large-feed regression: 12,001 events in ${elapsed.toFixed(0)} ms`);
});
(0, node_test_1.test)('old unbounded recurrences only expand near the requested month', () => {
    const recurring = (0, ical_1.readICS)(wrap(event('UID:long\nDTSTART:19800101T080000\nDURATION:PT1H\nRRULE:FREQ=DAILY\nSUMMARY:Daily period')))[0];
    const rows = (0, ical_1.occurrences)(recurring, to, from);
    strict_1.default.equal(rows.length, 31);
    strict_1.default.equal(rows[0].day, '2026-10-01');
    strict_1.default.equal(rows[30].day, '2026-10-31');
});
(0, node_test_1.test)('old COUNT rules stop at their limit and EXDATE still consumes count', () => {
    const rows = parse(event('UID:old-count\nDTSTART:19800101T080000\nRRULE:FREQ=DAILY;COUNT=3\nSUMMARY:Old') + '\n' + event('UID:limited\nDTSTART:20261001T080000\nRRULE:FREQ=DAILY;COUNT=3\nEXDATE:20261002T080000\nSUMMARY:Counted'));
    strict_1.default.deepEqual(rows.map(e => e.date), ['2026-10-01', '2026-10-03']);
});
(0, node_test_1.test)('windowed monthly BYSETPOS uses the whole month even for a mid-month query', () => {
    const components = (0, ical_1.readICS)(wrap(event('UID:bysetpos\nDTSTART;VALUE=DATE:19800131\nRRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1\nSUMMARY:Last weekday')));
    const rows = (0, ical_1.occurrences)(components[0], new Date('2026-10-20T00:00:00-10:00'), new Date('2026-10-15T00:00:00-10:00'));
    strict_1.default.equal(rows.length, 0);
});
(0, node_test_1.test)('expired UNTIL rules still retain RDATE additions in the selected month', () => {
    const rows = parse(event('UID:added\nDTSTART:20000101T080000\nRRULE:FREQ=DAILY;UNTIL=20000103T080000\nRDATE:20261026T080000\nSUMMARY:Added day'));
    strict_1.default.deepEqual(rows.map(e => e.date), ['2026-10-26']);
});
(0, node_test_1.test)('large recurrence exception history is indexed by series', () => {
    const series = Array.from({ length: 1500 }, (_, i) => event(`UID:series-${i}\nDTSTART:20000101T080000\nRRULE:FREQ=DAILY;COUNT=2\nSUMMARY:Old series`));
    const exceptions = Array.from({ length: 1500 }, (_, i) => event(`UID:series-${i}\nRECURRENCE-ID:20000102T080000\nDTSTART:20261026T080000\nDURATION:PT1H\nSUMMARY:Moved ${i}`));
    const rows = parse([...series, ...exceptions].join('\n'));
    strict_1.default.equal(rows.length, 1500);
    strict_1.default.ok(rows.every(e => e.date === '2026-10-26'));
});
const rotation_day_1 = require("../.build/lib/rotation-day");
(0, node_test_1.test)('rotation day comes from official all-day titles, not weekday or period names', () => {
    strict_1.default.equal((0, rotation_day_1.getRotationDay)([{ title: 'A Day', allDay: true }]).label, 'A DAY');
    strict_1.default.equal((0, rotation_day_1.getRotationDay)([{ title: 'Block A', allDay: false }]).label, null);
    strict_1.default.equal((0, rotation_day_1.getRotationDay)([{ title: 'Have a day off', allDay: true }]).label, null);
});
(0, node_test_1.test)('rotation day handles alternate titles and school prefixes', () => {
    for (const title of ['B-day (alt)', 'Day B', 'Upper School: B Day', 'US - B Day', 'B (alt)', 'B'])
        strict_1.default.equal((0, rotation_day_1.getRotationDay)([{ title, allDay: true }]).label, 'B DAY', title);
});
(0, node_test_1.test)('assembly details do not hide a rotation-day event later in the feed', () => {
    strict_1.default.equal((0, rotation_day_1.getRotationDay)([{ title: 'Assembly', allDay: true }, { title: 'C Day', allDay: true }]).label, 'C DAY');
});
(0, node_test_1.test)('conflicting and missing day labels remain explicit rather than guessed', () => {
    strict_1.default.equal((0, rotation_day_1.getRotationDay)([{ title: 'A Day', allDay: true }, { title: 'B Day', allDay: true }]).conflict, true);
    strict_1.default.equal((0, rotation_day_1.getRotationDay)([{ title: 'A Day', allDay: true }, { title: 'B Day', allDay: true }]).label, null);
    strict_1.default.equal((0, rotation_day_1.getRotationDay)([]).label, null);
    strict_1.default.equal((0, rotation_day_1.getRotationDay)([{ title: 'Chapel', allDay: true }]).label, null);
    strict_1.default.equal((0, rotation_day_1.getRotationDay)([{ title: 'A Day', allDay: true }, { title: 'A-day alt', allDay: true }]).label, 'A DAY');
});
(0, node_test_1.test)('recognizes the actual Google feed schedule titles and renders them as letter days', () => {
    for (const [title, expected] of [
        ['A Schedule (Grs. 9&10 Chapel)', 'A DAY'],
        ['E Schedule (1,2,3,4) (Grs. 11&12 Chapel)', 'E DAY'],
        ['F Schedule (5,6,7,8)', 'F DAY'],
        ['B Schedule (alt)', 'B DAY']
    ])
        strict_1.default.equal((0, rotation_day_1.getRotationDay)([{ title, allDay: true }]).label, expected, title);
    strict_1.default.equal((0, rotation_day_1.getRotationDay)([{ title: 'HEAD OF SCHOOL HOLIDAY', allDay: true }]).label, null);
});

// Numbered variants retain their base rotation letter and official special bells.
(0, node_test_1.test)('recognizes numbered rotation schedules without treating unrelated titles as letters', () => {
    for (const [title, expected] of [['E3 Schedule (1,2,3,4) (Grs. 9&10 Chapel)', 'E DAY'], ['E1 Schedule', 'E DAY'], ['E2 Schedule', 'E DAY'], ['F1 Schedule (7,8,5,6)', 'F DAY'], ['F2 Schedule', 'F DAY'], ['F3 Schedule', 'F DAY']])
        strict_1.default.equal(rotation_day_1.getRotationDay([{title, allDay: true}]).label, expected);
    strict_1.default.equal(rotation_day_1.getRotationDay([{title: 'E3 robotics meeting', allDay: true}]).label, null);
});
