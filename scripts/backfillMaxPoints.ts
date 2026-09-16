import * as dotenv from "dotenv"
import { writeFileSync } from "fs"
import { Client, Intents, Message } from "discord.js"
import mongoose from "mongoose"
import userModel from "../db/user"
import { betFacts, linkBets, observe, Observation } from "./observePointHistory"
import { IScanCounts, IScanOptions, scanChannel, scanThreads, textChannel } from "./scanDiscordHistory"
dotenv.config()

const DEFAULT_OUT = "maxPointsBackfill.json"

export interface IPeakCandidate {
    userId: string
    balance: number
    source: string
}

interface IPeak {
    id: string
    peak: number
    source: string
    messageUrl: string
    reachedAt: string
}

interface IRow extends IPeak {
    storedMaxPoints: number | null
    storedPoints: number | null
    raisesBy: number
}

interface ISettings {
    channelIds: string[]
    scan: IScanOptions
    threads: boolean
    outPath: string
    apply: boolean
}

const argv = process.argv.slice(2)

const flag = (name: string): boolean => argv.indexOf(name) !== -1

const option = (name: string): string | undefined => {
    const index = argv.indexOf(name)
    return index === -1 ? undefined : argv[index + 1]
}

export const peakCandidates = (observations: Observation[]): IPeakCandidate[] => {
    const candidates: IPeakCandidate[] = []
    observations.forEach(observation => {
        if (observation.kind === "checkpoint" || observation.kind === "allInRun") {
            candidates.push({userId: observation.userId, balance: observation.balance, source: "balanceShown"})
        } else if (observation.kind === "change" && observation.balance !== null) {
            candidates.push({userId: observation.userId, balance: observation.balance, source: observation.reason})
            candidates.push({userId: observation.userId, balance: observation.balance - observation.delta, source: `before ${observation.reason}`})
        }
    })
    return candidates
}

const toRows = async (peaks: Map<string, IPeak>): Promise<IRow[]> => {
    const stored = await userModel.find().lean()
    const byId = new Map<string, {points: number, maxPoints: number}>()
    stored.forEach(user => byId.set(user.id, {points: user.points ?? 0, maxPoints: user.maxPoints ?? user.points ?? 0}))

    const rows: IRow[] = []
    peaks.forEach(peak => {
        const current = byId.get(peak.id)
        rows.push({
            ...peak,
            storedMaxPoints: current ? current.maxPoints : null,
            storedPoints: current ? current.points : null,
            raisesBy: current ? Math.max(0, peak.peak - current.maxPoints) : 0
        })
    })

    return rows.sort((a, b) => b.peak - a.peak)
}

const report = (rows: IRow[], outPath: string) => {
    writeFileSync(outPath, JSON.stringify(rows, null, 4))

    const missing = rows.filter(row => row.storedMaxPoints === null)
    const raising = rows.filter(row => row.raisesBy > 0)

    console.log(`\n${rows.length} users found in history, ${raising.length} would have maxPoints raised`)
    raising.forEach(row => {
        console.log(`  ${row.id}  ${row.storedMaxPoints} -> ${row.peak}  (+${row.raisesBy}, ${row.source}, ${row.reachedAt})`)
        console.log(`      ${row.messageUrl}`)
    })

    if (missing.length > 0) {
        console.log(`\n${missing.length} users have no row in the db and will be skipped:`)
        missing.forEach(row => console.log(`  ${row.id}  peak ${row.peak}`))
    }

    console.log(`\nfull results written to ${outPath}`)
}

const applyRows = async (rows: IRow[]) => {
    const raising = rows.filter(row => row.raisesBy > 0)
    console.log(`\napplying ${raising.length} raises`)

    for (const row of raising) {
        const result = await userModel.updateOne({id: row.id}, {$max: {maxPoints: row.peak}})
        console.log(`  ${row.id} -> ${row.peak}  matched ${result.matchedCount}, modified ${result.modifiedCount}`)
    }
}

const backfill = async (client: Client, token: string, settings: ISettings): Promise<void> => {
    const ready = new Promise<Client>(resolve => client.once("ready", resolve))
    await client.login(token)
    await ready

    const botId = client.user?.id
    if (botId === undefined) {
        console.log("could not resolve the bot user")
        return
    }

    const peaks = new Map<string, IPeak>()
    const handle = (message: Message<boolean>, record: string | undefined): number => {
        const candidates = peakCandidates(observe(message, record).concat(linkBets(betFacts(message))))
        candidates.forEach(candidate => {
            const current = peaks.get(candidate.userId)
            if (!Number.isFinite(candidate.balance) || (current !== undefined && current.peak >= candidate.balance)) return
            peaks.set(candidate.userId, {
                id: candidate.userId,
                peak: candidate.balance,
                source: candidate.source,
                messageUrl: message.url,
                reachedAt: message.createdAt.toISOString()
            })
        })
        return candidates.length
    }

    const failed: string[] = []
    for (const channelId of settings.channelIds) {
        const channel = await textChannel(client, channelId)
        if (channel === undefined) {
            failed.push(`channel ${channelId}`)
            continue
        }

        console.log(`\nscanning #${channel.name}`)
        const counts = await scanChannel(channel, botId, settings.scan, handle)
            .catch((err): IScanCounts => { console.log(err); return {scanned: 0, found: 0, failed: [`#${channel.name}`]} })
        failed.push(...counts.failed)
        console.log(`scanned ${counts.scanned} messages, ${counts.found} balances`)

        if (settings.threads) {
            const threadCounts = await scanThreads(channel, botId, settings.scan, handle)
            failed.push(...threadCounts.failed)
            console.log(`scanned ${threadCounts.scanned} thread messages, ${threadCounts.found} balances`)
        }
    }

    if (failed.length > 0) {
        console.log(`\n${failed.length} scans failed, so some peaks may be missing: ${failed.join(", ")}`)
    }

    const rows = await toRows(peaks)
    report(rows, settings.outPath)

    if (settings.apply) {
        await applyRows(rows)
    } else {
        console.log("\ndry run, nothing written to the db. rerun with --apply to raise maxPoints")
    }
}

const main = async () => {
    const token = process.env.TOKEN
    const mongoUri = process.env.MONGO_URI
    const channelIds = (option("--channel") ?? process.env.BACKFILL_CHANNEL_ID ?? "").split(",").filter(Boolean)
    if (token === undefined || mongoUri === undefined || channelIds.length === 0) {
        console.log("TOKEN and MONGO_URI must be set, and channels given with --channel <id>[,<id>...]")
        return
    }

    const settings: ISettings = {
        channelIds: channelIds,
        scan: {withAttachments: !flag("--no-attachments"), delayMs: Number(option("--delay") ?? 0)},
        threads: !flag("--no-threads"),
        outPath: option("--out") ?? DEFAULT_OUT,
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
