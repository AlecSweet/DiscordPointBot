import * as dotenv from "dotenv"
import { writeFileSync } from "fs"
import { Client, Intents, Message } from "discord.js"
import mongoose from "mongoose"
import pointEventModel from "../db/pointEvent"
import { buildHistory, IBackfilledEvent, refundShapedRuns } from "./buildPointHistory"
import { betFacts, challengeFact, gameCommand, gameOffer, IBetFact, IChallengeFact, IGameCommand, IGameOffer, IWarFact, linkBets, linkChallenges, linkStakes, observe, Observation, warFact } from "./observePointHistory"
import { IScanCounts, IScanOptions, scanChannel, scanThreads, textChannel } from "./scanDiscordHistory"
import { takeSnapshot } from "./seedPointEvents"
dotenv.config()

const INSERT_BATCH = 1000
const HANDOVER_MARGIN_MS = 10000
const LISTED = 10
const CONFIRMED_ALL_IN_LOSSES = new Set<string>([
    "123196732212379648/1548813528121741345",
    "147149682542379008/1079218935662129252",
])

const argv = process.argv.slice(2)

const flag = (name: string): boolean => argv.indexOf(name) !== -1

const option = (name: string): string | undefined => {
    const index = argv.indexOf(name)
    return index === -1 ? undefined : argv[index + 1]
}

export interface IOpenings {
    openings: Map<string, number>
    opened: number
    until: Date
}

export interface IInvalidEvent {
    event: IBackfilledEvent
    error: string
}

interface ISettings {
    channelIds: string[]
    until: Date | undefined
    scan: IScanOptions
    threads: boolean
    outPath: string | undefined
    apply: boolean
}

export const loadOpenings = async (now = new Date()): Promise<IOpenings> => {
    const snapshot = await takeSnapshot()
    const recorded = await pointEventModel.find({seq: 0}, {userId: 1, balance: 1}).lean()
    const firstLive = await pointEventModel.findOne({seq: {$gte: 1}}, {createdAt: 1}).sort({createdAt: 1}).lean()

    const openings = new Map<string, number>()
    snapshot.users.forEach(user => {
        const history = snapshot.histories.get(user.id)
        openings.set(user.id, history ? history.first.balance - history.first.delta : (user.points ?? 0))
    })
    recorded.forEach(opening => openings.set(opening.userId, opening.balance ?? 0))

    return {
        openings: openings,
        opened: recorded.length,
        until: firstLive ? new Date(firstLive.createdAt.getTime() - HANDOVER_MARGIN_MS) : now,
    }
}

export const invalidEvents = (events: IBackfilledEvent[]): IInvalidEvent[] => {
    const invalid: IInvalidEvent[] = []
    events.forEach(event => {
        const error = new pointEventModel(event).validateSync()
        if (error) invalid.push({event: event, error: error.message})
    })
    return invalid
}

export const eventLine = (event: IBackfilledEvent, guildId: string | undefined): string => JSON.stringify(
    event.spotted === undefined || guildId === undefined
        ? event
        : {...event, spotted: {...event.spotted, link: `https://discord.com/channels/${guildId}/${event.spotted.channelId}/${event.spotted.messageId}`}})

const stored = (event: IBackfilledEvent): IBackfilledEvent => {
    const copy = {...event}
    delete copy.spotted
    return copy
}

export const replaceBackfill = async (events: IBackfilledEvent[]): Promise<void> => {
    const invalid = invalidEvents(events)
    if (invalid.length > 0) {
        throw new Error(`${invalid.length} backfilled events failed validation, nothing was removed: ${invalid[0].error}`)
    }

    const removed = await pointEventModel.deleteMany({backfilled: true})
    console.log(`\nremoved ${removed.deletedCount} earlier backfilled events`)

    for (let start = 0; start < events.length; start += INSERT_BATCH) {
        await pointEventModel.insertMany(events.slice(start, start + INSERT_BATCH).map(stored))
        console.log(`  wrote ${Math.min(start + INSERT_BATCH, events.length)} of ${events.length}`)
    }
}

const report = (events: IBackfilledEvent[], observed: number, challenges: number, bets: number) => {
    const users = new Set(events.map(event => event.userId))
    const byReason = new Map<string, {count: number, total: number}>()
    events.forEach(event => {
        const entry = byReason.get(event.reason) ?? {count: 0, total: 0}
        entry.count++
        entry.total += event.delta
        byReason.set(event.reason, entry)
    })

    console.log(`\n${observed} observations, ${challenges} challenge changes and ${bets} bet observations pieced together`)
    console.log(`${events.length} backfilled events across ${users.size} users`)
    byReason.forEach((entry, reason) => {
        console.log(`  ${reason.padEnd(16)} ${String(entry.count).padStart(8)} events  ${entry.total} points`)
    })

    const gaps = events
        .filter(event => event.reason === "unrecorded")
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, LISTED)
    if (gaps.length > 0) {
        console.log("\nlargest unrecorded gaps:")
        gaps.forEach(gap => {
            console.log(`  ${gap.userId}  ${gap.delta > 0 ? "+" : ""}${gap.delta} to ${gap.balance}  ${gap.createdAt.toISOString()}`)
        })
    }
}

