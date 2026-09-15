import * as dotenv from "dotenv"
import mongoose from "mongoose"
import userModel from "../db/user"
import pointEventModel, { IPointEvent } from "../db/pointEvent"
dotenv.config()

export interface IOpeningBalance {
    userId: string
    points: number
    opening: number
    createdAt: Date
}

export interface ICounterMismatch {
    userId: string
    recorded: number
    lastSeq: number
    counter: number
}

interface IHistory {
    _id: string
    first: IPointEvent & {balance: number}
    lastSeq: number
    live: number
}

interface ISnapshotUser {
    id: string
    points?: number
    pointsSeq?: number
}

export interface ISnapshot {
    users: ISnapshotUser[]
    opened: Set<string>
    histories: Map<string, IHistory>
}

export const takeSnapshot = async (): Promise<ISnapshot> => {
    const users: ISnapshotUser[] = await userModel.find({}, {id: 1, points: 1, pointsSeq: 1}).lean()
    const opened: string[] = await pointEventModel.distinct("userId", {seq: 0})
    const rows = await pointEventModel.aggregate<IHistory>([
        {$match: {seq: {$gte: 1}}},
        {$sort: {userId: 1, seq: 1}},
        {$group: {
            _id: "$userId",
            first: {$first: "$$ROOT"},
            lastSeq: {$last: "$seq"},
            live: {$sum: 1},
        }},
    ]).allowDiskUse(true)

    const histories = new Map<string, IHistory>()
    rows.forEach(row => histories.set(row._id, row))
    return {users: users, opened: new Set(opened), histories: histories}
}

export const openingBalances = (snapshot: ISnapshot, now = new Date()): IOpeningBalance[] => {
    const openings: IOpeningBalance[] = []
    snapshot.users.forEach(user => {
        if (snapshot.opened.has(user.id)) return

        const history = snapshot.histories.get(user.id)
        const points = user.points ?? 0
        const opening = history ? history.first.balance - history.first.delta : points
        if (opening === 0) return

        openings.push({
            userId: user.id,
            points: points,
            opening: opening,
            createdAt: history ? new Date(history.first.createdAt.getTime() - 1) : now,
        })
    })
    return openings
}

export const counterMismatches = (snapshot: ISnapshot): ICounterMismatch[] => {
    const mismatches: ICounterMismatch[] = []
    snapshot.users.forEach(user => {
        const history = snapshot.histories.get(user.id)
        const recorded = history ? history.live : 0
        const lastSeq = history ? history.lastSeq : 0
        const counter = user.pointsSeq ?? 0
        if (recorded < counter || lastSeq > counter) {
            mismatches.push({userId: user.id, recorded: recorded, lastSeq: lastSeq, counter: counter})
        }
    })
    return mismatches
}

export const seedOpeningBalances = async (openings: IOpeningBalance[]): Promise<void> => {
    await pointEventModel.insertMany(openings.map(opening => ({
        userId: opening.userId,
        seq: 0,
        delta: opening.opening,
        balance: opening.opening,
        reason: "openingBalance",
        createdAt: opening.createdAt,
    })))
}

const main = async () => {
    const mongoUri = process.env.MONGO_URI
    if (mongoUri === undefined) {
        console.log("MONGO_URI must be set")
        return
    }

    await mongoose.connect(mongoUri)

    const snapshot = await takeSnapshot()
    const openings = openingBalances(snapshot)
    const total = openings.reduce((sum, opening) => sum + opening.opening, 0)
    console.log(`${openings.length} users need an opening balance, ${total} points in total`)
    openings.forEach(opening => {
        console.log(`  ${opening.userId}  ${opening.opening}  (holding ${opening.points} now)`)
    })

    const mismatches = counterMismatches(snapshot)
    if (mismatches.length > 0) {
        console.log(`\n${mismatches.length} users have events that do not match their counter, rerun to rule out changes that landed mid-check:`)
        mismatches.forEach(mismatch => {
            console.log(`  ${mismatch.userId}  ${mismatch.recorded} recorded, highest seq ${mismatch.lastSeq}, counter at ${mismatch.counter}`)
        })
    }

    if (process.argv.slice(2).indexOf("--apply") !== -1) {
        await seedOpeningBalances(openings)
        console.log(`\nwrote ${openings.length} opening balances`)
    } else {
        console.log("\ndry run, nothing written. rerun with --apply to write them")
    }

    await mongoose.disconnect()
}

if (require.main === module) {
    main().catch(err => { console.log(err); process.exit(1) })
}
