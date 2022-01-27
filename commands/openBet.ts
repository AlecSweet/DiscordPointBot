import { ICallback, ICommand } from "../wokTypes";
import * as dotenv from "dotenv"
import isValidNumberArg from "../util/isValidNumberArg";
import { insertBet, IUserBet } from "../db/bet";
import { Message } from "discord.js";
import getUserAndAccruePoints, { checkAndTriggerUserCooldown } from "../util/userUtil";
import { IUser } from "../db/user";
dotenv.config()

const openBet: ICommand = {
    name: 'openBet',
    aliases: ['OpenBet', 'openbet', 'OPENBET'],
    category: 'gambling',
    description: 'Create a bet',
    expectedArgs: '<# of outcomes(2-4)> <minutes betting is open>',
    minArgs: 2,
    maxArgs: 2,
    cooldown: '3s',
    ownerOnly: true,
    callback: async (options: ICallback) => {
        const { message, args } = options

        if (!(message.channel.type === "GUILD_TEXT")) {
            message.reply({content: `Only open bets in a text channel ${process.env.NOPPERS_EMOJI}`})
            return
        }

        const numOutcomes = Number(args[0])
        if (!isValidNumberArg(numOutcomes) || numOutcomes < 2 || numOutcomes > 4) {
            message.reply({content: `${numOutcomes} ain a valid number of outcomes ${process.env.NOPPERS_EMOJI}`})
            return
        }

        const bettingMinutes = Number(args[1])
        if (!isValidNumberArg(numOutcomes)) {
            message.reply({content: `${args[1]} ain a valid number of minutes ${process.env.NOPPERS_EMOJI}`})
            return
        }

        const filter = m => m.author.id === message.author.id

        let question = ''
        const outcomes: Message<boolean>[] = []

        await message.reply({content: `Enter the bet question and each outcome serpartely in the next ${numOutcomes+1} messages`})
            .then(async () => {
                await message.channel.awaitMessages({filter, max: 1+numOutcomes, time: 120000, errors: ['time']})
                    .then(collected => {
                        let ind = 0
                        collected.map(m => {
                            if (ind === 0) {
                                question = m.content
                            } else {
                                outcomes.push(m)
                            }
                            ind += 1
                        })
                    })
                    .catch(() => {
                        message.reply({content:`Bet creation timed out ${process.env.NOPPERS_EMOJI}. Type faster`});
                    });
            })

        const userBets: IUserBet[] = []
        message.channel.threads
            .create({
                name: `${message.author.username}'s Bet`,
                autoArchiveDuration: 1440,
                reason: 'testing a fucking bet',
            })
            .then(async threadChannel => {
                insertBet({
                    id: message.author.id,
                    messageId: threadChannel.id,
                    numOutcomes: numOutcomes,
                    userBets: []
                })
                await threadChannel.send({
                    content:`__${question}__\nBetting Over <t:${(Math.floor(new Date().getTime() / 1000) + (bettingMinutes * 60))}:R>\n*ᴿᵉᵖˡʸ ᵗᵒ ᵃⁿʸ ᵒᵘᵗᶜᵒᵐᵉ ʷᶦᵗʰ # ᵒᶠ ᵖᵒᶦⁿᵗˢ`
                })
                const outcomeMessages: Message<boolean>[] = []
                await outcomes.forEach(async (outcome, index) => {
                    const outcomeMessage = await threadChannel.send({
                        content:`\`\`\`${index + 1}) ${outcome.content}\`\`\``
                    })
                    outcomeMessages.push(outcomeMessage)
                })
                const collector = threadChannel.createMessageCollector({ time: bettingMinutes * 60 * 1000 });
                collector.on('collect', async (cMessage: Message) => {
                    const outcomeUpdateIndex = await manageUserBets(cMessage, userBets, outcomeMessages)
                    if (outcomeUpdateIndex > -1) {
                        const outcomeBets = userBets.filter(b => b.outcome === outcomeUpdateIndex)
                        const outcomeBetsFormatted = outcomeBets.map(obf => {
                            return `    ${obf.name}: ${obf.bet}\n`
                        })
                        outcomeMessages[outcomeUpdateIndex].edit(
                            `\`\`\`${outcomeUpdateIndex + 1}) ${outcomes[outcomeUpdateIndex].content}\n${outcomeBetsFormatted.join('')}\`\`\``)
                    }
                });
        
                collector.on('end', collected => {
                    console.log(`Collected ${collected.size} items`);
                });
            })
            .catch(console.error)
    }
}

export default openBet

const manageUserBets = async (message: Message, currentBets: IUserBet[], outcomeMessages: Message<boolean>[]): Promise<number> => {
    if (!message.reference || !message.reference.messageId) {
        return -1
    }
 
    const outcomeIndex = outcomeMessages.findIndex(oM => message.reference && message.reference.messageId === oM.id)

    if (outcomeIndex > -1) {
        const user = await getUserAndHandleCooldown(message)
        if (user) {
            const points = message.content.toUpperCase() === 'ALL' ? user.points : Number(message.content)
            if (!isValidNumberArg(points)) {
                message.reply({content: `${points === 0 ? 0 : message.content} ain a valid bet ${process.env.NOPPERS_EMOJI}`})
                return -1
            }

            if (points > user.points) {
                message.reply({content: `You only got ${user.points} points lad ${process.env.NOPPERS_EMOJI}`})
                return -1
            }

            const userBet = currentBets.find(ub => ub.id && ub.id === message.author.id);
            if (userBet) {
                if (userBet.outcome !== outcomeIndex) {
                    message.reply({content: `You can only bet on one outcome ${process.env.NOPPERS_EMOJI}`})
                    return -1
                } else {
                    userBet.bet += points
                    return outcomeIndex
                }
            } else {
                currentBets.push({
                    id: message.author.id,
                    outcome: outcomeIndex,
                    bet: points,
                    name: message.author.username
                })
                return outcomeIndex
            }
        }
    }

    return -1
}

const getUserAndHandleCooldown = async (message: Message<boolean>): Promise<IUser | null> => {
    const cooldown = await checkAndTriggerUserCooldown(message.author.id)
    if (cooldown > -1) {
        message.reply({content: `Wait ${Math.ceil(cooldown/1000)} seconds to target commands at <@${message.author.id}> ${process.env.NOPPERS_EMOJI}`})
        return null
    }

    return await getUserAndAccruePoints(message.author.id)
}