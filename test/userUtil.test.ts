import { MongoMemoryServer } from "mongodb-memory-server"
import mongoose from "mongoose"
import userModel from "../db/user"
import pointEventModel, { IPointChange } from "../db/pointEvent"
import { settleUser, startUserActivity, disableUserActivity, updateUser, inc, set } from "../util/userUtil"
import { updateUserWin, updateUserLoss } from "../util/flipUtil"
import { claimDaily, claimWeekly, claimMonthly, claimYearly, claimByName, claimNames, isClaimName } from "../util/claimUtil"
import { cancelWar } from "../util/warUtil"
import { counterMismatches, openingBalances, seedOpeningBalances, takeSnapshot } from "../scripts/seedPointEvents"
import { invalidEvents, loadOpenings, replaceBackfill } from "../scripts/backfillPointEvents"
import { parsePoints, parseCount } from "../util/args"
import { Message } from "discord.js"

const MINUTE = 60000
const FLIP: IPointChange = {reason: "flip", command: "flip"}
const GIFT: IPointChange = {reason: "giftSent", command: "give"}
const RECEIVED: IPointChange = {reason: "giftReceived", command: "give"}
const CLAIM = {command: "claim"}

let failures = 0
let passes = 0

const check = (name: string, condition: boolean, detail = "") => {
    if (condition) { passes++; console.log(`  PASS  ${name}`) }
    else { failures++; console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ""}`) }
}

const eq = (name: string, actual: unknown, expected: unknown) =>
    check(name, Object.is(actual, expected) || String(actual) === String(expected),
        `expected ${String(expected)}, got ${String(actual)}`)

const fakeMessage = () => {
    const replies: string[] = []
    const message = {reply: (payload: {content: string}) => { replies.push(payload.content); return Promise.resolve() }}
    return {replies: replies, message: message as unknown as Message<boolean>}
}

const seed = async (id: string, fields: Record<string, unknown> = {}) => {
    await userModel.collection.insertOne({id: id, points: 100, secondsActive: 0, flipsWon: 0, flipsLost: 0,
        flipStreak: 0, maxWinStreak: 0, maxLossStreak: 0, pointsWon: 0, pointsLost: 0,
        activeStartDate: null, carriedMs: 0, ...fields})
}

const tests: {name: string, fn: () => Promise<void>}[] = [

{name: "accrual: 90m37s of activity credits 90 points and 5400 seconds", fn: async () => {
    const start = new Date(Date.now() - (90 * MINUTE + 37000))
    await seed("accrue1", {activeStartDate: start})
    const user = await settleUser("accrue1")
    eq("points 100 -> 190", user.points, 190)
    eq("secondsActive 0 -> 5400", user.secondsActive, 5400)
    check("activeStartDate settled all the way up to now",
        (user.activeStartDate?.getTime() ?? 0) >= start.getTime() + 90 * MINUTE + 37000,
        `activeStartDate was ${user.activeStartDate?.toISOString()}`)
    check("the 37s remainder is carried, not dropped",
        user.carriedMs >= 37000 && user.carriedMs < MINUTE, `carriedMs was ${user.carriedMs}`)
}},

{name: "accrual: null activeStartDate is a no-op", fn: async () => {
    await seed("accrue2", {activeStartDate: null})
    const user = await settleUser("accrue2")
    eq("points unchanged", user.points, 100)
    eq("activeStartDate still null", user.activeStartDate, null)
}},

{name: "accrual: activeStartDate missing entirely (legacy doc) yields null", fn: async () => {
    // Guards the $ifNull that was removed from advanceActiveStartDate: $add must treat a
    // missing field the same as null, otherwise inactive legacy rows get a bogus date.
    await userModel.collection.insertOne({id: "nofield", points: 100, secondsActive: 0})
    const user = await settleUser("nofield")
    eq("points unchanged", user.points, 100)
    eq("activeStartDate is null, not a bogus date", user.activeStartDate, null)
}},

{name: "accrual: future-dated activeStartDate is clamped (no bogus credit)", fn: async () => {
    const future = new Date(Date.now() + 10 * MINUTE)
    await seed("skew", {activeStartDate: future})
    const user = await settleUser("skew")
    eq("points unchanged despite future date", user.points, 100)
}},

{name: "disableUserActivity: accrues then clears activeStartDate", fn: async () => {
    await seed("disable1", {activeStartDate: new Date(Date.now() - (5 * MINUTE + 30000))})
    const user = await disableUserActivity("disable1")
    eq("points 100 -> 105", user.points, 105)
    eq("activeStartDate cleared", user.activeStartDate, null)
    check("the 30s that did not fill a minute is banked",
        user.carriedMs >= 30000 && user.carriedMs < MINUTE, `carriedMs was ${user.carriedMs}`)
}},

{name: "carry: the banked remainder pays out on the next session", fn: async () => {
    await seed("carry1", {activeStartDate: new Date(Date.now() - (5 * MINUTE + 30000))})
    await disableUserActivity("carry1")

    await startUserActivity("carry1")
    await userModel.collection.updateOne({id: "carry1"},
        {$set: {activeStartDate: new Date(Date.now() - 40000)}})
    const user = await settleUser("carry1")

    eq("30s banked plus 40s live is a whole point", user.points, 106)
    eq("secondsActive 300 -> 360", user.secondsActive, 360)
    check("10s stays banked", user.carriedMs >= 10000 && user.carriedMs < 11000,
        `carriedMs was ${user.carriedMs}`)
}},

{name: "carry: three 25s sessions add up to a point instead of vanishing", fn: async () => {
    await seed("carry2", {activeStartDate: null, carriedMs: 0})

    const session = async () => {
        await startUserActivity("carry2")
        await userModel.collection.updateOne({id: "carry2"},
            {$set: {activeStartDate: new Date(Date.now() - 25000)}})
        return await disableUserActivity("carry2")
    }

    let user = await session()
    eq("25s is not a point yet", user.points, 100)
    user = await session()
    eq("50s is still not a point", user.points, 100)
    check("but all 50s are banked", user.carriedMs >= 50000 && user.carriedMs < MINUTE,
        `carriedMs was ${user.carriedMs}`)

    user = await session()
    eq("75s crosses the minute", user.points, 101)
    eq("secondsActive 0 -> 60", user.secondsActive, 60)
    check("15s carries into the next session",
        user.carriedMs >= 15000 && user.carriedMs < 16000, `carriedMs was ${user.carriedMs}`)
}},

{name: "carry: settling an inactive user leaves the bank untouched", fn: async () => {
    await seed("carry3", {activeStartDate: null, carriedMs: 45000})
    const user = await settleUser("carry3")
    eq("points unchanged", user.points, 100)
    eq("activeStartDate still null", user.activeStartDate, null)
    eq("carry still 45000", user.carriedMs, 45000)
}},

{name: "carry: a legacy doc with no carriedMs starts banking from zero", fn: async () => {
    await userModel.collection.insertOne({id: "carry4", points: 100, secondsActive: 0,
        activeStartDate: new Date(Date.now() - 90000)})
    const user = await disableUserActivity("carry4")
    eq("90s is one point", user.points, 101)
    check("the odd 30s is banked", user.carriedMs >= 30000 && user.carriedMs < 31000,
        `carriedMs was ${user.carriedMs}`)
}},

{name: "carry: a full minute of bank is credited even with no live session", fn: async () => {
    await seed("carry5", {activeStartDate: null, carriedMs: 90000})
    const user = await settleUser("carry5")
    eq("the banked minute is paid out", user.points, 101)
    eq("secondsActive 0 -> 60", user.secondsActive, 60)
    eq("30s left in the bank", user.carriedMs, 30000)
}},

{name: "startUserActivity: sets the date, second call is idempotent", fn: async () => {
    const first = await startUserActivity("start1")
    check("activeStartDate set", first.activeStartDate instanceof Date)
    const second = await startUserActivity("start1")
    eq("second call does not move it",
        second.activeStartDate?.getTime(), first.activeStartDate?.getTime())
}},

{name: "new user created by updateUser starts from DEFAULT_POINTS", fn: async () => {
    const user = await updateUser("brandnew", {points: inc(-50)}, GIFT)
    eq("DEFAULT_POINTS(100) - 50 = 50, not -50", user.points, 50)
}},

{name: "GUARD: upsert skips schema defaults for fields targeted by $inc", fn: async () => {
    // This is why insertUser saves a new document rather than a one-shot upsert. Mongoose omits
    // points from $setOnInsert because $inc already touches it, so an upserted row starts
    // from 0 - 50 instead of DEFAULT_POINTS - 50. Pinned so a mongoose behaviour change
    // surfaces here rather than silently mis-initialising every new user's balance.
    const r = await userModel.findOneAndUpdate({id: "upsertprobe"}, {$inc: {points: -50}},
        {upsert: true, new: true, setDefaultsOnInsert: true}).lean()
    eq("points start from 0, not DEFAULT_POINTS", r?.points, -50)
}},

{name: "PROBE: is the $cond in advanceActiveStartDateOrNull redundant?", fn: async () => {
    await seed("condprobe", {activeStartDate: null})
    await userModel.collection.updateOne({id: "condprobe"},
        [{$set: {probeResult: {$add: ["$activeStartDate", 0]}}}])
    const raw = await userModel.collection.findOne({id: "condprobe"})
    const isNull = raw?.probeResult === null
    console.log(`        -> $add: [null, 0] produced ${JSON.stringify(raw?.probeResult)}`)
    check("$add propagates null (so the $cond guard is redundant)", isNull,
        "the $cond is load-bearing, keep it")
}},

{name: "insertUser: concurrent creation resolves to one row", fn: async () => {
    await userModel.init()
    const results = await Promise.all([
        settleUser("racer"), settleUser("racer"), settleUser("racer"), settleUser("racer"),
    ])
    const count = await userModel.collection.countDocuments({id: "racer"})
    eq("exactly one document exists", count, 1)
    check("all callers got the same id", results.every(r => r.id === "racer"))
}},

{name: "unique index on id is actually built", fn: async () => {
    await userModel.init()
    const indexes = await userModel.collection.indexes()
    const idIndex = indexes.find(i => i.key && i.key.id === 1)
    check("id index exists and is unique", !!idIndex && idIndex.unique === true,
        JSON.stringify(indexes.map(i => ({key: i.key, unique: i.unique}))))
}},

{name: "dates survive the .lean() round trip", fn: async () => {
    await seed("dates1")
    const claim = new Date()
    await updateUser("dates1", {dailyClaim: set(claim)})
    const user = await settleUser("dates1")
    check("dailyClaim is a real Date", user.dailyClaim instanceof Date)
    eq("getTime() matches what was written", user.dailyClaim?.getTime(), claim.getTime())
}},

{name: "flip win/loss persist correct points, counters and streaks", fn: async () => {
    await seed("flip1")
    let user = await settleUser("flip1")
    user = await updateUserWin(user, 50, FLIP)
    eq("points after win", user.points, 150)
    eq("pointsWon", user.pointsWon, 50)
    eq("flipsWon", user.flipsWon, 1)
    eq("flipStreak", user.flipStreak, 1)
    eq("maxWinStreak", user.maxWinStreak, 1)

    user = await updateUserLoss(user, 30, FLIP)
    eq("points after loss", user.points, 120)
    eq("pointsLost", user.pointsLost, 30)
    eq("flipStreak flipped to -1", user.flipStreak, -1)
    eq("maxLossStreak", user.maxLossStreak, 1)
    eq("maxWinStreak preserved", user.maxWinStreak, 1)
}},

{name: "maxPoints: a new high is kept when points fall back", fn: async () => {
    await seed("peak1")
    let user = await updateUser("peak1", {points: inc(400)}, GIFT)
    eq("500 is the new high", user.maxPoints, 500)
    user = await updateUser("peak1", {points: inc(-450)}, GIFT)
    eq("points fell to 50", user.points, 50)
    eq("the high held at 500", user.maxPoints, 500)
}},

{name: "maxPoints: a flip win sets the high and a loss does not lower it", fn: async () => {
    await seed("peak2")
    let user = await settleUser("peak2")
    user = await updateUserWin(user, 50, FLIP)
    eq("the win set the high to 150", user.maxPoints, 150)
    user = await updateUserLoss(user, 100, FLIP)
    eq("points down to 50", user.points, 50)
    eq("the high stayed at 150", user.maxPoints, 150)
}},

{name: "maxPoints: voice accrual raises the high", fn: async () => {
    await seed("peak3", {activeStartDate: new Date(Date.now() - 30 * MINUTE)})
    const user = await settleUser("peak3")
    eq("points 100 -> 130", user.points, 130)
    eq("the high followed the accrual", user.maxPoints, 130)
}},

{name: "maxPoints: a legacy row is seeded from what it held, not what it drops to", fn: async () => {
    await userModel.collection.insertOne({id: "peak4", points: 50000, secondsActive: 0, activeStartDate: null})
    const user = await updateUser("peak4", {points: inc(-50000)}, GIFT)
    eq("wiped out", user.points, 0)
    eq("the 50000 it was holding is the high", user.maxPoints, 50000)
}},

{name: "maxPoints: a brand new user starts at DEFAULT_POINTS", fn: async () => {
    const user = await settleUser("peak5")
    eq("the high starts at the starting balance", user.maxPoints, 100)
}},

{name: "updateUser rejects a raw value passed instead of inc()/set()", fn: async () => {
    await seed("raw1")
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await updateUser("raw1", {points: 5} as any)
        check("should have thrown", false)
    } catch (e) {
        check("threw a descriptive error", (e as Error).message.includes("raw value"),
            (e as Error).message)
    }
}},

{name: "claimDaily: first ever claim grants 30 points", fn: async () => {
    await seed("claim1", {pointsClaimed: 0, dailyClaim: null})
    const msg = fakeMessage()
    await claimDaily(await settleUser("claim1"), msg.message, CLAIM)
    const user = await settleUser("claim1")
    eq("points 100 -> 130", user.points, 130)
    eq("pointsClaimed 0 -> 30", user.pointsClaimed, 30)
    check("dailyClaim recorded", user.dailyClaim instanceof Date)
    check("granted reply", msg.replies[0].includes("daily 30"), msg.replies[0])
}},

{name: "claimDaily: second claim the same day is refused", fn: async () => {
    await seed("claim2", {pointsClaimed: 0, dailyClaim: new Date()})
    const msg = fakeMessage()
    await claimDaily(await settleUser("claim2"), msg.message, CLAIM)
    const user = await settleUser("claim2")
    eq("points unchanged", user.points, 100)
    eq("pointsClaimed unchanged", user.pointsClaimed, 0)
    check("wait reply", msg.replies[0].includes("Wait until"), msg.replies[0])
}},

{name: "claimDaily: a claim from two days ago is allowed again", fn: async () => {
    await seed("claim3", {pointsClaimed: 0, dailyClaim: new Date(Date.now() - 2 * 24 * 60 * MINUTE)})
    const msg = fakeMessage()
    await claimDaily(await settleUser("claim3"), msg.message, CLAIM)
    const user = await settleUser("claim3")
    eq("points 100 -> 130", user.points, 130)
    check("granted reply", msg.replies[0].includes("daily 30"), msg.replies[0])
}},

{name: "claimWeekly: first ever claim grants 120 points", fn: async () => {
    await seed("week1", {pointsClaimed: 0, weeklyClaim: null})
    const msg = fakeMessage()
    await claimWeekly(await settleUser("week1"), msg.message, CLAIM)
    const user = await settleUser("week1")
    eq("points 100 -> 220", user.points, 220)
    eq("pointsClaimed 0 -> 120", user.pointsClaimed, 120)
    check("granted reply", msg.replies[0].includes("weekly 120"), msg.replies[0])
}},

{name: "claimWeekly: second claim the same week is refused", fn: async () => {
    await seed("week2", {pointsClaimed: 0, weeklyClaim: new Date()})
    const msg = fakeMessage()
    await claimWeekly(await settleUser("week2"), msg.message, CLAIM)
    const user = await settleUser("week2")
    eq("points unchanged", user.points, 100)
    check("wait reply", msg.replies[0].includes("Wait until"), msg.replies[0])
}},

{name: "claimWeekly: a claim from eight days ago is allowed again", fn: async () => {
    await seed("week3", {pointsClaimed: 0, weeklyClaim: new Date(Date.now() - 8 * 24 * 60 * MINUTE)})
    const msg = fakeMessage()
    await claimWeekly(await settleUser("week3"), msg.message, CLAIM)
    const user = await settleUser("week3")
    eq("points 100 -> 220", user.points, 220)
    check("granted reply", msg.replies[0].includes("weekly 120"), msg.replies[0])
}},

{name: "claimMonthly: first ever claim grants 480 points", fn: async () => {
    await seed("month1", {pointsClaimed: 0, monthlyClaim: null})
    const msg = fakeMessage()
    await claimMonthly(await settleUser("month1"), msg.message, CLAIM)
    const user = await settleUser("month1")
    eq("points 100 -> 580", user.points, 580)
    eq("pointsClaimed 0 -> 480", user.pointsClaimed, 480)
    check("monthlyClaim recorded", user.monthlyClaim instanceof Date)
    check("granted reply", msg.replies[0].includes("monthly 480"), msg.replies[0])
}},

{name: "claimMonthly: second claim the same month is refused", fn: async () => {
    await seed("month2", {pointsClaimed: 0, monthlyClaim: new Date()})
    const msg = fakeMessage()
    await claimMonthly(await settleUser("month2"), msg.message, CLAIM)
    const user = await settleUser("month2")
    eq("points unchanged", user.points, 100)
    check("wait reply", msg.replies[0].includes("Wait until"), msg.replies[0])
}},

{name: "claimMonthly: a claim from 70 days ago is allowed again", fn: async () => {
    await seed("month3", {pointsClaimed: 0, monthlyClaim: new Date(Date.now() - 70 * 24 * 60 * MINUTE)})
    const msg = fakeMessage()
    await claimMonthly(await settleUser("month3"), msg.message, CLAIM)
    const user = await settleUser("month3")
    eq("points 100 -> 580", user.points, 580)
}},

{name: "claimYearly: first ever claim grants 1920 points", fn: async () => {
    await seed("year1", {pointsClaimed: 0, yearlyClaim: null})
    const msg = fakeMessage()
    await claimYearly(await settleUser("year1"), msg.message, CLAIM)
    const user = await settleUser("year1")
    eq("points 100 -> 2020", user.points, 2020)
    eq("pointsClaimed 0 -> 1920", user.pointsClaimed, 1920)
    check("granted reply", msg.replies[0].includes("yearly 1920"), msg.replies[0])
}},

{name: "claimYearly: second claim the same year is refused", fn: async () => {
    await seed("year2", {pointsClaimed: 0, yearlyClaim: new Date()})
    const msg = fakeMessage()
    await claimYearly(await settleUser("year2"), msg.message, CLAIM)
    const user = await settleUser("year2")
    eq("points unchanged", user.points, 100)
    check("wait reply", msg.replies[0].includes("Wait until"), msg.replies[0])
}},

{name: "claimYearly: a claim from 400 days ago is allowed again", fn: async () => {
    await seed("year3", {pointsClaimed: 0, yearlyClaim: new Date(Date.now() - 400 * 24 * 60 * MINUTE)})
    const msg = fakeMessage()
    await claimYearly(await settleUser("year3"), msg.message, CLAIM)
    const user = await settleUser("year3")
    eq("points 100 -> 2020", user.points, 2020)
}},

{name: "claim tiers are independent of one another", fn: async () => {
    await seed("indep", {pointsClaimed: 0, dailyClaim: null, weeklyClaim: null, monthlyClaim: null, yearlyClaim: null})
    const msg = fakeMessage()
    await claimDaily(await settleUser("indep"), msg.message, CLAIM)
    await claimWeekly(await settleUser("indep"), msg.message, CLAIM)
    await claimMonthly(await settleUser("indep"), msg.message, CLAIM)
    await claimYearly(await settleUser("indep"), msg.message, CLAIM)
    const user = await settleUser("indep")
    eq("all four granted: 100 + 30 + 120 + 480 + 1920", user.points, 2650)
    eq("pointsClaimed totals 2550", user.pointsClaimed, 2550)
}},

{name: "claimByName routes every advertised name", fn: async () => {
    const names = claimNames()
    eq("four tiers advertised", names.join(","), "daily,weekly,monthly,yearly")
    for (const name of names) {
        check(`isClaimName accepts "${name}"`, isClaimName(name))
    }
    check("isClaimName rejects nonsense", !isClaimName("hourly"))

    await seed("byname", {pointsClaimed: 0, dailyClaim: null})
    const msg = fakeMessage()
    await claimByName(await settleUser("byname"), msg.message, "daily", CLAIM)
    const user = await settleUser("byname")
    eq("routed to the daily tier", user.points, 130)
}},

{name: "parsePoints: a plain number is taken as written", fn: async () => {
    await seed("parse1", {points: 500})
    const user = await settleUser("parse1")
    const msg = fakeMessage()
    eq("40 parses to 40", await parsePoints("40", user, msg.message, "bet"), 40)
    eq("no reply sent", msg.replies.length, 0)
}},

{name: "parsePoints: \"all\" resolves to the whole stack", fn: async () => {
    await seed("parse2", {points: 500})
    const user = await settleUser("parse2")
    const msg = fakeMessage()
    eq("all parses to 500", await parsePoints("AlL", user, msg.message, "bet"), 500)
    eq("no reply sent", msg.replies.length, 0)
}},

{name: "parsePoints: \"some\" stays within 1 and the whole stack", fn: async () => {
    await seed("parse3", {points: 500})
    const user = await settleUser("parse3")
    const msg = fakeMessage()

    const drawn: number[] = []
    for (let n = 0; n < 300; n++) {
        const points = await parsePoints("some", user, msg.message, "bet")
        drawn.push(points as number)
    }

    check("every draw is an integer", drawn.every(p => Number.isInteger(p)))
    check("every draw is at least 1", drawn.every(p => p >= 1), `lowest was ${Math.min(...drawn)}`)
    check("no draw exceeds the stack", drawn.every(p => p <= 500), `highest was ${Math.max(...drawn)}`)
    check("draws actually vary", new Set(drawn).size > 1, "every draw was identical")
    eq("no reply sent", msg.replies.length, 0)
}},

{name: "parsePoints: \"some\" on an empty stack is refused, not rounded to 1", fn: async () => {
    await seed("parse4", {points: 0})
    const user = await settleUser("parse4")
    const msg = fakeMessage()
    eq("rejected", await parsePoints("some", user, msg.message, "bet"), undefined)
    check("told they are broke", msg.replies[0]?.includes("You only got 0 points"), msg.replies[0])
}},

{name: "parsePoints: nonsense and overdrafts are refused", fn: async () => {
    await seed("parse5", {points: 100})
    const user = await settleUser("parse5")

    const nonsense = fakeMessage()
    eq("\"most\" rejected", await parsePoints("most", user, nonsense.message, "bet"), undefined)
    check("named the noun", nonsense.replies[0]?.includes("ain a valid bet"), nonsense.replies[0])

    const overdraft = fakeMessage()
    eq("101 rejected against 100 points", await parsePoints("101", user, overdraft.message, "bet"), undefined)
    check("told how much they have", overdraft.replies[0]?.includes("You only got 100 points"), overdraft.replies[0])
}},

{name: "parsePoints: a minimum rejects anything under it", fn: async () => {
    await seed("min1", {points: 1000})
    const user = await settleUser("min1")

    const under = fakeMessage()
    eq("199 rejected against a 200 minimum", await parsePoints("199", user, under.message, "bet", 200), undefined)
    check("named the minimum", under.replies[0]?.includes("bet at least 200 points"), under.replies[0])

    const exact = fakeMessage()
    eq("200 exactly is allowed", await parsePoints("200", user, exact.message, "bet", 200), 200)
    eq("no reply sent", exact.replies.length, 0)
}},

// A minimum stops someone deliberately naming a trivial wager. "some" hands the
// choice to the bot, so it draws across the whole stack and skips the floor.
{name: "parsePoints: \"some\" ignores the minimum and draws from 1", fn: async () => {
    await seed("min2", {points: 1000})
    const user = await settleUser("min2")
    const msg = fakeMessage()

    const drawn: number[] = []
    for (let n = 0; n < 300; n++) {
        drawn.push(await parsePoints("some", user, msg.message, "bet", 200) as number)
    }

    check("draws reach under the minimum", drawn.some(p => p < 200), `lowest was ${Math.min(...drawn)}`)
    check("no draw falls under 1", drawn.every(p => p >= 1), `lowest was ${Math.min(...drawn)}`)
    check("no draw exceeds the stack", drawn.every(p => p <= 1000), `highest was ${Math.max(...drawn)}`)
    check("draws actually vary", new Set(drawn).size > 1, "every draw was identical")
    eq("no reply sent", msg.replies.length, 0)
}},

{name: "parsePoints: a stack under the minimum is refused for \"all\" but not \"some\"", fn: async () => {
    await seed("min3", {points: 150})
    const user = await settleUser("min3")

    const all = fakeMessage()
    eq("all rejected", await parsePoints("all", user, all.message, "bet", 200), undefined)
    check("named the minimum", all.replies[0]?.includes("bet at least 200 points"), all.replies[0])

    const some = fakeMessage()
    const drawn = await parsePoints("some", user, some.message, "bet", 200)
    check("some allowed under the minimum", drawn !== undefined && drawn >= 1 && drawn <= 150, `drew ${drawn}`)
    eq("no reply sent", some.replies.length, 0)
}},

{name: "parsePoints: the default minimum leaves small bets alone", fn: async () => {
    await seed("min4", {points: 1000})
    const user = await settleUser("min4")
    const msg = fakeMessage()
    eq("1 point is still a valid bet", await parsePoints("1", user, msg.message, "bet"), 1)
    eq("no reply sent", msg.replies.length, 0)
}},

{name: "parsePoints: \"min\" resolves to the minimum the command enforces", fn: async () => {
    await seed("min5", {points: 1000})
    const user = await settleUser("min5")
    const msg = fakeMessage()
    eq("min parses to the 200 minimum", await parsePoints("MiN", user, msg.message, "bet", 200), 200)
    eq("no reply sent", msg.replies.length, 0)
}},

{name: "parsePoints: \"min\" with no minimum is a single point", fn: async () => {
    await seed("min6", {points: 1000})
    const user = await settleUser("min6")
    const msg = fakeMessage()
    eq("min parses to 1", await parsePoints("min", user, msg.message, "gift"), 1)
    eq("no reply sent", msg.replies.length, 0)
}},

{name: "parsePoints: \"min\" is refused when the stack cannot cover it", fn: async () => {
    await seed("min7", {points: 150})
    const user = await settleUser("min7")
    const msg = fakeMessage()
    eq("rejected", await parsePoints("min", user, msg.message, "bet", 200), undefined)
    check("told how much they have", msg.replies[0]?.includes("You only got 150 points"), msg.replies[0])
}},

{name: "parseCount: a plain number within the cap is taken as written", fn: async () => {
    const msg = fakeMessage()
    eq("10 parses to 10", await parseCount("10", 25, msg.message, "number of flips"), 10)
    eq("no reply sent", msg.replies.length, 0)
}},

{name: "parseCount: \"some\" stays within 1 and the command's cap", fn: async () => {
    const msg = fakeMessage()

    const drawn: number[] = []
    for (let n = 0; n < 300; n++) {
        drawn.push(await parseCount("SoMe", 25, msg.message, "number of flips") as number)
    }

    check("every draw is an integer", drawn.every(c => Number.isInteger(c)))
    check("every draw is at least 1", drawn.every(c => c >= 1), `lowest was ${Math.min(...drawn)}`)
    check("no draw exceeds the cap", drawn.every(c => c <= 25), `highest was ${Math.max(...drawn)}`)
    check("draws actually vary", new Set(drawn).size > 1, "every draw was identical")
    eq("no reply sent", msg.replies.length, 0)
}},

{name: "parseCount: nonsense and over-cap counts are refused", fn: async () => {
    const nonsense = fakeMessage()
    eq("\"lots\" rejected", await parseCount("lots", 25, nonsense.message, "number of flips"), undefined)
    check("named the noun", nonsense.replies[0]?.includes("ain a valid number of flips"), nonsense.replies[0])

    const overCap = fakeMessage()
    eq("26 rejected against a cap of 25", await parseCount("26", 25, overCap.message, "number of flips"), undefined)
    check("named the cap", overCap.replies[0]?.includes("No dog, 25 at a time"), overCap.replies[0])
}},

{name: "ledger: updateUser records the change, the balance it left and why", fn: async () => {
    await seed("ledger1")
    await updateUser("ledger1", {points: inc(-40), pointsGiven: inc(40)}, {reason: "giftSent", command: "give", messageId: "m1"})

    const events = await pointEventModel.find({userId: "ledger1"}).lean()
    eq("one event", events.length, 1)
    eq("numbered as the user's first change", events[0]?.seq, 1)
    eq("the delta", events[0]?.delta, -40)
    eq("the balance it left", events[0]?.balance, 60)
    eq("the reason", events[0]?.reason, "giftSent")
    eq("the command", events[0]?.command, "give")
    eq("the message", events[0]?.messageId, "m1")
    check("a timestamp", events[0]?.createdAt instanceof Date)
}},

{name: "ledger: updates that leave points alone record nothing", fn: async () => {
    await seed("ledger2")
    await updateUser("ledger2", {pointsGiven: inc(5), dailyClaim: set(new Date())})
    const user = await updateUser("ledger2", {points: inc(0)}, GIFT)
    eq("no events", await pointEventModel.countDocuments({userId: "ledger2"}), 0)
    eq("nothing was numbered", user.pointsSeq ?? 0, 0)
}},

{name: "ledger: a points change without a reason is refused before anything is written", fn: async () => {
    await seed("ledger3")
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (updateUser as any)("ledger3", {points: inc(10)})
        check("should have thrown", false)
    } catch (e) {
        check("threw a descriptive error", (e as Error).message.includes("without a reason"), (e as Error).message)
    }
    const user = await settleUser("ledger3")
    eq("points untouched", user.points, 100)
    eq("nothing was numbered", user.pointsSeq ?? 0, 0)
    eq("no events", await pointEventModel.countDocuments({userId: "ledger3"}), 0)
}},

{name: "ledger: voice accrual is recorded, and a settle with nothing owed records nothing", fn: async () => {
    await seed("ledger4", {activeStartDate: new Date(Date.now() - (30 * MINUTE + 5000))})
    await settleUser("ledger4")
    const settled = await settleUser("ledger4")

    const events = await pointEventModel.find({userId: "ledger4"}).lean()
    eq("one event for the 30 minutes", events.length, 1)
    eq("30 points", events[0]?.delta, 30)
    eq("left at 130", events[0]?.balance, 130)
    eq("tagged as accrual", events[0]?.reason, "accrual")
    eq("no command behind it", events[0]?.command, undefined)
    eq("only the settle that paid out was numbered", settled.pointsSeq, 1)
}},

{name: "ledger: a new user's starting points are recorded exactly once", fn: async () => {
    await userModel.init()
    await Promise.all([
        settleUser("ledgerRacer"), settleUser("ledgerRacer"), settleUser("ledgerRacer"), settleUser("ledgerRacer"),
    ])

    const events = await pointEventModel.find({userId: "ledgerRacer"}).lean()
    eq("one event despite four racing creators", events.length, 1)
    eq("tagged as a new user", events[0]?.reason, "newUser")
    eq("for the starting balance", events[0]?.delta, 100)
    eq("numbered 1", events[0]?.seq, 1)
    eq("the counter agrees", (await settleUser("ledgerRacer")).pointsSeq, 1)
}},

{name: "ledger: every change replays to the stored balance", fn: async () => {
    const msg = fakeMessage()
    let user = await settleUser("replay")
    user = await updateUserWin(user, 50, FLIP)
    user = await updateUserLoss(user, 30, FLIP)
    await claimDaily(user, msg.message, CLAIM)
    user = await updateUser("replay", {points: inc(-20), pointsGiven: inc(20)}, GIFT)

    const events = await pointEventModel.find({userId: "replay"}).sort({seq: 1}).lean()
    eq("reasons in order", events.map(event => event.reason).join(","), "newUser,flip,flip,dailyClaim,giftSent")
    eq("numbered 1 through 5", events.map(event => event.seq).join(","), "1,2,3,4,5")
    eq("the counter agrees", user.pointsSeq, 5)
    eq("the deltas sum to the balance", events.reduce((sum, event) => sum + event.delta, 0), user.points)
    const running = events.map((event, index) => events.slice(0, index + 1).reduce((sum, earlier) => sum + earlier.delta, 0))
    eq("every recorded balance is the running total", events.map(event => event.balance).join(","), running.join(","))
    eq("the claim is filed under the command that made it", events[3]?.command, "claim")
}},

{name: "ledger: overlapping changes to one user are numbered in the order they landed", fn: async () => {
    await seed("overlap", {points: 1000})
    const deltas = [50, -20, 75, -5, 10, -40, 25, -60, 5, 30]
    await Promise.all(deltas.map(delta => updateUser("overlap", {points: inc(delta)}, RECEIVED)))

    const events = await pointEventModel.find({userId: "overlap"}).sort({seq: 1}).lean()
    eq("every change numbered once, with no gaps", events.map(event => event.seq).join(","), "1,2,3,4,5,6,7,8,9,10")
    const broken = events.filter((event, index) =>
        event.balance === null || event.balance - event.delta !== (index === 0 ? 1000 : events[index - 1].balance))
    eq("each balance follows from the one before it", broken.length, 0)
    eq("the counter matches the events", (await settleUser("overlap")).pointsSeq, 10)
}},

{name: "ledger: the same change can never be recorded twice", fn: async () => {
    await pointEventModel.init()
    const event = {userId: "dupe", seq: 1, delta: 5, balance: 105, reason: "giftReceived"}
    await pointEventModel.create(event)
    try {
        await pointEventModel.create(event)
        check("should have been rejected", false)
    } catch (e) {
        check("rejected as a duplicate", (e as {code?: number}).code === 11000, (e as Error).message)
    }
}},

{name: "ledger: a reason outside the list is rejected", fn: async () => {
    try {
        await pointEventModel.create({userId: "bogus", seq: 1, delta: 5, balance: 105, reason: "lottery"})
        check("should have been rejected", false)
    } catch (e) {
        check("rejected by validation", (e as Error).message.includes("lottery"), (e as Error).message)
    }
}},

{name: "ledger: a canceled war refunds both sides under war, even from the cleanup job", fn: async () => {
    await seed("warOwner", {points: 0})
    await seed("warTarget", {points: 0})
    await cancelWar("warOwner", {ownerId: "warOwner", ownerBet: 50, acceptId: "warTarget", acceptBet: 30, startDate: new Date()})

    const owner = await pointEventModel.find({userId: "warOwner"}).lean()
    const target = await pointEventModel.find({userId: "warTarget"}).lean()
    eq("owner refunded", `${owner[0]?.delta} ${owner[0]?.balance} ${owner[0]?.reason} ${owner[0]?.command}`, "50 50 warRefund war")
    eq("target refunded", `${target[0]?.delta} ${target[0]?.balance} ${target[0]?.reason} ${target[0]?.command}`, "30 30 warRefund war")
}},

{name: "ledger: each user's changes are uniquely numbered by an index", fn: async () => {
    await pointEventModel.init()
    const indexes = await pointEventModel.collection.indexes()
    check("unique on userId then seq", indexes.some(index => index.key?.userId === 1 && index.key?.seq === -1 && index.unique === true),
        JSON.stringify(indexes.map(index => ({key: index.key, unique: index.unique}))))
}},

{name: "seed: opening balances make each history add up, and a second run adds nothing", fn: async () => {
    await seed("fresh", {points: 500})
    await seed("active", {points: 300})
    await updateUser("active", {points: inc(50)}, RECEIVED)
    await seed("broke", {points: 0})

    const openings = openingBalances(await takeSnapshot())
    eq("only users whose history does not already add up",
        openings.map(opening => `${opening.userId}:${opening.opening}`).sort().join(","), "active:300,fresh:500")
    await seedOpeningBalances(openings)

    for (const id of ["fresh", "active"]) {
        const events = await pointEventModel.find({userId: id}).lean()
        eq(`${id}'s history adds up to its balance`, events.reduce((sum, event) => sum + event.delta, 0), (await settleUser(id)).points)
    }

    const active = await pointEventModel.find({userId: "active"}).sort({seq: 1}).lean()
    eq("the opening is numbered 0, ahead of the first live change",
        active.map(event => `${event.seq}:${event.reason}`).join(","), "0:openingBalance,1:giftReceived")
    eq("a second run finds nothing to do", (openingBalances(await takeSnapshot())).length, 0)
}},

