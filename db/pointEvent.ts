import { Schema, model, models, Model } from "mongoose";
import { IUser } from "./user";

export const POINT_REASONS = [
    "openingBalance", "newUser", "accrual",
    "flip",
    "giftSent", "giftReceived",
    "dailyClaim", "weeklyClaim", "monthlyClaim", "yearlyClaim",
    "challengeEscrow", "challengeRefund", "challengePayout",
    "rpsEscrow", "rpsRefund", "rpsPayout",
    "warEscrow", "warRefund", "warPayout",
    "betEscrow", "betPayout", "unrecorded",
] as const

export type PointReason = typeof POINT_REASONS[number]

export interface IPointOrigin {
    command?: string
    messageId?: string
}

export interface IPointChange extends IPointOrigin {
    reason: PointReason
}

export interface IPointEvent extends IPointChange {
    userId: string
    seq: number
    delta: number
    balance: number | null
    backfilled?: boolean
    createdAt: Date
}

const pointEventSchema = new Schema({
    userId: {
        type: String,
        required: true,
    },
    seq: {
        type: Number,
        required: true,
    },
    delta: {
        type: Number,
        required: true,
    },
    balance: {
        type: Number,
        required: function (this: {backfilled?: boolean}) { return !this.backfilled },
    },
    reason: {
        type: String,
        required: true,
        enum: [...POINT_REASONS],
    },
    command: {
        type: String,
    },
    messageId: {
        type: String,
    },
    backfilled: {
        type: Boolean,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
}, {versionKey: false})

pointEventSchema.index({userId: 1, seq: -1}, {unique: true})

const pointEventModel: Model<IPointEvent> = models.pointEvent || model<IPointEvent>('pointEvent', pointEventSchema);

export default pointEventModel;

const RECENT_WRITES = 100

let loading: Promise<IPointEvent[]> | undefined

const oldestFirst = (a: IPointEvent, b: IPointEvent): number =>
    a.createdAt.getTime() - b.createdAt.getTime() || a.seq - b.seq

const loadPointEvents = async (): Promise<IPointEvent[]> => {
    const events = await pointEventModel.find({}, {_id: 0}).lean()
    return events.sort(oldestFirst)
}

export const allPointEvents = (): Promise<IPointEvent[]> => {
    if (!loading) loading = loadPointEvents().catch((err) => { loading = undefined; throw err })
    return loading
}

export const clearPointEvents = (): void => { loading = undefined }

const alreadyLoaded = (events: IPointEvent[], event: IPointEvent): boolean =>
    events.slice(-RECENT_WRITES).some(loaded => loaded.userId === event.userId && loaded.seq === event.seq)

const rememberPointEvent = async (event: IPointEvent): Promise<void> => {
    if (!loading) return

    const events = await loading
    if (!alreadyLoaded(events, event)) events.push(event)
}

export const recordPointEvent = async (user: Pick<IUser, "id" | "points" | "pointsSeq">, delta: number, change: IPointChange): Promise<void> => {
    if (!delta) return

    const event: IPointEvent = {
        userId: user.id,
        seq: user.pointsSeq,
        delta: delta,
        balance: user.points,
        reason: change.reason,
        command: change.command,
        messageId: change.messageId,
        createdAt: new Date(),
    }

    await pointEventModel.create(event)
        .then(() => rememberPointEvent(event))
        .catch((err) => console.log(err))
}
