import getUser, { addPoints, incUser, updateUser } from "../util/userUtil";
import { ICallback, ICommand } from "../wokTypes";
import * as dotenv from "dotenv"
import getRandomValues from 'get-random-values'
import { userMutexes } from "..";
import { Guild, User } from "discord.js";
import { IUser } from "../db/user";
import { assignDustedRole } from "../events/assignMostPointsRole";
dotenv.config()

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
            message.reply({content: `Got an Error ${process.env.NOPPERS_EMOJI}`})
            return
        }
        userMutex.runExclusive(async() => {
            let user = await getUser(message.author.id)

            const flipAll = args[0].toUpperCase() === 'ALL'
            const points = flipAll ? user.points : Number(args[0])
            if (isNaN(points) || !Number.isInteger(points) || points < 1) {
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
            
                if (isNaN(flips) || !Number.isInteger(flips) || flips < 1) {
                    message.reply({content: `${args[1]} ain a valid number of flips ${process.env.NOPPERS_EMOJI}`})
                    return
                }
            }
            if (flips > 1) {
                flipMultiple(guild, user, points, message, flips, flipAll)
            } else {
                flipOnce(guild, user, points, message);
            }
        }).catch(() => {})
    }
}

export default flip

const checkAndAssignDusted = async (guild: Guild, user: IUser, bet: number) => {
    if (bet >= 100 && user.points < 5) {
        await assignDustedRole(guild, user.id)
    }
}

const getMessageContent = (user: IUser, flips: number, addon: string = ' ', final: string = ''): any => { 
    return {content: 
`**<@${user.id}>'s Flips**
\`\`\`Ruby
Points: ${user.points}     Flips Left: ${flips}

${addon}
\`\`\`
${final}`
    }
}

const flipMultiple = async (guild: Guild, user: IUser, points: number, message, maxFlips: number, flipAll: boolean) => {
    if (flipAll) {
        let totalFlips = 0;

        let record = ''
        const flipMessage = await message.channel.send(getMessageContent(user, maxFlips-totalFlips, record))

        let countdownCounter = 0;
        await new Promise(resolve => {
            const interval = setInterval(async () => {
                countdownCounter++;
                const action = countdownCounter % 4;
                switch (action) {
                    case 0:
                        const won = !(getRandomValues(new Uint8Array(1))[0] < 128)
                        if (won) {
                            user = await updateUserWin(user, points)
                            record += '✅ '
                        } else {
                            user = await updateUserLoss(user, points)
                            record += '❌ '
                        }
                        points = user.points
                        totalFlips++
                        if (totalFlips >= maxFlips || !won) {
                            if (!won) { 
                                flipMessage.edit(getMessageContent(user, maxFlips-totalFlips, record, `Sit`))
                                checkAndAssignDusted(guild, user, points) 
                            } else {
                                flipMessage.edit(getMessageContent(user, maxFlips-totalFlips, record, `You made it through ${process.env.PEEPO_COMFY_EMOJI}`))
                            }
                            resolve('')
                            clearInterval(interval)
                        } else {
                            flipMessage.edit(getMessageContent(user, maxFlips-totalFlips, record))
                        }
                        break;
                    case 1: 
                        flipMessage.edit(getMessageContent(user, maxFlips-totalFlips, `${record}3️⃣`))
                        break
                    case 2:
                        flipMessage.edit(getMessageContent(user, maxFlips-totalFlips, `${record}3️⃣2️⃣`))
                        break
                    case 3: 
                        flipMessage.edit(getMessageContent(user, maxFlips-totalFlips, `${record}3️⃣2️⃣1️⃣`))
                        break
                }
            }, 1000);
        })
    } else {
        const flipMessage = await message.channel.send({
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

const updateUserWin = async (user: IUser, points: number): Promise<IUser> => {
    await addPoints(user.id, points)

    let newMaxStreak = {}
    let flipStreak = user.flipStreak
    if (flipStreak < 0) {  
        if (Math.abs(flipStreak) > user.maxLossStreak) {
            newMaxStreak = {maxLossStreak: Math.abs(flipStreak)}
        }
        flipStreak = 0
    } else if (flipStreak + 1 > user.maxWinStreak) {
        newMaxStreak = {maxWinStreak: flipStreak + 1}
    }

    return await updateUser(
        user.id, 
        {
            pointsWon: user.pointsWon + points, 
            flipsWon: user.flipsWon + 1, 
            ...(newMaxStreak), 
            flipStreak: flipStreak + 1
        }
    )
}

const updateUserLoss = async (user: IUser, points: number): Promise<IUser> => {
    await addPoints(user.id, -points)

    let newMaxStreak = {}
    let flipStreak = user.flipStreak
    if (flipStreak > 0) {  
        if (flipStreak > user.maxWinStreak) {
            newMaxStreak = {maxWinStreak: flipStreak}
        }
        flipStreak = 0
    } else if (Math.abs(flipStreak - 1) > user.maxLossStreak) {
        newMaxStreak = {maxLossStreak: Math.abs(flipStreak - 1)}
    }
    return await updateUser(
        user.id, 
        {
            pointsLost: user.pointsLost + points, 
            flipsLost: user.flipsLost + 1, 
            ...(newMaxStreak), 
            flipStreak: flipStreak - 1
        }
    )
}