{name: "seed: a lost event neither skews the opening balance nor goes unnoticed", fn: async () => {
    await seed("gappy", {points: 200})
    await updateUser("gappy", {points: inc(50)}, RECEIVED)
    await updateUser("gappy", {points: inc(25)}, RECEIVED)
    await updateUser("gappy", {points: inc(10)}, RECEIVED)
    await pointEventModel.deleteOne({userId: "gappy", seq: 2})

    const openings = openingBalances(await takeSnapshot())
    eq("the opening is what the user held before tracking began",
        openings.find(opening => opening.userId === "gappy")?.opening, 200)

    const mismatches = counterMismatches(await takeSnapshot())
    eq("the gap is reported as recorded/highest seq/counter",
        mismatches.map(mismatch => `${mismatch.userId}:${mismatch.recorded}/${mismatch.lastSeq}/${mismatch.counter}`).join(","), "gappy:2/3/3")
}},

{name: "seed: a counter that fell behind its events is reported", fn: async () => {
    await seed("reset", {points: 100})
    await updateUser("reset", {points: inc(10)}, RECEIVED)
    await updateUser("reset", {points: inc(10)}, RECEIVED)
    await userModel.collection.updateOne({id: "reset"}, {$set: {pointsSeq: 1}})

    const mismatches = counterMismatches(await takeSnapshot())
    eq("the reset is reported as recorded/highest seq/counter",
        mismatches.map(mismatch => `${mismatch.userId}:${mismatch.recorded}/${mismatch.lastSeq}/${mismatch.counter}`).join(","), "reset:2/2/1")
}},

