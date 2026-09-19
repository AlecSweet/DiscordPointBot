import { MongoMemoryServer } from "mongodb-memory-server"
import { Guild } from "discord.js"
import mongoose from "mongoose"
import userModel from "../db/user"
import pointEventModel, { allPointEvents, clearPointEvents } from "../db/pointEvent"
import challengeModel from "../db/challenge"
import { setShuttingDown } from "../util/shuttingDown"
import { settleUser } from "../util/userUtil"
import { addUserMutex, userMutexes } from "../util/userMutexes"
import getNamedPointEvents, { displayName, memberNames } from "../util/namedPointEvents"
import pointHistoryBody, { buildPointHistoryPayload, clearPointHistoryBody } from "../web/pointHistoryPayload"
import isGuildMember from "../util/guildMembership"

const MINUTE = 60000
const DISCORD_MESSAGE_LIMIT = 2000
const TOP_CAP = 500
const BIG_BOARD = 150
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
const stats = require("../commands/stats").default
const checkPoints = require("../commands/checkPoints").default
const challenge = require("../commands/challenge").default
const serverStats = require("../commands/serverStats").default
const assignMostPointsRole = require("../events/assignMostPointsRole").default
/* eslint-enable @typescript-eslint/no-var-requires */

let roleGrantedTo: string | null = null

const fakeMember = (id: string) => ({
    id: id,
    user: {id: id, username: `name${id}`},
    displayName: `user${id}`,
    nickname: `nick${id}`,
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
        },
        forEach: (fn: (value: V) => void) => store.forEach(value => { fn(value) }),
        size: store.size
    }
}

const guildWith = (...ids: string[]) => {
    const members = discordCache(ids.map(id => [id, fakeMember(id)] as [string, ReturnType<typeof fakeMember>]))
    const roles = discordCache<{members: {forEach: () => void}}>([[WEALTHIEST_ROLE_ID, {members: {forEach: () => {}}}]])

    return {
        members: {
            cache: members,
            fetch: async (id?: string) => {
                if (id === undefined) return members
                if (!members.has(id)) throw new Error("Unknown Member")
                return {displayName: `user${id}`}
            }
        },
        roles: {cache: roles},
        memberCount: ids.length,
        id: "guild"
    }
}

const guildWithOfflineMembers = (online: string[], offline: string[]) => {
    const guild = guildWith(...online)
    const everyone = guildWith(...online, ...offline)
    return {
        ...guild,
        memberCount: online.length + offline.length,
        members: {...guild.members, fetch: async () => everyone.members.cache}
    }
}

const asGuild = (guild: ReturnType<typeof guildWith>) => guild as unknown as Guild

const written: string[] = []

interface IFakeFile {
    name: string | null
    attachment: Buffer
}

interface IFakePayload {
    content?: string
    files?: IFakeFile[]
    components?: unknown[]
}

interface IFakeInteractionPayload {
    content: string
    ephemeral?: boolean
}

interface IFakeInteraction {
    user: {id: string}
    customId: string
    deferReply: (options: {ephemeral?: boolean}) => Promise<void>
    editReply: (payload: IFakePayload) => Promise<void>
}

type IFakeCollectorHandler = (interaction?: IFakeInteraction) => Promise<void>

const fakeContext = (authorId: string) => {
    const replies: string[] = []
    const privateReplies: IFakeInteractionPayload[] = []
    const edits: IFakePayload[] = []
    const record = (content: string) => { written.push(content) }
    let files: IFakeFile[] = []
    let collect: IFakeCollectorHandler | undefined
    let end: IFakeCollectorHandler | undefined
    let deleted = false

    const apply = (payload: IFakePayload) => {
        if (payload.content !== undefined) record(payload.content)
        if (payload.files !== undefined) files = payload.files
    }
    const sent = {
        edit: async (payload: IFakePayload) => { edits.push(payload); apply(payload); return sent },
        delete: async () => { deleted = true; return sent },
        react: async () => {},
        channel: {} as unknown,
        createMessageComponentCollector: () => ({
            on: (event: string, handler: IFakeCollectorHandler) => {
                if (event === "collect") collect = handler
                if (event === "end") end = handler
            },
            stop: () => {}
        })
    }
    const channel = {
        type: "GUILD_TEXT",
        send: async (payload: IFakePayload) => { apply(payload); sent.channel = channel; return sent }
    }
    const message = {
        id: `msg-${authorId}`,
        author: {id: authorId, username: "tester"},
        channel: channel,
        reply: async (payload: {content: string}) => { replies.push(payload.content); record(payload.content); return sent },
        react: async () => {}
    }

    return {
        replies: replies,
        privateReplies: privateReplies,
        edits: edits,
        message: message,
        files: () => files,
        attached: () => files.map(file => file.attachment.toString()).join("\n"),
        press: async (userId: string) => {
            if (!collect) throw new Error("nothing to press")
            let ephemeral = false
            await collect({
                user: {id: userId},
                customId: "show",
                deferReply: async (options: {ephemeral?: boolean}) => { ephemeral = options.ephemeral === true },
                editReply: async (payload: IFakePayload) => {
                    privateReplies.push({content: payload.content ?? "", ephemeral: ephemeral})
                    apply(payload)
                }
            })
        },
        hasButton: () => collect !== undefined,
        deleted: () => deleted,
        expire: async () => {
            if (!end) throw new Error("nothing to expire")
            await end()
        }
    }
}

const numberedLines = (panel: string): number =>
    panel.split("\n").filter(line => /^ *[0-9]+\) /.test(line)).length

