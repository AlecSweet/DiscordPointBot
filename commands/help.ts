import textCommand from "../util/textCommand";

const help = textCommand({
    name: 'help',
    aliases: ['elp'],
    category: 'help',
    description: 'See command',
    cooldown: '2s',
}, async (ctx) => {
    await ctx.message.reply({content: 
`Point Bot Commands:\`\`\`
Leaderboards:     !top
Statistics:       !stats <Optional @User>
Server Stats      !serverStats
Check Points:     !points <Optional @User>

Give Points:      !give <@User> <# or "all" or "some">
Claim Bonus:      !claim <daily, weekly, monthly or yearly>
Claim Shorthand:  !daily / !weekly / !monthly / !yearly

50/50 Gamble:     !flip <# or "all" or "some"> <Optional # of flips (max 50, bet 2%+) or "some">
Martingale:       !martin <# 1%+ or "all" or "some"> <# of wins (max 50) or "some">
Challenge:        !challenge <# or "all" or "some"> <Optional @User>
War:              !war <Optional @User>
RockPaperScissors !rps <# or "all" or "some"> <Optional @User>
\`\`\``
    })
})

export default help
