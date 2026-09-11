import { Message } from "discord.js";
import moment from "moment";
import { settleUser, inc, set, updateUser } from "./userUtil";

interface IClaim {
    name: string
    field: "dailyClaim" | "weeklyClaim" | "monthlyClaim" | "yearlyClaim"
    points: number
    periodStart: () => Date
    nextPeriodStart: (start: Date) => Date
}

const DAILY: IClaim = {
    name: "daily",
    field: "dailyClaim",
    points: 30,
    periodStart: () => {
        const startDay = new Date()
        startDay.setUTCHours(0, 0, 0, 0)
        return startDay
    },
    nextPeriodStart: (start: Date) => moment(start).add(1, "day").toDate(),
}

const WEEKLY: IClaim = {
    name: "weekly",
    field: "weeklyClaim",
    points: 120,
    periodStart: () => moment().startOf("week").toDate(),
    nextPeriodStart: (start: Date) => moment(start).add(1, "week").toDate(),
}

const MONTHLY: IClaim = {
    name: "monthly",
    field: "monthlyClaim",
    points: 480,
    periodStart: () => moment().startOf("month").toDate(),
    nextPeriodStart: (start: Date) => moment(start).add(1, "month").toDate(),
}

const YEARLY: IClaim = {
    name: "yearly",
    field: "yearlyClaim",
    points: 1920,
    periodStart: () => moment().startOf("year").toDate(),
    nextPeriodStart: (start: Date) => moment(start).add(1, "year").toDate(),
}

export const CLAIM_TYPES = {
    daily: DAILY,
    weekly: WEEKLY,
    monthly: MONTHLY,
    yearly: YEARLY,
}

export type ClaimName = keyof typeof CLAIM_TYPES

export const isClaimName = (name: string): name is ClaimName =>
    Object.prototype.hasOwnProperty.call(CLAIM_TYPES, name)

export const claimNames = (): string[] => Object.keys(CLAIM_TYPES)

const claim = async (id: string, message: Message<boolean>, claimType: IClaim) => {
    const user = await settleUser(id)
    const periodStart = claimType.periodStart()
    const lastClaimed = user[claimType.field]

    if (lastClaimed && periodStart.getTime() <= lastClaimed.getTime()) {
        const nextClaim = claimType.nextPeriodStart(periodStart)
        const when = nextClaim.toLocaleString("en-US", { timeZone: "America/Chicago" })
        message.reply({content: `Wait until ${when} CT ${process.env.NOPPERS_EMOJI}`})
        return
    }

    await updateUser(id, {
        points: inc(claimType.points),
        pointsClaimed: inc(claimType.points),
        [claimType.field]: set(new Date()),
    })
    message.reply({content: `You got your ${claimType.name} ${claimType.points} ${process.env.DOGEGE_JAM_EMOJI}`})
}

export const claimByName = (id: string, message: Message<boolean>, name: ClaimName) =>
    claim(id, message, CLAIM_TYPES[name])

export const claimDaily = (id: string, message: Message<boolean>) => claim(id, message, DAILY)
export const claimWeekly = (id: string, message: Message<boolean>) => claim(id, message, WEEKLY)
export const claimMonthly = (id: string, message: Message<boolean>) => claim(id, message, MONTHLY)
export const claimYearly = (id: string, message: Message<boolean>) => claim(id, message, YEARLY)
