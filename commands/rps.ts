import { Mutex, withTimeout } from "async-mutex";
import { userMutexes } from "..";
import { deleteRps, getRps, insertRps, updateRps } from "../db/rps";
import isValidNumberArg from "../util/isValidNumberArg";
import isValidUserArg from "../util/isValidUserArg";
import getUser, { addPoints, incUser } from "../util/userUtil";
import { ICallback, ICommand } from "../wokTypes";
import { Guild, Message } from "discord.js";
import { cancelRps } from "../util/rpsUtil";
import { assignDustedRole } from "../events/assignMostPointsRole";

const rps: ICommand = {
    name: 'rps',
    category: 'point rps',
    description: 'rps',
    expectedArgs: '<Points> <Optional @user>',
    minArgs: 1,
    maxArgs: 2,
    cooldown: '5s',
    syntaxError: 'Incorrect syntax! Use `{PREFIX}`ping {ARGUMENTS}',
    callback: async (options: ICallback) => {
        const { message, args, guild } = options

        if (!(message.channel.type === "GUILD_TEXT")) {
            message.reply({content: `Only for text channels ${process.env.NOPPERS_EMOJI}`})
            return
        }

        let targetId = ''
        let filter = (i): boolean => {
            return true
        }
        if (args[1]) {
            targetId = args[1].replace(/\D/g,'')
            if (targetId === message.author.id) {
                message.reply({content: `Nope ${process.env.NOPPERS_EMOJI}`})
                return
            }

            if (!(await isValidUserArg(targetId, guild))) {
                message.reply({content: `Dont know user ${args[1]} ${process.env.NOPPERS_EMOJI}`})
                return
            }

            filter = (i): boolean => {
                return i.user.id === targetId || i.user.id === message.author.id
            }
        }

        if (await getRps(message.author.id)) {
            message.reply({content: `Only one at a time${process.env.NOPPERS_EMOJI}`})
            return
        }

        const userMutex = userMutexes.get(message.author.id)
        if(!userMutex) {
            message.reply({content: `Got an Error ${process.env.NOPPERS_EMOJI}`})
            return
        }

        const rpsPoints = await userMutex.runExclusive(async(): Promise<number> => {
            const user = await getUser(message.author.id)
            
            const cPoints = args[0].toUpperCase() === 'ALL' ? user.points : Number(args[0])

            if (!isValidNumberArg(cPoints)) {
                message.reply({content: `${cPoints === 0 ? 0 : args[1]} ain valid ${process.env.NOPPERS_EMOJI}`})
                return -1
            }

            if (cPoints > user.points) {
                message.reply({content: `You only got ${user.points} points lad ${process.env.NOPPERS_EMOJI}`})
                return -1
            }

            await insertRps({ownerId: user.id, ownerBet: cPoints, startDate: new Date()})
            await addPoints(user.id, -cPoints)
            return cPoints
        }).catch(async (err):Promise<number> => { 
            console.log(err) 
            return -1
        })

        if (rpsPoints < 0) {
            return
        }

        const rpsMessage = await message.channel.send({
            content: `<@${message.author.id}> wants to play rock paper scissors against ${targetId ? `<@${targetId}> for up to ${rpsPoints} points` : `anyone for ${rpsPoints} points`}. Game will be canceled <t:${(Math.floor(new Date().getTime() / 1000) + (3 * 60))}:R>`, 
            components: [{
                type: 1,
                components: [
                    {
                        type: 2,
                        label: `Rock 👊`,
                        style: 3,
                        customId: "r"
                    },
                    {
                        type: 2,
                        label: `Paper ✋`,
                        style: 3,
                        customId: "p"
                    },
                    {
                        type: 2,
                        label: `Scissors ✌`,
                        style: 3,
                        customId: "s"
                    },
                    {
                        type: 2,
                        label: `Cancel`,
                        style: 2,
                        customId: "cancelBet"
                    }
                ]
            }]
        })

        let canceled = true
        let cancelButtonHit = false
        let ownerPick: RpsPick
        let acceptPick: RpsPick
        let gameStarting = ''
        const acceptMutex = withTimeout(new Mutex(), 10000)

        const rpsCollector = rpsMessage.createMessageComponentCollector({ filter, time: 3 * 60 * 1000 })

        rpsCollector.on('collect', async i => {
            acceptMutex.runExclusive(async() => {

                if (canceled && i.user.id === message.author.id && i.customId === 'cancelBet') {
                    cancelButtonHit = true
                    rpsCollector.stop()
                    return
                } else if (!cancelButtonHit && i.customId !== 'cancelBet') {
                    if (i.user.id === message.author.id && !ownerPick) {
                        switch(i.customId) {
                            case 'r': ownerPick = RpsPick.rock; break;
                            case 'p': ownerPick = RpsPick.paper; break;
                            case 's': ownerPick = RpsPick.scissors; break;
                        }
                        if (!acceptPick) {
                            i.reply({content: `<@${message.author.id}> is locked in.`})
                        } else {
                            i.deferUpdate()
                        }
                    } else if (i.user.id !== message.author.id && !acceptPick) {

                        const targetMutex = userMutexes.get(i.user.id)
                        if(!targetMutex) {
                            i.reply({content: `Got an Error ${process.env.NOPPERS_EMOJI}`})
                            return
                        }
                        let targetUser
                        let acceptBet
                        await targetMutex.runExclusive(async() => {
                            targetUser = await getUser(i.user.id)
                            if (targetUser.points < 1) {
                                await i.reply({content: `You've got no points ${process.env.NOPPERS_EMOJI}`})
                                return
                            }
                            
                            if(targetId === '' && targetUser.points < rpsPoints){
                                await i.reply({content: `You only got ${targetUser.points} ${process.env.NOPPERS_EMOJI}`})
                                return
                            }
                            
                            acceptBet = targetId === '' || targetUser.points >= rpsPoints ? 
                                    rpsPoints : 
                                    targetUser.points


                            if(acceptBet < rpsPoints){
                                await incUser(message.author.id, {points: rpsPoints - acceptBet})
                                await updateRps(message.author.id, {ownerBet: acceptBet, acceptId: targetUser.id, acceptBet })
                            } else {
                                await updateRps(message.author.id, {acceptId: targetUser.id, acceptBet })
                            }
                            await incUser(targetUser.id, {points: -acceptBet})
                        }).catch((err) => console.log(err))

                        if (!acceptBet) {
                            return
                        }

                        gameStarting = `<@${message.author.id}> against <@${targetUser.id}> for ${acceptBet} points ${process.env.PEPO_SMASH_EMOJI}\n⠀\n`
                        switch(i.customId) {
                            case 'r': acceptPick = RpsPick.rock; break;
                            case 'p': acceptPick = RpsPick.paper; break;
                            case 's': acceptPick = RpsPick.scissors; break;
                        }
                        if (!ownerPick) {
                            i.reply({content: `<@${targetUser.id}> is locked in.`})
                        } else {
                            i.deferUpdate()
                        }
                    }

                    if (ownerPick && acceptPick) {
                        canceled = false
                        rpsCollector.stop()
    
                        await rpsMessage.edit({
                            content: gameStarting, 
                            components: []
                        })
                    }
                }
            }).catch((err) => console.log(err))
        })

        rpsCollector.on('end', async () => {
            if (canceled || cancelButtonHit) {
                const rps = await getRps(message.author.id)
                if (rps) {
                    await cancelRps(message.author.id, rps)
                    rpsMessage.edit({content: `Game canceled ${process.env.NOPPERS_EMOJI}`, components: []})
                }
            } else {
                const rps = await getRps(message.author.id)
                await rpsMessage.edit( { content: `${gameStarting}Rock` })
                setTimeout(async () => { await rpsMessage.edit( { content: `${gameStarting}Rock, Paper` } )}, 1000), 
                setTimeout(async () => { await rpsMessage.edit( { content: `${gameStarting}Rock, Paper, Scissors` })}, 2000),
                setTimeout(() => {
                    finishBet(rps.acceptBet, rpsMessage, rps.acceptId, message.author.id, guild, ownerPick, acceptPick, gameStarting)
                }, 3000)
            }
        })
    }
}

