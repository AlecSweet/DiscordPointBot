import { PointReason } from "../db/pointEvent"
import { buildHistory, IBackfilledEvent, refundShapedRuns } from "../scripts/buildPointHistory"
import { Game, IChannelHold, Observation } from "../scripts/observePointHistory"

let failures = 0
let passes = 0

const at = (minute: number): Date => new Date(Date.UTC(2023, 0, 1, 0, minute))
const UNTIL = at(10)

const changed = (minute: number, userId: string, delta: number, balance: number | null, reason: PointReason, messageId = "msg"): Observation => ({
    kind: "change",
    userId: userId,
    delta: delta,
    balance: balance,
    reason: reason,
    command: "cmd",
    messageId: messageId,
    channelId: "channel",
    at: at(minute),
})

const seen = (minute: number, userId: string, balance: number): Observation => ({
    kind: "checkpoint",
    userId: userId,
    balance: balance,
    messageId: "msg",
    channelId: "channel",
    at: at(minute),
})

const ranAllIn = (startMinute: number, endMinute: number, userId: string, wins: number, balance: number, channelId = "channel"): Observation => ({
    kind: "allInRun",
    userId: userId,
    wins: wins,
    balance: balance,
    channelId: channelId,
    messageId: "panel",
    startedAt: at(startMinute),
    at: at(endMinute),
})

const held = (minute: number, userId: string, game: Game, amount: number | "all" | null, offerId = "offer"): Observation => ({
    kind: "stakeHeld",
    userId: userId,
    game: game,
    amount: amount,
    stakeId: `stake-${userId}`,
    offerId: offerId,
    messageId: `stake-${userId}`,
    channelId: "channel",
    at: at(minute),
})

const released = (minute: number, userId: string, game: Game, keep = 0): Observation => ({
    kind: "stakeReleased",
    userId: userId,
    game: game,
    stakeId: `stake-${userId}`,
    keep: keep,
    messageId: `stake-${userId}`,
    at: at(minute),
})

const openingsOf = (...entries: [string, number][]): Map<string, number> => new Map(entries)

const summarize = (events: IBackfilledEvent[]): string => events
    .map(event => `${event.seq} ${event.userId} ${event.delta > 0 ? "+" : ""}${event.delta} -> ${event.balance} ${event.reason}`)
    .join(" | ")

const check = (name: string, got: string, expected: string) => {
    if (got === expected) { passes++; console.log(`  PASS  ${name}  [${got}]`) }
    else { failures++; console.log(`  FAIL  ${name} -- expected [${expected}], got [${got}]`) }
}

