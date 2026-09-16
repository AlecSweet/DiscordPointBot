import * as dotenv from "dotenv"
import mongoose from "mongoose"
import pointEventModel from "../db/pointEvent"
dotenv.config()

const OLD_REASON = "martingale"
const NEW_REASON = "flip"
const OLD_COMMAND = "martin"
const NEW_COMMAND = "martingale"

export interface ICommandCount {
    command: string
    count: number
}

export interface IPending {
    reasons: ICommandCount[]
    commands: number
}

export interface IRenamed {
    reasons: number
    commands: number
}

export const pendingRenames = async (): Promise<IPending> => {
    const rows = await pointEventModel.aggregate<{_id: string | null, count: number}>([
        {$match: {reason: OLD_REASON}},
        {$group: {_id: "$command", count: {$sum: 1}}},
        {$sort: {count: -1}},
    ])
    return {
        reasons: rows.map(row => ({command: row._id ?? "none", count: row.count})),
        commands: await pointEventModel.countDocuments({command: OLD_COMMAND}),
    }
}

export const renameMartingale = async (): Promise<IRenamed> => {
    const reasons = await pointEventModel.updateMany({reason: OLD_REASON}, {$set: {reason: NEW_REASON}})
    const commands = await pointEventModel.updateMany({command: OLD_COMMAND}, {$set: {command: NEW_COMMAND}})
    return {reasons: reasons.modifiedCount, commands: commands.modifiedCount}
}

const report = (pending: IPending) => {
    const total = pending.reasons.reduce((sum, entry) => sum + entry.count, 0)
    console.log(`${total} events still recorded as ${OLD_REASON}, to become ${NEW_REASON}`)
    pending.reasons.forEach(entry => console.log(`  ${entry.command.padEnd(16)} ${String(entry.count).padStart(8)} events`))

    const unnamed = pending.reasons.find(entry => entry.command === "none")
    if (unnamed) {
        console.log(`\n${unnamed.count} of them have no command, so nothing will mark them as ladder rungs once renamed`)
    }

    console.log(`\n${pending.commands} events still recorded under the ${OLD_COMMAND} command, to become ${NEW_COMMAND}`)
}

const main = async () => {
    const mongoUri = process.env.MONGO_URI
    if (mongoUri === undefined) {
        console.log("MONGO_URI must be set")
        return
    }

    await mongoose.connect(mongoUri)

    report(await pendingRenames())

    if (process.argv.slice(2).indexOf("--apply") !== -1) {
        const renamed = await renameMartingale()
        console.log(`\nrenamed ${renamed.reasons} reasons and ${renamed.commands} commands`)
    } else {
        console.log("\ndry run, nothing written. rerun with --apply to rename them")
    }

    await mongoose.disconnect()
}

if (require.main === module) {
    main().catch(err => { console.log(err); process.exit(1) })
}