const pressButton = async (ctx: ReturnType<typeof fakeContext>, userId = "111"): Promise<string> => {
    await ctx.press(userId)
    return ctx.privateReplies[ctx.privateReplies.length - 1]?.content ?? ""
}

const pressHelp = async (ctx: ReturnType<typeof fakeContext>, userId = "111"): Promise<string> => {
    await help.callback({message: ctx.message, args: [], guild: guildWith("111")})
    return await pressButton(ctx, userId)
}

const pressTop = async (args: string[], guild: ReturnType<typeof guildWith>): Promise<string> => {
    const ctx = fakeContext("111")
    await top.callback({message: ctx.message, args: args, guild: guild})
    return ctx.hasButton() ? await pressButton(ctx) : (ctx.replies[0] ?? "")
}

const seed = async (id: string, fields: Record<string, unknown> = {}) => {
    await userModel.collection.deleteOne({id: id})
    await pointEventModel.collection.deleteMany({userId: id})
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

{name: "flip: \"min\" wagers exactly the multi-flip minimum", fn: async () => {
    rollSequence(255)
    await seed("111", {points: 1000})
    const ctx = fakeContext("111")
    await flip.callback({message: ctx.message, args: ["min", "2"], guild: guildWith("111")})

    check("never refused for being under the minimum",
        !ctx.replies.some(reply => reply.includes("at least")), ctx.replies[0])
    eq("2% of 1000 won twice", (await settleUser("111")).points, 1040)
}},

{name: "flip all: wagering everything always clears the minimum", fn: async () => {
    rollSequence(255)
    await seed("111", {points: 10})
    const ctx = fakeContext("111")
    await flip.callback({message: ctx.message, args: ["all", "5"], guild: guildWith("111")})

    eq("10 doubled five times", (await settleUser("111")).points, 320)
}},

{name: "flip: the panel shows the wager", fn: async () => {
    rollSequence(255, 0)
    await seed("111", {points: 1000})
    const ctx = fakeContext("111")
    const start = written.length
    await flip.callback({message: ctx.message, args: ["100", "4"], guild: guildWith("111")})
    const panels = written.slice(start)

    check("the fixed wager is displayed", panels.every(panel => panel.includes("Bet: 100")), panels[0])
}},

{name: "flip all: the panel tracks the wager as the stack grows", fn: async () => {
    rollSequence(255)
    await seed("111", {points: 10})
    const ctx = fakeContext("111")
    const start = written.length
    await flip.callback({message: ctx.message, args: ["all", "3"], guild: guildWith("111")})
    const panels = written.slice(start)

    check("opens wagering the whole stack", panels[0].includes("Bet: 10"), panels[0])
    check("wagers the grown stack later on", panels.some(panel => panel.includes("Bet: 40")), panels[panels.length - 1])
}},

{name: "flip: every flip is its own numbered line showing the new total", fn: async () => {
    rollSequence(255, 0)
    await seed("111", {points: 1000})
    const ctx = fakeContext("111")
    await flip.callback({message: ctx.message, args: ["100", "4"], guild: guildWith("111")})
    const panel = written[written.length - 1]

    check("the first flip is numbered and shows the new total", panel.includes("1) ✅ 1100"), panel)
    check("the second flip is on the next line", panel.includes("2) ❌ 1000"), panel)
    check("the fourth flip keeps counting", panel.includes("4) ❌ 1000"), panel)
    eq("no file while the panel shows everything", ctx.files().length, 0)
}},

{name: "flip all: the running total doubles down the lines", fn: async () => {
    rollSequence(255)
    await seed("111", {points: 10})
    const ctx = fakeContext("111")
    await flip.callback({message: ctx.message, args: ["all", "5"], guild: guildWith("111")})
    const panel = written[written.length - 1]

    check("the first flip doubles the stack", panel.includes("1) ✅ 20"), panel)
    check("the last flip has doubled five times", panel.includes("5) ✅ 320"), panel)
}},

{name: "flip: five lines show while it is going and once it is done", fn: async () => {
    rollSequence(255)
    await seed("111", {points: 1000})
    const ctx = fakeContext("111")
    const start = written.length
    await flip.callback({message: ctx.message, args: ["100", "12"], guild: guildWith("111")})
    const panels = written.slice(start)

    const running = panels[panels.length - 2]
    const finished = panels[panels.length - 1]
    eq("five lines on the last running panel", numberedLines(running), 5)
    check("the running panel keeps the newest five", running.includes(" 7) ") && running.includes("11) "), running)
    check("the sixth flip has already scrolled off", !running.includes(" 6) "), running)
    eq("still five lines once it is done", numberedLines(finished), 5)
}},

{name: "martingale: five lines show while it is going and once it is done", fn: async () => {
    rollSequence(255)
    await seed("111", {points: 1000})
    const ctx = fakeContext("111")
    const start = written.length
    await martingale.callback({message: ctx.message, args: ["10", "12"], guild: guildWith("111")})
    const panels = written.slice(start)

    const running = panels[panels.length - 2]
    const finished = panels[panels.length - 1]
    eq("five ladders on the last running panel", numberedLines(running), 5)
    check("the running panel keeps the newest five", running.includes(" 7) ") && running.includes("11) "), running)
    check("the sixth ladder has already scrolled off", !running.includes(" 6) "), running)
    eq("still five ladders once it is done", numberedLines(finished), 5)
}},

{name: "flip: the full record is attached as a file once flips scroll off", fn: async () => {
    rollSequence(255)
    await seed("111", {points: 1000})
    const ctx = fakeContext("111")
    await flip.callback({message: ctx.message, args: ["100", "12"], guild: guildWith("111")})
    const panel = written[written.length - 1]

    eq("one file once flips have scrolled off", ctx.files().length, 1)
    eq("named for the command", ctx.files()[0].name, "flips.txt")
    check("the panel keeps the newest flip", panel.includes("12) ✅ 2200"), panel)
    check("the oldest flips have scrolled off", !panel.includes(" 1) ") && !panel.includes(" 2) "), panel)

    const full = ctx.attached()
    check("the scrolled off flips are in the file", full.includes(" 1) ✅ 1100"), full)
    check("the newest flip is in it too", full.includes("12) ✅ 2200"), full)
    check("the file carries the record alone", !full.includes("Points:") && !full.includes("```"), full)
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

{name: "martingale: each ladder line is numbered", fn: async () => {
    rollSequence(0, 255, 255)
    await seed("111", {points: 1000})
    const ctx = fakeContext("111")
    const start = written.length
    await martingale.callback({message: ctx.message, args: ["10", "2"], guild: guildWith("111")})
    const panel = written[written.length - 1]

    check("wrote a panel", written.length > start, `${written.length} vs ${start}`)
    check("the first ladder is numbered", panel.includes("1) ❌ 10  ✅ 20"), panel)
    check("the second ladder is numbered", panel.includes("2) ✅ 10"), panel)
}},

// Rounds keep their true number once older lines scroll off the panel, so the numbering
// tracks how many ladders have actually been played rather than restarting at 1.
{name: "martingale: numbering survives lines scrolling off", fn: async () => {
    rollSequence(255)
    await seed("111", {points: 1000})
    const ctx = fakeContext("111")
    await martingale.callback({message: ctx.message, args: ["10", "12"], guild: guildWith("111")})
    const panel = written[written.length - 1]

    check("the newest ladder keeps its true number", panel.includes("12) "), panel)
    check("the oldest shown ladder is the eighth, right-aligned", panel.includes(" 8) "), panel)
    check("the earlier ladders have scrolled off", !panel.includes(" 1) ") && !panel.includes(" 7) "), panel)
}},

{name: "martingale: the ladder file only shows up once lines scroll off", fn: async () => {
    rollSequence(255)
    await seed("111", {points: 1000})
    const short = fakeContext("111")
    await martingale.callback({message: short.message, args: ["10", "5"], guild: guildWith("111")})
    eq("no file when the panel already shows everything", short.files().length, 0)

    await seed("111", {points: 1000})
    const long = fakeContext("111")
    await martingale.callback({message: long.message, args: ["10", "12"], guild: guildWith("111")})
    eq("a file once ladders have scrolled off", long.files().length, 1)
    eq("named for the command", long.files()[0].name, "martingale.txt")
}},

// Naming attachments at all, even an empty list, makes Discord check Attach Files on the
// edit and answer 50013 when the bot does not have it in the channel.
{name: "a panel with nothing to attach never mentions attachments", fn: async () => {
    rollSequence(255, 0)
    await seed("111", {points: 1000})
    const flipped = fakeContext("111")
    await flip.callback({message: flipped.message, args: ["100", "4"], guild: guildWith("111")})
    const flipEdit = flipped.edits[flipped.edits.length - 1]
    check("the finished flip panel has no files key", !("files" in flipEdit), JSON.stringify(Object.keys(flipEdit)))

    rollSequence(255)
    await seed("111", {points: 1000})
    const laddered = fakeContext("111")
    await martingale.callback({message: laddered.message, args: ["10", "5"], guild: guildWith("111")})
    const ladderEdit = laddered.edits[laddered.edits.length - 1]
    check("the finished ladder panel has no files key", !("files" in ladderEdit), JSON.stringify(Object.keys(ladderEdit)))
}},

{name: "martingale: the attached ladder holds every round", fn: async () => {
    rollSequence(255)
    await seed("111", {points: 1000})
    const ctx = fakeContext("111")
    await martingale.callback({message: ctx.message, args: ["10", "12"], guild: guildWith("111")})
    const panel = written[written.length - 1]
    const full = ctx.attached()

    check("the scrolled off ladders are in it", full.includes(" 1) ") && full.includes(" 2) "), full)
    check("the newest ladder is in it too", full.includes("12) "), full)
    check("the file carries the record alone", !full.includes("Points:") && !full.includes("```"), full)
    check("the public panel still hides them", !panel.includes(" 1) "), panel)
}},

{name: "martingale: a ladder too long for one message still fits one file", fn: async () => {
    rollSequence(0, 0, 0, 0, 255)
    await seed("111", {points: 100000})
    const ctx = fakeContext("111")
    await martingale.callback({message: ctx.message, args: ["1000", "50"], guild: guildWith("111")})
    const full = ctx.attached()

    eq("one file, no paging", ctx.files().length, 1)
    check("longer than a message could ever carry", full.length > DISCORD_MESSAGE_LIMIT, `${full.length}`)
    check("the first ladder is in it", full.includes(" 1) "), full.split("\n")[0])
    check("the last ladder is in it", full.includes("50) "), full.split("\n").slice(-1)[0])
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

    const listing = await pressTop([], guild)
    const advertised = listing.split("Leadboard Types:")[1].split("```")[0].split(/\s+/).filter(Boolean)

    const untypeable: string[] = []
    const blank: string[] = []
    for (const name of advertised) {
        const body = await pressTop([name.toLowerCase()], guild)
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
        const body = await pressTop([retired], guild)
        check(`${retired} is not a leaderboard`, body.includes("Leadboard Types:"), body)
    }

    const listing = await pressTop([], guild)
    check("the type list mentions no bets", !/Bets|BetPoints|PointsBet/.test(listing), listing)
}},

{name: "top points: unsettled voice time counts toward the ranking", fn: async () => {
    await seed("111", {points: 1000, activeStartDate: new Date(Date.now() - 50 * MINUTE)})
    await seed("222", {points: 1020, activeStartDate: null})

    const board = await pressTop(["points"], guildWith("111", "222"))
    check("111 ranks first on 1050 settled, not 1000 stored", board.indexOf("user111") < board.indexOf("user222"), board)
    check("the settled total is displayed", board.includes("1050"), board)
}},

{name: "top peak: a spent down high still outranks a bigger current balance", fn: async () => {
    await seed("111", {points: 10, maxPoints: 5000, activeStartDate: null})
    await seed("222", {points: 4000, maxPoints: 4000, activeStartDate: null})

    const board = await pressTop(["peak"], guildWith("111", "222"))
    check("111 ranks first on a 5000 peak while holding 10", board.indexOf("user111") < board.indexOf("user222"), board)
    check("the peak is displayed", board.includes("5000"), board)
}},

{name: "top peak: unsettled voice time counts toward the peak", fn: async () => {
    await seed("111", {points: 1000, maxPoints: 1000, activeStartDate: new Date(Date.now() - 50 * MINUTE)})
    await seed("222", {points: 1020, maxPoints: 1020, activeStartDate: null})

    const board = await pressTop(["peak"], guildWith("111", "222"))
    check("111 ranks first on a 1050 settled peak", board.indexOf("user111") < board.indexOf("user222"), board)
    check("the settled peak is displayed", board.includes("1050"), board)
}},

{name: "top active: unsettled voice time counts toward the ranking", fn: async () => {
    await seed("111", {secondsActive: 0, activeStartDate: new Date(Date.now() - 120 * MINUTE)})
    await seed("222", {secondsActive: 3600, activeStartDate: null})

    const board = await pressTop(["active"], guildWith("111", "222"))
    check("111 ranks first on 2h unsettled against a stored 1h", board.indexOf("user111") < board.indexOf("user222"), board)
    check("the settled time is displayed", board.includes("0d / 2h / 0m"), board)
}},

{name: "top: the settled ranking is not written back to the database", fn: async () => {
    const start = new Date(Date.now() - 50 * MINUTE)
    await seed("111", {points: 1000, secondsActive: 0, activeStartDate: start})
    await pressTop(["points"], guildWith("111"))

    const raw = await userModel.collection.findOne({id: "111"})
    eq("points not materialised", raw?.points, 1000)
    eq("secondsActive not materialised", raw?.secondsActive, 0)
    eq("activeStartDate not advanced", raw?.activeStartDate?.getTime(), start.getTime())
}},

// Debt is (minutes earned + 100 + claimed) - points. An unsettled voice minute raises
// the earned side and the points side by exactly one each, so it cancels out. 111 below
// is the unsettled twin of 222; both must land on the same number.
{name: "top debt: unsettled voice time cancels out of the debt formula", fn: async () => {
    await seed("111", {points: 1000, secondsActive: 0, activeStartDate: new Date(Date.now() - 50 * MINUTE)})
    await seed("222", {points: 1050, secondsActive: 3000, activeStartDate: null})

    const mostBoard = await pressTop(["mostdebt"], guildWith("111", "222"))
    eq("both twins show the same most-debt value", (mostBoard.match(/-900/g) ?? []).length, 2)

    const leastBoard = await pressTop(["leastdebt"], guildWith("111", "222"))
    eq("both twins show the same least-debt value", (leastBoard.match(/-900/g) ?? []).length, 2)
}},

{name: "top: a member who left the server is named, not dropped", fn: async () => {
    await seed("111", {points: 900})
    await seed("222", {points: 500})

    const board = await pressTop(["points"], guildWith("111"))
    check("the departed member shows as Deleted User", board.includes("Deleted User"), board)
    check("the remaining member keeps their display name", board.includes("user111"), board)
}},

{name: "top: the board stays out of the channel until someone presses", fn: async () => {
    await seed("111", {points: 900})
    const ctx = fakeContext("111")
    await top.callback({message: ctx.message, args: ["points", "3"], guild: guildWith("111")})

    check("the channel only gets the button message", !ctx.replies.join("").includes("user111"),
        ctx.replies.join(""))
    check("the button message names the board", ctx.replies[0].includes("Points Top"), ctx.replies[0])

    const board = await pressButton(ctx, "222")
    check("a bystander pressing gets the board", board.includes("user111"), board)
    check("the header counts the rows it shows", board.startsWith(`**Points Top ${numberedLines(board)}**`),
        board.split("\n")[0])
    check("privately", ctx.privateReplies[0]?.ephemeral === true, JSON.stringify(ctx.privateReplies[0]))
    eq("no file while the panel shows everything", ctx.files().length, 0)
}},

{name: "top: a bad count is refused before any button is offered", fn: async () => {
    await seed("111", {points: 900})
    const ctx = fakeContext("111")
    await top.callback({message: ctx.message, args: ["points", `${TOP_CAP + 1}`], guild: guildWith("111")})

    check("no button was offered", !ctx.hasButton(), ctx.replies.join(""))
    check("the cap is named", (ctx.replies[0] ?? "").includes(`1-${TOP_CAP}`), ctx.replies[0])
}},

{name: "top: a board too big for one message is trimmed and attached in full", fn: async () => {
    const ids = Array.from({length: BIG_BOARD}, (value, index) => `9${String(index).padStart(3, "0")}`)
    for (const id of ids) {
        await seed(id, {points: 10000 + Number(id)})
    }

    const ctx = fakeContext("111")
    await top.callback({message: ctx.message, args: ["points", `${BIG_BOARD}`], guild: guildWith(...ids)})
    const board = await pressButton(ctx)
    const shown = numberedLines(board)

    check("it fits a discord message", board.length <= DISCORD_MESSAGE_LIMIT, `${board.length}`)
    check("far more than the old cap of 25 is shown", shown > 25, `${shown}`)
    check("the overflow is dropped from the panel", shown < BIG_BOARD, `${shown}`)
    check("the header says how many of how many", board.startsWith(`**Points Top ${shown} of ${BIG_BOARD}**`),
        board.split("\n")[0])
    check("the ranks stay aligned", board.includes(` 1) user9149:`), board.split("\n")[2])

    eq("one file once rows scroll off", ctx.files().length, 1)
    eq("named for the command", ctx.files()[0].name, "top.txt")

    const full = ctx.attached()
    eq("the file holds every rank", numberedLines(full), BIG_BOARD)
    check("including the last one", full.includes(`${BIG_BOARD}) user9000:`), full.slice(-80))
    check("the file carries the ranking alone", !full.includes("**") && !full.includes("```"), full.slice(0, 80))

    await userModel.collection.deleteMany({id: {$in: ids}})
}},

{name: "help: every claim the bot accepts is advertised", fn: async () => {
    const commands = await pressHelp(fakeContext("111"))

    for (const claim of ["daily", "weekly", "monthly", "yearly"]) {
        check(`mentions ${claim}`, commands.includes(claim), commands)
    }
}},

{name: "help: the limits the gambling commands enforce are advertised", fn: async () => {
    const commands = await pressHelp(fakeContext("111"))

    check("names the flip cap", commands.includes("max 50"), commands)
    check("names the multi-flip minimum", commands.includes("2%+"), commands)
    check("names the martingale minimum", commands.includes("1%+"), commands)
    eq("a cap is advertised for both flip and martingale",
        (commands.match(/max 50/g) ?? []).length, 2)
}},

{name: "help: every wager keyword is advertised by every command that takes one", fn: async () => {
    const commands = await pressHelp(fakeContext("111"))

    for (const name of ["!give", "!flip", "!martingale", "!challenge", "!rps"]) {
        const line = commands.split("\n").find(l => l.includes(name)) ?? ""
        for (const keyword of ["all", "some", "min"]) {
            check(`${name} advertises ${keyword}`, line.includes(keyword), line)
        }
    }
}},

{name: "help: every command the bot answers to is advertised", fn: async () => {
    const commands = await pressHelp(fakeContext("111"))

    for (const name of ["points", "give", "claim", "flip", "martingale", "challenge", "rps", "war",
                        "stats", "top", "serverStats"]) {
        check(`lists !${name}`, commands.includes(`!${name}`), commands)
    }
}},

{name: "help: the command list stays out of the channel", fn: async () => {
    const ctx = fakeContext("111")
    const commands = await pressHelp(ctx)

    check("the presser gets it privately", ctx.privateReplies[0]?.ephemeral === true,
        JSON.stringify(ctx.privateReplies[0]))
    check("the channel only gets the button message", !ctx.replies.join("").includes("!flip"),
        ctx.replies.join(""))
    check("the button hands back the whole list", commands.includes("!flip"), commands)

    const editsBeforeExpiry = ctx.edits.length
    await ctx.expire()
    check("the button message is gone", ctx.deleted(), JSON.stringify(ctx.edits))
    eq("nothing was left behind saying it expired", ctx.edits.length, editsBeforeExpiry)
}},

{name: "stats: the button hands the numbers to whoever presses it", fn: async () => {
    await seed("111", {points: 700, flipsWon: 3, flipsLost: 1, pointsWon: 250, pointsLost: 50})
    const ctx = fakeContext("111")
    await stats.callback({message: ctx.message, args: [], guild: guildWith("111")})

    check("the channel only gets the button message", !ctx.replies.join("").includes("Peak Points"),
        ctx.replies.join(""))
    check("the button message names whose stats they are", ctx.replies[0].includes("<@111>"), ctx.replies[0])

    const panel = await pressButton(ctx, "222")
    check("a bystander pressing gets the stats", panel.includes("Peak Points"), panel)
    check("privately", ctx.privateReplies[0]?.ephemeral === true, JSON.stringify(ctx.privateReplies[0]))
    check("the balance is the seeded one", panel.includes("700"), panel)
}},

{name: "stats: the button reads the balance at press time, not at command time", fn: async () => {
    await seed("111", {points: 700})
    const ctx = fakeContext("111")
    await stats.callback({message: ctx.message, args: [], guild: guildWith("111")})

    await userModel.collection.updateOne({id: "111"}, {$set: {points: 12345}})
    const panel = await pressButton(ctx)
    check("the fresh balance is shown", panel.includes("12,345"), panel)
}},

// The user mutexes carry a 10 second timeout and flip holds one across its whole loop, so
// taking the lock to read a balance leaves the presser on a deferred reply that never gets
// edited, and leaves !points with nothing to say at all.
{name: "stats: the panel answers while the target's lock is held", fn: async () => {
    await seed("111", {points: 700})
    const ctx = fakeContext("111")
    await stats.callback({message: ctx.message, args: [], guild: guildWith("111")})

    const held = userMutexes.get("111")
    if (!held) throw new Error("no mutex for 111")
    const release = await held.acquire()
    const panel = await pressButton(ctx, "222")
    release()

    check("the presser got the stats", panel.includes("Peak Points"), panel)
    check("with the balance in them", panel.includes("700"), panel)
}},

{name: "points: the balance answers while the user's lock is held", fn: async () => {
    await seed("111", {points: 700})
    const ctx = fakeContext("111")

    const held = userMutexes.get("111")
    if (!held) throw new Error("no mutex for 111")
    const release = await held.acquire()
    await checkPoints.callback({message: ctx.message, args: [], guild: guildWith("111")})
    release()

    check("the balance was reported", (ctx.replies[0] ?? "").includes("700"), ctx.replies.join(""))
}},

{name: "serverStats: the button hands the totals to whoever presses it", fn: async () => {
    await seed("111", {points: 700})
    await seed("222", {points: 300})
    const ctx = fakeContext("111")
    await serverStats.callback({message: ctx.message, args: [], guild: guildWith("111", "222")})

    check("the channel only gets the button message", !ctx.replies.join("").includes("Existing Points"),
        ctx.replies.join(""))

    const panel = await pressButton(ctx, "222")
    check("a bystander pressing gets the totals", panel.includes("Existing Points"), panel)
    check("privately", ctx.privateReplies[0]?.ephemeral === true, JSON.stringify(ctx.privateReplies[0]))
}},

{name: "ledger: a flip run records every flip with the command that made it", fn: async () => {
    rollSequence(255, 0)
    await seed("111", {points: 1000})
    const ctx = fakeContext("111")
    await flip.callback({message: ctx.message, args: ["100", "4"], guild: guildWith("111")})

    const events = await pointEventModel.find({userId: "111"}).sort({seq: 1}).lean()
    eq("one event per flip", events.length, 4)
    eq("numbered in order", events.map(event => event.seq).join(","), "1,2,3,4")
    eq("deltas follow the flips", events.map(event => event.delta).join(","), "100,-100,100,-100")
    eq("balances follow the flips", events.map(event => event.balance).join(","), "1100,1000,1100,1000")
    check("all tagged as flips", events.every(event => event.reason === "flip"), JSON.stringify(events.map(event => event.reason)))
    check("under the flip command", events.every(event => event.command === "flip"), JSON.stringify(events.map(event => event.command)))
    check("pointing back at the command message", events.every(event => event.messageId === "msg-111"),
        JSON.stringify(events.map(event => event.messageId)))
    eq("the last balance is the stored balance", events[events.length - 1]?.balance, (await settleUser("111")).points)
}},

{name: "ledger: a single flip is recorded too", fn: async () => {
    rollSequence(0)
    await seed("111", {points: 1000})
    const ctx = fakeContext("111")
    await flip.callback({message: ctx.message, args: ["25"], guild: guildWith("111")})

    const events = await pointEventModel.find({userId: "111"}).lean()
    eq("one event", events.length, 1)
    eq("a 25 point loss", events[0]?.delta, -25)
    eq("leaving 975", events[0]?.balance, 975)
    eq("tagged as a flip", events[0]?.reason, "flip")
}},

{name: "ledger: martingale records each rung as a flip under the martingale command", fn: async () => {
    rollSequence(0, 255)
    await seed("111", {points: 1000})
    const ctx = fakeContext("111")
    await martingale.callback({message: ctx.message, args: ["10", "1"], guild: guildWith("111")})

    const events = await pointEventModel.find({userId: "111"}).sort({seq: 1}).lean()
    eq("lost 10 then won 20", events.map(event => event.delta).join(","), "-10,20")
    check("tagged as flips", events.every(event => event.reason === "flip"), JSON.stringify(events.map(event => event.reason)))
    check("under the martingale command", events.every(event => event.command === "martingale"), JSON.stringify(events.map(event => event.command)))
}},

{name: "ledger: a gift records both sides", fn: async () => {
    await seed("111", {points: 500})
    await seed("222", {points: 500})
    const ctx = fakeContext("111")
    await give.callback({message: ctx.message, args: ["<@222>", "200"], guild: guildWith("111", "222")})

    const sent = await pointEventModel.find({userId: "111"}).lean()
    const received = await pointEventModel.find({userId: "222"}).lean()
    eq("one event for the giver", sent.length, 1)
    eq("the giver's side", `${sent[0]?.delta} ${sent[0]?.balance} ${sent[0]?.reason}`, "-200 300 giftSent")
    eq("one event for the receiver", received.length, 1)
    eq("the receiver's side", `${received[0]?.delta} ${received[0]?.balance} ${received[0]?.reason}`, "200 700 giftReceived")
    check("both under the give command", sent[0]?.command === "give" && received[0]?.command === "give",
        `${sent[0]?.command} / ${received[0]?.command}`)
}},

{name: "ledger: a refused command records nothing", fn: async () => {
    await seed("111", {points: 300})
    await seed("222", {points: 700})
    const ctx = fakeContext("111")
    await give.callback({message: ctx.message, args: ["<@222>", "99999"], guild: guildWith("111", "222")})

    eq("no events written", await pointEventModel.countDocuments({}), 0)
}},

{name: "named events: ids give way to the member's display name, username and nickname", fn: async () => {
    await pointEventModel.collection.insertMany([
        {userId: "111", seq: 1, delta: -10, balance: 90, reason: "flip", command: "flip", createdAt: new Date("2024-01-01T00:00:00Z")},
        {userId: "999", seq: 1, delta: 20, balance: 120, reason: "flip", command: "flip", createdAt: new Date("2024-01-02T00:00:00Z")},
    ])

    const events = await getNamedPointEvents(asGuild(guildWith("111", "222")))

    eq("both events came back, oldest first", events.map(event => event.delta).join(","), "-10,20")
    check("no user id is left on them", events.every(event => !("userId" in event)), JSON.stringify(events[0]))
    eq("the member carries the two names Discord actually has",
        `${events[0].username}/${events[0].nickname}`, "name111/nick111")
    eq("and the nickname is the one shown", displayName(events[0]), "nick111")
    eq("someone who has left the server has neither name",
        `${events[1].username}/${events[1].nickname}`, "null/null")
}},

{name: "named events: members the gateway left out of the cache are still named", fn: async () => {
    await pointEventModel.collection.insertMany([
        {userId: "111", seq: 1, delta: -10, balance: 90, reason: "flip", command: "flip", createdAt: new Date("2024-01-01T00:00:00Z")},
        {userId: "222", seq: 1, delta: -20, balance: 80, reason: "flip", command: "flip", createdAt: new Date("2024-01-02T00:00:00Z")},
    ])

    const guild = guildWithOfflineMembers(["111"], ["222"]) as unknown as Guild
    const events = await getNamedPointEvents(guild)

    eq("the member who was cached is named", displayName(events[0]), "nick111")
    eq("and so is the one only a fetch knows about", displayName(events[1]), "nick222")
}},

{name: "named events: a member renaming themselves shows up right away", fn: async () => {
    const guild = guildWith("111")
    await pointEventModel.collection.insertOne({userId: "111", seq: 1, delta: -10, balance: 90, reason: "flip", command: "flip", createdAt: new Date()})

    const before = await getNamedPointEvents(asGuild(guild))
    eq("the nickname they started with", before[0].nickname, "nick111")

    const member = guild.members.cache.get("111")
    if (member) member.nickname = "shkreli"
    const after = await getNamedPointEvents(asGuild(guild))

    eq("the new nickname, while the events stay loaded", after[0].nickname, "shkreli")
}},

{name: "named events: an event recorded by a command joins the loaded history without a reload", fn: async () => {
    await seed("111", {points: 1000})
    const guild = asGuild(guildWith("111"))
    eq("nothing to start", (await getNamedPointEvents(guild)).length, 0)

    const ctx = fakeContext("111")
    rollSequence(0)
    await flip.callback({message: ctx.message, args: ["25"], guild: guildWith("111")})

    const events = await getNamedPointEvents(guild)
    eq("the flip is there without going back to the database", events.length, 1)
    eq("under the member's name", `${displayName(events[0])} ${events[0].delta}`, "nick111 -25")
}},

{name: "point history payload: rows point at lookup tables instead of repeating every name", fn: async () => {
    await pointEventModel.collection.insertMany([
        {userId: "111", seq: 1, delta: -10, balance: 90, reason: "flip", command: "flip", createdAt: new Date("2024-01-01T00:00:00Z")},
        {userId: "111", seq: 2, delta: 20, balance: 110, reason: "flip", command: "flip", createdAt: new Date("2024-01-02T00:00:00Z")},
        {userId: "999", seq: -1, delta: 5, balance: null, reason: "accrual", backfilled: true, createdAt: new Date("2024-01-03T00:00:00Z")},
    ])

    const guild = asGuild(guildWith("111"))
    const payload = buildPointHistoryPayload(await allPointEvents(), await memberNames(guild))

    eq("one entry per person", payload.people.length, 2)
    eq("named by the nickname Discord gives them", displayName(payload.people[0]), "nick111")
    eq("each reason listed once", payload.reasons.join(","), "flip,accrual")
    eq("each command listed once", payload.commands.join(","), "flip")
    eq("each person holds their own rows", payload.people.map(person => person.rows.length).join(","), "2,1")
    eq("a row is time, delta, balance, reason, command, recovered",
        payload.people[0].rows[0].join(","), `${Date.parse("2024-01-01T00:00:00Z")},-10,90,0,0,0`)
    eq("rows stay oldest first within a person",
        payload.people[0].rows.map(row => row[1]).join(","), "-10,20")
    eq("an event with no command says so with -1", payload.people[1].rows[0][4], -1)
    eq("a backfilled event is flagged as recovered", payload.people[1].rows[0][5], 1)
    eq("a live event is not", payload.people[0].rows[0][5], 0)
    eq("and keeps an unknown balance", payload.people[1].rows[0][2], null)
    eq("a departed member carries neither name, which is what marks them departed",
        `${payload.people[1].username}/${payload.people[1].nickname}`, "null/null")
}},

{name: "point history payload: the served body is rebuilt once a new event lands", fn: async () => {
    await seed("111", {points: 1000})
    const guild = asGuild(guildWith("111"))

    const at = Date.now()
    const before = await pointHistoryBody(guild, at)
    eq("served as json", JSON.parse(before).people.length, 0)
    check("the same body is handed out again", await pointHistoryBody(guild, at) === before)

    rollSequence(0)
    await flip.callback({message: fakeContext("111").message, args: ["25"], guild: guildWith("111")})

    check("a rebuild waits out the throttle", await pointHistoryBody(guild, at + 5000) === before)

    const after = JSON.parse(await pointHistoryBody(guild, at + 11000))
    eq("the new flip is in the rebuilt body", after.people[0].rows.length, 1)
    eq("under the member's name", after.people[0].nickname, "nick111")
}},

{name: "membership: only Discord saying the member is unknown means they are not in the server", fn: async () => {
    const throwing = (err: unknown) => asGuild({...guildWith("111"),
        members: {...guildWith("111").members, fetch: async () => { throw err }}} as ReturnType<typeof guildWith>)

    eq("a member Discord knows about is in", `${await isGuildMember(asGuild(guildWith("111")), "111")}`, "true")
    eq("code 10007 is the one answer that means they are out",
        `${await isGuildMember(throwing({code: 10007}), "111")}`, "false")
    eq("a rate limit is not an answer about membership",
        `${await isGuildMember(throwing({code: 429}), "111")}`, "undefined")
    eq("neither is a connection that fell over",
        `${await isGuildMember(throwing(new Error("socket hang up")), "111")}`, "undefined")
    eq("without a guild there is nothing to check yet",
        `${await isGuildMember(undefined, "111")}`, "undefined")
}},

{name: "point history payload: a rename is rebuilt even though the number of events has not moved", fn: async () => {
    await seed("111", {points: 1000})
    const raw = guildWith("111")
    const guild = asGuild(raw)
    const member = raw.members.cache.get("111")

    const at = Date.now()
    const before = JSON.parse(await pointHistoryBody(guild, at))
    eq("named as they were", `${before.people.length}`, "0")

    await pointEventModel.collection.insertOne({userId: "111", seq: 1, delta: -10, balance: 990,
        reason: "flip", command: "flip", createdAt: new Date()})
    clearPointEvents()

    const named = JSON.parse(await pointHistoryBody(guild, at + 11000))
    eq("the nickname is served", named.people[0].nickname, "nick111")
    eq("so is the username behind it", named.people[0].username, "name111")

    if (member !== undefined) member.user.username = "renamed111"
    const renamed = JSON.parse(await pointHistoryBody(guild, at + 22000))
    eq("the new username is served, not the cached one", renamed.people[0].username, "renamed111")
}},

{name: "flip: a restart part way through winds the run up instead of leaving it frozen", fn: async () => {
    rollSequence(255)
    await seed("111", {points: 1000})
    const ctx = fakeContext("111")

    const running = flip.callback({message: ctx.message, args: ["100", "10"], guild: guildWith("111")})
    setShuttingDown(true)
    try {
        await running
    } finally {
        setShuttingDown(false)
    }

    const user = await settleUser("111")
    check("the run stopped short of its ten flips", user.flipsWon + user.flipsLost < 10,
        `${user.flipsWon} won, ${user.flipsLost} lost`)
    check("the panel says why it stopped",
        ctx.edits.some(edit => (edit.content ?? "").includes("Stopped, the bot is restarting")),
        ctx.edits.map(edit => edit.content).join(" | "))
}},

{name: "martingale: a restart part way through winds the ladder up instead of leaving it frozen", fn: async () => {
    rollSequence(255)
    await seed("111", {points: 1000})
    const ctx = fakeContext("111")

    const running = martingale.callback({message: ctx.message, args: ["100", "5"], guild: guildWith("111")})
    setShuttingDown(true)
    try {
        await running
    } finally {
        setShuttingDown(false)
    }

    check("the ladder stopped short of its five wins", (await settleUser("111")).flipsWon < 5,
        `${(await settleUser("111")).flipsWon} won`)
    check("the ladder says why it stopped",
        ctx.edits.some(edit => (edit.content ?? "").includes("Stopped, the bot is restarting")),
        ctx.edits.map(edit => edit.content).join(" | "))
}},

{name: "flip: the points land before the command lets go of the user, the countdown plays out after", fn: async () => {
    rollSequence(255)
    await seed("111", {points: 1000})
    const ctx = fakeContext("111")

    await flip.callback({message: ctx.message, args: ["100"], guild: guildWith("111")})

    eq("the win landed", (await settleUser("111")).points, 1100)
    eq("the command did not hold the user while the countdown played", ctx.replies.length, 0)
}},

{name: "commands sent during a restart are turned away untouched", fn: async () => {
    await seed("111", {points: 1000})
    const ctx = fakeContext("111")

    setShuttingDown(true)
    try {
        await flip.callback({message: ctx.message, args: ["100"], guild: guildWith("111")})
    } finally {
        setShuttingDown(false)
    }

    eq("no points moved", (await settleUser("111")).points, 1000)
    check("they were told to come back in a minute",
        ctx.replies.some(reply => reply.includes("Restarting")), ctx.replies.join(" | "))
}},

{name: "challenge: two sent at once only escrow once", fn: async () => {
    await challengeModel.collection.deleteMany({})
    await seed("111", {points: 500})

    const first = fakeContext("111")
    const second = fakeContext("111")
    await Promise.all([
        challenge.callback({message: first.message, args: ["100"], guild: guildWith("111")}),
        challenge.callback({message: second.message, args: ["100"], guild: guildWith("111")}),
    ])

    eq("only one challenge is open", await challengeModel.collection.countDocuments({ownerId: "111"}), 1)
    eq("and only one bet left their balance", (await settleUser("111")).points, 400)
    check("the second one was turned away",
        first.replies.concat(second.replies).some(reply => reply.includes("Only one challenge at a time")),
        first.replies.concat(second.replies).join(" | "))
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
            await pointEventModel.collection.deleteMany({})
            clearPointEvents()
            clearPointHistoryBody()
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