export default rps

enum RpsPick {
    rock = '👊',
    paper = '✋',
    scissors = '✌'
}

enum RpsOutcome {
    ownerWon = 1,
    acceptWon = 2,
    tie = 3
}

const finishBet = async (acceptBet: number, acceptMessage: Message<boolean>, targetId: string, ownerId: string, guild: Guild, ownerPick: RpsPick, acceptPick: RpsPick, gameStarting: string): Promise<boolean> => {
    let rpsOutcome = RpsOutcome.ownerWon
    if (ownerPick === acceptPick) {
        rpsOutcome = RpsOutcome.tie
    } else if ((acceptPick === RpsPick.paper && ownerPick === RpsPick.rock) || 
        (acceptPick === RpsPick.scissors && ownerPick === RpsPick.paper) ||
        (acceptPick === RpsPick.rock && ownerPick === RpsPick.scissors)){
        rpsOutcome = RpsOutcome.acceptWon
    }
    const outcomeString = `<@${ownerId}> ${ownerPick} vs ${acceptPick} <@${targetId}>\n`
    if(rpsOutcome === RpsOutcome.tie) {
        await acceptMessage.edit({
            content: `${gameStarting}${outcomeString}No one wins ${process.env.SHRUGGERS_EMOJI}`, 
        }).catch((err) => console.log(err))
        const rps = await getRps(ownerId)
        if (rps) {
            await cancelRps(ownerId, rps)
        }
    } else if (rpsOutcome === RpsOutcome.ownerWon) {
        await acceptMessage.edit({
            content: `${gameStarting}${outcomeString}<@${ownerId}> wins ${acceptBet} points ${process.env.NICE_EMOJI}`, 
        }).catch((err) => console.log(err))
        await incUser(ownerId, {points: acceptBet*2, rpsPointsWon: acceptBet, rpsWon: 1})
        const user = await incUser(targetId, {rpsPointsLost: acceptBet, rpsLost: 1})
        await deleteRps(ownerId)
        if (acceptBet >= 100 && user.points < 5) {
            await assignDustedRole(guild, user.id)
        }
    } else {
        await acceptMessage.edit({
            content: `${gameStarting}${outcomeString}<@${targetId}> wins ${acceptBet} points ${process.env.NICE_EMOJI}`, 
        }).catch((err) => console.log(err))
        await incUser(targetId, {points: acceptBet*2, rpsPointsWon: acceptBet, rpsWon: 1})
        const user = await incUser(ownerId, {rpsPointsLost: acceptBet, rpsLost: 1})
        await deleteRps(ownerId)
        if (acceptBet >= 100 && user.points < 5) {
            await assignDustedRole(guild, user.id)
        }
    }
    
    return true
}