const backfill = async (client: Client, token: string, settings: ISettings): Promise<void> => {
    const loaded = await loadOpenings()
    if (loaded.opened === 0) {
        console.log("no opening balances found. run seedPointEvents with --apply first")
        return
    }
    const until = settings.until ?? loaded.until
    console.log(`history runs up to ${until.toISOString()}`)

    const ready = new Promise<Client>(resolve => client.once("ready", resolve))
    await client.login(token)
    await ready

    const botId = client.user?.id
    if (botId === undefined) {
        console.log("could not resolve the bot user")
        return
    }

    const observations: Observation[] = []
    const challenges: IChallengeFact[] = []
    const bets: IBetFact[] = []
    const commands: IGameCommand[] = []
    const offers: IGameOffer[] = []
    const wars: IWarFact[] = []
    const failed: string[] = []
    const handle = (message: Message<boolean>, record: string | undefined): number => {
        const seen = observe(message, record)
        observations.push(...seen)
        const challenge = challengeFact(message)
        if (challenge) challenges.push(challenge)
        const staked = betFacts(message)
        bets.push(...staked)
        const offer = gameOffer(message)
        if (offer) offers.push(offer)
        const war = warFact(message)
        if (war) wars.push(war)
        return seen.length + staked.length + (challenge ? 1 : 0) + (offer ? 1 : 0)
    }
    const handlePlayer = (message: Message<boolean>): number => {
        const command = gameCommand(message)
        if (command) commands.push(command)
        return command ? 1 : 0
    }

    let guildId: string | undefined = undefined
    for (const channelId of settings.channelIds) {
        const channel = await textChannel(client, channelId)
        if (channel === undefined) {
            failed.push(`channel ${channelId}`)
            continue
        }
        guildId = guildId ?? channel.guildId

        console.log(`\nscanning #${channel.name}`)
        const counts = await scanChannel(channel, botId, settings.scan, handle, handlePlayer)
            .catch((err): IScanCounts => { console.log(err); return {scanned: 0, found: 0, failed: [`#${channel.name}`]} })
        failed.push(...counts.failed)
        console.log(`scanned ${counts.scanned} messages, ${counts.found} found`)

        if (settings.threads) {
            const threadCounts = await scanThreads(channel, botId, settings.scan, handle, handlePlayer)
            failed.push(...threadCounts.failed)
            console.log(`scanned ${threadCounts.scanned} thread messages, ${threadCounts.found} found`)
        }
    }

    const stakes = linkStakes(commands, offers, wars)
    const linkedChallenges = linkChallenges(challenges, stakes.heldOffers)
    const linkedBets = linkBets(bets)
    const events = buildHistory(observations.concat(linkedChallenges, linkedBets, stakes.observations), loaded.openings, until, stakes.holds, CONFIRMED_ALL_IN_LOSSES)
    report(events, observations.length, linkedChallenges.length, linkedBets.length)
    console.log(`${commands.length} game commands and ${offers.length} game offers gave ${stakes.observations.length} stake observations, ${stakes.holds.length} offers had no command to explain them`)
    console.log(`${refundShapedRuns(events)} flip-all runs are followed within a day by a gap worth at least half their stake, the mark a hidden stake leaves`)

    const invalid = invalidEvents(events)
    if (invalid.length > 0) {
        console.log(`\n${invalid.length} events fail validation:`)
        invalid.slice(0, LISTED).forEach(entry => {
            console.log(`  ${entry.event.userId} ${entry.event.reason} ${entry.event.delta}: ${entry.error}`)
        })
    }
    if (failed.length > 0) {
        console.log(`\n${failed.length} scans failed: ${failed.join(", ")}`)
    }

    if (settings.outPath !== undefined) {
        writeFileSync(settings.outPath, events.map(event => eventLine(event, guildId)).join("\n"))
        console.log(`\nevery event written to ${settings.outPath}`)
    }

    if (!settings.apply) {
        console.log("\ndry run, nothing written to the db. rerun with --apply to replace the backfilled history")
        return
    }
    if (failed.length > 0 || invalid.length > 0) {
        console.log("\nnot applying a partial or invalid history. fix the problems above and rerun")
        return
    }
    await replaceBackfill(events)
}

const main = async () => {
    const token = process.env.TOKEN
    const mongoUri = process.env.MONGO_URI
    const channelIds = (option("--channel") ?? process.env.BACKFILL_CHANNEL_ID ?? "").split(",").filter(Boolean)
    if (token === undefined || mongoUri === undefined || channelIds.length === 0) {
        console.log("TOKEN and MONGO_URI must be set, and channels given with --channel <id>[,<id>...]")
        return
    }

    const untilOption = option("--until")
    const until = untilOption === undefined ? undefined : new Date(untilOption)
    if (until !== undefined && Number.isNaN(until.getTime())) {
        console.log(`--until ${untilOption} is not a date`)
        return
    }

    const settings: ISettings = {
        channelIds: channelIds,
        until: until,
        scan: {withAttachments: !flag("--no-attachments"), delayMs: Number(option("--delay") ?? 0)},
        threads: !flag("--no-threads"),
        outPath: option("--out"),
        apply: flag("--apply"),
    }

    await mongoose.connect(mongoUri)
    const client = new Client({intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES]})
    try {
        await backfill(client, token, settings)
    } finally {
        await mongoose.disconnect()
        client.destroy()
    }
}

if (require.main === module) {
    main().catch(err => { console.log(err); process.exit(1) })
}
