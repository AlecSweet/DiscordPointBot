import { ICallback, ICommand } from "../wokTypes";
import * as dotenv from "dotenv"
import isValidNumberArg from "../util/isValidNumberArg";
dotenv.config()

const openBet: ICommand = {
    name: 'openBet',
    aliases: ['OpenBet', 'openbet', 'OPENBET'],
    category: 'gambling',
    description: 'Create a bet',
    expectedArgs: '<# of outcomes(2-4)>',
    minArgs: 1,
    maxArgs: 1,
    cooldown: '3s',
    ownerOnly: true,
    callback: async (options: ICallback) => {
        const { message, args } = options

        const numOutcomes = Number(args[0])
        if (!isValidNumberArg(numOutcomes) || numOutcomes < 2 || numOutcomes > 4) {
            message.reply({content: `${numOutcomes} ain a valid number of outcomes ${process.env.NOPPERS_EMOJI}`})
            return
        }

        const filter = m => m.author.id === message.author.id

        let question
        let outcomes

        await message.reply({content: `Enter the bet question only in your next message...`})
            .then(async () => {
                await message.channel.awaitMessages({filter, max: 1, time: 60000, errors: ['time']})
                    .then(async questionCollected => {
                        question = questionCollected.first()?.content
                        await message.reply({content: `Enter each bet outcome in your next ${numOutcomes} messages...`})
                        .then(async () => {
                            await message.channel.awaitMessages({filter, max: numOutcomes, time: 120000,errors: ['time']})
                                .then(async outcomesCollected => {
                                    let ind = 0
                                    outcomes = outcomesCollected.map((outcome) => {
                                        ind += 1
                                        return `    ${ind})  ${outcome.content}`
                                    })
                                })
                                .catch(() => {
                                    message.reply({content:`Bet outcome entry timed out ${process.env.NOPPERS_EMOJI}`});
                                });
                        })
                    })
                    .catch(() => {
                        message.reply({content:`Bet question entry timed out ${process.env.NOPPERS_EMOJI}`});
                    });
            })

        const betId = await message.channel.send({
            content:`**${question}**\n\n${outcomes.join('\n')}`
        })
        console.log(betId.id)
    }
}

export default openBet