{name: "seed: a history that matches its counter is not reported", fn: async () => {
    await seed("steady", {points: 100})
    await updateUser("steady", {points: inc(10)}, RECEIVED)
    await seed("untracked", {points: 100})

    eq("nothing reported", counterMismatches(await takeSnapshot()).length, 0)
}},

{name: "ledger: a backfilled event may leave its balance unknown, a live one may not", fn: async () => {
    await pointEventModel.create({userId: "history", seq: -1, delta: 30, balance: null, reason: "dailyClaim", backfilled: true})
    eq("the backfilled event was kept", await pointEventModel.countDocuments({userId: "history"}), 1)
    try {
        await pointEventModel.create({userId: "history", seq: 1, delta: 30, balance: null, reason: "dailyClaim"})
        check("should have been rejected", false)
    } catch (e) {
        check("rejected for the missing balance", (e as Error).message.includes("balance"), (e as Error).message)
    }
}},

{name: "seed: backfilled history below 0 does not stand in for an opening balance", fn: async () => {
    await seed("historic", {points: 400})
    await pointEventModel.create({userId: "historic", seq: -1, delta: 30, balance: null, reason: "dailyClaim", backfilled: true})

    const snapshot = await takeSnapshot()
    eq("still gets an opening", openingBalances(snapshot).find(opening => opening.userId === "historic")?.opening, 400)
    eq("and the history is not mistaken for a counter problem", counterMismatches(snapshot).length, 0)
}},

