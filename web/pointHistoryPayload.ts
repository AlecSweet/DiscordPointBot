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

export const buildPointHistoryPayload = (events: IPointEvent[], names: Map<string, IMemberName>): IPointHistoryPayload => {
    const reasons = indexer()
    const commands = indexer()
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

let served: {signature: string, body: string, builtAt: number} | undefined

const pointHistoryBody = async (guild: Guild, now = Date.now()): Promise<string> => {
    if (served !== undefined && now - served.builtAt < REBUILD_MS) return served.body

    const events = await allPointEvents()
    const names = await memberNames(guild)

    const current = signature(events, names)
    served = {
        signature: current,
        body: served?.signature === current ? served.body : JSON.stringify(buildPointHistoryPayload(events, names)),
        builtAt: now,
    }
    return served.body
}

export default pointHistoryBody

export const clearPointHistoryBody = (): void => { served = undefined }
