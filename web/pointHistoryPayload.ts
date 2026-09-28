import { createHash } from "crypto"
import { Guild } from "discord.js"
import { allPointEvents, IPointEvent } from "../db/pointEvent"
import { departedMember, IMemberName, memberNames } from "../util/namedPointEvents"

export interface IPointHistoryPerson extends IMemberName {
    rows: (number | null)[][]
}

export interface IPointHistoryPayload {
    generatedAt: string
    reasons: string[]
    commands: string[]
    people: IPointHistoryPerson[]
}

const indexer = () => {
    const values: string[] = []
    const seen = new Map<string, number>()
    return {
        values: values,
        of: (value: string): number => {
            const found = seen.get(value)
            if (found !== undefined) return found
            seen.set(value, values.length)
            values.push(value)
            return values.length - 1
        },
    }
}

const sharedGroups = (events: IPointEvent[]): Set<string> => {
    const owners = new Map<string, string>()
    const shared = new Set<string>()

    events.forEach(event => {
        if (event.messageId === undefined) return

        const owner = owners.get(event.messageId)
        if (owner === undefined) owners.set(event.messageId, event.userId)
        else if (owner !== event.userId) shared.add(event.messageId)
    })
    return shared
}

export const buildPointHistoryPayload = (events: IPointEvent[], names: Map<string, IMemberName>): IPointHistoryPayload => {
    const reasons = indexer()
    const commands = indexer()
    const groups = indexer()
    const shared = sharedGroups(events)
    const rowsByUser = new Map<string, (number | null)[][]>()

    events.forEach(event => {
        const rows = rowsByUser.get(event.userId) ?? []
        rows.push([
            event.createdAt.getTime(),
            event.delta,
            event.balance,
            reasons.of(event.reason),
            event.command === undefined ? -1 : commands.of(event.command),
            event.backfilled ? 1 : 0,
            event.messageId !== undefined && shared.has(event.messageId) ? groups.of(event.messageId) : -1,
        ])
        rowsByUser.set(event.userId, rows)
    })

    return {
        generatedAt: new Date().toISOString(),
        reasons: reasons.values,
        commands: commands.values,
        people: Array.from(rowsByUser).map(([userId, rows]) => ({
            ...(names.get(userId) ?? departedMember()),
            rows: rows,
        })),
    }
}

const signature = (events: IPointEvent[], names: Map<string, IMemberName>): string =>
    `${events.length}:${Array.from(names.values()).map(name => `${name.username}/${name.nickname}`).join("|")}`

const REBUILD_MS = 10 * 1000

export interface IServedHistory {
    body: string
    version: string
}

const versionOf = (signature: string): string =>
    createHash("sha1").update(signature).digest("base64url").slice(0, 16)

let served: {signature: string, body: string, version: string, builtAt: number} | undefined

const pointHistoryBody = async (guild: Guild, now = Date.now()): Promise<IServedHistory> => {
    if (served !== undefined && now - served.builtAt < REBUILD_MS) return {body: served.body, version: served.version}

    const events = await allPointEvents()
    const names = await memberNames(guild)
    const current = signature(events, names)

    if (served !== undefined && served.signature === current) {
        served = {...served, builtAt: now}
        return {body: served.body, version: served.version}
    }

    served = {
        signature: current,
        body: JSON.stringify(buildPointHistoryPayload(events, names)),
        version: versionOf(current),
        builtAt: now,
    }
    return {body: served.body, version: served.version}
}

export default pointHistoryBody

export const clearPointHistoryBody = (): void => { served = undefined }
