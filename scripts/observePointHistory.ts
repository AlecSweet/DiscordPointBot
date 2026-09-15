import { Message } from "discord.js"
import { PointReason } from "../db/pointEvent"

export interface IObservedChange {
    kind: "change"
    userId: string
    delta: number
    balance: number | null
    reason: PointReason
    command: string
    messageId: string
    at: Date
}

export interface ICheckpoint {
    kind: "checkpoint"
    userId: string
    balance: number
    messageId: string
    at: Date
}

export type Observation = IObservedChange | ICheckpoint

export interface IChallengeFact {
    kind: "offer" | "accept" | "result"
    userId: string
    otherId: string | null
    bet: number
    messageId: string
    at: Date
}

export interface IBetFact {
    kind: "stake" | "won" | "settled"
    userId: string
    amount: number
    balance: number | null
    threadId: string
    messageId: string
    at: Date
}

interface IBalanceLine {
    number: number
    balance: number
}

interface IRun {
    begin: number | null
    lines: IBalanceLine[]
}

const CLAIM_REASONS: {[name: string]: PointReason} = {
    daily: "dailyClaim",
    weekly: "weeklyClaim",
    monthly: "monthlyClaim",
    yearly: "yearlyClaim",
}

const REPLY_DELAY_MS = 3200

const FLIP_WIN = /You won (\d+) points .*You've got (-?\d+) points now/
const FLIP_LOSS = /(\d+) points deleted, later\. You're down to (-?\d+) points/
const GIFT = /^You gave <@!?(\d+)> (\d+) points .*You now have (-?\d+) points/
const CLAIM = /^You got your (daily|weekly|monthly|yearly) (\d+)\b/
const OWN_POINTS = /^You have (-?\d+) points/
const NOT_ENOUGH = /^You only got (-?\d+)\b/

const OTHER_POINTS = /^(?:<@!?)?(\d+)>? has (-?\d+) points/
const STATS = /^\*\*<@!?(\d+)>'s Stats\*\*[\s\S]*?^Points +(-?[\d,]+)/m
const WAR_OFFER = /^<@!?(\d+)> wants a war.*theres (\d+) points on the line/
const BET_REFUND = /^<@!?(\d+)> got (\d+) points back .*and now has (-?\d+) points/
const BET_LOST = /^<@!?(\d+)> lost it all and now has (-?\d+) points/
const BET_WON = /^<@!?(\d+)> won (\d+) points .*and now has (-?\d+) points/
const BET_STAKES = /__<@!?\d+>: \d+__/g
const BET_STAKE = /__<@!?(\d+)>: (\d+)__/

