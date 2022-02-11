import { Mutex, withTimeout } from "async-mutex";
import { userMutexes } from "..";
import { deleteWar, getWar, insertWar, updateWar } from "../db/war";
import isValidUserArg from "../util/isValidUserArg";
import getUser, { addPoints, incUser } from "../util/userUtil";
import { ICallback, ICommand } from "../wokTypes";
import getRandomValues from 'get-random-values'
import { cancelWar } from "../util/warUtil";
import { assignDustedRole } from "../events/assignMostPointsRole";

const war: ICommand = {
    name: 'war',
    category: 'ultimate point war',
    description: 'flip against a person',
    expectedArgs: '<Optional @user>',
    minArgs: 0,
    maxArgs: 1,
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
            return i.user.id !== message.author.id
        }
        if (args[0]) {
            targetId = args[0].replace(/\D/g,'')
            if (targetId === message.author.id) {
                message.reply({content: `Nope ${process.env.NOPPERS_EMOJI}`})
                return
            }

            if (!(await isValidUserArg(targetId, guild))) {
                message.reply({content: `Dont know user ${args[1]} ${process.env.NOPPERS_EMOJI}`})
                return
            }

            filter = (i): boolean => {
                return i.user.id === targetId && i.user.id !== message.author.id
            }
        }

        if (await getWar(message.author.id)) {
            message.reply({content: `Only one war at a time${process.env.NOPPERS_EMOJI}`})
            return
        }

        const userMutex = userMutexes.get(message.author.id)
        if(!userMutex) {
            message.reply({content: `Got an Error ${process.env.NOPPERS_EMOJI}`})
            return
        }

        const failed = await userMutex.runExclusive(async(): Promise<number> => {
            const user = await getUser(message.author.id)

            if (user.points < 1) {
                await message.reply({content: `You've got no points ${process.env.NOPPERS_EMOJI}`})
                return -1
            }     

            await insertWar({ownerId: user.id, ownerBet: user.points, startDate: new Date()})
            await addPoints(user.id, -user.points)
            return 1
        }).catch(async (err):Promise<number> => { 
            console.log(err) 
            return -1
        })

        if (failed < 0) {
            return
        }

        const warMessage = await message.channel.send({
            content: `<@${message.author.id}> wants a war ${targetId ? ` with <@${targetId}>` : ``} ${process.env.PEPO_SHAKE_EMOJI}\nWar will be canceled <t:${(Math.floor(new Date().getTime() / 1000) + (3 * 60))}:R>`, 
            components: [{
                type: 1,
                components: [{
                    type: 2,
                    label: `Accept War ⚔`,
                    style: 4,
                    customId: "acceptWar"
                }]
            }]
        })

        let canceled = true

        const acceptMutex = withTimeout(new Mutex(), 10000)

        const warCollector = warMessage.createMessageComponentCollector({ filter, time: 3 * 60 * 1000 })

        warCollector.on('collect', async i => {
            acceptMutex.runExclusive(async() => {

                const war = await getWar(message.author.id)

                if (war.acceptId && isValidUserArg(war.acceptId, guild)) {
                    i.reply({content: `War accepted already, too slow ${process.env.NOPPERS_EMOJI}`})
                    return
                }

                const targetMutex = userMutexes.get(i.user.id)
                if(!targetMutex) {
                    i.reply({content: `Got an Error ${process.env.NOPPERS_EMOJI}`})
                    return
                }
                let targetUser
                let aP
                await targetMutex.runExclusive(async() => {
                    targetUser = await getUser(i.user.id)

                    if (targetUser.points < 1) {
                        await i.reply({content: `You've got no points ${process.env.NOPPERS_EMOJI}`})
                        return
                    }                
                    
                    await updateWar(message.author.id, {acceptId: targetUser.id, acceptBet: targetUser.points })
                    await incUser(targetUser.id, {points: -targetUser.points})
                    aP = targetUser.points
                })
                
                if (!aP) {
                    return
                }
                canceled = false
                warCollector.stop()

                await warMessage.edit({
                    content: `<@${message.author.id}> wants a war ${targetId ? ` with <@${targetId}>` : ``} ${process.env.PEPO_SHAKE_EMOJI}`, 
                    components: []
                })

                const apInital = aP
                const oPInital = war.ownerBet
                let oP = war.ownerBet
                const initialRow = `Bet  ${getFormattedNumbers(oP, aP)} ⠀`
                const numSpace = (oP + aP).toString().length + 2 - message.author.username.length
                const space = " ".repeat(numSpace > 0 ? numSpace : 0)
                const nameRow = `   ${message.author.username}${space} | ${ i.user.username}`
                const rounds: string[] = [nameRow, initialRow]
                const acceptMessage = await warMessage.channel.send({
                    content: `War accepted by <@${targetUser.id}> ${process.env.PEPO_SMASH_EMOJI}\`\`\`${rounds.join('\n')}\`\`\``, 
                })

                let round = 1
                await new Promise(resolve => {
                    const interval = setInterval(() => {
                        const least = oP < aP ? oP : aP
                        const arr = new Uint8Array(1)
                        getRandomValues(arr)
                        if(arr[0] < 128) {
                            oP += least
                            aP -= least
                            rounds.push(`${round}) W ${getFormattedNumbers(oP, aP)}  `)
                        } else {
                            oP -= least
                            aP += least
                            rounds.push(`${round})   ${getFormattedNumbers(oP, aP)} W`)
                        }
                        round++
                        acceptMessage.edit({content: `War accepted by <@${targetUser.id}> ${process.env.PEPO_SMASH_EMOJI}\`\`\`${rounds.join('\n')}\`\`\``})
                        
                        if (oP < 1 || aP < 1) {
                            resolve('')
                            clearInterval(interval)
                        }
                    }, 2000);
                })

                if (oP <= 0) {
                    await incUser(targetUser.id, {points: aP, warPointsWon: oPInital, warsWon: 1})
                    await incUser(message.author.id, {warPointsLost: oPInital, warsLost: 1})
                    await acceptMessage.edit({content: `War accepted by <@${targetUser.id}> ${process.env.PEPO_SMASH_EMOJI}\`\`\`${rounds.join('\n')}\`\`\`<@${message.author.id}> got dusted ${process.env.SMODGE_EMOJI}\n<@${targetUser.id}> won ${oPInital} points ${process.env.NICE_EMOJI}`})
                    await deleteWar(message.author.id)
                    if (oPInital >= 100) {
                        await assignDustedRole(guild, message.author.id)
                    }
                } else {
                    await incUser(message.author.id, {points: oP, warPointsWon: apInital, warsWon: 1})
                    await incUser(targetUser.id, {warPointsLost: apInital, warsLost: 1})
                    await acceptMessage.edit({content: `War accepted by <@${targetUser.id}> ${process.env.PEPO_SMASH_EMOJI}\`\`\`${rounds.join('\n')}\`\`\`<@${targetUser.id}> got dusted ${process.env.SMODGE_EMOJI}\n<@${message.author.id}> won ${apInital} points ${process.env.NICE_EMOJI}`})
                    await deleteWar(message.author.id)
                    if (apInital >= 100) {
                        await assignDustedRole(guild, targetUser.id)
                    }
                }
                
            }).catch((err) => console.log(err))
        })

        warCollector.on('end', async () => {
            if(canceled){
                const war = await getWar(message.author.id)
                if (war) {
                    await cancelWar(message.author.id, war)
                    warMessage.edit({content: `War canceled ${process.env.NOPPERS_EMOJI}`, components: []})
                }
            }
        })
    }
}

export default war

const getFormattedNumbers = (oP: number, aP: number): string => {
    const maxD = (oP + aP).toString().length
    const oPstring = oP.toString()
    const aPstring = aP.toString()
    const oPform = oPstring + " ".repeat((maxD - oPstring.length))
    const aPform = aPstring + " ".repeat((maxD - aPstring.length))
    return `${oPform} | ${aPform}`
}