const tests: {name: string, observations: Observation[], openings: Map<string, number>, until?: Date, holds?: IChannelHold[], confirmed?: Set<string>, expected: string}[] = [
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
    {name: "a balance seen dropping to exactly 0 with nothing to explain it is one flip of everything it had",
        observations: [seen(1, "A", 53257), seen(5, "A", 0)],
        openings: openingsOf(["A", 0]),
        expected: "-1 A -53257 -> 0 flip"},
    {name: "the closing gap to live tracking stays unrecorded even when tracking opened at 0",
        observations: [seen(1, "A", 500)],
        openings: openingsOf(["A", 0]),
        expected: "-1 A -500 -> 0 unrecorded"},
    {name: "a negative balance coming back up to 0 is not a flip",
        observations: [seen(1, "A", -4), seen(2, "A", 0)],
        openings: openingsOf(["A", 0]),
        expected: "-1 A +4 -> 0 unrecorded"},
    {name: "a gain no faster than a point a minute since the balance was last seen is accrual",
        observations: [seen(1, "A", 500), seen(61, "A", 540)],
        openings: openingsOf(["A", 540]),
        until: at(100),
        expected: "-1 A +40 -> 540 accrual"},
    {name: "the closing gap is accrual too when it is no faster than a point a minute",
        observations: [seen(1, "A", 500)],
        openings: openingsOf(["A", 505]),
        expected: "-1 A +5 -> 505 accrual"},
    {name: "a drop confirmed as a flip-all loss is one flip of everything, and what trickled back after it is accrual",
        observations: [seen(1, "A", 11826), seen(2, "A", 1)],
        openings: openingsOf(["A", 1]),
        confirmed: new Set(["A/msg"]),
        expected: "-2 A -11826 -> 0 flip | -1 A +1 -> 1 accrual"},
    {name: "the same drop without that confirmation stays unrecorded",
        observations: [seen(1, "A", 11826), seen(2, "A", 1)],
        openings: openingsOf(["A", 1]),
        expected: "-1 A -11825 -> 1 unrecorded"},
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
    {name: "a change of zero points is left out, though the balance it shows is still checked",
        observations: [seen(1, "A", 800), changed(2, "A", 0, 897, "betPayout"), changed(3, "A", 0, null, "betPayout")],
        openings: openingsOf(["A", 897]),
        expected: "-1 A +97 -> 897 unrecorded"},
    {name: "each user is numbered on their own",
        observations: [changed(1, "A", 50, 150, "flip"), changed(2, "B", -20, 80, "giftSent"), changed(3, "A", 10, 160, "flip")],
        openings: openingsOf(["A", 160], ["B", 80]),
        expected: "-2 A +50 -> 150 flip | -1 A +10 -> 160 flip | -1 B -20 -> 80 giftSent"},

    {name: "a busted all-in run stakes the running balance and counts as flips",
        observations: [seen(1, "A", 100), ranAllIn(2, 3, "A", 2, 0)],
        openings: openingsOf(["A", 0]),
        expected: "-3 A +100 -> 200 flip | -2 A +200 -> 400 flip | -1 A -400 -> 0 flip"},
    {name: "changes since the last known balance are part of the stake",
        observations: [seen(1, "A", 100), changed(2, "A", 30, null, "dailyClaim"), ranAllIn(3, 4, "A", 1, 0)],
        openings: openingsOf(["A", 0]),
        expected: "-3 A +30 -> null dailyClaim | -2 A +130 -> 260 flip | -1 A -260 -> 0 flip"},
    {name: "a busted all-in run within three days of the last known balance is rebuilt",
        observations: [seen(1, "A", 100), ranAllIn(4000, 4001, "A", 0, 0)],
        openings: openingsOf(["A", 0]),
        until: at(10000),
        expected: "-1 A -100 -> 0 flip"},
    {name: "a busted all-in run more than three days after the last known balance is not rebuilt, so it is one flip of everything",
        observations: [seen(1, "A", 100), ranAllIn(5000, 5001, "A", 2, 0)],
        openings: openingsOf(["A", 0]),
        until: at(10000),
        expected: "-1 A -100 -> 0 flip"},
    {name: "a busted all-in run with no balance before it is left alone",
        observations: [ranAllIn(2, 3, "A", 2, 0)],
        openings: openingsOf(["A", 0]),
        expected: ""},
    {name: "a run that ends away from zero keeps the difference as unrecorded",
        observations: [seen(1, "A", 100), ranAllIn(2, 3, "A", 1, 15)],
        openings: openingsOf(["A", 15]),
        expected: "-3 A +100 -> 200 flip | -2 A -200 -> 0 flip | -1 A +15 -> 15 unrecorded"},
    {name: "a run with other activity inside it is not rebuilt, and the balance it ended on is checked after that activity",
        observations: [seen(1, "A", 100), ranAllIn(2, 5, "A", 1, 0), changed(3, "A", 30, null, "giftReceived")],
        openings: openingsOf(["A", 0]),
        expected: "-2 A +30 -> null giftReceived | -1 A -130 -> 0 flip"},

    {name: "a challenge stake held before a flip-all run leaves only the remainder to double, and comes back when cancelled",
        observations: [seen(1, "A", 490889), held(2, "A", "challenge", 490376), ranAllIn(3, 4, "A", 4, 0), released(5, "A", "challenge"), seen(8, "A", 490376)],
        openings: openingsOf(["A", 490376]),
        expected: "-7 A -490376 -> null challengeEscrow | -6 A +513 -> 1026 flip | -5 A +1026 -> 2052 flip | -4 A +2052 -> 4104 flip | -3 A +4104 -> 8208 flip | -2 A -8208 -> 0 flip | -1 A +490376 -> null challengeRefund"},
    {name: "a stake of everything takes the whole running balance",
        observations: [seen(1, "A", 300), held(2, "A", "war", "all"), released(3, "A", "war"), seen(4, "A", 300)],
        openings: openingsOf(["A", 300]),
        expected: "-2 A -300 -> 0 warEscrow | -1 A +300 -> null warRefund"},
    {name: "a stake of unknown size stops a flip-all run from being rebuilt",
        observations: [seen(1, "A", 1000), held(2, "A", "challenge", null), ranAllIn(3, 4, "A", 2, 0), released(5, "A", "challenge"), seen(6, "A", 900)],
        openings: openingsOf(["A", 900]),
        expected: "-2 A -1000 -> 0 flip | -1 A +900 -> 900 unrecorded"},
    {name: "an unexplained open game in the same channel stops a flip-all run from being rebuilt",
        observations: [seen(1, "A", 100), ranAllIn(2, 3, "A", 1, 0)],
        openings: openingsOf(["A", 0]),
        holds: [{channelId: "channel", from: at(1), to: at(4)}],
        expected: "-1 A -100 -> 0 flip"},
    {name: "an open game in another channel does not",
        observations: [seen(1, "A", 100), ranAllIn(2, 3, "A", 1, 0)],
        openings: openingsOf(["A", 0]),
        holds: [{channelId: "elsewhere", from: at(1), to: at(4)}],
        expected: "-2 A +100 -> 200 flip | -1 A -200 -> 0 flip"},
    {name: "an rps game's own escrow is recognised as the stake already held, and the unmatched part comes back",
        observations: [seen(1, "A", 1000), held(2, "A", "rps", 500, "game"), changed(2, "A", -300, null, "rpsEscrow", "game"),
            released(4, "A", "rps", 300), changed(4, "A", 600, null, "rpsPayout", "game")],
        openings: openingsOf(["A", 1300]),
        expected: "-3 A -500 -> null rpsEscrow | -2 A +200 -> null rpsRefund | -1 A +600 -> null rpsPayout"},
    {name: "a stake held at the same moment as the game's own escrow is still recognised, whichever was found first",
        observations: [seen(1, "A", 1000), changed(2, "A", -300, null, "rpsEscrow", "game"), held(2, "A", "rps", 500, "game"),
            released(4, "A", "rps", 300), changed(4, "A", 600, null, "rpsPayout", "game")],
        openings: openingsOf(["A", 1300]),
        expected: "-3 A -500 -> null rpsEscrow | -2 A +200 -> null rpsRefund | -1 A +600 -> null rpsPayout"},
    {name: "an rps tie gives the whole stake back",
        observations: [seen(1, "A", 1000), held(2, "A", "rps", 500, "game"), released(4, "A", "rps", 0), seen(5, "A", 1000)],
        openings: openingsOf(["A", 1000]),
        expected: "-2 A -500 -> null rpsEscrow | -1 A +500 -> null rpsRefund"},
    {name: "a war's escrow at the accept is recognised as the stake held at the offer",
        observations: [seen(1, "A", 700), held(2, "A", "war", 700, "accept"), changed(3, "A", -700, 0, "warEscrow", "accept"), changed(4, "A", 1000, 1000, "warPayout", "accept")],
        openings: openingsOf(["A", 1000]),
        expected: "-2 A -700 -> 0 warEscrow | -1 A +1000 -> 1000 warPayout"},
    {name: "a war stake is the whole balance, so a stale balance is caught up before the escrow rather than after it",
        observations: [seen(1, "A", 0), held(2, "A", "war", 3493, "accept"), changed(3, "A", -3493, 0, "warEscrow", "accept"), changed(4, "A", 3709, 3709, "warPayout", "accept")],
        openings: openingsOf(["A", 3709]),
        expected: "-3 A +3493 -> 3493 unrecorded | -2 A -3493 -> 0 warEscrow | -1 A +3709 -> 3709 warPayout"},
    {name: "points that arrive while a war offer is open are not wiped out when it is accepted",
        observations: [seen(1, "A", 700), held(2, "A", "war", 700, "accept"), changed(3, "A", 500, null, "giftReceived", "gift"),
            changed(4, "A", -700, 0, "warEscrow", "accept"), seen(5, "A", 500)],
        openings: openingsOf(["A", 500]),
        expected: "-2 A -700 -> 0 warEscrow | -1 A +500 -> null giftReceived"},
    {name: "a stake of unknown size leaves the game's own escrow in place",
        observations: [seen(1, "A", 1000), held(2, "A", "rps", null, "game"), changed(3, "A", -300, null, "rpsEscrow", "game"), released(4, "A", "rps", 300)],
        openings: openingsOf(["A", 700]),
        expected: "-1 A -300 -> null rpsEscrow"},
]

