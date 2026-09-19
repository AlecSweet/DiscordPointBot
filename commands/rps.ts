import { Mutex, withTimeout } from "async-mutex";
import { getRps, insertRps, updateRps } from "../db/rps";
import { parseTarget, parsePoints } from "../util/args";
import { IPointOrigin } from "../db/pointEvent";
import { inc, updateUser } from "../util/userUtil";
import { Guild, Message } from "discord.js";
import { cancelRps, payRps } from "../util/rpsUtil";
import { whileSettling } from "../util/settling";
import { assignDustedRole } from "../events/assignMostPointsRole";
import textCommand from "../util/textCommand";
import withUserLock from "../util/userLock";

const rps = textCommand({
    name: 'rps',
    category: 'point rps',
    description: 'rps',
    expectedArgs: '<Points> <Optional @user>',
    minArgs: 1,
    maxArgs: 2,
    cooldown: '5s',
    syntaxError: 'Incorrect syntax! Use `{PREFIX}`ping {ARGUMENTS}',
}, async (ctx) => {
        const { message, args, guild } = ctx

        let targetId = ''
        let filter = (i): boolean => {
            return true
        }
        if (args[1]) {
            const parsed = await parseTarget(args[1], ctx)
            if (parsed === undefined) {
                return
            }
            targetId = parsed

            filter = (i): boolean => {
                return i.user.id === targetId || i.user.id === ctx.authorId
            }
        }

        const rpsPoints = await withUserLock(ctx.authorId, message, async (user) => {
            if (await getRps(user.id)) {
                await message.reply({content: `Only one at a time${process.env.NOPPERS_EMOJI}`})
                return undefined
            }

            const cPoints = await parsePoints(args[0], user, message, 'bet')
            if (cPoints === undefined) {
                return undefined
            }

            await whileSettling(async () => {
                await insertRps({ownerId: user.id, ownerBet: cPoints, startDate: new Date()})
                await updateUser(user.id, {points: inc(-cPoints)}, {...ctx.origin, reason: "rpsEscrow"})
            })
            return cPoints
        })

        if (rpsPoints === undefined) {
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

                        const accepted = await withUserLock(i.user.id, i, async (targetUser) => {
                            if (targetUser.points < 1) {
                                await i.reply({content: `You've got no points ${process.env.NOPPERS_EMOJI}`})
                                return undefined
                            }

                            if(targetId === '' && targetUser.points < rpsPoints){
                                await i.reply({content: `You only got ${targetUser.points} ${process.env.NOPPERS_EMOJI}`})
                                return undefined
                            }

                            const acceptBet = targetId === '' || targetUser.points >= rpsPoints ?
                                    rpsPoints :
                                    targetUser.points

                            await whileSettling(async () => {
                                if(acceptBet < rpsPoints){
                                    await updateUser(ctx.authorId, {points: inc(rpsPoints - acceptBet)}, {...ctx.origin, reason: "rpsRefund"})
                                    await updateRps(ctx.authorId, {ownerBet: acceptBet, acceptId: targetUser.id, acceptBet: acceptBet})
                                } else {
                                    await updateRps(ctx.authorId, {acceptId: targetUser.id, acceptBet: acceptBet})
                                }
                                await updateUser(targetUser.id, {points: inc(-acceptBet)}, {...ctx.origin, reason: "rpsEscrow"})
                            })
                            return {targetUser: targetUser, acceptBet: acceptBet}
                        })

                        if (!accepted) {
                            return
                        }
                        const { targetUser, acceptBet } = accepted

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
                const rps = await getRps(ctx.authorId)
                if (rps) {
                    await cancelRps(ctx.authorId, rps, ctx.origin)
                    rpsMessage.edit({content: `Game canceled ${process.env.NOPPERS_EMOJI}`, components: []})
                }
            } else {
                const rps = await getRps(ctx.authorId)
                await rpsMessage.edit( { content: `${gameStarting}Rock` })
                setTimeout(async () => { await rpsMessage.edit( { content: `${gameStarting}Rock, Paper` } )}, 1000),
                setTimeout(async () => { await rpsMessage.edit( { content: `${gameStarting}Rock, Paper, Scissors` })}, 2000),
                setTimeout(() => {
                    finishBet(rps.acceptBet, rpsMessage, rps.acceptId, ctx.authorId, guild, ownerPick, acceptPick, gameStarting, ctx.origin)
                }, 3000)
            }
        })
})

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

const finishBet = async (acceptBet: number, acceptMessage: Message<boolean>, targetId: string, ownerId: string, guild: Guild, ownerPick: RpsPick, acceptPick: RpsPick, gameStarting: string, origin: IPointOrigin): Promise<boolean> => {
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
            await cancelRps(ownerId, rps, origin)
        }
    } else if (rpsOutcome === RpsOutcome.ownerWon) {
        await acceptMessage.edit({
            content: `${gameStarting}${outcomeString}<@${ownerId}> wins ${acceptBet} points ${process.env.NICE_EMOJI}`, 
        }).catch((err) => console.log(err))
        const user = await payRps(ownerId, ownerId, targetId, acceptBet, origin)
        if (acceptBet >= 100 && user.points < 5) {
            await assignDustedRole(guild, user.id)
        }
    } else {
        await acceptMessage.edit({
            content: `${gameStarting}${outcomeString}<@${targetId}> wins ${acceptBet} points ${process.env.NICE_EMOJI}`, 
        }).catch((err) => console.log(err))
        const user = await payRps(ownerId, targetId, ownerId, acceptBet, origin)
        if (acceptBet >= 100 && user.points < 5) {
            await assignDustedRole(guild, user.id)
        }
    }
    
    return true
}
