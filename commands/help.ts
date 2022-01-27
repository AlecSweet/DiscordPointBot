import { ICallback, ICommand } from "../wokTypes";

const points: ICommand = {
    name: 'help',
    aliases: ['elp'],
    category: 'help',
    description: 'See command',
    cooldown: '2s',
    callback: async (options: ICallback) => {
        const { message } = options

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