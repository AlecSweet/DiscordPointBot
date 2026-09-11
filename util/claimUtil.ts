import { Message } from "discord.js";
import moment from "moment";
import { settleUser, inc, set, updateUser } from "./userUtil";

export const claimDaily = async (id: string, message: Message<boolean>) => {
    const startDay = new Date()
    startDay.setUTCHours(0,0,0,0)

    let user = await settleUser(id)

    const nextDay = new Date(startDay.getTime() + 24 * 60 * 60 * 1000);
    if (!user.dailyClaim || user.dailyClaim === null || startDay.getTime() > user.dailyClaim.getTime()) {
        user = await updateUser(id, {
            points: inc(30),
            pointsClaimed: inc(30),
            dailyClaim: set(new Date())
        })
        message.reply({content: `You got your daily 30 ${process.env.DOGEGE_JAM_EMOJI}`})
    } else {
        message.reply({content: `Wait until ${nextDay.toLocaleString("en-US", { timeZone: "America/Chicago" })} CT ${process.env.NOPPERS_EMOJI}`})
    }
}

export const claimWeekly = async (id: string, message: Message<boolean>) => {
    const startWeek = moment().startOf('week').toDate();
    const nextWeek = new Date(startWeek.getTime() + 7 * 24 * 60 * 60 * 1000);
    let user = await settleUser(id)
    
    if (!user.weeklyClaim || user.weeklyClaim === null || startWeek.getTime() > user.weeklyClaim.getTime()) {
        user = await updateUser(id, {
            points: inc(120),
            pointsClaimed: inc(120),
            weeklyClaim: set(new Date())
        })
        message.reply({content: `You got your weekly 120 ${process.env.DOGEGE_JAM_EMOJI}`})
    } else {
        message.reply({content: `Wait until ${nextWeek.toLocaleString("en-US", { timeZone: "America/Chicago" })} CT ${process.env.NOPPERS_EMOJI}`})
    }
}
