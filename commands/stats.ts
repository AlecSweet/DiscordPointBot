import { userMutexes } from "..";
import isValidUserArg from "../util/isValidUserArg";
import getUser from "../util/userUtil";
import { ICallback, ICommand } from "../wokTypes";

const points: ICommand = {
    name: 'stats',
    category: 'statCheck',
    description: 'Check stats',
    expectedArgs: '<users @>',
    minArgs: 0,
    maxArgs: 1,
    cooldown: '5s',
    callback: async (options: ICallback) => {
        const { message, args, guild } = options

        if (!(message.channel.type === "GUILD_TEXT")) {
            message.reply({content: `Only for text channels ${process.env.NOPPERS_EMOJI}`})
            return
        }

        let id = message.author.id
        if (args[0]) {
            id = args[0].replace(/\D/g,'')
            if (!(await isValidUserArg(id, guild))) {
                message.reply({content: `Dont know user ${args[0]} ${process.env.NOPPERS_EMOJI}`})
                return
            }
        }

        const userMutex = userMutexes.get(id)
        if (!userMutex) {
            message.reply({content: `Got an Error ${process.env.NOPPERS_EMOJI}`})
            return
        }
        userMutex.runExclusive(async() => {
            const user = await getUser(id)
            const days = Math.floor(user.secondsActive / 86400)
            const secLeftAfterDays = user.secondsActive % 86400
            const hours = Math.floor(secLeftAfterDays / 3600)
            const secLeftAfterHours = secLeftAfterDays % 3600
            const minutes = Math.floor(secLeftAfterHours / 60)

            const pPF = (user.flipsWon + user.flipsLost) > 0 ? (Math.round(((user.pointsLost + user.pointsWon) / (user.flipsWon + user.flipsLost)) * 10) / 10).toFixed(1) : 0
            const pPL = user.flipsLost > 0 ? (Math.round((user.pointsLost / user.flipsLost) * 10) / 10).toFixed(1) : 0
            const pPW = user.flipsWon > 0 ? (Math.round((user.pointsWon / user.flipsWon) * 10) / 10).toFixed(1) : 0

            message.reply({content: 
`**<@${user.id}>'s Stats**
\`\`\`Ruby
Points           ${user.points}
Flips            ${user.flipsWon} Won / ${user.flipsLost} Lost
Flip Returns     ${user.pointsWon} Points Won / ${user.pointsLost} Points Lost
Avg Flips        ${pPF} Avg Bet / ${pPW} Avg Win / ${pPL} Avg Loss
Max Flip Streak  ${user.maxWinStreak} Won / ${user.maxLossStreak} Lost
Current Streak   ${user.flipStreak < 0 ? `${Math.abs(user.flipStreak)} Lost` : `${user.flipStreak} Won`}
Point Gifts      ${user.pointsGiven} Given / ${user.pointsRecieved} Received
Points Claimed   ${user.pointsClaimed} Claimed           
Active           ${days} days / ${hours} hours / ${minutes} minutes\`\`\``
            })
        }).catch(() => {})
    }
}

export default points