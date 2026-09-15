import { PointReason } from "../db/pointEvent"
import { buildHistory, IBackfilledEvent } from "../scripts/buildPointHistory"
import { Observation } from "../scripts/observePointHistory"

let failures = 0
let passes = 0

const at = (minute: number): Date => new Date(Date.UTC(2023, 0, 1, 0, minute))
const UNTIL = at(10)

const changed = (minute: number, userId: string, delta: number, balance: number | null, reason: PointReason): Observation => ({
    kind: "change",
    userId: userId,
    delta: delta,
    balance: balance,
    reason: reason,
    command: "cmd",
    messageId: "msg",
    at: at(minute),
})

const seen = (minute: number, userId: string, balance: number): Observation => ({
    kind: "checkpoint",
    userId: userId,
    balance: balance,
    messageId: "msg",
    at: at(minute),
})

const openingsOf = (...entries: [string, number][]): Map<string, number> => new Map(entries)

const summarize = (events: IBackfilledEvent[]): string => events
    .map(event => `${event.seq} ${event.userId} ${event.delta > 0 ? "+" : ""}${event.delta} -> ${event.balance} ${event.reason}`)
    .join(" | ")

const tests: {name: string, observations: Observation[], openings: Map<string, number>, expected: string}[] = [
    {name: "changes that carry their balances chain together with no gaps",
        observations: [changed(1, "A", 50, 1050, "flip"), changed(2, "A", -50, 1000, "flip")],
        openings: openingsOf(["A", 1000]),
        expected: "-2 A +50 -> 1050 flip | -1 A -50 -> 1000 flip"},
    {name: "a checkpoint that disagrees with the running balance gets an unrecorded change",
        observations: [seen(1, "A", 500), changed(2, "A", 30, null, "dailyClaim"), seen(3, "A", 600)],
        openings: openingsOf(["A", 600]),
        expected: "-2 A +30 -> null dailyClaim | -1 A +70 -> 600 unrecorded"},
    {name: "the balance a change started from is checked too",
        observations: [seen(1, "A", 500), changed(2, "A", -100, 450, "flip")],
        openings: openingsOf(["A", 450]),
        expected: "-2 A +50 -> 550 unrecorded | -1 A -100 -> 450 flip"},
    {name: "the gap to the balance live tracking opened with is closed at the end",
        observations: [seen(1, "A", 500)],
        openings: openingsOf(["A", 800]),
        expected: "-1 A +300 -> 800 unrecorded"},
    {name: "changes before any known balance are kept without reconciling",
        observations: [changed(1, "A", 30, null, "dailyClaim"), seen(2, "A", 700)],
        openings: openingsOf(["A", 700]),
        expected: "-1 A +30 -> null dailyClaim"},
    {name: "anything from after live tracking began is left to the live ledger, whoever it belongs to",
        observations: [seen(1, "A", 500), changed(10, "A", 25, 525, "flip"), changed(12, "B", 25, 125, "flip")],
        openings: openingsOf(["A", 500], ["B", 100]),
        expected: ""},
    {name: "a user with no opening is skipped",
        observations: [changed(1, "B", 50, 150, "flip")],
        openings: openingsOf(["A", 500]),
        expected: ""},
    {name: "observations found newest first are still numbered in time order",
        observations: [changed(3, "A", 20, 1070, "flip"), changed(2, "A", 50, 1050, "flip")],
        openings: openingsOf(["A", 1070]),
        expected: "-2 A +50 -> 1050 flip | -1 A +20 -> 1070 flip"},
    {name: "each user is numbered on their own",
        observations: [changed(1, "A", 50, 150, "flip"), changed(2, "B", -20, 80, "giftSent"), changed(3, "A", 10, 160, "flip")],
        openings: openingsOf(["A", 160], ["B", 80]),
        expected: "-2 A +50 -> 150 flip | -1 A +10 -> 160 flip | -1 B -20 -> 80 giftSent"},
]

const main = async () => {
    for (const test of tests) {
        const got = summarize(buildHistory(test.observations, test.openings, UNTIL))
        if (got === test.expected) { passes++; console.log(`  PASS  ${test.name}  [${got}]`) }
        else { failures++; console.log(`  FAIL  ${test.name} -- expected [${test.expected}], got [${got}]`) }
    }

    const handover = buildHistory([seen(1, "A", 500)], openingsOf(["A", 800]), UNTIL)[0]
    const lands = handover?.createdAt.getTime() === UNTIL.getTime() - 1
    if (lands) { passes++; console.log("  PASS  the closing gap lands just before tracking began") }
    else { failures++; console.log(`  FAIL  the closing gap lands just before tracking began -- got ${handover?.createdAt.toISOString()}`) }

    console.log(`\n${passes} passed, ${failures} failed`)
    process.exit(failures > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