{name: "backfill: each user opens at their recorded opening, their first live change, or their balance now", fn: async () => {
    await seed("opened", {points: 900})
    await pointEventModel.create({userId: "opened", seq: 0, delta: 700, balance: 700, reason: "openingBalance"})
    await seed("liveOnly", {points: 300})
    await updateUser("liveOnly", {points: inc(50)}, RECEIVED)
    await seed("quiet", {points: 400})

    const {openings, opened, until} = await loadOpenings()
    eq("one opening found", opened, 1)
    eq("the recorded opening wins", openings.get("opened"), 700)
    eq("a live change gives the balance before it", openings.get("liveOnly"), 300)
    eq("a quiet user opens at what they hold now", openings.get("quiet"), 400)
    const firstLive = await pointEventModel.findOne({userId: "liveOnly", seq: 1}).lean()
    eq("history stops ten seconds before the first live change anywhere", until.getTime(), (firstLive?.createdAt.getTime() ?? 0) - 10000)
}},

{name: "backfill: with nothing tracked live yet, history runs up to now", fn: async () => {
    const now = new Date("2026-09-14T00:00:00Z")
    await seed("quiet", {points: 400})
    eq("until is now", (await loadOpenings(now)).until.getTime(), now.getTime())
}},

{name: "backfill: an invalid event is caught before anything is removed", fn: async () => {
    await pointEventModel.create({userId: "kept", seq: -1, delta: 5, balance: null, reason: "dailyClaim", backfilled: true})
    const broken = [{userId: "kept", seq: -1, delta: Number("nope"), balance: null, reason: "dailyClaim" as const,
        createdAt: new Date(), backfilled: true as const}]

    eq("the dry run reports it", invalidEvents(broken).length, 1)
    try {
        await replaceBackfill(broken)
        check("should have refused", false)
    } catch (e) {
        check("refused with the reason", (e as Error).message.includes("failed validation"), (e as Error).message)
    }
    eq("the earlier backfill is still there", await pointEventModel.countDocuments({userId: "kept", backfilled: true}), 1)
}},

