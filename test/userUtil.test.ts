import { MongoMemoryServer } from "mongodb-memory-server"
import mongoose from "mongoose"
import userModel from "../db/user"
import { settleUser, startUserActivity, disableUserActivity, updateUser, inc, set } from "../util/userUtil"
import { updateUserWin, updateUserLoss } from "../util/flipUtil"
import { claimDaily, claimWeekly, claimMonthly, claimYearly, claimByName, claimNames, isClaimName } from "../util/claimUtil"
import { parsePoints, parseCount } from "../util/args"
import { Message } from "discord.js"

const MINUTE = 60000

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
        activeStartDate: null, ...fields})
}

const tests: {name: string, fn: () => Promise<void>}[] = [

{name: "accrual: 90m37s of activity credits 90 points and 5400 seconds", fn: async () => {
    const start = new Date(Date.now() - (90 * MINUTE + 37000))
    await seed("accrue1", {activeStartDate: start})
    const user = await settleUser("accrue1")
    eq("points 100 -> 190", user.points, 190)
    eq("secondsActive 0 -> 5400", user.secondsActive, 5400)
    eq("activeStartDate advanced exactly 90m (37s remainder kept)",
        user.activeStartDate?.getTime(), start.getTime() + 90 * MINUTE)
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
}},

{name: "startUserActivity: sets the date, second call is idempotent", fn: async () => {
    const first = await startUserActivity("start1")
    check("activeStartDate set", first.activeStartDate instanceof Date)
    const second = await startUserActivity("start1")
    eq("second call does not move it",
        second.activeStartDate?.getTime(), first.activeStartDate?.getTime())
}},

{name: "new user created by updateUser starts from DEFAULT_POINTS", fn: async () => {
    const user = await updateUser("brandnew", {points: inc(-50)})
    eq("DEFAULT_POINTS(100) - 50 = 50, not -50", user.points, 50)
}},

{name: "GUARD: upsert skips schema defaults for fields targeted by $inc", fn: async () => {
    // This is why insertUser uses create() rather than a one-shot upsert. Mongoose omits
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
    user = await updateUserWin(user, 50)
    eq("points after win", user.points, 150)
    eq("pointsWon", user.pointsWon, 50)
    eq("flipsWon", user.flipsWon, 1)
    eq("flipStreak", user.flipStreak, 1)
    eq("maxWinStreak", user.maxWinStreak, 1)

    user = await updateUserLoss(user, 30)
    eq("points after loss", user.points, 120)
    eq("pointsLost", user.pointsLost, 30)
    eq("flipStreak flipped to -1", user.flipStreak, -1)
    eq("maxLossStreak", user.maxLossStreak, 1)
    eq("maxWinStreak preserved", user.maxWinStreak, 1)
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
    await claimDaily(await settleUser("claim1"), msg.message)
    const user = await settleUser("claim1")
    eq("points 100 -> 130", user.points, 130)
    eq("pointsClaimed 0 -> 30", user.pointsClaimed, 30)
    check("dailyClaim recorded", user.dailyClaim instanceof Date)
    check("granted reply", msg.replies[0].includes("daily 30"), msg.replies[0])
}},

{name: "claimDaily: second claim the same day is refused", fn: async () => {
    await seed("claim2", {pointsClaimed: 0, dailyClaim: new Date()})
    const msg = fakeMessage()
    await claimDaily(await settleUser("claim2"), msg.message)
    const user = await settleUser("claim2")
    eq("points unchanged", user.points, 100)
    eq("pointsClaimed unchanged", user.pointsClaimed, 0)
    check("wait reply", msg.replies[0].includes("Wait until"), msg.replies[0])
}},

{name: "claimDaily: a claim from two days ago is allowed again", fn: async () => {
    await seed("claim3", {pointsClaimed: 0, dailyClaim: new Date(Date.now() - 2 * 24 * 60 * MINUTE)})
    const msg = fakeMessage()
    await claimDaily(await settleUser("claim3"), msg.message)
    const user = await settleUser("claim3")
    eq("points 100 -> 130", user.points, 130)
    check("granted reply", msg.replies[0].includes("daily 30"), msg.replies[0])
}},

{name: "claimWeekly: first ever claim grants 120 points", fn: async () => {
    await seed("week1", {pointsClaimed: 0, weeklyClaim: null})
    const msg = fakeMessage()
    await claimWeekly(await settleUser("week1"), msg.message)
    const user = await settleUser("week1")
    eq("points 100 -> 220", user.points, 220)
    eq("pointsClaimed 0 -> 120", user.pointsClaimed, 120)
    check("granted reply", msg.replies[0].includes("weekly 120"), msg.replies[0])
}},

{name: "claimWeekly: second claim the same week is refused", fn: async () => {
    await seed("week2", {pointsClaimed: 0, weeklyClaim: new Date()})
    const msg = fakeMessage()
    await claimWeekly(await settleUser("week2"), msg.message)
    const user = await settleUser("week2")
    eq("points unchanged", user.points, 100)
    check("wait reply", msg.replies[0].includes("Wait until"), msg.replies[0])
}},

{name: "claimWeekly: a claim from eight days ago is allowed again", fn: async () => {
    await seed("week3", {pointsClaimed: 0, weeklyClaim: new Date(Date.now() - 8 * 24 * 60 * MINUTE)})
    const msg = fakeMessage()
    await claimWeekly(await settleUser("week3"), msg.message)
    const user = await settleUser("week3")
    eq("points 100 -> 220", user.points, 220)
    check("granted reply", msg.replies[0].includes("weekly 120"), msg.replies[0])
}},

{name: "claimMonthly: first ever claim grants 480 points", fn: async () => {
    await seed("month1", {pointsClaimed: 0, monthlyClaim: null})
    const msg = fakeMessage()
    await claimMonthly(await settleUser("month1"), msg.message)
    const user = await settleUser("month1")
    eq("points 100 -> 580", user.points, 580)
    eq("pointsClaimed 0 -> 480", user.pointsClaimed, 480)
    check("monthlyClaim recorded", user.monthlyClaim instanceof Date)
    check("granted reply", msg.replies[0].includes("monthly 480"), msg.replies[0])
}},

{name: "claimMonthly: second claim the same month is refused", fn: async () => {
    await seed("month2", {pointsClaimed: 0, monthlyClaim: new Date()})
    const msg = fakeMessage()
    await claimMonthly(await settleUser("month2"), msg.message)
    const user = await settleUser("month2")
    eq("points unchanged", user.points, 100)
    check("wait reply", msg.replies[0].includes("Wait until"), msg.replies[0])
}},

{name: "claimMonthly: a claim from 70 days ago is allowed again", fn: async () => {
    await seed("month3", {pointsClaimed: 0, monthlyClaim: new Date(Date.now() - 70 * 24 * 60 * MINUTE)})
    const msg = fakeMessage()
    await claimMonthly(await settleUser("month3"), msg.message)
    const user = await settleUser("month3")
    eq("points 100 -> 580", user.points, 580)
}},

{name: "claimYearly: first ever claim grants 1920 points", fn: async () => {
    await seed("year1", {pointsClaimed: 0, yearlyClaim: null})
    const msg = fakeMessage()
    await claimYearly(await settleUser("year1"), msg.message)
    const user = await settleUser("year1")
    eq("points 100 -> 2020", user.points, 2020)
    eq("pointsClaimed 0 -> 1920", user.pointsClaimed, 1920)
    check("granted reply", msg.replies[0].includes("yearly 1920"), msg.replies[0])
}},

{name: "claimYearly: second claim the same year is refused", fn: async () => {
    await seed("year2", {pointsClaimed: 0, yearlyClaim: new Date()})
    const msg = fakeMessage()
    await claimYearly(await settleUser("year2"), msg.message)
    const user = await settleUser("year2")
    eq("points unchanged", user.points, 100)
    check("wait reply", msg.replies[0].includes("Wait until"), msg.replies[0])
}},

{name: "claimYearly: a claim from 400 days ago is allowed again", fn: async () => {
    await seed("year3", {pointsClaimed: 0, yearlyClaim: new Date(Date.now() - 400 * 24 * 60 * MINUTE)})
    const msg = fakeMessage()
    await claimYearly(await settleUser("year3"), msg.message)
    const user = await settleUser("year3")
    eq("points 100 -> 2020", user.points, 2020)
}},

{name: "claim tiers are independent of one another", fn: async () => {
    await seed("indep", {pointsClaimed: 0, dailyClaim: null, weeklyClaim: null, monthlyClaim: null, yearlyClaim: null})
    const msg = fakeMessage()
    await claimDaily(await settleUser("indep"), msg.message)
    await claimWeekly(await settleUser("indep"), msg.message)
    await claimMonthly(await settleUser("indep"), msg.message)
    await claimYearly(await settleUser("indep"), msg.message)
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
    await claimByName(await settleUser("byname"), msg.message, "daily")
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

{name: "parsePoints: \"some\" honours the minimum", fn: async () => {
    await seed("min2", {points: 1000})
    const user = await settleUser("min2")
    const msg = fakeMessage()

    const drawn: number[] = []
    for (let n = 0; n < 300; n++) {
        drawn.push(await parsePoints("some", user, msg.message, "bet", 200) as number)
    }

    check("no draw falls under the minimum", drawn.every(p => p >= 200), `lowest was ${Math.min(...drawn)}`)
    check("no draw exceeds the stack", drawn.every(p => p <= 1000), `highest was ${Math.max(...drawn)}`)
    check("draws actually vary", new Set(drawn).size > 1, "every draw was identical")
    eq("no reply sent", msg.replies.length, 0)
}},

{name: "parsePoints: a stack under the minimum is refused for \"all\" and \"some\"", fn: async () => {
    await seed("min3", {points: 150})
    const user = await settleUser("min3")

    const all = fakeMessage()
    eq("all rejected", await parsePoints("all", user, all.message, "bet", 200), undefined)
    check("named the minimum", all.replies[0]?.includes("bet at least 200 points"), all.replies[0])

    const some = fakeMessage()
    eq("some rejected", await parsePoints("some", user, some.message, "bet", 200), undefined)
    check("told how much they have", some.replies[0]?.includes("You only got 150 points"), some.replies[0])
}},

{name: "parsePoints: the default minimum leaves small bets alone", fn: async () => {
    await seed("min4", {points: 1000})
    const user = await settleUser("min4")
    const msg = fakeMessage()
    eq("1 point is still a valid bet", await parsePoints("1", user, msg.message, "bet"), 1)
    eq("no reply sent", msg.replies.length, 0)
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
