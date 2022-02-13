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
Leaderboards:     !top
Statistics:       !stats <Optional @User>
Check Points:     !points <Optional @User>

Give Points:      !give <@User> <# or "all">
Claim Bonus:      !claim <daily or weekly> or !daily/!weekly

Create Bet:       !openBet <#options><#betting period>
Cancel Bet:       !forceCancelBet

50/50 Gamble:     !flip <# or "all">
Challenge:        !challenge <# or "all"> <Optional @User>
War:              !war <Optional @User>
RockPaperScissors !rps <# or "all"> <Optional @User>
\`\`\``
})
    }
}

export default points