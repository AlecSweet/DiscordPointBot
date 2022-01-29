import { ICallback, ICommand } from "../wokTypes";

const points: ICommand = {
    name: 'help',
    aliases: ['elp'],
    category: 'help',
    description: 'See command',
    cooldown: '2s',
    callback: async (options: ICallback) => {
        const { message } = options

        if (!(message.channel.type === "GUILD_TEXT")) {
            message.reply({content: `Only for text channels ${process.env.NOPPERS_EMOJI}`})
            return
        }

        message.reply({content: 
`Point Bot Commands:\`\`\`
Leaderboards:   !top
Statistics:     !stats <Optional @User>
Check Points:   !points <Optional @User>
50/50 Gamble:   !flip <# or "all">
Give Points:    !give <@User> <#>
Claim Bonus:    !claim <daily or weekly> or !daily/!weekly \`\`\``
})
    }
}

export default points