import { MongoMemoryServer } from "mongodb-memory-server"
import mongoose from "mongoose"
import userModel from "../db/user"
import { settleUser } from "../util/userUtil"
import { addUserMutex } from "../util/userMutexes"

const MINUTE = 60000
const DISCORD_MESSAGE_LIMIT = 2000
const WEALTHIEST_ROLE_ID = "wealthiest"

// Emoji and role ids are Heroku config vars. Unset, every one of them interpolates as
// the string "undefined", which would drown out a genuine undefined leaking from data.
process.env.MOST_POINTS_ROLE_ID = WEALTHIEST_ROLE_ID
process.env.DUSTED_ROLE_ID = "dusted"
for (const emoji of ["NICE", "NOPPERS", "PEEPO_COMFY", "SHRUGGERS", "SMODGE"]) {
    process.env[`${emoji}_EMOJI`] = `:${emoji.toLowerCase()}:`
}

let failures = 0
let passes = 0

const check = (name: string, condition: boolean, detail = "") => {
    if (condition) { passes++; console.log(`  PASS  ${name}`) }
    else { failures++; console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ""}`) }
}

const eq = (name: string, actual: unknown, expected: unknown) =>
    check(name, Object.is(actual, expected) || String(actual) === String(expected),
        `expected ${String(expected)}, got ${String(actual)}`)

// A roll of 128 or more wins. The stub has to replace the module before the gambling
// commands are loaded, because esModuleInterop copies the default export on import.
let rolls: number[] = [255]
let rollAt = 0

const replaceModule = (request: string, exports: unknown) => {
    const resolved = require.resolve(request)
    require(resolved)
    const cached = require.cache[resolved]
    if (!cached) throw new Error(`could not stub ${request}`)
    cached.exports = exports
}

replaceModule("get-random-values", (arr: Uint8Array) => { arr[0] = rolls[rollAt++ % rolls.length]; return arr })
replaceModule("../util/sleep", {__esModule: true, default: () => Promise.resolve()})

const rollSequence = (...values: number[]) => { rolls = values; rollAt = 0 }

/* eslint-disable @typescript-eslint/no-var-requires */
const flip = require("../commands/gamble").default
const martingale = require("../commands/martingale").default
const give = require("../commands/give").default
const top = require("../commands/leaderboard").default
const help = require("../commands/help").default
const assignMostPointsRole = require("../events/assignMostPointsRole").default
/* eslint-enable @typescript-eslint/no-var-requires */

let roleGrantedTo: string | null = null

const fakeMember = (id: string) => ({
    id: id,
    user: {id: id},
    roles: {cache: {has: () => false}, add: async () => { roleGrantedTo = id }, remove: async () => {}}
})

const discordCache = <V>(entries: [string, V][]) => {
    const store = new Map<string, V>()
    entries.forEach(entry => { store.set(entry[0], entry[1]) })
    return {
        get: (key: string) => store.get(key),
        has: (key: string) => store.has(key),
        map: <T>(fn: (value: V) => T): T[] => {
            const mapped: T[] = []
            store.forEach(value => { mapped.push(fn(value)) })
            return mapped
        }
    }
}

const guildWith = (...ids: string[]) => {
    const members = discordCache(ids.map(id => [id, fakeMember(id)] as [string, ReturnType<typeof fakeMember>]))
    const roles = discordCache<{members: {forEach: () => void}}>([[WEALTHIEST_ROLE_ID, {members: {forEach: () => {}}}]])

    return {
        members: {
            cache: members,
            fetch: async (id: string) => {
                if (!members.has(id)) throw new Error("Unknown Member")
                return {displayName: `user${id}`}
            }
        },
        roles: {cache: roles}
    }
}

const written: string[] = []

const fakeContext = (authorId: string) => {
    const replies: string[] = []
    const record = (content: string) => { written.push(content) }
    const sent = {
        edit: async (payload: {content: string}) => { record(payload.content); return sent },
        react: async () => {},
        channel: {} as unknown
    }
    const channel = {
        type: "GUILD_TEXT",
        send: async (payload: {content: string}) => { record(payload.content); sent.channel = channel; return sent }
    }
    const message = {
        author: {id: authorId, username: "tester"},
        channel: channel,
        reply: async (payload: {content: string}) => { replies.push(payload.content); record(payload.content); return sent },
        react: async () => {}
    }
    return {replies: replies, message: message}
}

const seed = async (id: string, fields: Record<string, unknown> = {}) => {
    await userModel.collection.deleteOne({id: id})
    await userModel.collection.insertOne({id: id, points: 100, secondsActive: 0, flipsWon: 0, flipsLost: 0,
        flipStreak: 0, maxWinStreak: 0, maxLossStreak: 0, pointsWon: 0, pointsLost: 0,
        pointsGiven: 0, pointsRecieved: 0, pointsClaimed: 0, activeStartDate: null,
        challengesWon: 0, challengesLost: 0, challengePointsWon: 0, challengePointsLost: 0,
        warsWon: 0, warsLost: 0, warPointsWon: 0, warPointsLost: 0,
        rpsWon: 0, rpsLost: 0, rpsPointsWon: 0, rpsPointsLost: 0, ...fields})
    addUserMutex(id)
}

const tests: {name: string, fn: () => Promise<void>}[] = [

{name: "flip: a fixed wager alternating win/loss nets nothing", fn: async () => {
    rollSequence(255, 0)
    await seed("111", {points: 1000})
    const ctx = fakeContext("111")
    await flip.callback({message: ctx.message, args: ["100", "10"], guild: guildWith("111")})

    const user = await settleUser("111")
    eq("1000 points untouched after 10 flips", user.points, 1000)
    eq("5 wins recorded", user.flipsWon, 5)
    eq("5 losses recorded", user.flipsLost, 5)
}},

{name: "flip: a fixed wager stops once the next flip is unaffordable", fn: async () => {
    rollSequence(0)
    await seed("111", {points: 250})
    const ctx = fakeContext("111")
    await flip.callback({message: ctx.message, args: ["100", "10"], guild: guildWith("111")})

    const user = await settleUser("111")
    eq("250 -> 50 after two losses", user.points, 50)
    eq("stopped at 2 flips, not 10", user.flipsLost, 2)
    check("never went negative", user.points >= 0, `points=${user.points}`)
    check("told them they are short", written.some(w => w.includes("You ain")), written[written.length - 1])
}},

{name: "flip all: the run ends on the first loss", fn: async () => {
    rollSequence(255, 255, 0)
    await seed("111", {points: 100})
    const ctx = fakeContext("111")
    await flip.callback({message: ctx.message, args: ["all", "5"], guild: guildWith("111")})

    const user = await settleUser("111")
    eq("wiped out", user.points, 0)
    eq("doubled twice before busting", user.pointsWon, 300)
}},

{name: "flip all: surviving every flip doubles each time", fn: async () => {
    rollSequence(255)
    await seed("111", {points: 10})
    const ctx = fakeContext("111")
    await flip.callback({message: ctx.message, args: ["all", "5"], guild: guildWith("111")})

    eq("10 doubled five times", (await settleUser("111")).points, 320)
}},

{name: "flip: more flips than the cap is refused", fn: async () => {
    await seed("111", {points: 1000})
    const ctx = fakeContext("111")
    await flip.callback({message: ctx.message, args: ["10", "51"], guild: guildWith("111")})

    check("51 rejected against the cap of 50", ctx.replies[0]?.includes("50 at a time"), ctx.replies[0])
    eq("no points moved", (await settleUser("111")).points, 1000)
}},

{name: "flip: a multi-flip wager under 2% of the stack is refused", fn: async () => {
    await seed("111", {points: 1000})
    const ctx = fakeContext("111")
    await flip.callback({message: ctx.message, args: ["5", "10"], guild: guildWith("111")})

    check("named the minimum", ctx.replies[0]?.includes("at least 20 points"), ctx.replies[0])
    eq("no points moved", (await settleUser("111")).points, 1000)
}},

{name: "flip: a random wager is not held to the multi-flip minimum", fn: async () => {
    rollSequence(255)
    await seed("111", {points: 1000})
    const ctx = fakeContext("111")
    await flip.callback({message: ctx.message, args: ["some", "3"], guild: guildWith("111")})

    check("never refused for being under the minimum",
        !ctx.replies.some(reply => reply.includes("at least")), ctx.replies[0])
    eq("three flips ran", (await settleUser("111")).flipsWon, 3)
}},

{name: "flip: a single flip is not held to the multi-flip minimum", fn: async () => {
    rollSequence(255)
    await seed("111", {points: 1000})
    const ctx = fakeContext("111")
    await flip.callback({message: ctx.message, args: ["5"], guild: guildWith("111")})

    eq("the 5 point flip was allowed and won", (await settleUser("111")).points, 1005)
}},

{name: "flip all: wagering everything always clears the minimum", fn: async () => {
    rollSequence(255)
    await seed("111", {points: 10})
    const ctx = fakeContext("111")
    await flip.callback({message: ctx.message, args: ["all", "5"], guild: guildWith("111")})

    eq("10 doubled five times", (await settleUser("111")).points, 320)
}},

{name: "martingale: a win recovers the whole losing ladder", fn: async () => {
    rollSequence(0, 0, 255)
    await seed("111", {points: 1000})
    const ctx = fakeContext("111")
    await martingale.callback({message: ctx.message, args: ["10", "1"], guild: guildWith("111")})

    const user = await settleUser("111")
    eq("-10 -20 +40 leaves 1010", user.points, 1010)
    eq("one win", user.flipsWon, 1)
    eq("two losses", user.flipsLost, 2)
}},

{name: "martingale: the ladder stops before it can overdraw", fn: async () => {
    rollSequence(0)
    await seed("111", {points: 100})
    const ctx = fakeContext("111")
    await martingale.callback({message: ctx.message, args: ["10", "3"], guild: guildWith("111")})

    const user = await settleUser("111")
    eq("10 + 20 + 40 lost, 30 left", user.points, 30)
    check("never went negative", user.points >= 0, `points=${user.points}`)
    check("told them they are short", written.some(w => w.includes("You ain")), written[written.length - 1])
}},

{name: "martingale: a base bet under 1% of the stack is refused", fn: async () => {
    await seed("111", {points: 1000})
    const ctx = fakeContext("111")
    await martingale.callback({message: ctx.message, args: ["5", "1"], guild: guildWith("111")})

    check("named the minimum", ctx.replies[0]?.includes("at least 10 points"), ctx.replies[0])
    eq("no points moved", (await settleUser("111")).points, 1000)
}},

{name: "martingale: a random base bet is not held to the 1% minimum", fn: async () => {
    rollSequence(255)
    await seed("111", {points: 1000})
    const ctx = fakeContext("111")
    await martingale.callback({message: ctx.message, args: ["some", "1"], guild: guildWith("111")})

    check("never refused for being under the minimum",
        !ctx.replies.some(reply => reply.includes("at least")), ctx.replies[0])
    eq("the ladder ran", (await settleUser("111")).flipsWon, 1)
}},

{name: "give: points leave one side and arrive on the other", fn: async () => {
    await seed("111", {points: 500})
    await seed("222", {points: 500})
    const ctx = fakeContext("111")
    await give.callback({message: ctx.message, args: ["<@222>", "200"], guild: guildWith("111", "222")})

    const sender = await settleUser("111")
    const receiver = await settleUser("222")
    eq("sender debited", sender.points, 300)
    eq("receiver credited", receiver.points, 700)
    eq("pointsGiven tracked", sender.pointsGiven, 200)
    eq("pointsRecieved tracked", receiver.pointsRecieved, 200)
    eq("nothing minted or burned", sender.points + receiver.points, 1000)
}},

{name: "give: an overdraft is refused and leaves both balances alone", fn: async () => {
    await seed("111", {points: 300})
    await seed("222", {points: 700})
    const ctx = fakeContext("111")
    await give.callback({message: ctx.message, args: ["<@222>", "99999"], guild: guildWith("111", "222")})

    check("told how much they have", ctx.replies[0]?.includes("You only got 300 points"), ctx.replies[0])
    eq("sender untouched", (await settleUser("111")).points, 300)
    eq("receiver untouched", (await settleUser("222")).points, 700)
}},

{name: "give: gifting yourself is refused", fn: async () => {
    await seed("111", {points: 300})
    const ctx = fakeContext("111")
    await give.callback({message: ctx.message, args: ["<@111>", "10"], guild: guildWith("111")})

    check("turned down", ctx.replies[0]?.includes("Yourself"), ctx.replies[0])
    eq("balance untouched", (await settleUser("111")).points, 300)
}},

{name: "give all: the whole stack moves", fn: async () => {
    await seed("111", {points: 400})
    await seed("222", {points: 0})
    const ctx = fakeContext("111")
    await give.callback({message: ctx.message, args: ["<@222>", "all"], guild: guildWith("111", "222")})

    eq("sender emptied", (await settleUser("111")).points, 0)
    eq("receiver got the lot", (await settleUser("222")).points, 400)
}},

{name: "wealthiest role: unsettled voice points count toward the total", fn: async () => {
    await seed("111", {points: 1000, activeStartDate: new Date(Date.now() - 50 * MINUTE)})
    await seed("222", {points: 1020, activeStartDate: null})

    roleGrantedTo = null
    await assignMostPointsRole(guildWith("111", "222"))
    eq("50 unaccrued minutes put 111 ahead of a 1020 stored balance", roleGrantedTo, "111")
}},

{name: "wealthiest role: the idle leader keeps it when accrual falls short", fn: async () => {
    await seed("111", {points: 1000, activeStartDate: new Date(Date.now() - 5 * MINUTE)})
    await seed("222", {points: 1020, activeStartDate: null})

    roleGrantedTo = null
    await assignMostPointsRole(guildWith("111", "222"))
    eq("5 minutes is not enough to overtake", roleGrantedTo, "222")
}},

{name: "wealthiest role: a winner outside the stored top five is still found", fn: async () => {
    await seed("111", {points: 900})
    await seed("222", {points: 880})
    await seed("333", {points: 870})
    await seed("444", {points: 860})
    await seed("555", {points: 850})
    await seed("666", {points: 500, activeStartDate: new Date(Date.now() - 600 * MINUTE)})

    roleGrantedTo = null
    await assignMostPointsRole(guildWith("111", "222", "333", "444", "555", "666"))
    eq("sixth by stored points, first once settled", roleGrantedTo, "666")
}},

{name: "wealthiest role: odd documents cannot win it", fn: async () => {
    await userModel.collection.insertOne({id: "999"})
    await seed("111", {points: 10})
    await seed("222", {points: 5, activeStartDate: new Date(Date.now() + 600 * MINUTE)})

    roleGrantedTo = null
    await assignMostPointsRole(guildWith("111", "222", "999"))
    eq("a document with no points loses, and a future start date earns nothing", roleGrantedTo, "111")
}},

{name: "wealthiest role: the lookup writes nothing back", fn: async () => {
    const start = new Date(Date.now() - 50 * MINUTE)
    await seed("111", {points: 1000, activeStartDate: start})

    await assignMostPointsRole(guildWith("111"))

    const stored = await userModel.collection.findOne({id: "111"}) as Record<string, unknown>
    eq("points not materialised", stored.points, 1000)
    eq("secondsActive not materialised", stored.secondsActive, 0)
    eq("activeStartDate not advanced", (stored.activeStartDate as Date).getTime(), start.getTime())
    eq("no settledPoints field persisted", stored.settledPoints, undefined)
}},

{name: "top: every advertised leaderboard is typeable and renders a value", fn: async () => {
    await seed("111", {points: 900, secondsActive: 600, flipsWon: 6, flipsLost: 6, pointsWon: 60, pointsLost: 40,
        pointsClaimed: 10, pointsGiven: 1, pointsRecieved: 1, maxWinStreak: 2, maxLossStreak: 2,
        challengesWon: 1, challengesLost: 1, challengePointsWon: 3, challengePointsLost: 4,
        warsWon: 1, warsLost: 1, warPointsWon: 5, warPointsLost: 6,
        rpsWon: 1, rpsLost: 1, rpsPointsWon: 7, rpsPointsLost: 8})
    const guild = guildWith("111")

    const listing = fakeContext("111")
    await top.callback({message: listing.message, args: [], guild: guild})
    const advertised = listing.replies[0].split("Leadboard Types:")[1].split("```")[0].split(/\s+/).filter(Boolean)

    const untypeable: string[] = []
    const blank: string[] = []
    for (const name of advertised) {
        const ctx = fakeContext("111")
        await top.callback({message: ctx.message, args: [name.toLowerCase()], guild: guild})
        const body = ctx.replies[0] ?? ""
        if (body.includes("Leadboard Types:")) untypeable.push(name)
        else if (body.includes("undefined")) blank.push(name)
    }

    check("the list advertises something", advertised.length > 0)
    check("every advertised type is typeable exactly as printed", untypeable.length === 0, untypeable.join(", "))
    check("no advertised type renders undefined", blank.length === 0, blank.join(", "))
}},

