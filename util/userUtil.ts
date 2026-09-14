import userModel, { IncOp, IUser, IUserUpdate, SetOp } from "../db/user"
import { IPointChange, recordPointEvent } from "../db/pointEvent"

const MS_PER_MINUTE = 60000
const SECONDS_PER_MINUTE = 60

const fieldOrZero = (field: string) => ({$ifNull: [`$${field}`, 0]})

const elapsedMsSinceStart = {$max: [0, {$subtract: ["$$NOW", {$ifNull: ["$activeStartDate", "$$NOW"]}]}]}
const settledActiveStartDate = {$add: ["$activeStartDate", elapsedMsSinceStart]}

const unsettledMs = {$add: [fieldOrZero("carriedMs"), elapsedMsSinceStart]}
const unsettledMinutes = {$floor: {$divide: [unsettledMs, MS_PER_MINUTE]}}

export const settledPoints = {$add: [fieldOrZero("points"), unsettledMinutes]}
export const settledSecondsActive = {$add: [fieldOrZero("secondsActive"), {$multiply: [unsettledMinutes, SECONDS_PER_MINUTE]}]}
const settledCarriedMs = {$mod: [unsettledMs, MS_PER_MINUTE]}

const nextPointsSeq = {$add: [fieldOrZero("pointsSeq"), 1]}
const accruedPointsSeq = {$cond: [{$gt: [unsettledMinutes, 0]}, nextPointsSeq, fieldOrZero("pointsSeq")]}

const seededMaxPoints = {$ifNull: ["$maxPoints", fieldOrZero("points")]}
const raisedMaxPoints = {$max: ["$maxPoints", "$points"]}

const trackingMaxPoints = (assignments: Record<string, unknown>) => [
    {$set: {maxPoints: seededMaxPoints}},
    {$set: assignments},
    {$set: {maxPoints: raisedMaxPoints}}
]

const accrualPipeline = (disableActivity: boolean) => trackingMaxPoints({
    points: settledPoints,
    lastAccruedPoints: unsettledMinutes,
    pointsSeq: accruedPointsSeq,
    secondsActive: settledSecondsActive,
    carriedMs: settledCarriedMs,
    activeStartDate: disableActivity ? null : settledActiveStartDate
})

const accruePoints = async (id: string, disableActivity = false): Promise<IUser> => {
    const accrued = await userModel
        .findOneAndUpdate({id: id}, accrualPipeline(disableActivity), {new: true})
        .lean()
    if (!accrued) return await insertUser(id)

    await recordPointEvent(accrued, accrued.lastAccruedPoints, {reason: "accrual"})
    return accrued
}

export const disableUserActivity = (id: string): Promise<IUser> => accruePoints(id, true)

export const startUserActivity = async (id: string): Promise<IUser> => {
    const user = await getOrInsert(id)
    if (user.activeStartDate) return user

    const started = await userModel
        .findOneAndUpdate({id: id, activeStartDate: null}, [{$set: {activeStartDate: "$$NOW"}}], {new: true})
        .lean()
    return started ?? await getOrInsert(id)
}

export const settleUser = (id: string): Promise<IUser> => accruePoints(id)

export const getAllUsers = async (): Promise<IUser[]> => {
    return await userModel.find().lean()
}

export const inc = (by: number): IncOp => ({op: "inc", by: by})
export const set = <V>(to: V): SetOp<V> => ({op: "set", to: to})

type PointsUpdate = IUserUpdate & {points: IncOp}
type BalanceNeutralUpdate = IUserUpdate & {points?: never}

interface IUpdateUser {
    (id: string, update: PointsUpdate, change: IPointChange): Promise<IUser>
    (id: string, update: BalanceNeutralUpdate): Promise<IUser>
}

export const updateUser: IUpdateUser = async (id: string, update: IUserUpdate, change?: IPointChange): Promise<IUser> => {
    const pipeline = toUpdatePipeline(update)
    if (update.points !== undefined && change === undefined) {
        throw new Error(`updateUser: points changed for "${id}" without a reason`)
    }
    if (pipeline.length === 0) return await getOrInsert(id)

    const updated = await userModel.findOneAndUpdate({id: id}, pipeline, {new: true}).lean()
    if (updated) return await recordChange(updated, update, change)

    await insertUser(id)
    const retried = await userModel.findOneAndUpdate({id: id}, pipeline, {new: true}).lean()
    if (!retried) throw new Error(`updateUser: user "${id}" vanished between insert and update`)
    return await recordChange(retried, update, change)
}

const recordChange = async (user: IUser, update: IUserUpdate, change?: IPointChange): Promise<IUser> => {
    if (update.points !== undefined && change !== undefined) {
        await recordPointEvent(user, update.points.by, change)
    }
    return user
}

const toUpdatePipeline = (update: IUserUpdate) => {
    const assignments: Record<string, unknown> = {}

    for (const [field, op] of Object.entries(update) as [string, IncOp | SetOp<unknown> | undefined][]) {
        if (op === undefined) continue
        if (op.op === "inc") { assignments[field] = {$add: [fieldOrZero(field), op.by]}; continue }
        if (op.op === "set") { assignments[field] = {$literal: op.to}; continue }
        throw new Error(`updateUser: "${field}" was given a raw value instead of inc() or set()`)
    }

    if (Object.keys(assignments).length === 0) return []
    if (update.points !== undefined && update.points.by !== 0) assignments.pointsSeq = nextPointsSeq

    return trackingMaxPoints(assignments)
}

const getOrInsert = async (id: string): Promise<IUser> => {
    const found = await userModel.findOne({id: id}).lean()
    return found ?? await insertUser(id)
}

const insertUser = async (id: string): Promise<IUser> => {
    try {
        const user = new userModel({id: id})
        user.pointsSeq = user.points ? 1 : 0
        const created = (await user.save()).toObject()
        await recordPointEvent(created, created.points, {reason: "newUser"})
        return created
    } catch (error) {
        if (!isDuplicateKeyError(error)) throw error
        const existing = await userModel.findOne({id: id}).lean()
        if (!existing) throw new Error(`insertUser: duplicate key for "${id}" but no document found`)
        return existing
    }
}

const isDuplicateKeyError = (error: unknown): boolean => {
    return typeof error === "object" && error !== null && (error as {code?: number}).code === 11000
}
