import { settleUser } from "../util/userUtil";
import { ICallback, ICommand } from "../wokTypes";
import * as dotenv from "dotenv"
import getRandomValues from 'get-random-values'
import { userMutexes } from "..";
import { Guild } from "discord.js";
import { IUser } from "../db/user";
import { checkAndAssignDusted, updateUserLoss, updateUserWin } from "../util/flipUtil";
import isValidNumberArg from "../util/isValidNumberArg";
import fitToMessageLimit from "../util/fitToMessageLimit";
import sleep from "../util/sleep";
import noMutexErrorMessage from "../util/noMutexErrorMessage";
dotenv.config()

const MAX_WINS = 100
const MAX_LINES = 10
const ROUND_MS = 2000

const martingale: ICommand = {
    name: 'martin',
    aliases: ['shkreli', 'm', 'tarmin', 'martingale'],
    category: 'gambling',
    description: 'martingale shit',
    expectedArgs: '<# of points to start on> <# of times to win>',
    minArgs: 2,
    maxArgs: 2,
    cooldown: '3s',
    callback: async (options: ICallback) => {
        const { message, args, guild } = options

        if (!(message.channel.type === "GUILD_TEXT")) {
            message.reply({content: `Only for text channels ${process.env.NOPPERS_EMOJI}`})
            return
        }

        const userMutex = userMutexes.get(message.author.id)
        if(!userMutex) {
            message.reply({content: noMutexErrorMessage})
            return
        }

        await userMutex.runExclusive(async() => {
            const user = await settleUser(message.author.id)

            const baseBet = Number(args[0])
            if (!isValidNumberArg(baseBet)) {
                message.reply({content: `${args[0]} ain a valid bet ${process.env.NOPPERS_EMOJI}`})
                return
            }

            if (baseBet > user.points) {
                message.reply({content: `You only got ${user.points} points lad ${process.env.NOPPERS_EMOJI}`})
                return
            }

            const wins = Number(args[1])
            if (!isValidNumberArg(wins)) {
                message.reply({content: `${args[1]} ain a valid number of wins ${process.env.NOPPERS_EMOJI}`})
                return
            }

            if (wins > MAX_WINS) {
                message.reply({content: `No dog, ${MAX_WINS} at a time ${process.env.NOPPERS_EMOJI}`})
                return
            }

            await runMartingale(guild, user, baseBet, wins, message)
        }).catch((err) => console.log(err))
    }
}

export default martingale

const getMessageContent = (user: IUser, bet: number, winsLeft: number, addon = ' ', final = ''): any => { 
    const build = (body: string) =>
`**<@${user.id}>'s Martinelli**
\`\`\`Ruby
Points: ${user.points}     Next Bet: ${bet}     Wins Left: ${winsLeft}

${body}
\`\`\`
${final}`

    return {content: fitToMessageLimit(build, addon)}
}

const runMartingale = async (guild: Guild, user: IUser, baseBet: number, maxWins: number, message) => {
    const startingPoints = user.points
    let bet = baseBet
    let wins = 0
    const rounds: string[][] = [[]]

    const martingaleMessage = await message.channel.send(getMessageContent(user, bet, maxWins))

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

        const record = rounds.filter(round => round.length).slice(-MAX_LINES).map(round => round.join('  ')).join('\n')

        if (wins >= maxWins) {
            const net = user.points - startingPoints
            await martingaleMessage.edit(getMessageContent(user, bet, 0, record, 
                `${maxWins} win${maxWins > 1 ? 's' : ''} banked, ${net >= 0 ? `up ${net}` : `down ${Math.abs(net)}`} points ${process.env.PEEPO_COMFY_EMOJI}`))
            return
        }

        if (bet > user.points) {
            await martingaleMessage.edit(getMessageContent(user, bet, maxWins-wins, record, 
                `Cant cover the next ${bet} with ${user.points} points. Sit`))
            await checkAndAssignDusted(guild, user, wager)
            return
        }

        await martingaleMessage.edit(getMessageContent(user, bet, maxWins-wins, record))
    }
}
