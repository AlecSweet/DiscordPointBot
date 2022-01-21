import isValidUserArg from "../util/isValidUserArg";
import getUserAndAccruePoints, { checkAndTriggerUserCooldown } from "../util/userUtil";
import { ICallback, ICommand } from "../wokTypes";

const points: ICommand = {
    name: 'stats',
    category: 'statCheck',
    description: 'Check stats',
    expectedArgs: '<users @>',
    minArgs: 0,
    maxArgs: 1,
    cooldown: '30s',
    callback: async (options: ICallback) => {
        const { message, args, guild } = options

        let id = message.author.id
        if (args[0]) {
            id = args[0].replace(/\D/g,'')
            if (!(await isValidUserArg(id, guild))) {
                message.reply({content: `Dont know user ${args[0]} ${process.env.NOPPERS_EMOJI}`})
                return
            }
        }

        const cooldown = await checkAndTriggerUserCooldown(id)
        if (cooldown > -1) {
            message.reply({content: `Wait ${Math.ceil(cooldown/1000)} seconds to target commands at <@${id}> ${process.env.NOPPERS_EMOJI}`})
            return
        }

        const user = await getUserAndAccruePoints(id)
        const days = Math.floor(user.secondsActive / 86400)
        const secLeftAfterDays = user.secondsActive % 86400
        const hours = Math.floor(secLeftAfterDays / 3600)
        const secLeftAfterHours = secLeftAfterDays % 3600
        const minutes = Math.floor(secLeftAfterHours / 60)

        message.reply({content: 
`**<@${user.id}>'s Stats**
\`\`\`Points:   ${user.points}
Flips:    ${user.flipsWon}W / ${user.flipsLost}L
Returns:  Won: ${user.pointsWon} / Lost: ${user.pointsLost}
Active:   ${days}d / ${hours}h / ${minutes}m\`\`\``
        })
    }
}

export default points