import * as dotenv from "dotenv"
import getRandomValues from 'get-random-values'
import { Guild, Message } from "discord.js";
import { IUser } from "../db/user";
import { checkAndAssignDusted, updateUserLoss, updateUserWin } from "../util/flipUtil";
import { parseCount, parsePoints } from "../util/args";
import fitToMessageLimit from "../util/fitToMessageLimit";
import formatNet from "../util/formatNet";
import sleep from "../util/sleep";
import countdownTo from "../util/countdown";
import textCommand from "../util/textCommand";
import withUserLock from "../util/userLock";
dotenv.config()

const COUNTDOWN_MS = 3000
const MAX_FLIPS = 50
const MIN_MULTI_BET_PCT = 0.02
const FLIPS_PER_ROW = 10
const WIN = '✅'
const LOSS = '❌'

const flip = textCommand({
    name: 'flip',
    aliases: ['f','filp','fipl','lipf','pilf','fpil', 'phillip', 'fip', 'ipfl', 'iflp'],
    category: 'gambling',
    description: 'lose some points',
    expectedArgs: '<# of points to lose (min 2% of your points past one flip), "all" or "some"> <Optional # of times to flip or "some">',
    minArgs: 1,
    maxArgs: 2,
    cooldown: '3s',
}, async (ctx) => {
    await withUserLock(ctx.authorId, ctx.message, async (user) => {
        const flips = ctx.args[1] ? await parseCount(ctx.args[1], MAX_FLIPS, ctx.message, 'number of flips') : 1
        if (flips === undefined) {
            return
        }

        const minBet = flips > 1 ? Math.max(1, Math.ceil(user.points * MIN_MULTI_BET_PCT)) : 1
        const points = await parsePoints(ctx.args[0], user, ctx.message, 'bet', minBet)
        if (points === undefined) {
            return
        }

        const flipAll = ctx.args[0].toUpperCase() === 'ALL'
        if (flips > 1) {
            await flipMultiple(ctx.guild, user, points, ctx.message, flips, flipAll)
        } else {
            await flipOnce(ctx.guild, user, points, ctx.message);
        }
    })
})

export default flip

const getMessageContent =(user: IUser, results: string[], maxFlips: number, net: number, final = ''): any => {
    const wins = results.filter(result => result === WIN).length
    const losses = results.length - wins

    const build = (body: string) =>
`**<@${user.id}>'s Flips**
\`\`\`ansi
Points: ${user.points}     Net: ${formatNet(net)}     Flip: ${results.length} of ${maxFlips}
W: ${wins}     L: ${losses}

${body}
\`\`\`
${final}`

    return {content: fitToMessageLimit(build, formatRecord(results))}
}

const formatRecord = (results: string[]): string => {
    const rows: string[] = []
    for (let i = 0; i < results.length; i += FLIPS_PER_ROW) {
        rows.push(results.slice(i, i + FLIPS_PER_ROW).join(' '))
    }
    return rows.join('\n')
}

const getNetLine = (net: number): string => {
    if (net > 0) {
        return `up ${net} points ${process.env.NICE_EMOJI}`
    }
    if (net < 0) {
        return `down ${Math.abs(net)} points ${process.env.SMODGE_EMOJI}`
    }
    return `${process.env.SHRUGGERS_EMOJI}`
}

const flipMultiple = async (guild: Guild, user: IUser, points: number, message: Message<boolean>, maxFlips: number, flipAll: boolean) => {
    const startingPoints = user.points
    const results: string[] = []

    let deadline = Date.now() + COUNTDOWN_MS
    const flipMessage = await message.channel.send(getMessageContent(user, results, maxFlips, 0, `Flipping ${countdownTo(deadline)}`))

    for (;;) {
        await sleep(Math.max(0, deadline - Date.now()))

        const wager = flipAll ? user.points : points
        const won = !(getRandomValues(new Uint8Array(1))[0] < 128)
        if (won) {
            user = await updateUserWin(user, wager)
            results.push(WIN)
        } else {
            user = await updateUserLoss(user, wager)
            results.push(LOSS)
        }

        const net = user.points - startingPoints
        const flipsLeft = maxFlips - results.length
        const broke = flipAll ? !won : flipsLeft > 0 && user.points < points

        if (broke) {
            await flipMessage.edit(getMessageContent(user, results, maxFlips, net,
                flipAll ? `Sit` : `You ain't got ${points}. Sit`))
            await checkAndAssignDusted(guild, user, wager)
            return
        }

        if (flipsLeft === 0) {
            await flipMessage.edit(getMessageContent(user, results, maxFlips, net,
                flipAll ? `You made it through ${process.env.PEEPO_COMFY_EMOJI}` : `${maxFlips} flips, ${getNetLine(net)}`))
            await checkAndAssignDusted(guild, user, wager)
            return
        }

        deadline = Date.now() + COUNTDOWN_MS
        await flipMessage.edit(getMessageContent(user, results, maxFlips, net, `Flipping ${countdownTo(deadline)}`))
    }
}

const flipOnce = async (guild: Guild, user: IUser, points: number, message: Message<boolean>) => {
    const arr = new Uint8Array(1);
    getRandomValues(arr);
    const roll = arr[0]
    const won = !(roll < 128)
    if (won) {
        user = await updateUserWin(user, points)
    } else {
        user = await updateUserLoss(user, points)
    }

    const rollFormatted = roll + 1

    await message.react('3️⃣')
    setTimeout(async () => { await message.react('2️⃣') }, 900)
    setTimeout(async () => { await message.react('1️⃣') }, 1800)
    setTimeout(async () => { won ? await message.react('✅') : await message.react('❌') }, 2700)
    setTimeout(async () => { 
        won ? 
            await message.reply({content: `You won ${points} points ${process.env.NICE_EMOJI} You've got ${user.points} points now. You rolled ${rollFormatted} of 256`}) :
            await message.reply({content: `${process.env.SMODGE_EMOJI} ${points} points deleted, later. You're down to ${user.points} points. You rolled ${rollFormatted} of 256`})
        checkAndAssignDusted(guild, user, points) 
    }, 3200)
}
