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

export const recordPointEvent = async (user: Pick<IUser, "id" | "points" | "pointsSeq">, delta: number, change: IPointChange): Promise<void> => {
    if (!delta) return

    await pointEventModel.create({
        userId: user.id,
        seq: user.pointsSeq,
        delta: delta,
        balance: user.points,
        reason: change.reason,
        command: change.command,
        messageId: change.messageId,
    }).catch((err) => console.log(err))
}