const PANEL_TITLE = /^\*\*<@!?(\d+)>'s (Flips|Martinelli)\*\*/
const PANEL_POINTS = /Points: (-?\d+)/
const PANEL_NET = /Points: (-?\d+)(?:\s+Net: | \()(?:.\[[\d;]*m)?([+-]?\d+)/
const PANEL_RECORD = /\bW: (\d+)\s+L: (\d+)/
const NUMBERED_FLIP = /^\s*(\d+)\)\s+[✅❌]\s+(-?\d+)\s*$/
const FLIP_MARK = /[✅❌]/g
const LADDER_STEP = /[✅❌] \d+/g
const ENDED_BUSTED_ALL_IN = /```\s*Sit\s*$/
const ENDED_SURVIVED = /```\s*You made it through/

const WAR_ACCEPTED = /^War accepted by <@!?(\d+)>/
const WAR_BETS = /^Bet +(\d+) *\| *(\d+)/m
const WAR_RESULT = /<@!?(\d+)> got dusted.*\n<@!?(\d+)> won/
const RPS_GAME = /^<@!?(\d+)> against <@!?(\d+)> for (\d+) points/
const RPS_WINNER = /\n<@!?(\d+)> wins \d+ points/
const CHALLENGE_OFFER = /^<@!?(\d+)> has challenged (?:<@!?(\d+)> for up to|anyone for) (\d+) points/
const CHALLENGE_ACCEPT = /^Challenge accepted by <@!?(\d+)> for (\d+) points/
const CHALLENGE_RESULT = /^<@!?(\d+)> wins (\d+) points/
const CHALLENGE_WINDOW_MS = 3 * 60 * 1000
const RESULT_WINDOW_MS = 60 * 1000

const sourceOf = (message: Message<boolean>): string => message.reference?.messageId ?? message.id

const finishedAt = (message: Message<boolean>): Date => message.editedAt ?? message.createdAt

const spread = (message: Message<boolean>, step: number, steps: number): Date => {
    const start = message.createdAt.getTime()
    const span = finishedAt(message).getTime() - start
    return new Date(start + Math.round(span * step / Math.max(steps, 1)))
}

const change = (message: Message<boolean>, userId: string, delta: number, balance: number | null,
    reason: PointReason, command: string, at = message.createdAt): IObservedChange => ({
    kind: "change",
    userId: userId,
    delta: delta,
    balance: balance,
    reason: reason,
    command: command,
    messageId: sourceOf(message),
    at: at,
})

const checkpoint = (message: Message<boolean>, userId: string, balance: number, at = message.createdAt): ICheckpoint => ({
    kind: "checkpoint",
    userId: userId,
    balance: balance,
    messageId: sourceOf(message),
    at: at,
})

const numberedFlips = (text: string): IBalanceLine[] => {
    const lines: IBalanceLine[] = []
    text.split("\n").forEach(line => {
        const flip = NUMBERED_FLIP.exec(line)
        if (flip) lines.push({number: Number(flip[1]), balance: Number(flip[2])})
    })
    return lines
}

const markedFlips = (content: string, points: number, start: number | null): IRun => {
    const unknown: IRun = {begin: start, lines: []}
    const wins = (content.match(FLIP_MARK) ?? []).map(mark => mark === "✅")
    const survived = ENDED_SURVIVED.test(content)
    const allIn = survived || ENDED_BUSTED_ALL_IN.test(content)
    const begin = start ?? (survived ? points / Math.pow(2, wins.length) : null)
    if (begin === null || !Number.isInteger(begin) || wins.length === 0) return unknown

    const record = PANEL_RECORD.exec(content)
    const swing = record === null ? 0 : Math.abs(Number(record[1]) - Number(record[2]))
    const bet = swing === 0 ? 0 : Math.abs(points - begin) / swing
    if (!allIn && (bet === 0 || !Number.isInteger(bet))) return unknown

    let balance = begin
    const lines = wins.map((won, index) => {
        const wager = allIn ? balance : bet
        balance += won ? wager : -wager
        return {number: index + 1, balance: balance}
    })
    return {begin: begin, lines: lines}
}

const flipChanges = (message: Message<boolean>, userId: string, run: IRun): Observation[] => {
    const steps = run.lines.reduce((last, line) => Math.max(last, line.number), 0)
    let previous: IBalanceLine | null = run.begin === null ? null : {number: 0, balance: run.begin}
    return run.lines.map(line => {
        const at = spread(message, line.number, steps)
        const observation = previous !== null && previous.number === line.number - 1
            ? change(message, userId, line.balance - previous.balance, line.balance, "flip", "flip", at)
            : checkpoint(message, userId, line.balance, at)
        previous = line
        return observation
    })
}

const observeFlips = (message: Message<boolean>, userId: string, record: string | undefined): Observation[] => {
    const content = message.content
    const header = PANEL_POINTS.exec(content)
    if (header === null) return []

    const points = Number(header[1])
    const net = PANEL_NET.exec(content)
    const start = net ? points - Number(net[2]) : null
    const numbered = numberedFlips(record ?? content)
    const run = numbered.length > 0 ? {begin: start, lines: numbered} : markedFlips(content, points, start)

    const observations: Observation[] = start === null ? [] : [checkpoint(message, userId, start)]
    return observations.concat(flipChanges(message, userId, run), [checkpoint(message, userId, points, finishedAt(message))])
}

const observeMartinelli = (message: Message<boolean>, userId: string, record: string | undefined): Observation[] => {
    const content = message.content
    const header = PANEL_POINTS.exec(content)
    if (header === null) return []

    const points = Number(header[1])
    const net = PANEL_NET.exec(content)
    const wagers = ((record ?? content).match(LADDER_STEP) ?? []).map(step => {
        const [mark, wager] = step.split(" ")
        return mark === "✅" ? Number(wager) : -Number(wager)
    })

    const balances: number[] = []
    let after = points
    for (let index = wagers.length - 1; index >= 0; index--) {
        balances[index] = after
        after -= wagers[index]
    }

    const observations: Observation[] = net ? [checkpoint(message, userId, points - Number(net[2]))] : []
    wagers.forEach((wager, index) => {
        observations.push(change(message, userId, wager, balances[index], "martingale", "martin", spread(message, index + 1, wagers.length)))
    })
    observations.push(checkpoint(message, userId, points, finishedAt(message)))
    return observations
}

const observeWar = (message: Message<boolean>): Observation[] | undefined => {
    const content = message.content
    const accepted = WAR_ACCEPTED.exec(content)
    if (accepted === null) return undefined

    const bets = WAR_BETS.exec(content)
    const result = WAR_RESULT.exec(content)
    if (bets === null || result === null) return []

    const targetId = accepted[1]
    const ownerId = result[1] === targetId ? result[2] : result[1]
    const pot = Number(bets[1]) + Number(bets[2])
    return [
        change(message, ownerId, -Number(bets[1]), 0, "warEscrow", "war"),
        change(message, targetId, -Number(bets[2]), 0, "warEscrow", "war"),
        change(message, result[2], pot, pot, "warPayout", "war", finishedAt(message)),
    ]
}

const observeRps = (message: Message<boolean>): Observation[] | undefined => {
    const content = message.content
    const game = RPS_GAME.exec(content)
    if (game === null) return undefined

    const winner = RPS_WINNER.exec(content)
    if (winner === null) return []

    const bet = Number(game[3])
    return [
        change(message, game[1], -bet, null, "rpsEscrow", "rps"),
        change(message, game[2], -bet, null, "rpsEscrow", "rps"),
        change(message, winner[1], bet * 2, null, "rpsPayout", "rps", finishedAt(message)),
    ]
}

const observeMentioned = (message: Message<boolean>): Observation[] | undefined => {
    const content = message.content

    const stats = STATS.exec(content)
    if (stats) return [checkpoint(message, stats[1], Number(stats[2].replace(/,/g, "")))]

    const other = OTHER_POINTS.exec(content)
    if (other) return [checkpoint(message, other[1], Number(other[2]))]

    const offer = WAR_OFFER.exec(content)
    if (offer) return [checkpoint(message, offer[1], Number(offer[2]))]

    const refund = BET_REFUND.exec(content)
    if (refund) return [change(message, refund[1], Number(refund[2]), Number(refund[3]), "betPayout", "bet")]

    const lost = BET_LOST.exec(content)
    if (lost) return [checkpoint(message, lost[1], Number(lost[2]))]

    return undefined
}

const observeReply = (message: Message<boolean>, userId: string): Observation[] => {
    const content = message.content
    const flippedAt = new Date(message.createdAt.getTime() - REPLY_DELAY_MS)

    const win = FLIP_WIN.exec(content)
    if (win) return [change(message, userId, Number(win[1]), Number(win[2]), "flip", "flip", flippedAt)]

    const loss = FLIP_LOSS.exec(content)
    if (loss) return [change(message, userId, -Number(loss[1]), Number(loss[2]), "flip", "flip", flippedAt)]

    const gift = GIFT.exec(content)
    if (gift) {
        return [
            change(message, userId, -Number(gift[2]), Number(gift[3]), "giftSent", "give"),
            change(message, gift[1], Number(gift[2]), null, "giftReceived", "give"),
        ]
    }

    const claim = CLAIM.exec(content)
    if (claim) return [change(message, userId, Number(claim[2]), null, CLAIM_REASONS[claim[1]], claim[1])]

    const own = OWN_POINTS.exec(content) ?? NOT_ENOUGH.exec(content)
    if (own) return [checkpoint(message, userId, Number(own[1]))]

    return []
}

export const observe = (message: Message<boolean>, record?: string): Observation[] => {
    const panel = PANEL_TITLE.exec(message.content)
    if (panel) {
        return panel[2] === "Flips" ? observeFlips(message, panel[1], record) : observeMartinelli(message, panel[1], record)
    }

    const game = observeWar(message) ?? observeRps(message)
    if (game) return game

    const mentioned = observeMentioned(message)
    if (mentioned) return mentioned

    const userId = message.mentions.repliedUser?.id ?? message.interaction?.user.id
    return userId === undefined ? [] : observeReply(message, userId)
}

export const challengeFact = (message: Message<boolean>): IChallengeFact | undefined => {
    const content = message.content
    const fact = (kind: IChallengeFact["kind"], userId: string, otherId: string | null, bet: string): IChallengeFact => ({
        kind: kind,
        userId: userId,
        otherId: otherId,
        bet: Number(bet),
        messageId: message.id,
        at: message.createdAt,
    })

    const offer = CHALLENGE_OFFER.exec(content)
    if (offer) return fact("offer", offer[1], offer[2] ?? null, offer[3])

    const accept = CHALLENGE_ACCEPT.exec(content)
    if (accept) return fact("accept", accept[1], null, accept[2])

    const result = CHALLENGE_RESULT.exec(content)
    if (result) return fact("result", result[1], null, result[2])

    return undefined
}

const linkedChange = (accept: IChallengeFact, userId: string, delta: number, balance: number | null,
    reason: PointReason, at = accept.at): IObservedChange => ({
    kind: "change",
    userId: userId,
    delta: delta,
    balance: balance,
    reason: reason,
    command: "challenge",
    messageId: accept.messageId,
    at: at,
})

export const linkChallenges = (facts: IChallengeFact[]): IObservedChange[] => {
    const ordered = facts.slice().sort((a, b) => a.at.getTime() - b.at.getTime())
    const usedOffers = new Set<string>()
    const changes: IObservedChange[] = []

    ordered.forEach((accept, index) => {
        if (accept.kind !== "accept") return

        const result = ordered.slice(index + 1).find(fact => fact.kind === "result"
            && fact.bet === accept.bet
            && fact.at.getTime() - accept.at.getTime() <= RESULT_WINDOW_MS)
        const offer = ordered.slice(0, index).reverse().find(fact => fact.kind === "offer"
            && !usedOffers.has(fact.messageId)
            && fact.userId !== accept.userId
            && fact.bet >= accept.bet
            && (fact.otherId === null || fact.otherId === accept.userId)
            && accept.at.getTime() - fact.at.getTime() <= CHALLENGE_WINDOW_MS
            && (result === undefined || result.userId === fact.userId || result.userId === accept.userId))
        if (result === undefined || offer === undefined) return

        usedOffers.add(offer.messageId)
        changes.push(
            linkedChange(accept, offer.userId, -accept.bet, null, "challengeEscrow"),
            linkedChange(accept, accept.userId, -accept.bet, offer.bet > accept.bet ? 0 : null, "challengeEscrow"),
            linkedChange(accept, result.userId, accept.bet * 2, null, "challengePayout", result.at),
        )
    })
    return changes
}

export const betFacts = (message: Message<boolean>): IBetFact[] => {
    const content = message.content
    const fact = (kind: IBetFact["kind"], userId: string, amount: number, balance: number | null, at = message.createdAt): IBetFact => ({
        kind: kind,
        userId: userId,
        amount: amount,
        balance: balance,
        threadId: message.channelId,
        messageId: message.id,
        at: at,
    })

    const won = BET_WON.exec(content)
    if (won) return [fact("won", won[1], Number(won[2]), Number(won[3]))]

    const settled = BET_REFUND.exec(content) ?? BET_LOST.exec(content)
    if (settled) return [fact("settled", settled[1], 0, null)]

    const stakes: IBetFact[] = []
    const lines = content.match(BET_STAKES) ?? []
    lines.forEach(line => {
        const stake = BET_STAKE.exec(line)
        if (stake) stakes.push(fact("stake", stake[1], Number(stake[2]), null, finishedAt(message)))
    })
    return stakes
}

const betChange = (fact: IBetFact, delta: number, balance: number | null, reason: PointReason): IObservedChange => ({
    kind: "change",
    userId: fact.userId,
    delta: delta,
    balance: balance,
    reason: reason,
    command: "bet",
    messageId: fact.messageId,
    at: fact.at,
})

export const linkBets = (facts: IBetFact[]): Observation[] => {
    const threads = new Map<string, IBetFact[]>()
    facts.forEach(fact => {
        const thread = threads.get(fact.threadId) ?? []
        thread.push(fact)
        threads.set(fact.threadId, thread)
    })

    const observations: Observation[] = []
    threads.forEach(thread => {
        const stakes = new Map<string, IBetFact>()
        thread.filter(fact => fact.kind === "stake").forEach(fact => stakes.set(fact.userId, fact))
        const settled = thread.some(fact => fact.kind !== "stake")

        if (settled) {
            stakes.forEach(stake => observations.push(betChange(stake, -stake.amount, null, "betEscrow")))
        }

        thread.filter(fact => fact.kind === "won").forEach(payout => {
            const stake = stakes.get(payout.userId)
            const balance = payout.balance ?? 0
            observations.push(stake === undefined
                ? {kind: "checkpoint", userId: payout.userId, balance: balance, messageId: payout.messageId, at: payout.at}
                : betChange(payout, payout.amount + stake.amount, balance, "betPayout"))
        })
    })
    return observations
}
