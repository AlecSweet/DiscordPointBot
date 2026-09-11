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
import countdownTo from "../util/countdown";
import noMutexErrorMessage from "../util/noMutexErrorMessage";
dotenv.config()

const COUNTDOWN_MS = 3000
const MAX_FLIPS = 25

const flip: ICommand = {
    name: 'flip',
    aliases: ['f','filp','fipl','lipf','pilf','fpil', 'phillip', 'fip', 'ipfl', 'iflp'],
    category: 'gambling',
    description: 'lose some points',
    expectedArgs: '<# of points to lose> <Optional # of times to flip>',
    minArgs: 1,
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

            const flipAll = args[0].toUpperCase() === 'ALL'
            const points = flipAll ? user.points : Number(args[0])
            if (!isValidNumberArg(points)) {
                message.reply({content: `${points === 0 ? 0 : args[0]} ain a valid bet ${process.env.NOPPERS_EMOJI}`})
                return
            }

            if (points > user.points) {
                message.reply({content: `You only got ${user.points} points lad ${process.env.NOPPERS_EMOJI}`})
                return
            }

            let flips = 1;
            if (args[1]) {
                flips = Number(args[1])
            
                if (!isValidNumberArg(flips)) {
                    message.reply({content: `${args[1]} ain a valid number of flips ${process.env.NOPPERS_EMOJI}`})
                    return
                }

                if (flips > MAX_FLIPS) {
                    message.reply({content: `No dog, ${MAX_FLIPS} at a time ${process.env.NOPPERS_EMOJI}`})
                    return
                }
            }
            if (flips > 1) {
                await flipMultiple(guild, user, points, message, flips, flipAll)
            } else {
                await flipOnce(guild, user, points, message);
            }
        }).catch((err) => console.log(err))
    }
}

export default flip

const getMessageContent = (user: IUser, flips: number, addon = ' ', final = ''): any => { 
    const build = (body: string) =>
`**<@${user.id}>'s Flips**
\`\`\`Ruby
Points: ${user.points}     Flips Left: ${flips}

${body}
\`\`\`
${final}`

    return {content: fitToMessageLimit(build, addon)}
}

const flipMultiple = async (guild: Guild, user: IUser, points: number, message, maxFlips: number, flipAll: boolean) => {
    if (flipAll) {
        let totalFlips = 0;

        let record = ''
        let deadline = Date.now() + COUNTDOWN_MS
        const flipMessage = await message.channel.send(getMessageContent(user, maxFlips-totalFlips, record, `Flipping ${countdownTo(deadline)}`))

        for (;;) {
            await sleep(Math.max(0, deadline - Date.now()))

            const wager = points
            const won = !(getRandomValues(new Uint8Array(1))[0] < 128)
            if (won) {
                user = await updateUserWin(user, wager)
                record += '✅ '
            } else {
                user = await updateUserLoss(user, wager)
                record += '❌ '
            }
            points = user.points
            totalFlips++

            if (totalFlips >= maxFlips || !won) {
                if (!won) { 
                    await flipMessage.edit(getMessageContent(user, maxFlips-totalFlips, record, `Sit`))
                    await checkAndAssignDusted(guild, user, wager) 
                } else {
                    await flipMessage.edit(getMessageContent(user, maxFlips-totalFlips, record, `You made it through ${process.env.PEEPO_COMFY_EMOJI}`))
                }
                return
            }

            deadline = Date.now() + COUNTDOWN_MS
            await flipMessage.edit(getMessageContent(user, maxFlips-totalFlips, record, `Flipping ${countdownTo(deadline)}`))
        }
    } else {
        await message.channel.send({
            content: `Under Development`, 
        })
    }
}

const flipOnce = async (guild: Guild, user: IUser, points: number, message) => {
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
