import * as dotenv from "dotenv"
import getRandomValues from 'get-random-values'
import { Guild, Message } from "discord.js";
import { IPointChange, IPointOrigin } from "../db/pointEvent";
import { IUser } from "../db/user";
import { checkAndAssignDusted, updateUserLoss, updateUserWin } from "../util/flipUtil";
import { parseCount, parsePoints } from "../util/args";
import fitToMessageLimit from "../util/fitToMessageLimit";
import formatNet from "../util/formatNet";
import { dimSeparators } from "../util/ansi";
import formatPoints from "../util/formatPoints";
import sleep from "../util/sleep";
import countdownTo from "../util/countdown";
import textCommand from "../util/textCommand";
import withUserLock from "../util/userLock";
import { isShuttingDown } from "../util/shuttingDown";
import { whileSettling } from "../util/settling";
import recordFile from "../util/recordFile";
import sendPanel, { IPanel } from "../util/sendPanel";
dotenv.config()

const COUNTDOWN_MS = 3000
const TICK_MS = 900
const REVEAL_MS = 500
const MAX_FLIPS = 50
const MIN_MULTI_BET_PCT = 0.02
const LINES = 5
const RECORD_FILE = 'flips.txt'
const RESTARTING = 'Stopped, the bot is restarting'
const WIN = '✅'
const LOSS = '❌'

const flip = textCommand({
    name: 'flip',
    aliases: ['f','filp','fipl','lipf','pilf','fpil', 'phillip', 'fip', 'ipfl', 'iflp'],
    category: 'gambling',
    description: 'lose some points',
    expectedArgs: '<# of points to lose (min 2% of your points past one flip), "all", "some" or "min"> <Optional # of times to flip (max 50), "some" or "max">',
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
            await whileSettling(() => flipMultiple(ctx.guild, user, points, ctx.message, flips, flipAll, ctx.origin))
        } else {
            await whileSettling(() => flipOnce(ctx.guild, user, points, ctx.message, ctx.origin));
        }
    })
})

export default flip

interface IFlipResult {
    won: boolean
    points: number
}

const getMessageContent =(user: IUser, results: IFlipResult[], maxFlips: number, net: number, bet: number, final = '', record = formatRecord(results)): any => {
    const wins = results.filter(result => result.won).length
    const losses = results.length - wins

    const header = `Points: ${dimSeparators(formatPoints(user.points))} (${formatNet(net)})   Flip: ${results.length}/${maxFlips} (${wins}-${losses})   Bet: ${dimSeparators(formatPoints(bet))}`

    const build = (body: string) =>
`**<@${user.id}>'s Flips**
\`\`\`ansi
${body === '' ? header : `${header}\n\n${body}`}
\`\`\`
${final}`

    return {content: fitToMessageLimit(build, record)}
}

const renderFlips = (results: IFlipResult[], from: number): string => {
    const width = String(from + results.length).length
    return results
        .map((result, index) =>
            `${String(from + index + 1).padStart(width)}) ${result.won ? WIN : LOSS} ${formatPoints(result.points)}`)
        .join('\n')
}

const formatRecord = (results: IFlipResult[]): string =>
    dimSeparators(renderFlips(results.slice(-LINES), Math.max(0, results.length - LINES)))


const getNetLine = (net: number): string => {
    if (net > 0) {
        return `Up ${formatPoints(net)} points ${process.env.NICE_EMOJI}`
    }
    if (net < 0) {
        return `Down ${formatPoints(Math.abs(net))} points ${process.env.SMODGE_EMOJI}`
    }
    return `${process.env.SHRUGGERS_EMOJI}`
}

const finishFlips = async (flipMessage: Message<boolean>, results: IFlipResult[], build: (record?: string) => {content: string}) => {
    const send = (panel: IPanel) => sendPanel(options => flipMessage.edit(options), panel)

    if (results.length <= LINES) {
        await send(build())
        return
    }

    await send({
        ...build(''),
        fallbackContent: build().content,
        ...recordFile(renderFlips(results, 0), RECORD_FILE)
    })
}

const flipMultiple = async (guild: Guild, user: IUser, points: number, message: Message<boolean>, maxFlips: number, flipAll: boolean, origin: IPointOrigin) => {
    const change: IPointChange = {...origin, reason: "flip"}
    const startingPoints = user.points
    const results: IFlipResult[] = []

    let deadline = Date.now() + COUNTDOWN_MS
    const flipMessage = await message.channel.send(
        getMessageContent(user, results, maxFlips, 0, flipAll ? user.points : points, `Flipping ${countdownTo(deadline)}`))

    for (;;) {
        await sleep(Math.max(0, deadline - Date.now()))

        if (isShuttingDown()) {
            await finishFlips(flipMessage, results, record => getMessageContent(user, results, maxFlips, user.points - startingPoints,
                flipAll ? user.points : points, RESTARTING, record))
            return
        }

        const wager = flipAll ? user.points : points
        const won = !(getRandomValues(new Uint8Array(1))[0] < 128)
        if (won) {
            user = await updateUserWin(user, wager, change)
        } else {
            user = await updateUserLoss(user, wager, change)
        }
        results.push({won: won, points: user.points})

        const net = user.points - startingPoints
        const flipsLeft = maxFlips - results.length
        const broke = flipAll ? !won : flipsLeft > 0 && user.points < points

        if (broke) {
            await finishFlips(flipMessage, results, record => getMessageContent(user, results, maxFlips, net, wager,
                flipAll ? `Sit` : `You ain't got ${formatPoints(points)}. Sit`, record))
            await checkAndAssignDusted(guild, user, wager)
            return
        }

        if (flipsLeft === 0) {
            await finishFlips(flipMessage, results, record => getMessageContent(user, results, maxFlips, net, wager,
                flipAll ? `You made it through ${process.env.PEEPO_COMFY_EMOJI}` : `${getNetLine(net)}`, record))
            await checkAndAssignDusted(guild, user, wager)
            return
        }

        deadline = Date.now() + COUNTDOWN_MS
        await flipMessage.edit(getMessageContent(user, results, maxFlips, net,
            flipAll ? user.points : points, `Flipping ${countdownTo(deadline)}`))
    }
}

const flipOnce = async (guild: Guild, user: IUser, points: number, message: Message<boolean>, origin: IPointOrigin) => {
    const change: IPointChange = {...origin, reason: "flip"}
    const arr = new Uint8Array(1);
    getRandomValues(arr);
    const roll = arr[0]
    const won = !(roll < 128)
    if (won) {
        user = await updateUserWin(user, points, change)
    } else {
        user = await updateUserLoss(user, points, change)
    }

    const rollFormatted = roll + 1
    const react = (emoji: string) => message.react(emoji).catch((err) => console.log(err))

    await react('3️⃣')
    setTimeout(() => { react('2️⃣') }, TICK_MS)
    setTimeout(() => { react('1️⃣') }, 2 * TICK_MS)
    setTimeout(() => { react(won ? '✅' : '❌') }, 3 * TICK_MS)
    setTimeout(() => {
        message.reply({content: won ?
            `You won ${formatPoints(points)} points ${process.env.NICE_EMOJI} You've got ${formatPoints(user.points)} points now. You rolled ${rollFormatted} of 256` :
            `${process.env.SMODGE_EMOJI} ${formatPoints(points)} points deleted, later. You're down to ${formatPoints(user.points)} points. You rolled ${rollFormatted} of 256`})
            .catch((err) => console.log(err))
        checkAndAssignDusted(guild, user, points)
    }, 3 * TICK_MS + REVEAL_MS)
}
