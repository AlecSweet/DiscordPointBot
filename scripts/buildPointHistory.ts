import { PointReason } from "../db/pointEvent"
import { Observation } from "./observePointHistory"

export interface IBackfilledEvent {
    userId: string
    seq: number
    delta: number
    balance: number | null
    reason: PointReason
    command?: string
    messageId?: string
    createdAt: Date
    backfilled: true
}

type Draft = Omit<IBackfilledEvent, "seq">

const unrecorded = (userId: string, delta: number, balance: number, at: Date): Draft => ({
    userId: userId,
    delta: delta,
    balance: balance,
    reason: "unrecorded",
    createdAt: at,
    backfilled: true,
})

const userHistory = (userId: string, observations: Observation[], opening: number, handover: Date): IBackfilledEvent[] => {
    const ordered = observations.slice().sort((a, b) => a.at.getTime() - b.at.getTime())
    const drafts: Draft[] = []
    let running: number | null = null

    const reconcile = (balance: number, at: Date) => {
        if (running !== null && running !== balance) {
            drafts.push(unrecorded(userId, balance - running, balance, at))
        }
        running = balance
    }

    ordered.forEach(observation => {
        if (observation.kind === "checkpoint") {
            reconcile(observation.balance, observation.at)
            return
        }

        if (observation.balance !== null) {
            reconcile(observation.balance - observation.delta, observation.at)
        }
        drafts.push({
            userId: userId,
            delta: observation.delta,
            balance: observation.balance,
            reason: observation.reason,
            command: observation.command,
            messageId: observation.messageId,
            createdAt: observation.at,
            backfilled: true,
        })
        running = observation.balance ?? (running === null ? null : running + observation.delta)
    })
    reconcile(opening, handover)

    return drafts.map((draft, index) => ({...draft, seq: index - drafts.length}))
}

export const buildHistory = (observations: Observation[], openings: Map<string, number>, until: Date): IBackfilledEvent[] => {
    const byUser = new Map<string, Observation[]>()
    observations.forEach(observation => {
        if (!openings.has(observation.userId) || observation.at.getTime() >= until.getTime()) return

        const list = byUser.get(observation.userId) ?? []
        list.push(observation)
        byUser.set(observation.userId, list)
    })

    const handover = new Date(until.getTime() - 1)
    const events: IBackfilledEvent[] = []
    byUser.forEach((list, userId) => {
        events.push(...userHistory(userId, list, openings.get(userId) ?? 0, handover))
    })
    return events
}
