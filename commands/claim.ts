import { updateUser } from "../db/user";
import getUserAndAccruePoints, { addPoints, checkAndTriggerUserCooldown } from "../util/userUtil";
import { ICallback, ICommand } from "../wokTypes";

enum ClaimType {
    daily = 'dailyClaim',
    weekly = 'weeklyClaim'
}

const claim: ICommand = {
    name: 'claim',
    category: 'claim stuff',
    description: 'claim points',
    expectedArgs: '<type to claim>',
    minArgs: 1,
    maxArgs: 1,
    cooldown: '3s',
    callback: async (options: ICallback) => {
        const { message, args } = options

        const claim = args[0].toLowerCase()
        if (!claim || !ClaimType[claim]) {
            const validTypes: string[] = []
            for (const e in ClaimType) {
                validTypes.push(e)
            }
            message.reply({content: `${args[0]} ain a valid claim. Types: \n\`\`\`${validTypes.join(', ')}\`\`\``})
            return
        }

        const id = message.author.id

        const cooldown = await checkAndTriggerUserCooldown(id)
        if (cooldown > -1) {
            message.reply({content: `Wait ${Math.ceil(cooldown/1000)} seconds to target commands at <@${id}> ${process.env.NOPPERS_EMOJI}`})
            return
        }

        const startDay = new Date()
        startDay.setUTCHours(0,0,0,0)

        let user = await getUserAndAccruePoints(id)

        if (claim === 'daily') { 
            const nextDay = new Date(startDay.getTime() + 24 * 60 * 60 * 1000);
            if (!user.dailyClaim || user.dailyClaim === null || startDay.getTime() > user.dailyClaim.getTime()) {
                await addPoints(user, 30)
                user = await updateUser(id, {dailyClaim: new Date(), pointsClaimed: user.pointsClaimed + 30})
                message.reply({content: `You got your daily 30 ${process.env.DOGEGE_JAM_EMOJI}`})
            } else {
                message.reply({content: `Wait until ${nextDay} ${process.env.NOPPERS_EMOJI}`})
            }
        } else if (claim === 'weekly') {
            const startWeek = setToMonday(startDay);
            const nextWeek = new Date(startWeek.getTime() + 7 * 24 * 60 * 60 * 1000);
            if (!user.weeklyClaim || user.weeklyClaim === null || startWeek.getTime() > user.weeklyClaim.getTime()) {
                await addPoints(user, 120)
                user = await updateUser(id,{weeklyClaim: new Date(), pointsClaimed: user.pointsClaimed + 120})
                message.reply({content: `You got your weekly 120 ${process.env.DOGEGE_JAM_EMOJI}`})
            } else {
                message.reply({content: `Wait until ${nextWeek} ${process.env.NOPPERS_EMOJI}`})
            }
        }
    }
}

export default claim

const setToMonday = (date: Date): Date => {
    const day = date.getDay() || 7;  
    if( day !== 1 ) {
        date.setHours(-24 * (day - 1)); 
    }
    return date;
}