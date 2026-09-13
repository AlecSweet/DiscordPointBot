import { Message } from "discord.js"
import { randomInt } from "crypto"
import { IUser } from "../db/user"
import isValidNumberArg from "./isValidNumberArg"
import isValidUserArg from "./isValidUserArg"
import { ITextContext } from "./textCommand"
import * as dotenv from "dotenv"
dotenv.config()

interface ITargetOptions {
    allowSelf?: boolean
    selfReply?: string
}

export const parseTarget = async (arg: string, ctx: ITextContext, options: ITargetOptions = {}): Promise<string | undefined> => {
    const targetId = arg.replace(/\D/g,'')

    if (!options.allowSelf && targetId === ctx.authorId) {
        await ctx.message.reply({content: `${options.selfReply ?? 'Nope'} ${process.env.NOPPERS_EMOJI}`})
        return undefined
    }

    if (!(await isValidUserArg(targetId, ctx.guild))) {
        await ctx.message.reply({content: `Dont know user ${arg} ${process.env.NOPPERS_EMOJI}`})
        return undefined
    }

    return targetId
}

const random = (min: number, max: number): number => max < min ? min : randomInt(min, max + 1)

const amountFor = (arg: string, user: IUser, min: number): number => {
    switch (arg.toUpperCase()) {
        case 'ALL': return user.points
        case 'SOME': return random(1, user.points)
        case 'MIN': return min
        default: return Number(arg)
    }
}

export const parsePoints = async (arg: string, user: IUser, message: Message<boolean>, noun: string, min = 1): Promise<number | undefined> => {
    const points = amountFor(arg, user, min)
    const chosenByUser = arg.toUpperCase() !== 'SOME'

    if (!isValidNumberArg(points)) {
        await message.reply({content: `${points === 0 ? 0 : arg} ain a valid ${noun} ${process.env.NOPPERS_EMOJI}`})
        return undefined
    }

    if (chosenByUser && points < min) {
        await message.reply({content: `${noun} at least ${min} points brokie ${process.env.NOPPERS_EMOJI}`})
        return undefined
    }

    if (points > user.points) {
        await message.reply({content: `You only got ${user.points} points lad ${process.env.NOPPERS_EMOJI}`})
        return undefined
    }

    return points
}

export const parseCount = async (arg: string, max: number, message: Message<boolean>, noun: string): Promise<number | undefined> => {
    const count = arg.toUpperCase() === 'SOME' ? random(1, max) : Number(arg)

    if (!isValidNumberArg(count)) {
        await message.reply({content: `${arg} ain a valid ${noun} ${process.env.NOPPERS_EMOJI}`})
        return undefined
    }

    if (count > max) {
        await message.reply({content: `No dog, ${max} at a time ${process.env.NOPPERS_EMOJI}`})
        return undefined
    }

    return count
}