{name: "backfill: applying replaces earlier backfilled history and leaves live events alone", fn: async () => {
    await seed("replaced", {points: 100})
    await updateUser("replaced", {points: inc(10)}, RECEIVED)
    await pointEventModel.create({userId: "replaced", seq: -1, delta: 5, balance: null, reason: "dailyClaim", backfilled: true})

    await replaceBackfill([
        {userId: "replaced", seq: -2, delta: 30, balance: null, reason: "dailyClaim", createdAt: new Date("2023-01-01T00:00:00Z"), backfilled: true},
        {userId: "replaced", seq: -1, delta: -30, balance: 100, reason: "unrecorded", createdAt: new Date("2023-01-02T00:00:00Z"), backfilled: true},
    ])

    const events = await pointEventModel.find({userId: "replaced"}).sort({seq: 1}).lean()
    eq("the old backfill is gone and the new one sits under the live change",
        events.map(event => `${event.seq}:${event.reason}`).join(","), "-2:dailyClaim,-1:unrecorded,1:giftReceived")
}},
]

const main = async () => {
    console.log("starting in-memory mongodb (first run downloads a mongod binary)...")
    const server = await MongoMemoryServer.create()
    await mongoose.connect(server.getUri())
    console.log(`connected: ${server.getUri()}\n`)
    console.log(`DEFAULT_POINTS = ${process.env.DEFAULT_POINTS}\n`)

    for (const t of tests) {
        console.log(t.name)
        try {
            await userModel.collection.deleteMany({})
            await pointEventModel.collection.deleteMany({})
            await t.fn()
        } catch (e) {
            failures++
            console.log(`  ERROR ${(e as Error).message.split("\n")[0]}`)
        }
        console.log("")
    }

    await mongoose.disconnect()
    await server.stop()

    console.log(`${passes} passed, ${failures} failed`)
    process.exit(failures > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
