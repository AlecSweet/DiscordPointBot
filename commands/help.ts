import ephemeralButton from "../util/ephemeralButton";
import textCommand from "../util/textCommand";

const commandList =
`**Point Bot Commands** — \`<required>\` \`[optional]\`
\`\`\`
Balance
  !points      [@user]
  !give        <@user> <amount | all | some>
  !claim       <daily | weekly | monthly | yearly>
  !daily   !weekly   !monthly   !yearly

Gambling
  !flip        <amount | all | some> [flips: max 50, bet 2%+ | some]
  !martin      <amount: 1%+ | all | some> <wins: max 50 | some>
  !challenge   <amount | all | some> [@user]
  !rps         <amount | all | some> [@user]
  !war         [@user]

Records
  !stats       [@user]
  !top         [leaderboard] [# of users: 1-500]
  !serverStats
\`\`\``

const help = textCommand({
    name: 'help',
    aliases: ['elp'],
    category: 'help',
    description: 'See command',
    cooldown: '2s',
}, async (ctx) => {
    await ephemeralButton(ctx.message, {
        title: `**Point Bot Commands**`,
        command: 'help',
        label: `Show Commands`,
        build: async () => ({content: commandList})
    })
})

export default help
