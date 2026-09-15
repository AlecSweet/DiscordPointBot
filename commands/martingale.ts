import * as dotenv from "dotenv"
import getRandomValues from 'get-random-values'
import { Guild, Message } from "discord.js";
import { IPointChange, IPointOrigin } from "../db/pointEvent";
import { IUser } from "../db/user";
import { checkAndAssignDusted, updateUserLoss, updateUserWin } from "../util/flipUtil";
import { parseCount, parsePoints } from "../util/args";
import fitToMessageLimit from "../util/fitToMessageLimit";
import formatNet from "../util/formatNet";
import sleep from "../util/sleep";
import countdownTo from "../util/countdown";
import textCommand from "../util/textCommand";
import withUserLock from "../util/userLock";
import recordFile from "../util/recordFile";
import sendPanel from "../util/sendPanel";
dotenv.config()

const MAX_WINS = 50
const MIN_BET_PCT = 0.01
const LINES = 5
const ROUND_MS = 2000
const LADDER_FILE = 'martingale.txt'

const martingale = textCommand({
    name: 'martin',
    aliases: ['shkreli', 'm', 'tarmin', 'martingale'],
    category: 'gambling',
    description: 'martingale shit',
    expectedArgs: '<# of points to start on (min 1% of your points), "all", "some" or "min"> <# of times to win (max 50) or "some">',
    minArgs: 2,
    maxArgs: 2,
    cooldown: '3s',
}, async (ctx) => {
    await withUserLock(ctx.authorId, ctx.message, async (user) => {
        const minBet = Math.max(1, Math.ceil(user.points * MIN_BET_PCT))
        const baseBet = await parsePoints(ctx.args[0], user, ctx.message, 'bet', minBet)
        if (baseBet === undefined) {
            return
        }

        const wins = await parseCount(ctx.args[1], MAX_WINS, ctx.message, 'number of wins')
        if (wins === undefined) {
            return
        }

        await runMartingale(ctx.guild, user, baseBet, wins, ctx.message, ctx.origin)
    })
})

export default martingale

interface INumberedRound {
    number: number
    flips: string[]
}

const getMessageContent = (user: IUser, bet: number, rounds: string[][], wins: number, maxWins: number, net: number, final = ''): any => {
    const build = (body: string) =>
`**<@${user.id}>'s Martinelli**
\`\`\`ansi
Points: ${user.points} (${formatNet(net)})   Win: ${wins}/${maxWins}   Next Bet: ${bet}

${body}
\`\`\`
${final}`

    return {content: fitToMessageLimit(build, formatRounds(rounds))}
}

const numberRounds = (rounds: string[][]): INumberedRound[] =>
    rounds
        .map((flips, index) => ({number: index + 1, flips: flips}))
        .filter(round => round.flips.length)

const renderRounds = (numbered: INumberedRound[]): string => {
    const width = String(numbered[numbered.length - 1]?.number ?? 1).length
    return numbered
        .map(round => `${String(round.number).padStart(width)}) ${round.flips.join('  ')}`)
        .join('\n')
}

const formatRounds = (rounds: string[][]): string => renderRounds(numberRounds(rounds).slice(-LINES))

const hasScrolledOff = (rounds: string[][]): boolean => numberRounds(rounds).length > LINES


const getNetLine = (net: number): string => {
    if (net > 0) {
        return `Up ${net} points ${process.env.PEEPO_COMFY_EMOJI}`
    }
    if (net < 0) {
        return `Down ${Math.abs(net)} points ${process.env.SMODGE_EMOJI}`
    }
    return `${process.env.SHRUGGERS_EMOJI}`
}

const finishMartingale = async (martingaleMessage: Message<boolean>, rounds: string[][], panel: {content: string}) => {
    const scrolledOff = hasScrolledOff(rounds)

    await sendPanel(options => martingaleMessage.edit(options), {
        ...panel,
        ...recordFile(scrolledOff ? renderRounds(numberRounds(rounds)) : undefined, LADDER_FILE)
    })
}

const runMartingale = async (guild: Guild, user: IUser, baseBet: number, maxWins: number, message: Message<boolean>, origin: IPointOrigin) => {
    const change: IPointChange = {...origin, reason: "martingale"}
    const startingPoints = user.points
    let bet = baseBet
    let wins = 0
    const rounds: string[][] = [[]]

    let deadline = Date.now() + ROUND_MS
    const martingaleMessage = await message.channel.send(
        getMessageContent(user, bet, rounds, wins, maxWins, 0, `Flipping ${countdownTo(deadline)}`))

    for (;;) {
        await sleep(Math.max(0, deadline - Date.now()))

        const wager = bet
        const won = !(getRandomValues(new Uint8Array(1))[0] < 128)
        if (won) {
            user = await updateUserWin(user, wager, change)
            rounds[rounds.length-1].push(`✅ ${wager}`)
            rounds.push([])
            wins++
            bet = baseBet
        } else {
            user = await updateUserLoss(user, wager, change)
            rounds[rounds.length-1].push(`❌ ${wager}`)
            bet = wager * 2
        }

        const net = user.points - startingPoints

        if (wins >= maxWins) {
            await finishMartingale(martingaleMessage, rounds,
                getMessageContent(user, bet, rounds, wins, maxWins, net, getNetLine(net)))
            return
        }

        if (bet > user.points) {
            await finishMartingale(martingaleMessage, rounds,
                getMessageContent(user, bet, rounds, wins, maxWins, net, `You ain't got ${bet}. Sit`))
            await checkAndAssignDusted(guild, user, wager)
            return
        }

        deadline = Date.now() + ROUND_MS
        await martingaleMessage.edit(getMessageContent(user, bet, rounds, wins, maxWins, net,
            `Flipping ${countdownTo(deadline)}`))
    }
}