{name: "top: the retired bet leaderboards are gone", fn: async () => {
    await seed("111", {points: 900, betsWon: 3, betsOpened: 2, betPointsWon: 7})
    const guild = guildWith("111")

    for (const retired of ["betswon", "betslost", "bets", "betsopened", "betpointswon", "betpointslost", "pointsbet"]) {
        const ctx = fakeContext("111")
        await top.callback({message: ctx.message, args: [retired], guild: guild})
        check(`${retired} is not a leaderboard`, (ctx.replies[0] ?? "").includes("Leadboard Types:"), ctx.replies[0])
    }

    const listing = fakeContext("111")
    await top.callback({message: listing.message, args: [], guild: guild})
    check("the type list mentions no bets", !/Bets|BetPoints|PointsBet/.test(listing.replies[0]), listing.replies[0])
}},

{name: "top: a member who left the server is named, not dropped", fn: async () => {
    await seed("111", {points: 900})
    await seed("222", {points: 500})
    const ctx = fakeContext("111")
    await top.callback({message: ctx.message, args: ["points"], guild: guildWith("111")})

    const board = ctx.replies[0] ?? ""
    check("the departed member shows as Deleted User", board.includes("Deleted User"), board)
    check("the remaining member keeps their display name", board.includes("user111"), board)
}},

{name: "help: every claim the bot accepts is advertised", fn: async () => {
    const ctx = fakeContext("111")
    await help.callback({message: ctx.message, args: [], guild: guildWith("111")})

    for (const claim of ["daily", "weekly", "monthly", "yearly"]) {
        check(`mentions ${claim}`, ctx.replies[0].includes(claim), ctx.replies[0])
    }
}},

{name: "no command wrote a message Discord would reject", fn: async () => {
    const longest = Math.max(0, ...written.map(content => (content ?? "").length))
    const oversized = written.filter(content => (content ?? "").length > DISCORD_MESSAGE_LIMIT)
    check(`all ${written.length} messages fit the ${DISCORD_MESSAGE_LIMIT} character limit`,
        oversized.length === 0, `${oversized.length} too long, longest was ${longest}`)
}},
]

const main = async () => {
    console.log("starting in-memory mongodb (first run downloads a mongod binary)...")
    const server = await MongoMemoryServer.create()
    await mongoose.connect(server.getUri())
    console.log(`connected: ${server.getUri()}\n`)

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
