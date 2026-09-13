import userModel, { IncOp, IUser, IUserUpdate, SetOp } from "../db/user"

const MS_PER_MINUTE = 60000
const SECONDS_PER_MINUTE = 60

const elapsedMsSinceStart = {$max: [0, {$subtract: ["$$NOW", {$ifNull: ["$activeStartDate", "$$NOW"]}]}]}
const accruedMinutesSinceStart = {$floor: {$divide: [elapsedMsSinceStart, MS_PER_MINUTE]}}
export const settledPoints = {$add: [{$ifNull: ["$points", 0]}, accruedMinutesSinceStart]}
export const settledSecondsActive = {$add: [{$ifNull: ["$secondsActive", 0]}, {$multiply: [accruedMinutesSinceStart, SECONDS_PER_MINUTE]}]}
const addAccruedPoints = {$add: [{$ifNull: ["$points", 0]}, "$accruedMinutes"]}
const addSecondsActive = {$add: [{$ifNull: ["$secondsActive", 0]}, {$multiply: ["$accruedMinutes", SECONDS_PER_MINUTE]}]}
const advanceActiveStartDate = {$add: ["$activeStartDate", {$multiply: ["$accruedMinutes", MS_PER_MINUTE]}]}

const accrualPipeline = (disableActivity: boolean) => [
    {$set: {accruedMinutes: accruedMinutesSinceStart}},
    {$set: {
        points: addAccruedPoints,
        secondsActive: addSecondsActive,
        activeStartDate: disableActivity ? null : advanceActiveStartDate
    }},
    {$unset: "accruedMinutes"}
]

const accruePoints = async (id: string, disableActivity = false): Promise<IUser> => {
    const accrued = await userModel
        .findOneAndUpdate({id: id}, accrualPipeline(disableActivity), {new: true})
        .lean()
    return accrued ?? await insertUser(id)
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

export const updateUser = async (id: string, update: IUserUpdate): Promise<IUser> => {
    const mongoUpdate = toMongoUpdate(update)
    if (Object.keys(mongoUpdate).length === 0) return await getOrInsert(id)

    const updated = await userModel.findOneAndUpdate({id: id}, mongoUpdate, {new: true}).lean()
    if (updated) return updated

    await insertUser(id)
    const retried = await userModel.findOneAndUpdate({id: id}, mongoUpdate, {new: true}).lean()
    if (!retried) throw new Error(`updateUser: user "${id}" vanished between insert and update`)
    return retried
}

const toMongoUpdate = (update: IUserUpdate) => {
    const $set: Record<string, unknown> = {}
    const $inc: Record<string, number> = {}

    for (const [field, op] of Object.entries(update) as [string, IncOp | SetOp<unknown> | undefined][]) {
        if (op === undefined) continue
        if (op.op === "inc") { $inc[field] = op.by; continue }
        if (op.op === "set") { $set[field] = op.to; continue }
        throw new Error(`updateUser: "${field}" was given a raw value instead of inc() or set()`)
    }

    return {
        ...(Object.keys($set).length > 0 ? {$set: $set} : {}),
        ...(Object.keys($inc).length > 0 ? {$inc: $inc} : {})
    }
}

const getOrInsert = async (id: string): Promise<IUser> => {
    const found = await userModel.findOne({id: id}).lean()
    return found ?? await insertUser(id)
}

const insertUser = async (id: string): Promise<IUser> => {
    try {
        return (await userModel.create({id: id})).toObject()
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
