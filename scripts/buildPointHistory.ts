import { PointReason } from "../db/pointEvent"
import { Game, IAllInRun, IChannelHold, ICheckpoint, IObservedChange, Observation } from "./observePointHistory"

const ALL_IN_WINDOW_MS = 3 * 24 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000

const STAKE_REASONS: {[game: string]: {escrow: PointReason, refund: PointReason}} = {
    challenge: {escrow: "challengeEscrow", refund: "challengeRefund"},
    rps: {escrow: "rpsEscrow", refund: "rpsRefund"},
    war: {escrow: "warEscrow", refund: "warRefund"},
}

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
    spotted?: ISpotted
}

export interface ISpotted {
    channelId: string
    messageId: string
}

interface IOpenStake {
    game: Game
    offerId: string
    amount: number | null
    confirmed: boolean
}

type Draft = Omit<IBackfilledEvent, "seq">

const gap = (userId: string, delta: number, balance: number, reason: PointReason, at: Date, spotted: ISpotted | undefined): Draft => ({
    userId: userId,
    delta: delta,
    balance: balance,
    reason: reason,
    createdAt: at,
    backfilled: true,
    spotted: spotted,
})

const allInLoss = (userId: string, stake: number, at: Date, spotted: ISpotted): Draft => ({
    userId: userId,
    delta: -stake,
    balance: 0,
    reason: "flip",
    command: "flip",
    createdAt: at,
    backfilled: true,
    spotted: spotted,
})

const spottedIn = (observation: ISpotted): ISpotted => ({channelId: observation.channelId, messageId: observation.messageId})

const stakeChange =(userId: string, game: Game, delta: number, balance: number | null, reason: PointReason, stakeId: string, at: Date): Draft => ({
    userId: userId,
    delta: delta,
    balance: balance,
    reason: reason,
    command: game,
    messageId: stakeId,
    createdAt: at,
    backfilled: true,
})

const allInFlips = (userId: string, run: IAllInRun, stake: number): Draft[] => {
    const steps = run.wins + 1
    const span = run.at.getTime() - run.startedAt.getTime()
    const drafts: Draft[] = []
    let balance = stake
    for (let step = 1; step <= steps; step++) {
        const delta = step <= run.wins ? balance : -balance
        balance += delta
        drafts.push({
            userId: userId,
            delta: delta,
            balance: balance,
            reason: "flip",
            command: "flip",
            messageId: run.messageId,
            createdAt: new Date(run.startedAt.getTime() + Math.round(span * step / steps)),
            backfilled: true,
        })
    }
    return drafts
}

const sortTime = (observation: Observation): number =>
    observation.kind === "allInRun" ? observation.startedAt.getTime() : observation.at.getTime()

const heldFirst = (observation: Observation): number => observation.kind === "stakeHeld" ? 0 : 1

const heldInChannel =(holds: IChannelHold[], run: IAllInRun): boolean => holds.some(hold =>
    hold.channelId === run.channelId && hold.from.getTime() <= run.startedAt.getTime() && run.startedAt.getTime() <= hold.to.getTime())

const runEnd = (run: IAllInRun): ICheckpoint => ({
    kind: "checkpoint",
    userId: run.userId,
    balance: run.balance,
    messageId: run.messageId,
    channelId: run.channelId,
    at: run.at,
})