const main = async () => {
    for (const test of tests) {
        check(test.name, summarize(buildHistory(test.observations, test.openings, test.until ?? UNTIL, test.holds, test.confirmed)), test.expected)
    }

    const handover = buildHistory([seen(1, "A", 500)], openingsOf(["A", 800]), UNTIL)[0]
    check("the closing gap lands just before tracking began",
        String(handover?.createdAt.getTime()), String(UNTIL.getTime() - 1))

    const spotted = buildHistory([seen(1, "A", 500), seen(3, "A", 600), seen(4, "A", 0)], openingsOf(["A", 800]), UNTIL)
        .map(event => `${event.reason}@${event.spotted === undefined ? "nowhere" : `${event.spotted.channelId}/${event.spotted.messageId}`}`)
        .join(" | ")
    check("gaps and inferred losses remember the message that revealed them, and the closing gap has none",
        spotted, "unrecorded@channel/msg | flip@channel/msg | unrecorded@nowhere")

    const flips = buildHistory([seen(1, "A", 100), ranAllIn(2, 3, "A", 1, 0)], openingsOf(["A", 0]), UNTIL)
    check("a rebuilt run's flips are spread between its start and end",
        flips.map(flip => flip.createdAt.getTime() - at(2).getTime()).join(","), "30000,60000")

    const suspicious = buildHistory([seen(1, "A", 1000), ranAllIn(2, 3, "A", 1, 0), seen(30, "A", 900)], openingsOf(["A", 900]), at(100))
    const unremarkable = buildHistory([seen(1, "A", 1000), ranAllIn(2, 3, "A", 1, 0), seen(30, "A", 40)], openingsOf(["A", 40]), at(100))
    check("a run followed soon after by a gap worth half its stake or more is counted as refund shaped",
        `${refundShapedRuns(suspicious)} ${refundShapedRuns(unremarkable)}`, "1 0")

    console.log(`\n${passes} passed, ${failures} failed`)
    process.exit(failures > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
