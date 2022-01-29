import { ICallback, ICommand } from "../wokTypes";
import * as dotenv from "dotenv"
import isValidNumberArg from "../util/isValidNumberArg";
import { insertBet, IUserBet } from "../db/bet";
import { Message, MessageSelectOptionData } from "discord.js";
import getUserAndAccruePoints from "../util/userUtil";
import { userMutexes } from "..";
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
        const { client, message, args } = options

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
                    content:`⠀\n${question}`
                })
                const outcomeMessages: Message<boolean>[] = []
                let index = 0
                for (const outcome of outcomes) {
                    const outcomeMessage = await threadChannel.send({
                        content:`\`\`\`${index + 1}) ${outcome.content}\`\`\``
                    })
                    outcomeMessages.push(outcomeMessage)
                    index++
                }
                const betOverMessage = await threadChannel.send({
                    content:`*ᴿᵉᵖˡʸ ᵗᵒ ᵃⁿʸ ᵒᵘᵗᶜᵒᵐᵉ ʷᶦᵗʰ # ᵒᶠ ᵖᵒᶦⁿᵗˢ\nʙᴇᴛᴛɪɴɢ ᴏᴠᴇʀ <t:${(Math.floor(new Date().getTime() / 1000) + (bettingMinutes * 60))}:R>`
                })
        
                const collector = await threadChannel.createMessageCollector({ time: bettingMinutes * 60 * 1000});

                collector.on('collect', async (cMessage: Message) => {
                    if (client.user && client.user.id === cMessage.author.id){ return }

                    const result = await manageUserBets(cMessage, userBets, outcomeMessages)
                    cMessage.delete()
                    if (result.outcomeIndex > -1) {
                        const outcomeBets = userBets.filter(b => b.outcome === result.outcomeIndex)
                        const outcomeBetsFormatted = outcomeBets.map(obf => {
                            return `    ${obf.name}: ${obf.bet}\n`
                        })
                        outcomeMessages[result.outcomeIndex].edit(
                            `\`\`\`${result.outcomeIndex + 1}) ${outcomes[result.outcomeIndex].content}\n${outcomeBetsFormatted.join('')}\`\`\``)
                        
                    } else if (result.errMessage !== null) {
                        setTimeout(() => { 
                            if(result.errMessage !== null) {
                                result.errMessage.delete()
                            }
                        }, 5000)
                    }
                })
        
                collector.on('end', () => {
                    threadChannel.setRateLimitPerUser(20000).then(async () => {
                        const selectMenuOptions: MessageSelectOptionData[] = []
                        outcomes.forEach((outcome, index) => {
                            selectMenuOptions.push({
                                label: outcome.content,
                                value: `${index}`
                            })
                        })
                        selectMenuOptions.push({
                            label: 'Cancel Bet',
                            value: '-1'
                        })
                        await betOverMessage.edit({
                            content: `Betting over. Close the bet when ready.`, 
                            components: [{
                                type: 1,
                                components: [{
                                    type: 3,
                                    customId: 'outcomeSelectMenu',
                                    options: selectMenuOptions,
                                    placeholder: 'Select Winning Outcome',
                                    minValues: 1,
                                    maxValues: 1
                                }]
                            }]
                        })
                        const filter = (interaction) => {
                            return interaction.customId === 'outcomeSelectMenu' || interaction.customId === 'closeBetButton'
                        }

                        const collector = betOverMessage.createMessageComponentCollector({ filter, time: 2 * 60 * 60 * 1000 })
                        let selectedOutcome = -1
                        collector.on('collect', async i => {
                            if (i.user.id === message.author.id) {
                                if (i.isSelectMenu()) {
                                    selectedOutcome = Number(i.values[0])
                                    const buttonMessage = selectedOutcome < 0 ? 
                                        'Cancel Bet and Return Points' :
                                        `Pay Out "${outcomes[selectedOutcome].content}" choosers`
                                    i.update({
                                        content: `⠀\nBetting over. Close the bet when ready.`, 
                                        components: [
                                            {
                                                type: 1,
                                                components: [{
                                                    type: 3,
                                                    customId: 'outcomeSelectMenu',
                                                    options: selectMenuOptions,
                                                    placeholder: 'Select Winning Outcome',
                                                    minValues: 1,
                                                    maxValues: 1
                                                }]
                                            },
                                            {
                                                type: 1,
                                                components: [{
                                                    type: 2,
                                                    label: buttonMessage,
                                                    style: 3,
                                                    customId: "closeBetButton"
                                                }]
                                            }
                                        ]
                                    })
                                } else if (i.isButton()) {
                                    i.deferUpdate()
                                    collector.stop()
                                }
                            } else {
                                const errMess = await i.reply({content: `Only the creator can close it ${process.env.NOPPERS_EMOJI}`, fetchReply: true})
                                setTimeout(() => { (errMess as Message).delete() }, 5000)
                            }
                        })
                        collector.on('end', collected => console.log(`Collected ${collected.size} items`));
                    })
                })
            })
            .catch(console.error)
    }
}

export default openBet

interface IManageUserBetReturn {
    outcomeIndex: number, 
    errMessage: Message<boolean> | null
}

const manageUserBets = async (message: Message, currentBets: IUserBet[], outcomeMessages: Message<boolean>[]): Promise<IManageUserBetReturn> => {

    if (!message.reference || !message.reference.messageId) {
        return {outcomeIndex: -1, errMessage: null}
    }
 
    const outcomeIndex = outcomeMessages.findIndex(oM => message.reference && message.reference.messageId === oM.id)

    if (outcomeIndex > -1) {
        const userMutex = userMutexes.get(message.author.id)
        if (!userMutex) {
            const genErr = await message.reply({content: `Got an Error ${process.env.NOPPERS_EMOJI}`})
            return {outcomeIndex: -1, errMessage: genErr}
        }
        const returnVal: IManageUserBetReturn = {outcomeIndex: -1, errMessage: null}
        await userMutex.runExclusive(async() => {
            const user = await getUserAndAccruePoints(message.author.id)
            if (user) {
                const points = message.content.toUpperCase() === 'ALL' ? user.points : Number(message.content)
                if (!isValidNumberArg(points)) {
                    const errM = await message.reply({content: `${points === 0 ? 0 : message.content} ain a valid bet ${process.env.NOPPERS_EMOJI}`})
                    returnVal.errMessage = errM
                    return
                }

                if (points > user.points) {
                    const errM = await message.reply({content: `You only got ${user.points} points lad ${process.env.NOPPERS_EMOJI}`})
                    returnVal.errMessage = errM
                    return
                }

                const userBet = currentBets.find(ub => ub.id && ub.id === message.author.id);
                if (userBet) {
                    if (userBet.outcome !== outcomeIndex) {
                        const errM = await message.reply({content: `You can only bet on one outcome ${process.env.NOPPERS_EMOJI}`})
                        returnVal.errMessage = errM
                        return
                    } else {
                        userBet.bet += points
                        returnVal.outcomeIndex = outcomeIndex
                        return
                    }
                } else {
                    currentBets.push({
                        id: message.author.id,
                        outcome: outcomeIndex,
                        bet: points,
                        name: message.author.username
                    })
                    returnVal.outcomeIndex = outcomeIndex
                    return
                }
            }
        }).catch(() => {})
        return returnVal
    }

    return {outcomeIndex: -1, errMessage: null}
}
