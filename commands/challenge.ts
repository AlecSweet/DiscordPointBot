import { Mutex, withTimeout } from "async-mutex";
import { userMutexes } from "..";
import { deleteChallenge, getChallenge, insertChallenge, updateChallenge } from "../db/challenge";
import isValidNumberArg from "../util/isValidNumberArg";
import isValidUserArg from "../util/isValidUserArg";
import getUser, { addPoints, incUser } from "../util/userUtil";
import { ICallback, ICommand } from "../wokTypes";
import getRandomValues from 'get-random-values'
import { Guild, Message } from "discord.js";
import { cancelChallenge } from "../util/challengeUtil";
import { assignDustedRole } from "../events/assignMostPointsRole";

const challenge: ICommand = {
    name: 'challenge',
    category: 'point challenge',
    description: 'flip against a person',
    expectedArgs: '<Points> <Optional @user>',
    minArgs: 1,
    maxArgs: 2,
    cooldown: '3s',
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

        if (await getChallenge(message.author.id)) {
            message.reply({content: `Only one challenge at a time${process.env.NOPPERS_EMOJI}`})
            return
        }

        const userMutex = userMutexes.get(message.author.id)
        if(!userMutex) {
            message.reply({content: `Got an Error ${process.env.NOPPERS_EMOJI}`})
            return
        }

        const challengePoints = await userMutex.runExclusive(async(): Promise<number> => {
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

            await insertChallenge({ownerId: user.id, ownerBet: cPoints, startDate: new Date()})
            await addPoints(user.id, -cPoints)
            return cPoints
        }).catch(async (err):Promise<number> => { 
            console.log(err) 
            return -1
        })

        if (challengePoints < 0) {
            return
        }

        const challengeMessage = await message.channel.send({
            content: `<@${message.author.id}> has challenged ${targetId ? `<@${targetId}> for up to ${challengePoints} points` : `anyone for ${challengePoints} points`}. Challenge will be canceled <t:${(Math.floor(new Date().getTime() / 1000) + (3 * 60))}:R>`, 
            components: [{
                type: 1,
                components: [
                    {
                        type: 2,
                        label: `Accept`,
                        style: 3,
                        customId: "acceptBet"
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

        const acceptMutex = withTimeout(new Mutex(), 10000)

        const challengeCollector = challengeMessage.createMessageComponentCollector({ filter, time: 3 * 60 * 1000 })

        challengeCollector.on('collect', async i => {
            acceptMutex.runExclusive(async() => {

                if (canceled && i.user.id === message.author.id && i.customId === 'cancelBet') {
                    cancelButtonHit = true
                    challengeCollector.stop()
                    return
                } else if (!cancelButtonHit && i.user.id !== message.author.id && i.customId === 'acceptBet') {

                    const challenge = await getChallenge(message.author.id)

                    if (challenge.acceptId && isValidUserArg(challenge.acceptId, guild)) {
                        i.reply({content: `Challenge accepted already, too slow ${process.env.NOPPERS_EMOJI}`})
                        return
                    }

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
                        
                        if(targetId === '' && targetUser.points < challengePoints){
                            await i.reply({content: `You only got ${targetUser.points} ${process.env.NOPPERS_EMOJI}`})
                            return
                        }
                        
                        acceptBet = targetId === '' || targetUser.points >= challengePoints ? 
                                challengePoints : 
                                targetUser.points


                        if(acceptBet < challengePoints){
                            await incUser(message.author.id, {points: challengePoints - acceptBet})
                            await updateChallenge(message.author.id, {ownerBet: acceptBet, acceptId: targetUser.id, acceptBet })
                        } else {
                            await updateChallenge(message.author.id, {acceptId: targetUser.id, acceptBet })
                        }
                        await incUser(targetUser.id, {points: -acceptBet})
                    }).catch((err) => console.log(err))

                    if (!acceptBet) {
                        return
                    }
                    canceled = false
                    challengeCollector.stop()

                    await challengeMessage.edit({
                        content: `<@${message.author.id}> has challenged ${targetId ? `<@${targetUser.id}> for up to ${challengePoints} points` : `anyone for ${challengePoints} points`}.`, 
                        components: []
                    })

                    const acceptMessage = await challengeMessage.channel.send({
                        content: `Challenge accepted by <@${targetUser.id}> for ${acceptBet} points ${process.env.PEPO_SMASH_EMOJI}`, 
                    })
                    await Promise.all([
                        [
                            await acceptMessage.react('3️⃣'), 
                            await acceptMessage.react('2️⃣'), 
                            await acceptMessage.react('1️⃣'),
                            setTimeout(() => {finishBet(acceptBet, acceptMessage, targetUser.id, message.author.id, guild)}, 400)
                        ],
                        await new Promise(resolve => setTimeout(resolve, 400))
                    ]);
                }
            }).catch((err) => console.log(err))
        })

        challengeCollector.on('end', async () => {
            if (canceled || cancelButtonHit) {
                const challenge = await getChallenge(message.author.id)
                if (challenge) {
                    await cancelChallenge(message.author.id, challenge)
                    challengeMessage.edit({content: `Challenge canceled ${process.env.NOPPERS_EMOJI}`, components: []})
                }
            }
        })
    }
}

export default challenge

const finishBet = async (acceptBet: number, acceptMessage: Message<boolean>, targetId: string, ownerId: string, guild: Guild): Promise<boolean> => {
    const arr = new Uint8Array(1);
    getRandomValues(arr);
    
    if(arr[0] < 128) {
        await acceptMessage.channel.send({
            content: `<@${ownerId}> wins ${acceptBet} points ${process.env.NICE_EMOJI}`, 
        }).catch((err) => console.log(err))
        await incUser(ownerId, {points: acceptBet*2, challengePointsWon: acceptBet, challengesWon: 1})
        const user = await incUser(targetId, {challengePointsLost: acceptBet, challengesLost: 1})
        await deleteChallenge(ownerId)
        if (acceptBet >= 100 && user.points < 5) {
            await assignDustedRole(guild, user.id)
        }
    } else {
        await acceptMessage.channel.send({
            content: `<@${targetId}> wins ${acceptBet} points ${process.env.NICE_EMOJI}`, 
        }).catch((err) => console.log(err))
        await incUser(targetId, {points: acceptBet*2, challengePointsWon: acceptBet, challengesWon: 1})
        const user = await incUser(ownerId, {challengePointsLost: acceptBet, challengesLost: 1})
        await deleteChallenge(ownerId)
        if (acceptBet >= 100 && user.points < 5) {
            await assignDustedRole(guild, user.id)
        }
    }
    
    return true
}