const userHistory = (userId: string, observations: Observation[], opening: number, handover: Date, holds: IChannelHold[],
    confirmedLosses: Set<string>): IBackfilledEvent[] => {
    const runEnds = observations.filter((observation): observation is IAllInRun => observation.kind === "allInRun").map(runEnd)
    const ordered = observations.concat(runEnds).sort((a, b) => sortTime(a) - sortTime(b) || heldFirst(a) - heldFirst(b))
    const drafts: Draft[] = []
    const stakes = new Map<string, IOpenStake>()
    const unknownStakes = new Set<string>()
    let running: number | null = null
    let knownAt: number | null = null

    const reconcile = (balance: number, at: Date, spotted?: ISpotted) => {
        if (running !== null && running !== balance) {
            const minutes = knownAt === null ? 0 : Math.ceil((at.getTime() - knownAt) / MINUTE_MS)
            const lostAll = spotted !== undefined && running > 0
                && (balance === 0 || (balance < running && confirmedLosses.has(`${userId}/${spotted.messageId}`)))
            if (lostAll && spotted !== undefined) drafts.push(allInLoss(userId, running, at, spotted))
            const delta = balance - (lostAll ? 0 : running)
            if (delta !== 0) {
                drafts.push(gap(userId, delta, balance, delta > 0 && delta <= minutes + 1 ? "accrual" : "unrecorded", at, spotted))
            }
        }
        running = balance
        knownAt = at.getTime()
    }

    const stakeBehind = (change: IObservedChange): IOpenStake | undefined => Array.from(stakes.values()).find(stake =>
        !stake.confirmed && stake.offerId === change.messageId && STAKE_REASONS[stake.game].escrow === change.reason)

    ordered.forEach(observation => {
        if (observation.kind === "checkpoint") {
            reconcile(observation.balance, observation.at, spottedIn(observation))
            return
        }

        if (observation.kind === "stakeHeld") {
            const amount = observation.amount === "all" ? running : observation.amount
            stakes.set(observation.stakeId, {game: observation.game, offerId: observation.offerId, amount: amount, confirmed: false})
            if (amount === null) {
                unknownStakes.add(observation.stakeId)
            } else if (amount > 0) {
                const wholeBalance = observation.game === "war"
                if (wholeBalance && observation.amount !== "all") reconcile(amount, observation.at, spottedIn(observation))
                drafts.push(stakeChange(userId, observation.game, -amount, wholeBalance ? 0 : null, STAKE_REASONS[observation.game].escrow, observation.stakeId, observation.at))
                running = running === null ? null : running - amount
            }
            return
        }

        if (observation.kind === "stakeReleased") {
            const stake = stakes.get(observation.stakeId)
            stakes.delete(observation.stakeId)
            unknownStakes.delete(observation.stakeId)
            const refund = stake === undefined || stake.amount === null ? 0 : stake.amount - observation.keep
            if (refund > 0) {
                drafts.push(stakeChange(userId, observation.game, refund, null, STAKE_REASONS[observation.game].refund, observation.stakeId, observation.at))
                running = running === null ? null : running + refund
            }
            return
        }

        if (observation.kind === "allInRun") {
            const run = observation
            const start = run.startedAt.getTime()
            const end = run.at.getTime()
            const fresh = knownAt !== null && start - knownAt <= ALL_IN_WINDOW_MS
            const busy = observations.some(other => other !== run && sortTime(other) > start && sortTime(other) < end)
            const held = unknownStakes.size > 0 || heldInChannel(holds, run)
            if (running !== null && running > 0 && fresh && !busy && !held) {
                drafts.push(...allInFlips(userId, run, running))
                running = 0
            }
            return
        }

        const stake = stakeBehind(observation)
        if (stake !== undefined) {
            stake.confirmed = true
            if (stake.amount !== null) return
        }

        if (observation.balance !== null) {
            reconcile(observation.balance - observation.delta, observation.at, spottedIn(observation))
        }
        if (observation.delta === 0) return
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

export const buildHistory = (observations: Observation[], openings: Map<string, number>, until: Date,
    holds: IChannelHold[] = [], confirmedLosses: Set<string> = new Set<string>()): IBackfilledEvent[] => {
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
        events.push(...userHistory(userId, list, openings.get(userId) ?? 0, handover, holds, confirmedLosses))
    })
    return events
}

export const refundShapedRuns = (events: IBackfilledEvent[]): number => {
    const byUser = new Map<string, IBackfilledEvent[]>()
    events.forEach(event => {
        const list = byUser.get(event.userId) ?? []
        list.push(event)
        byUser.set(event.userId, list)
    })

    let count = 0
    byUser.forEach(list => {
        list.sort((a, b) => a.seq - b.seq)
        list.forEach((last, end) => {
            if (last.reason !== "flip" || last.balance !== 0 || last.delta >= 0) return

            let start = end
            while (start > 0 && list[start - 1].reason === "flip" && list[start - 1].messageId === last.messageId
                && list[start - 1].delta > 0 && list[start - 1].balance === 2 * list[start - 1].delta) {
                start--
            }
            if (start === end) return

            const stake = list[start].delta
            const next = list.slice(end + 1).find(event => event.balance !== null)
            if (next !== undefined && next.reason === "unrecorded" && next.delta >= stake / 2
                && next.createdAt.getTime() - last.createdAt.getTime() <= DAY_MS) {
                count++
            }
        })
    })
    return count
}
