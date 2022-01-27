import { Message } from "discord.js";
import { updateUser } from "../db/user";
import getUserAndAccruePoints, { addPoints } from "./userUtil";

export const claimDaily = async (id: string, message: Message<boolean>) => {
    const startDay = new Date()
    startDay.setUTCHours(0,0,0,0)

    let user = await getUserAndAccruePoints(id)

    const nextDay = new Date(startDay.getTime() + 24 * 60 * 60 * 1000);
    if (!user.dailyClaim || user.dailyClaim === null || startDay.getTime() > user.dailyClaim.getTime()) {
        await addPoints(user, 30)
        user = await updateUser(id, {dailyClaim: new Date(), pointsClaimed: user.pointsClaimed + 30})
        message.reply({content: `You got your daily 30 ${process.env.DOGEGE_JAM_EMOJI}`})
    } else {
        message.reply({content: `Wait until ${nextDay} ${process.env.NOPPERS_EMOJI}`})
    }
}

export const claimWeekly = async (id: string, message: Message<boolean>) => {
    const startDay = new Date()
    startDay.setUTCHours(0,0,0,0)

    let user = await getUserAndAccruePoints(id)

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

const setToMonday = (date: Date): Date => {
    const day = date.getDay() || 7;  
    if( day !== 1 ) {
        date.setHours(-24 * (day - 1)); 
    }
    return date;
}