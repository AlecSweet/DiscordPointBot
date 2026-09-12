import * as dotenv from "dotenv"
import getRandomValues from 'get-random-values'
import { Guild, Message } from "discord.js";
import { IUser } from "../db/user";
import { checkAndAssignDusted, updateUserLoss, updateUserWin } from "../util/flipUtil";
import { parseCount, parsePoints } from "../util/args";
import fitToMessageLimit from "../util/fitToMessageLimit";
import formatNet from "../util/formatNet";
import sleep from "../util/sleep";
import textCommand from "../util/textCommand";
import withUserLock from "../util/userLock";
dotenv.config()

const MAX_WINS = 50
const MIN_BET_PCT = 0.01
const MAX_LINES = 10
const ROUND_MS = 2000

const martingale = textCommand({
    name: 'martin',
    aliases: ['shkreli', 'm', 'tarmin', 'martingale'],
    category: 'gambling',
    description: 'martingale shit',
    expectedArgs: '<# of points to start on (min 1% of your points), "all" or "some"> <# of times to win or "some">',
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

        await runMartingale(ctx.guild, user, baseBet, wins, ctx.message)
    })
})

export default martingale

const getMessageContent = (user: IUser, bet: number, rounds: string[][], wins: number, maxWins: number, net: number, final = ''): any => {
    const losses = rounds.reduce((flips, round) => flips + round.length, 0) - wins

    const build = (body: string) =>
`**<@${user.id}>'s Martinelli**
\`\`\`ansi
Points: ${user.points}     Net: ${formatNet(net)}     Win: ${wins} of ${maxWins}
Next Bet: ${bet}     L: ${losses}

${body}
\`\`\`
${final}`

    return {content: fitToMessageLimit(build, formatRounds(rounds))}
}

const formatRounds = (rounds: string[][]): string =>
    rounds.filter(round => round.length).slice(-MAX_LINES).map(round => round.join('  ')).join('\n')

const getNetLine = (net: number): string => {
    if (net > 0) {
        return `up ${net} points ${process.env.PEEPO_COMFY_EMOJI}`
    }
    if (net < 0) {
        return `down ${Math.abs(net)} points ${process.env.SMODGE_EMOJI}`
    }
    return `${process.env.SHRUGGERS_EMOJI}`
}

const runMartingale = async (guild: Guild, user: IUser, baseBet: number, maxWins: number, message: Message<boolean>) => {
    const startingPoints = user.points
    let bet = baseBet
    let wins = 0
    const rounds: string[][] = [[]]

    const martingaleMessage = await message.channel.send(getMessageContent(user, bet, rounds, wins, maxWins, 0))

    for (;;) {
        await sleep(ROUND_MS)

        const wager = bet
        const won = !(getRandomValues(new Uint8Array(1))[0] < 128)
        if (won) {
            user = await updateUserWin(user, wager)
            rounds[rounds.length-1].push(`✅ ${wager}`)
            rounds.push([])
            wins++
            bet = baseBet
        } else {
            user = await updateUserLoss(user, wager)
            rounds[rounds.length-1].push(`❌ ${wager}`)
            bet = wager * 2
        }

        const net = user.points - startingPoints

        if (wins >= maxWins) {
            await martingaleMessage.edit(getMessageContent(user, bet, rounds, wins, maxWins, net, getNetLine(net)))
            return
        }

        if (bet > user.points) {
            await martingaleMessage.edit(getMessageContent(user, bet, rounds, wins, maxWins, net,
                `You ain't got ${bet}. Sit`))
            await checkAndAssignDusted(guild, user, wager)
            return
        }

        await martingaleMessage.edit(getMessageContent(user, bet, rounds, wins, maxWins, net))
    }
}
