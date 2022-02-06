import { ICallback, ICommand } from "../wokTypes";
import * as dotenv from "dotenv"
import isValidNumberArg from "../util/isValidNumberArg";
import betModel, { deleteBet, getBet, insertBet, IUserBet } from "../db/bet";
import { Message, MessageSelectOptionData, ThreadChannel } from "discord.js";
import getUser, { addPoints, addPointsAndAccrue, incUser } from "../util/userUtil";
import { userMutexes } from "..";
import { getOdds, getPayouts, returnPointsDeleteBet } from "../util/betUtil";
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
    callback: async (options: ICallback) => {
        const { client, message, args } = options

        if (!(message.channel.type === "GUILD_TEXT")) {
            message.reply({content: `Only open bets in a text channel ${process.env.NOPPERS_EMOJI}`})
            return
        }

        if(await betModel.findOne({ownerId: message.author.id})) {
            message.reply({content: `Only one running bet per user ${process.env.NOPPERS_EMOJI}. If you want to cancel your current bet use !forceCancelBet`})
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
        const outcomeLabels: string[] = []
        let maxOutcomeLabelLen = 0

        let intialCreationFailed = false
        await message.reply({content: `Enter the bet question and each outcome separately in the next ${numOutcomes+1} messages`})
            .then(async () => {
                await message.channel.awaitMessages({filter, max: 1+numOutcomes, time: 120000, errors: ['time']})
                    .then(collected => {
                        let ind = 0
                        collected.map(m => {
                            if (ind === 0) {
                                question = m.content
                            } else {
                                maxOutcomeLabelLen = m.content.length > maxOutcomeLabelLen ? m.content.length : maxOutcomeLabelLen
                                outcomeLabels.push(m.content)
                            }
                            ind += 1
                        })
                    })
                    .catch((err) => {
                        console.log(err)
                        intialCreationFailed = true
                        message.reply({content:`Bet creation timed out ${process.env.NOPPERS_EMOJI}. Type faster`});
                    });
            }).catch((err) => console.log(err))
        if (intialCreationFailed) { return }

        const userBets: IUserBet[] = []
        await message.channel.threads
            .create({
                name: `${message.author.username}'s Bet`,
                autoArchiveDuration: 1440,
                reason: 'a fucking bet',
                rateLimitPerUser: 3
            }).then(async threadChannel => {
                await insertBet({
                    ownerId: message.author.id,
                    threadId: threadChannel.id,
                    numOutcomes: numOutcomes,
                    startDate: (new Date()),
                    userBets: [],
                })
                await threadChannel.send({
                    content:`⠀\n${question}\n⠀`
                })
                const outcomeMessages: Message<boolean>[] = []
                let index = 0
                for (const outcome of outcomeLabels) {
                    const outcomeMessage = await threadChannel.send({
                        content:`⠀  \`${index + 1}) ${outcome}\`\n⠀`
                    })
                    outcomeMessages.push(outcomeMessage)
                    index++
                }
                const betOverMessage = await threadChannel.send({
                    content:`Reply to an option with # of points to bet. You can add more points to your bet but you can't switch your choice.\n__Betting over__ <t:${(Math.floor(new Date().getTime() / 1000) + (bettingMinutes * 60))}:R>`
                })
        
                const collector = await threadChannel.createMessageCollector({ time: bettingMinutes * 60 * 1000});

                collector.on('collect', async (cMessage: Message) => {
                    if (client.user && client.user.id === cMessage.author.id){ return }

                    const result = await manageUserBets(cMessage, userBets, outcomeMessages, threadChannel.id)
                    await cMessage.delete().catch((err) => console.log(err))
                    if (result.outcomeIndex > -1) {
                        await editOutcomeMessages(userBets, outcomeMessages, outcomeLabels, numOutcomes, maxOutcomeLabelLen)
                    }

                    if (result.ubMessage !== null) {
                        setTimeout(async () => { 
                            if(result.ubMessage !== null) {
                                await result.ubMessage.delete().catch((err) => console.log(err))
                            }
                        }, 5000)
                    }
                })
        
                collector.on('end', () => {
                    threadChannel.setRateLimitPerUser(20000).then(async () => {
                        const selectMenuOptions: MessageSelectOptionData[] = []
                        outcomeLabels.forEach((outcome, index) => {
                            selectMenuOptions.push({
                                label: outcome,
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
                        }).catch((err) => console.log(err))

                        const filter = (interaction) => {
                            return interaction.customId === 'outcomeSelectMenu' || interaction.customId === 'closeBetButton'
                        }

                        let selectedOutcome = -1
                        let betTimedOut = true

                        const endCollector = betOverMessage.createMessageComponentCollector({ filter, time: 3 * 60 * 60 * 1000 })

                        endCollector.on('collect', async i => {
                            if (i.user.id === message.author.id) {
                                if (i.isSelectMenu()) {
                                    selectedOutcome = Number(i.values[0])
                                    const buttonMessage = selectedOutcome < 0 ? 
                                        'Cancel Bet and Return Points' :
                                        `Pay Out "${outcomeLabels[selectedOutcome]}" choosers`
                                    await i.update({
                                        content: `⠀\nBetting over. Close the bet when ready.`, 
                                        components: [
                                            {
                                                type: 1,
                                                components: [{
                                                    type: 3,
                                                    customId: 'outcomeSelectMenu',
                                                    options: selectMenuOptions,
                                                    placeholder: 'Select Winning Option',
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
                                    }).catch((err) => console.log(err))
                                } else if (i.isButton()) {    
                                    betTimedOut = false
                                    collector.stop()
                                    if(selectedOutcome==-1){
                                        await i.update({
                                            content: `⠀\nBet canceled ${process.env.SHRUGGERS_EMOJI} returning all points. Bet thread will be deleted in 30 seconds...`, 
                                            components: []
                                        }).catch((err) => console.log(err))
                                        console.log("deleting bet from selectedOutcome")
                                        await returnPointsDeleteBet(threadChannel.id)
                                        setTimeout(async () => { await threadChannel.delete() }, 30000)
                                    } else {
                                        await i.update({
                                            content: `⠀\nPaying out "${outcomeLabels[selectedOutcome]}" choosers...`, 
                                            components: []
                                        }).catch((err) => console.log(err))
                                        await payoutPointsAndDeleteBet(threadChannel, numOutcomes, selectedOutcome)
                                        await incUser(message.author.id, {betsOpened: 1})
                                        await threadChannel.setArchived(true).catch((err) => console.log(err))
                                    }
                                    collector.stop()
                                }
                            } else {
                                const errMess = await i.reply({content: `Only the creator can close it ${process.env.NOPPERS_EMOJI}`, fetchReply: true}).catch((err) => console.log(err))
                                setTimeout(async () => { await (errMess as Message).delete().catch((err) => console.log(err)) }, 5000)
                            }
                        })

                        endCollector.on('collect', async i => {
                            if (betTimedOut) {
                                betOverMessage.edit({content: 'Timed out after 3 hours. Bet thread will be deleted and bets will be returned in about an hour.'})
                            }
                        })
                    }).catch((err) => console.log(err))
                })
            }).catch((err) => console.log(err))
    }
}

export default openBet

interface IManageUserBetReturn {
    outcomeIndex: number, 
    ubMessage: Message<boolean> | null
}

const manageUserBets = async (message: Message, currentBets: IUserBet[], outcomeMessages: Message<boolean>[], threadId: string): Promise<IManageUserBetReturn> => {

    if (!message.reference || !message.reference.messageId) {
        const errMes = await message.reply({content: `Reply to an option with # of points to bet ${process.env.NOPPERS_EMOJI}`})
        return {outcomeIndex: -1, ubMessage: errMes}
    }
 
    const outcomeIndex = outcomeMessages.findIndex(oM => message.reference && message.reference.messageId === oM.id)

    if (outcomeIndex > -1) {
        const userMutex = userMutexes.get(message.author.id)
        if (!userMutex) {
            const genErr = await message.reply({content: `Got an Error ${process.env.NOPPERS_EMOJI}`})
            return {outcomeIndex: -1, ubMessage: genErr}
        }
        const returnVal: IManageUserBetReturn = {outcomeIndex: -1, ubMessage: null}
        await userMutex.runExclusive(async() => {
            const user = await getUser(message.author.id)
            if (user) {
                const points = message.content.toUpperCase() === 'ALL' ? user.points : Number(message.content)
                if (!isValidNumberArg(points)) {
                    returnVal.ubMessage = await message.reply({content: `${points === 0 ? 0 : message.content} ain a valid bet ${process.env.NOPPERS_EMOJI}`})                
                    return
                }

                if (points > user.points) {
                    returnVal.ubMessage = await message.reply({content: `You only got ${user.points} points lad ${process.env.NOPPERS_EMOJI}`})
                    return
                }

                const userBet = currentBets.find(ub => ub.userId && ub.userId === message.author.id);
                if (userBet) {
                    if (userBet.outcome !== outcomeIndex) {
                        returnVal.ubMessage = await message.reply({content: `You can only bet on one option ${process.env.NOPPERS_EMOJI}`})
                        return
                    } else {
                        userBet.bet += points
                        await betModel.updateOne(
                            { threadId },
                            { $inc: { "userBets.$[user].bet": points } },
                            { arrayFilters: [{ "user.userId": {$eq: userBet.userId}}]}
                        )
                        const newUser = await addPoints(message.author.id, -points)
                        returnVal.ubMessage = await message.reply({content: `${points} more points bet on ${outcomeIndex+1}. You now have ${newUser.points} points`})
                        returnVal.outcomeIndex = outcomeIndex
                        return
                    }
                } else {
                    const newUserBet = {
                        userId: message.author.id,
                        outcome: outcomeIndex,
                        bet: points,
                        name: message.author.username
                    }
                    currentBets.push(newUserBet)
                    await betModel.updateOne(
                        { threadId },
                        { $push: { userBets: newUserBet } }
                    )
                    const newUser = await addPoints(message.author.id, -points)
                    returnVal.ubMessage = await message.reply({content: `${points} points bet on ${outcomeIndex+1}. You now have ${newUser.points} points`})
                    returnVal.outcomeIndex = outcomeIndex
                    return
                }
            }
        }).catch((err) => console.log(err))
        return returnVal
    }

    const errMes = await message.reply({content: `Reply to an option with # of points to bet ${process.env.NOPPERS_EMOJI}`})
    return {outcomeIndex: -1, ubMessage: errMes}
}

const editOutcomeMessages = async (
    userBets: IUserBet[], 
    outcomeMessages: Message<boolean>[], 
    outcomesLabels: string[],
    numOutcomes: number,
    maxOutcomeLabelLen: number
) => {
    const odds = getOdds(userBets, numOutcomes)
    for(let i = 0; i < outcomeMessages.length; i++) {
        const outcomeBets = userBets.filter(b => b.outcome === i)
        const outcomeBetsFormatted = outcomeBets.map(obf => {
            return `⠀       __<@${obf.userId}>: ${obf.bet}__\n`
        })
        const space = " ".repeat((maxOutcomeLabelLen - outcomesLabels[i].length) + 12);
        await outcomeMessages[i].edit(
            `⠀  \`${i + 1}) ${outcomesLabels[i]}${space}1 : ${(Math.round(odds[i] * 100) / 100).toFixed(2)}\`\n${outcomeBetsFormatted.join('')}⠀`)
    }
}

const payoutPointsAndDeleteBet = async (thread: ThreadChannel, numOutcomes: number, winningOutcome: number) => {
    const bet = await getBet(thread.id)
    const payouts = getPayouts(bet.userBets, numOutcomes, winningOutcome)

    for (const payout of payouts) {
        const userMutex = userMutexes.get(payout.userId)
        if (!userMutex) {
            return
        }
        await userMutex.runExclusive(async() => {
            if (payout.won) {
                const user = await addPointsAndAccrue(payout.userId, payout.pointsToAdd)
                await incUser(payout.userId, {betsWon: 1, betPointsWon: Math.abs(payout.pointsToAdd)})
                await thread.send({content:`<@${user.id}> won ${payout.pointsToAdd} points ${process.env.NICE_EMOJI} and now has ${user.points} points`})
            } else {
                if (payout.pointsBack) {
                    const user = await addPointsAndAccrue(payout.userId, payout.pointsToAdd)
                    await incUser(payout.userId, {betsLost: 1, betPointsLost: Math.abs(payout.pointsToAdd)})
                    await thread.send({content:`<@${user.id}> got ${Math.abs(payout.pointsToAdd)} points back ${process.env.SMODGE_EMOJI} and now has ${user.points} points`})
                } else {
                    const user = await getUser(payout.userId)
                    await incUser(payout.userId, {betsLost: 1, betPointsLost: Math.abs(payout.pointsToAdd)})
                    await thread.send({content:`${process.env.SMODGE_EMOJI} <@${user.id}> lost it all and now has ${user.points} points`})
                }
            }
        }).catch((err) => {console.log(err)})
    }
    await deleteBet(thread.id)
}