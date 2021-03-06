import getUser, { addPoints, updateUser } from "../util/userUtil";
import { ICallback, ICommand } from "../wokTypes";
import * as dotenv from "dotenv"
import getRandomValues from 'get-random-values'
import { userMutexes } from "..";
import { Guild } from "discord.js";
import { IUser } from "../db/user";
import { assignDustedRole } from "../events/assignMostPointsRole";
dotenv.config()

const flip: ICommand = {
    name: 'flip',
    aliases: ['f','filp','fipl','lipf','pilf','fpil', 'phillip', 'fip', 'ipfl', 'iflp'],
    category: 'gambling',
    description: 'lose some points',
    expectedArgs: '<# of points to lose>',
    minArgs: 1,
    maxArgs: 1,
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

            const points = args[0].toUpperCase() === 'ALL' ? user.points : Number(args[0])
            if (isNaN(points) || !Number.isInteger(points) || points < 1) {
                message.reply({content: `${points === 0 ? 0 : args[0]} ain a valid bet ${process.env.NOPPERS_EMOJI}`})
                return
            }

            if (points > user.points) {
                message.reply({content: `You only got ${user.points} points lad ${process.env.NOPPERS_EMOJI}`})
                return
            }

            const arr = new Uint8Array(1);
            getRandomValues(arr);
            const roll = arr[0]
            const won = !(roll < 128)
            if (won) {
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

                user = await updateUser(
                    user.id, 
                    {
                        pointsWon: user.pointsWon + points, 
                        flipsWon: user.flipsWon + 1, 
                        ...(newMaxStreak), 
                        flipStreak: flipStreak + 1
                    }
                )
            } else {
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
                user = await updateUser(
                    user.id, 
                    {
                        pointsLost: user.pointsLost + points, 
                        flipsLost: user.flipsLost + 1, 
                        ...(newMaxStreak), 
                        flipStreak: flipStreak - 1
                    }
                )
            }

            const rollFormatted = roll + 1

            await message.react('3??????')
            setTimeout(async () => { await message.react('2??????') }, 900)
            setTimeout(async () => { await message.react('1??????') }, 1800)
            setTimeout(async () => { won ? await message.react('???') : await message.react('???') }, 2700)
            setTimeout(async () => { 
                won ? 
                    await message.reply({content: `You won ${points} points ${process.env.NICE_EMOJI} You've got ${user.points} points now. You rolled ${rollFormatted} of 256`}) :
                    await message.reply({content: `${process.env.SMODGE_EMOJI} ${points} points deleted, later. You're down to ${user.points} points. You rolled ${rollFormatted} of 256`})
                checkAndAssignDusted(guild, user, points) 
            }, 3200)
        }).catch(() => {})
    }
}

export default flip

const checkAndAssignDusted = async (guild: Guild, user: IUser, bet: number) => {
    if (bet >= 100 && user.points < 5) {
        await assignDustedRole(guild, user.id)
    }
}